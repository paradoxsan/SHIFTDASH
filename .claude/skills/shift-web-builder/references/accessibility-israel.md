# Accessibility & Israeli Law — ת"י 5568, the Regulations, and the Code-Level Gate

Accessibility in Israel is not a nice-to-have: it's a legal duty with real litigation exposure.
This file covers the legal frame (so you can brief clients accurately) and the technical
checklist (so every site you build passes). Principle: **accessibility is written into the code
from line one — an overlay/plugin pasted at the end does NOT provide legal coverage** and Israeli
practice explicitly warns that plugin-only sites remain exposed to claims.

## 1. The legal frame (brief clients with this)

- **Source of duty:** חוק שוויון זכויות לאנשים עם מוגבלות + תקנות שוויון זכויות לאנשים עם
  מוגבלות (התאמות נגישות לשירות), תשע"ג-2013. Any website/app providing a service to the public
  in Israel — or information about such a service — must be accessible. That covers stores,
  brand sites, landing pages, portals.
- **The standard:** תקן ישראלי 5568 (חלק 1), which adopts **WCAG 2.0 Level AA** as the legal
  minimum. Best practice (and where the world has moved): build to WCAG 2.1/2.2 AA — it contains
  2.0 AA, so you're covered both ways. ת"י 5568 חלק 2 extends to digital documents (PDFs etc.).
- **New vs. existing sites:** sites launched after 26.10.2017 must be accessible, period — the
  graduated reliefs apply mainly to older existing sites. **Everything this skill builds is a
  "new site" — full compliance, no exemption assumptions.**
- **Exemptions (the client's lawyer/advisor confirms — never promise):** structured by average
  annual turnover: עוסק פטור and very small turnover (~₪100–120K) — automatic temporary relief
  (renewable 3-year cycles); mid-range up to ~₪1M — temporary relief for pre-2017 existing sites
  only; above ~₪1M — no automatic relief (only a reasoned application to the נציבות). A claimed
  exemption MUST be published inside the site's accessibility statement. Figures get updated —
  when a client asks, verify current thresholds with a live search before quoting numbers.
- **הצהרת נגישות (accessibility statement) is mandatory** and is checked against reality — an
  inaccurate statement is itself a liability. It includes: accessibility level achieved, the
  adjustments made, known gaps, the accessibility coordinator's (רכז נגישות — required for
  businesses with 25+ employees) contact details, and any exemption relied on.
- **Exposure for non-compliance:** civil claims with statutory compensation WITHOUT proof of
  damage (tens of thousands of ₪ per claim — amounts are indexed and have ranged ~₪50–62K),
  class actions (filed against major Israeli retailers), and the Commissioner's administrative
  track (orders + fines). Plaintiffs routinely scan sites with automated tools (axe/WAVE) to
  find targets — meaning automated-detectable failures are the most dangerous kind.

**Standard client briefing line (Hebrew, include in delivery):** האתר נבנה לעמידה בתקן 5568
(WCAG 2.0 AA ומעלה) ברמת הקוד. באחריות העסק: פרסום הצהרת נגישות, מינוי רכז נגישות אם יש 25+
עובדים, ושמירה על הנגישות בתכנים שיתווספו בהמשך.

## 2. The build-to checklist (apply DURING Phase 6, audit in Phase 7)

**Perceivable**
- [ ] Contrast: normal text ≥4.5:1; large text (≥24px, or ≥18.5px bold) ≥3:1. Check the accent
      color on its actual backgrounds, including text over hero images (add scrim if needed).
- [ ] Color is never the only signal (errors get icon+text, links underlined or weight-marked).
- [ ] Every informative image has Hebrew `alt`; decorative images `alt=""`.
- [ ] Video gets captions; audio gets transcript (flag to client if media is theirs to caption).
- [ ] Text resizes to 200% without loss (use rem, no fixed-height text containers).

**Operable**
- [ ] Full keyboard navigation: every interactive element reachable and operable by Tab/Enter/
      Space; logical tab order follows visual RTL order; no keyboard traps (test modals/menus).
- [ ] Visible focus: a clear `:focus-visible` style (≥2px outline, contrast ≥3:1) — never
      `outline: none` without replacement.
- [ ] Skip link ("דלג לתוכן הראשי") as first focusable element.
- [ ] Touch targets ≥44×44px; no time limits; nothing flashes >3×/second.
- [ ] Carousels/animations pausable; `@media (prefers-reduced-motion: reduce)` disables
      non-essential motion.

**Understandable**
- [ ] `lang="he"` on html; `lang="en"` on substantial English fragments.
- [ ] One `<h1>`; heading levels never skip; headings describe their section.
- [ ] Forms: every input has a programmatic `<label>` (placeholder is NOT a label); required
      fields marked in text; errors identified in Hebrew next to the field + described
      (aria-describedby); submission errors summarized at top with links to fields.
- [ ] Link text meaningful out of context ("לתיאום פגישה" not "לחצו כאן").

**Robust**
- [ ] Semantic HTML first: `<header> <nav> <main> <footer> <button> <a>` — a `<div onclick>` is a
      violation, not a style choice. ARIA only where semantics can't do it (menus:
      aria-expanded; accordion: aria-controls; modal: role="dialog" + focus trap + Esc).
- [ ] Status messages (form success, cart updates) announced via `role="status"`/aria-live.
- [ ] Page `<title>` in Hebrew, unique and descriptive.

**Israeli-specific touches**
- [ ] Accessibility statement page/section stub included in deliverable (template below) with
      clear TODO markers for the business details.
- [ ] If a third-party widget is embedded (booking, payments), note its accessibility is the
      vendor's — but the client should prefer accessible vendors; flag known-bad ones.

## 3. הצהרת נגישות — starter template (deliver as a page/section)

```
הצהרת נגישות — [שם העסק]
אנו רואים חשיבות עליונה במתן שירות שוויוני לכלל הלקוחות. אתר זה הונגש בהתאם
לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), תשע"ג-2013,
ולתקן הישראלי ת"י 5568 ברמה AA.
התאמות שבוצעו: ניווט מלא במקלדת, תאימות לקוראי מסך, ניגודיות צבעים תקנית,
טקסט חלופי לתמונות, מבנה כותרות תקין, טפסים נגישים. [עדכן לפי האתר בפועל]
חריגות ידועות: [פרט או מחק]
רכז/ת הנגישות: [שם] · טלפון: [מספר] · דוא"ל: [כתובת]
נתקלתם בבעיה? נשמח שתפנו אלינו ונטפל בהקדם.
עודכן לאחרונה: [תאריך]
```

## 4. Phase-7 audit procedure

1. Re-walk checklist §2 item by item against the actual code (not from memory of writing it).
2. Simulate keyboard-only pass through the whole page top to bottom; list every stop.
3. Contrast-check every text/background pair (compute, don't eyeball: relative luminance).
4. Grep for: `outline:none` (without replacement), `onclick` on non-buttons, `placeholder=` on
   labelless inputs, missing `alt=`.
5. Report status in the delivery: "עומד / נדרש מהלקוח / מחוץ לסקופ" per area.
