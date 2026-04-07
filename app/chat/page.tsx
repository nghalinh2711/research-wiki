"use client"

import { useState, useCallback, useRef } from "react"
import ChatWindow, { type ChatMessage } from "@/components/ChatWindow"

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    }
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput("")
    setStreaming(true)

    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Request failed (${res.status})`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error("No response stream")

      let accumulated = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        const snapshot = accumulated
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: snapshot } : m)),
        )
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `Error: ${(err as Error).message}` }
            : m,
        ),
      )
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, streaming, messages])

  const handleSave = useCallback(async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId)
    if (!msg || msg.role !== "assistant") return

    setSavingId(messageId)
    try {
      const res = await fetch("/api/chat/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: msg.content,
          type: "Insight",
        }),
      })

      if (!res.ok) throw new Error("Failed to save")

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, saved: true } : m)),
      )
    } catch (err) {
      console.error("Save failed:", err)
    } finally {
      setSavingId(null)
    }
  }, [messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Chat</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Ask questions about your research. Answers are grounded in your Notion wiki.
        </p>
      </div>

      <ChatWindow
        messages={messages}
        streaming={streaming}
        onSave={handleSave}
        savingId={savingId}
      />

      <div className="mt-4 flex gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your research..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          className="shrink-0 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {streaming ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            "Send"
          )}
        </button>
      </div>
    </div>
  )
}
