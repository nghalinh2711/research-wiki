const ZOTERO_BASE = `https://api.zotero.org/users/${process.env.ZOTERO_USER_ID}`

function headers() {
  return {
    "Zotero-API-Key": process.env.ZOTERO_API_KEY!,
    "Content-Type": "application/json",
  }
}

async function zoteroFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${ZOTERO_BASE}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), { headers: headers() })
  if (!res.ok) {
    throw new Error(`Zotero API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// --- Types ---

export interface ZoteroAnnotation {
  text: string
  comment: string
  color: string
}

export interface ZoteroPaper {
  key: string
  title: string
  authors: string[]
  year: number
  venue: string
  doi: string
  abstract: string
  tags: string[]
  collections: string[]
  annotations: ZoteroAnnotation[]
}

interface ZoteroCreator {
  creatorType: string
  firstName?: string
  lastName?: string
  name?: string
}

interface ZoteroItemData {
  key: string
  itemType: string
  title: string
  creators: ZoteroCreator[]
  date: string
  publicationTitle?: string
  journalAbbreviation?: string
  DOI?: string
  abstractNote?: string
  tags: { tag: string }[]
  collections: string[]
}

interface ZoteroItem {
  key: string
  data: ZoteroItemData
}

interface ZoteroCollection {
  key: string
  data: {
    key: string
    name: string
    parentCollection: string | false
  }
}

interface ZoteroAnnotationItem {
  data: {
    itemType: string
    annotationType?: string
    annotationText?: string
    annotationComment?: string
    annotationColor?: string
  }
}

// --- API Methods ---

export async function getCollections(): Promise<ZoteroCollection[]> {
  return zoteroFetch<ZoteroCollection[]>("/collections")
}

export async function getCollectionItems(
  collectionKey: string,
  limit = 50,
  start = 0
): Promise<ZoteroItem[]> {
  return zoteroFetch<ZoteroItem[]>(`/collections/${collectionKey}/items`, {
    include: "data",
    limit: String(limit),
    start: String(start),
    itemType: "-attachment || note",
  })
}

export async function getItem(itemKey: string): Promise<ZoteroItem> {
  return zoteroFetch<ZoteroItem>(`/items/${itemKey}`, { include: "data" })
}

export async function getItemAnnotations(itemKey: string): Promise<ZoteroAnnotation[]> {
  const children = await zoteroFetch<ZoteroAnnotationItem[]>(`/items/${itemKey}/children`)
  return children
    .filter((c) => c.data.itemType === "annotation")
    .map((c) => ({
      text: c.data.annotationText ?? "",
      comment: c.data.annotationComment ?? "",
      color: c.data.annotationColor ?? "",
    }))
}

export async function searchItems(query: string): Promise<ZoteroItem[]> {
  return zoteroFetch<ZoteroItem[]>("/items", {
    q: query,
    qmode: "titleCreatorYear",
  })
}

export async function getAllItems(limit = 100, start = 0): Promise<ZoteroItem[]> {
  return zoteroFetch<ZoteroItem[]>("/items", {
    include: "data",
    limit: String(limit),
    start: String(start),
    itemType: "-attachment || note",
  })
}

// --- Helpers ---

function formatAuthor(creator: ZoteroCreator): string {
  if (creator.name) return creator.name
  return [creator.lastName, creator.firstName].filter(Boolean).join(", ")
}

function extractYear(dateStr: string): number {
  const match = dateStr?.match(/\d{4}/)
  return match ? parseInt(match[0], 10) : 0
}

const SKIP_ITEM_TYPES = new Set(["attachment", "note", "annotation"])

export function isResearchItem(item: ZoteroItem): boolean {
  return !SKIP_ITEM_TYPES.has(item.data.itemType)
}

export function itemToPaper(item: ZoteroItem, annotations: ZoteroAnnotation[] = []): ZoteroPaper {
  const d = item.data
  return {
    key: d.key,
    title: d.title ?? "",
    authors: (d.creators ?? [])
      .filter((c) => c.creatorType === "author")
      .map(formatAuthor),
    year: extractYear(d.date),
    venue: d.journalAbbreviation || d.publicationTitle || "",
    doi: d.DOI || "",
    abstract: d.abstractNote || "",
    tags: (d.tags ?? []).map((t) => t.tag),
    collections: d.collections ?? [],
    annotations,
  }
}
