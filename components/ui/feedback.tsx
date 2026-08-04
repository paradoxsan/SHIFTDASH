import { Icon } from "@/components/icons";

export function PageHeader({
  title,
  subtitle,
  live,
  right,
}: {
  title: string;
  subtitle?: string;
  live?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--color-muted)] mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {right}
        {live !== undefined && (
          <span className="chip" style={{ color: live ? "var(--color-ok)" : "var(--color-muted)" }}>
            <span
              className={`dot ${live ? "dot-live" : ""}`}
              style={{ background: live ? "var(--color-ok)" : "var(--color-idle)" }}
            />
            {live ? "חי" : "מעודכן"}
          </span>
        )}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[var(--color-muted)] text-sm py-12 justify-center">
      <span className="dot dot-live" style={{ background: "var(--color-brand)" }} />
      {label ?? "טוען…"}
    </div>
  );
}

/** Layout-preserving placeholder. Prefer this over a spinner when the shape of
 *  the incoming content is known — it stops the page from jumping. */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <div className="grid grid-cols-3 gap-2 pt-1">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="card p-4 text-sm mb-4 flex items-start gap-2.5"
      style={{ borderColor: "color-mix(in srgb, var(--color-err) 45%, var(--color-border))" }}
    >
      <span style={{ color: "var(--color-err)" }} className="shrink-0 mt-0.5">
        <Icon name="alert" size={16} />
      </span>
      <div className="min-w-0">
        <span style={{ color: "var(--color-err)" }} className="font-bold">
          שגיאה:{" "}
        </span>
        {message}
      </div>
    </div>
  );
}

export function EmptyState({
  text,
  icon,
  action,
}: {
  text: string;
  icon?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12 px-4">
      {icon && (
        <div className="text-[var(--color-faint)] flex justify-center mb-3">
          <Icon name={icon} size={28} />
        </div>
      )}
      <p className="text-sm text-[var(--color-muted)]">{text}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
