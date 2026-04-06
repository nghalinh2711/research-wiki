import { NextResponse } from "next/server"
import { getItem, getItemAnnotations, itemToPaper } from "@/lib/zotero"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const [item, annotations] = await Promise.all([
      getItem(id),
      getItemAnnotations(id),
    ])

    const paper = itemToPaper(item, annotations)
    return NextResponse.json({ paper })
  } catch (error) {
    console.error("Zotero item fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch Zotero item" },
      { status: 500 }
    )
  }
}
