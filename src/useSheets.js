import { useEffect, useState, useCallback } from "react";

// Sridhi Ventures BOS — Google Sheets sync hook.
// Talks to the same-origin Python API at /api/sync (see api/sync.py).
// Set to false to force every screen into local-only "Offline copy" mode.
export const SYNC_ENABLED = true;

const API_BASE = "/api/sync";
const CACHE_PREFIX = "sridhi_sheets_cache_v1:";
const WRITE_DEBOUNCE_MS = 700;

// ── Module-level shared store ───────────────────────────────────────────
// Several components call useSheets() for the same tab (or different tabs)
// at once. Keeping the data here — instead of per-hook — means every
// instance shares one in-flight "load everything" request and stays in
// sync with every other instance the moment a write lands.
const tabData = {};          // tab -> array of records (latest known)
const tabListeners = {};     // tab -> Set<fn(records)>
const tabStatus = {};        // tab -> "loading"|"syncing"|"synced"|"error"|"offline"
const statusListeners = {};  // tab -> Set<fn(status, error)>
const lastError = {};        // tab -> error message | null
const pendingDeletes = {};   // tab -> Set of deleted record ids queued for next write
const writeTimers = {};      // tab -> timeout id

let allFetchStarted = false;
let allFetchPromise = null;

function readCache(tab) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + tab);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(tab, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + tab, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — in-memory copy is still fine */
  }
}

function notifyData(tab) {
  const set = tabListeners[tab];
  if (!set) return;
  set.forEach((fn) => fn(tabData[tab]));
}

function notifyStatus(tab) {
  const set = statusListeners[tab];
  if (!set) return;
  set.forEach((fn) => fn(tabStatus[tab], lastError[tab] || null));
}

function setStatus(tab, status, err) {
  tabStatus[tab] = status;
  lastError[tab] = err || null;
  notifyStatus(tab);
}

// One request loads every tab at once (see fetch_all_tabs() server-side),
// so the first hook to mount kicks it off and everyone else just waits on
// the same promise instead of firing their own request.
function fetchAllTabs() {
  if (allFetchPromise) return allFetchPromise;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    Object.keys(tabListeners).forEach((tab) => setStatus(tab, "offline"));
    allFetchPromise = Promise.resolve({});
    return allFetchPromise;
  }
  allFetchPromise = fetch(`${API_BASE}?tab=all`)
    .then((res) => {
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      return res.json();
    })
    .then((json) => {
      Object.keys(json || {}).forEach((tab) => {
        if (Array.isArray(json[tab])) {
          tabData[tab] = json[tab];
          writeCache(tab, json[tab]);
          notifyData(tab);
          setStatus(tab, "synced");
        }
      });
      return json;
    })
    .catch((err) => {
      // Keep whatever's already on screen (cache or previous fetch); just
      // flag every tab currently in use so a "Retrying save…" style badge
      // can show it.
      Object.keys(tabListeners).forEach((tab) => setStatus(tab, "error", err.message));
      throw err;
    });
  return allFetchPromise;
}

function ensureTabLoaded(tab) {
  if (!(tab in tabData)) {
    const cached = readCache(tab);
    if (cached) tabData[tab] = cached;
  }
  if (!allFetchStarted) {
    allFetchStarted = true;
    setStatus(tab, tab in tabData ? "syncing" : "loading");
    fetchAllTabs().catch(() => {});
  } else if (!tabStatus[tab]) {
    setStatus(tab, tab in tabData ? "syncing" : "loading");
  }
}

function recordKey(row) {
  if (!row || typeof row !== "object") return undefined;
  const id = row.id ?? row.contact;
  return id == null || id === "" ? undefined : String(id);
}

// A row missing from the new array (but present before) means "deleted" —
// the server only drops rows we explicitly say to delete, so this diff is
// what makes a plain setLeads(leads.filter(...)) call actually remove the
// row from the sheet instead of having it silently reappear on next sync.
function diffDeletedIds(prevArr, nextArr) {
  if (!Array.isArray(prevArr) || !Array.isArray(nextArr)) return [];
  const nextKeys = new Set(nextArr.map(recordKey).filter(Boolean));
  return prevArr.map(recordKey).filter((k) => k && !nextKeys.has(k));
}

function flushWrite(tab) {
  if (writeTimers[tab]) {
    clearTimeout(writeTimers[tab]);
    writeTimers[tab] = null;
  }
  const records = tabData[tab] || [];
  const deletedIds = Array.from(pendingDeletes[tab] || []);
  pendingDeletes[tab] = new Set();
  setStatus(tab, "syncing");
  fetch(`${API_BASE}?tab=${encodeURIComponent(tab)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [tab]: records, deletedIds }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      return res.json();
    })
    .then(() => {
      writeCache(tab, records);
      setStatus(tab, "synced");
    })
    .catch((err) => {
      setStatus(tab, "error", err.message || "Save failed");
    });
}

function scheduleWrite(tab) {
  if (writeTimers[tab]) clearTimeout(writeTimers[tab]);
  writeTimers[tab] = setTimeout(() => flushWrite(tab), WRITE_DEBOUNCE_MS);
}

function updateTab(tab, nextArr) {
  const prev = tabData[tab] || [];
  const deleted = diffDeletedIds(prev, nextArr);
  if (deleted.length) {
    if (!pendingDeletes[tab]) pendingDeletes[tab] = new Set();
    deleted.forEach((id) => pendingDeletes[tab].add(id));
  }
  tabData[tab] = nextArr;
  writeCache(tab, nextArr);
  notifyData(tab);
  scheduleWrite(tab);
}

/**
 * useSheets(tab, initialData) → [data, setData, syncStatus, retrySync, syncError]
 *
 * - `tab` is one of the keys in api/sync.py's TAB_CONFIG (e.g. "leads").
 * - `setData` accepts either a new array or an updater function, same as
 *   useState — removing a row (by id/contact) from the array queues it as
 *   a real delete on the next sync instead of just a local change.
 * - Writes are debounced and merged server-side, so rapid edits (bulk
 *   import, quick taps) collapse into one save.
 */
export function useSheets(tab, initialData) {
  ensureTabLoaded(tab);

  const [data, setDataState] = useState(() => (tab in tabData ? tabData[tab] : initialData || []));
  const [status, setStatusState] = useState(() => tabStatus[tab] || "loading");
  const [error, setErrorState] = useState(() => lastError[tab] || null);

  useEffect(() => {
    const onData = (val) => setDataState(val);
    const onStatus = (s, err) => {
      setStatusState(s);
      setErrorState(err || null);
    };
    if (!tabListeners[tab]) tabListeners[tab] = new Set();
    if (!statusListeners[tab]) statusListeners[tab] = new Set();
    tabListeners[tab].add(onData);
    statusListeners[tab].add(onStatus);

    // Catch up in case the store changed between the first render and this
    // effect running (e.g. another hook's fetch already resolved).
    if (tab in tabData) setDataState(tabData[tab]);
    if (tabStatus[tab]) {
      setStatusState(tabStatus[tab]);
      setErrorState(lastError[tab] || null);
    }

    return () => {
      tabListeners[tab].delete(onData);
      statusListeners[tab].delete(onStatus);
    };
  }, [tab]);

  const setData = useCallback(
    (value) => {
      const prev = tabData[tab] || [];
      const next = typeof value === "function" ? value(prev) : value;
      updateTab(tab, Array.isArray(next) ? next : []);
    },
    [tab]
  );

  const retrySync = useCallback(() => {
    flushWrite(tab);
  }, [tab]);

  return [data || [], setData, status, retrySync, error];
}
