"use client"

import type { ZoteroPaper } from "@/lib/zotero"

interface PaperCardProps {
  paper: ZoteroPaper
  onIngest?: (paper: ZoteroPaper) => void
  ingested?: boolean
}

export default function PaperCard({ paper, onIngest, ingested }: PaperCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
            {paper.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {paper.authors.join(", ")}
            {paper.year > 0 && ` (${paper.year})`}
          </p>
          {paper.venue && (
            <p className="mt-0.5 text-xs text-zinc-400 italic dark:text-zinc-500">
              {paper.venue}
            </p>
          )}
        </div>
        {onIngest && (
          <button
            onClick={() => onIngest(paper)}
            disabled={ingested}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              ingested
                ? "cursor-default bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800"
            }`}
          >
            {ingested ? "Ingested" : "Ingest"}
          </button>
        )}
      </div>

      {paper.abstract && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          {paper.abstract}
        </p>
      )}

      {paper.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {paper.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {tag}
            </span>
          ))}
          {paper.tags.length > 6 && (
            <span className="text-xs text-zinc-400">+{paper.tags.length - 6} more</span>
          )}
        </div>
      )}

      {paper.annotations.length > 0 && (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          {paper.annotations.length} annotation{paper.annotations.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  )
}
