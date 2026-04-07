"use client"

import { useRef, useEffect } from "react"
import Markdown from "react-markdown"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  saved?: boolean
}

interface ChatWindowProps {
  messages: ChatMessage[]
  streaming: boolean
  onSave?: (messageId: string) => void
  savingId?: string | null
}

export default function ChatWindow({ messages, streaming, onSave, savingId }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streaming])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-zinc-400 dark:text-zinc-500">
            Ask a question about your research
          </p>
          <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-600">
            Answers are grounded in your Notion wiki and cite papers by name.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-indigo-600 text-white"
                : "border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            }`}
          >
            {msg.role === "assistant" ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown>{msg.content}</Markdown>
                {streaming && messages[messages.length - 1]?.id === msg.id && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-500" />
                )}
              </div>
            ) : (
              <p className="text-sm leading-relaxed">{msg.content}</p>
            )}

            {msg.role === "assistant" && !streaming && onSave && (
              <div className="mt-2 flex justify-end border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <button
                  onClick={() => onSave(msg.id)}
                  disabled={msg.saved || savingId === msg.id}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    msg.saved
                      ? "text-green-600 dark:text-green-400"
                      : savingId === msg.id
                        ? "text-zinc-400"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  {msg.saved
                    ? "Saved to Notion"
                    : savingId === msg.id
                      ? "Saving..."
                      : "Save to Notion"}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
