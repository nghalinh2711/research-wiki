import { NextResponse } from "next/server"
import { createSynthesisNote } from "@/lib/notion"

export async function POST(request: Request) {
  try {
    const { title, content, type, paperIds, conceptIds } = await request.json()

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Missing content" }, { status: 400 })
    }

    const noteTitle = title || `Chat insight — ${new Date().toLocaleDateString()}`
    const noteType = type || "Insight"
    const validTypes = ["Chapter Draft", "Open Question", "Gap", "Insight"] as const
    const safeType = validTypes.includes(noteType) ? noteType : "Insight"

    const page = await createSynthesisNote(
      noteTitle,
      content,
      safeType as (typeof validTypes)[number],
      paperIds ?? [],
      conceptIds ?? [],
    )

    return NextResponse.json({ success: true, pageId: page.id })
  } catch (error) {
    console.error("Save chat note error:", error)
    return NextResponse.json(
      { error: "Failed to save note", details: String(error) },
      { status: 500 },
    )
  }
}
