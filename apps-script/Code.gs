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
 *
 * UPDATING FROM AN OLDER VERSION: paste this file, run setup() again (it only
 * adds the missing tabs), then Deploy → Manage deployments → Edit → New version.
 */

var SHEET_EMPLOYEES = 'Employees';
var SHEET_REPORTS = 'Reports';
var SHEET_SETTINGS = 'Settings';
var BASE_HEADERS = ['id', 'date', 'employeeId', 'name', 'roles', 'submittedAt', 'mood', 'positives', 'challenges', 'tomorrow', 'notes'];

// Bulk-imported data: one tab per type
var RECORD_BASE = ['id', 'date', 'employeeId', 'employee', 'createdAt'];
var RECORD_SHEETS = {
  calls: { sheet: 'Calls', cols: ['name', 'phone', 'remarks', 'status'] },
  orders: { sheet: 'Orders', cols: ['name', 'phone', 'product', 'qty', 'unit', 'amount'] },
  customers: { sheet: 'Customers', cols: ['name', 'phone', 'area', 'type'] },
  cancellations: { sheet: 'Cancellations', cols: ['name', 'phone', 'product', 'qty', 'unit', 'amount', 'reason'] },
  hiring: { sheet: 'HR Calls', cols: ['name', 'phone', 'position', 'remarks', 'status'] }
};
var NUMERIC_COLS = ['qty', 'amount'];
var STATUS_LABELS = {
  interested: 'Interested', callback: 'Call back', not_interested: 'Not interested', no_answer: 'No answer', other: 'Other',
  scheduled: 'Interview scheduled', joined: 'Joined', driver_arranged: 'Driver arranged', relieved: 'Relieved', called: 'Called',
  'new': 'New', existing: 'Existing'
};

// Human-friendly labels used in the emails
var LABELS = {
  calls_made: 'Calls made', interested_calls: 'Interested calls', callbacks: 'Call backs', orders: 'Orders',
  sales_value: 'Sales value (₹)', sales_kg: 'Sales (kg)', sales_l: 'Sales (L)', orders_cancelled: 'Orders cancelled',
  cancelled_value: 'Cancelled value (₹)', customers_added: 'Customers added',
  hr_calls: 'HR calls', scheduled: 'Interviews scheduled', joined: 'Joined', drivers_arranged: 'Drivers arranged', relieved: 'Relieved'
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

  Object.keys(RECORD_SHEETS).forEach(function (type) {
    var def = RECORD_SHEETS[type];
    var sh = ss.getSheetByName(def.sheet) || ss.insertSheet(def.sheet);
    if (sh.getLastRow() === 0) {
      sh.appendRow(RECORD_BASE.concat(def.cols));
      sh.getRange('B:B').setNumberFormat('@');
      var phoneCol = RECORD_BASE.length + def.cols.indexOf('phone') + 1;
      sh.getRange(1, phoneCol, sh.getMaxRows(), 1).setNumberFormat('@');
      styleHeader(sh);
    }
  });

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
    if (p.action === 'employees') return raw(cached('employees', {}, function () { return getEmployees(false); }));
    if (p.action === 'reports') return raw(cached('reports', p, function () { return getReports(p.from, p.to, p.employeeId); }));
    if (p.action === 'records') return raw(cached('records', p, function () { return recordsFor(p); }));
    // One round trip for reports + records together (used by dashboards and reports)
    if (p.action === 'bundle') {
      return raw(cached('bundle', p, function () {
        return { reports: getReports(p.from, p.to, p.employeeId), records: recordsFor(p) };
      }));
    }
    return json(fail('Unknown action'));
  } catch (err) {
    return json(fail(err.message));
  }
}

function recordsFor(p) {
  var out = {};
  String(p.types || Object.keys(RECORD_SHEETS).join(',')).split(',').forEach(function (t) {
    if (RECORD_SHEETS[t]) out[t] = getRecords(t, t === 'customers' ? '' : p.from, t === 'customers' ? '' : p.to, p.employeeId);
  });
  return out;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'login') return json(ok(doLogin(body.employeeId, body.pin)));
    if (body.action === 'saveReport') return json(ok(saveReport(body.report)));
    if (body.action === 'saveRecords') return json(ok(saveRecords(body.type, body.records || [])));
    if (body.action === 'deleteRecord') return json(ok(deleteRecord(body.type, body.id)));
    if (body.action === 'sendEOD') { sendDailySummary(body.date); return json(ok(true)); }
    return json(fail('Unknown action'));
  } catch (err) {
    return json(fail(err.message));
  }
}

// ── Speed: server-side cache ──────────────────────────────────
// Results are cached (compressed) for 10 minutes and thrown away the moment anyone saves or
// deletes something. If you edit the Google Sheet by hand, run refreshCache() to see it at once.
var CACHE_TTL = 600;

function cacheVer() {
  var c = CacheService.getScriptCache();
  var v = c.get('ver');
  if (!v) { v = String(Date.now()); c.put('ver', v, 21600); }
  return v;
}
function bumpCache() { CacheService.getScriptCache().put('ver', String(Date.now()), 21600); }
function refreshCache() { bumpCache(); }

function cacheGet(key) {
  var c = CacheService.getScriptCache();
  var n = Number(c.get(key));
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + '~' + i);
  var parts = c.getAll(keys);
  var b64 = '';
  for (var j = 0; j < n; j++) {
    var part = parts[key + '~' + j];
    if (!part) return null;
    b64 += part;
  }
  return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip', 'd.gz')).getDataAsString();
}

function cachePut(key, str) {
  try {
    var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(str, 'application/json', 'd.json')).getBytes());
    var size = 90000;
    var n = Math.ceil(b64.length / size);
    if (n > 20) return; // too big to cache; just skip
    var obj = {};
    for (var i = 0; i < n; i++) obj[key + '~' + i] = b64.substr(i * size, size);
    obj[key] = String(n);
    CacheService.getScriptCache().putAll(obj, CACHE_TTL);
  } catch (err) { /* caching is best-effort */ }
}

function cached(name, params, fn) {
  var key = cacheVer() + '|' + name + '|' + [params.from || '', params.to || '', params.employeeId || '', params.types || ''].join('|');
  var hit = null;
  try { hit = cacheGet(key); } catch (err) { hit = null; }
  if (hit) return hit;
  var str = JSON.stringify(ok(fn()));
  cachePut(key, str);
  return str;
}

function raw(str) { return ContentService.createTextOutput(str).setMimeType(ContentService.MimeType.JSON); }

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
  bumpCache();

  // Email in the background so the person isn't kept waiting on Gmail
  if (String(getSetting('NOTIFY_ON_SUBMIT')).toLowerCase() === 'yes') queueReportEmail(report);
  return report;
}

function queueReportEmail(report) {
  try {
    PropertiesService.getScriptProperties().setProperty('PENDING_EMAIL_' + report.employeeId + '_' + report.date, JSON.stringify(report));
    ScriptApp.newTrigger('flushEmails').timeBased().after(1000).create();
  } catch (err) {
    console.error(err);
    try { emailSingleReport(report); } catch (err2) { console.error(err2); }
  }
}

function flushEmails() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'flushEmails') ScriptApp.deleteTrigger(t);
  });
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('PENDING_EMAIL_') !== 0) return;
    props.deleteProperty(k);
    try { emailSingleReport(JSON.parse(all[k])); } catch (err) { console.error(err); }
  });
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
  var def = RECORD_SHEETS[type];
  var sh = recordSheet(type);
  var headers = RECORD_BASE.concat(def.cols);
  var rows = records.map(function (r) {
    return headers.map(function (h) {
      var v = r[h];
      if (NUMERIC_COLS.indexOf(h) !== -1) return Number(v) || 0;
      return v === undefined || v === null ? '' : String(v);
    });
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (type === 'customers') {
      // One row per customer per telecaller: update if the number is already there (one read, one write)
      var last = sh.getLastRow();
      var phIdx = RECORD_BASE.length + def.cols.indexOf('phone');
      var data = last > 1 ? sh.getRange(2, 1, last - 1, headers.length).getDisplayValues() : [];
      var existing = {};
      for (var i = 0; i < data.length; i++) if (data[i][phIdx]) existing[data[i][2] + '|' + data[i][phIdx]] = i;
      var fresh = [];
      var touched = false;
      rows.forEach(function (row, idx) {
        var key = records[idx].employeeId + '|' + (records[idx].phone || '');
        if (records[idx].phone && existing[key] !== undefined) {
          var old = data[existing[key]];
          row[0] = old[0]; row[1] = old[1]; row[4] = old[4]; // keep first-added date
          data[existing[key]] = row;
          touched = true;
        } else fresh.push(row);
      });
      if (touched) sh.getRange(2, 1, data.length, headers.length).setValues(data);
      rows = fresh;
    }
    if (rows.length) {
      var start = sh.getLastRow() + 1;
      sh.getRange(start, 2, rows.length, 1).setNumberFormat('@');
      sh.getRange(start, RECORD_BASE.length + def.cols.indexOf('phone') + 1, rows.length, 1).setNumberFormat('@');
      sh.getRange(start, 1, rows.length, headers.length).setValues(rows);
    }
  } finally {
    lock.releaseLock();
  }
  bumpCache();
  return records;
}

function getRecords(type, from, to, employeeId) {
  var def = RECORD_SHEETS[type];
  var sh = recordSheet(type);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = RECORD_BASE.concat(def.cols);
  // Read only the date column first, then just the rows in range (keeps big sheets fast)
  var dates = sh.getRange(2, 2, last - 1, 1).getDisplayValues();
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
    headers.forEach(function (h, j) { o[h] = NUMERIC_COLS.indexOf(h) !== -1 ? Number(String(row[j]).replace(/,/g, '')) || 0 : row[j]; });
    if (!o.id) return;
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
    if (ids[i][0] === id) { sh.deleteRow(i + 2); bumpCache(); return true; }
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

function getSetting(key) {
  var rows = readSheet(SHEET_SETTINGS);
  for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i].value;
  return '';
}

function managementEmails() {
  return String(getSetting('MANAGEMENT_EMAILS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
}

function inr(v) { return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN'); }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }

// ── Emails ────────────────────────────────────────────────────
var TEXT_LABELS = { work_done: 'Work done', blockers: 'Blockers', head_update: 'Team & sales update' };
var TD = 'padding:6px 10px;border-bottom:1px solid #e6ece9;font-size:13px;vertical-align:top';

function interestedTable(calls) {
  if (!calls.length) return '';
  return '<h3 style="color:#1d7049;margin:18px 0 6px">Interested & positive calls (' + calls.length + ')</h3>' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<tr style="background:#f1faf4"><th style="' + TD + ';text-align:left">Customer</th><th style="' + TD + ';text-align:left">Number</th><th style="' + TD + ';text-align:left">Remarks</th><th style="' + TD + ';text-align:left">By</th></tr>' +
    calls.map(function (c) {
      return '<tr><td style="' + TD + ';font-weight:700">' + esc(c.name) + '</td><td style="' + TD + '">' + esc(c.phone) + '</td><td style="' + TD + '">' + esc(c.remarks) + '</td><td style="' + TD + '">' + esc(c.employee) + '</td></tr>';
    }).join('') + '</table>';
}

function hiringTable(list) {
  var good = list.filter(function (c) { return ['scheduled', 'joined', 'driver_arranged', 'relieved'].indexOf(c.status) !== -1; });
  if (!good.length) return '';
  return '<h3 style="color:#2a5ea8;margin:18px 0 6px">Hiring updates</h3><table style="width:100%;border-collapse:collapse">' +
    good.map(function (c) {
      return '<tr><td style="' + TD + ';font-weight:700">' + esc(c.name) + '</td><td style="' + TD + '">' + esc(c.phone) + '</td><td style="' + TD + '">' + esc(c.position) + '</td><td style="' + TD + '">' + (STATUS_LABELS[c.status] || c.status) + '</td><td style="' + TD + '">' + esc(c.employee) + '</td></tr>';
    }).join('') + '</table>';
}

function notesHtml(r) {
  var notes = r.notes || {};
  if (typeof notes === 'string') { try { notes = JSON.parse(notes); } catch (e) { notes = {}; } }
  var html = '';
  Object.keys(TEXT_LABELS).forEach(function (k) { if (notes[k]) html += '<p style="margin:6px 0"><b>' + TEXT_LABELS[k] + ':</b> ' + esc(notes[k]) + '</p>'; });
  if (r.positives) html += '<p style="margin:6px 0"><b>Wins:</b> ' + esc(r.positives) + '</p>';
  if (r.challenges) html += '<p style="margin:6px 0"><b>Challenges:</b> ' + esc(r.challenges) + '</p>';
  if (r.tomorrow) html += '<p style="margin:6px 0"><b>Plan for tomorrow:</b> ' + esc(r.tomorrow) + '</p>';
  return html;
}

function numbersLine(m) {
  return Object.keys(m || {}).filter(function (k) { return Number(m[k]) && LABELS[k]; })
    .map(function (k) { return LABELS[k] + ': <b>' + fmtVal(k, m[k]) + '</b>'; }).join(' &nbsp;|&nbsp; ');
}

function frame(title, sub, body) {
  return '<div style="font-family:Arial,sans-serif;max-width:760px">' +
    '<div style="background:#0E3B3A;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><div style="font-size:20px;font-weight:700">' + title + '</div><div style="color:#F4A93B">' + sub + '</div></div>' +
    '<div style="border:1px solid #d9e2de;border-top:0;padding:16px 22px;border-radius:0 0 12px 12px">' + body + '</div></div>';
}

function emailSingleReport(r) {
  var to = managementEmails();
  if (!to.length) return;
  var calls = [], hiring = [];
  try {
    calls = getRecords('calls', r.date, r.date, r.employeeId).filter(function (c) { return c.status === 'interested'; });
    hiring = getRecords('hiring', r.date, r.date, r.employeeId);
  } catch (e) { /* tabs not set up yet */ }
  var body = '<p style="font-size:14px">' + (numbersLine(r.metrics) || 'No call lists imported.') + '</p>' +
    notesHtml(r) + interestedTable(calls) + hiringTable(hiring);
  MailApp.sendEmail({ to: to.join(','), subject: 'EOD: ' + r.name + ' — ' + r.date, htmlBody: frame('EOD — ' + esc(r.name), r.date, body) });
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

  var calls = [], hiring = [];
  try { calls = getRecords('calls', date, date); hiring = getRecords('hiring', date, date); } catch (e) { /* not set up */ }

  var totals = {};
  reports.forEach(function (r) { Object.keys(r.metrics).forEach(function (k) { totals[k] = (totals[k] || 0) + (Number(r.metrics[k]) || 0); }); });
  var headline = ['calls_made', 'interested_calls', 'orders', 'sales_value', 'sales_kg', 'sales_l', 'orders_cancelled', 'hr_calls', 'scheduled', 'joined'];
  var kpiCells = headline.map(function (k) {
    return '<td style="padding:8px;text-align:center;border:1px solid #d9e2de"><div style="font-size:10px;color:#5e706e">' + LABELS[k] + '</div><div style="font-size:17px;font-weight:700;color:#0E3B3A">' + fmtVal(k, totals[k]) + '</div></td>';
  }).join('');

  var people = staff.map(function (e) {
    var r = done[e.id];
    if (!r) return '<div style="padding:10px 0;border-bottom:1px solid #e6ece9"><b>' + esc(e.name) + '</b> <span style="color:#D6453D">— not submitted</span></div>';
    return '<div style="padding:10px 0;border-bottom:1px solid #e6ece9"><b>' + esc(e.name) + '</b> <span style="color:#2E9E6A">— submitted</span>' +
      '<div style="font-size:13px;margin-top:4px">' + numbersLine(r.metrics) + '</div><div style="font-size:13px">' + notesHtml(r) + '</div></div>';
  }).join('');

  var interested = calls.filter(function (c) { return c.status === 'interested'; });
  var body = '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tr>' + kpiCells + '</tr></table>' +
    interestedTable(interested) + hiringTable(hiring) + '<h3 style="margin:18px 0 6px">Team</h3>' + people;

  MailApp.sendEmail({
    to: to.join(','),
    subject: (getSetting('COMPANY_NAME') || 'Team') + ' — EOD summary ' + date,
    htmlBody: frame('Team EOD summary', date + ' — ' + reports.length + ' of ' + staff.length + ' submitted', body)
  });
}

function fmtVal(k, v) {
  if (/value|revenue/.test(k)) return inr(v);
  var n = Number(v) || 0;
  return Math.round(n * 100) / 100;
}
