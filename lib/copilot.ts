import OpenAI from "openai"

let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: "https://api.githubcopilot.com",
      apiKey: process.env.GITHUB_COPILOT_TOKEN,
    })
  }
  return _client
}

export async function llmCall(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2000,
  })
  return response.choices[0].message.content ?? ""
}

export async function llmJSON<T>(systemPrompt: string, userMessage: string): Promise<T> {
  const response = await getClient().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2000,
    response_format: { type: "json_object" },
  })
  const raw = response.choices[0].message.content ?? "{}"
  return JSON.parse(raw) as T
}

export async function llmStream(systemPrompt: string, userMessage: string) {
  return getClient().chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  })
}
