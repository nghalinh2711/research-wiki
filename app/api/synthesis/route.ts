import { NextResponse } from "next/server"
import { querySynthesisNotes, createSynthesisNote } from "@/lib/notion"

export async function GET() {
  try {
    const notes = await querySynthesisNotes()
    return NextResponse.json({ notes })
  } catch (error) {
    console.error("Synthesis list error:", error)
    return NextResponse.json(
      { error: "Failed to fetch synthesis notes", details: String(error) },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const { title, content, type, paperIds, conceptIds } = await request.json()

    if (!title || !content) {
      return NextResponse.json({ error: "Missing title or content" }, { status: 400 })
    }

    const validTypes = ["Chapter Draft", "Open Question", "Gap", "Insight"] as const
    const safeType = validTypes.includes(type) ? type : "Insight"

    const page = await createSynthesisNote(
      title,
      content,
      safeType as (typeof validTypes)[number],
      paperIds ?? [],
      conceptIds ?? [],
    )

    return NextResponse.json({ success: true, pageId: page.id })
  } catch (error) {
    console.error("Synthesis create error:", error)
    return NextResponse.json(
      { error: "Failed to create synthesis note", details: String(error) },
      { status: 500 },
    )
  }
}
