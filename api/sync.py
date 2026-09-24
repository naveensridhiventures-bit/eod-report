"""
api/sheets.py - Sridhi Ventures BOS Google Sheets sync
"""
import json
import os
import time
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

_IMPORT_ERROR = None
try:
    from google.oauth2 import service_account
    import google.auth.transport.requests
except Exception as _e:
    import traceback
    _IMPORT_ERROR = traceback.format_exc()

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

def _norm_tab_name(s):
    # Matches tab names ignoring case AND whitespace, so a sheet tab someone
    # typed as "Existing Customers" still matches the "ExistingCustomers"
    # config key instead of silently falling through to a tab that doesn't
    # exist (which is what happened here — reads/writes targeted a
    # non-existent tab, so nothing ever actually reached the sheet).
    return "".join(str(s).split()).lower()

TAB_CONFIG = {
    "leads":           {"tab": "Leads",           "headers": ["id","name","contact","business","type","area","address","mapLink","stage","source","telecaller","lastContact","lastContactAt","createdAt","orderCount","callOutcome","priority","remarks","kgQty","lostReason","lostReasonNote"]},
    "samples":         {"tab": "Samples",          "headers": ["id","customer","leadId","qty","unit","type","date","exec","deliveryCost","productionCost","status","feedback","converted"]},
    "expenses":        {"tab": "Expenses",         "headers": ["id","category","amount","date","type","subtype"]},
    "repeatCustomers": {"tab": "RepeatCustomers",  "headers": ["id","name","area","contact","product","qty","frequency","lastOrder","nextDue","status","revenue"]},
    "hrLeads": {"tab": "HRLeads", "headers": ["contact"]},
    "dailyOrders": {"tab": "DailyOrders", "headers": ["id","date","customer","area","contact","address","mapLink","deliveryTime","orderType","product","items","kgs","amount","telecaller","status","cancelReason","cancelRemarks","sampleType","amountMode","manualAmount","createdAt"]},
    "existingCustomers": {"tab": "ExistingCustomers", "headers": ["id","name","contact","area","address","reason","status","remarks","lastRemarkAt","createdAt","telecaller"]},
    "telecallerActivity": {"tab": "TelecallerActivity", "headers": ["id","date","telecaller","type","customer","area","kg","amount","qty","unit","notes","createdAt"]},
    "milkDistributors": {"tab": "MilkDistributors", "headers": ["id","name","contact","area","address","mapLink","status","telecaller","currentBrand","telecallerRemarks","fieldSalesRemarks","createdAt","lastTelecallerRemarkAt","lastFieldSalesRemarkAt","batchTitle"]},
    "homeCustomers": {"tab": "HomeCustomers", "headers": ["id","name","contact","area","address","mapLink","leadType","source","status","telecaller","distributor","remarks","lastRemarkAt","createdAt","batchTitle"]},
    "hubDistributors": {"tab": "HubDistributors", "headers": ["id","hub","name","contact","areas","address","mapLink","details","status","telecaller","remarks","createdAt","lastRemarkAt","scheduledVisitAt","scheduledVisitNote","batchTitle"]},
    "hiring": {"tab": "Hiring", "headers": ["id","name","contact","role","area","experience","expectedSalary","source","stage","assignedTo","scheduledAt","scheduledNote","remarks","lastRemarkAt","createdAt","joinedAt","rejectedReason","batchTitle"]},
}

_cache = {}
CACHE_TTL = 60

# ── Google Apps Script bridge ───────────────────────────────────────────────
# When APPS_SCRIPT_URL is set (default below), every sheet read/write goes
# through the deployed Apps Script web app (see apps-script/Code.gs) instead
# of the Sheets REST API + service account. All merge/coercion logic in this
# file is unchanged. Set APPS_SCRIPT_URL="" in Vercel to fall back to the
# service-account path.
DEFAULT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxin-VBGXce_mwmnL9n0qgGXN5ALs2Bm9gC8I-T1RGgrOlsuPPIBkgZbf5AJxq5vrap4Q/exec"

def _gas_url():
    if "APPS_SCRIPT_URL" in os.environ:
        return os.environ["APPS_SCRIPT_URL"].strip()
    return DEFAULT_APPS_SCRIPT_URL

def _gas_call(payload):
    """POST JSON to the Apps Script web app and return the parsed reply.
    Apps Script answers a POST with a 302 to a googleusercontent URL that
    serves the result via GET; urllib follows that redirect automatically."""
    body = dict(payload)
    token = os.environ.get("APPS_SCRIPT_TOKEN", "")
    if token:
        body["token"] = token
    req = urllib.request.Request(
        _gas_url(),
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "text/plain;charset=utf-8"},
    )
    with urllib.request.urlopen(req, timeout=50) as resp:
        raw = resp.read().decode("utf-8", "replace")
    try:
        out = json.loads(raw)
    except Exception:
        raise RuntimeError("Apps Script returned a non-JSON reply (check the deployment is 'Anyone' and the URL ends in /exec): " + raw[:200])
    if not out.get("ok"):
        raise RuntimeError("Apps Script error: " + str(out.get("error", "unknown")))
    return out

def get_token():
    if _gas_url():
        return ""  # Apps Script mode: no Google OAuth token needed
    email = os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL", "")
    raw_key = os.environ.get("GOOGLE_PRIVATE_KEY", "")
    # Handle all Vercel key encoding variants
    raw_key = raw_key.replace("\\n", "\n").replace("\r", "").strip()
    creds = service_account.Credentials.from_service_account_info(
        {"type": "service_account", "client_email": email, "private_key": raw_key,
         "token_uri": "https://oauth2.googleapis.com/token"},
        scopes=SCOPES,
    )
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def get_sheet_tabs(sheet_id, token):
    """Get all actual tab names from the spreadsheet."""
    if _gas_url():
        return _gas_call({"action": "tabs"})["tabs"]
    url = "https://sheets.googleapis.com/v4/spreadsheets/{}?fields=sheets.properties.title".format(sheet_id)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    return [s["properties"]["title"] for s in data.get("sheets", [])]

def ensure_tab(sheet_id, title, actual_tabs, token):
    """Create the sheet tab on first save if it doesn't exist yet, so a new
    module (HomeCustomers) works without anyone hand-creating the tab."""
    if title in actual_tabs:
        return
    if _gas_url():
        _gas_call({"action": "ensureTab", "tab": title})
        return
    url = "https://sheets.googleapis.com/v4/spreadsheets/{}:batchUpdate".format(sheet_id)
    payload = json.dumps({"requests": [{"addSheet": {"properties": {"title": title}}}]}).encode()
    req = urllib.request.Request(url, data=payload, method="POST",
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        resp.read()

def sheets_get(sheet_id, tab_name, token):
    # No trailing row number — an open-ended column range (A:Z) reads every
    # row Google Sheets actually has data in, however large the tab grows.
    # The previous hardcoded A1:Z500 silently hid (and on the next write,
    # effectively dropped) anything added past row 500.
    if _gas_url():
        return {"values": _gas_call({"action": "read", "tab": tab_name}).get("values", [])}
    encoded = urllib.parse.quote(tab_name + "!A:Z", safe="")
    url = "https://sheets.googleapis.com/v4/spreadsheets/{}/values/{}".format(sheet_id, encoded)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def sheets_update(sheet_id, tab_name, values, token):
    if _gas_url():
        return _gas_call({"action": "write", "tab": tab_name, "values": values})
    url = "https://sheets.googleapis.com/v4/spreadsheets/{}/values:batchUpdate".format(sheet_id)
    payload = json.dumps({
        "valueInputOption": "RAW",
        "data": [{"range": tab_name + "!A1", "values": values}]
    }).encode()
    req = urllib.request.Request(url, data=payload, method="POST",
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def read_tab(tab_name, token):
    sheet_id = os.environ.get("GOOGLE_SHEET_ID", "")
    result = sheets_get(sheet_id, tab_name, token)
    values = result.get("values", [])
    if not values:
        return []
    headers, *rows = values
    return [
        {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
        for row in rows if any(str(c).strip() for c in row)
    ]

def _cell_str(v):
    # Lists/dicts (e.g. a dailyOrders row's multi-product "items" array) must
    # round-trip through JSON, not Python's str()/repr(), or they come back
    # as unparsable text on read (breaking anything keyed off that field,
    # like per-product totals for a newer product such as Vada Batter).
    if isinstance(v, (list, dict)):
        return json.dumps(v)
    return str(v or "")

def write_tab(tab_name, headers, records, token):
    sheet_id = os.environ.get("GOOGLE_SHEET_ID", "")
    data_rows = [[_cell_str(r.get(h, "")) for h in headers] for r in records]
    sheets_update(sheet_id, tab_name, [headers] + data_rows, token)

# Tabs are never hard-deleted from in this app (everything is soft-managed via
# a status/cancel field), so it's always safe to upsert-merge rather than
# blindly overwrite. This is what prevents a second telecaller's save from
# silently erasing a row the first telecaller just added a moment earlier.
ID_FIELD = {"hrLeads": "contact"}

def _merge_key(row, id_field):
    v = row.get(id_field, "")
    if v not in (None, ""):
        return str(v)
    # No id at all (legacy row) — key on full content so it still dedupes
    # exact repeats but never collides with a genuinely different row.
    return "row::" + json.dumps(row, sort_keys=True, default=str)

def merge_records(existing_rows, incoming_records, tab_key):
    """Upsert incoming_records onto existing_rows by id, preserving any row
    that exists on the sheet but wasn't included in this particular write
    (i.e. rows another telecaller/device saved that this client doesn't know
    about yet). Incoming rows win on id collisions since they're the newer,
    intentional edit."""
    id_field = ID_FIELD.get(tab_key, "id")
    merged = {}
    order = []
    for row in existing_rows:
        k = _merge_key(row, id_field)
        if k not in merged:
            order.append(k)
        merged[k] = row
    for row in incoming_records:
        k = _merge_key(row, id_field)
        if k not in merged:
            order.append(k)
        merged[k] = row
    return [merged[k] for k in order]

def _apply_deletes(records, deleted_ids, tab_key):
    """Explicit deletions win over the upsert-merge above. Without this, a
    telecaller deleting a wrongly-entered order would see it vanish locally
    but then get silently resurrected on the next sync, because the merge
    logic (by design) preserves any row still present on the sheet."""
    if not deleted_ids:
        return records
    id_field = ID_FIELD.get(tab_key, "id")
    deleted_set = {str(d) for d in deleted_ids}
    return [r for r in records if str(r.get(id_field, "")) not in deleted_set]

def _normalize_phone(phone):
    """Normalize phone numbers to 10 digits: strip +91, 091, spaces, dashes."""
    import re
    digits = re.sub(r"[^0-9]", "", str(phone or ""))
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("091") and len(digits) == 13:
        digits = digits[3:]
    return digits[-10:] if len(digits) >= 10 else digits

def _deserialize_remark_obj(s):
    # Shared by ExistingCustomers and MilkDistributors: each remark is either
    # a legacy plain string, or a newer structured entry (JSON-encoded,
    # carrying who logged it) — the whole list is stored as one
    # " || "-joined sheet cell either way.
    s = s.strip()
    if s.startswith("{") and s.endswith("}"):
        try:
            obj = json.loads(s)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
    return s

def _serialize_remark_obj(r):
    return json.dumps(r, ensure_ascii=False) if isinstance(r, dict) else str(r)

def _coerce(tab_key, row):
    if tab_key == "hrLeads":
        row["contact"] = _normalize_phone(row.get("contact",""))
        return row
    if tab_key == "leads":
        row["id"] = str(row.get("id", ""))
        row["remarks"] = [r for r in row.get("remarks","").split(" || ") if r] if row.get("remarks") else []
        for f in ("lastContactAt", "createdAt", "orderCount", "kgQty"):
            if row.get(f, "") not in (None, ""):
                try: row[f] = int(float(row[f]))
                except: pass
            else:
                row[f] = None if f in ("lastContactAt", "createdAt") else 0
    elif tab_key == "telecallerActivity":
        for f in ("kg","amount","qty","createdAt"):
            if row.get(f, "") not in (None, ""):
                try: row[f] = float(row[f]) if "." in str(row[f]) else int(row[f])
                except: pass
            else:
                row[f] = 0
    elif tab_key == "milkDistributors":
        row["telecallerRemarks"] = [_deserialize_remark_obj(r) for r in row.get("telecallerRemarks","").split(" || ") if r] if row.get("telecallerRemarks") else []
        row["fieldSalesRemarks"] = [_deserialize_remark_obj(r) for r in row.get("fieldSalesRemarks","").split(" || ") if r] if row.get("fieldSalesRemarks") else []
        for f in ("createdAt", "lastTelecallerRemarkAt", "lastFieldSalesRemarkAt"):
            if row.get(f, "") not in (None, ""):
                try: row[f] = int(float(row[f]))
                except: pass
            else:
                row[f] = None
    elif tab_key in ("samples","expenses","repeatCustomers","dailyOrders"):
        for f in ("id","qty","deliveryCost","productionCost","amount","revenue","leadId","kgs","createdAt"):
            if f in row:
                try: row[f] = float(row[f]) if "." in str(row[f]) else int(row[f])
                except: pass
        if tab_key == "samples":
            row["converted"] = str(row.get("converted","")).lower() in ("true","1","yes")
            if not row.get("feedback","").strip(): row["feedback"] = None
        if tab_key == "dailyOrders":
            if not row.get("status","").strip(): row["status"] = "Active"
            raw_items = row.get("items", "")
            if isinstance(raw_items, str) and raw_items.strip():
                try:
                    parsed = json.loads(raw_items)
                    if isinstance(parsed, list):
                        for it in parsed:
                            if isinstance(it, dict):
                                for nf in ("kgs", "rate", "amount"):
                                    if nf in it:
                                        try: it[nf] = float(it[nf]) if "." in str(it[nf]) else int(it[nf])
                                        except: pass
                        row["items"] = parsed
                    else:
                        row["items"] = []
                except Exception:
                    row["items"] = []
            elif not isinstance(raw_items, list):
                row["items"] = []
    elif tab_key == "existingCustomers":
        # Each remark is either a legacy plain string, or a newer structured
        # entry (JSON-encoded, carrying telecaller attribution) — the whole
        # list is still stored as one "||"-joined sheet cell either way.
        def _deserialize_remark(s):
            s = s.strip()
            if s.startswith("{") and s.endswith("}"):
                try:
                    obj = json.loads(s)
                    if isinstance(obj, dict):
                        return obj
                except Exception:
                    pass
            return s
        row["remarks"] = [_deserialize_remark(r) for r in row.get("remarks","").split(" || ") if r] if row.get("remarks") else []
        for f in ("lastRemarkAt", "createdAt"):
            if row.get(f, "") not in (None, ""):
                try: row[f] = int(float(row[f]))
                except: pass
            else:
                row[f] = None
    elif tab_key == "homeCustomers":
        # Ad-generated home/mixed leads. id stays a string (client ids are
        # strings like "hc_..."), remarks reuse the structured-JSON format.
        row["id"] = str(row.get("id", ""))
        row["remarks"] = [_deserialize_remark_obj(r) for r in row.get("remarks","").split(" || ") if r] if row.get("remarks") else []
        for f in ("lastRemarkAt", "createdAt"):
            if row.get(f, "") not in (None, ""):
                try: row[f] = int(float(row[f]))
                except: pass
            else:
                row[f] = None
    elif tab_key == "hubDistributors":
        # `areas` is a plain JSON array of up to 5 area names (no per-item
        # attribution needed, unlike remarks) so it's stored as one JSON
        # cell rather than " || "-joined. `remarks` follows the same
        # legacy-string-or-structured-JSON pattern as ExistingCustomers.
        raw_areas = row.get("areas", "")
        if isinstance(raw_areas, str) and raw_areas.strip():
            try:
                parsed = json.loads(raw_areas)
                row["areas"] = parsed if isinstance(parsed, list) else []
            except Exception:
                row["areas"] = []
        elif not isinstance(raw_areas, list):
            row["areas"] = []
        row["remarks"] = [_deserialize_remark_obj(r) for r in row.get("remarks","").split(" || ") if r] if row.get("remarks") else []
        for f in ("lastRemarkAt", "createdAt"):
            if row.get(f, "") not in (None, ""):
                try: row[f] = int(float(row[f]))
                except: pass
            else:
                row[f] = None
    return row

def _decoerce_leads(lead):
    import time as _time
    out = dict(lead)
    # Assign a unique id if missing
    if not out.get("id"):
        out["id"] = str(int(_time.time() * 1000)) + "_" + str(abs(hash(out.get("contact","") + out.get("name",""))))[:6]
    remarks = out.get("remarks", [])
    out["remarks"] = " || ".join(remarks) if isinstance(remarks, list) else (remarks or "")
    return out

def _decoerce_existing_customer(row):
    import time as _time
    out = dict(row)
    if not out.get("id"):
        out["id"] = str(int(_time.time() * 1000)) + "_" + str(abs(hash(out.get("contact","") + out.get("name",""))))[:6]
    remarks = out.get("remarks", [])
    def _serialize_remark(r):
        # New-format remarks are structured (carry telecaller attribution);
        # encode as compact JSON so it round-trips. Legacy remarks are plain
        # strings and pass through unchanged.
        return json.dumps(r, ensure_ascii=False) if isinstance(r, dict) else str(r)
    out["remarks"] = " || ".join(_serialize_remark(r) for r in remarks) if isinstance(remarks, list) else (remarks or "")
    return out

def _decoerce_milk_distributor(row):
    import time as _time
    out = dict(row)
    if not out.get("id"):
        out["id"] = str(int(_time.time() * 1000)) + "_" + str(abs(hash(out.get("contact","") + out.get("name",""))))[:6]
    for f in ("telecallerRemarks", "fieldSalesRemarks"):
        remarks = out.get(f, [])
        out[f] = " || ".join(_serialize_remark_obj(r) for r in remarks) if isinstance(remarks, list) else (remarks or "")
    return out

def _decoerce_hub_distributor(row):
    import time as _time
    out = dict(row)
    if not out.get("id"):
        out["id"] = str(int(_time.time() * 1000)) + "_" + str(abs(hash(out.get("contact","") + out.get("name",""))))[:6]
    areas = out.get("areas", [])
    out["areas"] = json.dumps(areas[:5], ensure_ascii=False) if isinstance(areas, list) else (areas or "[]")
    remarks = out.get("remarks", [])
    out["remarks"] = " || ".join(_serialize_remark_obj(r) for r in remarks) if isinstance(remarks, list) else (remarks or "")
    return out

def _rows_from_values(values):
    if not values:
        return []
    headers, *rows = values
    return [
        {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
        for row in rows if any(str(c).strip() for c in row)
    ]

def fetch_all_tabs():
    cached = _cache.get("ALL")
    if cached and time.time() - cached["ts"] < CACHE_TTL:
        return cached["data"]
    result = {}
    if _gas_url():
        # One round-trip for every tab (Apps Script calls are slow, so 13
        # separate reads would blow the serverless time limit).
        all_vals = _gas_call({"action": "readAll"}).get("tabs", {})
        by_norm = {_norm_tab_name(t): v for t, v in all_vals.items()}
        for key, cfg in TAB_CONFIG.items():
            try:
                result[key] = [_coerce(key, r) for r in _rows_from_values(by_norm.get(_norm_tab_name(cfg["tab"]), []))]
            except Exception:
                result[key] = []
        _cache["ALL"] = {"ts": time.time(), "data": result}
        return result
    token = get_token()
    sheet_id = os.environ.get("GOOGLE_SHEET_ID", "")
    # Get actual tab names first to match them correctly
    actual_tabs = get_sheet_tabs(sheet_id, token)
    for key, cfg in TAB_CONFIG.items():
        # Find matching tab (case-insensitive)
        matched = next((t for t in actual_tabs if _norm_tab_name(t) == _norm_tab_name(cfg["tab"])), cfg["tab"])
        try:
            rows = read_tab(matched, token)
            result[key] = [_coerce(key, r) for r in rows]
        except Exception:
            # A single missing/misnamed tab must not take down every other
            # tab's sync — fall back to empty for this tab only.
            result[key] = []
    _cache["ALL"] = {"ts": time.time(), "data": result}
    return result

class handler(BaseHTTPRequestHandler):

    def _send(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        tab = parse_qs(parsed.query).get("tab", ["all"])[0]

        # Debug endpoint
        if tab == "debug":
            if _IMPORT_ERROR:
                self._send(500, {"error": "google-auth import failed", "trace": _IMPORT_ERROR})
                return
            try:
                token = get_token()
                sheet_id = os.environ.get("GOOGLE_SHEET_ID","")
                tabs = get_sheet_tabs(sheet_id, token)
                self._send(200, {"sheet_id": sheet_id, "tabs": tabs, "tab_repr": [repr(t) for t in tabs]})
            except Exception as e:
                import traceback
                self._send(500, {"error": str(e), "trace": traceback.format_exc()})
            return

        # Handle writes via GET (Vercel rewrites block POST to Python functions)
        method = parse_qs(parsed.query).get("_method", ["GET"])[0]
        if method == "POST":
            b64_body = parse_qs(parsed.query).get("_body", [""])[0]
            if b64_body:
                import base64
                try:
                    body = json.loads(base64.b64decode(b64_body.encode()).decode())
                    records = body.get(tab, [])
                    deleted_ids = body.get("deletedIds", [])
                    if isinstance(records, list) and tab in TAB_CONFIG:
                        cfg = TAB_CONFIG[tab]
                        if tab == "leads":
                            records = [_decoerce_leads(r) for r in records]
                        elif tab in ("existingCustomers", "homeCustomers"):
                            records = [_decoerce_existing_customer(r) for r in records]
                        elif tab == "milkDistributors":
                            records = [_decoerce_milk_distributor(r) for r in records]
                        elif tab == "hubDistributors":
                            records = [_decoerce_hub_distributor(r) for r in records]
                        token = get_token()
                        sheet_id = os.environ.get("GOOGLE_SHEET_ID", "")
                        actual_tabs = get_sheet_tabs(sheet_id, token)
                        matched = next((t for t in actual_tabs if _norm_tab_name(t) == _norm_tab_name(cfg["tab"])), cfg["tab"])
                        if tab == "homeCustomers":
                            ensure_tab(os.environ.get("GOOGLE_SHEET_ID", ""), matched, actual_tabs, token)
                        existing = read_tab(matched, token)
                        merged = merge_records(existing, records, tab)
                        merged = _apply_deletes(merged, deleted_ids, tab)
                        write_tab(matched, cfg["headers"], merged, token)
                        _cache.clear()
                        self._send(200, {"ok": True, "count": len(merged)})
                        return
                except Exception as exc:
                    import traceback
                    self._send(500, {"error": str(exc), "trace": traceback.format_exc()})
                    return
            self._send(400, {"error": "No body"})
            return

        try:
            if tab == "all":
                self._send(200, fetch_all_tabs())
            elif tab in TAB_CONFIG:
                token = get_token()
                rows = read_tab(TAB_CONFIG[tab]["tab"], token)
                self._send(200, {tab: [_coerce(tab, r) for r in rows]})
            else:
                self._send(400, {"error": "Unknown tab: " + tab})
        except Exception as exc:
            import traceback
            self._send(500, {"error": str(exc), "trace": traceback.format_exc()})

    def do_POST(self):
        parsed = urlparse(self.path)
        tab = parse_qs(parsed.query).get("tab", [None])[0]
        if tab not in TAB_CONFIG:
            self._send(400, {"error": "Unknown tab"}); return
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        records = body.get(tab)
        deleted_ids = body.get("deletedIds") or []
        if not isinstance(records, list):
            self._send(400, {"error": "Expected list"}); return
        cfg = TAB_CONFIG[tab]
        if tab == "leads":
            records = [_decoerce_leads(r) for r in records]
        elif tab in ("existingCustomers", "homeCustomers"):
            records = [_decoerce_existing_customer(r) for r in records]
        elif tab == "milkDistributors":
            records = [_decoerce_milk_distributor(r) for r in records]
        elif tab == "hubDistributors":
            records = [_decoerce_hub_distributor(r) for r in records]
        try:
            token = get_token()
            actual_tabs = get_sheet_tabs(os.environ.get("GOOGLE_SHEET_ID", ""), token)
            matched = next((t for t in actual_tabs if _norm_tab_name(t) == _norm_tab_name(cfg["tab"])), cfg["tab"])
            if tab == "homeCustomers":
                ensure_tab(os.environ.get("GOOGLE_SHEET_ID", ""), matched, actual_tabs, token)
            # Re-read fresh (not the 60s cache) right before merging+writing —
            # keeps the race window to milliseconds instead of minutes, and the
            # merge itself means even a same-instant collision can't drop rows.
            existing = read_tab(matched, token)
            merged = merge_records(existing, records, tab)
            merged = _apply_deletes(merged, deleted_ids, tab)
            write_tab(matched, cfg["headers"], merged, token)
            _cache.clear()
            self._send(200, {"ok": True, "count": len(merged)})
        except Exception as exc:
            import traceback
            self._send(500, {"error": str(exc), "trace": traceback.format_exc()})

    def log_message(self, *_):
        pass


# ── /api/prospects — proxy for OpenStreetMap search (avoids browser CORS) ───
# Called from ProspectFinder component
# GET /api/prospects?area=T+Nagar+Chennai&type=restaurant
