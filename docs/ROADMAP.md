# מפת דרכים לשדרוג: מ-MVP ל-SaaS מקצועי

מתוך פאנל 6 עדשות מומחים, מסונן ומסודר לפי ROI עבור מפעיל-יחיד שרוצה מוצר רציני. כל פריט בנוי על מה שכבר קיים ועל הנתונים האמיתיים של שני הבוטים. תג `[S/M/L · data]` = מאמץ + על איזה דאטה/API נשען.

---

## ⚡ Quick wins (השבוע)

### שליטה בשיחה (השתלטות אנושית)
- **מתג "השתלטות אנושית" בתוך השיחה** — כפתור Bot ON/Human + "השתק ל-30 דק'/שעתיים" בכותרת ה-thread, שכותב ל-`human_mode` (upsert על `chat_id`, `active`+`silenced_until`); הופך עריכת DB ידנית לכפתור אחד. `[M · human_mode upsert / WHAPI thread]`
- **רשימת השתלטויות תקועות (Watchlist)** — תצוגה של כל 340 ה-`active=true` ב-`human_mode` ממוינות לפי משך, מסמנת שיחות שעברו את `silenced_until`. `[S · human_mode read + guarded UPDATE]`

### אמינות (התור התקוע של T center)
- **מוניטור תור כושל/תקוע ב-inbox** — שלושה buckets חיים: FAILED, STUCK (`processing` + `processed_at IS NULL` ישן), RETRY-EXHAUSTED (`attempts>=3`), עם תג בריאות ב-Overview. `[M · inbox status/attempts/error/processed_at]`
- **Requeue בלחיצה אחת** — כפתור על שורה כושלת שמאפס `status='new'` ומנקה error דרך Management SQL, עם אישור וכובע attempts. `[M · inbox UPDATE + audit_log]`
- **דריל-דאון לשגיאות n8n** — לחיצה על execution כושל מציגה את ה-node שנפל + ההודעה + ה-input, פלוס failure-rate ל-24ש'. `[M · n8n GET /executions/{id}?includeData]`

### כסף (תורי גבייה)
- **רשימת רדיפה אחרי תשלומים פתוחים** — worklist של 89 ה-orders ב-`status='open'` עם `payment_link`, וכפתור "שלח שוב קישור" דרך WHAPI; מכבד `human_mode.active`. `[M · orders + WHAPI send]`
- **קוקפיט הכנסות T center** — סכום `total` paid לפי יום/שבוע, המרה open→paid, AOV. `[M · orders aggregates via SQL]`

### דאשבורד יומי + AI
- **דיג'סט יומי חוצה-בוטים (AI)** — קריאה אחת ל-Claude שמגלגלת 24ש' (הכנסות, לידים, כשלים, שגיאות) → כותרות + אנומליות + to-do. `[M · cross-bot aggregates + 1 Claude call]`

---

## 🏗️ ליבת SaaS מקצועי

### זהות, הרשאות ואמון
- **Auth אמיתי עם משתמשים, תפקידים והזמנות** — control-plane Supabase עם `app_users`/`invites`/`sessions`, תפקידי owner/operator/viewer. `[L · control-plane + middleware.ts]`
- **Audit log לכל פעולה מיוחסת** — טבלת `admin_audit` מכל route מוטציה (toggle, send, `runSql`). `[M · wraps runSql/setWorkflowActive/sendText]`
- **מרכז הקשחת RLS** — סורק `pg_policies`, מסמן את 6 הטבלאות החשופות, כפתור remediation שמפעיל RLS. `[M · pg_tables/pg_policies + apply-migration]`

### Onboarding וזהות-בוט
- **אשף onboarding לבוט (בלי redeploy)** — `bot_registry` במקום env: פרויקטים לא-ממופים, שם, WHAPI token, "test connection". `[L · listProjects + WHAPI test]`
- **מיתוג והגדרות לכל בוט** — שם ידידותי, צבע, logo ב-`bot_registry`. `[M · bot_registry + app_config]`

### inbox כמרכז עבודה
- **תור "צריך אדם" מאוחד** — מיזוג WHAPI + DB לפי `chat_id`: `human_mode.active`, unread, `inbox` כושל. `[M · human_mode + inbox + WHAPI]`
- **פאנל פרופיל לקוח (join לפי chat_id)** — כרטיס ב-thread: orders+payment_link+human_mode (T center) / leads+activities (BRJewelry). `[L · joined on chat_id]`
- **תבניות תשובה עם משתנים** — קיצור "/" עם תשובות ב-`app_config`, מילוי `{{order.total}}`. `[M · app_config + WHAPI send]`

---

## 💰 כוח לניהול העסק

### CRM ופגישות (BRJewelry)
- **Kanban לפייפליין לידים** — לוח גרירה לכל `leads.status`, גרירה מעדכנת status + כותבת `activities`. `[L · leads UPDATE + activities]`
- **יומן פגישות + תזכורות WhatsApp** — לוח מ-`appointment_at`, watcher ל-no-show, תזכורת WHAPI. `[M · leads.appointment_at + WHAPI]`

### החלטות והכנסה
- **רצף KPI יומי חוצה-בוטים** — היום מול אתמול מול ממוצע 7 ימים, עם delta ו-sparklines. `[M · orders + leads date-buckets]`
- **תור שחזור הזמנות נטושות** — מפריד "לא שילם" מ-"הצינור נשבר": orders open ישנים מול orders עם inbox failed. `[L · orders + inbox.failed + human_mode]`
- **לקוחות חוזרים / CLV לפי chat_id** — קונים עם >1 paid, lifetime value, זמן בין הזמנות. `[M · orders grouped by chat_id]`

### תובנות (Analytics)
- **מסך Analytics לכל בוט** — heatmap 7×24 לשעות עומס, קו הכנסות, זמן-תגובה חציוני. `[M · inbox/audit_log/orders/leads]`
- **ROI לפי מקור ליד** — `leads` GROUP BY `lead_source`, advancement-rate + won-rate. `[M · leads aggregates]`

---

## 🚀 מתקדם / עתיד

### מנוע אירועים והתראות
- **Cron לזיהוי אירועים + לוג מתמשך** — Vercel Cron כל 60ש' diff-mode → `dashboard_events` (BOT_DOWN, FAILED_SPIKE, PAYMENT_RECEIVED...). `[L]`
- **Fan-out: Web Push + Telegram + Email** — `dispatchEvent()` לפי ערוץ עם dedup. `[M · VAPID/Telegram/Resend]`
- **מנוע חוקים no-code** — if X then notify/act, על אוצר-המילים האמיתי. `[L]`
- **Webhook נכנס ל-real-time אמיתי** — endpoint מאומת-secret שמקבל push מ-WHAPI/n8n ומבטל lag. `[M · /api/hooks + HMAC]`

### AI עמוק
- **AI brief + next-best-action בכל thread** — Claude → סיכום + מצב עסקה + תשובה מוכנה. `[M]`
- **זיהוי לקוחות מתוסכלים להעברה לאדם** — תור מדורג escalation-risk + "השתלט". `[L]`
- **שאילתה בשפה טבעית על הנתונים** — Claude → SELECT בטוח על הסכימה מ-`introspect()`. `[L]`
- **תיוג sentiment/intent + topic clustering** — סיווג batched של הודעות נכנסות. `[M]`

### יצוא ואינטגרציות
- **יצוא CSV + סנכרון Google Sheets** — על orders/leads (שיטוח `order_snapshot`). `[M]`
- **סנכרון יומן (ICS/Google) למפגשים** — feed ICS מ-`appointment_at` + תזכורת WHAPI. `[M]`

---

## ההמלצה: מאיפה להתחיל

1. **אמינות + שליטה בשיחה (השבוע)** — מוניטור התור הכושל + Requeue + מתג ההשתלטות + Watchlist של 340 ה-active. אלה הדליפות שמדממות עכשיו (~30 הודעות/יום נופלות, 340 שיחות שהבוט שותק בהן).
2. **כסף + קריאת בוקר** — רדיפה אחרי 89 ההזמנות הפתוחות + קוקפיט הכנסות + דיג'סט AI יומי.
3. **ליבת SaaS** — Auth + Audit + הקשחת RLS, לפני שמכניסים VA/לקוח.

לאחר מכן מנוע האירועים (Cron→events→fan-out) פותח את כל שכבת ה-AI והאוטומציה בלי לבנות פעמיים.
