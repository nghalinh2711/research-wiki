"use client"

import { useEffect, useState } from "react"
import PaperCard from "@/components/PaperCard"
import type { ZoteroPaper } from "@/lib/zotero"

interface Collection {
  key: string
  name: string
  parentCollection: string | false
}

export default function LibraryPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [papers, setPapers] = useState<ZoteroPaper[]>([])
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLibrary()
  }, [])

  async function fetchLibrary(collectionKey?: string) {
    setLoading(true)
    setError(null)
    try {
      const params = collectionKey ? `?collection=${collectionKey}` : ""
      const res = await fetch(`/api/zotero/library${params}`)
      if (!res.ok) throw new Error("Failed to fetch library")
      const data = await res.json()
      if (data.collections) setCollections(data.collections)
      setPapers(data.papers)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  function handleCollectionClick(key: string | null) {
    setSelectedCollection(key)
    if (key) {
      fetchLibrary(key)
    } else {
      fetchLibrary()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Zotero Library</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Browse your collections and papers. Click &quot;Ingest&quot; to process a paper into your Notion wiki.
        </p>
      </div>

      {collections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleCollectionClick(null)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              selectedCollection === null
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            All
          </button>
          {collections.map((c) => (
            <button
              key={c.key}
              onClick={() => handleCollectionClick(c.key)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                selectedCollection === c.key
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="ml-3 text-sm text-zinc-500">Loading library...</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && papers.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-zinc-400">No papers found. Make sure your Zotero API key and user ID are configured.</p>
        </div>
      )}

      {!loading && !error && papers.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            {papers.length} paper{papers.length !== 1 ? "s" : ""}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {papers.map((paper) => (
              <PaperCard key={paper.key} paper={paper} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
