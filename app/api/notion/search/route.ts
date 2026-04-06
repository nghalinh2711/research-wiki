import { NextResponse } from "next/server"
import { searchNotion } from "@/lib/notion"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")

    if (!query) {
      return NextResponse.json(
        { error: "Missing query parameter 'q'" },
        { status: 400 }
      )
    }

    const results = await searchNotion(query)

    const pages = results
      .filter((r): r is any => "properties" in r)
      .map((page) => {
        const title =
          page.properties?.Title?.title?.[0]?.plain_text ??
          page.properties?.Name?.title?.[0]?.plain_text ??
          page.properties?.Summary?.title?.[0]?.plain_text ??
          "Untitled"

        return {
          id: page.id,
          title,
          url: page.url,
          lastEdited: page.last_edited_time,
        }
      })

    return NextResponse.json({ results: pages })
  } catch (error) {
    console.error("Notion search error:", error)
    return NextResponse.json(
      { error: "Failed to search Notion" },
      { status: 500 }
    )
  }
}
