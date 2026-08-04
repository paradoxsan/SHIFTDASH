# Content Template — what goes in the DIGIM creative-ideas doc

This is the **content** side of the deliverable (the Hebrew that goes in). The **render** —
how it becomes the branded PDF — lives in `digim_pdf_output.md` and `scripts/build_pdf.py`.
Client-facing text is **Hebrew**. The final deliverable carries **10 concept cards**.

The PDF itself (matching the DIGIM template) contains the header + the 10 concept cards. The
trend snapshot and competitor benchmark below are **research artifacts** you reason from and can
share in chat / an internal note; they are not pages in the client PDF unless the user asks.

---

## Concept card — the 4-section structure (repeat ×10)

Every idea uses exactly these four headings, in order:

```
N. [שם הקונספט]

תיאור הרעיון
[פסקה אחת: מה הצופה רואה / הרעיון. ההוק ותמצית זרימת השוטים מקופלים לתוך הפרוזה.]

מטרה
[משפט או שניים: למה הרילס הזה — מודעות / שמירות ושיתופים / לידים / תנועה.]

תסריט / פורמט
[רשימה ממוספרת, ביט-אחר-ביט: שלבי הסרטון.]

אלמנטים ויזואליים
[בולטים: סגנון צילום/עריכה; סוג הסאונד (לסמן "מוצע" אם לא אומת טרנד בלייב); סגנון הטקסט
על המסך; וכל אילוץ קשיח (למשל "ילדים מצולמים רק בהסכמת הורה, בטשטוש").]
```

What is **not** in the client PDF (no slot in the template): captions, hashtags, AI-generation
prompts. Develop them if useful and deliver them as a separate internal production sheet.

Build every card to fit the production answers from the production checkpoint (don't propose a
two-person skit if only one person films; give a no-kid fallback where kids aren't guaranteed).

---

## Research artifacts (reason from these; share in chat or an internal note)

**Trend snapshot — מה עובד עכשיו ב[נישה]:** a short paragraph on the formats producing
engagement in the niche this period, and why. Mark numbers verified (seen live) or estimated.

**Competitor benchmark:**
| חשבון | הזווית/פורמט שבולט | מעורבות | קישור |
|-------|---------------------|----------|--------|
| @[חשבון] | [תיאור קצר] | [מאומת / הערכה ~ / לא נמדד בלייב] | [קישור אמיתי] |

Every row needs a real, working link. No link → not a specific example (informs only a general
note). Engagement is verified only if seen live; otherwise label it.

**Optional "טרנד שעובד כרגע" card:** like the original DIGIM example, this card pairs the idea
with real reel links of the trend. Include it **only** if you pulled those links live — never
fabricate links to fill the slot.

---

## Filled example (one card, kids' play center, organic IG)

```
1. סיבוב הבוקר

תיאור הרעיון
סרטון לו-פיי שמתעד את המתחם בשעת הבוקר, לפני שהוא נפתח לקהל. יוצרת התוכן עוברת עם המצלמה בין
האזורים ומראה את מה שההורים בדרך כלל לא רואים: בדיקת הטרמפולינות, ניקיון המתקנים בין הסבבים,
ואזור הפעוטות הנפרד. הצילום מכוון להרגיע את ההורה המהסס ולבסס תחושת ביטחון לפני שהוא מגיע.

מטרה
בניית אמון ומודעות. תוכן "הוכחה" שכמעט אף מתחרה לא מעלה, שמייצר שמירות ושיתופים בקבוצות הורים.

תסריט / פורמט
1. פתיחה: המתחם ריק ושקט באור בוקר, כניסה בתנועה חלקה עם המצלמה
2. תקריב — יד בודקת את הרשתות והקפיצים של הטרמפולינה
3. ניגוב ידיות ומתקנים, בדיקה של בריכת הספוגים
4. מעבר לאזור הפעוטות הנפרד, דגש על הריצוף הרך
5. סיום על הלוגו עם המשפט: "מוכנים אליכם"

אלמנטים ויזואליים
● צילום ידני ואותנטי, ללא עריכת יתר
● מוזיקה אקוסטית חמימה ורגועה (סאונד מוצע)
● כיתובי טקסט קצרים שמלווים כל שלב
```

This card → one entry in `content.json["ideas"]` → rendered by `scripts/build_pdf.py`.
