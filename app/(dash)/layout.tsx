import { Shell } from "@/components/shell";
import { ClientProvider } from "@/components/client-context";
import { WorkspaceBar } from "@/components/workspace-bar";

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientProvider>
      <Shell>
        <WorkspaceBar />
        {children}
      </Shell>
    </ClientProvider>
  );
}
