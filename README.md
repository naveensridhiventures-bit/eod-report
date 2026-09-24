# Team Pulse — Daily EOD Performance App

React + Vite PWA. Google Sheets is the database (through a free Google Apps Script web app).

Every employee signs in with their name and a 4-digit PIN, fills in the numbers for their role, writes their wins, challenges and plan for tomorrow, and submits. Management sees a live team dashboard, gets an email summary every evening, and can download weekly, monthly or custom-date reports as Excel, PDF or CSV.

## What each role reports

| Role | Numbers tracked |
|---|---|
| Sales & telecalling | Calls made, connected, new leads, follow-ups, **orders converted**, **sales value**, **orders cancelled**, cancelled value, callbacks pending, cancel reasons |
| HR & hiring | Candidates sourced, candidate calls, **interviews scheduled**, attended, selected, **hired / joined**, **call drivers arranged**, no-shows, positions |
| Development | Tasks completed / in progress, bugs fixed, features shipped, deployments, hours, project, blockers |
| Sales head | Team revenue, client meetings, new clients, pipeline value, escalations, team reviews, strategy notes |

Everyone also fills: **Wins today**, Challenges, Plan for tomorrow, and a day rating.

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

## 1. Run it locally (demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no Sheet connected, the app runs in demo mode with 40 days of sample data saved in your browser, so you can try everything straight away.

## 2. Connect Google Sheets

1. Create a new Google Sheet (e.g. "Team Pulse Database").
2. **Extensions → Apps Script**. Delete the sample code, paste all of `apps-script/Code.gs`, click **Save**.
3. In the function dropdown pick **setup** and click **Run**. Approve the permissions. This creates three tabs: `Employees`, `Reports`, `Settings`.
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

- **Every submission** → emailed to management instantly (turn off with `NOTIFY_ON_SUBMIT = no` in Settings).
- **Every evening** → one team summary email, showing who submitted and who didn't.
- **Share on WhatsApp** button after each submission, pre-filled with the formatted EOD.
- **Team dashboard** (Naveen and Management) with today's check-in, KPIs, charts and per-person tables.
- **Download reports** → This week / Last week / This month / Last month / Custom dates, whole team or one person, as Excel (summary + a sheet per role + daily notes), PDF or CSV.

## Customising

- Add or rename fields: `src/config/team.js` (the Sheet adds new metric columns automatically).
- Add a new employee: add a row to the `Employees` tab. `roles` is a comma-separated list of `telecaller`, `hiring`, `developer`, `saleshead`. Set `isAdmin` to `yes` to give dashboard access.
- Colours and fonts: the variables at the top of `src/styles.css`.

## Project structure

```
apps-script/Code.gs        Google Sheets backend + emails
src/config/team.js         Roles, metrics, default team
src/lib/api.js             Talks to the Sheet (or demo storage)
src/lib/reports.js         Totals + Excel / PDF / CSV export
src/pages/                 Login, DailyEntry, MyReports, TeamDashboard, ReportsCenter
```

## A note on security

PINs are a light lock suited to a small internal team. The Apps Script URL is public, so don't share it outside the company, and keep sensitive data (salaries, phone numbers) out of the reports.
