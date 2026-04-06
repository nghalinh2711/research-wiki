"use client"

import type { IngestLLMResult } from "@/lib/prompts"

interface IngestStatusProps {
  status: "idle" | "loading" | "success" | "error"
  paperTitle?: string
  analysis?: IngestLLMResult
  error?: string
}

export default function IngestStatus({ status, paperTitle, analysis, error }: IngestStatusProps) {
  if (status === "idle") return null

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {status === "loading" && (
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Ingesting paper...
            </p>
            {paperTitle && (
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{paperTitle}</p>
            )}
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-red-100 text-center text-sm leading-5 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            !
          </div>
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Ingest failed</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
          </div>
        </div>
      )}

      {status === "success" && analysis && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-green-100 text-center text-sm leading-5 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              ✓
            </div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Successfully ingested
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Summary
            </h4>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {analysis.abstractSummary}
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Key Contribution
            </h4>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {analysis.keyContribution}
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Relevance
              </h4>
              <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                {analysis.thesisRelevance}
              </span>
            </div>

            {analysis.conceptsUsed.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Concepts
                </h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {analysis.conceptsUsed.map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.newConcepts.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  New Concepts
                </h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {analysis.newConcepts.map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.methodsUsed.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Methods
                </h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {analysis.methodsUsed.map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {analysis.potentialContradictions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-red-400">
                Potential Contradictions
              </h4>
              <ul className="mt-1 space-y-1">
                {analysis.potentialContradictions.map((c, i) => (
                  <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">{c.withPaper}</span> — {c.on}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
