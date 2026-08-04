import { AppShell } from "@/components/shell/app-shell";
import { ClientProvider } from "@/components/client-context";
import { CopilotProvider } from "@/components/copilot/copilot-context";
import { CopilotDock } from "@/components/copilot/copilot-dock";
import { CopilotTrigger } from "@/components/copilot/copilot-trigger";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientProvider>
      <CopilotProvider>
        <AppShell>{children}</AppShell>
        <CopilotTrigger />
        <CopilotDock />
      </CopilotProvider>
    </ClientProvider>
  );
}
