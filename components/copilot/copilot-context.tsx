"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ChatItem, StreamEvent, ToolCall } from "./types";

interface CopilotCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  items: ChatItem[];
  busy: boolean;
  /** Bot slug of the client agent in use; null = the agency-wide copilot. */
  agent: string | null;
  /** Switch agent. Always starts a fresh conversation — see below. */
  setAgent: (client: string | null) => void;
  send: (text: string) => Promise<void>;
  decide: (toolUseId: string, approve: boolean) => Promise<void>;
  reset: () => void;
  /** Open the panel and ask about something on screen, in one call. Pass a bot
   *  slug to route the question to that client's agent. */
  askAbout: (prompt: string, client?: string | null) => void;
}

const Ctx = createContext<CopilotCtx | null>(null);

export function useCopilot(): CopilotCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCopilot must be used inside <CopilotProvider>");
  return v;
}

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [agent, setAgentState] = useState<string | null>(null);
  const threadId = useRef<string | null>(null);
  // Read inside send() so a switch made between renders is seen immediately;
  // state alone would send one message to the previous agent.
  const agentRef = useRef<string | null>(null);
  /** Whether the streaming text should keep filling the last bubble or start a
   *  new one (a tool round ends the current bubble). */
  const openBubble = useRef(false);

  const appendText = useCallback((text: string) => {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (openBubble.current && last?.kind === "assistant") {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      openBubble.current = true;
      return [...prev, { kind: "assistant", text, tools: [], streaming: true }];
    });
  }, []);

  const addTool = useCallback((call: ToolCall) => {
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (last?.kind === "assistant") {
        return [...prev.slice(0, -1), { ...last, tools: [...last.tools, call] }];
      }
      openBubble.current = true;
      return [...prev, { kind: "assistant", text: "", tools: [call], streaming: true }];
    });
  }, []);

  const updateTool = useCallback((id: string, patch: Partial<ToolCall>) => {
    setItems((prev) =>
      prev.map((it) =>
        it.kind === "assistant"
          ? { ...it, tools: it.tools.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
          : it
      )
    );
  }, []);

  const finishStreaming = useCallback(() => {
    openBubble.current = false;
    setItems((prev) =>
      prev.map((it) => (it.kind === "assistant" ? { ...it, streaming: false } : it))
    );
  }, []);

  const consume = useCallback(
    async (body: unknown) => {
      setBusy(true);
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok || !res.body) {
          let message = `שגיאה ${res.status}`;
          try {
            message = ((await res.json()) as { error?: string }).error ?? message;
          } catch {
            /* non-JSON error body */
          }
          setItems((prev) => [...prev, { kind: "error", message }]);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let evt: StreamEvent;
            try {
              evt = JSON.parse(line.slice(5).trim()) as StreamEvent;
            } catch {
              continue;
            }

            switch (evt.type) {
              case "thread":
                threadId.current = evt.threadId;
                break;
              case "text":
                appendText(evt.text);
                break;
              case "tool_start":
                addTool({ id: evt.id, name: evt.name, status: "running" });
                break;
              case "tool_result":
                updateTool(evt.id, {
                  status: evt.ok ? "ok" : "error",
                  preview: evt.preview,
                });
                // Tool output lands mid-turn; the model's next words are a fresh thought.
                openBubble.current = false;
                setItems((prev) =>
                  prev.map((it) =>
                    it.kind === "approval" && it.toolUseId === evt.id && !evt.ok
                      ? { ...it, failed: evt.preview }
                      : it
                  )
                );
                break;
              case "approval_required":
                openBubble.current = false;
                setItems((prev) => [
                  ...prev,
                  {
                    kind: "approval",
                    toolUseId: evt.id,
                    name: evt.name,
                    summary: evt.summary,
                  },
                ]);
                break;
              case "error":
                setItems((prev) => [...prev, { kind: "error", message: evt.message }]);
                break;
              case "done":
                break;
            }
          }
        }
      } catch (e) {
        setItems((prev) => [
          ...prev,
          { kind: "error", message: e instanceof Error ? e.message : String(e) },
        ]);
      } finally {
        finishStreaming();
        setBusy(false);
      }
    },
    [appendText, addTool, updateTool, finishStreaming]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setItems((prev) => [...prev, { kind: "user", text: trimmed }]);
      openBubble.current = false;
      await consume({
        kind: "message",
        text: trimmed,
        ...(threadId.current
          ? { threadId: threadId.current }
          : // Only sent when opening a NEW thread — the server pins the agent at
            // creation and ignores this field thereafter.
            agentRef.current
            ? { client: agentRef.current }
            : {}),
      });
    },
    [busy, consume]
  );

  const decide = useCallback(
    async (toolUseId: string, approve: boolean) => {
      if (busy || !threadId.current) return;
      setItems((prev) =>
        prev.map((it) =>
          it.kind === "approval" && it.toolUseId === toolUseId
            ? { ...it, decided: approve ? "approved" : "rejected" }
            : it
        )
      );
      openBubble.current = false;
      await consume({ kind: "decision", threadId: threadId.current, toolUseId, approve });
    },
    [busy, consume]
  );

  const reset = useCallback(() => {
    threadId.current = null;
    openBubble.current = false;
    setItems([]);
  }, []);

  /**
   * Switching agent always clears the conversation. A thread is bound to one
   * client server-side at creation, so continuing an existing thread under a
   * new agent is not a thing that can happen — carrying the transcript across
   * would just show a history the new agent cannot actually act on.
   */
  const setAgent = useCallback(
    (client: string | null) => {
      if (agentRef.current === client) return;
      agentRef.current = client;
      setAgentState(client);
      reset();
    },
    [reset]
  );

  const askAbout = useCallback(
    (prompt: string, client?: string | null) => {
      if (client !== undefined) setAgent(client);
      setOpen(true);
      void send(prompt);
    },
    [send, setAgent]
  );

  const value = useMemo(
    () => ({ open, setOpen, items, busy, agent, setAgent, send, decide, reset, askAbout }),
    [open, items, busy, agent, setAgent, send, decide, reset, askAbout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
