import { NextResponse } from "next/server"
import {
  archivePage,
  isPageArchived,
  updateConceptDefinition,
  updateMethodDescription,
  getConceptWithPapers,
  getMethodWithPapers,
  getPaperZoteroKey,
} from "@/lib/notion"
import { llmCall } from "@/lib/copilot"
import {
  GENERATE_CONCEPT_DEFINITION_PROMPT,
  GENERATE_METHOD_DESCRIPTION_PROMPT,
} from "@/lib/prompts"

type FixableType =
  | "orphan_method"
  | "stale_synthesis"
  | "empty_definition"
  | "empty_method_description"
  | "empty_summary"
  | "empty_contribution"

const ARCHIVABLE_TYPES = new Set<FixableType>(["orphan_method", "stale_synthesis"])
const REINGESTABLE_TYPES = new Set<FixableType>(["empty_summary", "empty_contribution"])

export async function POST(request: Request) {
  try {
    const { action, type, pageId } = await request.json()

    if (!type) {
      return NextResponse.json({ error: "Missing issue type" }, { status: 400 })
    }

    // Bulk fix: array of issues — track archived pages to skip conflicting edits
    if (action === "fix_all" && Array.isArray(pageId)) {
      const archivedPageIds = new Set<string>()
      const results: { pageId: string; type: string; success: boolean; action?: string; detail?: string; error?: string }[] = []
      for (const item of pageId as { type: FixableType; pageId?: string }[]) {
        if (!item.pageId) continue
        if (archivedPageIds.has(item.pageId)) {
          results.push({ pageId: item.pageId, type: item.type, success: true, action: "skipped_already_archived" })
          continue
        }
        try {
          const result = await fixSingle(item.type, item.pageId)
          results.push({ pageId: item.pageId, type: item.type, ...result })
          if (result.action === "archived" || result.action === "archived_for_reingest") {
            archivedPageIds.add(item.pageId)
          }
        } catch (err) {
          results.push({
            pageId: item.pageId,
            type: item.type,
            success: false,
            error: String(err),
          })
        }
      }
      return NextResponse.json({ results })
    }

    // Single fix
    if (!pageId || typeof pageId !== "string") {
      return NextResponse.json({ error: "Missing pageId" }, { status: 400 })
    }

    const result = await fixSingle(type as FixableType, pageId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Wiki health fix error:", error)
    return NextResponse.json(
      { error: "Fix failed", details: String(error) },
      { status: 500 },
    )
  }
}

async function fixSingle(
  type: FixableType,
  pageId: string,
): Promise<{ success: true; action: string; detail?: string }> {
  // Guard: skip if the page was already archived (e.g. same page had an
  // archive fix run before a generate fix in the same bulk operation)
  if (!ARCHIVABLE_TYPES.has(type)) {
    const archived = await isPageArchived(pageId)
    if (archived) {
      return { success: true, action: "skipped_already_archived" }
    }
  }

  // --- Archive actions ---
  if (ARCHIVABLE_TYPES.has(type)) {
    await archivePage(pageId)
    return { success: true, action: "archived" }
  }

  // --- Generate concept definition via LLM ---
  if (type === "empty_definition") {
    const concept = await getConceptWithPapers(pageId)
    const userMessage = JSON.stringify({
      conceptName: concept.name,
      relatedPapers: concept.paperSummaries,
    })
    const definition = await llmCall(GENERATE_CONCEPT_DEFINITION_PROMPT, userMessage)
    await updateConceptDefinition(pageId, definition.trim())
    return { success: true, action: "generated_definition", detail: definition.trim() }
  }

  // --- Generate method description via LLM ---
  if (type === "empty_method_description") {
    const method = await getMethodWithPapers(pageId)
    const userMessage = JSON.stringify({
      methodName: method.name,
      usedInPapers: method.paperTitles,
    })
    const description = await llmCall(GENERATE_METHOD_DESCRIPTION_PROMPT, userMessage)
    await updateMethodDescription(pageId, description.trim())
    return { success: true, action: "generated_description", detail: description.trim() }
  }

  // --- Re-ingest: archive the old page and return the Zotero key so the frontend can re-trigger ---
  if (REINGESTABLE_TYPES.has(type)) {
    const zoteroKey = await getPaperZoteroKey(pageId)
    if (!zoteroKey) {
      throw new Error("Paper has no ZoteroKey — cannot re-ingest")
    }
    await archivePage(pageId)
    return { success: true, action: "archived_for_reingest", detail: zoteroKey }
  }

  throw new Error(`No fix handler for issue type: ${type}`)
}
