"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Markdown from "react-markdown"

interface SynthesisNote {
  id: string
  title: string
  content: string
  type: string
  createdAt: string
  url: string
}

const TYPE_STYLES: Record<string, string> = {
  "Chapter Draft": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "Open Question": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Gap: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Insight: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
}

export default function SynthesisPage() {
  const [notes, setNotes] = useState<SynthesisNote[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [generatedText, setGeneratedText] = useState("")
  const [saving, setSaving] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/synthesis")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setNotes(data.notes)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleGenerate = useCallback(async (type: "chapter-draft" | "gap-analysis") => {
    setGenerating(type)
    setGeneratedText("")

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/synthesis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Generation failed")
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error("No response stream")

      let accumulated = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setGeneratedText(accumulated)
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setGeneratedText(`Error: ${(err as Error).message}`)
      }
    } finally {
      setGenerating(null)
      abortRef.current = null
    }
  }, [])

  const handleSaveGenerated = useCallback(async () => {
    if (!generatedText || saving) return
    setSaving(true)
    try {
      const title = generatedText.match(/^#\s+(.+)/m)?.[1] || "Generated Draft"
      const res = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: generatedText.slice(0, 2000),
          type: "Chapter Draft",
        }),
      })
      if (!res.ok) throw new Error("Failed to save")
      await fetchNotes()
      setGeneratedText("")
    } catch (err) {
      console.error("Save error:", err)
    } finally {
      setSaving(false)
    }
  }, [generatedText, saving, fetchNotes])

  const grouped = {
    "Chapter Draft": notes.filter((n) => n.type === "Chapter Draft"),
    "Open Question": notes.filter((n) => n.type === "Open Question"),
    Gap: notes.filter((n) => n.type === "Gap"),
    Insight: notes.filter((n) => n.type === "Insight"),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Synthesis</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          View your thesis notes and generate literature review drafts.
        </p>
      </div>

      {/* Generate actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleGenerate("chapter-draft")}
          disabled={generating !== null}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {generating === "chapter-draft" ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Generating...
            </span>
          ) : (
            "Generate Literature Review"
          )}
        </button>
        <button
          onClick={() => handleGenerate("gap-analysis")}
          disabled={generating !== null}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {generating === "gap-analysis" ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
              Analyzing...
            </span>
          ) : (
            "Run Gap Analysis"
          )}
        </button>
      </div>

      {/* Generated output */}
      {generatedText && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Generated Output
            </h2>
            <button
              onClick={handleSaveGenerated}
              disabled={saving || generating !== null}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save to Notion"}
            </button>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{generatedText}</Markdown>
            {generating && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-500" />
            )}
          </div>
        </div>
      )}

      {/* Existing notes */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="ml-3 text-sm text-zinc-500">Loading notes...</span>
        </div>
      ) : notes.length === 0 && !generatedText ? (
        <div className="py-20 text-center">
          <p className="text-zinc-400">
            No synthesis notes yet. Generate a literature review or save insights from chat.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {(Object.entries(grouped) as [string, SynthesisNote[]][]).map(
            ([type, typeNotes]) => {
              if (typeNotes.length === 0) return null
              return (
                <div key={type}>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[type] || "bg-zinc-100 text-zinc-600"}`}
                    >
                      {type}
                    </span>
                    <span>
                      {typeNotes.length} note{typeNotes.length !== 1 ? "s" : ""}
                    </span>
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {typeNotes.map((note) => (
                      <a
                        key={note.id}
                        href={note.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                      >
                        <h3 className="text-base font-semibold text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400">
                          {note.title}
                        </h3>
                        {note.content && (
                          <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                            {note.content}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-zinc-400">
                          {new Date(note.createdAt).toLocaleDateString()}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )
            },
          )}
        </div>
      )}
    </div>
  )
}
