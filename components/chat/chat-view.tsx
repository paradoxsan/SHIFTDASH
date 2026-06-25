"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchJson, postJson } from "@/lib/client";
import type { WhapiChat, WhapiMessage } from "@/lib/types";
import { PageHeader, Spinner, ErrorBanner, EmptyState } from "@/components/ui";
import { useClientCtx } from "@/components/client-context";
import { HumanModeToggle } from "./human-mode-toggle";
import { Icon } from "@/components/icons";
import { timeAgo, formatDateTime, messagePreview, mediaLabel } from "@/lib/format";

export function ChatView() {
  const { activeClient } = useClientCtx();
  const whapiKey = activeClient?.whapiKey;
  const hasWhapi = activeClient?.hasWhapi ?? false;
  const hasHumanMode = activeClient?.tables?.includes("human_mode") ?? false;

  const [chat, setChat] = useState<WhapiChat | null>(null);
  const [search, setSearch] = useState("");

  // Reset the open thread whenever the active client changes.
  useEffect(() => {
    setChat(null);
  }, [whapiKey]);

  const chatsQ = useQuery({
    queryKey: ["chats", whapiKey],
    queryFn: () => fetchJson<{ chats: WhapiChat[] }>(`/api/whapi/${whapiKey}/chats`),
    enabled: !!whapiKey && hasWhapi,
    refetchInterval: 6_000,
    refetchIntervalInBackground: true,
  });

  const messagesQ = useQuery({
    queryKey: ["messages", whapiKey, chat?.id],
    queryFn: () =>
      fetchJson<{ messages: WhapiMessage[] }>(
        `/api/whapi/${whapiKey}/messages?chatId=${encodeURIComponent(chat!.id)}`
      ),
    enabled: !!whapiKey && !!chat,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
  });

  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => postJson(`/api/whapi/${whapiKey}/send`, { to: chat!.id, body: text }),
    onSuccess: () => {
      setText("");
      setTimeout(() => messagesQ.refetch(), 900);
    },
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQ.data]);

  // Search the chat list by name or phone digits.
  const allChats = chatsQ.data?.chats ?? [];
  const searchDigits = search.replace(/\D/g, "");
  const filteredChats = !search.trim()
    ? allChats
    : allChats.filter((c) => {
        const name = (c.name || "").toLowerCase();
        const idDigits = c.id.replace(/\D/g, "");
        return (
          name.includes(search.toLowerCase()) ||
          (searchDigits.length >= 3 && idDigits.includes(searchDigits))
        );
      });
  function openByPhone() {
    let p = searchDigits;
    if (p.startsWith("0")) p = "972" + p.slice(1);
    setChat({
      id: `${p}@s.whatsapp.net`,
      name: search.trim(),
      lastMessage: null,
      timestamp: null,
      unread: 0,
    });
  }

  if (!activeClient) return <Spinner />;
  if (!hasWhapi)
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <PageHeader title="וואטסאפ" subtitle={activeClient.name} />
        <EmptyState text="לא הוגדר טוקן WHAPI ללקוח הזה. הוסף אותו ל-WHAPI_TOKENS_JSON." />
      </div>
    );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="וואטסאפ"
        subtitle={activeClient.name}
        live={chatsQ.isFetching || messagesQ.isFetching}
      />

      {(chatsQ.error || send.error) && (
        <ErrorBanner message={((chatsQ.error || send.error) as Error).message} />
      )}

      <div className="md:flex md:gap-4 md:h-[calc(100dvh-12rem)]">
        {/* Chat list */}
        <div className={`${chat ? "hidden md:block" : "block"} md:w-80 shrink-0 md:overflow-y-auto`}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם או טלפון…"
            className="w-full mb-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
          />
          {chatsQ.isLoading ? (
            <Spinner />
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col gap-3 pt-2">
              <EmptyState text={search ? "לא נמצאה שיחה ברשימה" : "אין שיחות"} />
              {searchDigits.length >= 6 && (
                <button onClick={openByPhone} className="btn btn-brand">
                  פתח שיחה עם {searchDigits}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredChats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setChat(c)}
                  className={`card p-3 text-start flex items-center justify-between gap-2 transition ${
                    chat?.id === c.id ? "border-[var(--color-brand)]" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-[11px] text-[var(--color-muted)] truncate">
                      {c.lastMessage ?? "—"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-[var(--color-muted)]">{timeAgo(c.timestamp)}</span>
                    {c.unread > 0 && (
                      <span
                        className="text-[10px] font-bold rounded-full px-1.5 text-white"
                        style={{ background: "var(--color-ok)" }}
                      >
                        {c.unread}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Thread */}
        <div className={`${chat ? "block" : "hidden md:block"} flex-1 min-w-0 md:card md:p-0 flex flex-col`}>
          {!chat ? (
            <div className="hidden md:flex flex-1 items-center justify-center text-[var(--color-muted)] text-sm">
              בחר שיחה כדי לראות את ההתכתבות
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-3 md:p-3 md:border-b md:border-[var(--color-border)]">
                <button onClick={() => setChat(null)} className="md:hidden p-1 text-[var(--color-muted)]">
                  <Icon name="back" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate">{chat.name}</div>
                  <div className="text-[11px] text-[var(--color-muted)] truncate" dir="ltr">
                    {chat.id}
                  </div>
                </div>
                {hasHumanMode && activeClient && (
                  <HumanModeToggle clientId={activeClient.id} chatId={chat.id} />
                )}
              </div>

              <div className="flex-1 md:overflow-y-auto md:px-3 py-3 flex flex-col gap-2">
                {messagesQ.isLoading ? (
                  <Spinner />
                ) : (messagesQ.data?.messages ?? []).length === 0 ? (
                  <EmptyState text="אין הודעות" />
                ) : (
                  messagesQ.data!.messages.map((m) => <Bubble key={m.id} m={m} />)
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
          <img src={m.mediaUrl!} alt="תמונה" loading="lazy" className="rounded-lg max-w-[220px] mb-1 block" />
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
