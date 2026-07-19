# Awaj ET — Mission Control

Client lead management for the agency. Next.js (App Router) + Tailwind CSS 4 + Appwrite, styled to the Awaj ET brand guide (Solar Gold on Ink Navy, Space Grotesk / Inter / JetBrains Mono).

## Features

- **Dashboard** — open pipeline value, won-this-month, win rate, stage breakdown, lead sources, overdue follow-ups, recent leads.
- **Pipeline** — kanban board across New → Contacted → Qualified → Proposal → Won / Lost. Drag cards between stages; stage changes are logged automatically.
- **Lead detail** — value, services, owner, follow-up date, mark-lost with reason, and a full activity timeline (notes, calls, emails, meetings, stage history).
- **Contacts** — searchable/filterable table shared with the email outreach system, plus CSV import (skips duplicate emails) and quick contact → lead creation.
- **Send email** — manual one-off sends copied from the outreach app: template-based (cold/nurture/transactional templates from `emails/`) or free-text compose with attachments (browser-uploads to Appwrite Storage, 15 MB max). Same pipeline: approved senders list (`lib/senders.ts`), suppression check, shared `sends` log, List-Unsubscribe headers. Unsubscribe links and the email logo are served by the outreach app (`OUTREACH_APP_URL`).
- **Notifications** — Resend email to the team (`NOTIFY_EMAILS`, comma-separated) whenever a contact is created with any source other than `manual`. CSV imports send one digest email instead of one per row. Uses the same Resend account/domain as the outreach app, sent from `FROM_TRANSACTIONAL`; failures are logged but never block contact creation. Set `APP_URL` for the "Open contacts" button in the email.
- **Segmentation** — namespaced tags on the existing `tags` attribute (`prefix:value`). Recognized prefixes: `ind:` industry, `svc:` service interest, `size:` company size, `tier:` tier, `rel:` relationship (`rel:prospect`/`rel:client`/`rel:past-client`), `loc:` location, `lang:` language. Click segment chips above the contacts table to filter (multiple chips = AND); edit a contact's tags via the ✎ button in its row. The same tags can drive campaign targeting in the email system.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Appwrite credentials
npm run db:setup             # creates leads + activities collections, extends contacts
npm run dev
```

### Database changes (`npm run db:setup`, idempotent)

| Collection | Change |
|---|---|
| `contacts` | + `phone` (string, optional), + `jobTitle` (string, optional). `source` enum gains `referral`, `website` — if your existing `source` is an enum attribute, add those two elements in the Appwrite console (SDKs can't always edit enum elements in place). |
| `leads` *(new)* | `contactId`, `title`, `stage` enum, `value`, `currency`, `services[]`, `owner`, `priority` enum, `nextFollowUpAt`, `closedAt`, `lostReason`. Indexed on `stage`, `contactId`. |
| `activities` *(new)* | `leadId`, `contactId`, `type` enum (`note/call/email/meeting/task/stage_change`), `body`, `createdBy`, `occurredAt`. Indexed on `leadId`. |

All existing email-system collections (`campaigns`, `sequences`, `sends`, `suppressions`, …) are untouched; their types now live in `lib/email-types.ts` and are still exported from `lib/appwrite.ts`, so existing imports keep working.

### Why leads are separate from contacts

A contact is a person (shared with cold email); a lead is a deal. One contact can have several leads over time, and cold-email contacts don't pollute the sales pipeline until you deliberately create a lead for them.

## Structure

```
app/            pages (dashboard, /pipeline, /leads/[id], /contacts) + server actions
components/     client components (board, forms, table, sidebar)
lib/domain.ts   client-safe types, constants, formatters
lib/appwrite.ts server-side Appwrite client + helpers (extends your original file)
lib/data.ts     queries + dashboard metrics
scripts/        setup-db.ts
```

CSV import expects headers like `email, first name, last name, company, phone` (aliases handled).

Note: `next/font` downloads Google fonts at build time, so the first build needs internet access.
