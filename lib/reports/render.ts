// Monthly report → a single self-contained HTML document.
//
// No external requests of any kind: the client-facing variant gets forwarded to
// people on unknown networks, and a report that renders differently depending on
// whether a CDN loaded is not a report.
//
// Palette: categorical slots 1–3 of the validated default (blue / orange / aqua).
// Validated in BOTH modes on the all-pairs list — worst CVD ΔE 9.2 light / 9.4
// dark, worst normal-vision ΔE 24.0 / 20.9. Aqua sits below 3:1 on the light
// surface, so the relief rule applies: every chart ships a legend plus either
// direct labels or the table beside it. Do not add a 4th series without
// re-running scripts/validate_palette.js — slot 4 puts yellow next to orange and
// fails the all-pairs floor.
import type { BotMonthly, MonthlyReport, Volume } from "./monthly";

export type Variant = "internal" | "client";

const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nf = (n: number): string => Math.round(n).toLocaleString("en-US");
const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / (p / 2)) * (p / 2);
};

function deltaHtml(cur: number, prev: number | null | undefined, good: "up" | "down" | "none" = "up"): string {
  if (prev === null || prev === undefined || prev === 0) return "";
  const p = ((cur - prev) / prev) * 100;
  const up = p >= 0;
  const cls = good === "none" ? "flat" : up === (good === "up") ? "good" : "bad";
  return `<span class="d ${cls}">${up ? "▲" : "▼"} ${Math.abs(p).toFixed(0)}%</span>`;
}

const tile = (label: string, value: string, sub = "", d = ""): string =>
  `<div class="tile"><div class="tl">${esc(label)}</div><div class="tv">${esc(value)}</div><div class="ts">${esc(sub)} ${d}</div></div>`;

function table(headers: string[], rows: string[][]): string {
  return `<div class="tw"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

interface Series { key: "inbound" | "bot" | "human"; label: string; color: string }

function lineChart(rows: BotMonthly["daily"], series: Series[]): string {
  if (rows.length < 2) return `<p class="empty">אין מספיק ימים עם תנועה כדי לשרטט מגמה.</p>`;
  const W = 900, H = 300, PT = 16, PR = 96, PB = 30, PL = 52;
  const iw = W - PL - PR, ih = H - PT - PB;
  const max = niceMax(Math.max(...rows.flatMap((r) => series.map((s) => r[s.key]))));
  const x = (i: number) => PL + (i * iw) / (rows.length - 1);
  const y = (v: number) => PT + ih - (v / max) * ih;
  let g = "";
  for (const t of [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))) {
    g += `<line x1="${PL}" x2="${PL + iw}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid"/>`;
    g += `<text x="${PL - 8}" y="${(y(t) + 4).toFixed(1)}" class="tick" text-anchor="end">${nf(t)}</text>`;
  }
  rows.forEach((r, i) => {
    if (i % 5 === 0 || i === rows.length - 1)
      g += `<text x="${x(i).toFixed(1)}" y="${H - 10}" class="tick" text-anchor="middle">${esc(r.d)}</text>`;
  });
  let paths = "", hot = "";
  for (const s of series) {
    const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r[s.key]).toFixed(1)}`).join(" ");
    const last = rows[rows.length - 1];
    paths += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    paths += `<circle cx="${x(rows.length - 1).toFixed(1)}" cy="${y(last[s.key]).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`;
    paths += `<text x="${PL + iw + 10}" y="${(y(last[s.key]) + 4).toFixed(1)}" class="dlabel">${esc(s.label)}</text>`;
  }
  rows.forEach((r, i) => {
    const tip = `${r.d} — ` + series.map((s) => `${s.label}: ${nf(r[s.key])}`).join(" · ");
    hot += `<rect x="${(x(i) - iw / rows.length / 2).toFixed(1)}" y="${PT}" width="${(iw / rows.length).toFixed(1)}" height="${ih}" fill="transparent" class="hot" data-tip="${esc(tip)}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${g}<line x1="${PL}" x2="${PL + iw}" y1="${PT + ih}" y2="${PT + ih}" class="axis"/>${paths}${hot}</svg>`;
}

function hbarChart(rows: { reason: string; n: number }[]): string {
  if (!rows.length) return "";
  const W = 900, rowH = 26, padL = 200, padR = 60;
  const H = rows.length * rowH + 10, iw = W - padL - padR;
  const max = Math.max(...rows.map((r) => r.n));
  let out = "";
  rows.forEach((r, i) => {
    const y = i * rowH + 8;
    const bw = Math.max(2, (r.n / max) * iw);
    out += `<text x="${padL - 10}" y="${y + 13}" class="hlabel" text-anchor="end">${esc(r.reason)}</text>`;
    out += `<rect x="${padL}" y="${y}" width="${bw.toFixed(1)}" height="16" rx="3" fill="var(--s1)" class="hot" data-tip="${esc(`${r.reason} — ${nf(r.n)}`)}"/>`;
    out += `<text x="${(padL + bw + 8).toFixed(1)}" y="${y + 13}" class="hval">${nf(r.n)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${out}</svg>`;
}

function volumeTiles(v: Volume, p: Volume | null): string {
  return `<div class="tiles">
${tile('הודעות סה"כ', nf(v.msgs), p ? "מול " + nf(p.msgs) : "", p ? deltaHtml(v.msgs, p.msgs, "none") : "")}
${tile("שיחות פעילות", nf(v.chats), p ? "מול " + nf(p.chats) : "", p ? deltaHtml(v.chats, p.chats, "none") : "")}
${tile("הודעות מלקוחות", nf(v.inbound), p ? "מול " + nf(p.inbound) : "", p ? deltaHtml(v.inbound, p.inbound, "none") : "")}
${tile("מענה הבוט", nf(v.botOut), p ? "מול " + nf(p.botOut) : "", p ? deltaHtml(v.botOut, p.botOut, "up") : "")}
${tile("מענה אנושי", nf(v.humanOut), p ? "מול " + nf(p.humanOut) : "", p ? deltaHtml(v.humanOut, p.humanOut, "down") : "")}
${tile(
    "חלק הבוט במענה",
    v.botShare === null ? "—" : v.botShare.toFixed(0) + "%",
    p && p.botShare !== null ? "מול " + p.botShare.toFixed(0) + "%" : "",
    v.botShare !== null && p && p.botShare !== null ? deltaHtml(v.botShare, p.botShare, "up") : ""
  )}
</div>`;
}

function botSection(b: BotMonthly, variant: Variant, clientLink?: string): string {
  const v = b.volume, p = b.prevVolume;
  let out = `<h2>${esc(b.name)}</h2>`;
  if (variant === "internal" && clientLink) {
    out += `<p class="lede">גרסת לקוח להעברה: <a href="${esc(clientLink)}">${esc(clientLink)}</a></p>`;
  }
  out += volumeTiles(v, p);

  if (b.orders) {
    const po = b.prevOrders;
    out += `<div class="tiles">
${tile("הזמנות שנפתחו", nf(b.orders.count), po ? "מול " + nf(po.count) : "", po ? deltaHtml(b.orders.count, po.count) : "")}
${tile("שווי הזמנות", "₪" + nf(b.orders.revenue), po ? "מול ₪" + nf(po.revenue) : "", po ? deltaHtml(b.orders.revenue, po.revenue) : "")}
${tile("הזמנה ממוצעת", "₪" + nf(b.orders.avg), po ? "מול ₪" + nf(po.avg) : "", po ? deltaHtml(b.orders.avg, po.avg) : "")}
</div>`;
  }

  if (b.extras.length) {
    out += `<div class="tiles">${b.extras.map((e) => tile(e.label, e.value, e.note ?? "")).join("")}</div>`;
  }

  if (b.daily.length >= 2) {
    out += `<h3>נפח יומי</h3>
<div class="legend">
<span><i style="background:var(--s1)"></i>הודעות מלקוחות</span>
<span><i style="background:var(--s2)"></i>מענה אנושי</span>
<span><i style="background:var(--s3)"></i>מענה הבוט</span>
</div>
<figure class="chart">${lineChart(b.daily, [
      { key: "inbound", label: "לקוחות", color: "var(--s1)" },
      { key: "human", label: "אנושי", color: "var(--s2)" },
      { key: "bot", label: "בוט", color: "var(--s3)" },
    ])}<div class="tip"></div></figure>`;
  }

  if (b.escalations.length) {
    out += `<h3>פניות שהועברו לצוות — ${nf(b.escalationTotal)} בסך הכל</h3>
<figure class="chart">${hbarChart(b.escalations)}<div class="tip"></div>
<figcaption>הנושאים שהבוט העביר לטיפול אנושי. הגדולים ביותר הם המועמדים הטובים ביותר לאוטומציה בהמשך.</figcaption></figure>`;
  }

  if (b.notes.length) {
    out += b.notes.map((n) => `<div class="flag"><p>${esc(n)}</p></div>`).join("");
  }
  return out;
}

const STYLE = `<style>
:root{color-scheme:light dark}
.rep{--surface-1:#fcfcfb;--plane:#f9f9f7;--ink:#0b0b0b;--ink-2:#52514e;--muted:#898781;
 --grid:#e1e0d9;--axis:#c3c2b7;--border:rgba(11,11,11,.10);--good:#006300;--bad:#d03b3b;
 --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;background:var(--plane);color:var(--ink);
 font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;direction:rtl;margin:0;padding:28px 20px 64px}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .rep{
 --surface-1:#1a1a19;--plane:#0d0d0d;--ink:#fff;--ink-2:#c3c2b7;--muted:#898781;
 --grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);--good:#0ca30c;--bad:#e66767;
 --s1:#3987e5;--s2:#d95926;--s3:#199e70}}
:root[data-theme="dark"] .rep{--surface-1:#1a1a19;--plane:#0d0d0d;--ink:#fff;--ink-2:#c3c2b7;--muted:#898781;
 --grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);--good:#0ca30c;--bad:#e66767;
 --s1:#3987e5;--s2:#d95926;--s3:#199e70}
.wrap{max-width:1000px;margin:0 auto}
h1{font-size:1.8rem;line-height:1.25;margin:0 0 6px;letter-spacing:-.02em}
h2{font-size:1.3rem;margin:46px 0 4px;letter-spacing:-.01em}
h3{font-size:1rem;margin:26px 0 8px;color:var(--ink-2)}
p{margin:8px 0;color:var(--ink-2)}
a{color:var(--s1)}
.lede{color:var(--muted);font-size:.9rem;margin:0 0 22px;word-break:break-all}
.card{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin:14px 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
.tile{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.tl{font-size:.78rem;color:var(--muted)}
.tv{font-size:1.5rem;font-weight:650;margin:2px 0;letter-spacing:-.02em}
.ts{font-size:.76rem;color:var(--muted)}
.d{font-weight:650}.d.good{color:var(--good)}.d.bad{color:var(--bad)}.d.flat{color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin:2px 0 10px;font-size:.84rem;color:var(--ink-2)}
.legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-inline-end:6px;vertical-align:-1px}
figure{margin:0}figcaption{font-size:.82rem;color:var(--muted);margin-top:8px}
.chart{position:relative;overflow-x:auto}
svg{display:block;width:100%;height:auto;min-width:560px;direction:ltr}
.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--axis);stroke-width:1}
.tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.dlabel,.hlabel{fill:var(--ink-2);font-size:12px}
.hval{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.tip{position:absolute;pointer-events:none;opacity:0;transition:opacity .1s;background:var(--ink);color:var(--surface-1);
 font-size:12px;padding:6px 9px;border-radius:7px;white-space:nowrap;transform:translate(-50%,-140%);z-index:5}
.tw{overflow-x:auto;margin:10px 0}
table{border-collapse:collapse;width:100%;font-size:.86rem;min-width:420px}
th,td{padding:7px 10px;border-bottom:1px solid var(--border);text-align:right}
th{color:var(--muted);font-weight:600;font-size:.78rem}
td.num{font-variant-numeric:tabular-nums}
.flag{border-inline-start:3px solid var(--s2);padding:2px 14px;margin:14px 0;background:var(--surface-1);border-radius:0 10px 10px 0}
.flag p{margin:10px 0;font-size:.9rem}
.empty{color:var(--muted);font-size:.88rem}
ul{margin:8px 0;padding-inline-start:22px;color:var(--ink-2)}li{margin:5px 0}
.foot{margin-top:44px;padding-top:18px;border-top:1px solid var(--border);font-size:.8rem;color:var(--muted)}
</style>`;

const SCRIPT = `<script>
(function(){document.querySelectorAll('.chart').forEach(function(box){
var tip=box.querySelector('.tip');if(!tip)return;
box.addEventListener('mousemove',function(e){var t=e.target.closest('.hot');
if(!t){tip.style.opacity=0;return;}var r=box.getBoundingClientRect();
tip.textContent=t.getAttribute('data-tip');tip.style.left=(e.clientX-r.left)+'px';
tip.style.top=(e.clientY-r.top)+'px';tip.style.opacity=1;});
box.addEventListener('mouseleave',function(){tip.style.opacity=0;});});})();
</script>`;

function doc(title: string, body: string): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${STYLE}</head>
<body style="margin:0"><div class="rep"><div class="wrap">${body}</div></div>${SCRIPT}</body>
</html>`;
}

export interface RenderOptions {
  variant: Variant;
  /** internal only — links to each client-facing version. */
  clientLinks?: Record<string, string>;
  /** client only — which bot to render. */
  clientId?: string;
}

export function renderReport(report: MonthlyReport, opts: RenderOptions): string {
  const period = `${report.window.from} – ${report.window.to} (לא כולל)`;
  const gen = report.generatedAt.slice(0, 10);

  if (opts.variant === "client") {
    const b = report.bots.find((x) => x.id === opts.clientId);
    if (!b) return doc("דוח לא נמצא", `<h1>הדוח לא נמצא</h1><p>אין נתונים ללקוח המבוקש בחודש ${esc(report.label)}.</p>`);
    const body = `<h1>דוח חודשי — ${esc(b.name)}</h1>
<p class="lede">${esc(report.label)} · הופק ${esc(gen)} · Shift Digital</p>
${botSection(b, "client")}
<div class="foot">הנתונים נמדדו ישירות ממערכת ההודעות של הבוט לתקופה ${esc(period)}, בהשוואה לחודש הקודם.
"מענה הבוט" = הודעות שנשלחו אוטומטית; "מענה אנושי" = הודעות שנכתבו ידנית מהטלפון או מהמחשב.</div>`;
    return doc(`דוח חודשי — ${b.name} · ${report.label}`, body);
  }

  const totals = report.bots.reduce(
    (a, b) => ({
      msgs: a.msgs + b.volume.msgs,
      chats: a.chats + b.volume.chats,
      bot: a.bot + b.volume.botOut,
      human: a.human + b.volume.humanOut,
      esc: a.esc + b.escalationTotal,
      rev: a.rev + (b.orders?.revenue ?? 0),
      orders: a.orders + (b.orders?.count ?? 0),
    }),
    { msgs: 0, chats: 0, bot: 0, human: 0, esc: 0, rev: 0, orders: 0 }
  );
  const body = `<h1>דוח חודשי — בוטי וואטסאפ</h1>
<p class="lede">${esc(report.label)} · ${report.bots.length} בוטים · הופק ${esc(gen)} · Shift Digital</p>
<div class="tiles">
${tile('הודעות סה"כ', nf(totals.msgs))}
${tile("שיחות פעילות", nf(totals.chats))}
${tile("מענה הבוט", nf(totals.bot))}
${tile("מענה אנושי", nf(totals.human))}
${tile("הועבר לצוות", nf(totals.esc))}
${tile("שווי הזמנות", "₪" + nf(totals.rev), nf(totals.orders) + " הזמנות")}
</div>
${report.bots.map((b) => botSection(b, "internal", opts.clientLinks?.[b.id])).join("")}
<div class="foot">כל המספרים נשלפו ישירות מ-Supabase לתקופה ${esc(period)}, בהשוואה לחודש שקדם לה.
"מענה הבוט" = הודעות יוצאות עם <code>source=api</code>; "מענה אנושי" = יוצאות מ-mobile/web. הודעות קבוצה אינן נספרות בנפח השיחות.</div>`;
  return doc(`דוח חודשי · ${report.label}`, body);
}

/** The 8-line WhatsApp summary. Deliberately short — it must read inside the notification. */
export function whatsappSummary(report: MonthlyReport, internalUrl: string): string {
  const lines: string[] = [`📊 דוח חודשי — ${report.label}`, ""];
  for (const b of report.bots) {
    const v = b.volume, p = b.prevVolume;
    const trend = p && p.msgs ? ` (${v.msgs >= p.msgs ? "+" : ""}${Math.round(((v.msgs - p.msgs) / p.msgs) * 100)}%)` : "";
    lines.push(`*${b.name}*`);
    lines.push(`${nf(v.chats)} שיחות · ${nf(v.msgs)} הודעות${trend}`);
    if (v.botShare !== null) lines.push(`הבוט ענה על ${v.botShare.toFixed(0)}% מהפניות`);
    if (b.orders) {
      const po = b.prevOrders;
      const od = po && po.count ? ` (${b.orders.count >= po.count ? "+" : ""}${Math.round(((b.orders.count - po.count) / po.count) * 100)}%)` : "";
      lines.push(`${nf(b.orders.count)} הזמנות · ₪${nf(b.orders.revenue)}${od}`);
    }
    if (b.escalationTotal) lines.push(`${nf(b.escalationTotal)} פניות הועברו לצוות`);
    lines.push("");
  }
  lines.push(`הדוח המלא:`, internalUrl);
  return lines.join("\n");
}
