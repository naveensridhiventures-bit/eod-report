/**
 * Sridhi Ventures BOS — Google Sheets gateway (Apps Script web app)
 *
 * Called by api/sync.py on Vercel. Thin on purpose: it only reads and writes
 * raw rows. All merge / coercion logic stays in api/sync.py.
 *
 * SETUP (once):
 *  1. Open your Google Sheet -> Extensions -> Apps Script, paste this file.
 *     (If the script is NOT bound to the sheet, set Script Property SHEET_ID.)
 *  2. Project Settings -> Script Properties -> add SCRIPT_TOKEN = any long
 *     random string (also set the same value as APPS_SCRIPT_TOKEN in Vercel).
 *  3. Deploy -> Manage deployments -> pencil icon -> Version: "New version"
 *     -> Deploy. Keeping the same deployment keeps the same /exec URL.
 *     Execute as: Me.  Who has access: Anyone.
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('SCRIPT_TOKEN');
    if (expected && req.token !== expected) return out_({ ok: false, error: 'Unauthorized' });

    var ss = spreadsheet_(props);
    switch (req.action) {
      case 'tabs':
        return out_({ ok: true, tabs: ss.getSheets().map(function (s) { return s.getName(); }) });
      case 'read':
        return out_({ ok: true, values: readTab_(ss, req.tab) });
      case 'readAll':
        var all = {};
        ss.getSheets().forEach(function (s) { all[s.getName()] = readSheet_(s); });
        return out_({ ok: true, tabs: all });
      case 'ensureTab':
        getOrCreate_(ss, req.tab);
        return out_({ ok: true });
      case 'write':
        writeTab_(ss, req.tab, req.values || []);
        return out_({ ok: true, rows: (req.values || []).length });
      default:
        return out_({ ok: false, error: 'Unknown action: ' + req.action });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// Health check: open the /exec URL in a browser -> {"ok":true,...}
function doGet() {
  return out_({ ok: true, service: 'sridhi-sheets-gateway', time: new Date().toISOString() });
}

function spreadsheet_(props) {
  var id = props.getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreate_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readSheet_(sheet) {
  var lr = sheet.getLastRow(), lc = sheet.getLastColumn();
  if (lr < 1 || lc < 1) return [];
  return sheet.getRange(1, 1, lr, lc).getDisplayValues(); // strings exactly as shown
}

function readTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  return sh ? readSheet_(sh) : [];
}

function writeTab_(ss, name, values) {
  var sh = getOrCreate_(ss, name);
  sh.clearContents();                       // also drops stale rows after deletes
  if (!values.length) return;
  var width = values.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  var rows = values.map(function (r) {      // rectangular, all strings
    var o = r.map(function (c) { return c == null ? '' : String(c); });
    while (o.length < width) o.push('');
    return o;
  });
  var range = sh.getRange(1, 1, rows.length, width);
  range.setNumberFormat('@');               // keep phone numbers / dates as text
  range.setValues(rows);
  SpreadsheetApp.flush();
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
