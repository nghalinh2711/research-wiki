/**
 * LLM abstraction with two backends:
 *
 * 1. OpenAI (BYOK) — used when OPENAI_API_KEY is set.
 *    Compatible with Vercel and any serverless host. Supports any
 *    OpenAI-compatible endpoint via OPENAI_BASE_URL (e.g. Azure, Groq).
 *
 * 2. GitHub Copilot SDK — used when no OPENAI_API_KEY is present.
 *    Requires a GitHub Copilot subscription and spawns the bundled
 *    @github/copilot CLI subprocess. Works on local dev and any host
 *    that supports long-running Node.js processes (VPS, Docker, Render).
 *    NOT compatible with Vercel serverless.
 */

// ─── BACKEND DETECTION ────────────────────────────────────────────────────────

const USE_OPENAI = Boolean(process.env.OPENAI_API_KEY)
const MODEL = process.env.COPILOT_MODEL ?? (USE_OPENAI ? "gpt-4.1" : "gpt-4.1")

// ─── OPENAI BACKEND ───────────────────────────────────────────────────────────

async function openaiCall(system: string, user: string): Promise<string> {
  const { default: OpenAI } = await import("openai")
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_BASE_URL
      ? { baseURL: process.env.OPENAI_BASE_URL }
      : {}),
  })
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 4000,
  })
  return res.choices[0].message.content ?? ""
}

async function openaiStream(
  system: string,
  user: string,
): Promise<ReadableStream<string>> {
  const { default: OpenAI } = await import("openai")
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_BASE_URL
      ? { baseURL: process.env.OPENAI_BASE_URL }
      : {}),
  })
  const stream = await client.chat.completions.create({
    model: MODEL,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  })
  return new ReadableStream<string>({
    async start(controller) {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) controller.enqueue(delta)
      }
      controller.close()
    },
  })
}

// ─── COPILOT SDK BACKEND ──────────────────────────────────────────────────────

import type { CopilotClient } from "@github/copilot-sdk"

let _copilotClient: CopilotClient | null = null
let _copilotClientReady: Promise<CopilotClient> | null = null

/**
 * Returns a singleton CopilotClient. next.config.ts marks @github/copilot-sdk
 * and @github/copilot as serverExternalPackages so Next.js never bundles them —
 * the SDK's own require.resolve.paths() lookup finds the CLI correctly.
 *
 * Auth priority: COPILOT_GITHUB_TOKEN → GH_TOKEN → GITHUB_TOKEN →
 *   stored `copilot` CLI credentials (from `copilot auth login`)
 */
async function getCopilotClient(): Promise<CopilotClient> {
  if (_copilotClient) return _copilotClient
  if (!_copilotClientReady) {
    _copilotClientReady = (async () => {
      const { CopilotClient } = await import("@github/copilot-sdk")
      const token =
        process.env.COPILOT_GITHUB_TOKEN ??
        process.env.GH_TOKEN ??
        process.env.GITHUB_TOKEN
      const client = new CopilotClient({
        ...(token ? { githubToken: token, useLoggedInUser: false } : {}),
      })
      await client.start()
      _copilotClient = client
      return client
    })()
  }
  return _copilotClientReady
}

async function copilotCall(system: string, user: string): Promise<string> {
  const { approveAll } = await import("@github/copilot-sdk")
  const client = await getCopilotClient()
  const session = await client.createSession({
    model: MODEL,
    onPermissionRequest: approveAll,
    infiniteSessions: { enabled: false },
    systemMessage: { mode: "replace", content: system },
  })
  try {
    const response = await session.sendAndWait({ prompt: user })
    return response?.data.content ?? ""
  } finally {
    await session.disconnect()
  }
}

async function copilotStream(
  system: string,
  user: string,
): Promise<ReadableStream<string>> {
  const { approveAll } = await import("@github/copilot-sdk")
  const client = await getCopilotClient()
  const session = await client.createSession({
    model: MODEL,
    streaming: true,
    onPermissionRequest: approveAll,
    infiniteSessions: { enabled: false },
    systemMessage: { mode: "replace", content: system },
  })
  return new ReadableStream<string>({
    start(controller) {
      session.on("assistant.message_delta", (event) => {
        controller.enqueue(event.data.deltaContent)
      })
      session.on("session.idle", async () => {
        controller.close()
        await session.disconnect()
      })
      session.send({ prompt: user }).catch((err) => controller.error(err))
    },
  })
}

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced) return fenced[1].trim()
  const obj = text.match(/(\{[\s\S]*\})/)
  if (obj) return obj[1].trim()
  return text.trim()
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export async function llmCall(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  return USE_OPENAI
    ? openaiCall(systemPrompt, userMessage)
    : copilotCall(systemPrompt, userMessage)
}

export async function llmJSON<T>(
  systemPrompt: string,
  userMessage: string,
): Promise<T> {
  const jsonPrompt = `${systemPrompt}\n\nCRITICAL: Respond with raw JSON only — no markdown fences, no explanation, no trailing text.`
  const raw = await llmCall(jsonPrompt, userMessage)
  return JSON.parse(extractJSON(raw)) as T
}

export async function llmStream(
  systemPrompt: string,
  userMessage: string,
): Promise<ReadableStream<string>> {
  return USE_OPENAI
    ? openaiStream(systemPrompt, userMessage)
    : copilotStream(systemPrompt, userMessage)
}
