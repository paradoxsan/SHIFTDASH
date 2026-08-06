"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import type { InboxChat, InboxSnapshot } from "@/lib/inbox";
import { Icon } from "@/components/icons";
import { Badge, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { ThreadPane } from "./thread-pane";
import { chatIdFromSearch, EMPTY_FILTER, filterInbox, type InboxFilter } from "./filter";

function ChatRow({
  chat,
  selected,
  onSelect,
  showClient,
}: {
  chat: InboxChat;
  selected: boolean;
  onSelect: () => void;
  showClient: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`card p-3 text-start w-full flex items-start justify-between gap-2 transition ${
        selected ? "border-[var(--color-brand)]" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {chat.accent && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: chat.accent }}
              aria-hidden
            />
          )}
          <span className="font-semibold truncate">{chat.name}</span>
          {showClient && (
            <span className="text-[10px] text-[var(--color-faint)] shrink-0">{chat.clientName}</span>
          )}
        </div>
        <div className="text-[11px] text-[var(--color-muted)] truncate mt-0.5">
          {chat.lastMessage ?? "—"}
        </div>
        {(chat.paused || chat.pauseExpired) && (
          <div className="mt-1">
            {chat.paused ? (
              <Badge tone="warn">בוט מושתק</Badge>
            ) : (
              <Badge tone="muted">השתקה פגה</Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-[var(--color-muted)]">{timeAgo(chat.timestamp)}</span>
        {chat.unread > 0 && (
          <span
            className="text-[10px] font-bold rounded-full px-1.5 text-white"
            style={{ background: "var(--color-ok)" }}
          >
            {chat.unread}
          </span>
        )}
      </div>
    </button>
  );
}

function FilterChip({
  on,
  onClick,
  children,
  tone,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="chip shrink-0"
      style={
        on
          ? { borderColor: tone ?? "var(--color-brand)", color: tone ?? "var(--color-brand)" }
          : undefined
      }
    >
      {children}
    </button>
  );
}

export function InboxView() {
  const [filter, setFilter] = useState<InboxFilter>(EMPTY_FILTER);
  const [openKey, setOpenKey] = useState<string | null>(null);
  /** A conversation opened by typing a phone number that isn't in the list yet. */
  const [adHoc, setAdHoc] = useState<InboxChat | null>(null);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => fetchJson<InboxSnapshot>("/api/inbox"),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  const chats = useMemo(() => data?.chats ?? [], [data]);
  const clients = data?.clients ?? [];
  const shown = useMemo(() => filterInbox(chats, filter), [chats, filter]);
  const unreadTotal = chats.reduce((s, c) => s + (c.unread > 0 ? 1 : 0), 0);
  const pausedTotal = chats.filter((c) => c.paused).length;

  const open = adHoc ?? chats.find((c) => c.key === openKey) ?? null;

  // A chat that disappears from the stream (campaign filter, channel error)
  // must not leave a stale thread on screen.
  useEffect(() => {
    if (openKey && !adHoc && data && !chats.some((c) => c.key === openKey)) setOpenKey(null);
  }, [chats, openKey, adHoc, data]);

  function selectChat(c: InboxChat) {
    setAdHoc(null);
    setOpenKey(c.key);
  }

  // Opening a number that never wrote to us needs a client to send *as* — use
  // the filtered client, or the only channel there is.
  const adHocClient =
    clients.find((c) => c.id === filter.clientId) ?? (clients.length === 1 ? clients[0] : null);
  const adHocChatId = chatIdFromSearch(filter.search);

  function openAdHoc() {
    if (!adHocChatId || !adHocClient) return;
    setAdHoc({
      key: `${adHocClient.id}:${adHocChatId}`,
      chatId: adHocChatId,
      name: filter.search.trim(),
      lastMessage: null,
      timestamp: null,
      unread: 0,
      clientId: adHocClient.id,
      clientName: adHocClient.name,
      accent: adHocClient.accent,
      whapiKey: adHocClient.whapiKey,
      hasHumanMode: adHocClient.hasHumanMode,
      paused: false,
      pausedUntil: null,
      pauseExpired: false,
    });
    setOpenKey(null);
  }

  const brokenChannels = clients.filter((c) => c.error);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="שיחות"
        subtitle={
          data
            ? `${chats.length} שיחות · ${unreadTotal} לא נקראו${pausedTotal ? ` · ${pausedTotal} מושתקות` : ""}`
            : "טוען…"
        }
        live={isFetching}
      />

      {error && <ErrorBanner message={error instanceof Error ? error.message : String(error)} />}

      {brokenChannels.map((c) => (
        <Card key={c.id} tone="warn" className="p-3 mb-3 text-xs text-[var(--color-muted)]">
          הערוץ של {c.name} לא זמין: {c.error}
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <FilterChip
          on={filter.clientId === null}
          onClick={() => setFilter((f) => ({ ...f, clientId: null }))}
        >
          הכל
        </FilterChip>
        {clients.map((c) => (
          <FilterChip
            key={c.id}
            on={filter.clientId === c.id}
            tone={c.accent}
            onClick={() =>
              setFilter((f) => ({ ...f, clientId: f.clientId === c.id ? null : c.id }))
            }
          >
            {c.name}
            <span className="opacity-60">{c.chatCount}</span>
          </FilterChip>
        ))}
        <span className="w-px h-4 bg-[var(--color-border)] mx-1" aria-hidden />
        <FilterChip
          on={filter.onlyUnread}
          tone="var(--color-ok)"
          onClick={() => setFilter((f) => ({ ...f, onlyUnread: !f.onlyUnread }))}
        >
          לא נקראו
        </FilterChip>
        <FilterChip
          on={filter.onlyPaused}
          tone="var(--color-warn)"
          onClick={() => setFilter((f) => ({ ...f, onlyPaused: !f.onlyPaused }))}
        >
          בוט מושתק
        </FilterChip>
      </div>

      <div className="md:flex md:gap-4 md:h-[calc(100dvh-16rem)]">
        <div
          className={`${open ? "hidden md:block" : "block"} md:w-80 shrink-0 md:overflow-y-auto`}
        >
          <input
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            placeholder="חיפוש לפי שם או טלפון…"
            className="w-full mb-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
          />

          {isLoading ? (
            <Spinner />
          ) : shown.length === 0 ? (
            <div className="flex flex-col gap-3 pt-2">
              <EmptyState
                text={filter.search ? "לא נמצאה שיחה" : "אין שיחות שמתאימות לסינון"}
                icon="chat"
              />
              {adHocChatId && adHocClient && (
                <button onClick={openAdHoc} className="btn btn-brand">
                  פתח שיחה חדשה עם {adHocChatId.split("@")[0]} ({adHocClient.name})
                </button>
              )}
              {adHocChatId && !adHocClient && (
                <p className="text-[11px] text-center text-[var(--color-muted)]">
                  בחר לקוח כדי לפתוח שיחה חדשה עם המספר הזה.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {shown.map((c) => (
                <ChatRow
                  key={c.key}
                  chat={c}
                  selected={open?.key === c.key}
                  onSelect={() => selectChat(c)}
                  showClient={filter.clientId === null}
                />
              ))}
            </div>
          )}
        </div>

        {open ? (
          <ThreadPane
            key={open.key}
            chat={open}
            onBack={() => {
              setOpenKey(null);
              setAdHoc(null);
            }}
          />
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-[var(--color-muted)] text-sm card">
            <span className="flex items-center gap-2">
              <Icon name="chat" size={16} />
              בחר שיחה כדי לקרוא ולהשיב
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
