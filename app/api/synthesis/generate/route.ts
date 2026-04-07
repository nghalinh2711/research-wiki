import {
  listPaperSummaries,
  listConcepts,
  listContradictions,
  getPaperAsContext,
  getConceptAsContext,
} from "@/lib/notion"
import { llmStream } from "@/lib/copilot"
import { LIT_REVIEW_PROMPT, GAP_ANALYSIS_PROMPT } from "@/lib/prompts"

export async function POST(request: Request) {
  try {
    const { type, paperIds, conceptIds } = await request.json()

    if (!type || !["chapter-draft", "gap-analysis"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid type. Use 'chapter-draft' or 'gap-analysis'" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const [allPapers, allConcepts, contradictions] = await Promise.all([
      listPaperSummaries(),
      listConcepts(),
      listContradictions(),
    ])

    // If specific IDs provided, fetch full context for those; otherwise use all summaries
    const contextParts: string[] = []

    if (Array.isArray(paperIds) && paperIds.length > 0) {
      const paperContexts = await Promise.all(
        paperIds.slice(0, 10).map(getPaperAsContext),
      )
      contextParts.push(...paperContexts.filter(Boolean))
    } else {
      for (const p of allPapers.slice(0, 20)) {
        contextParts.push(
          [
            `## ${p.title}`,
            p.abstractSummary && `Summary: ${p.abstractSummary}`,
            p.keyContribution && `Key Contribution: ${p.keyContribution}`,
            p.thesisRelevance && `Relevance: ${p.thesisRelevance}`,
          ]
            .filter(Boolean)
            .join("\n"),
        )
      }
    }

    if (Array.isArray(conceptIds) && conceptIds.length > 0) {
      const conceptContexts = await Promise.all(
        conceptIds.slice(0, 10).map(getConceptAsContext),
      )
      contextParts.push(...conceptContexts.filter(Boolean))
    } else {
      for (const c of allConcepts.slice(0, 15)) {
        contextParts.push(
          [`## Concept: ${c.name}`, c.definition && `Definition: ${c.definition}`]
            .filter(Boolean)
            .join("\n"),
        )
      }
    }

    if (contradictions.length > 0) {
      contextParts.push("## Contradictions")
      for (const c of contradictions) {
        contextParts.push(
          `- ${c.summary} (${c.severity}): ${c.topic}${c.resolution ? ` — Resolution: ${c.resolution}` : ""}`,
        )
      }
    }

    const context = contextParts.join("\n\n---\n\n")
    const prompt = type === "chapter-draft" ? LIT_REVIEW_PROMPT : GAP_ANALYSIS_PROMPT
    const stream = await llmStream(prompt, context)

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("Synthesis generate error:", error)
    return new Response(
      JSON.stringify({ error: "Generation failed", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}
