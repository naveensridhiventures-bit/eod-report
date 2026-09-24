# Sridhi Ventures BOS — Setup Guide (v3.0)
## React Vite PWA + Python API → Single Vercel Deployment

This version unifies everything into **one Vercel project**: the PWA frontend
and the Python backend both deploy together. No separate backend URL needed.

---

## What changed from v2

| v2 (Node.js, 2 deployments)           | v3 (Python, 1 deployment)              |
|----------------------------------------|----------------------------------------|
| Separate `sridhi-sheets-sync/` project | `api/sheets.py` inside the same repo  |
| 4 API fetches on load (one per tab)    | **1 fetch** (`?tab=all`) loads everything |
| No in-process cache                    | 60-second in-memory cache on server    |
| No service-worker caching of API       | Service worker caches API response     |
| Node.js runtime                        | **Python 3.12** runtime                |
| `SYNC_API_BASE` must be set manually   | Same-origin — no URL to configure      |

Result: **first load ~3–4× faster**, repeat visits instant from cache.

---

## Part 1 — Google Sheet (unchanged from v2)

1. Create a Google Sheet named **Sridhi Ventures BOS Data**.
2. Create tabs: `Leads`, `Samples`, `Expenses`, `RepeatCustomers`, `DailyOrders`, `TelecallerActivity`, `MilkDistributors`, `HubDistributors`, `HomeCustomers` (auto-created on first save).
3. Add the header row in each tab (see below).
4. Copy the **Sheet ID** from the URL (`/d/<THIS PART>/edit`).

### Tab headers

**Leads**
```
id  name  contact  business  type  area  address  stage  source  telecaller  lastContact  priority  remarks
```

**Samples**
```
id  customer  leadId  qty  unit  type  date  exec  deliveryCost  productionCost  status  feedback  converted
```

**Expenses**
```
id  category  amount  date  type  subtype
```

**RepeatCustomers**
```
id  name  area  contact  product  qty  frequency  lastOrder  nextDue  status  revenue
```

**DailyOrders** *(telecaller daily order log — New vs Regular conversions, priced at ₹35/KG)*
```
id  date  customer  area  orderType  kgs  amount  telecaller  status  cancelReason  cancelRemarks  createdAt
```
- `orderType` is either `New Order` or `Regular Order`.
- `amount` is auto-calculated in the app as `kgs × 35`.
- `status` is `Active` or `Cancelled`. When a telecaller marks a customer as
  stopped/cancelled, `cancelReason` is one of `Delivery Issue`, `Quality Issue`,
  `Other`, with optional free-text detail in `cancelRemarks`.
- Telecallers can revisit any past date from the app's date picker on the
  **Daily Orders** screen to add, edit, or cancel entries for that day.

**TelecallerActivity** *(daily effectiveness log — Interested / Order / Sample, one row per entry)*
```
id  date  telecaller  type  customer  area  kg  amount  qty  unit  notes  createdAt
```
- `type` is one of `interested`, `order`, or `sample`.
- `interested` rows use `area` and `notes`; `order` rows use `kg` and
  `amount` (auto-calculated in the app as `kg × 35`, editable); `sample`
  rows use `qty`, `unit`, and `notes`. Unused columns are left blank.
- Telecallers log entries from the **Telecaller Activity** screen (mobile:
  under "More"; desktop: sidebar). Management pulls a Team Overview + a
  per-telecaller detail PDF from the same screen, filterable by day, week,
  month, or a custom range.

**MilkDistributors** *(separate mini-pipeline: telecaller cold-calls + sets map location, field sales visits and updates)*
```
id  name  contact  area  address  mapLink  status  telecaller  currentBrand  telecallerRemarks  fieldSalesRemarks  createdAt  lastTelecallerRemarkAt  lastFieldSalesRemarkAt
```
- `currentBrand` is the milk brand the shop currently buys from (e.g.
  "Arokiya", "Aavin") — useful context for the field sales pitch.
- **Bulk Import**: on the Milk Distributors screen, paste rows copied
  directly from Excel/Google Sheets (Customer Name, Phone Number, Area,
  Remarks-as-current-brand, Map Link, Calling Remark, Telecaller Name — in
  any order, with or without a header row). Re-pasting an updated sheet is
  safe: rows are matched by phone number (or name+area) and merged into
  the existing distributor rather than duplicated.
- Only 3 telecallers currently work this list: Azgar (Intern), Sabi
  (Intern), Thulasi — set in `MILK_TELECALLERS` in `src/App.jsx`.
- `status` is one of: New, Contacted, Interested, Visit Scheduled, Visited,
  Onboarded, Not Interested, Lost.
- `telecallerRemarks` and `fieldSalesRemarks` are each a list of structured
  entries (quick-pick tag + free note + who logged it + timestamp), stored
  the same way as `ExistingCustomers.remarks` — JSON-encoded per entry,
  joined with ` || ` in the sheet cell.
- The telecaller sets/edits the Google Maps link for each distributor;
  field sales taps "Open Map" to navigate there, then logs their own visit
  remark (separate tag set from the telecaller's call tags).
- **Milk Distributors** screen (mobile: under "More"; desktop: sidebar) has
  its own PDF report: a Team Overview page (pipeline status breakdown,
  response analysis, by-telecaller table) plus a unified Activity Log page
  of every call and visit, filterable by day, week, month, or custom range.

**HomeCustomers** *(ad-generated home/mixed leads, area-wise; tab is auto-created on first save)*
```
id  name  contact  area  address  mapLink  leadType  source  status  telecaller  distributor  remarks  lastRemarkAt  createdAt
```

**HubDistributors** *(hub-wise distributor tracker: one row per distributor, remark + status trail, up to 5 areas)*
```
id  hub  name  contact  areas  address  mapLink  details  status  telecaller  remarks  createdAt  lastRemarkAt  scheduledVisitAt  scheduledVisitNote
```
- `hub` is the hub this distributor is grouped under (e.g. "Ambattur Hub",
  "Trichy Hub") — filterable on the Hub Distributors screen and in the report.
- `areas` is a JSON array of up to 5 area names this distributor covers
  (e.g. `["Ambattur","Avadi","Padi","Korattur","Mogappair"]`) — entered as
  five separate "Area 1"..."Area 5" fields in the app.
- `details` is free text for basic details (business type, capacity, etc.).
- `status` is one of: New, Contacted, Interested, Visited, Deal Accepted,
  Not Interested, Demanding Something Different, Ring No Response, Busy,
  Wrong Number.
- `remarks` is a list of structured entries — note text, the status at the
  time, which telecaller logged it, and the timestamp — stored the same way
  as `MilkDistributors.telecallerRemarks` (JSON-encoded per entry, joined
  with ` || ` in the sheet cell). Saving a remark also updates the
  distributor's current `status` and `telecaller`.
- **Scheduled Visit reminders**: set a visit date (and optional note) on any
  distributor, at creation or anytime later from its detail screen. An
  attractive glowing banner appears at the top of the Hub Distributors list
  the day of the visit, the day before, and if it's overdue — with a tap
  straight through to that distributor. Each list card also shows a
  color-coded "Visit Today / Tomorrow / Overdue" pill, and a "Show Scheduled
  Only" filter lists just the ones with a date set, soonest first. No new
  sheet tab needed — `scheduledVisitAt` (YYYY-MM-DD) and
  `scheduledVisitNote` are just two extra columns on `HubDistributors`,
  added automatically the next time any row is saved.
- **Unopened lead highlighting**: any distributor with zero remarks logged
  is a lead nobody has actually called yet — it shows with a glowing pink
  border, a pink "🆕 Not Called Yet — Please Call & Update" badge, and the
  name itself in pink instead of white, both in the list and on the detail
  screen. The moment a telecaller saves their first remark it automatically
  flips to normal styling — there's no separate "mark as opened" button,
  saving a remark *is* what opens it. A **"Show Not Called Yet"** filter
  toggle jumps straight to just those. Each telecaller also gets a
  consistent, distinct color badge next to their name everywhere it
  appears, so it's obvious at a glance whose lead is whose.
- **Bulk Import**: on the Hub Distributors screen, paste rows copied from
  Excel/Google Sheets — with or without a header row. Recognized columns
  (any order, any subset): Hub, Name, Phone/Contact, Area, Address, Map
  Link, Details, Remark/Status, Telecaller. A row is imported even if it
  has **only a phone number** (or only a name) — everything else is left
  blank to fill in later; a plain list of phone numbers, one per line, also
  works. An initial remark like "not interested" or "deal accepted" is
  auto-classified onto the matching status. Re-importing an updated sheet
  is safe: rows are matched by phone number (or name + hub) and merged into
  the existing distributor instead of duplicated, and a blank incoming
  cell never overwrites a value that's already there.
- **Split & Assign**: paste a fresh batch of numbers (bulk or one at a
  time — same flexible parsing as Bulk Import, sparse rows welcome) and
  divide it evenly, round-robin, across whichever telecallers you select.
  A **🔀 Shuffle** button re-randomizes who gets which number before you
  commit (purely for fairness/fun — the split stays equal either way, only
  the order changes), with a little bounce animation. Every new
  distributor lands in the same list as everything else; a new
  **Filter by Telecaller** dropdown on the main list lets each person
  filter down to just their own assigned slice to work from. Numbers that
  already exist as a distributor are automatically skipped, not duplicated.
- **Hub Distributors** screen (mobile: under "More"; desktop: sidebar) has
  its own report, filterable by hub, telecaller, and day/week/month/custom
  date range: a **PDF** — Team Overview (pipeline breakdown, response
  analysis, by-telecaller and by-hub tables), a dedicated **Scheduled
  Visits** page (overdue/today/tomorrow/upcoming, color-coded), a **Full
  Distributor Directory** (every distributor's complete profile — contact,
  areas, address, status, telecaller, visit date — regardless of the date
  range), and a detailed **Activity Log** of every remark with date & time
  — plus an **Excel** export (one row per distributor with full remark
  history) — both meant to be shared with management.

---

## Part 2 — Google Cloud Service Account (unchanged from v2)

1. Go to console.cloud.google.com → create project `sridhi-ventures-bos`.
2. Enable **Google Sheets API**.
3. Create a Service Account → download the JSON key file.
4. From the JSON, copy `client_email` and `private_key`.
5. Share your Google Sheet with the service account email (Editor access).

---

## Part 3 — Deploy to Vercel (simplified!)

### 3a. Push to GitHub

```bash
git init
git add .
git commit -m "Sridhi Ventures BOS v3.0"
gh repo create sridhi-ventures-bos --private --push
```

### 3b. Import into Vercel

1. Go to vercel.com → New Project → import your repo.
2. Framework preset: **Vite** (auto-detected).
3. Build command: `npm run build`  Output dir: `dist`
4. Click **Deploy** (it will fail the first time without env vars — that's OK).

### 3c. Set Environment Variables in Vercel Dashboard

Go to your project → Settings → Environment Variables. Add:

| Variable                       | Value                                                     |
|-------------------------------|-----------------------------------------------------------|
| `API_KEY`                     | Any strong random string, e.g. `sk-sridhi-abc123xyz`     |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`| The `client_email` from your service account JSON         |
| `GOOGLE_PRIVATE_KEY`          | The `private_key` value (paste as-is, with `\n` escapes) |
| `GOOGLE_SHEET_ID`             | Your Sheet ID from the URL                                |
| `VITE_API_KEY`                | **Same value** as `API_KEY` above                         |

> ⚠️ `VITE_API_KEY` is baked into the frontend JS at build time (it's the
> client-side key). `API_KEY` is used by the Python server to verify requests.
> They must match.

### 3d. Redeploy

After adding env vars, go to Deployments → Redeploy. Your app should be live at
`https://sridhi-ventures-bos.vercel.app`.

---

## Part 4 — Local Development

```bash
# Install frontend deps
npm install

# Install Python deps
pip install google-auth google-api-python-client

# Create local env file
cp .env.example .env.local
# Edit .env.local — set VITE_API_KEY

# Run Python API locally (port 8000)
python -m uvicorn api.sheets:app --port 8000
# OR for the BaseHTTPRequestHandler style:
# python -c "from http.server import HTTPServer; from api.sheets import handler; HTTPServer(('', 8000), handler).serve_forever()"

# In another terminal, run Vite dev server (proxies /api to port 8000)
npm run dev
```

Open http://localhost:5173

---

## Speed Optimisations Explained

### 1. Batch fetch (`?tab=all`)
On app start, one request fetches all four tabs at once. The Python server
uses `BatchGet` semantics internally — one JWT token, one spreadsheet call.

### 2. In-process server cache
The Python lambda caches results for 60 seconds in module-level memory. Warm
Vercel invocations (which happen within ~5 min of last request) skip the
Google API entirely and return instantly.

### 3. Stale-While-Revalidate in the hook
`useSheets` shows the previous response immediately, then revalidates in the
background. Users see data on screen before the network request completes.

### 4. Service Worker API cache
The PWA service worker (`vite-plugin-pwa` + Workbox) caches the `?tab=all`
response for 120 seconds. On a repeat visit (or after an offline period), the
app loads from the service worker cache with zero network latency.

### 5. Vercel CDN headers
`Cache-Control: public, max-age=30, stale-while-revalidate=60` on the API
route lets Vercel's edge cache the response for 30 s, serving repeat requests
without hitting the Python function at all.

---

## Troubleshooting

| Symptom                        | Likely cause & fix                                           |
|-------------------------------|--------------------------------------------------------------|
| Sync badge shows "Sync failed" | Check `API_KEY` == `VITE_API_KEY` in Vercel env vars        |
| "Missing GOOGLE_SHEET_ID"      | Add `GOOGLE_SHEET_ID` in Vercel env vars                     |
| Sheet reads empty              | Service account not shared on the sheet (Part 2, step 5)    |
| PRIVATE_KEY errors             | Paste the key with literal `\n` in Vercel — it handles them |
| PWA not installing             | Open in Chrome/Edge on Android; Safari on iOS               |

---

## Part 5 — Google Apps Script gateway (current sync path)

`api/sync.py` now reads/writes the Sheet through an Apps Script web app
(`apps-script/Code.gs`) instead of the service account.

1. Sheet → Extensions → Apps Script → paste `apps-script/Code.gs`.
2. Project Settings → Script Properties → add `SCRIPT_TOKEN` (any long random string).
3. Deploy → Manage deployments → ✏️ → Version **New version** → Deploy
   (Execute as **Me**, access **Anyone**). The `/exec` URL stays the same.
4. Vercel → Environment Variables:

| Variable             | Value                                                        |
|----------------------|--------------------------------------------------------------|
| `APPS_SCRIPT_URL`    | *(optional)* your `/exec` URL — defaults to the one in `api/sync.py` |
| `APPS_SCRIPT_TOKEN`  | same value as `SCRIPT_TOKEN`                                 |

5. Redeploy. Test: open the `/exec` URL in a browser → `{"ok":true,...}`.

Set `APPS_SCRIPT_URL` to an empty value to fall back to the service-account path.
