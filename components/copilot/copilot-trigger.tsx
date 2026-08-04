"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icons";
import { useCopilot } from "./copilot-context";

/** Floating opener, plus ⌘K / Ctrl+K from anywhere in the app. Sits above the
 *  mobile bottom nav so it never covers a tab. */
export function CopilotTrigger() {
  const { open, setOpen } = useCopilot();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (open) return null;

  return (
    <button
      onClick={() => setOpen(true)}
      className="fixed z-30 bottom-20 md:bottom-6 start-4 md:start-6 btn btn-ai shadow-lg rounded-full ps-3 pe-4"
      title="שאל את Claude (Ctrl+K)"
    >
      <Icon name="ai" size={17} />
      <span className="hidden sm:inline">שאל את Claude</span>
    </button>
  );
}
