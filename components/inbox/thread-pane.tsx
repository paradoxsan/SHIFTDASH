"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import { formatDateTime, mediaLabel, messagePreview, prettyChatId } from "@/lib/format";
import type { WhapiMessage } from "@/lib/types";
import type { InboxChat } from "@/lib/inbox";
import { Icon } from "@/components/icons";
import { Badge, EmptyState, ErrorBanner, Spinner } from "@/components/ui";
import { HumanModeToggle } from "@/components/chat/human-mode-toggle";
import { useCopilot } from "@/components/copilot/copilot-context";

function Bubble({ m }: { m: WhapiMessage }) {
  const isImage = (m.type === "image" || m.type === "sticker" || m.type === "gif") && !!m.mediaUrl;
  const caption = m.caption && m.caption.trim() ? m.caption : null;
  const body = isImage
    ? caption
    : messagePreview(m.type, m.text, m.caption) || (m.type !== "text" ? mediaLabel(m.type) : "");

  return (
    <div className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm"
        style={{
          background: m.fromMe ? "var(--color-brand)" : "var(--color-surface-2)",
          color: m.fromMe ? "white" : "var(--color-text)",
        }}
      >
        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.mediaUrl!}
            alt="תמונה"
            loading="lazy"
            className="rounded-lg max-w-[220px] mb-1 block"
          />
        )}
        {body && <div className="whitespace-pre-wrap break-words">{body}</div>}
        <div
          className="text-[10px] mt-1 opacity-70"
          style={{ color: m.fromMe ? "white" : "var(--color-muted)" }}
        >
          {formatDateTime(m.timestamp)}
        </div>
      </div>
    </div>
  );
}

export function ThreadPane({ chat, onBack }: { chat: InboxChat; onBack: () => void }) {
  const { askAbout } = useCopilot();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // A different conversation is a different draft — never carry text across.
  useEffect(() => {
    setText("");
  }, [chat.key]);

  const messagesQ = useQuery({
    queryKey: ["inbox-messages", chat.whapiKey, chat.chatId],
    queryFn: () =>
      fetchJson<{ messages: WhapiMessage[] }>(
        `/api/whapi/${chat.whapiKey}/messages?chatId=${encodeURIComponent(chat.chatId)}`
      ),
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
  });

  const send = useMutation({
    mutationFn: () => postJson(`/api/whapi/${chat.whapiKey}/send`, { to: chat.chatId, body: text }),
    onSuccess: () => {
      setText("");
      setTimeout(() => void messagesQ.refetch(), 900);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQ.data]);

  const messages = messagesQ.data?.messages ?? [];

  function askClaude() {
    askAbout(
      `סכם את השיחה בוואטסאפ עם ${chat.name} (client: ${chat.clientId}, chatId: ${chat.chatId}). ` +
        `קרא את ההודעות בפועל וענה: מה הלקוח רוצה, איך הבוט ענה, האם משהו השתבש, ומה הצעד הבא שלי.`
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col md:card md:p-0 md:overflow-hidden">
      <div className="flex items-center gap-2 pb-3 md:p-3 md:border-b md:border-[var(--color-border)]">
        <button onClick={onBack} className="md:hidden p-1 text-[var(--color-muted)]" aria-label="חזרה">
          <Icon name="back" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {chat.accent && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: chat.accent }}
                aria-hidden
              />
            )}
            <span className="font-bold truncate">{chat.name}</span>
            <Badge tone="muted">{chat.clientName}</Badge>
          </div>
          <div className="text-[11px] text-[var(--color-muted)] truncate" dir="ltr">
            {prettyChatId(chat.chatId)}
          </div>
        </div>
        <button onClick={askClaude} className="chip shrink-0" title="שאל את Claude על השיחה הזו">
          <Icon name="ai" size={13} />
          שאל את Claude
        </button>
      </div>

      {chat.hasHumanMode && (
        <div className="pb-3 md:px-3 md:pb-3">
          <HumanModeToggle clientId={chat.clientId} chatId={chat.chatId} />
        </div>
      )}

      {(messagesQ.error || send.error) && (
        <div className="md:px-3">
          <ErrorBanner message={((messagesQ.error || send.error) as Error).message} />
        </div>
      )}

      <div className="flex-1 md:overflow-y-auto md:px-3 py-3 flex flex-col gap-2">
        {messagesQ.isLoading ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <EmptyState text="אין הודעות בשיחה הזו" icon="chat" />
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate();
        }}
        className="flex items-center gap-2 pt-3 md:p-3 md:border-t md:border-[var(--color-border)]"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="כתוב הודעה…"
          className="flex-1 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3.5 py-2.5 outline-none focus:border-[var(--color-brand)]"
        />
        <button
          type="submit"
          disabled={!text.trim() || send.isPending}
          className="btn btn-brand"
          aria-label="שלח"
        >
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
}
