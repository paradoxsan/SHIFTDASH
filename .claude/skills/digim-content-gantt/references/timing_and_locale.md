# Timing & Locale

Optimal posting time is never universal. It is a function of: **the audience's timezone**, **the
platform**, **the local weekly rhythm** (which days are "weekend", which are dead), **the month's
holidays**, and **the language/register** people expect. This skill is multi-locale by design —
**never default to Israel.** Read the business's location from intake and apply *its* reality.

---

## Step 1 — Resolve the locale

From the city + country given at intake, fix five things and encode them into `content.json`:

| What | Where it goes | Notes |
|---|---|---|
| Timezone | `timezone_label` (display) + used when proposing times | All times in the plan are in the **audience's** timezone. Label it (e.g. `שעון ישראל (UTC+2)`, `Berlin (UTC+1)`). |
| Weekend days | `weekend_days` (Python weekday ints) + `locale` | Drives the shaded columns on the timeline. See the table below. |
| This month's holidays | `holidays: [{day, label}]` | Only the dates that fall in the planned month. Shaded + labelled on the axis. |
| Language + register | the copy you write | Write **natively** in the local language; never translate Hebrew across. |
| Peak hours | the `time` on each slot | Per platform + this audience. See the windows below; verify with a quick search when unsure. |

`weekend_days` uses Python's weekday numbering: **Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6.**

| Locale | Weekend convention | `weekend_days` |
|---|---|---|
| Israel (IL) | Friday–Saturday | `[4, 5]` |
| Most of Europe, US, LATAM | Saturday–Sunday | `[5, 6]` |
| Gulf / parts of MENA (UAE, etc.) | Saturday–Sunday (post-2022) or Friday–Saturday | confirm per country |
| Some MENA (Egypt, etc.) | Friday–Saturday | `[4, 5]` |

If `weekend_days` is omitted, the renderer defaults to `[4,5]` when `locale` is `IL`, else `[5,6]`.

---

## Step 2 — Peak-hour starting points (then verify)

These are sane defaults to reason from, not gospel. When the niche or country is unusual, run a
quick search (`"best time to post instagram <country> <year>"`, or the brand's own analytics if the
client shares them) and adjust. Always express the final time in the audience's timezone.

**General evening-and-meal rhythm (most consumer audiences):**
- Instagram / Facebook feed: late morning (~11:00), lunch (~13:00), and **evening 19:00–22:00** —
  evening is usually strongest.
- TikTok: midday and **late evening** skew later than IG (often 20:00–23:00).
- Stories: piggyback on when the audience is already in-app — morning commute, lunch, evening.
- B2B / LinkedIn: weekday mornings (08:00–10:00) and lunch; weak on weekends.

**Israel specifics (when the audience IS Israeli):**
- Strong windows: weekday evenings **20:00–22:30**, lunch **13:00–14:00**, and **מוצ״ש** (Saturday
  night) once Shabbat is out — engagement spikes.
- Friday is a short day; afternoon into Shabbat goes quiet. Sunday is a **workday/return** (like
  Monday elsewhere) — good for week-opener content.
- Hebrew copy, informal register for most SMBs.

**Germany specifics (when the audience IS German):**
- Sat–Sun weekend; **Sundays are quiet** (Ruhetag, shops closed) — engagement is leisure-y, not
  transactional. Evenings 18:00–21:00 strong on weekdays.
- Regional **Feiertage** vary by Bundesland — check the specific state. German copy; choose **du**
  (most consumer brands) vs **Sie** (formal/B2B) and stay consistent.

**Italy specifics (when the audience IS Italian):**
- Sat–Sun weekend; daily rhythm around **pranzo** (lunch ~13:00) and **aperitivo/evening**
  (19:00–21:30). August is **Ferragosto** — much of the country is on holiday; plan lighter.
- Italian copy; **tu** vs **Lei** register; watch local **feste/patron-saint days**.

**Any other locale — the framework:** identify the country's weekend, pull this month's public
holidays, find the platform's peak windows for that audience (search if needed), and write in the
local language + correct register. State your assumptions in the step-3 checkpoint so the client
can correct them.

---

## Step 3 — The Gotchas Catalog (run on EVERY build)

At the checkpoint (process step 3) and again before rendering, walk this list against the proposed
plan and surface anything relevant — locale-aware. This is the same discipline DIGIM uses, adapted
to scheduling.

1. **Weekend / Shabbat placement.** Don't drop a launch or a high-effort post when the audience is
   offline. IL: avoid Friday afternoon → Saturday for anything that needs reach; ride **מוצ״ש**
   instead. Elsewhere: Saturday is often *good* for consumer reach — don't blindly treat the weekend
   as dead; treat it per locale.
2. **Holidays — tone and opportunity.** Never schedule salesy or jokey content on **solemn** days
   (in IL: Yom HaShoah, Yom HaZikaron — and be careful around Tisha B'Av; on chagim like Yom Kippur,
   don't post commercial content at all). *Ride* relevant celebratory ones (Rosh Hashana, Purim,
   Hanukkah; Christmas/Weihnachten; Ferragosto) with on-theme posts. Check what actually falls in
   the planned month and shade those dates.
3. **Real peak hours, not generic.** Use the platform + audience window, not a one-size time. If you
   propose 09:00 for an audience that's active at 21:00, that's a miss.
4. **Sustainable cadence.** Match the volume the client can realistically produce. If they asked for
   20 feed posts but shoot once a month with one phone, say so and propose a number they can hit.
   Over-posting feed (more than ~1/day for most SMBs) burns the audience — push extra volume to
   **stories** instead.
5. **Production lead time.** Every dated post needs its asset to exist *before* that date. Flag
   slots with no Drive media as "needs a shoot" so the client books it in time.
6. **Platform fit.** Don't clone the same post to every network at the same hour; stories cadence is
   higher and more casual than feed; reels favour hook-first; carousels favour save-worthy value.
7. **Timezone correctness.** Confirm all times are in the **audience's** timezone and that
   `timezone_label` says which. A brand in one country selling to another follows the *audience's*
   clock, not the office's.
