"use client"

import { useEffect, useState, useCallback } from "react"
import PaperCard from "@/components/PaperCard"
import IngestStatus from "@/components/IngestStatus"
import type { ZoteroPaper } from "@/lib/zotero"
import type { IngestLLMResult } from "@/lib/prompts"

export default function IngestPage() {
  const [papers, setPapers] = useState<ZoteroPaper[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [ingestState, setIngestState] = useState<{
    status: "idle" | "loading" | "success" | "error"
    paperTitle?: string
    analysis?: IngestLLMResult
    error?: string
  }>({ status: "idle" })
  const [ingestedKeys, setIngestedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/zotero/library")
        if (!res.ok) throw new Error("Failed to fetch")
        const data = await res.json()
        setPapers(data.papers)
      } catch {
        // Handled silently — the library page shows errors
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleIngest = useCallback(async (paper: ZoteroPaper) => {
    setIngestState({ status: "loading", paperTitle: paper.title })

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: paper.key }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          setIngestedKeys((prev) => new Set(prev).add(paper.key))
          setIngestState({
            status: "error",
            paperTitle: paper.title,
            error: "This paper has already been ingested.",
          })
          return
        }
        throw new Error(data.error || "Ingest failed")
      }

      setIngestedKeys((prev) => new Set(prev).add(paper.key))
      setIngestState({
        status: "success",
        paperTitle: paper.title,
        analysis: data.analysis,
      })
    } catch (err) {
      setIngestState({
        status: "error",
        paperTitle: paper.title,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }, [])

  const filtered = papers.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.authors.some((a) => a.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Ingest Papers</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Select a paper to run the LLM pipeline and write to your Notion wiki.
        </p>
      </div>

      <IngestStatus
        status={ingestState.status}
        paperTitle={ingestState.paperTitle}
        analysis={ingestState.analysis}
        error={ingestState.error}
      />

      <div>
        <input
          type="text"
          placeholder="Search by title or author..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="ml-3 text-sm text-zinc-500">Loading papers...</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-zinc-400">
            {search ? "No papers match your search." : "No papers found in your Zotero library."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((paper) => (
            <PaperCard
              key={paper.key}
              paper={paper}
              onIngest={handleIngest}
              ingested={ingestedKeys.has(paper.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
