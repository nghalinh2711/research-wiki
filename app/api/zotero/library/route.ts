import { NextResponse } from "next/server"
import { getCollections, getCollectionItems, getAllItems, itemToPaper, isResearchItem } from "@/lib/zotero"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const collectionKey = searchParams.get("collection")

    if (collectionKey) {
      const items = await getCollectionItems(collectionKey)
      const papers = items.filter(isResearchItem).map((item) => itemToPaper(item))
      return NextResponse.json({ papers })
    }

    const [collections, items] = await Promise.all([
      getCollections(),
      getAllItems(),
    ])

    const papers = items.filter(isResearchItem).map((item) => itemToPaper(item))

    return NextResponse.json({
      collections: collections.map((c) => ({
        key: c.key,
        name: c.data.name,
        parentCollection: c.data.parentCollection,
      })),
      papers,
    })
  } catch (error) {
    console.error("Zotero library fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch Zotero library" },
      { status: 500 }
    )
  }
}
