import { NextResponse } from "next/server"
import {
  listPaperSummaries,
  listConcepts,
  listMethods,
  listContradictions,
  querySynthesisNotes,
} from "@/lib/notion"

export interface HealthIssue {
  severity: "critical" | "warning" | "info"
  type: string
  title: string
  description: string
  pageId?: string
  fixable?: boolean
  fixLabel?: string
}

const STALE_DAYS = 30

export async function GET() {
  try {
    const [papers, concepts, methods, contradictions, syntheses] = await Promise.all([
      listPaperSummaries(),
      listConcepts(),
      listMethods(),
      listContradictions(),
      querySynthesisNotes(),
    ])

    const issues: HealthIssue[] = []

    // Papers with empty summaries
    for (const paper of papers) {
      if (!paper.abstractSummary) {
        issues.push({
          severity: "warning",
          type: "empty_summary",
          title: paper.title || "Untitled Paper",
          description: "Paper has no abstract summary. Consider re-ingesting.",
          pageId: paper.id,
          fixable: true,
          fixLabel: "Re-ingest",
        })
      }
      if (!paper.keyContribution) {
        issues.push({
          severity: "warning",
          type: "empty_contribution",
          title: paper.title || "Untitled Paper",
          description: "Paper has no key contribution identified.",
          pageId: paper.id,
          fixable: true,
          fixLabel: "Re-ingest",
        })
      }
    }

    // Orphan concepts — no related papers
    for (const concept of concepts) {
      if (!concept.definition) {
        issues.push({
          severity: "critical",
          type: "empty_definition",
          title: concept.name || "Untitled Concept",
          description: "Concept has no definition. It should be updated with a synthesis.",
          pageId: concept.id,
          fixable: true,
          fixLabel: "Generate definition",
        })
      }
    }

    // Methods not used by any paper
    for (const method of methods) {
      if (method.usedInCount === 0) {
        issues.push({
          severity: "info",
          type: "orphan_method",
          title: method.name || "Untitled Method",
          description: "Method is not linked to any paper.",
          pageId: method.id,
          fixable: true,
          fixLabel: "Archive",
        })
      }
      if (!method.description) {
        issues.push({
          severity: "warning",
          type: "empty_method_description",
          title: method.name || "Untitled Method",
          description: "Method has no description.",
          pageId: method.id,
          fixable: true,
          fixLabel: "Generate description",
        })
      }
    }

    // Unresolved contradictions
    for (const contradiction of contradictions) {
      if (!contradiction.resolution) {
        issues.push({
          severity: contradiction.severity === "Fundamental" ? "critical" : "warning",
          type: "unresolved_contradiction",
          title: contradiction.summary || "Untitled Contradiction",
          description: `${contradiction.severity} contradiction with no resolution recorded.`,
          pageId: contradiction.id,
        })
      }
    }

    // Coverage gaps
    if (papers.length > 0 && concepts.length === 0) {
      issues.push({
        severity: "critical",
        type: "no_concepts",
        title: "No Concepts",
        description: `${papers.length} papers ingested but no concepts have been created.`,
      })
    }

    if (papers.length > 0 && syntheses.length === 0) {
      issues.push({
        severity: "info",
        type: "no_synthesis",
        title: "No Synthesis Notes",
        description: "Consider creating synthesis notes or chapter drafts from your research.",
      })
    }

    // Staleness: check if any synthesis notes exist but are old
    const now = Date.now()
    for (const note of syntheses) {
      if (note.createdAt) {
        const age = (now - new Date(note.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        if (age > STALE_DAYS) {
          issues.push({
            severity: "info",
            type: "stale_synthesis",
            title: note.title || "Untitled Note",
            description: `Synthesis note is ${Math.round(age)} days old. Consider updating.`,
            pageId: note.id,
            fixable: true,
            fixLabel: "Archive",
          })
        }
      }
    }

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 }
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return NextResponse.json({
      summary: {
        papers: papers.length,
        concepts: concepts.length,
        methods: methods.length,
        contradictions: contradictions.length,
        syntheses: syntheses.length,
        issues: issues.length,
      },
      issues,
    })
  } catch (error) {
    console.error("Wiki health check error:", error)
    return NextResponse.json(
      { error: "Health check failed", details: String(error) },
      { status: 500 },
    )
  }
}
