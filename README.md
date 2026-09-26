# Team Pulse — Daily EOD Performance App

React + Vite PWA. Google Sheets is the database (through a free Google Apps Script web app).

Every employee signs in with their name and a 4-digit PIN, fills in the numbers for their role, writes their wins, challenges and plan for tomorrow, and submits. Management sees a live team dashboard, gets an email summary every evening, and can download weekly, monthly or custom-date reports as Excel, PDF or CSV.

## What each role reports

**Telecallers** paste their lists in bulk every day (copy from Excel, WhatsApp or notes — one line per entry, or upload an Excel/CSV):

| Import | Line format | What the app does |
|---|---|---|
| Calls | name, number, remarks | Counts calls and tags each as Interested / Call back / Not interested / No answer from the remarks. Interested calls are highlighted to management. |
| Orders | name, number, product, qty + unit, amount | Adds up sales ₹, **kg** and **litres** (g and ml are converted). |
| Customers | name, number, area, new/existing | Keeps each telecaller's customer list (one row per number) — new vs existing. |
| Cancellations | name, number, product, qty, amount, reason | Counts cancelled orders and value lost. |

**HR** pastes their candidate calls: name, number, position, remarks. Each is tagged Interview scheduled / Joined / Driver arranged / Relieved / Not interested / No answer / Called, so the app counts calls, scheduled, joined and relieved.

**Developers** write what they worked on as text (plus blockers).

**Sales head** (Naveen) gets all of the above plus a team update box.

**Every import starts with a list title** (e.g. *Driver*, *Call driver*, *Sales*, *Distributor hiring*). The title is saved on every row of that list, shown in the dashboard's "By list title" table, the Call data filter, the Excel "By title" sheet and the emails.

Everyone can add wins, challenges, a plan for tomorrow and a day rating. Calls and HR calls also carry a follow-up date (see *CRM* below). The status picked from remarks can be changed on the preview screen before saving.

Excel uploads need a header row. Recognised headers include: Name, Number/Mobile/Phone, Remarks, Status, Product, Qty, Unit, Amount, Area, Type, Reason, Position.

Team setup (edit in the Google Sheet's `Employees` tab once live):

| Person | Roles | Demo PIN |
|---|---|---|
| Naveen | Sales head + sales + hiring + development (admin) | 1111 |
| Imran | Development | 2222 |
| Thulasi | Sales & telecalling | 3333 |
| Azgar (intern) | Sales & telecalling + hiring | 4444 |
| Sabi (intern) | Sales & telecalling + hiring | 5555 |
| Mohammed Umar | HR & hiring | 6666 |
| Management | View-only dashboard + downloads | 9999 |

**Change every PIN before going live.**

---

## Filling the report fast

The Today screen is built so people log work as it happens and the report writes itself:

- **Quick log** — type the number (and name if you like), then tap the result: *Interested*, *Call back*, *No answer*… One tap saves it; the form clears and the cursor jumps back to the number box for the next call. Orders, customers and cancellations save with **Enter** or the Add button. Entries save in the background, so you can keep typing.
- **List title remembered** — the last title you used (Sales, Driver…) is pre-selected; switch with one tap or add a new one.
- **Follow-ups due** — every *Call back* and *Interview scheduled* from the last 7 days that hasn't been called again appears at the top with a Call button and one-tap results. Tapping a result logs today's follow-up.
- **Paste a whole list** is still there for bulk entry. The last title is filled in, and pasting into the empty box reads the list straight away.
- **Notes are optional** — a one-tap day rating, and wins / challenges / tomorrow's plan tucked behind one button (yesterday's plan is shown as a reminder). Every text box has a **Speak** button for voice typing (Chrome on Android, Safari on iPhone).
- **Drafts save automatically** — anything typed is kept on the phone, so closing the app or losing signal loses nothing.
- **Submit bar** shows the day in one line (e.g. *24 calls · 5 interested · 2 orders · ₹6,900*) next to the Submit button.

## CRM: contacts, follow-ups and reminders

- **Follow-up on every call.** When you save a call as *Interested* or *Call back* (or an HR call as *Interview scheduled*), it gets a follow-up date. The app reads it from the remarks — "call back tomorrow 5pm", "monday 11am", "after 3 days", "29/9", and Thanglish like "naalaiku saayangalam call pannunga" or "nalaiku 6 mani". Nothing in the remarks? Call back → next day, Interested → in 2 days. Or tap *Tomorrow / In 3 days / Next Monday / Pick date*.
- **Follow-ups inbox** on the Today page: *Overdue / Today / Upcoming*. Call or WhatsApp, then tap the result — it's logged for today. *Later ▾* moves it to another day, adds it to Google Calendar, or closes it. Calling the same number again (and logging it) replaces the old follow-up automatically.
- **Contacts page (CRM tab)** — one card per phone number with every call, order, cancellation and HR call in a timeline, total sales, last contact and next follow-up. Search by name, number, area or notes; filter by *Follow-up due / Interested / Customers / Candidates*; log a call or an order straight from the contact; export to Excel. Admins can see the whole team or one person.
- **Reminders**
  - Red badge on the Today tab with how many follow-ups are due.
  - *Turn on reminders*: phone notification with the day's count, and 5 minutes before each timed follow-up (while the app is open or in the background).
  - *Add all to calendar*: downloads every follow-up as a calendar file with alarms — works even when the app is closed.
  - **Morning email (about 9 AM, Mon–Sat)** to each person: overdue, today and the next 3 days, with tap-to-call, WhatsApp and calendar links. Each person saves their email on the Contacts page (PIN needed), or fill the `email` column in the Employees tab. Admins can also send management a daily overdue list (Email settings).
- **✨ English button** on remarks and every notes box: turns Thanglish or rough English into clear English, with Undo. *Convert remarks to English* on the bulk-import preview does a whole list at once. *Speak* now has an **EN / தமிழ்** switch — speak Tamil, then tap English.

## Call queue, hiring pipeline, targets & auto call log

- **Auto call log.** Tap **Call** anywhere in the app (Today, a lead, a follow-up, a contact, a candidate). The phone dialer opens; when you come back, the app asks *How did the call go?* with the talk time already measured. Tap the result — it's logged, with the follow-up, and the next lead is ready. On the Today screen you can also type a number and tap **Call now**.
- **Call queue.** Admins open **Call queue** (Leads), paste or upload a list (name, number, area, notes), and pick who calls it — it's split evenly. Before assigning, the app removes repeats in the list, numbers already in someone's queue, do-not-call numbers, existing customers and numbers called in the last 30 days. Each person sees one big *next call* card on Today with Call, WhatsApp, Skip and *Don't call*. Admins see progress per list and person, can move someone's uncalled leads to another person, or remove the uncalled ones.
- **Duplicate warning.** Typing a number shows who called it last and what happened ("Thulasi called Ramesh Traders 2 days ago · Interested"), and blocks numbers on the **do-not-call list**.
- **Hiring pipeline.** Candidates move Contacted → Scheduled → Attended → Selected → Joined (or Dropped). After an interview date the follow-up asks *Did they come?* (Attended / No-show). Selected people get a *Confirm joining* follow-up, and joiners get a day-7 check-in (*Still working* / *Relieved*). The page shows the funnel, the **show-up rate** and no-shows, and **open positions** with headcount (e.g. Driver 2/5 filled).
- **Targets & performance.** Admins set daily targets (Settings → Daily targets; per person or for everyone). Everyone sees progress bars on Today. The **Performance** page shows sales and hiring funnels, talk time, **follow-ups called on time**, days the target was hit, a day-by-day chart, a leaderboard, and a **PDF** report per person or the team.

### After updating Code.gs for this version

Paste the new `Code.gs`, run **setup** once (it adds the *Leads*, *Do Not Call* and *Openings* tabs and the new columns), then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.

### Turning on the reminder emails and the English button

1. Paste the new `apps-script/Code.gs` into Apps Script and save.
2. Run **setup** once (adds the new settings; your data stays).
3. Run **createFollowUpTrigger** once (the 9 AM reminder emails). **sendTestFollowUps** sends today's emails straight away.
4. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** (same URL).
5. Optional, for proper English sentences: **Project Settings ⚙️ → Script properties → Add script property**: `ANTHROPIC_API_KEY` (Claude, from console.anthropic.com) *or* `GEMINI_API_KEY` (from aistudio.google.com). Run **testPolish** to check it. Without a key the button uses a basic word list, and Tamil script goes through Google Translate.
6. Check **Project Settings → Time zone** is *(GMT+05:30) India Standard Time* so "today" and 9 AM are right.

## 1. Run it locally (demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no Sheet connected, the app runs in demo mode with 40 days of sample data saved in your browser, so you can try everything straight away.

## 2. Connect Google Sheets

1. Create a new Google Sheet (e.g. "Team Pulse Database").
2. **Extensions → Apps Script**. Delete the sample code, paste all of `apps-script/Code.gs`, click **Save**.
3. In the function dropdown pick **setup** and click **Run**. Approve the permissions. This creates the tabs `Employees`, `Reports`, `Calls`, `Orders`, `Customers`, `Cancellations`, `HR Calls` and `Settings`.
4. Open the `Settings` tab and set `MANAGEMENT_EMAILS` (comma-separated) and `COMPANY_NAME`.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy and copy the URL ending in `/exec`.
6. The live URL is set in `src/lib/api.js` (`DEFAULT_API_URL`). To use a different Sheet, replace it there, or put `VITE_SHEETS_API_URL=...` in a `.env` file.
7. Restart `npm run dev`. The demo banner disappears — you're live.
8. Back in Apps Script, run **createDailyTrigger** once. Management now gets the team summary email every day at about 8 PM.

> When you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the same URL keeps working.

## 3. Publish the app

```bash
npm run build
```

Upload the `dist` folder to any static host — Netlify, Vercel, Firebase Hosting or Cloudflare Pages (all free). Add `VITE_SHEETS_API_URL` in the host's environment settings before building there.

Employees open the link on their phone and choose **Add to Home Screen** (Android: Chrome menu → Install app; iPhone: Safari → Share → Add to Home Screen). It then opens full-screen like a normal app.

## How reports reach management

Reports are emailed to **hiring.sridhiventures@gmail.com** by default. Admins (Naveen, Management) can change the addresses, company name and app link under **Email settings** in the app — saving asks for the admin PIN.

The email shows counts at the top, then **interested customers** and **interviews scheduled** in full (name, tap-to-call number, remarks, who called), grouped by list title. Everything else is shown as counts only. Run `sendTestEmail()` in Apps Script to preview it.

- **Every submission** → emailed to management instantly (turn off with `NOTIFY_ON_SUBMIT = no` in Settings).
- **Every evening** → one team summary email, showing who submitted and who didn't.
- **Share on WhatsApp** button after each submission, pre-filled with the formatted EOD.
- **Team dashboard** (Naveen and Management) with today's check-in, KPIs, charts and per-person tables.
- **Call data** page → search and filter every call, order, customer, cancellation and HR call by date, person and status; download any list to Excel.
- **Download reports** → This week / Last week / This month / Last month / Custom dates, whole team or one person, as Excel (summary, interested calls, all calls, orders, cancelled, customers, HR calls, daily updates) or PDF (simple report with interested calls highlighted).

## Customising

- Statuses, import columns and text boxes: `src/config/team.js`. Keyword rules for auto-tagging: `src/lib/parse.js`.
- Add a new employee: add a row to the `Employees` tab. `roles` is a comma-separated list of `telecaller`, `hiring`, `developer`, `saleshead`. Set `isAdmin` to `yes` to give dashboard access.
- Colours and fonts: the variables at the top of `src/styles.css`.

## Project structure

```
apps-script/Code.gs        Google Sheets backend + emails
src/config/team.js         Roles, metrics, default team
src/lib/api.js             Talks to the Sheet (or demo storage)
src/lib/parse.js           Reads pasted lists / Excel files, tags status
src/lib/stats.js           Counts, kg/litre totals, per-person numbers
src/lib/reports.js         WhatsApp text + Excel / PDF export
src/components/Records.jsx Bulk import screen + record tables
src/pages/                 Login, DailyEntry, MyReports, TeamDashboard, RecordsPage, ReportsCenter
```

## A note on security

PINs are a light lock suited to a small internal team. The Apps Script URL is public, so don't share it outside the company, and keep sensitive data (salaries, phone numbers) out of the reports.
