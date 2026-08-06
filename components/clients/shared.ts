// Presentation shared by the clients list and the client card, so a client can
// never look "בפיגור" on one screen and "שולם" on the other.
import type { Tone } from "@/components/ui";

export interface PaymentStatusView {
  state: string;
  openAmount: number;
  overdueAmount: number;
  oldestDueDate: string | null;
  daysOverdue: number;
  openCount: number;
  /** Last money actually received from this client, `YYYY-MM-DD`. */
  lastPaidOn: string | null;
  lastPaidAmount: number;
}

export interface ContractView {
  tenantId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  startedOn: string | null;
  setupFee: number | null;
  monthlyFee: number | null;
  currency: string;
  billingStatus: "active" | "paused" | "churned";
  morningClientId: string | null;
  notes: string | null;
  updatedAt: string | null;
}

export interface AlertLike {
  id: number;
  type: string;
  severity: string;
  tone: "err" | "warn" | "brand";
  title: string;
  detail: string;
  createdAt: string;
  askPrompt: string;
}

export interface ClientCardView {
  id: string;
  name: string;
  workspace: string;
  accent: string | null;
  health: string;
  healthCheckedAt: string | null;
  alerts: AlertLike[];
  openAlertCount: number;
  contract: ContractView | null;
  payment: PaymentStatusView;
}

export const HEALTH_VIEW: Record<string, { label: string; tone: Tone }> = {
  healthy: { label: "תקין", tone: "ok" },
  degraded: { label: "לא תקין", tone: "warn" },
  down: { label: "נפל", tone: "err" },
  unknown: { label: "לא ידוע", tone: "muted" },
};

export const PAYMENT_VIEW: Record<string, { label: string; tone: Tone }> = {
  paid: { label: "משולם", tone: "ok" },
  awaiting: { label: "טרם שולם החודש", tone: "warn" },
  due: { label: "פתוח", tone: "warn" },
  overdue: { label: "בפיגור", tone: "err" },
  "no-contract": { label: "אין הסכם", tone: "muted" },
  unlinked: { label: "לא מקושר ל-Morning", tone: "muted" },
  unknown: { label: "לא ידוע", tone: "muted" },
};

export const BILLING_STATUS_LABEL: Record<string, string> = {
  active: "פעיל",
  paused: "מושהה",
  churned: "עזב",
};

export function healthView(state: string) {
  return HEALTH_VIEW[state] ?? HEALTH_VIEW.unknown;
}
export function paymentView(state: string) {
  return PAYMENT_VIEW[state] ?? PAYMENT_VIEW.unknown;
}

/** Sort the client list by what needs me: broken bots first, then money. */
export function urgencyRank(c: ClientCardView): number {
  if (c.health === "down") return 0;
  if (c.payment.state === "overdue") return 1;
  if (c.health === "degraded") return 2;
  if (c.openAlertCount > 0) return 3;
  if (c.payment.state === "due") return 4;
  if (c.payment.state === "awaiting") return 5;
  if (c.contract === null) return 6;
  return 7;
}
