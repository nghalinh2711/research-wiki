"use client"

import { useEffect, useState, useCallback } from "react"

interface HealthIssue {
  severity: "critical" | "warning" | "info"
  type: string
  title: string
  description: string
  pageId?: string
  fixable?: boolean
  fixLabel?: string
}

interface HealthSummary {
  papers: number
  concepts: number
  methods: number
  contradictions: number
  syntheses: number
  issues: number
}

interface HealthData {
  summary: HealthSummary
  issues: HealthIssue[]
}

const SEVERITY_CONFIG = {
  critical: {
    label: "Critical",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
  warning: {
    label: "Warning",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  info: {
    label: "Info",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  },
}

export default function WikiHealthPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set())
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set())
  const [fixErrors, setFixErrors] = useState<Map<string, string>>(new Map())
  const [fixingAll, setFixingAll] = useState(false)
  const [reingestQueue, setReingestQueue] = useState<{ key: string; title: string }[]>([])

  const runCheck = useCallback(async () => {
    setLoading(true)
    setError(null)
    setFixedIds(new Set())
    setFixErrors(new Map())
    setReingestQueue([])
    try {
      const res = await fetch("/api/wiki-health")
      if (!res.ok) throw new Error("Health check failed")
      const result = await res.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    runCheck()
  }, [runCheck])

  const issueKey = (issue: HealthIssue, idx: number) => `${issue.type}-${issue.pageId ?? idx}`

  const fixSingle = useCallback(async (issue: HealthIssue, idx: number) => {
    if (!issue.pageId || !issue.fixable) return
    const key = issueKey(issue, idx)
    setFixingIds((prev) => new Set(prev).add(key))
    setFixErrors((prev) => { const m = new Map(prev); m.delete(key); return m })

    try {
      const res = await fetch("/api/wiki-health/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: issue.type, pageId: issue.pageId }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Fix failed")

      setFixedIds((prev) => new Set(prev).add(key))

      if (result.action === "archived_for_reingest" && result.detail) {
        setReingestQueue((prev) => [...prev, { key: result.detail, title: issue.title }])
      }
    } catch (err) {
      setFixErrors((prev) => new Map(prev).set(key, (err as Error).message))
    } finally {
      setFixingIds((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }, [])

  const fixAll = useCallback(async () => {
    if (!data) return
    const fixable = data.issues.filter((i) => i.fixable && i.pageId)
    if (fixable.length === 0) return

    setFixingAll(true)
    for (let idx = 0; idx < data.issues.length; idx++) {
      const issue = data.issues[idx]
      if (!issue.fixable || !issue.pageId) continue
      const key = issueKey(issue, idx)
      if (fixedIds.has(key)) continue
      await fixSingle(issue, idx)
    }
    setFixingAll(false)
  }, [data, fixedIds, fixSingle])

  const triggerReingest = useCallback(async (zoteroKey: string) => {
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: zoteroKey }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || "Re-ingest failed")
      }
      setReingestQueue((prev) => prev.filter((r) => r.key !== zoteroKey))
    } catch (err) {
      console.error("Re-ingest failed:", err)
    }
  }, [])

  const grouped = data
    ? {
        critical: data.issues.filter((i) => i.severity === "critical"),
        warning: data.issues.filter((i) => i.severity === "warning"),
        info: data.issues.filter((i) => i.severity === "info"),
      }
    : null

  const fixableCount = data?.issues.filter(
    (i, idx) => i.fixable && i.pageId && !fixedIds.has(issueKey(i, idx)),
  ).length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Wiki Health</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Check your research wiki for gaps, orphans, and stale entries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fixableCount > 0 && (
            <button
              onClick={fixAll}
              disabled={fixingAll || loading}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
            >
              {fixingAll ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                  Fixing...
                </span>
              ) : (
                `Fix All (${fixableCount})`
              )}
            </button>
          )}
          <button
            onClick={runCheck}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Re-check"}
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="ml-3 text-sm text-zinc-500">Running health check...</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Re-ingest queue */}
      {reingestQueue.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
          <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">
            Papers ready for re-ingest
          </h3>
          <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-500">
            These papers were archived. Click to re-run the ingest pipeline with fresh LLM analysis.
          </p>
          <div className="mt-3 space-y-2">
            {reingestQueue.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-lg border border-indigo-200 bg-white px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950/50"
              >
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.title}</span>
                <button
                  onClick={() => triggerReingest(item.key)}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Re-ingest
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Papers", count: data.summary.papers },
              { label: "Concepts", count: data.summary.concepts },
              { label: "Methods", count: data.summary.methods },
              { label: "Contradictions", count: data.summary.contradictions },
              { label: "Synthesis Notes", count: data.summary.syntheses },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {stat.count}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{stat.label}</p>
              </div>
            ))}
          </div>

          {data.issues.length === 0 ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-900/20">
              <p className="text-lg font-medium text-green-700 dark:text-green-400">
                All clear! No issues found.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {(["critical", "warning", "info"] as const).map((severity) => {
                const issues = grouped?.[severity] ?? []
                if (issues.length === 0) return null
                const config = SEVERITY_CONFIG[severity]
                return (
                  <div key={severity}>
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${config.badge}`}
                      >
                        {config.label}
                      </span>
                      <span>
                        {issues.length} issue{issues.length !== 1 ? "s" : ""}
                      </span>
                    </h2>
                    <div className="space-y-2">
                      {issues.map((issue, localIdx) => {
                        const globalIdx = data.issues.indexOf(issue)
                        const key = issueKey(issue, globalIdx)
                        const isFixed = fixedIds.has(key)
                        const isFixing = fixingIds.has(key)
                        const fixError = fixErrors.get(key)

                        return (
                          <div
                            key={`${issue.type}-${localIdx}`}
                            className={`rounded-lg border p-4 ${isFixed ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : `${config.bg} ${config.border}`}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-sm font-medium ${isFixed ? "text-green-700 line-through dark:text-green-400" : config.text}`}
                                >
                                  {issue.title}
                                </p>
                                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                  {isFixed ? "Fixed!" : issue.description}
                                </p>
                                {fixError && (
                                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    Fix failed: {fixError}
                                  </p>
                                )}
                              </div>
                              {issue.fixable && issue.pageId && !isFixed && (
                                <button
                                  onClick={() => fixSingle(issue, globalIdx)}
                                  disabled={isFixing || fixingAll}
                                  className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                >
                                  {isFixing ? (
                                    <span className="flex items-center gap-1.5">
                                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
                                      Fixing...
                                    </span>
                                  ) : (
                                    issue.fixLabel ?? "Fix"
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
