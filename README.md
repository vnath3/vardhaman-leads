# Vardhaman Academy: leads and dashboard (phase 1)

A one-step lead form plus a small private dashboard. Plain Node 22, no dependencies, runs on Netlify.

| Part | What it does |
|---|---|
| `public/widget/lead.js` | The form: parent's name, mobile, class. Saves with one tap. Also counts anonymous form views and call / WhatsApp / map taps. |
| `netlify/functions` | `/api/lead` (save a lead), `/api/event` (anonymous counts), `/api/admin/*` (login, data, status). |
| `lib/store.mjs` | Storage adapter. Google Sheets today; swap this one file for a database later. |
| `public/ops-5847bf98d902/` | The dashboard (unlisted path, behind a password). |

## How data flows

```
Parent submits form -> /api/lead -> checks (spam, rate limit, duplicate) -> Google Sheet "leads" tab
Parent taps call/WhatsApp -> /api/event -> Google Sheet "events" tab (no personal data)
Rushabh Sir opens dashboard -> password -> reads the Sheet -> changes status / adds notes -> written back
```

Lead statuses: new, contacted, hot, demo_booked, enrolled, lost.

## Privacy

- The form collects only what a parent types: name, mobile, class. A consent line sits under the button; the consent version is stored with each lead.
- Anonymous events never include a name or number.
- Secrets live in Netlify environment variables, never in this repo.
- The dashboard path is only unlisted. The password is what protects the data.

## Setup

See [docs/SETUP.md](docs/SETUP.md).

## Develop and test

```
npm test                       # 12 tests
LOCAL_STORE=1 npm run dev      # http://localhost:8888 with a local test store
node scripts/seed-demo.mjs .data   # fictional demo leads
```

Mockups (real screenshots with fictional data) are in [docs/mockups](docs/mockups).
