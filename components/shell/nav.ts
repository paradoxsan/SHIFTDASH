// The six questions the dashboard answers, in the order you'd ask them on a
// normal morning. Anything that doesn't help run the agency doesn't get a slot.
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Short description shown in the mobile drawer / command palette. */
  hint: string;
}

export const NAV: NavItem[] = [
  { href: "/today", label: "היום", icon: "today", hint: "מה דורש תשומת לב עכשיו" },
  { href: "/clients", label: "לקוחות", icon: "clients", hint: "בריאות הבוט, תשלום, התקשרות" },
  { href: "/money", label: "כסף", icon: "money", hint: "הכנסות, הוצאות, חשבוניות" },
  { href: "/inbox", label: "שיחות", icon: "chat", hint: "הוואטסאפ של כל הבוטים" },
  { href: "/leads", label: "לידים", icon: "leads", hint: "ה-pipeline של Shift Digital" },
  { href: "/system", label: "חדר מכונות", icon: "system", hint: "n8n, ריצות, דאטהבייס, הקמה" },
];

export function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
