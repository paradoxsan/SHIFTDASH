"use client";

import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { Spinner } from "@/components/ui";

export default function ChatPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ChatView />
    </Suspense>
  );
}
