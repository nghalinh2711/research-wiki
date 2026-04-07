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

const NOTION_TEXT_LIMIT = 2000

function truncate(text: string, limit = NOTION_TEXT_LIMIT): string {
  if (text.length <= limit) return text
  return text.slice(0, limit - 3) + "..."
}

function getTitle(props: AnyProps, field: string): string {
  return props[field]?.title?.[0]?.plain_text ?? ""
}

function getRichText(props: AnyProps, field: string): string {
  return props[field]?.rich_text?.[0]?.plain_text ?? ""
}

/** Cache: databaseId → name of the title-type property */
const _titlePropCache = new Map<string, string>()

/** Returns the name of the title-type property for a given database. */
async function getTitlePropertyName(databaseId: string): Promise<string> {
  const cached = _titlePropCache.get(databaseId)
  if (cached) return cached

  const schema = await getNotion().databases.retrieve({ database_id: databaseId })
  const props = schema.properties as AnyProps
  const titleEntry = Object.entries(props).find(([, v]) => v.type === "title")
  const name = titleEntry?.[0] ?? "Name"
  _titlePropCache.set(databaseId, name)
  return name
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
  const titleProp = await getTitlePropertyName(db().papers)
  return getNotion().pages.create({
    parent: { database_id: db().papers },
    properties: {
      [titleProp]: { title: [{ text: { content: params.title } }] },
      Authors: { rich_text: [{ text: { content: truncate(params.authors) } }] },
      Year: { number: params.year },
      Venue: { rich_text: [{ text: { content: truncate(params.venue) } }] },
      DOI: { url: params.doi || null },
      ZoteroKey: { rich_text: [{ text: { content: params.zoteroKey } }] },
      AbstractSummary: { rich_text: [{ text: { content: truncate(params.abstractSummary) } }] },
      KeyContribution: { rich_text: [{ text: { content: truncate(params.keyContribution) } }] },
      ThesisRelevance: { select: { name: params.thesisRelevance } },
      Tags: { multi_select: params.tags.map((t) => ({ name: t })) },
      Concepts: { relation: params.conceptIds.map((id) => ({ id })) },
      MethodUsed: { relation: params.methodIds.map((id) => ({ id })) },
      IngestedAt: { date: { start: new Date().toISOString() } },
    },
  })
}

export async function queryPapers(filter?: { title?: string }) {
  const titleProp = await getTitlePropertyName(db().papers)
  return queryDB(
    db().papers,
    filter?.title
      ? { property: titleProp, title: { contains: filter.title } }
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

export interface PaperSummary {
  id: string
  title: string
  abstractSummary: string
  keyContribution: string
  thesisRelevance: string
}

export async function listPaperSummaries(): Promise<PaperSummary[]> {
  const titleProp = await getTitlePropertyName(db().papers)
  const result = await queryDB(db().papers)
  return result.results.filter(isFullPage).map((page) => {
    const props = page.properties as AnyProps
    return {
      id: page.id,
      title: getTitle(props, titleProp),
      abstractSummary: getRichText(props, "AbstractSummary"),
      keyContribution: getRichText(props, "KeyContribution"),
      thesisRelevance:
        (props.ThesisRelevance as AnyProps)?.select?.name ?? "",
    }
  })
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
      Definition: { rich_text: [{ text: { content: truncate(definition) } }] },
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
      Definition: { rich_text: [{ text: { content: truncate(definition) } }] },
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

export async function updateMethodDescription(methodId: string, description: string) {
  return getNotion().pages.update({
    page_id: methodId,
    properties: {
      Description: { rich_text: [{ text: { content: truncate(description) } }] },
    },
  })
}

export async function getMethodWithPapers(methodId: string): Promise<{
  name: string
  paperTitles: string[]
}> {
  const page = (await getNotion().pages.retrieve({ page_id: methodId })) as AnyProps
  const props = page.properties as AnyProps
  const name = getTitle(props, "Name")
  const relations: { id: string }[] = (props.UsedIn as AnyProps)?.relation ?? []

  const titleProp = await getTitlePropertyName(db().papers)
  const paperTitles: string[] = []
  for (const rel of relations.slice(0, 10)) {
    try {
      const p = (await getNotion().pages.retrieve({ page_id: rel.id })) as AnyProps
      paperTitles.push(getTitle(p.properties as AnyProps, titleProp))
    } catch { /* page may be archived */ }
  }
  return { name, paperTitles }
}

export async function getConceptWithPapers(conceptId: string): Promise<{
  name: string
  definition: string
  paperSummaries: { title: string; summary: string }[]
}> {
  const page = (await getNotion().pages.retrieve({ page_id: conceptId })) as AnyProps
  const props = page.properties as AnyProps
  const name = getTitle(props, "Name")
  const definition = getRichText(props, "Definition")
  const relations: { id: string }[] = (props.RelatedPapers as AnyProps)?.relation ?? []

  const titleProp = await getTitlePropertyName(db().papers)
  const paperSummaries: { title: string; summary: string }[] = []
  for (const rel of relations.slice(0, 10)) {
    try {
      const p = (await getNotion().pages.retrieve({ page_id: rel.id })) as AnyProps
      const pProps = p.properties as AnyProps
      paperSummaries.push({
        title: getTitle(pProps, titleProp),
        summary: getRichText(pProps, "AbstractSummary"),
      })
    } catch { /* page may be archived */ }
  }
  return { name, definition, paperSummaries }
}

export async function getPaperZoteroKey(pageId: string): Promise<string> {
  const page = (await getNotion().pages.retrieve({ page_id: pageId })) as AnyProps
  return getRichText(page.properties as AnyProps, "ZoteroKey")
}

export async function updateMethodUsedIn(methodId: string, paperIdToAdd: string) {
  const n = getNotion()
  const page = (await n.pages.retrieve({ page_id: methodId })) as AnyProps
  const existingRelations: { id: string }[] = page.properties?.UsedIn?.relation ?? []
  await n.pages.update({
    page_id: methodId,
    properties: {
      UsedIn: {
        relation: [...existingRelations, { id: paperIdToAdd }],
      },
    },
  })
}

// --- Contradictions ---

export async function createContradiction(
  summary: string,
  paperAId: string,
  paperBId: string,
  topic: string,
  severity: "Minor" | "Significant" | "Fundamental" = "Minor",
) {
  return getNotion().pages.create({
    parent: { database_id: db().contradictions },
    properties: {
      Summary: { title: [{ text: { content: summary } }] },
      PaperA: { relation: [{ id: paperAId }] },
      PaperB: { relation: [{ id: paperBId }] },
      Topic: { rich_text: [{ text: { content: truncate(topic) } }] },
      Resolution: { rich_text: [{ text: { content: "" } }] },
      Severity: { select: { name: severity } },
    },
  })
}

// --- Page lifecycle ---

export async function archivePage(pageId: string) {
  return getNotion().pages.update({ page_id: pageId, archived: true })
}

export async function isPageArchived(pageId: string): Promise<boolean> {
  try {
    const page = await getNotion().pages.retrieve({ page_id: pageId })
    return (page as AnyProps).archived === true
  } catch {
    return true
  }
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
      if (b.type === "heading_3") {
        return `### ${b.heading_3.rich_text?.map((t: AnyProps) => t.plain_text).join("") ?? ""}`
      }
      if (b.type === "bulleted_list_item") {
        return `- ${b.bulleted_list_item.rich_text?.map((t: AnyProps) => t.plain_text).join("") ?? ""}`
      }
      if (b.type === "numbered_list_item") {
        return `1. ${b.numbered_list_item.rich_text?.map((t: AnyProps) => t.plain_text).join("") ?? ""}`
      }
      return ""
    })
    .filter(Boolean)
    .join("\n")
}

export async function getPaperAsContext(pageId: string): Promise<string> {
  const page = (await getNotion().pages.retrieve({ page_id: pageId })) as AnyProps
  const props = page.properties as AnyProps
  const titleProp = await getTitlePropertyName(db().papers)
  const title = getTitle(props, titleProp)
  const authors = getRichText(props, "Authors")
  const year = (props.Year as AnyProps)?.number ?? ""
  const summary = getRichText(props, "AbstractSummary")
  const contribution = getRichText(props, "KeyContribution")
  const relevance = (props.ThesisRelevance as AnyProps)?.select?.name ?? ""
  const bodyContent = await getPageContent(pageId)

  const parts = [
    `## ${title}`,
    authors && `Authors: ${authors}`,
    year && `Year: ${year}`,
    relevance && `Thesis Relevance: ${relevance}`,
    summary && `Summary: ${summary}`,
    contribution && `Key Contribution: ${contribution}`,
    bodyContent,
  ]
  return parts.filter(Boolean).join("\n")
}

// --- Concept queries for chat ---

export async function queryConcepts(query: string) {
  return queryDB(db().concepts, {
    property: "Name",
    title: { contains: query },
  })
}

export async function getConceptAsContext(pageId: string): Promise<string> {
  const page = (await getNotion().pages.retrieve({ page_id: pageId })) as AnyProps
  const props = page.properties as AnyProps
  const name = getTitle(props, "Name")
  const definition = getRichText(props, "Definition")
  const role = (props.ThesisRole as AnyProps)?.select?.name ?? ""

  return [
    `## Concept: ${name}`,
    role && `Role: ${role}`,
    definition && `Definition: ${definition}`,
  ].filter(Boolean).join("\n")
}

export async function queryPapersByKeywords(keywords: string[]): Promise<PaperSummary[]> {
  const titleProp = await getTitlePropertyName(db().papers)
  const allResults: PaperSummary[] = []
  const seenIds = new Set<string>()

  for (const keyword of keywords.slice(0, 5)) {
    const result = await queryDB(
      db().papers,
      { property: titleProp, title: { contains: keyword } },
      10,
    )
    for (const page of result.results.filter(isFullPage)) {
      if (seenIds.has(page.id)) continue
      seenIds.add(page.id)
      const props = page.properties as AnyProps
      allResults.push({
        id: page.id,
        title: getTitle(props, titleProp),
        abstractSummary: getRichText(props, "AbstractSummary"),
        keyContribution: getRichText(props, "KeyContribution"),
        thesisRelevance: (props.ThesisRelevance as AnyProps)?.select?.name ?? "",
      })
    }
  }
  return allResults
}

// --- Synthesis ---

export interface SynthesisNote {
  id: string
  title: string
  content: string
  type: string
  createdAt: string
  url: string
}

export async function querySynthesisNotes(): Promise<SynthesisNote[]> {
  const result = await queryDB(db().synthesis)
  const titleProp = await getTitlePropertyName(db().synthesis)
  return result.results.filter(isFullPage).map((page) => {
    const props = page.properties as AnyProps
    return {
      id: page.id,
      title: getTitle(props, titleProp),
      content: getRichText(props, "Content"),
      type: (props.Type as AnyProps)?.select?.name ?? "",
      createdAt: (props.CreatedAt as AnyProps)?.date?.start ?? page.created_time,
      url: (page as AnyProps).url ?? "",
    }
  })
}

export async function createSynthesisNote(
  title: string,
  content: string,
  type: "Chapter Draft" | "Open Question" | "Gap" | "Insight",
  paperIds: string[] = [],
  conceptIds: string[] = [],
) {
  const titleProp = await getTitlePropertyName(db().synthesis)
  return getNotion().pages.create({
    parent: { database_id: db().synthesis },
    properties: {
      [titleProp]: { title: [{ text: { content: title } }] },
      Content: { rich_text: [{ text: { content: truncate(content) } }] },
      Type: { select: { name: type } },
      LinkedPapers: { relation: paperIds.map((id) => ({ id })) },
      LinkedConcepts: { relation: conceptIds.map((id) => ({ id })) },
      CreatedAt: { date: { start: new Date().toISOString() } },
    },
  })
}

// --- Methods list (for health check) ---

export interface MethodSummary {
  id: string
  name: string
  description: string
  usedInCount: number
}

export async function listMethods(): Promise<MethodSummary[]> {
  const result = await queryDB(db().methods)
  return result.results.filter(isFullPage).map((page) => {
    const props = page.properties as AnyProps
    return {
      id: page.id,
      name: getTitle(props, "Name"),
      description: getRichText(props, "Description"),
      usedInCount: (props.UsedIn as AnyProps)?.relation?.length ?? 0,
    }
  })
}

// --- Contradictions list (for health check) ---

export interface ContradictionSummary {
  id: string
  summary: string
  topic: string
  resolution: string
  severity: string
}

export async function listContradictions(): Promise<ContradictionSummary[]> {
  const result = await queryDB(db().contradictions)
  return result.results.filter(isFullPage).map((page) => {
    const props = page.properties as AnyProps
    return {
      id: page.id,
      summary: getTitle(props, "Summary"),
      topic: getRichText(props, "Topic"),
      resolution: getRichText(props, "Resolution"),
      severity: (props.Severity as AnyProps)?.select?.name ?? "",
    }
  })
}
