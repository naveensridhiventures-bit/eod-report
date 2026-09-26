/**
 * TEAM PULSE — Google Sheets backend  (v6: call queue, do-not-call, hiring pipeline, targets, talk time)
 * ------------------------------------------------------------
 * FIRST TIME
 * 1. Create a Google Sheet → Extensions → Apps Script.
 * 2. Paste this whole file into Code.gs and save.
 * 3. Run  setup()  once (approve the permissions).
 * 4. Deploy → New deployment → Web app
 *      Execute as: Me      Who has access: Anyone
 * 5. Run  createDailyTrigger()  once for the 8 PM summary email.
 * 6. Run  createFollowUpTrigger()  once for the 9 AM follow-up reminder emails.
 *
 * ENGLISH BUTTON (Thanglish → English), optional:
 *   Project Settings (⚙️) → Script properties → Add script property
 *     ANTHROPIC_API_KEY = your Claude API key      (console.anthropic.com)
 *   or GEMINI_API_KEY   = your Gemini API key      (aistudio.google.com)
 *   Without a key the button still works using a basic word list.
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
  calls: { sheet: 'Calls', cols: ['title', 'name', 'phone', 'remarks', 'status', 'followUp', 'duration'] },
  orders: { sheet: 'Orders', cols: ['title', 'name', 'phone', 'product', 'qty', 'unit', 'amount'] },
  customers: { sheet: 'Customers', cols: ['title', 'name', 'phone', 'area', 'type'] },
  cancellations: { sheet: 'Cancellations', cols: ['title', 'name', 'phone', 'product', 'qty', 'unit', 'amount', 'reason'] },
  hiring: { sheet: 'HR Calls', cols: ['title', 'name', 'phone', 'remarks', 'status', 'followUp', 'duration'] },
  // Call queue (employeeId = who should call), do-not-call numbers, job openings
  leads: { sheet: 'Leads', cols: ['title', 'kind', 'name', 'phone', 'area', 'notes', 'state', 'result', 'doneAt', 'assignedBy'] },
  dnc: { sheet: 'Do Not Call', cols: ['name', 'phone', 'reason'] },
  openings: { sheet: 'Openings', cols: ['title', 'needed', 'active'] }
};
// These are lists, not daily work: always read in full (no date filter)
var UNDATED_TYPES = ['customers', 'leads', 'dnc', 'openings'];
var NUMERIC_COLS = ['qty', 'amount', 'duration', 'needed'];
var STATUS_LABELS = {
  interested: 'Interested', callback: 'Call back', not_interested: 'Not interested', no_answer: 'No answer', other: 'Other',
  scheduled: 'Interview scheduled', joined: 'Joined', driver_arranged: 'Driver arranged', relieved: 'Relieved', called: 'Called',
  'new': 'New', existing: 'Existing',
  attended: 'Attended interview', selected: 'Selected', working: 'Still working', no_show: 'No-show', rejected: 'Rejected'
};
var SETTINGS_DEFAULTS = [
  ['MANAGEMENT_EMAILS', DEFAULT_EMAIL, 'Comma-separated emails that receive EOD reports (can be changed in the app)'],
  ['NOTIFY_ON_SUBMIT', 'yes', 'yes = email on every submission + evening summary; no = evening summary only'],
  ['COMPANY_NAME', 'Sridhi Ventures', 'Shown at the top of every email'],
  ['APP_LINK', '', 'Your app link, for the "Open dashboard" button in emails'],
  ['FOLLOWUP_EMAILS', 'yes', 'yes = every morning, email each person their follow-ups (needs their email in the Employees tab)'],
  ['FOLLOWUP_DIGEST', 'no', 'yes = also email management the list of overdue follow-ups each morning'],
  ['TARGETS', '{"_default":{"calls_made":50,"interested_calls":5,"orders":3,"hr_calls":40,"scheduled":5}}', 'Daily targets (edit in the app: Settings → Daily targets)']
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
      if (h === 'phone' || h === 'date' || h === 'followUp') sh.getRange(1, headers.length, sh.getMaxRows(), 1).setNumberFormat('@');
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
        var undated = UNDATED_TYPES.indexOf(t) !== -1;
        if (RECORD_SHEETS[t]) out[t] = getRecords(t, undated ? '' : p.from, undated ? '' : p.to, p.employeeId);
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
    if (body.action === 'updateRecord') return json(ok(updateRecord(body.type, body.id, body.fields || {})));
    if (body.action === 'updateRecords') return json(ok(updateRecords(body.type, body.updates || [])));
    if (body.action === 'polish') return json(ok(polishTexts(body.texts || [])));
    if (body.action === 'saveAiKey') return json(ok(saveAiKey(body.employeeId, body.pin, body.provider, body.key)));
    if (body.action === 'saveMyEmail') return json(ok(saveMyEmail(body.employeeId, body.pin, body.email)));
    if (body.action === 'sendMyFollowUps') return json(ok(sendMyFollowUps(body.employeeId)));
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
  emp.hasEmail = !!String(emp.email || '').trim();
  delete emp.email;
  return emp;
}

// ── Settings ──────────────────────────────────────────────────
function getSettings() {
  var out = {};
  SETTINGS_DEFAULTS.forEach(function (d) { out[d[0]] = String(getSetting(d[0]) || (settingExists(d[0]) ? '' : d[1])); });
  out.AI_ENGINE = aiEngine_(); // which AI writes the English — never the key itself
  return out;
}

function aiEngine_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ANTHROPIC_API_KEY')) return 'claude';
  if (props.getProperty('GEMINI_API_KEY')) return 'gemini';
  return 'basic';
}

/** Admins turn on AI English from the app. The key is kept in Script Properties, not in the Sheet. */
function saveAiKey(employeeId, pin, provider, key) {
  var emp = doLogin(employeeId, pin);
  if (String(emp.isAdmin).toLowerCase() !== 'yes' && emp.isAdmin !== true) throw new Error('Only admins can change this.');
  var props = PropertiesService.getScriptProperties();
  key = String(key || '').trim();
  if (provider === 'off') { props.deleteProperty('GEMINI_API_KEY'); props.deleteProperty('ANTHROPIC_API_KEY'); return aiEngine_(); }
  if (key.length < 20) throw new Error('That key looks too short. Copy the whole key.');
  var name = provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY';
  // Check the key works before saving it
  try {
    if (provider === 'claude') polishWithClaude_(['test'], key, props.getProperty('CLAUDE_MODEL'));
    else polishWithGemini_(['test'], key, props.getProperty('GEMINI_MODEL'));
  } catch (err) {
    throw new Error('The key didn’t work: ' + String(err.message).slice(0, 200));
  }
  props.deleteProperty('GEMINI_API_KEY');
  props.deleteProperty('ANTHROPIC_API_KEY');
  props.setProperty(name, key);
  CacheService.getScriptCache().removeAll([]);
  return aiEngine_();
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
  if (settings.FOLLOWUP_EMAILS !== undefined) setSetting('FOLLOWUP_EMAILS', String(settings.FOLLOWUP_EMAILS) === 'no' ? 'no' : 'yes');
  if (settings.TARGETS !== undefined) {
    var t;
    try { t = JSON.parse(String(settings.TARGETS)); } catch (e) { throw new Error('Targets could not be read'); }
    if (!t || typeof t !== 'object') throw new Error('Targets could not be read');
    setSetting('TARGETS', JSON.stringify(t).slice(0, 5000));
  }
  if (settings.FOLLOWUP_DIGEST !== undefined) setSetting('FOLLOWUP_DIGEST', String(settings.FOLLOWUP_DIGEST) === 'yes' ? 'yes' : 'no');
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
      if (phoneIdx !== -1) sh.getRange(start, phoneIdx + 1, rows.length, 1).setNumberFormat('@');
      var fuIdx = headers.indexOf('followUp');
      if (fuIdx !== -1) sh.getRange(start, fuIdx + 1, rows.length, 1).setNumberFormat('@');
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
    hrCalls: d.hiring.length, scheduled: 0, joined: 0, drivers: 0, relieved: 0, attended: 0, noShow: 0, selected: 0, talk: 0
  };
  d.calls.concat(d.hiring).forEach(function (r) { c.talk += Number(r.duration) || 0; });
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
    if (r.status === 'attended') c.attended++;
    if (r.status === 'no_show') c.noShow++;
    if (r.status === 'selected') c.selected++;
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
  if (c.attended) extra.push(pill(c.attended + ' attended interview', C.blue, C.blueBg));
  if (c.noShow) extra.push(pill(c.noShow + ' interview no-show' + (c.noShow === 1 ? '' : 's'), C.bad, '#FBE7E5'));
  if (c.selected) extra.push(pill(c.selected + ' selected', C.good, C.goodBg));
  if (c.talk >= 60) extra.push(pill('Talk time ' + Math.floor(c.talk / 3600) + 'h ' + Math.round((c.talk % 3600) / 60) + 'm', C.ink, C.mist));
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

  return emailShell(o.kicker, o.heading, o.sub, body);
}

/** Shared frame for every email: dark header with a gold rule, light body. */
function emailShell(kicker, heading, sub, body) {
  var company = esc(getSetting('COMPANY_NAME') || 'Team');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@media only screen and (max-width:520px){.st{display:inline-block!important;width:50%!important;box-sizing:border-box!important}.st-empty{display:none!important}}</style></head><body style="margin:0;padding:0;background:' + C.page + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.page + ';"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">' +
    '<tr><td style="background:' + C.ever + ';border-radius:16px 16px 0 0;padding:26px 26px 22px;">' +
    '<div style="' + FONT + 'font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:' + C.gold + ';">' + company + ' &middot; ' + esc(kicker) + '</div>' +
    '<div style="' + FONT + 'font-size:26px;font-weight:800;color:#ffffff;margin-top:8px;line-height:1.2;">' + esc(heading) + '</div>' +
    '<div style="' + FONT + 'font-size:14px;color:#B9CCC7;margin-top:6px;">' + esc(sub) + '</div>' +
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

// ══════════════════════════════════════════════════════════════
//  CRM: FOLLOW-UPS
// ══════════════════════════════════════════════════════════════
var EDITABLE_FIELDS = ['followUp', 'status', 'remarks', 'state', 'result', 'doneAt', 'employeeId', 'employee', 'needed', 'active'];

/** Change a saved entry (reschedule / close a follow-up). */
function updateRecord(type, id, fields) {
  var sh = recordSheet(type);
  var keys = Object.keys(fields).filter(function (k) { return EDITABLE_FIELDS.indexOf(k) !== -1; });
  if (!keys.length) throw new Error('Nothing to change');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var headers = ensureHeaders(sh, keys);
    var last = sh.getLastRow();
    if (last < 2) throw new Error('Entry not found');
    var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0] !== id) continue;
      keys.forEach(function (k) {
        var cell = sh.getRange(i + 2, headers.indexOf(k) + 1);
        cell.setNumberFormat('@');
        cell.setValue(String(fields[k] == null ? '' : fields[k]).slice(0, 500));
      });
      return true;
    }
  } finally {
    lock.releaseLock();
  }
  throw new Error('Entry not found — it may have been deleted');
}

function todayIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function addDaysIso_(iso, n) {
  var p = String(iso).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function followUpOf_(r, today) {
  var f = String(r.followUp || '').trim();
  if (f === 'done') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(f)) return f;
  // Rows saved before follow-up dates existed: only recent call backs / interviews count
  if ((r.status === 'callback' || r.status === 'scheduled') && r.date >= addDaysIso_(today, -7)) return addDaysIso_(r.date, 1);
  return null;
}

/** Open follow-ups for everyone, grouped by employeeId: the latest call per number, if it still has a follow-up. */
function openFollowUpsByPerson_() {
  var today = todayIso_();
  var from = addDaysIso_(today, -60);
  var byPerson = {};
  ['calls', 'hiring'].forEach(function (type) {
    var latest = {};
    getRecords(type, from, '', '').forEach(function (r) {
      var key = r.employeeId + '|' + (r.phone || ('n:' + String(r.name || '').toLowerCase()));
      var cur = latest[key];
      if (!cur || r.date > cur.date || (r.date === cur.date && String(r.createdAt) > String(cur.createdAt))) latest[key] = r;
    });
    Object.keys(latest).forEach(function (k) {
      var r = latest[k];
      var f = followUpOf_(r, today);
      if (!f) return;
      r.fu = f; r.type_ = type;
      (byPerson[r.employeeId] = byPerson[r.employeeId] || []).push(r);
    });
  });
  Object.keys(byPerson).forEach(function (k) { byPerson[k].sort(function (a, b) { return a.fu < b.fu ? -1 : 1; }); });
  return byPerson;
}

function whenLabel_(f, today) {
  var d = String(f).slice(0, 10), t = String(f).slice(11, 16);
  var p = d.split('-'), q = today.split('-');
  var diff = Math.round((new Date(p[0], p[1] - 1, p[2]) - new Date(q[0], q[1] - 1, q[2])) / 86400000);
  var day = diff < 0 ? (diff === -1 ? '1 day late' : (-diff) + ' days late') : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : niceDate(d).split(',')[0];
  if (t) {
    var h = Number(t.slice(0, 2)), m = t.slice(3);
    day += ' ' + ((h % 12) || 12) + (m !== '00' ? ':' + m : '') + (h < 12 ? ' AM' : ' PM');
  }
  return day;
}

function calendarUrl_(r) {
  var d = String(r.fu).slice(0, 10).replace(/-/g, ''), t = String(r.fu).slice(11, 16);
  var dates;
  if (t) {
    var h = Number(t.slice(0, 2)), m = Number(t.slice(3)) + 15;
    if (m >= 60) { h += 1; m -= 60; }
    dates = d + 'T' + t.replace(':', '') + '00/' + d + 'T' + ('0' + h).slice(-2) + ('0' + m).slice(-2) + '00';
  } else {
    dates = d + '/' + addDaysIso_(String(r.fu).slice(0, 10), 1).replace(/-/g, '');
  }
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Follow up: ' + (r.name || r.phone)) +
    '&dates=' + dates + '&details=' + encodeURIComponent((r.phone ? 'Call ' + r.phone + '\n' : '') + (r.remarks ? 'Last note: ' + r.remarks : ''));
}

function fuCard_(r, today, showBy) {
  var late = String(r.fu).slice(0, 10) < today;
  var color = late ? C.bad : C.blue;
  var links = [];
  if (r.phone) {
    links.push('<a href="tel:' + esc(r.phone) + '" style="color:' + C.ever + ';font-weight:700;text-decoration:none;">&#128222; ' + esc(r.phone) + '</a>');
    links.push('<a href="https://wa.me/91' + esc(String(r.phone).slice(-10)) + '" style="color:#1F8A5B;font-weight:700;text-decoration:none;">WhatsApp</a>');
  }
  links.push('<a href="' + esc(calendarUrl_(r)) + '" style="color:' + C.blue + ';font-weight:700;text-decoration:none;">+ Calendar</a>');
  return '<tr><td style="padding:0 0 8px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ' + C.line + ';border-left:4px solid ' + color + ';border-radius:10px;">' +
    '<tr><td style="padding:11px 14px;' + FONT + '">' +
    '<div style="' + FONT + 'font-size:15px;font-weight:700;color:' + C.ink + ';">' + esc(r.name || 'No name') +
    (r.title ? ' <span style="font-size:11px;font-weight:800;color:#87540a;background:#FDF0DB;border-radius:5px;padding:2px 7px;">' + esc(r.title) + '</span>' : '') +
    ' <span style="font-size:12px;font-weight:800;color:' + color + ';">&middot; ' + esc(whenLabel_(r.fu, today)) + '</span></div>' +
    (r.remarks ? '<div style="' + FONT + 'font-size:14px;color:' + C.ink + ';margin-top:4px;line-height:1.45;">' + esc(r.remarks) + '</div>' : '') +
    (showBy ? '<div style="' + FONT + 'font-size:12px;color:' + C.muted + ';margin-top:4px;">' + esc(r.employee) + '</div>' : '') +
    '<div style="' + FONT + 'font-size:13px;margin-top:6px;">' + links.join(' &nbsp;&middot;&nbsp; ') + '</div>' +
    '</td></tr></table></td></tr>';
}

function fuList_(items, today, showBy, limit) {
  var html = items.slice(0, limit).map(function (r) { return fuCard_(r, today, showBy); }).join('');
  if (items.length > limit) html += '<tr><td style="' + FONT + 'font-size:13px;color:' + C.muted + ';padding:4px 0;">+ ' + (items.length - limit) + ' more in the app</td></tr>';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + html + '</table>';
}

function appButton_(label) {
  var link = getSetting('APP_LINK');
  if (!link) return '';
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 4px;"><tr><td style="background:' + C.ever + ';border-radius:10px;">' +
    '<a href="' + esc(link) + '" style="' + FONT + 'display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">' + label + ' &rarr;</a></td></tr></table>';
}

function personFollowUpEmail_(emp, items, today) {
  var overdue = items.filter(function (r) { return String(r.fu).slice(0, 10) < today; });
  var dueToday = items.filter(function (r) { return String(r.fu).slice(0, 10) === today; });
  var upcoming = items.filter(function (r) { var d = String(r.fu).slice(0, 10); return d > today && d <= addDaysIso_(today, 3); });
  var body = statGrid([statCell('Due today', dueToday.length, C.blue), statCell('Overdue', overdue.length, overdue.length ? C.bad : C.ink), statCell('Next 3 days', upcoming.length)]);
  if (overdue.length) body += sectionTitle('Overdue', overdue.length, C.bad, '#FBE7E5') + fuList_(overdue, today, false, 40);
  body += sectionTitle('Today', dueToday.length, C.blue, C.blueBg) + (dueToday.length ? fuList_(dueToday, today, false, 60) : emptyNote('Nothing scheduled for today.'));
  if (upcoming.length) body += sectionTitle('Coming up', upcoming.length, C.muted, C.mist) + fuList_(upcoming, today, false, 20);
  body += appButton_('Open my follow-ups');
  var first = String(emp.name || '').split(' ')[0];
  return {
    subject: 'Your follow-ups · ' + today + ' · ' + dueToday.length + ' today' + (overdue.length ? ' · ' + overdue.length + ' overdue' : ''),
    html: emailShell('Follow-up reminder', 'Good morning, ' + first, niceDate(today) + ' — call these today. Tap a number to dial.', body)
  };
}

/** Morning trigger: each person gets their follow-ups; management optionally gets the overdue list. */
function sendFollowUpReminders() {
  var today = todayIso_();
  var p = today.split('-');
  if (new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay() === 0) return; // Sunday off
  var byPerson = openFollowUpsByPerson_();
  var staff = getEmployees(true).filter(function (e) { return String(e.viewOnly).toLowerCase() !== 'yes'; });
  var sender = (getSetting('COMPANY_NAME') || 'Team') + ' Follow-ups';

  if (String(getSetting('FOLLOWUP_EMAILS') || 'yes').toLowerCase() !== 'no') {
    staff.forEach(function (e) {
      var mail = String(e.email || '').trim();
      if (!mail) return;
      var items = (byPerson[e.id] || []).filter(function (r) { return String(r.fu).slice(0, 10) <= addDaysIso_(today, 3); });
      if (!items.some(function (r) { return String(r.fu).slice(0, 10) <= today; })) return; // nothing due → no email
      var m = personFollowUpEmail_(e, items, today);
      try { MailApp.sendEmail({ to: mail, subject: m.subject, htmlBody: m.html, name: sender }); } catch (err) { console.error(err); }
    });
  }

  if (String(getSetting('FOLLOWUP_DIGEST')).toLowerCase() === 'yes') {
    var overdueAll = [];
    staff.forEach(function (e) { (byPerson[e.id] || []).forEach(function (r) { if (String(r.fu).slice(0, 10) < today) overdueAll.push(r); }); });
    if (!overdueAll.length) return;
    var rows = staff.map(function (e) {
      var mine = byPerson[e.id] || [];
      var late = mine.filter(function (r) { return String(r.fu).slice(0, 10) < today; }).length;
      var due = mine.filter(function (r) { return String(r.fu).slice(0, 10) === today; }).length;
      return { name: e.name, done: late === 0, line: due + ' due today · ' + late + ' overdue' };
    });
    var body = sectionTitle('Overdue follow-ups', overdueAll.length, C.bad, '#FBE7E5') + fuList_(overdueAll, today, true, 80);
    body += sectionTitle('By person', staff.length, C.ever, C.mist) +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ' + C.line + ';border-radius:10px;">' +
      rows.map(function (t, i) {
        var bt = i ? 'border-top:1px solid ' + C.line + ';' : '';
        return '<tr><td style="' + FONT + 'padding:10px 14px;font-size:14px;font-weight:700;color:' + C.ink + ';' + bt + '">' + esc(t.name) + '</td>' +
          '<td align="right" style="' + FONT + 'padding:10px 14px;font-size:13px;' + bt + 'color:' + (t.done ? C.good : C.bad) + ';">' + esc(t.line) + '</td></tr>';
      }).join('') + '</table>' + appButton_('Open dashboard');
    MailApp.sendEmail({
      to: managementEmails().join(','),
      subject: 'Overdue follow-ups · ' + today + ' · ' + overdueAll.length,
      htmlBody: emailShell('Follow-up check', overdueAll.length + ' overdue follow-ups', niceDate(today), body),
      name: sender
    });
  }
}

/** "Email me the list" button, and the test button on the Contacts page. */
function sendMyFollowUps(employeeId) {
  var emp = getEmployees(true).filter(function (e) { return e.id === String(employeeId); })[0];
  if (!emp) throw new Error('Employee not found');
  var mail = String(emp.email || '').trim();
  if (!mail) throw new Error('Add your reminder email first: Contacts page → Morning reminder email.');
  var today = todayIso_();
  var items = (openFollowUpsByPerson_()[emp.id] || []).filter(function (r) { return String(r.fu).slice(0, 10) <= addDaysIso_(today, 3); });
  var m = personFollowUpEmail_(emp, items, today);
  MailApp.sendEmail({ to: mail, subject: m.subject, htmlBody: m.html, name: (getSetting('COMPANY_NAME') || 'Team') + ' Follow-ups' });
  return true;
}

function saveMyEmail(employeeId, pin, email) {
  doLogin(employeeId, pin);
  email = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Not a valid email: ' + email);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EMPLOYEES);
  var headers = ensureHeaders(sh, ['email']);
  var ids = sh.getRange(2, headers.indexOf('id') + 1, sh.getLastRow() - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === String(employeeId)) { sh.getRange(i + 2, headers.indexOf('email') + 1).setValue(email); return true; }
  }
  throw new Error('Employee not found');
}

// Run once: follow-up reminder emails every morning at ~9 AM
function createFollowUpTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendFollowUpReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendFollowUpReminders').timeBased().everyDays(1).atHour(9).create();
}

/** Run from the editor to send today's reminder emails now. */
function sendTestFollowUps() { sendFollowUpReminders(); }

// ══════════════════════════════════════════════════════════════
//  ENGLISH BUTTON: Thanglish / rough notes → clear English
// ══════════════════════════════════════════════════════════════
var POLISH_PROMPT = 'You clean up short work notes typed by telecallers and HR staff at a company in Chennai, India. ' +
  'Notes may be Thanglish (Tamil written in English letters), Tamil script, a mix of Tamil and English, or rough English with spelling and grammar mistakes. ' +
  'Rewrite each note as short, clear, correct English that a manager can read quickly. Always fix the grammar, even if the note is already in English. ' +
  'Keep every fact: names, phone numbers, amounts, products, quantities, dates and times. Keep about the same length. ' +
  'Do not add details, greetings, quotes or explanations. Write in the third person for notes about a customer or candidate. ' +
  'Examples: ' +
  '"enna pandra" -> "What are you doing?"; ' +
  '"naalaiku saayangalam 5 mani call pannunga, price list anupunga" -> "Call tomorrow evening at 5. Send the price list."; ' +
  '"interest illa, rate jaasthi nu sonnanga" -> "Not interested. Said the price is too high."; ' +
  '"he dont want now, call back him next week" -> "He doesn\'t want it now. Call him back next week."; ' +
  '"licence iruku, salary evlo nu kettaru" -> "Has a licence. Asked about the salary."; ' +
  '"interview ku varala" -> "Did not come for the interview.". ' +
  'Reply with only a JSON array of strings, one per input note, in the same order.';

function polishTexts(texts) {
  texts = (texts || []).slice(0, 60).map(function (t) { return String(t == null ? '' : t).slice(0, 1000); });
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  var out = [], todo = [];
  texts.forEach(function (t, i) {
    if (!t.trim()) { out[i] = t; return; }
    var key = 'pl_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, t, Utilities.Charset.UTF_8));
    var hit = cache.get(key);
    if (hit !== null) out[i] = hit; else todo.push({ i: i, t: t, key: key });
  });
  var engine = 'cache';
  if (todo.length) {
    var results = null;
    var claudeKey = props.getProperty('ANTHROPIC_API_KEY'), geminiKey = props.getProperty('GEMINI_API_KEY');
    try {
      if (claudeKey) { results = polishWithClaude_(todo.map(function (x) { return x.t; }), claudeKey, props.getProperty('CLAUDE_MODEL')); engine = 'claude'; }
      else if (geminiKey) { results = polishWithGemini_(todo.map(function (x) { return x.t; }), geminiKey, props.getProperty('GEMINI_MODEL')); engine = 'gemini'; }
    } catch (err) { console.error('AI polish failed: ' + err); results = null; }
    if (!results || results.length !== todo.length) { results = todo.map(function (x) { return polishBasic_(x.t); }); engine = 'basic'; }
    todo.forEach(function (x, j) {
      var r = String(results[j] == null ? '' : results[j]).trim() || x.t;
      out[x.i] = r;
      if (engine !== 'basic') cache.put(x.key, r, 21600);
    });
  }
  return { texts: out, engine: engine };
}

function jsonArrayFrom_(text) {
  var m = String(text || '').match(/\[[\s\S]*\]/);
  if (!m) throw new Error('No JSON array in reply');
  var arr = JSON.parse(m[0]);
  if (!Array.isArray(arr)) throw new Error('Reply is not an array');
  return arr;
}

function polishWithClaude_(texts, key, model) {
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001', max_tokens: 4000, system: POLISH_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(texts) }]
    })
  });
  if (res.getResponseCode() !== 200) throw new Error('Claude ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  var data = JSON.parse(res.getContentText());
  return jsonArrayFrom_((data.content || []).map(function (c) { return c.text || ''; }).join(''));
}

// Model names change over time: try the chosen one, then current free-tier Flash models
var GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
function polishWithGemini_(texts, key, model) {
  var list = (model ? [model] : []).concat(GEMINI_MODELS);
  var lastErr = null;
  for (var i = 0; i < list.length; i++) {
    try { return geminiCall_(texts, key, list[i]); }
    catch (err) {
      lastErr = err;
      if (!/ 404| 400.*(model|not found)/i.test(String(err.message))) throw err; // only move on when the model name is unknown
    }
  }
  throw lastErr;
}
function geminiCall_(texts, key, model) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      systemInstruction: { parts: [{ text: POLISH_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(texts) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
    })
  });
  if (res.getResponseCode() !== 200) throw new Error('Gemini ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  var data = JSON.parse(res.getContentText());
  var parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  return jsonArrayFrom_(parts.map(function (p) { return p.text || ''; }).join(''));
}

/** Run from the editor to check the English button works with your key. */
function testPolish() {
  console.log(JSON.stringify(polishTexts(['naalaiku saayangalam 5 mani call pannunga, price list anupunga', 'interest illa, rate jaasthi nu sonnanga'])));
}

// No AI key: Tamil script → Google Translate; Thanglish → word lists (same as the app's offline mode)
// <thanglish-data> (generated by scripts/sync-thanglish.py — edit src/lib/thanglish-data.js instead)
var TH_DATA = {"GRAMMAR": [["\\b(he|she|it) (don't)\\b", "$1 doesn't"], ["\\b(they|we|you|I) doesn't\\b", "$1 don't"], ["\\b(he|she|it) have\\b", "$1 has"], ["\\b(he|she|it) want\\b", "$1 wants"], ["\\b(he|she|it) need\\b", "$1 needs"], ["\\b(he|she|it) say\\b", "$1 says"], ["\\b(they|we|you|I) wants\\b", "$1 want"], ["\\b(they|we|you|I) needs\\b", "$1 need"], ["\\bI is\\b", "I am"], ["\\b(he|she|it|they|we|you) is not interest\\b", "$1 is not interested"], ["\\bnot interest\\b", "not interested"], ["\\bis interest\\b", "is interested"], ["\\bcall back (him|her|them)\\b", "call $1 back"], ["\\bwill (came|comes)\\b", "will come"], ["\\bdidn't (came|comes)\\b", "didn't come"], ["\\bdidn't (picked|picks)\\b", "didn't pick"], ["\\bdidn't (joined|joins)\\b", "didn't join"], ["\\bdid not came\\b", "did not come"], ["\\bdid not picked\\b", "did not pick"], ["\\bdid not joined\\b", "did not join"], ["\\ba (order|interview|offer|amount|owner|update|answer|hour)\\b", "an $1"], ["\\ban (price|sample|call|delivery|payment|salary|job|licence|driver|customer)\\b", "a $1"], ["\\b(\\w+) \\1\\b", "$1"], ["\\s+([,.!?])", "$1"]], "PHRASES": [[["enna pandra", "enna panra", "enna panringa", "enna pannureenga", "enna pannura", "enna panreenga", "enna pannringa"], "what are you doing"], [["saptiya", "saapteengala", "sapteengala", "saptingala", "saapitiya", "sapteenga"], "did you eat"], [["enga irukinga", "enga irukeenga", "enga irukka", "enga iruka", "enga irukenga"], "where are you"], [["epo varuvinga", "eppo varuvinga", "epo varuva", "eppo varuveenga", "epo vareenga", "eppo vareenga"], "when will you come"], [["epdi irukinga", "eppadi irukeenga", "epdi iruka", "eppadi irukka", "epdi irukeenga"], "how are you"], [["nalla irukken", "nalla iruken", "nalla irukkaen"], "I am fine"], [["vandhutu irukken", "vanthuttu irukken", "vandhutu iruken", "varen varen"], "I am on the way"], [["kelambitten", "kilambitten", "kelambiten"], "I have left"], [["theriyala", "teriyala", "theriyadhu", "theriyathu", "therla"], "don't know"], [["puriyala", "puriyalai", "puriyalaye"], "didn't understand"], [["mudiyadhu", "mudiyathu", "mudiyala", "mudiyaathu"], "cannot"], [["velai irukku", "vela iruku", "vela irukku", "velai iruku"], "busy with work"], [["leave la irukanga", "leave la irukaru", "leave la iruken", "leave la irukken"], "is on leave"], [["ooru la illa", "oorla illa", "ooru la ila"], "is out of town"], [["interest illa", "interest illai", "intrest illa", "interested illa", "interest ila"], "not interested"], [["thevai illa", "theva illa", "thevai illai", "theva ila"], "not needed"], [["stock illa", "stock ila", "stock illai"], "out of stock"], [["stock iruka", "stock irukka"], "is stock available"], [["delivery eppo", "delivery epo"], "when is the delivery"], [["delivery varala", "delivery varla", "delivery vandhala"], "delivery has not arrived"], [["sample kudunga", "sample anupunga", "sample anuppunga", "sample venum"], "wants a sample"], [["quotation anupunga", "quotation anuppunga", "quotation venum"], "send a quotation"], [["price list anupunga", "price list anuppunga", "price list venum", "rate list anupunga"], "send the price list"], [["location anupunga", "location anuppunga", "location share pannunga"], "send the location"], [["owner illa", "owner ila", "owner illai"], "owner not available"], [["owner kitta pesanum", "owner kita pesanum", "owner kitta pesunga"], "need to talk to the owner"], [["amount anupuren", "amount anuppuren", "pay panren", "pay pannuren", "payment panren"], "will send the payment"], [["payment pannitanga", "pay pannitanga", "amount potutanga", "amount pottutanga", "payment aachu"], "has paid"], [["order podrom", "order poduvom", "order poduvanga", "order poduvaru", "order pannuvanga", "order pannuvaru"], "will place an order"], [["order potanga", "order pottanga", "order pannitanga", "order pottaru"], "placed an order"], [["rate jaasthi", "rate jasthi", "rate adhigam", "rate athigam", "vilai jaasthi"], "price is too high"], [["rate kammi pannunga", "rate kammi panna mudiyuma", "discount venum", "discount kudunga"], "wants a discount"], [["vera kadai la vaanguranga", "vera edathula vaanguranga", "already vaanguranga"], "already buying from another shop"], [["phone edukala", "call edukala", "edukala", "edukkala", "eduthala", "edukalai", "edukavillai", "call attend pannala"], "did not pick up"], [["reach aagala", "reach agala", "not reachable ah iruku"], "not reachable"], [["switch off ah iruku", "switch off ah irukku", "switch off la iruku", "switched off ah iruku"], "phone switched off"], [["busy ah iruku", "busy ah irukku", "busy ya irukanga", "busy ah irukanga", "busy nu sonnanga"], "busy"], [["call back pannunga", "thirumba call pannunga", "marupadiyum call pannunga"], "call back"], [["call pannunga", "call panunga", "call pannu", "call pannanum", "kupdunga", "koopdunga", "kooptunga", "kupudunga"], "call"], [["yosichu solren", "yosithu solren", "yosikiren", "yosikaren", "yosichu sollren"], "will think and let us know"], [["ok nu sonnanga", "ok nu sonnaru", "okay nu sonnanga", "sari nu sonnanga"], "agreed"], [["wrong number", "thappana number", "thappu number"], "wrong number"], [["salary evlo", "salary evvalavu", "sambalam evlo"], "asked about the salary"], [["salary kammi", "sambalam kammi"], "salary is too low"], [["experience iruku", "experience irukku", "anubavam iruku"], "has experience"], [["experience illa", "experience ila", "anubavam illa"], "no experience"], [["licence iruku", "license iruku", "licence irukku", "license irukku"], "has a licence"], [["licence illa", "license illa", "licence ila", "license ila"], "no licence"], [["vela venum", "velai venum", "job venum"], "needs a job"], [["vela venam", "velai venam", "job venam"], "doesn't want the job"], [["interview ku varuvanga", "interview ku varuvaanga", "interview ku varuvaru", "interview ku varen", "interview varuvanga"], "will come for the interview"], [["interview ku varala", "interview varala", "interview ku varla"], "did not come for the interview"], [["join pannitaru", "join pannitanga", "join panitaru", "join panitanga", "join aagitaru", "join agitaru"], "has joined"], [["join panraru", "join panranga", "join pannuvaru", "join pannuvanga"], "will join"], [["vera company la join pannitaru", "vera company join pannitaru", "already vera company"], "already joined another company"], [["vela vittu poitaru", "velaya vittutaru", "resign pannitaru"], "has left the job"]], "PROPER": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "June", "July", "August", "September", "October", "November", "December", "Chennai"], "QUESTION_START": "^(what|when|where|who|why|how)\\b|^(did|do|does|is|are|can|will|could|would|should)\\s+(you|he|she|they|we|i|it|the|this|that|stock|delivery|salary)\\b", "REPORTED": [["(\\s*)([^,.;!?]+?)\\s+nu\\s+(sonnanga|sonnaanga|sonnaru|sonnar|solranga|solraru)\\b", "$1they said $2"], ["(\\s*)([^,.;!?]+?)\\s+nu\\s+(kettanga|kettaru|kekuranga|kekuraru)\\b", "$1asked $2"]], "TYPOS": {"intrested": "interested", "intersted": "interested", "interseted": "interested", "intrsted": "interested", "ntrstd": "interested", "tmrw": "tomorrow", "tmr": "tomorrow", "tomo": "tomorrow", "tommorow": "tomorrow", "tomorow": "tomorrow", "tommorrow": "tomorrow", "tmrow": "tomorrow", "pls": "please", "plz": "please", "plzz": "please", "wil": "will", "recieved": "received", "recived": "received", "wat": "what", "wht": "what", "bcoz": "because", "becoz": "because", "bcz": "because", "coz": "because", "msg": "message", "dnt": "don't", "dont": "don't", "cant": "can't", "wont": "won't", "didnt": "didn't", "doesnt": "doesn't", "isnt": "isn't", "wasnt": "wasn't", "havent": "haven't", "im": "I'm", "ur": "your", "u": "you", "r": "are", "abt": "about", "frm": "from", "nxt": "next", "wk": "week", "mrng": "morning", "evng": "evening", "eve": "evening", "amt": "amount", "pymt": "payment", "dlvry": "delivery", "cust": "customer", "cal": "call", "bck": "back", "thnx": "thanks", "thx": "thanks", "avlbl": "available", "availble": "available", "avaliable": "available", "adress": "address", "addres": "address", "beacuse": "because", "definately": "definitely", "seperate": "separate", "untill": "until", "tommrow": "tomorrow", "shd": "should", "wud": "would", "cud": "could", "lic": "licence", "exp": "experience", "sal": "salary", "intw": "interview", "intvw": "interview", "joing": "joining", "ph": "phone"}, "WORDS": {"enna": "what", "epo": "when", "eppo": "when", "enga": "where", "yaaru": "who", "yaar": "who", "evlo": "how much", "evvalavu": "how much", "epdi": "how", "eppadi": "how", "yen": "why", "en": "why", "naan": "I", "na": "I", "naanga": "we", "nee": "you", "neenga": "you", "avan": "he", "avaru": "he", "aval": "she", "ava": "she", "avanga": "they", "enakku": "I", "enaku": "I", "unakku": "you", "ungalukku": "you", "avangaluku": "they", "avarukku": "he", "amma": "mother", "appa": "father", "naalaiku": "tomorrow", "nalaiku": "tomorrow", "naalaikku": "tomorrow", "nalaikku": "tomorrow", "nalaki": "tomorrow", "naliku": "tomorrow", "inniku": "today", "indru": "today", "innaiku": "today", "innikku": "today", "inniki": "today", "nethu": "yesterday", "nethikku": "yesterday", "neththu": "yesterday", "saayangalam": "evening", "sayangalam": "evening", "saayanthiram": "evening", "kaalaila": "in the morning", "kalaila": "in the morning", "kaalaiyila": "in the morning", "madhiyam": "afternoon", "mathiyam": "afternoon", "raathiri": "night", "rathiri": "night", "mani": "o'clock", "vaaram": "week", "varam": "week", "maasam": "month", "adutha": "next", "ippo": "now", "ipo": "now", "appo": "then", "aprom": "later", "apram": "later", "apparam": "later", "appuram": "later", "innum": "still", "seekiram": "soon", "sikiram": "soon", "udane": "immediately", "thirumba": "again", "marupadiyum": "again", "aama": "yes", "aamaa": "yes", "illa": "no", "illai": "no", "ila": "no", "sari": "okay", "seri": "okay", "venum": "wants", "vendum": "needs", "venam": "doesn't want", "venaam": "doesn't want", "vendam": "doesn't want", "vendaam": "doesn't want", "mudiyum": "can", "mudiyuma": "can you", "sonnanga": "said", "sonnaru": "said", "sonnar": "said", "sonnen": "I said", "sollunga": "please tell", "sollu": "tell", "solren": "will tell", "pesunga": "please talk", "pesinen": "spoke", "pesunen": "spoke", "pesalam": "let's talk", "pesanum": "need to talk", "pesuren": "will talk", "anupunga": "send", "anuppunga": "send", "anuppu": "send", "anupu": "send", "anupinen": "sent", "anuppinen": "sent", "anupuren": "will send", "varuvanga": "will come", "varuvaanga": "will come", "varuvaru": "will come", "varala": "did not come", "varla": "did not come", "vanthanga": "came", "vandhanga": "came", "vanga": "come", "vaanga": "come", "ponga": "go", "poitanga": "left", "poitaru": "left", "pakalam": "we'll see", "paakalam": "we'll see", "paakuren": "will check", "pakuren": "will check", "paarunga": "please check", "kettanga": "asked", "kettaru": "asked", "kekkuren": "will ask", "kudunga": "give", "kudu": "give", "kuduthen": "gave", "vaangunga": "buy", "vaanguvanga": "will buy", "vaangala": "did not buy", "vaanginaanga": "bought", "vaangitanga": "bought", "panren": "will do", "pannuren": "will do", "pannunga": "please do", "pannala": "did not do", "pannitten": "done", "panniten": "done", "irukku": "is there", "iruku": "is there", "irukanga": "are there", "irundhuchu": "was there", "aachu": "done", "achu": "done", "mudinjuchu": "finished", "mudinjathu": "finished", "therinjavanga": "known person", "vilai": "price", "rate": "price", "kammi": "low", "kamma": "low", "jaasthi": "high", "jasthi": "high", "adhigam": "high", "athigam": "high", "kadai": "shop", "kada": "shop", "veedu": "house", "veetla": "at home", "ennai": "oil", "arisi": "rice", "paruppu": "dal", "sakkarai": "sugar", "sambalam": "salary", "vela": "job", "velai": "job", "panam": "money", "kaasu": "money", "kandippa": "definitely", "konjam": "a little", "romba": "very", "rombha": "very", "nalla": "good", "mosam": "bad", "pudhu": "new", "puthu": "new", "pazhaya": "old", "palaya": "old", "nandri": "thank you", "inga": "here", "anga": "there"}};
// </thanglish-data>
var TH_ = null;
function thCompile_() {
  if (TH_) return TH_;
  var esc = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var phrases = [];
  TH_DATA.PHRASES.forEach(function (p) { p[0].forEach(function (a) { phrases.push([a, p[1]]); }); });
  phrases.sort(function (a, b) { return b[0].length - a[0].length; });
  TH_ = {
    phrases: phrases.map(function (p) { return [new RegExp('\\b' + esc(p[0]).replace(/ /g, '\\s+') + '\\b', 'gi'), p[1]]; }),
    grammar: TH_DATA.GRAMMAR.map(function (g) { return [new RegExp(g[0], 'gi'), g[1]]; }),
    reported: TH_DATA.REPORTED.map(function (g) { return [new RegExp(g[0], 'gi'), g[1]]; }),
    question: new RegExp(TH_DATA.QUESTION_START, 'i'),
    proper: new RegExp('\\b(' + TH_DATA.PROPER.join('|') + ')\\b', 'gi'),
    particles: /\s+\b(ah|ha|nu|um|dhan|than|ku|kku|la|da|di|pa|ma|ji|nga)\b(?=[\s,.!?]|$)/gi
  };
  return TH_;
}
function polishBasic_(text) {
  if (/[\u0B80-\u0BFF]/.test(text)) { try { return LanguageApp.translate(text, 'ta', 'en'); } catch (e) { /* fall through */ } }
  var c = thCompile_();
  var t = ' ' + String(text || '').replace(/\s+/g, ' ').trim() + ' ';
  if (!t.trim()) return text;
  c.reported.forEach(function (r) { t = t.replace(r[0], r[1]); });
  c.phrases.forEach(function (r) { t = t.replace(r[0], r[1]); });
  t = t.replace(/\b[A-Za-z']+\b/g, function (w) {
    var low = w.toLowerCase();
    if (TH_DATA.WORDS[low] !== undefined) return TH_DATA.WORDS[low];
    if (TH_DATA.TYPOS[low] !== undefined) return TH_DATA.TYPOS[low];
    return w;
  });
  t = t.replace(c.particles, '');
  t = t.replace(/\bi\b/g, 'I').replace(c.proper, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
  t = t.replace(/\s+/g, ' ');
  c.grammar.forEach(function (r) { t = t.replace(r[0], r[1]); });
  t = t.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/,\s*,/g, ',').trim();
  return t.split(/(?<=[.!?])\s+/).map(function (x) {
    x = x.trim();
    if (!x) return '';
    x = x.charAt(0).toUpperCase() + x.slice(1);
    if (!/[.!?]$/.test(x)) x += c.question.test(x) ? '?' : '.';
    return x;
  }).filter(String).join(' ');
}


// ══════════════════════════════════════════════════════════════
//  CALL QUEUE: several changes at once (reassigning, closing a list)
// ══════════════════════════════════════════════════════════════
function updateRecords(type, updates) {
  var sh = recordSheet(type);
  updates = (updates || []).slice(0, 2000);
  if (!updates.length) return 0;
  var keys = {};
  updates.forEach(function (u) { Object.keys(u.fields || {}).forEach(function (k) { if (EDITABLE_FIELDS.indexOf(k) !== -1) keys[k] = true; }); });
  keys = Object.keys(keys);
  if (!keys.length) throw new Error('Nothing to change');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var headers = ensureHeaders(sh, keys);
    var last = sh.getLastRow();
    if (last < 2) return 0;
    var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    var rowOf = {};
    ids.forEach(function (r, i) { rowOf[r[0]] = i + 2; });
    // Write each changed column in one go
    var changed = 0;
    keys.forEach(function (k) {
      var col = headers.indexOf(k) + 1;
      var range = sh.getRange(2, col, last - 1, 1);
      range.setNumberFormat('@');
      var vals = range.getValues();
      var touched = false;
      updates.forEach(function (u) {
        if (!u.fields || u.fields[k] === undefined || !rowOf[u.id]) return;
        vals[rowOf[u.id] - 2][0] = String(u.fields[k] == null ? '' : u.fields[k]).slice(0, 500);
        touched = true;
      });
      if (touched) { range.setValues(vals); changed++; }
    });
    return changed;
  } finally {
    lock.releaseLock();
  }
}
