import {
  queryPapers,
  queryConcepts,
  getPaperAsContext,
  getConceptAsContext,
} from "@/lib/notion"
import { llmStream } from "@/lib/copilot"
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompts"
import { isFullPage } from "@notionhq/client"

function extractKeywords(message: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "because", "but", "and", "or", "if", "while", "about", "what", "which",
    "who", "whom", "this", "that", "these", "those", "i", "me", "my",
    "myself", "we", "our", "you", "your", "he", "him", "his", "she", "her",
    "it", "its", "they", "them", "their", "tell", "explain", "describe",
  ])
  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 6)
}

export async function POST(request: Request) {
  try {
    const { message, history } = await request.json()

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const keywords = extractKeywords(message)

    // Search Notion for relevant papers and concepts in parallel
    const [paperResults, ...conceptResults] = await Promise.all([
      queryPapers(keywords[0] ? { title: keywords[0] } : undefined),
      ...keywords.slice(0, 3).map((kw) => queryConcepts(kw)),
    ])

    // Deduplicate pages
    const paperIds = new Set<string>()
    const conceptIds = new Set<string>()

    for (const page of paperResults.results.filter(isFullPage).slice(0, 6)) {
      paperIds.add(page.id)
    }
    for (const result of conceptResults) {
      for (const page of result.results.filter(isFullPage).slice(0, 4)) {
        conceptIds.add(page.id)
      }
    }

    // Fetch full context for top results
    const contextParts = await Promise.all([
      ...Array.from(paperIds).slice(0, 5).map(getPaperAsContext),
      ...Array.from(conceptIds).slice(0, 4).map(getConceptAsContext),
    ])

    const context = contextParts.filter(Boolean).join("\n\n---\n\n")

    // Build conversation with history if provided
    const historyContext = Array.isArray(history)
      ? history
          .slice(-6)
          .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
          .join("\n")
      : ""

    const fullMessage = historyContext
      ? `Previous conversation:\n${historyContext}\n\nCurrent question: ${message}`
      : message

    const stream = await llmStream(CHAT_SYSTEM_PROMPT(context), fullMessage)

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("Chat error:", error)
    return new Response(
      JSON.stringify({ error: "Chat failed", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}
