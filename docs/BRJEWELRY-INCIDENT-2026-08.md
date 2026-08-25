# BRJewelry — "הבוט לא פעיל והפולואפים לא עובדים" (2026-08-25)

The client called. Everything the dashboard could see said the bot was healthy:
n8n active, WHAPI connected, inbox draining, zero failed runs, clean output.
This is what was actually wrong, measured against the live project
`kracmhwzmgligxngmhmi` on 2026-08-25 12:40 Israel time.

## 1. The follow-up cascade is switched off

```
app_config.followup_enabled = 'false'
public.followups            = 0 rows
```

`decideSend()` in `lib/bot/followup.mjs` refuses on `!enabled` before anything
else, so the whole two-stage נועה cascade — the one the templates in
`app_config.followup_1_silence` / `followup_2_silence` were written for — has
never sent a single message. The queue table has no rows because nothing
enqueues into it.

This is the entire "הפולואפים לא עובדים" complaint. One UPDATE turns it on,
but it sends real WhatsApp messages to real customers, so it is the shop's call.

## 2. The old ladder stopped on its own around Aug 19

`followups_sent`, per day:

| day | sends |
|-----|-------|
| Aug 16 | 25 |
| Aug 17 | 28 |
| Aug 18 | 25 |
| Aug 19 | 4 |
| Aug 20–23 | 0 |
| Aug 24 | 2 |
| Aug 25 | 0 |

`br_followup_config` still reads `enabled = true, daily_cap = 25`, so the config
did not change — the poller did. The 08:00 "daily media" branch stopped after
Aug 17 and the ladder after Aug 19. Nothing in the dashboard noticed, because a
follow-up engine that stops sending looks exactly like a quiet day.

## 3. Every "אחזור אליך" the bot makes is dropped

`callbacks` has **5 rows, newest 2026-08-11**. Over the same period the bot
promised to get back to a customer 1–3 times a day ("אבדוק עם המנהל ואחזור
אליך", "אחזור לעדכן אותך מחר בבוקר"). Not one of those promises became a
`callbacks` row after Aug 11, so not one of them was ever kept. From the
customer's side this is worse than no bot at all.

## 4. "הבוט לא פעיל" is mostly the 2-hour manual-reply mute

Customer messages over the last 6 days, split by whether a human had sent
anything in that chat in the preceding 2 hours:

| situation | messages | bot answered |
|-----------|---------:|-------------:|
| campaign lead, no human in the last 2h | 91 | 73 (**80%**) |
| campaign lead, human replied in the last 2h | 140 | 31 (**22%**) |
| not a campaign lead | 5 | 0 (**0%**) |

The bot itself is fine — when it is allowed to speak it answers 80% of the time,
in seconds. But **61% of all customer messages land in a chat a human touched in
the last two hours**, and there `human_mode.silenced_until` (owner's manual send
→ +120 min) keeps נועה quiet. The shop sent 220 manual messages on Aug 24 alone.
Every one of them re-armed the mute, so on a busy day the bot is silent almost
everywhere and the shop concludes it is dead.

Two things make it worse:

- `human_mode.active` is a one-way latch. All 495 `active = false` rows share a
  single timestamp (2026-08-11 15:23:59) — a one-off bulk reset. Since then 220
  chats have flipped to `true` and **not one has ever flipped back**. Only
  `silenced_until` actually releases the bot.
- The shop's WhatsApp Business auto-greeting ("הייי איזה כיף שפנית אלינו")
  counts as a manual send. It fires on new chats 2–5 times a day and mutes נועה
  for two hours on a brand-new lead's first message.

Separately: the bot answers **only** chats in `campaign_contacts`
(`campaign_allow_ad_ids = 120245039214750123`). Organic leads who message the
shop directly get the auto-greeting and then nothing.

## 5. Why nobody knew for five days

Every detector in `lib/monitor/detectors.ts` reported this bot healthy the whole
time. `BOT_SILENT` measures customers going quiet; here the customers never
stopped writing — the bot did. Nothing measured the one thing the client
actually pays for: the share of conversations the bot itself carries.

`BOT_NOT_ANSWERING` (added in this branch) closes that gap. Replaying its exact
production query at 2026-08-24 12:00, the moment the complaint came in:

```
prior 7 days : 54 chats, 31 answered → 0.574
last 24 hours: 13 chats,  2 answered → 0.154   → fires, severity high
```

It is judged against the bot's own history, never a fixed number, so T center —
a human-heavy מוקד that has run at 0.139 coverage all week without being broken
— stays quiet.

## Open items for the shop (not applied — each one talks to customers)

1. `update app_config set value = 'true' where key = 'followup_enabled'`.
2. Find out why the `BRJewelry Followups` poller stopped on Aug 19 and restart it.
3. Re-wire the callback capture: a bot that says "אחזור אליך" must write a
   `callbacks` row, or stop saying it.
4. Decide the human-takeover rule. 120 minutes per manual message is what makes
   the bot look dead on a busy day; a shorter window, or a mute that only counts
   a real reply rather than the auto-greeting, would give most of it back.
5. Exclude the WhatsApp Business auto-greeting from the takeover trigger.
6. Decide whether organic (non-campaign) leads should get נועה at all.
7. `RLS` is off on 7 tables in this project (`app_config`, `inbox`,
   `campaign_contacts`, `followups_sent`, `br_followup_config`,
   `br_group_outbox`, `message_buffer`) — the anon key can read and write all
   of them. Enabling RLS without policies blocks everything, so it needs a
   policy pass, not a blind ALTER.
