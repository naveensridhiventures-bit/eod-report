/**
 * TEAM PULSE — Google Sheets backend
 * ------------------------------------------------------------
 * 1. Create a new Google Sheet → Extensions → Apps Script.
 * 2. Paste this whole file into Code.gs and save.
 * 3. Run  setup()  once (approve the permissions).
 * 4. Deploy → New deployment → Web app
 *      Execute as: Me      Who has access: Anyone
 *    Copy the /exec URL into the app's .env as VITE_SHEETS_API_URL
 * 5. Run  createDailyTrigger()  once to email management every evening.
 */

var SHEET_EMPLOYEES = 'Employees';
var SHEET_REPORTS = 'Reports';
var SHEET_SETTINGS = 'Settings';
var BASE_HEADERS = ['id', 'date', 'employeeId', 'name', 'roles', 'submittedAt', 'mood', 'positives', 'challenges', 'tomorrow', 'notes'];

// Human-friendly labels used in the emails
var LABELS = {
  calls_made: 'Calls made', calls_connected: 'Calls connected', leads_generated: 'New leads', followups_done: 'Follow-ups',
  orders_converted: 'Orders converted', sales_value: 'Sales value (₹)', orders_cancelled: 'Orders cancelled',
  cancelled_value: 'Cancelled value (₹)', callbacks_pending: 'Callbacks pending',
  candidates_sourced: 'Candidates sourced', candidate_calls: 'Candidate calls', interviews_scheduled: 'Interviews scheduled',
  interviews_attended: 'Interviews attended', candidates_selected: 'Selected', hired: 'Hired / joined',
  drivers_arranged: 'Call drivers arranged', no_shows: 'No-shows',
  tasks_completed: 'Tasks completed', tasks_in_progress: 'Tasks in progress', bugs_fixed: 'Bugs fixed',
  features_shipped: 'Features shipped', deployments: 'Deployments', hours_worked: 'Hours worked',
  team_revenue: 'Team revenue (₹)', client_meetings: 'Client meetings', new_clients: 'New clients',
  pipeline_value: 'Pipeline value (₹)', escalations_resolved: 'Escalations resolved', team_reviews: 'Team reviews'
};

// ── One-time setup ────────────────────────────────────────────
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var emp = ss.getSheetByName(SHEET_EMPLOYEES) || ss.insertSheet(SHEET_EMPLOYEES);
  if (emp.getLastRow() === 0) {
    emp.appendRow(['id', 'name', 'title', 'roles', 'pin', 'isAdmin', 'viewOnly', 'email']);
    var rows = [
      ['naveen', 'Naveen', 'Sales head', 'saleshead,telecaller,hiring,developer', '1111', 'yes', 'no', ''],
      ['imran', 'Imran', 'Developer', 'developer', '2222', 'no', 'no', ''],
      ['thulasi', 'Thulasi', 'Telecaller', 'telecaller', '3333', 'no', 'no', ''],
      ['azgar', 'Azgar', 'Intern — sales & hiring', 'telecaller,hiring', '4444', 'no', 'no', ''],
      ['sabi', 'Sabi', 'Intern — sales & hiring', 'telecaller,hiring', '5555', 'no', 'no', ''],
      ['umar', 'Mohammed Umar', 'HR — hiring', 'hiring', '6666', 'no', 'no', ''],
      ['management', 'Management', 'View all reports', '', '9999', 'yes', 'yes', '']
    ];
    emp.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    emp.getRange('E:E').setNumberFormat('@'); // keep PINs as text (leading zeros)
    styleHeader(emp);
  }

  var rep = ss.getSheetByName(SHEET_REPORTS) || ss.insertSheet(SHEET_REPORTS);
  if (rep.getLastRow() === 0) {
    rep.appendRow(BASE_HEADERS);
    rep.getRange('B:B').setNumberFormat('@'); // store dates as plain text
    styleHeader(rep);
  }

  var set = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  if (set.getLastRow() === 0) {
    set.appendRow(['key', 'value', 'what it does']);
    set.appendRow(['MANAGEMENT_EMAILS', Session.getActiveUser().getEmail(), 'Comma-separated emails that receive EOD reports']);
    set.appendRow(['NOTIFY_ON_SUBMIT', 'yes', 'yes = email management every time someone submits']);
    set.appendRow(['COMPANY_NAME', 'Our Company', 'Shown in the email subject']);
    styleHeader(set);
  }

  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1 && sheet1.getLastRow() === 0) ss.deleteSheet(sheet1);
}

function styleHeader(sheet) {
  var r = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  r.setFontWeight('bold').setBackground('#0E3B3A').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

// Run once: emails the team summary to management every day at ~8 PM
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailySummary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailySummary').timeBased().everyDays(1).atHour(20).create();
}

// ── HTTP entry points ─────────────────────────────────────────
function doGet(e) {
  try {
    var p = e.parameter || {};
    if (p.action === 'employees') return json(ok(getEmployees(false)));
    if (p.action === 'reports') return json(ok(getReports(p.from, p.to, p.employeeId)));
    return json(fail('Unknown action'));
  } catch (err) {
    return json(fail(err.message));
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'login') return json(ok(doLogin(body.employeeId, body.pin)));
    if (body.action === 'saveReport') return json(ok(saveReport(body.report)));
    if (body.action === 'sendEOD') { sendDailySummary(body.date); return json(ok(true)); }
    return json(fail('Unknown action'));
  } catch (err) {
    return json(fail(err.message));
  }
}

function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function ok(data) { return { ok: true, data: data }; }
function fail(msg) { return { ok: false, error: msg }; }

// ── Employees ─────────────────────────────────────────────────
function getEmployees(includePin) {
  var rows = readSheet(SHEET_EMPLOYEES);
  return rows.filter(function (r) { return r.id; }).map(function (r) {
    var out = { id: String(r.id), name: r.name, title: r.title, roles: String(r.roles || ''), isAdmin: r.isAdmin, viewOnly: r.viewOnly };
    if (includePin) { out.pin = String(r.pin); out.email = r.email; }
    return out;
  });
}

function doLogin(employeeId, pin) {
  var emp = getEmployees(true).filter(function (e) { return e.id === String(employeeId); })[0];
  if (!emp || String(emp.pin).trim() !== String(pin).trim()) throw new Error('That PIN doesn’t match. Try again.');
  delete emp.pin;
  delete emp.email;
  return emp;
}

// ── Reports ───────────────────────────────────────────────────
function saveReport(report) {
  if (!report || !report.employeeId || !report.date) throw new Error('Report is missing a name or date');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REPORTS);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Add a column for any new metric
    var metricKeys = Object.keys(report.metrics || {});
    metricKeys.forEach(function (k) {
      if (headers.indexOf(k) === -1) {
        headers.push(k);
        sheet.getRange(1, headers.length).setValue(k).setFontWeight('bold').setBackground('#0E3B3A').setFontColor('#ffffff');
      }
    });

    var id = report.employeeId + '_' + report.date;
    var row = headers.map(function (h) {
      switch (h) {
        case 'id': return id;
        case 'date': return report.date;
        case 'employeeId': return report.employeeId;
        case 'name': return report.name;
        case 'roles': return (report.roles || []).join(',');
        case 'submittedAt': return report.submittedAt || new Date().toISOString();
        case 'mood': return report.mood || '';
        case 'positives': return report.positives || '';
        case 'challenges': return report.challenges || '';
        case 'tomorrow': return report.tomorrow || '';
        case 'notes': return JSON.stringify(report.notes || {});
        default: return report.metrics && report.metrics[h] !== undefined ? Number(report.metrics[h]) || 0 : '';
      }
    });

    // Update if this person already reported for this date, else append
    var last = sheet.getLastRow();
    var rowIndex = -1;
    if (last > 1) {
      var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) { if (ids[i][0] === id) { rowIndex = i + 2; break; } }
    }
    if (rowIndex === -1) rowIndex = last + 1;
    sheet.getRange(rowIndex, 2).setNumberFormat('@');
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  } finally {
    lock.releaseLock();
  }

  if (String(getSetting('NOTIFY_ON_SUBMIT')).toLowerCase() === 'yes') {
    try { emailSingleReport(report); } catch (err) { console.error(err); }
  }
  return report;
}

function getReports(from, to, employeeId) {
  var tz = Session.getScriptTimeZone();
  return readSheet(SHEET_REPORTS).filter(function (r) { return r.id; }).map(function (r) {
    var date = r.date instanceof Date ? Utilities.formatDate(r.date, tz, 'yyyy-MM-dd') : String(r.date);
    var metrics = {};
    Object.keys(r).forEach(function (k) {
      if (BASE_HEADERS.indexOf(k) === -1 && r[k] !== '') metrics[k] = Number(r[k]) || 0;
    });
    var notes = {};
    try { notes = JSON.parse(r.notes || '{}'); } catch (e) { notes = {}; }
    return {
      id: r.id, date: date, employeeId: String(r.employeeId), name: r.name,
      roles: String(r.roles || '').split(',').filter(String),
      submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : r.submittedAt,
      mood: Number(r.mood) || 0, positives: r.positives, challenges: r.challenges, tomorrow: r.tomorrow,
      notes: notes, metrics: metrics
    };
  }).filter(function (r) {
    return (!from || r.date >= from) && (!to || r.date <= to) && (!employeeId || r.employeeId === String(employeeId));
  });
}

// ── Helpers ───────────────────────────────────────────────────
function readSheet(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values.shift();
  return values.map(function (row) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function getSetting(key) {
  var rows = readSheet(SHEET_SETTINGS);
  for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i].value;
  return '';
}

function managementEmails() {
  return String(getSetting('MANAGEMENT_EMAILS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
}

function inr(v) { return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN'); }
function fmtVal(k, v) { return /value|revenue/.test(k) ? inr(v) : (Number(v) || 0); }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }

// ── Emails ────────────────────────────────────────────────────
function emailSingleReport(r) {
  var to = managementEmails();
  if (!to.length) return;
  var rows = Object.keys(r.metrics || {}).filter(function (k) { return Number(r.metrics[k]); }).map(function (k) {
    return '<tr><td style="padding:6px 12px;border-bottom:1px solid #e6ece9">' + (LABELS[k] || k) + '</td><td style="padding:6px 12px;border-bottom:1px solid #e6ece9;text-align:right;font-weight:700">' + fmtVal(k, r.metrics[k]) + '</td></tr>';
  }).join('');
  var html = '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<div style="background:#0E3B3A;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><div style="font-size:20px;font-weight:700">EOD — ' + esc(r.name) + '</div><div style="color:#F4A93B">' + r.date + '</div></div>' +
    '<div style="border:1px solid #d9e2de;border-top:0;padding:16px 22px;border-radius:0 0 12px 12px">' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rows + '</table>' +
    (r.positives ? '<p><b>Wins today</b><br>' + esc(r.positives) + '</p>' : '') +
    (r.challenges ? '<p><b>Challenges</b><br>' + esc(r.challenges) + '</p>' : '') +
    (r.tomorrow ? '<p><b>Plan for tomorrow</b><br>' + esc(r.tomorrow) + '</p>' : '') +
    '</div></div>';
  MailApp.sendEmail({ to: to.join(','), subject: 'EOD: ' + r.name + ' — ' + r.date, htmlBody: html });
}

function sendDailySummary(dateStr) {
  var to = managementEmails();
  if (!to.length) throw new Error('Add management emails in the Settings sheet first');
  var tz = Session.getScriptTimeZone();
  var date = dateStr || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var reports = getReports(date, date);
  var staff = getEmployees(false).filter(function (e) { return String(e.viewOnly).toLowerCase() !== 'yes'; });
  var done = {};
  reports.forEach(function (r) { done[r.employeeId] = r; });

  var totals = {};
  reports.forEach(function (r) { Object.keys(r.metrics).forEach(function (k) { totals[k] = (totals[k] || 0) + r.metrics[k]; }); });
  var headline = ['sales_value', 'orders_converted', 'orders_cancelled', 'interviews_scheduled', 'hired', 'drivers_arranged', 'tasks_completed'];
  var kpiCells = headline.map(function (k) {
    return '<td style="padding:10px;text-align:center;border:1px solid #d9e2de"><div style="font-size:11px;color:#5e706e">' + LABELS[k] + '</div><div style="font-size:20px;font-weight:700;color:#0E3B3A">' + fmtVal(k, totals[k]) + '</div></td>';
  }).join('');

  var people = staff.map(function (e) {
    var r = done[e.id];
    if (!r) return '<div style="padding:12px 0;border-bottom:1px solid #e6ece9"><b>' + esc(e.name) + '</b> <span style="color:#D6453D">— not submitted</span></div>';
    var nums = Object.keys(r.metrics).filter(function (k) { return Number(r.metrics[k]); }).map(function (k) { return (LABELS[k] || k) + ': <b>' + fmtVal(k, r.metrics[k]) + '</b>'; }).join(' &nbsp;|&nbsp; ');
    return '<div style="padding:12px 0;border-bottom:1px solid #e6ece9"><b>' + esc(e.name) + '</b> <span style="color:#2E9E6A">— submitted</span>' +
      '<div style="font-size:13px;margin-top:4px">' + nums + '</div>' +
      (r.positives ? '<div style="font-size:13px;margin-top:4px"><b>Wins:</b> ' + esc(r.positives) + '</div>' : '') +
      (r.challenges ? '<div style="font-size:13px;margin-top:2px"><b>Challenges:</b> ' + esc(r.challenges) + '</div>' : '') + '</div>';
  }).join('');

  var html = '<div style="font-family:Arial,sans-serif;max-width:720px">' +
    '<div style="background:#0E3B3A;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0"><div style="font-size:22px;font-weight:700">Team EOD summary</div><div style="color:#F4A93B">' + date + ' — ' + reports.length + ' of ' + staff.length + ' submitted</div></div>' +
    '<div style="border:1px solid #d9e2de;border-top:0;padding:18px 24px;border-radius:0 0 12px 12px">' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tr>' + kpiCells + '</tr></table>' + people + '</div></div>';

  MailApp.sendEmail({ to: to.join(','), subject: (getSetting('COMPANY_NAME') || 'Team') + ' — EOD summary ' + date, htmlBody: html });
}
