import { NextResponse } from "next/server"
import { getItem, getItemAnnotations, itemToPaper } from "@/lib/zotero"
import {
  listConcepts,
  queryPapers,
  getPaperByZoteroKey,
  createPaperPage,
  findConceptByName,
  createConceptPage,
  updateConceptDefinition,
  findMethodByName,
  createMethodPage,
  createContradiction,
  type ConceptSummary,
} from "@/lib/notion"
import { llmJSON, llmCall } from "@/lib/copilot"
import { INGEST_SYSTEM_PROMPT, CONCEPT_UPDATE_PROMPT, type IngestLLMResult } from "@/lib/prompts"

export async function POST(request: Request) {
  try {
    const { itemKey } = await request.json()

    if (!itemKey) {
      return NextResponse.json({ error: "Missing itemKey" }, { status: 400 })
    }

    // Check if already ingested
    const existing = await getPaperByZoteroKey(itemKey)
    if (existing) {
      return NextResponse.json(
        { error: "Paper already ingested", pageId: existing.id },
        { status: 409 }
      )
    }

    // Step 1: Fetch paper from Zotero
    const [item, annotations] = await Promise.all([
      getItem(itemKey),
      getItemAnnotations(itemKey),
    ])
    const paper = itemToPaper(item, annotations)

    // Step 2: Fetch existing Notion context
    const [existingConcepts, existingPapersResult] = await Promise.all([
      listConcepts(),
      queryPapers(),
    ])

    const existingPaperTitles = existingPapersResult.results.map((p: any) =>
      p.properties?.Title?.title?.[0]?.plain_text ?? ""
    )

    // Step 3: LLM Call 1 — Generate paper page content
    const userMessage = JSON.stringify({
      paper: {
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        venue: paper.venue,
        abstract: paper.abstract,
        tags: paper.tags,
        annotations: paper.annotations,
      },
      existingConcepts: existingConcepts.map((c: ConceptSummary) => c.name),
      existingPapers: existingPaperTitles,
    })

    const analysis = await llmJSON<IngestLLMResult>(INGEST_SYSTEM_PROMPT, userMessage)

    // Step 4: Resolve methods — find or create
    const methodIds: string[] = []
    for (const methodName of analysis.methodsUsed) {
      let method = await findMethodByName(methodName)
      if (!method) {
        method = await createMethodPage(methodName, [])
      }
      methodIds.push(method.id)
    }

    // Step 5: Resolve concepts — find or create
    const conceptIds: string[] = []

    for (const conceptName of [...analysis.conceptsUsed, ...analysis.newConcepts]) {
      let concept = await findConceptByName(conceptName)
      if (!concept) {
        concept = await createConceptPage(conceptName, "", [])
      }
      conceptIds.push(concept.id)
    }

    // Step 6: Create the Paper page in Notion
    const paperPage = await createPaperPage({
      title: paper.title,
      authors: paper.authors.join(", "),
      year: paper.year,
      venue: paper.venue,
      doi: paper.doi,
      zoteroKey: paper.key,
      abstractSummary: analysis.abstractSummary,
      keyContribution: analysis.keyContribution,
      thesisRelevance: analysis.thesisRelevance,
      tags: paper.tags,
      conceptIds,
      methodIds,
    })

    // Step 7: LLM Call 2 — Update concept definitions
    for (const conceptName of [...analysis.conceptsUsed, ...analysis.newConcepts]) {
      const concept = await findConceptByName(conceptName)
      if (!concept) continue

      const conceptData = existingConcepts.find((c: ConceptSummary) => c.name === conceptName)
      const currentDef = conceptData?.definition ?? ""

      const updatedDef = await llmCall(
        CONCEPT_UPDATE_PROMPT,
        JSON.stringify({
          conceptName,
          currentDefinition: currentDef,
          newPaper: {
            title: paper.title,
            abstract: paper.abstract,
            keyContribution: analysis.keyContribution,
          },
        })
      )

      await updateConceptDefinition(concept.id, updatedDef, paperPage.id)
    }

    // Step 8: Create contradiction entries if flagged
    for (const contradiction of analysis.potentialContradictions) {
      const otherPaperResults = await queryPapers({ title: contradiction.withPaper })
      const otherPaper = otherPaperResults.results[0]
      if (otherPaper) {
        await createContradiction(
          `${paper.title} vs ${contradiction.withPaper}: ${contradiction.on}`,
          paperPage.id,
          otherPaper.id,
          contradiction.on
        )
      }
    }

    return NextResponse.json({
      success: true,
      pageId: paperPage.id,
      analysis,
    })
  } catch (error) {
    console.error("Ingest error:", error)
    return NextResponse.json(
      { error: "Ingest pipeline failed", details: String(error) },
      { status: 500 }
    )
  }
}
