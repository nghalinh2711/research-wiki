import Link from "next/link"

const FEATURES = [
  {
    title: "Browse Library",
    description: "Explore your Zotero collections and papers with full metadata and annotations.",
    href: "/library",
    icon: "📚",
  },
  {
    title: "Ingest Papers",
    description:
      "Select a paper from Zotero, run the LLM pipeline, and write structured data to your Notion wiki.",
    href: "/ingest",
    icon: "⚙️",
  },
  {
    title: "Chat (coming soon)",
    description:
      "Ask questions about your research. Answers are grounded in your wiki and cite papers by name.",
    href: "/chat",
    icon: "💬",
  },
]

export default function Home() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Research Wiki
        </h1>
        <p className="mt-2 max-w-xl text-base text-zinc-500 dark:text-zinc-400">
          Memory Management for AI Agents — an automated research wiki powered by Zotero, Notion,
          and GitHub Copilot.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <span className="text-2xl">{f.icon}</span>
            <h2 className="mt-3 text-lg font-semibold text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400">
              {f.title}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{f.description}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Quick Setup</h2>
        <ol className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <span className="font-mono text-indigo-600 dark:text-indigo-400">1.</span> Copy{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
              .env.local.example
            </code>{" "}
            to{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
              .env.local
            </code>{" "}
            and fill in your API keys
          </li>
          <li>
            <span className="font-mono text-indigo-600 dark:text-indigo-400">2.</span> Create the 5
            Notion databases (Papers, Concepts, Methods, Contradictions, Synthesis) and add their
            IDs
          </li>
          <li>
            <span className="font-mono text-indigo-600 dark:text-indigo-400">3.</span> Browse your
            Zotero library and start ingesting papers
          </li>
        </ol>
      </section>
    </div>
  )
}
