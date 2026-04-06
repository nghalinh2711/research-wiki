import { Client, isFullPage } from "@notionhq/client"
import type { QueryDatabaseParameters } from "@notionhq/client/build/src/api-endpoints"

let _client: Client | null = null

function getNotion(): Client {
  if (!_client) {
    _client = new Client({ auth: process.env.NOTION_API_KEY })
  }
  return _client
}

function db() {
  return {
    papers: process.env.NOTION_PAPERS_DB_ID!,
    concepts: process.env.NOTION_CONCEPTS_DB_ID!,
    methods: process.env.NOTION_METHODS_DB_ID!,
    contradictions: process.env.NOTION_CONTRADICTIONS_DB_ID!,
    synthesis: process.env.NOTION_SYNTHESIS_DB_ID!,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>

function getTitle(props: AnyProps, field: string): string {
  return props[field]?.title?.[0]?.plain_text ?? ""
}

function getRichText(props: AnyProps, field: string): string {
  return props[field]?.rich_text?.[0]?.plain_text ?? ""
}

async function queryDB(
  databaseId: string,
  filter?: QueryDatabaseParameters["filter"],
  pageSize = 100
) {
  return getNotion().databases.query({
    database_id: databaseId,
    filter,
    page_size: pageSize,
  })
}

// --- Papers ---

export interface CreatePaperParams {
  title: string
  authors: string
  year: number
  venue: string
  doi: string
  zoteroKey: string
  abstractSummary: string
  keyContribution: string
  thesisRelevance: string
  tags: string[]
  conceptIds: string[]
  methodIds: string[]
}

export async function createPaperPage(params: CreatePaperParams) {
  return getNotion().pages.create({
    parent: { database_id: db().papers },
    properties: {
      Title: { title: [{ text: { content: params.title } }] },
      Authors: { rich_text: [{ text: { content: params.authors } }] },
      Year: { number: params.year },
      Venue: { rich_text: [{ text: { content: params.venue } }] },
      DOI: { url: params.doi || null },
      ZoteroKey: { rich_text: [{ text: { content: params.zoteroKey } }] },
      AbstractSummary: { rich_text: [{ text: { content: params.abstractSummary } }] },
      KeyContribution: { rich_text: [{ text: { content: params.keyContribution } }] },
      ThesisRelevance: { select: { name: params.thesisRelevance } },
      Tags: { multi_select: params.tags.map((t) => ({ name: t })) },
      Concepts: { relation: params.conceptIds.map((id) => ({ id })) },
      MethodUsed: { relation: params.methodIds.map((id) => ({ id })) },
      IngestedAt: { date: { start: new Date().toISOString() } },
    },
  })
}

export async function queryPapers(filter?: { title?: string }) {
  return queryDB(
    db().papers,
    filter?.title
      ? { property: "Title", title: { contains: filter.title } }
      : undefined
  )
}

export async function getPaperByZoteroKey(zoteroKey: string) {
  try {
    const result = await queryDB(db().papers, {
      property: "ZoteroKey",
      rich_text: { equals: zoteroKey },
    })
    return result.results[0] ?? null
  } catch {
    // Property doesn't exist yet — treat as "not found" so ingest can proceed
    return null
  }
}

// --- Concepts ---

export interface ConceptSummary {
  id: string
  name: string
  definition: string
}

export async function listConcepts(): Promise<ConceptSummary[]> {
  const result = await queryDB(db().concepts)
  return result.results.filter(isFullPage).map((page) => {
    const props = page.properties as AnyProps
    return {
      id: page.id,
      name: getTitle(props, "Name"),
      definition: getRichText(props, "Definition"),
    }
  })
}

export async function findConceptByName(name: string) {
  const result = await queryDB(db().concepts, {
    property: "Name",
    title: { equals: name },
  })
  return result.results[0] ?? null
}

export async function createConceptPage(name: string, definition: string, paperIds: string[]) {
  return getNotion().pages.create({
    parent: { database_id: db().concepts },
    properties: {
      Name: { title: [{ text: { content: name } }] },
      Definition: { rich_text: [{ text: { content: definition } }] },
      RelatedPapers: { relation: paperIds.map((id) => ({ id })) },
      ThesisRole: { select: { name: "Supporting" } },
      LastUpdated: { date: { start: new Date().toISOString() } },
    },
  })
}

export async function updateConceptDefinition(
  pageId: string,
  definition: string,
  paperIdToAdd?: string
) {
  const n = getNotion()
  await n.pages.update({
    page_id: pageId,
    properties: {
      Definition: { rich_text: [{ text: { content: definition } }] },
      LastUpdated: { date: { start: new Date().toISOString() } },
    },
  })

  if (paperIdToAdd) {
    const page = (await n.pages.retrieve({ page_id: pageId })) as AnyProps
    const existingRelations: { id: string }[] = page.properties?.RelatedPapers?.relation ?? []
    await n.pages.update({
      page_id: pageId,
      properties: {
        RelatedPapers: {
          relation: [...existingRelations, { id: paperIdToAdd }],
        },
      },
    })
  }
}

// --- Methods ---

export async function findMethodByName(name: string) {
  const result = await queryDB(db().methods, {
    property: "Name",
    title: { equals: name },
  })
  return result.results[0] ?? null
}

export async function createMethodPage(name: string, paperIds: string[]) {
  return getNotion().pages.create({
    parent: { database_id: db().methods },
    properties: {
      Name: { title: [{ text: { content: name } }] },
      Description: { rich_text: [{ text: { content: "" } }] },
      UsedIn: { relation: paperIds.map((id) => ({ id })) },
    },
  })
}

// --- Contradictions ---

export async function createContradiction(
  summary: string,
  paperAId: string,
  paperBId: string,
  topic: string
) {
  return getNotion().pages.create({
    parent: { database_id: db().contradictions },
    properties: {
      Summary: { title: [{ text: { content: summary } }] },
      PaperA: { relation: [{ id: paperAId }] },
      PaperB: { relation: [{ id: paperBId }] },
      Topic: { rich_text: [{ text: { content: topic } }] },
      Resolution: { rich_text: [{ text: { content: "" } }] },
      Severity: { select: { name: "Minor" } },
    },
  })
}

// --- Search across all DBs ---

export async function searchNotion(query: string) {
  const response = await getNotion().search({
    query,
    page_size: 20,
  })
  return response.results
}

// --- Page content reading ---

export async function getPageContent(pageId: string): Promise<string> {
  const blocks = await getNotion().blocks.children.list({ block_id: pageId, page_size: 100 })
  return blocks.results
    .map((block) => {
      const b = block as AnyProps
      if (b.type === "paragraph") {
        return b.paragraph.rich_text?.map((t: AnyProps) => t.plain_text).join("") ?? ""
      }
      if (b.type === "heading_2") {
        return `## ${b.heading_2.rich_text?.map((t: AnyProps) => t.plain_text).join("") ?? ""}`
      }
      if (b.type === "bulleted_list_item") {
        return `- ${b.bulleted_list_item.rich_text?.map((t: AnyProps) => t.plain_text).join("") ?? ""}`
      }
      return ""
    })
    .filter(Boolean)
    .join("\n")
}
