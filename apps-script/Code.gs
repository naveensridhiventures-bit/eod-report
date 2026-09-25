/**
 * TEAM PULSE — Google Sheets backend  (v4: list titles + new email design)
 * ------------------------------------------------------------
 * FIRST TIME
 * 1. Create a Google Sheet → Extensions → Apps Script.
 * 2. Paste this whole file into Code.gs and save.
 * 3. Run  setup()  once (approve the permissions).
 * 4. Deploy → New deployment → Web app
 *      Execute as: Me      Who has access: Anyone
 * 5. Run  createDailyTrigger()  once for the 8 PM summary email.
 *
 * UPDATING: paste this file, run setup() again (it only adds what's
 * missing — your data stays), then Deploy → Manage deployments →
 * ✏️ Edit → Version: New version → Deploy. The URL stays the same.
 *
 * To preview the email design without waiting: run  sendTestEmail().
 */

var SHEET_EMPLOYEES = 'Employees';
var SHEET_REPORTS = 'Reports';
var SHEET_SETTINGS = 'Settings';
var DEFAULT_EMAIL = 'hiring.sridhiventures@gmail.com';
var BASE_HEADERS = ['id', 'date', 'employeeId', 'name', 'roles', 'submittedAt', 'mood', 'positives', 'challenges', 'tomorrow', 'notes'];

// Bulk-imported data: one tab per type. Extra columns are added automatically.
var RECORD_BASE = ['id', 'date', 'employeeId', 'employee', 'createdAt'];
var RECORD_SHEETS = {
  calls: { sheet: 'Calls', cols: ['title', 'name', 'phone', 'remarks', 'status'] },
  orders: { sheet: 'Orders', cols: ['title', 'name', 'phone', 'product', 'qty', 'unit', 'amount'] },
  customers: { sheet: 'Customers', cols: ['title', 'name', 'phone', 'area', 'type'] },
  cancellations: { sheet: 'Cancellations', cols: ['title', 'name', 'phone', 'product', 'qty', 'unit', 'amount', 'reason'] },
  hiring: { sheet: 'HR Calls', cols: ['title', 'name', 'phone', 'remarks', 'status'] }
};
var NUMERIC_COLS = ['qty', 'amount'];
var STATUS_LABELS = {
  interested: 'Interested', callback: 'Call back', not_interested: 'Not interested', no_answer: 'No answer', other: 'Other',
  scheduled: 'Interview scheduled', joined: 'Joined', driver_arranged: 'Driver arranged', relieved: 'Relieved', called: 'Called',
  'new': 'New', existing: 'Existing'
};
var SETTINGS_DEFAULTS = [
  ['MANAGEMENT_EMAILS', DEFAULT_EMAIL, 'Comma-separated emails that receive EOD reports (can be changed in the app)'],
  ['NOTIFY_ON_SUBMIT', 'yes', 'yes = email on every submission + evening summary; no = evening summary only'],
  ['COMPANY_NAME', 'Sridhi Ventures', 'Shown at the top of every email'],
  ['APP_LINK', '', 'Your app link, for the "Open dashboard" button in emails']
];

// ── One-time setup (safe to run again) ────────────────────────
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
    emp.getRange('E:E').setNumberFormat('@');
    styleHeader(emp);
  }

  var rep = ss.getSheetByName(SHEET_REPORTS) || ss.insertSheet(SHEET_REPORTS);
  if (rep.getLastRow() === 0) {
    rep.appendRow(BASE_HEADERS);
    rep.getRange('B:B').setNumberFormat('@');
    styleHeader(rep);
  }

  Object.keys(RECORD_SHEETS).forEach(function (type) {
    var sh = ss.getSheetByName(RECORD_SHEETS[type].sheet) || ss.insertSheet(RECORD_SHEETS[type].sheet);
    ensureHeaders(sh, RECORD_BASE.concat(RECORD_SHEETS[type].cols));
  });

  var set = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  if (set.getLastRow() === 0) { set.appendRow(['key', 'value', 'what it does']); styleHeader(set); }
  var me = '';
  try { me = Session.getActiveUser().getEmail(); } catch (e) { me = ''; }
  SETTINGS_DEFAULTS.forEach(function (d) {
    var current = getSetting(d[0]);
    if (current === '' && !settingExists(d[0])) set.appendRow(d);
    // Older versions filled in the script owner's email; switch that to the hiring inbox once
    if (d[0] === 'MANAGEMENT_EMAILS' && me && String(current).trim() === me) setSetting('MANAGEMENT_EMAILS', DEFAULT_EMAIL);
    if (d[0] === 'COMPANY_NAME' && String(current).trim() === 'Our Company') setSetting('COMPANY_NAME', 'Sridhi Ventures');
  });

  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1 && sheet1.getLastRow() === 0) ss.deleteSheet(sheet1);
}

function styleHeader(sheet) {
  var r = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  r.setFontWeight('bold').setBackground('#0E3B3A').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

/** Makes sure every header exists (adds missing ones at the end) and returns the header row. */
function ensureHeaders(sh, wanted) {
  var headers = sh.getLastRow() === 0 ? [] : sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var added = false;
  wanted.forEach(function (h) {
    if (headers.indexOf(h) === -1) {
      headers.push(h);
      sh.getRange(1, headers.length).setValue(h);
      if (h === 'phone' || h === 'date') sh.getRange(1, headers.length, sh.getMaxRows(), 1).setNumberFormat('@');
      added = true;
    }
  });
  if (added) styleHeader(sh);
  return headers;
}

// Run once: emails the team summary every day at ~8 PM
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
    if (p.action === 'settings') return json(ok(getSettings()));
    if (p.action === 'records') {
      var out = {};
      String(p.types || Object.keys(RECORD_SHEETS).join(',')).split(',').forEach(function (t) {
        if (RECORD_SHEETS[t]) out[t] = getRecords(t, t === 'customers' ? '' : p.from, t === 'customers' ? '' : p.to, p.employeeId);
      });
      return json(ok(out));
    }
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
    if (body.action === 'saveRecords') return json(ok(saveRecords(body.type, body.records || [])));
    if (body.action === 'deleteRecord') return json(ok(deleteRecord(body.type, body.id)));
    if (body.action === 'saveSettings') return json(ok(saveSettings(body.employeeId, body.pin, body.settings || {})));
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
  return readSheet(SHEET_EMPLOYEES).filter(function (r) { return r.id; }).map(function (r) {
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

// ── Settings ──────────────────────────────────────────────────
function getSettings() {
  var out = {};
  SETTINGS_DEFAULTS.forEach(function (d) { out[d[0]] = String(getSetting(d[0]) || (settingExists(d[0]) ? '' : d[1])); });
  return out;
}

function saveSettings(employeeId, pin, settings) {
  var emp = doLogin(employeeId, pin);
  if (String(emp.isAdmin).toLowerCase() !== 'yes' && emp.isAdmin !== true) throw new Error('Only admins can change settings.');
  var emails = String(settings.MANAGEMENT_EMAILS || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  if (!emails.length) throw new Error('Add at least one email address.');
  emails.forEach(function (m) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) throw new Error('Not a valid email: ' + m); });
  setSetting('MANAGEMENT_EMAILS', emails.join(', '));
  setSetting('NOTIFY_ON_SUBMIT', String(settings.NOTIFY_ON_SUBMIT) === 'no' ? 'no' : 'yes');
  if (settings.COMPANY_NAME !== undefined) setSetting('COMPANY_NAME', String(settings.COMPANY_NAME).slice(0, 80));
  if (settings.APP_LINK !== undefined) setSetting('APP_LINK', String(settings.APP_LINK).slice(0, 300));
  return getSettings();
}

function settingExists(key) {
  return readSheet(SHEET_SETTINGS).some(function (r) { return r.key === key; });
}

function getSetting(key) {
  var rows = readSheet(SHEET_SETTINGS);
  for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i].value;
  return '';
}

function setSetting(key, value) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  var last = sh.getLastRow();
  if (last > 1) {
    var keys = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (var i = 0; i < keys.length; i++) {
      if (keys[i][0] === key) { sh.getRange(i + 2, 2).setValue(value); return; }
    }
  }
  var def = SETTINGS_DEFAULTS.filter(function (d) { return d[0] === key; })[0];
  sh.appendRow([key, value, def ? def[2] : '']);
}

function managementEmails() {
  var v = getSetting('MANAGEMENT_EMAILS') || DEFAULT_EMAIL;
  return String(v).split(',').map(function (s) { return s.trim(); }).filter(String);
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
    try { sendPersonReport(report); } catch (err) { console.error(err); }
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

// ── Bulk-imported records ─────────────────────────────────────
function recordSheet(type) {
  var def = RECORD_SHEETS[type];
  if (!def) throw new Error('Unknown data type: ' + type);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
  if (!sh) throw new Error('The "' + def.sheet + '" tab is missing. Run setup() once in Apps Script.');
  return sh;
}

function saveRecords(type, records) {
  if (!records.length) return [];
  var sh = recordSheet(type);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var headers = ensureHeaders(sh, RECORD_BASE.concat(RECORD_SHEETS[type].cols));
    var toRow = function (r) {
      return headers.map(function (h) {
        var v = r[h];
        if (NUMERIC_COLS.indexOf(h) !== -1) return Number(v) || 0;
        return v === undefined || v === null ? '' : String(v);
      });
    };
    var rows = records.map(toRow);
    var phoneIdx = headers.indexOf('phone');

    if (type === 'customers') {
      // One row per customer per telecaller: update when the number is already there
      var last = sh.getLastRow();
      var existing = {};
      if (last > 1) {
        var all = sh.getRange(2, 1, last - 1, headers.length).getDisplayValues();
        var empIdx = headers.indexOf('employeeId');
        all.forEach(function (row, i) { if (row[phoneIdx]) existing[row[empIdx] + '|' + row[phoneIdx]] = { at: i + 2, row: row }; });
      }
      var fresh = [];
      rows.forEach(function (row, idx) {
        var hit = records[idx].phone && existing[records[idx].employeeId + '|' + records[idx].phone];
        if (hit) {
          ['id', 'date', 'createdAt'].forEach(function (k) { var j = headers.indexOf(k); row[j] = hit.row[j]; });
          sh.getRange(hit.at, 1, 1, headers.length).setValues([row]);
        } else fresh.push(row);
      });
      rows = fresh;
    }
    if (rows.length) {
      var start = sh.getLastRow() + 1;
      sh.getRange(start, headers.indexOf('date') + 1, rows.length, 1).setNumberFormat('@');
      sh.getRange(start, phoneIdx + 1, rows.length, 1).setNumberFormat('@');
      sh.getRange(start, 1, rows.length, headers.length).setValues(rows);
    }
  } finally {
    lock.releaseLock();
  }
  return records;
}

function getRecords(type, from, to, employeeId) {
  var sh = recordSheet(type);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var dateCol = headers.indexOf('date') + 1;
  // Read only the date column first, then just the block of rows in range
  var dates = sh.getRange(2, dateCol, last - 1, 1).getDisplayValues();
  var first = -1, lastIdx = -1;
  for (var i = 0; i < dates.length; i++) {
    var d = dates[i][0];
    if ((!from || d >= from) && (!to || d <= to)) { if (first === -1) first = i; lastIdx = i; }
  }
  if (first === -1) return [];
  var block = sh.getRange(first + 2, 1, lastIdx - first + 1, headers.length).getDisplayValues();
  var out = [];
  block.forEach(function (row) {
    var o = {};
    headers.forEach(function (h, j) { if (h) o[h] = NUMERIC_COLS.indexOf(h) !== -1 ? Number(String(row[j]).replace(/,/g, '')) || 0 : row[j]; });
    if (!o.id) return;
    if (!o.title && o.position) o.title = o.position; // older HR rows
    if (from && o.date < from) return;
    if (to && o.date > to) return;
    if (employeeId && o.employeeId !== String(employeeId)) return;
    out.push(o);
  });
  return out;
}

function deleteRecord(type, id) {
  var sh = recordSheet(type);
  var last = sh.getLastRow();
  if (last < 2) return false;
  var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (ids[i][0] === id) { sh.deleteRow(i + 2); return true; }
  }
  return false;
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

function inr(v) { return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN'); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>'); }
function qtyStr(n) { return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN'); }

function toBase(qty, unit) {
  var q = Number(qty) || 0;
  var u = String(unit || '').toLowerCase();
  if (u === 'g') return { qty: q / 1000, unit: 'kg' };
  if (u === 'ml') return { qty: q / 1000, unit: 'L' };
  if (u === 'kg') return { qty: q, unit: 'kg' };
  if (u === 'l') return { qty: q, unit: 'L' };
  return { qty: q, unit: unit };
}

function groupByTitle(list) {
  var map = {}, order = [];
  list.forEach(function (r) {
    var t = String(r.title || '').trim() || 'Untitled';
    var k = t.toLowerCase();
    if (!map[k]) { map[k] = { title: t, rows: [] }; order.push(k); }
    map[k].rows.push(r);
  });
  return order.map(function (k) { return map[k]; }).sort(function (a, b) { return b.rows.length - a.rows.length; });
}

function loadDay(date, employeeId) {
  var data = {};
  Object.keys(RECORD_SHEETS).forEach(function (t) {
    try { data[t] = getRecords(t, date, date, employeeId); }
    catch (e) { data[t] = []; }
  });
  return data;
}

function countsFor(d) {
  var c = {
    calls: d.calls.length, interested: 0, callbacks: 0,
    orders: d.orders.length, sales: 0, kg: 0, litres: 0,
    cancelled: d.cancellations.length, cancelledValue: 0, customersAdded: d.customers.length,
    hrCalls: d.hiring.length, scheduled: 0, joined: 0, drivers: 0, relieved: 0
  };
  d.calls.forEach(function (r) { if (r.status === 'interested') c.interested++; if (r.status === 'callback') c.callbacks++; });
  d.orders.forEach(function (r) {
    c.sales += Number(r.amount) || 0;
    var b = toBase(r.qty, r.unit);
    if (b.unit === 'kg') c.kg += b.qty; else if (b.unit === 'L') c.litres += b.qty;
  });
  d.cancellations.forEach(function (r) { c.cancelledValue += Number(r.amount) || 0; });
  d.hiring.forEach(function (r) {
    if (r.status === 'scheduled') c.scheduled++;
    if (r.status === 'joined') c.joined++;
    if (r.status === 'driver_arranged') c.drivers++;
    if (r.status === 'relieved') c.relieved++;
  });
  return c;
}

// ── Emails ────────────────────────────────────────────────────
// Table-based HTML with inline styles so it looks right in Gmail, Outlook and phones.
var C = { ink: '#1A2B2A', muted: '#5E706E', line: '#DDE5E1', ever: '#0E3B3A', gold: '#F4A93B', mist: '#F2F5F3', page: '#E3EAE6',
          good: '#1F8A5B', goodBg: '#E6F5EC', blue: '#2A64B8', blueBg: '#E6EFFB', bad: '#C23B33' };
var FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function statCell(label, value, color) {
  return '<td class="st" width="25%" style="padding:4px;">' +
    '<div style="background:#ffffff;border:1px solid ' + C.line + ';border-radius:12px;padding:12px 4px;text-align:center;">' +
    '<div style="' + FONT + 'font-size:20px;font-weight:800;line-height:1.1;word-break:break-word;color:' + (color || C.ink) + ';">' + value + '</div>' +
    '<div style="' + FONT + 'font-size:11px;font-weight:600;color:' + C.muted + ';margin-top:4px;text-transform:uppercase;letter-spacing:.04em;">' + label + '</div>' +
    '</div></td>';
}

function statGrid(cells) {
  var html = '';
  for (var i = 0; i < cells.length; i += 4) {
    var row = cells.slice(i, i + 4);
    while (row.length < 4) row.push('<td class="st-empty" width="25%"></td>');
    html += '<tr>' + row.join('') + '</tr>';
  }
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + html + '</table>';
}

function sectionTitle(text, count, color, bg) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 10px;"><tr>' +
    '<td style="' + FONT + 'font-size:17px;font-weight:800;color:' + C.ink + ';">' +
    '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:8px;"></span>' + text +
    ' <span style="display:inline-block;background:' + bg + ';color:' + color + ';font-size:13px;font-weight:800;border-radius:999px;padding:2px 10px;margin-left:6px;">' + count + '</span>' +
    '</td></tr></table>';
}

function personCard(r, color, showBy) {
  var phone = r.phone ? '<a href="tel:' + esc(r.phone) + '" style="color:' + C.ever + ';font-weight:700;text-decoration:none;">&#128222; ' + esc(r.phone) + '</a>' : '';
  return '<tr><td style="padding:0 0 8px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ' + C.line + ';border-left:4px solid ' + color + ';border-radius:10px;">' +
    '<tr><td style="padding:11px 14px;' + FONT + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="' + FONT + 'font-size:15px;font-weight:700;color:' + C.ink + ';">' + esc(r.name || 'No name') + '</td>' +
    '<td align="right" style="' + FONT + 'font-size:14px;white-space:nowrap;">' + phone + '</td></tr></table>' +
    (r.remarks ? '<div style="' + FONT + 'font-size:14px;color:' + C.ink + ';margin-top:4px;line-height:1.45;">' + esc(r.remarks) + '</div>' : '') +
    (showBy ? '<div style="' + FONT + 'font-size:12px;color:' + C.muted + ';margin-top:4px;">by ' + esc(r.employee) + '</div>' : '') +
    '</td></tr></table></td></tr>';
}

function groupedCards(list, color, bg, showBy, limit) {
  var html = '', shown = 0;
  groupByTitle(list).forEach(function (g) {
    if (shown >= limit) return;
    html += '<tr><td style="padding:10px 0 6px;"><span style="' + FONT + 'display:inline-block;background:' + bg + ';color:' + color + ';font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;border-radius:6px;padding:4px 10px;">' +
      esc(g.title) + ' &middot; ' + g.rows.length + '</span></td></tr>';
    g.rows.forEach(function (r) { if (shown < limit) { html += personCard(r, color, showBy); shown++; } });
  });
  var more = list.length - shown;
  if (more > 0) html += '<tr><td style="' + FONT + 'font-size:13px;color:' + C.muted + ';padding:4px 0;">+ ' + more + ' more in the app</td></tr>';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + html + '</table>';
}

function emptyNote(text) {
  return '<div style="' + FONT + 'font-size:14px;color:' + C.muted + ';background:#ffffff;border:1px dashed ' + C.line + ';border-radius:10px;padding:14px;">' + text + '</div>';
}

function pill(text, color, bg) {
  return '<span style="' + FONT + 'display:inline-block;background:' + bg + ';color:' + color + ';font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;margin:0 4px 4px 0;">' + text + '</span>';
}

function notesOf(r) {
  var n = r.notes || {};
  if (typeof n === 'string') { try { n = JSON.parse(n); } catch (e) { n = {}; } }
  var parts = [];
  if (n.work_done) parts.push(['Work done', n.work_done]);
  if (n.head_update) parts.push(['Team update', n.head_update]);
  if (n.blockers) parts.push(['Blockers', n.blockers]);
  if (r.positives) parts.push(['Wins', r.positives]);
  if (r.challenges) parts.push(['Challenges', r.challenges]);
  return parts;
}

function renderEmail(o) {
  var c = o.counts;
  var cells = [];
  if (o.showSales) {
    cells.push(statCell('Calls', c.calls), statCell('Interested', c.interested, C.good), statCell('Orders', c.orders), statCell('Sales', inr(c.sales), C.good));
    if (c.kg || c.litres || c.cancelled) cells.push(statCell('Sold kg', qtyStr(c.kg)), statCell('Sold litres', qtyStr(c.litres)), statCell('Cancelled', c.cancelled, c.cancelled ? C.bad : C.ink));
  }
  if (o.showHr) {
    cells.push(statCell('HR calls', c.hrCalls), statCell('Scheduled', c.scheduled, C.blue), statCell('Joined', c.joined, C.good));
    if (c.drivers || c.relieved) cells.push(statCell('Drivers arranged', c.drivers), statCell('Relieved', c.relieved, c.relieved ? C.bad : C.ink));
  }

  var body = '';
  if (cells.length) body += statGrid(cells);

  if (o.showSales) {
    body += sectionTitle('Interested customers', o.interested.length, C.good, C.goodBg);
    body += o.interested.length ? groupedCards(o.interested, C.good, C.goodBg, o.showBy, 60) : emptyNote('No interested calls today.');
  }
  if (o.showHr) {
    body += sectionTitle('Interviews scheduled', o.scheduled.length, C.blue, C.blueBg);
    body += o.scheduled.length ? groupedCards(o.scheduled, C.blue, C.blueBg, o.showBy, 60) : emptyNote('No interviews scheduled today.');
  }

  var extra = [];
  if (c.callbacks) extra.push(pill(c.callbacks + (c.callbacks === 1 ? ' call back' : ' call backs'), C.ink, '#FDF0DB'));
  if (c.joined) extra.push(pill(c.joined + ' joined', C.good, C.goodBg));
  if (c.drivers) extra.push(pill(c.drivers + ' drivers arranged', C.good, C.goodBg));
  if (c.relieved) extra.push(pill(c.relieved + ' relieved', C.bad, '#FBE7E5'));
  if (c.cancelled) extra.push(pill(c.cancelled + ' orders cancelled (' + inr(c.cancelledValue) + ')', C.bad, '#FBE7E5'));
  if (c.customersAdded) extra.push(pill(c.customersAdded + ' customers added', C.ink, C.mist));
  if (extra.length) body += '<div style="margin-top:22px;">' + extra.join('') + '</div>';

  if (o.team && o.team.length) {
    body += sectionTitle('Team check-in', o.team.filter(function (t) { return t.done; }).length + '/' + o.team.length, C.ever, C.mist);
    body += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ' + C.line + ';border-radius:10px;">' +
      o.team.map(function (t, i) {
        return '<tr><td style="' + FONT + 'padding:10px 14px;font-size:14px;font-weight:700;color:' + C.ink + ';' + (i ? 'border-top:1px solid ' + C.line + ';' : '') + '">' + esc(t.name) + '</td>' +
          '<td style="' + FONT + 'padding:10px 14px;font-size:13px;color:' + C.muted + ';' + (i ? 'border-top:1px solid ' + C.line + ';' : '') + '">' + esc(t.line) + '</td>' +
          '<td align="right" style="' + FONT + 'padding:10px 14px;font-size:12px;font-weight:700;white-space:nowrap;' + (i ? 'border-top:1px solid ' + C.line + ';' : '') + 'color:' + (t.done ? C.good : C.bad) + ';">' + (t.done ? '&#10003; Submitted' : 'Pending') + '</td></tr>';
      }).join('') + '</table>';
  }

  if (o.updates && o.updates.length) {
    body += sectionTitle('Updates', o.updates.length, C.ever, C.mist);
    o.updates.forEach(function (u) {
      body += '<div style="background:#ffffff;border:1px solid ' + C.line + ';border-radius:10px;padding:12px 14px;margin-bottom:8px;' + FONT + '">' +
        (o.showBy ? '<div style="font-size:14px;font-weight:700;color:' + C.ink + ';margin-bottom:4px;">' + esc(u.name) + '</div>' : '') +
        u.parts.map(function (p) { return '<div style="font-size:14px;color:' + C.ink + ';line-height:1.5;margin-top:2px;"><b style="color:' + C.muted + ';">' + p[0] + ':</b> ' + esc(p[1]) + '</div>'; }).join('') +
        '</div>';
    });
  }

  var link = getSetting('APP_LINK');
  if (link) {
    body += '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 4px;"><tr><td style="background:' + C.ever + ';border-radius:10px;">' +
      '<a href="' + esc(link) + '" style="' + FONT + 'display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Open dashboard &rarr;</a></td></tr></table>';
  }

  var company = esc(getSetting('COMPANY_NAME') || 'Team');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media only screen and (max-width:520px){.st{display:inline-block!important;width:50%!important;box-sizing:border-box!important}.st-empty{display:none!important}}</style></head><body style="margin:0;padding:0;background:' + C.page + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.page + ';"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">' +
    '<tr><td style="background:' + C.ever + ';border-radius:16px 16px 0 0;padding:26px 26px 22px;">' +
    '<div style="' + FONT + 'font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:' + C.gold + ';">' + company + ' &middot; ' + esc(o.kicker) + '</div>' +
    '<div style="' + FONT + 'font-size:26px;font-weight:800;color:#ffffff;margin-top:8px;line-height:1.2;">' + esc(o.heading) + '</div>' +
    '<div style="' + FONT + 'font-size:14px;color:#B9CCC7;margin-top:6px;">' + esc(o.sub) + '</div>' +
    '</td></tr>' +
    '<tr><td style="background:' + C.gold + ';height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>' +
    '<tr><td style="background:' + C.mist + ';padding:16px 14px 26px;border-radius:0 0 16px 16px;">' + body + '</td></tr>' +
    '<tr><td style="' + FONT + 'text-align:center;font-size:12px;color:' + C.muted + ';padding:14px;">Sent by Team Pulse &middot; ' + company + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function niceDate(iso) {
  var p = String(iso).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE, d MMMM yyyy');
}

/** Email for one person's submission */
function sendPersonReport(r) {
  var to = managementEmails();
  if (!to.length) return;
  var d = loadDay(r.date, r.employeeId);
  var roles = (r.roles || []).join(',');
  var parts = notesOf(r);
  var html = renderEmail({
    kicker: 'EOD report',
    heading: r.name,
    sub: niceDate(r.date),
    counts: countsFor(d),
    showSales: /telecaller/.test(roles) || d.calls.length > 0,
    showHr: /hiring/.test(roles) || d.hiring.length > 0,
    interested: d.calls.filter(function (x) { return x.status === 'interested'; }),
    scheduled: d.hiring.filter(function (x) { return x.status === 'scheduled'; }),
    showBy: false,
    updates: parts.length ? [{ name: r.name, parts: parts }] : []
  });
  var c = countsFor(d);
  var subj = 'EOD · ' + r.name + ' · ' + r.date;
  if (c.interested) subj += ' · ' + c.interested + ' interested';
  if (c.scheduled) subj += ' · ' + c.scheduled + ' scheduled';
  MailApp.sendEmail({ to: to.join(','), subject: subj, htmlBody: html, name: (getSetting('COMPANY_NAME') || 'Team') + ' EOD' });
}

/** Evening summary for the whole team (trigger, "Send now" button, or test) */
function sendDailySummary(dateStr) {
  var to = managementEmails();
  if (!to.length) throw new Error('Add report emails in the app (Email settings) first');
  var tz = Session.getScriptTimeZone();
  var date = typeof dateStr === 'string' && dateStr ? dateStr : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var reports = getReports(date, date);
  var staff = getEmployees(false).filter(function (e) { return String(e.viewOnly).toLowerCase() !== 'yes'; });
  var d = loadDay(date);
  var c = countsFor(d);
  var byId = {};
  reports.forEach(function (r) { byId[r.employeeId] = r; });

  var team = staff.map(function (e) {
    var mine = {};
    Object.keys(d).forEach(function (k) { mine[k] = d[k].filter(function (x) { return x.employeeId === e.id; }); });
    var mc = countsFor(mine);
    var bits = [];
    var pl = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
    if (mc.calls) bits.push(pl(mc.calls, 'call') + ', ' + mc.interested + ' interested');
    if (mc.orders) bits.push(pl(mc.orders, 'order'));
    if (mc.hrCalls) bits.push(pl(mc.hrCalls, 'HR call') + ', ' + mc.scheduled + ' scheduled');
    return { name: e.name, done: !!byId[e.id], line: bits.join(' · ') || (byId[e.id] ? 'Written update' : '—') };
  });

  var updates = reports.map(function (r) { return { name: r.name, parts: notesOf(r) }; }).filter(function (u) { return u.parts.length; });

  var html = renderEmail({
    kicker: 'Daily EOD summary',
    heading: niceDate(date),
    sub: reports.length + ' of ' + staff.length + ' team members reported',
    counts: c, showSales: true, showHr: true,
    interested: d.calls.filter(function (x) { return x.status === 'interested'; }),
    scheduled: d.hiring.filter(function (x) { return x.status === 'scheduled'; }),
    showBy: true, team: team, updates: updates
  });
  MailApp.sendEmail({
    to: to.join(','),
    subject: 'Team EOD · ' + date + ' · ' + c.interested + ' interested · ' + c.scheduled + ' interviews scheduled',
    htmlBody: html,
    name: (getSetting('COMPANY_NAME') || 'Team') + ' EOD'
  });
}

/** Run from the editor to see the design with today's data */
function sendTestEmail() { sendDailySummary(); }
