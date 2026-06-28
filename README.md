# Research Wiki

A Next.js app that reads your Zotero library, processes papers with an LLM via the [GitHub Copilot SDK](https://github.com/github/copilot-sdk), and builds a structured research wiki in Notion.

Inspired by Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) concept.

**Topic:** Memory Management for AI Agents

## Architecture

```
Zotero (source of truth)
  └── papers, metadata, abstracts, annotations
         │
         ▼
  Next.js Web App
  ├── Zotero API client      — fetches library, collections, annotations
  ├── GitHub Copilot SDK      — LLM calls via @github/copilot-sdk
  └── Notion API client      — writes and reads wiki databases
         │
         ▼
  Notion (wiki / knowledge base)
  └── Papers, Concepts, Methods, Contradictions, Synthesis
```

## Prerequisites

- **Node.js** 18+
- A **GitHub account** with a Copilot subscription (Individual, Business, or Enterprise), _or_ your own API keys via BYOK
- **Zotero** account with API key
- **Notion** workspace with integration

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example and fill in your keys:

```bash
cp .env.local.example .env.local
```

### 3. Authenticate GitHub Copilot

The SDK supports multiple auth methods (checked in this order):

#### Option A: Environment variable (recommended for servers)

Set **one** of these in `.env.local`:

| Variable | Notes |
|---|---|
| `COPILOT_GITHUB_TOKEN` | Explicit Copilot token |
| `GH_TOKEN` | GitHub CLI compatible |
| `GITHUB_TOKEN` | GitHub Actions compatible |

Create a **fine-grained personal access token** at [github.com/settings/tokens](https://github.com/settings/tokens?type=beta):
1. Click **Generate new token**
2. Name it (e.g. "research-wiki")
3. Set an expiration
4. Under **Permissions > Account permissions**, enable **GitHub Copilot** → **Read-only**
5. Click **Generate token** and paste into `.env.local`

#### Option B: Copilot CLI login (for local development)

If you have the [Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installed:

```bash
copilot auth login
```

The SDK automatically picks up stored credentials — no env var needed.

#### Option C: BYOK — Bring Your Own Key (no Copilot subscription needed)

You can bypass GitHub auth entirely and use your own provider keys (OpenAI, Azure, Anthropic). To do this, modify `lib/copilot.ts` and add a `provider` config to each `createSession` call:

```typescript
const session = await client.createSession({
  model: "gpt-4o",
  provider: {
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY,
  },
  // ... other options
})
```

See the [BYOK documentation](https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md) for Azure, Anthropic, and more.

### 4. Set up Zotero

1. Go to [zotero.org/settings/keys](https://www.zotero.org/settings/keys)
2. Create a new private key with read access
3. Copy the key and your numeric user ID into `.env.local`

### 5. Set up Notion

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → create integration → copy token
2. Create the 5 databases in Notion (Papers, Concepts, Methods, Contradictions, Synthesis)
3. Share each database with your integration (click ··· → Connections → select your integration)
4. Copy each database ID from its URL and add to `.env.local`

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Model configuration

The default model is `gpt-4.1`. Override it with the `COPILOT_MODEL` env var:

```bash
COPILOT_MODEL=claude-sonnet-4.5
```

Available models depend on your Copilot plan. The SDK exposes a `listModels()` method to check at runtime.

## How the Copilot SDK works

This project uses [`@github/copilot-sdk`](https://github.com/github/copilot-sdk) — the official SDK for embedding Copilot's agentic runtime in applications. Key points:

- **Session-based**: Each LLM interaction creates a `CopilotSession`. The SDK handles context management, tool invocation, and streaming.
- **CLI subprocess**: The SDK bundles and manages the Copilot CLI automatically — no manual installation needed.
- **Streaming**: The chat feature uses `assistant.message_delta` events for real-time token streaming.
- **System messages**: Each session gets a `systemMessage` with `mode: "replace"` for full control over the research assistant persona.

The wrapper in `lib/copilot.ts` exposes three functions:

| Function | Purpose |
|---|---|
| `llmCall(system, user)` | One-shot text completion |
| `llmJSON<T>(system, user)` | JSON-parsed completion (for structured ingest pipeline output) |
| `llmStream(system, user)` | Returns a `ReadableStream<string>` for streaming chat |

## Project structure

```
app/
  page.tsx                    # Dashboard
  library/page.tsx            # Browse Zotero library
  ingest/page.tsx             # Ingest papers into Notion
  api/
    zotero/library/route.ts   # GET: fetch collections + items
    zotero/item/[id]/route.ts # GET: fetch single item + annotations
    ingest/route.ts           # POST: run ingest pipeline
    notion/search/route.ts    # GET: search Notion databases
lib/
  zotero.ts                   # Zotero API client
  notion.ts                   # Notion API client + DB helpers
  copilot.ts                  # GitHub Copilot SDK wrapper
  prompts.ts                  # LLM prompt templates
components/
  NavBar.tsx
  PaperCard.tsx
  IngestStatus.tsx
```
