# Research Wiki — Implementation Spec
**Thesis Topic:** Memory Management for AI Agents  
**Stack:** Next.js · Vercel · Zotero API · Notion API · GitHub Copilot SDK  
**Goal:** A web app that reads your Zotero library, processes papers with an LLM, and builds a structured, self-maintaining research wiki in Notion — with no local file storage.

---

## Architecture Overview

```
Zotero (source of truth)
  └── papers, metadata, abstracts, annotations
         │
         ▼
  Next.js Web App (Vercel)
  ├── Zotero API client      — fetches library, collections, annotations
  ├── GitHub Copilot SDK     — LLM calls for ingestion, querying, synthesis
  └── Notion API client      — writes and reads wiki databases
         │
         ▼
  Notion (wiki / knowledge base)
  └── linked databases: Papers, Concepts, Methods, Contradictions, Synthesis
```

**Key principle:** Zotero is the raw layer. No PDFs are ever downloaded or stored locally. The app reads metadata + abstracts + annotations via the Zotero Web API. Notion stores all structured knowledge. The web app is the thin layer in between.

---

## Tech Stack

| Concern | Tool | Notes |
|---|---|---|
| Framework | Next.js (App Router) | API routes + React frontend |
| Deployment | Vercel | Free tier, zero config |
| LLM | GitHub Copilot SDK | `@copilot-extensions/copilot-sdk` or `openai` SDK pointed at Copilot endpoint |
| Paper source | Zotero Web API | Free, no PDF download needed |
| Wiki storage | Notion API | Free, unlimited pages for personal workspace |
| Auth | Zotero OAuth 2.0 + Notion OAuth | Both are free |
| Styling | Tailwind CSS | |

---

## Project Structure

```
/
├── app/
│   ├── page.tsx                  # Dashboard / home
│   ├── library/
│   │   └── page.tsx              # Browse Zotero library
│   ├── ingest/
│   │   └── page.tsx              # Ingest a paper into Notion
│   ├── chat/
│   │   └── page.tsx              # Chat with the wiki
│   └── api/
│       ├── zotero/
│       │   ├── library/route.ts  # GET: fetch collections + items
│       │   └── item/[id]/route.ts# GET: fetch single item + annotations
│       ├── ingest/route.ts       # POST: run ingest pipeline
│       ├── chat/route.ts         # POST: query wiki via LLM
│       └── notion/
│           └── search/route.ts   # GET: search Notion databases
├── lib/
│   ├── zotero.ts                 # Zotero API client
│   ├── notion.ts                 # Notion API client + DB helpers
│   ├── copilot.ts                # GitHub Copilot SDK wrapper
│   └── prompts.ts                # All LLM prompt templates
├── components/
│   ├── PaperCard.tsx
│   ├── ChatWindow.tsx
│   └── IngestStatus.tsx
└── .env.local                    # API keys (never committed)
```

---

## Environment Variables

```bash
# .env.local

# Zotero
ZOTERO_API_KEY=             # From zotero.org/settings/keys
ZOTERO_USER_ID=             # Your numeric Zotero user ID

# Notion
NOTION_API_KEY=             # From notion.so/my-integrations
NOTION_PAPERS_DB_ID=        # Database IDs created in setup step
NOTION_CONCEPTS_DB_ID=
NOTION_METHODS_DB_ID=
NOTION_CONTRADICTIONS_DB_ID=
NOTION_SYNTHESIS_DB_ID=

# GitHub Copilot
GITHUB_COPILOT_TOKEN=       # Personal access token with Copilot scope
```

---

## Zotero Integration

### API Base
```
https://api.zotero.org/users/{ZOTERO_USER_ID}/
```
All requests include header: `Zotero-API-Key: {ZOTERO_API_KEY}`

### Key Endpoints to Use

```typescript
// lib/zotero.ts

// Fetch all collections (thesis folders)
GET /users/{id}/collections

// Fetch items in a collection
GET /users/{id}/collections/{collectionKey}/items?include=data,abstract

// Fetch a single item (paper) with full metadata
GET /users/{id}/items/{itemKey}?include=data

// Fetch annotations/highlights for a paper
GET /users/{id}/items/{itemKey}/children
// Children of type "annotation" contain: annotationText, annotationComment, annotationColor

// Search by title
GET /users/{id}/items?q={query}&qmode=titleCreatorYear
```

### Data Shape Per Paper (what we send to the LLM)
```typescript
interface ZoteroPaper {
  key: string
  title: string
  authors: string[]         // from creators[]
  year: number
  venue: string             // journalAbbreviation or publicationTitle
  doi: string
  abstract: string
  tags: string[]
  collections: string[]
  annotations: {
    text: string            // highlighted text
    comment: string         // your note on the highlight
    color: string           // yellow/red/green etc.
  }[]
}
```

---

## GitHub Copilot SDK — LLM Calls

GitHub Copilot exposes a chat completions endpoint compatible with the OpenAI SDK. Use it like this:

```typescript
// lib/copilot.ts
import OpenAI from "openai"

const copilot = new OpenAI({
  baseURL: "https://api.githubcopilot.com",
  apiKey: process.env.GITHUB_COPILOT_TOKEN,
})

export async function llmCall(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await copilot.chat.completions.create({
    model: "gpt-4o",          // or "claude-3.5-sonnet" if available in your Copilot plan
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2000,
  })
  return response.choices[0].message.content ?? ""
}

// Streaming version for chat UI
export async function llmStream(systemPrompt: string, userMessage: string) {
  return copilot.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  })
}
```

---

## Notion Wiki Structure

### Step 1: Create These 5 Databases in Notion

Create them manually in Notion first, then copy their IDs into `.env.local`. The app will read/write them via API.

---

### 1. Papers Database
**Properties:**

| Property | Type | Notes |
|---|---|---|
| Title | title | Paper name |
| Authors | rich_text | Comma-separated |
| Year | number | |
| Venue | rich_text | Journal or conference |
| DOI | url | |
| ZoteroKey | rich_text | For linking back |
| AbstractSummary | rich_text | LLM-generated |
| KeyContribution | rich_text | LLM-generated |
| MethodUsed | relation | → Methods DB |
| ThesisRelevance | select | `Core` / `Supporting` / `Background` / `Contradicting` |
| Concepts | relation | → Concepts DB |
| Tags | multi_select | From Zotero tags |
| IngestedAt | date | |

---

### 2. Concepts Database
**Properties:**

| Property | Type | Notes |
|---|---|---|
| Name | title | e.g. "Episodic Memory", "Memory Consolidation" |
| Definition | rich_text | LLM-synthesized from all papers |
| RelatedPapers | relation | → Papers DB |
| SubConcepts | relation | → Concepts DB (self-referential) |
| ThesisRole | select | `Central` / `Supporting` / `Peripheral` |
| LastUpdated | date | |

---

### 3. Methods Database
**Properties:**

| Property | Type | Notes |
|---|---|---|
| Name | title | e.g. "Retrieval-Augmented Generation", "Vector Similarity Search" |
| Description | rich_text | |
| UsedIn | relation | → Papers DB |
| Benchmarks | rich_text | Datasets / eval setups |

---

### 4. Contradictions Database
**Properties:**

| Property | Type | Notes |
|---|---|---|
| Summary | title | One-line description of the conflict |
| PaperA | relation | → Papers DB |
| PaperB | relation | → Papers DB |
| Topic | rich_text | What they disagree about |
| Resolution | rich_text | Your current thinking / open question |
| Severity | select | `Minor` / `Significant` / `Fundamental` |

---

### 5. Synthesis / Thesis Notes Database
**Properties:**

| Property | Type | Notes |
|---|---|---|
| Title | title | e.g. "Chapter 2 — Related Work" |
| Content | rich_text | LLM-generated or your own writing |
| Type | select | `Chapter Draft` / `Open Question` / `Gap` / `Insight` |
| LinkedPapers | relation | → Papers DB |
| LinkedConcepts | relation | → Concepts DB |
| CreatedAt | date | |

---

## Core Feature: Ingest Pipeline

When you select a paper to ingest, the app runs this sequence:

```
1. Fetch paper from Zotero API
   └── title, authors, year, venue, doi, abstract, tags, annotations

2. Fetch existing Notion context
   └── read index of Concepts DB (names + summaries)
   └── read index of Papers DB (titles already ingested)

3. LLM Call 1 — Generate paper page content
   System: You are a research assistant maintaining a wiki on Memory Management for AI Agents.
   User: [full paper data] + [existing concepts list]
   Output (JSON):
   {
     abstractSummary: string,
     keyContribution: string,
     thesisRelevance: "Core" | "Supporting" | "Background" | "Contradicting",
     conceptsUsed: string[],       // names matching existing concepts
     newConcepts: string[],        // concepts to create
     methodsUsed: string[],
     potentialContradictions: {
       withPaper: string,
       on: string
     }[]
   }

4. LLM Call 2 — Update concept definitions
   For each concept touched by the paper:
   └── fetch existing concept page from Notion
   └── ask LLM to revise/extend definition given the new paper

5. Write to Notion
   └── Create Paper page with all properties + relations
   └── Create/update Concept pages
   └── Create Contradiction entries if flagged
   └── Append to Reading Log
```

---

## Core Feature: Chat / Query

```typescript
// app/api/chat/route.ts (streaming)

// 1. Search Notion for relevant pages
//    - query Papers DB by title/tags
//    - query Concepts DB by name
//    - return top N pages with their content

// 2. Build context string from Notion pages

// 3. LLM call with streaming
System: You are a research assistant. The user is writing a thesis on Memory Management for AI Agents.
        Answer using only the knowledge base provided. Cite pages by name.
        Knowledge base:
        {relevant Notion pages as text}
User: {user question}

// 4. Stream response back to UI

// 5. Optional: offer to save answer as Synthesis Note in Notion
```

---

## Build Phases

### Phase 1 — Core Pipeline (build this first)
- [ ] Next.js project setup with Tailwind
- [ ] Zotero API client (`lib/zotero.ts`) — fetch library, items, annotations
- [ ] Notion API client (`lib/notion.ts`) — create/update pages, query DBs
- [ ] Copilot SDK wrapper (`lib/copilot.ts`)
- [ ] `/library` page — browse Zotero collections and papers
- [ ] `/api/ingest` route — full ingest pipeline
- [ ] `/ingest` page — select a paper, trigger ingest, show status

### Phase 2 — Chat
- [ ] `/api/chat` route with streaming
- [ ] `/chat` page with chat UI
- [ ] "Save this answer to Notion" button

### Phase 3 — Thesis Mode
- [ ] Contradiction detection during ingest
- [ ] Wiki health check ("lint") — find orphan concepts, gaps, stale pages
- [ ] Synthesis view per thesis chapter
- [ ] Literature review draft export

---

## Prompts Reference (`lib/prompts.ts`)

```typescript
export const INGEST_SYSTEM_PROMPT = `
You are a research assistant helping maintain a structured wiki on the topic: Memory Management for AI Agents.

Your job when given a paper:
1. Summarize the abstract in 2-3 sentences in your own words
2. Identify the single key contribution
3. Rate thesis relevance: Core / Supporting / Background / Contradicting
4. List concepts from the paper that match or extend the existing concept list
5. Identify any new concepts not yet in the wiki
6. Identify methods/techniques used
7. Flag any contradictions with papers already in the wiki

Always respond in valid JSON matching the schema provided.
`

export const CONCEPT_UPDATE_PROMPT = `
You are updating a concept definition in a research wiki on Memory Management for AI Agents.
The current definition is provided. A new paper has been ingested that discusses this concept.
Revise or extend the definition to incorporate new understanding from the paper.
Keep the definition concise (3-5 sentences). Do not just append — synthesize.
`

export const CHAT_SYSTEM_PROMPT = (context: string) => `
You are a research assistant for a master's thesis on Memory Management for AI Agents.
Answer questions using only the knowledge base below. Cite sources by paper title.
If the answer isn't in the knowledge base, say so — do not hallucinate.

Knowledge base:
${context}
`
```

---

## Setup Checklist

1. **Zotero:** Go to `zotero.org/settings/keys` → Create new private key → copy key + user ID
2. **Notion:** Go to `notion.so/my-integrations` → Create integration → copy token
   - Create the 5 databases manually in Notion
   - Share each database with your integration (click ··· → Connections → your integration)
   - Copy each database ID from its URL: `notion.so/{workspace}/{DATABASE_ID}?v=...`
3. **GitHub Copilot:** Go to GitHub Settings → Developer Settings → Personal Access Tokens → create token with `copilot` scope
4. **Vercel:** Connect GitHub repo → add all env vars in Vercel dashboard → deploy
