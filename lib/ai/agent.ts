// ── Agent loop ────────────────────────────────────────────────────────────────
// Streams a Claude turn, executes read tools inline, and STOPS at any write tool
// that has not been approved. The approval gate lives here rather than in the
// prompt: `approvedToolUseIds` is the only thing that can let a write run, and
// the caller only puts an id in that set after the user clicked approve.
import { env } from "../env";
import { allTools, anthropicTools, executeTool, getTool, summarizeTool } from "./tools/registry";
import type { Session } from "../auth";

export const AGENT_MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 8;

// ── Anthropic wire types (only the parts we use) ─────────────────────────────
export interface TextBlock {
  type: "text";
  text: string;
}
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface AgentMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; ok: boolean; preview: string }
  | { type: "approval_required"; id: string; name: string; input: unknown; summary: string }
  | { type: "message"; message: AgentMessage }
  | { type: "done" }
  | { type: "error"; message: string };

interface StreamedTurn {
  blocks: ContentBlock[];
  stopReason: string | null;
}

/** One streaming call to the Messages API. Yields text deltas as they arrive and
 *  returns the assembled assistant content blocks. */
async function* streamTurn(
  messages: AgentMessage[],
  system: string,
  onDone: (t: StreamedTurn) => void
): AsyncGenerator<string> {
  const key = env.anthropicKey();
  if (!key) throw new Error("AI לא מוגדר (חסר ANTHROPIC_API_KEY)");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: AGENT_MODEL,
      max_tokens: 4096,
      system,
      tools: anthropicTools(),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const blocks: ContentBlock[] = [];
  // tool_use inputs arrive as a stream of JSON fragments that only parse once complete.
  const partialJson = new Map<number, string>();
  let stopReason: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; keep any trailing partial frame.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      let evt: Record<string, any>;
      try {
        evt = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue;
      }

      switch (evt.type) {
        case "content_block_start": {
          const idx = evt.index as number;
          const cb = evt.content_block;
          if (cb?.type === "text") {
            blocks[idx] = { type: "text", text: "" };
          } else if (cb?.type === "tool_use") {
            blocks[idx] = { type: "tool_use", id: cb.id, name: cb.name, input: {} };
            partialJson.set(idx, "");
          }
          break;
        }
        case "content_block_delta": {
          const idx = evt.index as number;
          if (evt.delta?.type === "text_delta") {
            const block = blocks[idx];
            if (block?.type === "text") block.text += evt.delta.text;
            yield evt.delta.text as string;
          } else if (evt.delta?.type === "input_json_delta") {
            partialJson.set(idx, (partialJson.get(idx) ?? "") + (evt.delta.partial_json ?? ""));
          }
          break;
        }
        case "content_block_stop": {
          const idx = evt.index as number;
          const block = blocks[idx];
          if (block?.type === "tool_use") {
            const raw = partialJson.get(idx) ?? "";
            try {
              block.input = raw ? JSON.parse(raw) : {};
            } catch {
              block.input = {};
            }
          }
          break;
        }
        case "message_delta":
          stopReason = evt.delta?.stop_reason ?? stopReason;
          break;
        case "error":
          throw new Error(evt.error?.message ?? "Anthropic stream error");
      }
    }
  }

  onDone({ blocks: blocks.filter(Boolean), stopReason });
}

function preview(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

/** Tool output → the string the model sees back. Capped so one wide query can't
 *  blow the context window. */
function resultToContent(value: unknown): string {
  const s = JSON.stringify(value ?? null);
  return s.length > 20_000 ? `${s.slice(0, 20_000)}\n…[קוצר]` : s;
}

export interface RunAgentArgs {
  /** Full thread so far, loaded server-side. */
  messages: AgentMessage[];
  system: string;
  actor: Session | null;
  /** tool_use ids the user has explicitly approved. */
  approvedToolUseIds?: Set<string>;
  /** tool_use ids the user explicitly rejected — reported back to the model. */
  rejectedToolUseIds?: Set<string>;
}

/**
 * Drive the conversation to completion (or to the first unapproved write).
 * Emits `message` events for every message that must be persisted, in order, so
 * the caller can save the thread without reconstructing it.
 */
export async function* runAgent(args: RunAgentArgs): AsyncGenerator<AgentEvent> {
  const { system, actor } = args;
  const approved = args.approvedToolUseIds ?? new Set<string>();
  const rejected = args.rejectedToolUseIds ?? new Set<string>();
  const messages = [...args.messages];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let turn: StreamedTurn = { blocks: [], stopReason: null };
    try {
      for await (const chunk of streamTurn(messages, system, (t) => (turn = t))) {
        yield { type: "text", text: chunk };
      }
    } catch (e) {
      yield { type: "error", message: e instanceof Error ? e.message : String(e) };
      return;
    }

    if (turn.blocks.length === 0) {
      yield { type: "done" };
      return;
    }

    const assistantMsg: AgentMessage = { role: "assistant", content: turn.blocks };
    messages.push(assistantMsg);
    yield { type: "message", message: assistantMsg };

    const toolUses = turn.blocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      yield { type: "done" };
      return;
    }

    // A write with no approval halts the whole turn: we must not run the tools
    // that come after it either, since the model chose them assuming the write
    // succeeded.
    const blocked = toolUses.find(
      (t) => getTool(t.name)?.risk === "write" && !approved.has(t.id) && !rejected.has(t.id)
    );
    if (blocked) {
      yield {
        type: "approval_required",
        id: blocked.id,
        name: blocked.name,
        input: blocked.input,
        summary: summarizeTool(blocked.name, blocked.input),
      };
      return;
    }

    const results: ToolResultBlock[] = [];
    for (const use of toolUses) {
      if (rejected.has(use.id)) {
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: "המשתמש דחה את הפעולה. אל תנסה שוב — הסבר מה לא בוצע והצע חלופה.",
          is_error: true,
        });
        yield { type: "tool_result", id: use.id, name: use.name, ok: false, preview: "נדחה" };
        continue;
      }

      yield { type: "tool_start", id: use.id, name: use.name, input: use.input };
      try {
        const out = await executeTool(use.name, use.input, { actor });
        results.push({ type: "tool_result", tool_use_id: use.id, content: resultToContent(out) });
        yield { type: "tool_result", id: use.id, name: use.name, ok: true, preview: preview(out) };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: `שגיאה: ${message}`,
          is_error: true,
        });
        yield { type: "tool_result", id: use.id, name: use.name, ok: false, preview: message };
      }
    }

    const resultMsg: AgentMessage = { role: "user", content: results };
    messages.push(resultMsg);
    yield { type: "message", message: resultMsg };
  }

  yield { type: "error", message: "הסוכן הגיע למגבלת הצעדים בלי לסיים." };
}

/** Tool names by risk — used by the UI to label the trace. */
export function toolRiskMap(): Record<string, "read" | "write"> {
  return Object.fromEntries(allTools().map((t) => [t.name, t.risk]));
}
