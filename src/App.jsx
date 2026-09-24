import { useState, useEffect, useRef, useMemo } from "react";
import { useSheets, SYNC_ENABLED } from "./useSheets.js";
import { SRIDHI_LOGO_PNG } from "./lib/logo.js";
import * as XLSX from "xlsx";

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────
// Light, professional palette — soft mint-grey app background, crisp white
// cards, a forest-teal brand accent (matches the Sridhi Ventures print/PDF
// branding), and saturated-but-readable status colors that stay legible as
// solid text on a white card (not just as translucent tints).
const T = {
  bg:       "#F3F6F4",
  surface:  "#FFFFFF",
  card:     "#FFFFFF",
  cardHigh: "#F2F7F4",
  glass:    "rgba(255,255,255,0.88)",

  border:   "#E1E8E3",
  borderHi: "#C7D3CB",

  accent:    "#0E9F6E",
  accentSub: "rgba(14,159,110,0.10)",
  accentGlow:"rgba(14,159,110,0.32)",

  emerald:  "#059669",
  amber:    "#B45309",
  rose:     "#DC2626",
  indigo:   "#4F46E5",
  sky:      "#0284C7",
  orange:   "#EA580C",

  t1: "#0F172A",
  t2: "#5B6B7C",
  t3: "#8A97A8",
  t4: "#A2B0AA",
};

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

// ─── SHEETS SYNC CONFIG ───────────────────────────────────────────────────
// Set VITE_API_KEY in your .env.local (and Vercel dashboard).
// Sync auto-enables once VITE_API_KEY is set. (See SETUP.md)

// ─── SEED DATA ────────────────────────────────────────────────────────────
const INITIAL_LEADS = [];

const PIPELINE_STAGES = [
  { id:"New Lead",               color:T.t3,      count:0 },
  { id:"Contacted",              color:T.sky,     count:0 },
  { id:"Interested",             color:T.indigo,  count:0 },
  { id:"Callback Requested",     color:T.amber,   count:0  },
  { id:"Sample Requested",       color:T.orange,  count:0 },
  { id:"Assigned to Field Sales",color:"#FC8181", count:0  },
  { id:"Sample Delivered",       color:T.emerald, count:0  },
  { id:"Feedback Pending",       color:T.sky,     count:0  },
  { id:"Positive Feedback",      color:T.emerald, count:0 },
  { id:"Negotiation",            color:T.amber,   count:0  },
  { id:"Order Received",         color:T.accent,  count:0 },
  { id:"Repeat Order Follow-up", color:T.indigo,  count:0 },
  { id:"Active Customer",        color:T.emerald, count:0 },
  { id:"Lost Customer",          color:T.rose,    count:0 },
  { id:"Invalid Number",         color:T.t3,      count:0  },
];

const INITIAL_SAMPLES = [
];

const LOST_REASONS = ["Not Delivered on Time", "Quality Not Good", "Outstanding", "Others"];
const EXISTING_CUSTOMER_STATUSES = ["Calling", "Interested", "Rejoined", "Own Making", "Not Reachable", "Not Interested"];
const TELECALLERS = ["Thulasi", "Ramya", "Sabi (Intern)", "Azgar (Intern)", "Naveen HR"];

// ── Personal secret keys ────────────────────────────────────────────────
// Every time the app is opened it asks for one of these keys before showing
// any data. Match is exact (no trimming beyond surrounding whitespace) so
// punctuation-only keys still work. Add a new "name: key" pair here to
// onboard someone else — no other code needs to change.
const SECRET_KEYS = {
  "?":  "Thulasi",
  "!!": "Azgar (Intern)",
  "#$": "Sabi (Intern)",
  "<>": "Naveen HR",
};

// A stable, distinct color per telecaller — used anywhere a lead needs to
// visibly show "who this belongs to" at a glance (e.g. Hub Distributors
// cards), rather than plain grey text that blends together. Falls back to
// hashing the name for anyone not in the fixed roster, so it never breaks
// if new telecallers get added.
const TELECALLER_COLOR_PALETTE = ["#38BDF8", "#FB7185", "#22D98A", "#FBBF24", "#818CF8", "#F472B6", "#2DD4BF"];
function telecallerColor(name) {
  if (!name) return "#7C8798";
  const idx = TELECALLERS.indexOf(name);
  if (idx >= 0) return TELECALLER_COLOR_PALETTE[idx % TELECALLER_COLOR_PALETTE.length];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TELECALLER_COLOR_PALETTE[hash % TELECALLER_COLOR_PALETTE.length];
}

// Quick-pick remark tags for the Existing Customer call log. Each carries a
// sentiment so calls can be rolled up into a Positive / Negative / Neutral
// analysis per telecaller without anyone having to read every remark by hand.
const REMARK_TAGS = [
  { label: "Interested",        sentiment: "positive" },
  { label: "Interested Later",  sentiment: "positive" },
  { label: "Sample Requested",  sentiment: "positive" },
  { label: "Rejoined",          sentiment: "positive" },
  { label: "Call Back Later",   sentiment: "neutral"  },
  { label: "Shop Closed",       sentiment: "neutral"  },
  { label: "Switch Off",        sentiment: "negative" },
  { label: "Network Error",     sentiment: "negative" },
  { label: "Not Reachable",     sentiment: "negative" },
  { label: "Not Interested",    sentiment: "negative" },
  { label: "Wrong Number",      sentiment: "negative" },
];
const SENTIMENT_COLOR = { positive: T.emerald, negative: T.rose, neutral: T.amber };

// ── Milk Distributor pipeline ──────────────────────────────────────────────
// A separate, smaller pipeline (not the main Leads CRM): telecallers add
// distributor leads + set the map location; field sales visit using that
// location and log their own outcome. Only these 3 telecallers work this
// list right now.
const MILK_TELECALLERS = ["Azgar (Intern)", "Sabi (Intern)", "Thulasi"];
const MILK_STAGES = [
  { id: "New",             color: T.t3     },
  { id: "Contacted",       color: T.sky    },
  { id: "Interested",      color: T.indigo },
  { id: "Visit Scheduled", color: T.amber  },
  { id: "Visited",         color: T.orange },
  { id: "Onboarded",       color: T.emerald},
  { id: "Not Interested",  color: T.rose   },
  { id: "Lost",            color: T.t3     },
];
const MILK_TC_TAGS = [
  { label: "Interested",       sentiment: "positive" },
  { label: "Info/Sample Sent", sentiment: "positive" },
  { label: "Visit Requested",  sentiment: "positive" },
  { label: "Call Back Later",  sentiment: "neutral"  },
  { label: "Not Reachable",    sentiment: "negative" },
  { label: "Switch Off",       sentiment: "negative" },
  { label: "Not Interested",   sentiment: "negative" },
  { label: "Wrong Number",     sentiment: "negative" },
];
const MILK_FS_TAGS = [
  { label: "Met Owner – Interested", sentiment: "positive" },
  { label: "Onboarded",              sentiment: "positive" },
  { label: "Sample Given",           sentiment: "positive" },
  { label: "Follow-up Needed",       sentiment: "neutral"  },
  { label: "Shop Closed",            sentiment: "neutral"  },
  { label: "Not Interested",         sentiment: "negative" },
  { label: "Invalid / Relocated",    sentiment: "negative" },
];
function milkStageColor(stage) {
  const s = MILK_STAGES.find(p => p.id === stage);
  return s ? s.color : T.t3;
}

// ── Hub-wise Distributor pipeline ──────────────────────────────────────────
// Distributors tracked hub-by-hub: name, location, and up to 5 areas each
// one distributes to, with a single status + timestamped remark trail
// (who approached them and when) for a clean management report.
const MAX_HUB_AREAS = 5;
const HUB_STAGES = [
  { id: "New",                           color: T.t3     },
  { id: "Contacted",                     color: T.sky    },
  { id: "Interested",                    color: T.indigo },
  { id: "Visited",                       color: T.orange },
  { id: "Deal Accepted",                 color: T.emerald},
  { id: "Not Interested",                color: T.rose   },
  { id: "Demanding Something Different", color: T.amber  },
  { id: "Ring No Response",              color: "#94A3B8"},
  { id: "Busy",                          color: "#B08968"},
  { id: "Wrong Number",                  color: "#C2410C"},
];
const HUB_STATUS_SENTIMENT = {
  "New": "neutral", "Contacted": "neutral", "Interested": "positive", "Visited": "positive",
  "Deal Accepted": "positive", "Not Interested": "negative", "Demanding Something Different": "neutral",
  "Ring No Response": "negative", "Busy": "negative", "Wrong Number": "negative",
};
function hubStageColor(stage) {
  const s = HUB_STAGES.find(p => p.id === stage);
  return s ? s.color : T.t3;
}

// Visit-reminder helpers — compared as plain "YYYY-MM-DD" strings (no
// time-of-day) so "today" and "tomorrow" line up regardless of what time
// it currently is. This is what powers the attractive reminder banner on
// the Hub Distributors screen: a scheduled visit surfaces the moment it's
// due today, the day before, or if it slipped past without being logged.
function hubVisitUrgency(dateStr) {
  if (!dateStr) return null;
  const today = todayISO();
  const tomorrow = localISO(new Date(Date.now() + 86400000));
  if (dateStr < today) return "overdue";
  if (dateStr === today) return "today";
  if (dateStr === tomorrow) return "tomorrow";
  return "upcoming";
}
function hubVisitUrgencyStyle(urgency) {
  switch (urgency) {
    case "overdue":  return { color: "#FCA5A5", label: "OVERDUE",  emoji: "🚨" };
    case "today":    return { color: T.rose,    label: "TODAY",    emoji: "🔔" };
    case "tomorrow": return { color: T.amber,   label: "TOMORROW", emoji: "⏰" };
    default:         return { color: T.sky,     label: "UPCOMING", emoji: "📅" };
  }
}
function formatVisitDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// Compact "last touched" label for a timestamp — used on the Hub Distributors
// list card so the most recently worked record is instantly recognizable.
// Minutes/hours today, "Yesterday", then a short day count, then falls back
// to a plain date ("16 Sep") once it's old enough that exact recency stops
// mattering.
function formatUpdatedBadge(ts) {
  if (!ts) return null;
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days === 0) {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    return hrs + "h ago";
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return days + "d ago";
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// Maps a free-text calling/visit remark onto a Hub Distributor status, so a
// bulk-imported row (or one carrying only a quick note) still lands on the
// right pipeline stage instead of always defaulting to "New".
function classifyHubRemark(raw) {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return null;
  if (s.includes("deal") || s.includes("accept") || s.includes("onboard") || s.includes("confirm")) return "Deal Accepted";
  // Deliberately not just s.includes("custom") — that substring is inside
  // the very common word "customer" and was misclassifying ordinary
  // remarks that simply mention a customer.
  if (s.includes("different") || s.includes("other brand") || s.includes("customiz") || s.includes("customis") || s.includes("custom made") || s.includes("custom order") || s.includes("negotiat")) return "Demanding Something Different";
  // "Not interested" must be checked before the plain "interest(ed)" check
  // below — it contains "interest" as a substring, so without this order
  // every "not interested" remark was silently being classified as
  // "Interested" instead, the opposite of what was typed. "intrest" also
  // catches the common "intrested"/"intrest" typo in both directions.
  if (/not\s*(interest|intrest)|no\s*need|rejected/.test(s)) return "Not Interested";
  if (s.includes("visit")) return "Visited";
  if (/interest|intrest/.test(s)) return "Interested";
  if (s.includes("wrong number") || s.includes("invalid number")) return "Wrong Number";
  if (s.includes("busy")) return "Busy";
  if (s.includes("ring") || s.includes("no response") || s.includes("not attend") || s.includes("not reachable") || s.includes("switch off") || s.includes("no answer")) return "Ring No Response";
  if (s.trim()) return "Contacted"; // any other note still counts as a contact attempt
  return null;
}

// Pulls a phone-number-shaped run of digits out of a free-text cell and
// returns whatever text is left over, trimmed of stray separators. This is
// what stops something like "80935 73503 Just enquiry" from landing whole
// inside the Contact field — the number and the note get split apart.
function extractPhoneAndRemainder(text) {
  const s = (text || "").trim();
  const m = s.match(/(\+?\d[\d\s-]{6,}\d)/);
  if (!m) return { phone: "", remainder: s };
  const phone = m[0].replace(/\s{2,}/g, " ").trim();
  const remainder = (s.slice(0, m.index) + s.slice(m.index + m[0].length))
    .replace(/^[\s,.\-–—:;|]+|[\s,.\-–—:;|]+$/g, "").trim();
  return { phone, remainder };
}

// Decides whether leftover text (after the phone number is pulled out) is
// a distributor/shop NAME or a calling REMARK/note — e.g. "Just enquiry",
// "not interested", "call back later" read as remarks; "Sri Lakshmi
// Traders" reads as a name. Falls back to treating it as a name only when
// nothing about it looks like a note.
// "intr(e)st" catches the very common "intrested"/"intrest" typo alongside
// the correctly-spelled "interest(ed)" — a real paste of
// "remark : intrested location kovilambakam" was previously landing whole
// in the Name field because the regex only matched the correct spelling.
const HUB_REMARK_HINTS = /enquir|inquir|interest|intrest|not\s|wrong|busy|\bring\b|response|visit|deal|demand|call\s*back|callback|switch\s*off|no\s*answer|reachable|follow\s*up|later|pending|closed|reject|sample/i;
// A line that literally starts with "remark" (with or without a colon) is
// an unambiguous signal — whatever follows is a note, never a name, no
// matter how it's spelled or worded.
const REMARK_PREFIX = /^remarks?\s*[:\-]?\s*/i;
function classifyNameOrRemark(text) {
  const s = (text || "").trim();
  if (!s) return { name: "", remark: "" };
  if (REMARK_PREFIX.test(s)) return { name: "", remark: s.replace(REMARK_PREFIX, "").trim() || s };
  if (HUB_REMARK_HINTS.test(s)) return { name: "", remark: s };
  return { name: s, remark: "" };
}

// Parses pasted bulk data into HubDistributor-shaped rows. Recognizes
// headers by keyword (Hub/Name/Phone/Area/Address/Map/Details/Remark or
// Status/Telecaller) in any order and in any subset — a row can be missing
// every column except a phone number and still produces a usable record,
// which is the whole point of a quick bulk paste from field notes. Even a
// single freeform cell like "80935 73503 Just enquiry" (no columns at all)
// is split correctly: the digits become Contact, the leftover words become
// either the Name or a Remark depending on what they read like, and any
// telecaller name mentioned inline (e.g. "...Azgar") is picked up too.
function parseHubBulkImport(text, batchTelecaller) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, "")).filter(l => l.trim() !== "");
  if (!lines.length) return { rows: [], skipped: 0 };

  const hasTab = lines[0].includes("\t");
  const hasComma = lines.some(l => l.includes(","));
  const delim = hasTab ? "\t" : (hasComma ? "," : null);
  const rawRows = lines.map(l => delim ? parseDelimitedLine(l, delim) : [l.trim()]);

  const headerCandidate = rawRows[0].map(h => h.toLowerCase().trim());
  const findCol = (...keywords) => headerCandidate.findIndex(h => keywords.some(k => h.includes(k)));
  const looksLikeHeader = delim && (
    findCol("phone", "contact", "number") >= 0 || findCol("name") >= 0 ||
    findCol("hub") >= 0 || findCol("area") >= 0 || findCol("telecaller") >= 0
  ) && rawRows[0].every(c => !/^\+?[\d\s-]{7,}$/.test(c.trim())); // a header row shouldn't itself look like a phone number

  let colMap = null, dataRows;
  if (looksLikeHeader) {
    colMap = {
      hub: findCol("hub"),
      name: findCol("customer", "name", "shop", "distributor"),
      contact: findCol("phone", "number", "contact", "mobile"),
      area: findCol("area"),
      address: findCol("address", "location"),
      mapLink: findCol("map"),
      details: findCol("detail", "brand", "business"),
      remark: findCol("remark", "status", "calling", "note"),
      telecaller: findCol("telecaller", "caller", "assigned"),
    };
    dataRows = rawRows.slice(1);
  } else if (delim) {
    // No header detected — fall back to a progressive column order so a
    // short paste (even just Name, Contact) still works sensibly.
    const order = ["name", "contact", "area", "hub", "address", "mapLink", "telecaller"];
    colMap = {};
    order.forEach((key, i) => { colMap[key] = i; });
    colMap.details = -1; colMap.remark = -1;
    dataRows = rawRows;
  } else {
    dataRows = rawRows; // single freeform column — parsed per-line below
  }

  const get = (row, idx) => (idx !== undefined && idx >= 0 && idx < row.length) ? row[idx].trim() : "";

  const rows = [];
  let skipped = 0;
  dataRows.forEach(row => {
    let name, contact, hub, area, address, mapLink, details, remark, telecaller;
    if (colMap) {
      name = get(row, colMap.name);
      contact = get(row, colMap.contact);
      hub = get(row, colMap.hub);
      area = get(row, colMap.area);
      address = get(row, colMap.address);
      mapLink = get(row, colMap.mapLink);
      details = get(row, colMap.details);
      remark = get(row, colMap.remark);
      telecaller = get(row, colMap.telecaller);
      // Even in a mapped Contact column, strip off any note text that got
      // typed alongside the number (e.g. "80935 73503 Just enquiry") so the
      // phone field only ever holds the phone number.
      if (contact) {
        const { phone, remainder } = extractPhoneAndRemainder(contact);
        if (phone) {
          contact = phone;
          if (remainder) {
            const split = classifyNameOrRemark(remainder);
            if (!name && split.name) name = split.name;
            if (split.remark) remark = remark ? remark + "; " + split.remark : split.remark;
          }
        }
      }
    } else {
      // Single freeform cell, no columns at all. Pull the phone number out,
      // then decide whether whatever's left is a name or a note. Telecaller
      // is deliberately NOT auto-detected from the text here — it's set
      // explicitly for the whole batch (see batchTelecaller below), so a
      // shop name that happens to contain part of a telecaller's name (e.g.
      // "Ramya Traders") never gets silently mangled.
      const val = row[0] || "";
      const { phone, remainder } = extractPhoneAndRemainder(val);
      contact = phone;
      const split = classifyNameOrRemark(remainder);
      name = split.name;
      remark = split.remark;
      telecaller = "";
      hub = area = address = mapLink = details = "";
    }

    // A row needs at least a name OR a contact number to be worth anything;
    // everything else — hub, area, address, remark — is genuinely optional.
    if (!name && !contact) { if (row.some(c => (c || "").trim())) skipped++; return; }
    if (/^(customer\s*)?name$/i.test(name) && !contact) { skipped++; return; } // stray header row

    rows.push({
      name: name || "", contact: contact || "",
      hub: hub || "", area: area || "", address: address || "", mapLink: mapLink || "",
      details: details || "", remark: remark || "",
      // The telecaller picked for this whole import always wins for a
      // freeform/no-column row; a genuine per-row Telecaller column (from a
      // header-based paste) is respected instead, since that's intentional
      // per-row data rather than a guess.
      telecaller: (colMap && colMap.telecaller >= 0 && telecaller) ? telecaller : (batchTelecaller || telecaller || ""),
    });
  });
  return { rows, skipped };
}

// ── Bulk import (paste from Excel/Google Sheets) ───────────────────────────
// Handles both tab-separated (default when pasting from a spreadsheet) and
// comma-separated text, with basic support for quoted fields so a map link
// like "https://maps...?q=12.9,80.1" (which contains a comma) doesn't get
// split apart when the source was exported as CSV.
function parseDelimitedLine(line, delim) {
  const cells = []; let cur = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}
// Maps a free-text "calling remark" (as seen in real call logs, e.g. "not
// attend", "call back monday") onto our quick-pick tag + sentiment, so
// imported rows land in the same Response Analysis as manually-logged calls.
function classifyCallingRemark(raw) {
  const s = (raw || "").toLowerCase();
  if (!s.trim()) return { tag: null, sentiment: "neutral" };
  if (s.includes("interest")) return { tag: "Interested", sentiment: "positive" };
  if (s.includes("call back") || s.includes("callback")) return { tag: "Call Back Later", sentiment: "neutral" };
  if (s.includes("switch off") || s.includes("out of network") || s.includes("not reachable")) return { tag: "Switch Off", sentiment: "negative" };
  if (s.includes("not attend") || s.includes("no response") || s.includes("no answer")) return { tag: "Not Reachable", sentiment: "negative" };
  if (s.includes("wrong number")) return { tag: "Wrong Number", sentiment: "negative" };
  if (s.includes("other brand") || s.includes("no need") || s.includes("not interested")) return { tag: "Not Interested", sentiment: "negative" };
  return { tag: null, sentiment: "neutral" }; // e.g. "only milk" / "only brand" — ambiguous, kept as a plain note
}
function normalizePhone(v) {
  const digits = (v || "").replace(/[^0-9]/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}
// Parses pasted bulk data into MilkDistributor-shaped rows. Recognizes
// headers by keyword (Name/Phone/Area/Remarks/Map/Calling/Telecaller) in
// any order; falls back to the fixed column order from the source sheet
// (Name, Phone, Area, Current Brand, Map Link, Calling Remark, Telecaller)
// if no header row is detected.
function parseMilkBulkImport(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, "")).filter(l => l.trim() !== "");
  if (!lines.length) return { rows: [], skipped: 0 };
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const rawRows = lines.map(l => parseDelimitedLine(l, delim));

  const headerCandidate = rawRows[0].map(h => h.toLowerCase());
  const findCol = (...keywords) => headerCandidate.findIndex(h => keywords.some(k => h.includes(k)));
  const nameHeaderIdx = findCol("customer", "name");
  const nameIdx = (nameHeaderIdx >= 0 && !headerCandidate[nameHeaderIdx].includes("telecaller")) ? nameHeaderIdx : -1;
  const hasHeader = nameIdx >= 0 && findCol("phone", "number", "contact") >= 0 && findCol("area") >= 0;

  let colMap, dataRows;
  if (hasHeader) {
    colMap = {
      name: nameIdx,
      phone: findCol("phone", "number", "contact"),
      area: findCol("area"),
      brand: headerCandidate.findIndex(h => h.includes("remark") && !h.includes("calling") && !h.includes("field")),
      mapLink: findCol("map"),
      calling: headerCandidate.findIndex(h => h.includes("calling")),
      telecaller: findCol("telecaller"),
    };
    dataRows = rawRows.slice(1);
  } else {
    colMap = { name: 0, phone: 1, area: 2, brand: 3, mapLink: 4, calling: 5, telecaller: 6 };
    dataRows = rawRows;
  }

  const get = (row, idx) => (idx >= 0 && idx < row.length) ? row[idx] : "";
  const rows = [];
  let skipped = 0;
  dataRows.forEach(row => {
    const name = get(row, colMap.name).trim();
    // Skip repeated header rows (the sample sheet had the header re-appear
    // partway down) and any row with no distributor name at all.
    if (!name || /customer\s*name/i.test(name)) { if (row.some(c => c.trim())) skipped++; return; }
    rows.push({
      name,
      contact: get(row, colMap.phone).trim(),
      area: get(row, colMap.area).trim(),
      currentBrand: get(row, colMap.brand).trim(),
      mapLink: get(row, colMap.mapLink).trim(),
      callingRemark: get(row, colMap.calling).trim(),
      telecaller: get(row, colMap.telecaller).trim(),
    });
  });
  return { rows, skipped };
}


const INITIAL_EXPENSES = [
];


const REPEAT_CUSTOMERS = [
];


const FIELD_TASKS = [
];


const TEAM_DATA = [];

const MARKETING_SOURCES = [];

const META_CAMPAIGNS = [];

// ─── UTILITIES ────────────────────────────────────────────────────────────
function useAnimatedCounter(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    let start = null;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setValue(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}

// useSheetSynced — thin alias over useSheets (from useSheets.js)
// Keeps backward-compatible call signature: useSheetSynced(endpoint, _key, initialData)

// ── Follow-up timing helpers ──────────────────────────────────────────────
function daysSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}
function formatLastContact(ts, fallback) {
  if (!ts) return fallback || "Not contacted";
  const days = daysSince(ts);
  if (days === 0) {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    return hrs + "h ago";
  }
  if (days === 1) return "Yesterday";
  return days + " days ago";
}
const FOLLOWUP_OVERDUE_DAYS = 3;
const TERMINAL_STAGES = ["Lost Customer", "Invalid Number"];
function isFollowUpOverdue(lead) {
  if (!lead || TERMINAL_STAGES.includes(lead.stage)) return false;
  const ts = lead.lastContactAt || lead.createdAt;
  if (!ts) return true; // never logged a contact at all
  return daysSince(ts) > FOLLOWUP_OVERDUE_DAYS;
}
function useSheetSynced(_endpoint, _key, initialData) {
  // The new useSheets hook uses the tab name (same as _endpoint) and batches all tabs.
  return useSheets(_endpoint, initialData);
}

function SyncBadge({ status, onRetry, error }) {
  if (!SYNC_ENABLED) return <Chip label="Offline copy" color={T.t3} />;
  const map = {
    loading: { label: "Loading…",   color: T.t2     },
    syncing: { label: "Syncing…",   color: T.amber  },
    synced:  { label: "Synced",     color: T.emerald},
    error:   { label: "Retrying save…", color: T.rose   },
    offline: { label: "Offline copy",color: T.t3    },
  };
  const s = map[status] || map.offline;
  if (status === "error" && onRetry) {
    // A stuck save is actionable, not just a spinner: show why (when the
    // server told us) and a button to retry immediately instead of waiting
    // out the backoff.
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Chip label={s.label} color={s.color} />
        {error && <span style={{ fontSize: 10.5, color: T.rose, fontWeight: 600 }}>{error}</span>}
        <button onClick={onRetry} style={{
          background: T.rose + "1A", border: `1px solid ${T.rose}44`, borderRadius: 8,
          color: T.rose, padding: "3px 9px", fontSize: 10.5, fontWeight: 700,
          cursor: "pointer", fontFamily: FONT,
        }}>↻ Retry Sync</button>
      </div>
    );
  }
  return <Chip label={s.label} color={s.color} />;
}

function getStageColor(stage) {
  const s = PIPELINE_STAGES.find(p => p.id === stage);
  return s ? s.color : T.t3;
}
function getPriorityColor(p) {
  return p === "High" ? T.rose : p === "Medium" ? T.amber : T.t2;
}
function leadTypeIcon(type) {
  const map = {
    Restaurant: "🍽️", Mess: "🍲", Hotel: "🏨", Bakery: "🥐",
    "Cloud Kitchen": "👨‍🍳", Distributor: "📦", Retailer: "🏪",
  };
  return map[type] || "🏢";
}

// ─── DESIGN PRIMITIVES ────────────────────────────────────────────────────
function Card({ children, style = {}, accent, noPad, id }) {
  return (
    <div id={id} style={{
      background: T.card,
      border: `1px solid ${accent ? accent + "30" : T.border}`,
      borderRadius: 20,
      padding: noPad ? 0 : "18px 18px",
      boxShadow: accent ? `0 0 32px ${accent}12` : "0 1px 3px rgba(15,23,42,0.08)",
      overflow: "hidden",
      ...style,
    }}>{children}</div>
  );
}

function Chip({ label, color, small }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center",
      fontSize: small ? 9 : 10, fontWeight:700, letterSpacing:"0.04em",
      textTransform:"uppercase",
      padding: small ? "2px 7px" : "3px 9px", borderRadius:6,
      background: color + "1A", color, border:`1px solid ${color}30`,
      whiteSpace:"nowrap",
    }}>{label}</span>
  );
}

function Label({ children, sub, size = 13 }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize: size, fontWeight:700, color:T.t1, letterSpacing:"-0.01em" }}>{children}</div>
      {sub && <div style={{ fontSize:11, color:T.t3, marginTop:3, fontWeight:500 }}>{sub}</div>}
    </div>
  );
}

function Rule() {
  return <div style={{ height:1, background:T.border, margin:"0 -18px" }} />;
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────
function KPI({ label, value, unit, change, color, icon }) {
  const numVal = typeof value === "number" ? value : 0;
  const animated = useAnimatedCounter(numVal);
  const display = typeof value === "number" ? animated.toLocaleString("en-IN") : value;
  const pos = change === undefined || change >= 0;
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${color}22`,
      borderRadius:16, padding:"14px 14px 12px",
      flex:"1 1 130px", minWidth:120,
      position:"relative", overflow:"hidden",
    }}>
      <div style={{
        position:"absolute", top:0, left:0, right:0, height:2,
        background:`linear-gradient(90deg, ${color}88, transparent)`,
      }} />
      <div style={{ fontSize:18, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1, letterSpacing:"-0.02em" }}>
        {display}
        {unit && <span style={{ fontSize:11, fontWeight:600, color:T.t3, marginLeft:3 }}>{unit}</span>}
      </div>
      <div style={{ fontSize:11, color:T.t2, marginTop:4, fontWeight:500 }}>{label}</div>
      {change !== undefined && (
        <div style={{
          position:"absolute", top:14, right:12,
          fontSize:10, fontWeight:700,
          color: pos ? T.emerald : T.rose,
          background: pos ? T.emerald+"18" : T.rose+"18",
          padding:"2px 6px", borderRadius:5,
        }}>{pos ? "↑" : "↓"} {Math.abs(change)}%</div>
      )}
    </div>
  );
}

// ─── STAT CARD (gradient tinted, icon circle + big number) ───────────────
function MobileStatCard({ icon, title, value, sub, color }) {
  return (
    <div style={{
      flex:"1 1 190px", minWidth:170, borderRadius:16, padding:16,
      background:`radial-gradient(130% 130% at 12% 15%, ${color}3D 0%, ${color}14 32%, ${T.card} 62%)`,
      border:`1px solid ${color}40`, position:"relative", overflow:"hidden",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{
          width:36, height:36, borderRadius:11, flexShrink:0,
          background:`linear-gradient(135deg, ${color}F2 0%, ${color}B8 100%)`, boxShadow:`0 4px 12px ${color}4D`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:16,
        }}>{icon}</div>
        <div style={{ fontSize:12, fontWeight:700, color:T.t1 }}>{title}</div>
      </div>
      <div style={{ fontSize:24, fontWeight:800, color:T.t1, letterSpacing:"-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:T.t3, marginTop:3, fontWeight:500 }}>{sub}</div>}
    </div>
  );
}

// ─── BAR CHART ────────────────────────────────────────────────────────────
function BarChart({ data, color, height = 64 }) {
  const max = Math.max(...data.map(d => d.val), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height: height + 20 }}>
      {data.map((d, i) => {
        const isLast = i === data.length - 1;
        const h = Math.max((d.val / max) * height, 3);
        return (
          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
            <div style={{
              width:"100%", borderRadius:"4px 4px 0 0",
              height:`${h}px`,
              background: isLast ? color : T.cardHigh,
              border: isLast ? `none` : `1px solid ${T.borderHi}`,
              borderBottom:"none",
              boxShadow: isLast ? `0 -4px 16px ${color}40` : "none",
              transition:"height 0.8s cubic-bezier(0.34,1.56,0.64,1)",
            }} />
            <span style={{ fontSize:9, color: isLast ? T.t2 : T.t3, fontWeight:600 }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── DONUT ────────────────────────────────────────────────────────────────
function Donut({ segments, size=110, centerLabel, centerSub }) {
  const total = segments.reduce((a,b) => a+b.value, 0);
  const r=40, cx=50, cy=50, circ=2*Math.PI*r;
  let cum=0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.border} strokeWidth="11" />
      {segments.map((seg,i) => {
        const pct=seg.value/total, dash=pct*circ, offset=circ-cum*circ;
        cum+=pct;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={seg.color} strokeWidth="11"
          strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={offset}
          strokeLinecap="butt"
          style={{ transform:"rotate(-90deg)", transformOrigin:"50% 50%" }} />;
      })}
      {centerLabel && <>
        <text x="50" y="46" textAnchor="middle" fill={T.t1} fontSize="13" fontWeight="800" fontFamily={FONT}>{centerLabel}</text>
        <text x="50" y="58" textAnchor="middle" fill={T.t3} fontSize="8" fontFamily={FONT}>{centerSub}</text>
      </>}
    </svg>
  );
}

// ─── PIPELINE STRIP ───────────────────────────────────────────────────────
function PipelineStrip({ stages }) {
  const total = stages.reduce((a,b) => a+b.count, 0);
  return (
    <div>
      <div style={{ display:"flex", borderRadius:6, overflow:"hidden", height:8, marginBottom:12 }}>
        {stages.map((s,i) => (
          <div key={i} title={`${s.id}: ${s.count}`}
            style={{ width:`${(s.count/total)*100}%`, background:s.color, transition:"width 0.4s" }} />
        ))}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 12px" }}>
        {stages.map((s,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:6, height:6, borderRadius:2, background:s.color }} />
            <span style={{ fontSize:10, color:T.t2, fontWeight:500 }}>{s.id}</span>
            <span style={{ fontSize:10, fontWeight:700, color:s.color }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BOTTOM SHEET ─────────────────────────────────────────────────────────
function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:200, display:"flex", alignItems:"flex-end", backdropFilter:"blur(4px)" }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{
        background:T.surface, borderRadius:"24px 24px 0 0",
        padding:"24px 20px 36px",
        width:"100%", maxHeight:"88vh", overflowY:"auto",
        borderTop:`1px solid ${T.border}`,
        borderLeft:`1px solid ${T.border}`,
        borderRight:`1px solid ${T.border}`,
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:800, color:T.t1, letterSpacing:"-0.02em" }}>{title}</div>
          <button onClick={onClose} style={{
            background:T.card, border:`1px solid ${T.border}`, borderRadius:10,
            color:T.t2, width:32, height:32, cursor:"pointer", fontSize:16,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── FORM PRIMITIVES ──────────────────────────────────────────────────────
const inputStyle = {
  width:"100%", background:T.surface, border:`1px solid ${T.border}`,
  borderRadius:12, padding:"11px 14px", color:T.t1, fontSize:13,
  outline:"none", boxSizing:"border-box", fontFamily:FONT,
  transition:"border-color 0.2s",
};

function Field({ label, value, onChange, type="text", placeholder }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom:14 }}>
      {label && <div style={{ fontSize:11, color:T.t2, marginBottom:6, fontWeight:600, letterSpacing:"0.03em", textTransform:"uppercase" }}>{label}</div>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ ...inputStyle, borderColor: focus ? T.accent+"66" : T.border }} />
    </div>
  );
}

// Every bulk import asks the telecaller for a heading (e.g. "Batter Product",
// "Existing Customers") that is stamped on every row in that batch.
const BATCH_TITLE_SUGGESTIONS = ["Batter Product", "Existing Customers", "New Leads"];
function BatchTitleField({ value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Field label="Batch Title / Heading *" value={value} onChange={e => onChange(e.target.value)} placeholder="e.g. Batter Product, Existing Customers" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: -6 }}>
        {BATCH_TITLE_SUGGESTIONS.map(t => (
          <button key={t} type="button" onClick={() => onChange(t)} style={{
            padding: "5px 11px", borderRadius: 16, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            background: value.trim() === t ? T.indigo : "transparent", color: value.trim() === t ? "#FFFFFF" : T.t2,
            border: `1px solid ${value.trim() === t ? T.indigo : T.border}`,
          }}>{t}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.t3, marginTop: 6, lineHeight: 1.4 }}>Applied to every row in this batch. Type your own or tap one above.</div>
    </div>
  );
}

function Dropdown({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <div style={{ fontSize:11, color:T.t2, marginBottom:6, fontWeight:600, letterSpacing:"0.03em", textTransform:"uppercase" }}>{label}</div>}
      <select value={value} onChange={onChange}
        style={{ ...inputStyle, appearance:"none", cursor:"pointer" }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// A real calendar grid that expands open below its trigger button — used
// anywhere a date needs picking (currently: Hub Distributor visit
// scheduling) instead of relying on the plain native date input, which
// looks and behaves inconsistently across phones. `value`/`onChange` work
// with plain "YYYY-MM-DD" strings, same as a native date input's value,
// so it drops in as a straight swap. `min` (optional, "YYYY-MM-DD")
// greys out and disables anything earlier.
function CalendarDatePicker({ label, value, onChange, min }) {
  const [open, setOpen] = useState(false);
  const seed = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(seed.getFullYear());
  const [viewMonth, setViewMonth] = useState(seed.getMonth()); // 0-11

  useEffect(() => {
    if (!open) return;
    const d = value ? new Date(value + "T00:00:00") : new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [open]); // eslint-disable-line

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = todayISO();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dateStrFor = (day) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const navBtnStyle = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.t1, width: 30, height: 30, fontSize: 16, cursor: "pointer", fontFamily: FONT, lineHeight: 1 };

  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>{label}</div>}
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: "100%", textAlign: "left", background: T.surface, border: `1px solid ${open ? T.accent : T.border}`,
        borderRadius: 10, color: value ? T.t1 : T.t3, padding: "10px 12px", fontSize: 13, fontFamily: FONT, cursor: "pointer",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span>{value ? new Date(value + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Tap to pick a date"}</span>
        <span>📅</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 12, animation: "fadeSlideIn 0.15s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} style={navBtnStyle}>‹</button>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.t1 }}>{monthLabel}</div>
            <button type="button" onClick={nextMonth} style={navBtnStyle}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10, color: T.t3, fontWeight: 700, padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const ds = dateStrFor(day);
              const isToday = ds === todayStr;
              const isSelected = ds === value;
              const isDisabled = !!min && ds < min;
              return (
                <button type="button" key={i} disabled={isDisabled} onClick={() => { onChange(ds); setOpen(false); }} style={{
                  aspectRatio: "1", border: isToday && !isSelected ? `1px solid ${T.accent}88` : "1px solid transparent", borderRadius: 8,
                  background: isSelected ? T.accent : "transparent",
                  color: isDisabled ? T.t4 : isSelected ? "#FFFFFF" : T.t1,
                  fontSize: 12.5, fontWeight: isSelected || isToday ? 800 : 500,
                  cursor: isDisabled ? "not-allowed" : "pointer", fontFamily: FONT,
                  opacity: isDisabled ? 0.35 : 1,
                }}>{day}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => { onChange(todayISO()); setOpen(false); }} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.t2, padding: "8px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Today</button>
            {value && <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={{ flex: 1, background: T.rose + "18", border: `1px solid ${T.rose}44`, borderRadius: 8, color: T.rose, padding: "8px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Clear Date</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({ label, color=T.accent, onClick, full, ghost, small, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      background: ghost ? "transparent" : color,
      color: ghost ? color : "#FFFFFF",
      border: `1px solid ${ghost ? color+"55" : color}`,
      borderRadius:12, padding: small ? "8px 14px" : "12px 20px",
      fontWeight:700, fontSize: small ? 12 : 13, cursor: disabled ? "not-allowed" : "pointer",
      width: full ? "100%" : "auto", fontFamily:FONT,
      letterSpacing:"-0.01em",
      opacity: disabled ? 0.45 : 1,
      transition:"opacity 0.15s",
    }}>{label}</button>
  );
}

function Stars({ value, onChange, max=5 }) {
  return (
    <div style={{ display:"flex", gap:4 }}>
      {Array.from({ length:max }, (_,i) => (
        <button key={i} onClick={() => onChange?.(i+1)}
          style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, padding:2,
            color: i < value ? T.amber : T.border, lineHeight:1 }}>★</button>
      ))}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────
// ─── PROSPECT FINDER ─────────────────────────────────────────────────────────
function ProspectFinder() {
  const [leads, setLeads] = useSheetSynced("leads","leads",[]);
  const [area, setArea] = useState("T Nagar, Chennai");
  const [type, setType] = useState("restaurant");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState({});
  const [filling, setFilling] = useState(null); // prospect being filled
  const [form, setForm] = useState({ name:"", business:"", type2:"Restaurant", area2:"", address:"", telecaller:"Thulasi", notes:"" });

  const AREAS = [
    // Chennai
    "T Nagar, Chennai","Anna Nagar, Chennai","Adyar, Chennai","Velachery, Chennai",
    "Porur, Chennai","Tambaram, Chennai","Mylapore, Chennai","Nungambakkam, Chennai",
    "Guindy, Chennai","Vadapalani, Chennai","Chromepet, Chennai","Perambur, Chennai",
    "Kolathur, Chennai","Villivakkam, Chennai","Ambattur, Chennai","Avadi, Chennai",
    "Sholinganallur, Chennai","OMR, Chennai","ECR, Chennai","Perungudi, Chennai",
    "Royapuram, Chennai","Tondiarpet, Chennai","Egmore, Chennai","Kilpauk, Chennai",
    "Chetpet, Chennai","Pattabiram, Chennai","Thiruvottiyur, Chennai",
    "Madipakkam, Chennai","Pallikaranai, Chennai","Keelkattalai, Chennai",
    "Nanganallur, Chennai","Alandur, Chennai","St Thomas Mount, Chennai",
    // Bengaluru
    "Koramangala, Bengaluru","BTM Layout, Bengaluru","Indiranagar, Bengaluru",
    "HSR Layout, Bengaluru","Whitefield, Bengaluru","JP Nagar, Bengaluru",
    "Jayanagar, Bengaluru","Marathahalli, Bengaluru","Rajajinagar, Bengaluru",
  ];

  const TYPES = [
    { val:"restaurant", label:"🍽️ Restaurants" },
    { val:"meal_provider", label:"🍱 Mess / Tiffin" },
    { val:"catering", label:"🎪 Catering" },
    { val:"hotel", label:"🏨 Hotels" },
    { val:"bakery", label:"🥐 Bakeries" },
    { val:"food", label:"🥘 All Food" },
  ];

  async function search() {
    setLoading(true); setError(""); setResults([]);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE ?? "";
      const res = await fetch(API_BASE + "/api/prospects?area=" + encodeURIComponent(area) + "&type=" + type);
      const data = await res.json();
      if (data.error) { setError(data.error); setLoading(false); return; }
      setResults(data.results || []);
      if ((data.results||[]).length === 0) setError("No results found. Try a different area or type.");
    } catch(e) {
      setError("Search failed: " + e.message);
    }
    setLoading(false);
  }

  function startFill(r) {
    setFilling(r);
    setForm({
      name: r.name,
      business: r.name,
      type2: r.type === "hotel" ? "Hotel" : r.type === "bakery" ? "Bakery" : "Restaurant",
      area2: area.split(",")[0],
      address: r.address,
      telecaller: "Thulasi",
      notes: "",
    });
  }

  function confirmAdd() {
    if (!filling || !form.name) return;
    const newLead = {
      id: Date.now() + Math.random(),
      name: form.name,
      contact: filling.phone || "",
      business: form.business,
      type: form.type2,
      area: form.area2,
      address: form.address,
      stage: "New Lead",
      source: "Prospect Finder",
      telecaller: form.telecaller,
      lastContact: "Not contacted",
      priority: "Medium",
      remarks: form.notes ? ["[Prospect Finder] " + form.notes] : [],
      createdAt: Date.now(),
    };
    setLeads([newLead, ...leads]);
    setAdded({ ...added, [filling.name]: true });
    setFilling(null);
  }

  // ── Fill details view ──
  if (filling) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setFilling(null)}
            style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, color:T.t2, padding:"6px 12px", fontSize:12, cursor:"pointer", fontFamily:FONT }}>← Back</button>
          <div style={{ fontSize:14, fontWeight:700, color:T.t1 }}>Add to Pipeline</div>
        </div>

        <div style={{ background:T.card, border:`1px solid ${T.accentGlow}`, borderRadius:14, padding:14 }}>
          <div style={{ fontSize:13, fontWeight:800, color:T.t1 }}>{filling.name}</div>
          <div style={{ fontSize:11, color:T.t3, marginTop:3 }}>📍 {filling.address}</div>
          {filling.phone && <div style={{ fontSize:12, color:T.accent, marginTop:3 }}>📞 {filling.phone}</div>}
        </div>

        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:14, display:"flex", flexDirection:"column", gap:12 }}>
          {[
            ["Customer Name *", "name", "text", "e.g. Anand Tiffin Center"],
            ["Business Name", "business", "text", "e.g. Anand Foods Pvt Ltd"],
            ["Area", "area2", "text", "e.g. T Nagar"],
            ["Address", "address", "text", "Full address"],
          ].map(([label, key, inputType, placeholder]) => (
            <div key={key}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>{label.toUpperCase()}</div>
              <input type={inputType} value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})}
                placeholder={placeholder}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1,
                  padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>BUSINESS TYPE</div>
            <select value={form.type2} onChange={e => setForm({...form, type2:e.target.value})}
              style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
              {["Home","Restaurant","Mess","Hotel","Bakery","Cloud Kitchen","Catering","Other"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>ASSIGN TELECALLER</div>
            <select value={form.telecaller} onChange={e => setForm({...form, telecaller:e.target.value})}
              style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
              {TELECALLERS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>FIRST NOTES (optional)</div>
            <textarea value={form.notes} onChange={e => setForm({...form, notes:e.target.value})}
              placeholder="e.g. Found via prospect search, needs 20 KG/week..."
              rows={3}
              style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1,
                padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box", resize:"none" }} />
          </div>
        </div>

        <div style={{ display:"flex", gap:8 }}>
          {filling.phone && (
            <button onClick={() => { const p=filling.phone.replace(/[^0-9]/g,""); if(p) window.location.href="tel:+"+p; }}
              style={{ flex:1, background:T.emerald+"22", border:`1px solid ${T.emerald}44`, borderRadius:12,
                color:T.emerald, padding:"12px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
              📞 Call First
            </button>
          )}
          <button onClick={confirmAdd} disabled={!form.name}
            style={{ flex:2, background: form.name ? T.accent : T.border, border:"none", borderRadius:12,
              color: form.name ? "#FFFFFF" : T.t3, padding:"12px", fontSize:14, fontWeight:800,
              cursor: form.name ? "pointer" : "default", fontFamily:FONT }}>
            ✓ Add to CRM Pipeline
          </button>
        </div>
      </div>
    );
  }

  // ── Search & results view ──
  const existingNames = new Set(leads.map(l => l.name.toLowerCase()));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div>
        <div style={{ fontSize:16, fontWeight:800, color:T.t1 }}>Prospect Finder</div>
        <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>Find hotels, restaurants & caterers — add to CRM instantly</div>
      </div>

      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:14, display:"flex", flexDirection:"column", gap:10 }}>
        <div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:6 }}>AREA / LOCATION</div>
          <select value={area} onChange={e => setArea(e.target.value)}
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box", marginBottom:6 }}>
            {AREAS.map(a => <option key={a}>{a}</option>)}
          </select>
          <input value={area} onChange={e => setArea(e.target.value)} placeholder="Or type any area..."
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
        </div>
        <div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:6 }}>BUSINESS TYPE</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {TYPES.map(t => (
              <button key={t.val} onClick={() => setType(t.val)}
                style={{ background: type===t.val ? T.accentSub : T.surface,
                  border:`1px solid ${type===t.val ? T.accent : T.border}`,
                  borderRadius:20, color: type===t.val ? T.accent : T.t2,
                  padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={search} disabled={loading}
          style={{ background: loading ? T.border : T.accent, border:"none", borderRadius:12,
            color: loading ? T.t3 : "#FFFFFF", padding:"13px", fontSize:14, fontWeight:800,
            cursor: loading ? "default" : "pointer", fontFamily:FONT }}>
          {loading ? "🔍 Searching..." : "🔍 Find Prospects"}
        </button>
      </div>

      {error && (
        <div style={{ background:"rgba(244,63,94,0.1)", border:"1px solid rgba(244,63,94,0.3)", borderRadius:12, padding:12, fontSize:12, color:T.rose }}>{error}</div>
      )}

      {results.length > 0 && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600 }}>{results.length} PROSPECTS FOUND</div>
          <div style={{ fontSize:11, color:T.accent, fontWeight:700 }}>{Object.keys(added).length} ADDED TO CRM</div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {results.map((r, i) => {
          const isExisting = existingNames.has(r.name.toLowerCase());
          const isAdded = added[r.name] || isExisting;
          return (
            <div key={i} style={{ background:T.card, border:`1px solid ${isAdded ? T.border : T.accentGlow}`, borderRadius:14, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:T.t1 }}>{r.name}</div>
                  <div style={{ fontSize:11, color:T.t3, marginTop:3 }}>📍 {r.address}</div>
                  {r.phone
                    ? <div style={{ fontSize:12, color:T.accent, marginTop:3, fontWeight:600 }}>📞 {r.phone}</div>
                    : <div style={{ fontSize:11, color:T.t3, marginTop:3 }}>📞 No number — search manually</div>}
                  {r.website ? <div style={{ fontSize:10, color:T.sky, marginTop:2 }}>🌐 {r.website.replace("https://","").slice(0,30)}</div> : null}
                  <div style={{ fontSize:10, color:T.t3, marginTop:2, textTransform:"capitalize" }}>{r.type}</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, marginLeft:8, flexShrink:0 }}>
                  {isAdded ? (
                    <div style={{ background:T.accentSub, border:`1px solid ${T.accentGlow}`, borderRadius:8, color:T.accent, padding:"5px 10px", fontSize:11, fontWeight:700 }}>
                      {isExisting ? "In CRM" : "✓ Added"}
                    </div>
                  ) : (
                    <button onClick={() => startFill(r)}
                      style={{ background:T.accent, border:"none", borderRadius:8, color:"#FFFFFF", padding:"6px 12px", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:FONT }}>
                      + Add Lead
                    </button>
                  )}
                  {r.phone && (
                    <button onClick={() => { const p=r.phone.replace(/[^0-9]/g,""); if(p) window.location.href="tel:+"+p; }}
                      style={{ background:T.emerald+"22", border:`1px solid ${T.emerald}44`, borderRadius:8, color:T.emerald, padding:"5px 10px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
                      📞 Call
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {results.length === 0 && !loading && !error && (
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:24, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🗺️</div>
          <div style={{ fontSize:14, fontWeight:700, color:T.t1, marginBottom:6 }}>Find New Customers</div>
          <div style={{ fontSize:12, color:T.t3, lineHeight:1.7 }}>Search hotels, restaurants, mess and catering in any Chennai area. One tap to add to your CRM pipeline.</div>
        </div>
      )}
    </div>
  );
}


// ─── TODAY'S TASKS ────────────────────────────────────────────────────────────
function TodayTasks() {
  const [leads] = useSheetSynced("leads","leads",[]);
  const [samples] = useSheetSynced("samples","samples",[]);
  const [repeatCustomers] = useSheetSynced("repeatCustomers","repeatCustomers",[]);

  const todayStr = new Date().toISOString().slice(0,10);
  const todayDisplay = new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"});

  // Scheduled samples for today
  const samplesScheduledToday = samples.filter(s =>
    s.status === "Pending" && s.scheduledDate === todayStr
  );

  // Scheduled samples for future dates
  const upcomingSamples = samples.filter(s =>
    s.status === "Pending" && s.scheduledDate && s.scheduledDate > todayStr
  ).sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate));

  // Callback leads
  const callbackLeads = leads.filter(l => l.stage === "Callback Requested");

  // Sample requested leads
  const sampleRequestedLeads = leads.filter(l => l.stage === "Sample Requested");

  // Repeat orders due today
  const dueToday = repeatCustomers.filter(c => c.status === "Due Today");

  // Pending samples (no date set)
  const pendingNoDate = samples.filter(s => s.status === "Pending" && !s.scheduledDate);

  const totalTasks = samplesScheduledToday.length + callbackLeads.length + sampleRequestedLeads.length + dueToday.length;

  function Section({ icon, title, color, count, children }) {
    const [open, setOpen] = useState(true);
    if (count === 0) return null;
    return (
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, overflow:"hidden" }}>
        <div onClick={() => setOpen(!open)}
          style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"12px 14px", cursor:"pointer", borderBottom: open ? `1px solid ${T.border}` : "none" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:16 }}>{icon}</span>
            <span style={{ fontSize:13, fontWeight:800, color:T.t1 }}>{title}</span>
            <div style={{ background:color+"22", border:`1px solid ${color}44`, borderRadius:20,
              padding:"2px 8px", fontSize:11, fontWeight:800, color }}>{count}</div>
          </div>
          <span style={{ color:T.t3, fontSize:12 }}>{open ? "▲" : "▼"}</span>
        </div>
        {open && <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:8 }}>{children}</div>}
      </div>
    );
  }

  function TaskCard({ lead, extra, callAction, whatsappAction }) {
    return (
      <div style={{ background:T.surface, borderRadius:12, padding:"10px 12px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{lead.name || lead.customer}</div>
            {lead.area && <div style={{ fontSize:11, color:T.t3, marginTop:1 }}>📍 {lead.area}</div>}
            {lead.contact && <div style={{ fontSize:11, color:T.t2, marginTop:1 }}>📞 {lead.contact}</div>}
            {lead.telecaller && <div style={{ fontSize:11, color:T.accent, marginTop:1 }}>👤 {lead.telecaller}</div>}
            {extra && <div style={{ fontSize:11, color:T.amber, marginTop:3, fontWeight:600 }}>{extra}</div>}
          </div>
        </div>
        {(callAction || whatsappAction) && (
          <div style={{ display:"flex", gap:6, marginTop:8 }}>
            {callAction && (
              <button onClick={callAction}
                style={{ flex:1, background:T.emerald+"22", border:`1px solid ${T.emerald}44`, borderRadius:8,
                  color:T.emerald, padding:"6px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
                📞 Call
              </button>
            )}
            {whatsappAction && (
              <button onClick={whatsappAction}
                style={{ flex:1, background:"#25D36622", border:"1px solid #25D36644", borderRadius:8,
                  color:"#25D366", padding:"6px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
                💬 WhatsApp
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:`linear-gradient(135deg, ${T.card}, ${T.cardHigh})`,
        border:`1px solid ${T.borderHi}`, borderRadius:16, padding:16 }}>
        <div style={{ fontSize:11, color:T.accent, fontWeight:700, letterSpacing:"0.1em", marginBottom:4 }}>TODAY</div>
        <div style={{ fontSize:15, fontWeight:800, color:T.t1 }}>{todayDisplay}</div>
        <div style={{ fontSize:13, color:T.t3, marginTop:4 }}>
          {totalTasks > 0
            ? <span style={{color:T.rose, fontWeight:700}}>{totalTasks} tasks pending</span>
            : <span style={{color:T.emerald, fontWeight:700}}>All clear! No pending tasks 🎉</span>}
        </div>
      </div>

      <Section icon="🧪" title="Sample Deliveries Today" color={T.amber} count={samplesScheduledToday.length}>
        {samplesScheduledToday.map((s,i) => (
          <TaskCard key={i} lead={{ name:s.customer, contact:"", area:"" }}
            extra={`${s.qty} KG ${s.type}${s.scheduledTime ? " · " + s.scheduledTime : ""} · Exec: ${s.exec}`} />
        ))}
      </Section>

      <Section icon="📅" title="Upcoming Samples" color={T.sky} count={upcomingSamples.length}>
        {upcomingSamples.map((s,i) => (
          <TaskCard key={i} lead={{ name:s.customer }}
            extra={`${s.qty} KG ${s.type} · ${new Date(s.scheduledDate).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}${s.scheduledTime ? " " + s.scheduledTime : ""}`} />
        ))}
      </Section>

      <Section icon="📞" title="Callback Requested" color={T.rose} count={callbackLeads.length}>
        {callbackLeads.map((l,i) => (
          <TaskCard key={i} lead={l}
            extra={l.remarks?.[l.remarks.length-1] || ""}
            callAction={() => { const p=(l.contact||"").replace(/[^0-9]/g,""); if(p) window.location.href="tel:+91"+p; }}
            whatsappAction={() => { const p=(l.contact||"").replace(/[^0-9]/g,""); window.open("https://wa.me/91"+p,"_blank"); }}
          />
        ))}
      </Section>

      <Section icon="🎁" title="Sample Requested" color={T.orange} count={sampleRequestedLeads.length}>
        {sampleRequestedLeads.map((l,i) => (
          <TaskCard key={i} lead={l}
            extra={l.remarks?.[l.remarks.length-1] || ""}
            callAction={() => { const p=(l.contact||"").replace(/[^0-9]/g,""); if(p) window.location.href="tel:+91"+p; }}
            whatsappAction={() => { const p=(l.contact||"").replace(/[^0-9]/g,""); window.open("https://wa.me/91"+p,"_blank"); }}
          />
        ))}
      </Section>

      <Section icon="🔁" title="Repeat Orders Due Today" color={T.accent} count={dueToday.length}>
        {dueToday.map((c,i) => (
          <TaskCard key={i} lead={{ name:c.name, contact:c.contact, area:c.area }}
            extra={`${c.qty} KG ${c.product} · ${c.frequency}`}
            callAction={() => { const p=(c.contact||"").replace(/[^0-9]/g,""); if(p) window.location.href="tel:+91"+p; }}
            whatsappAction={() => { const p=(c.contact||"").replace(/[^0-9]/g,""); window.open("https://wa.me/91"+p,"_blank"); }}
          />
        ))}
      </Section>

      {pendingNoDate.length > 0 && (
        <Section icon="⏳" title="Pending Samples (No Date Set)" color={T.t3} count={pendingNoDate.length}>
          {pendingNoDate.map((s,i) => (
            <TaskCard key={i} lead={{ name:s.customer }}
              extra={`${s.qty} KG ${s.type} · No schedule set`} />
          ))}
        </Section>
      )}

      {totalTasks === 0 && pendingNoDate.length === 0 && (
        <div style={{ textAlign:"center", padding:40, color:T.t3 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:14, fontWeight:700, color:T.t1 }}>All tasks done for today!</div>
          <div style={{ fontSize:12, marginTop:6 }}>Check back tomorrow for new tasks</div>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const [leads] = useSheetSynced("leads","leads",[]);
  const [samples] = useSheetSynced("samples","samples",[]);
  const [expenses] = useSheetSynced("expenses","expenses",[]);
  const [repeatCustomers] = useSheetSynced("repeatCustomers","repeatCustomers",[]);

  // ── Live KPI calculations ──
  const activeLeads = (leads||[]).filter(l => l && l.name && l.stage);
  const activeCustomers = activeLeads.filter(l => l.stage === "Active Customer").length;
  const ordersReceived = activeLeads.filter(l => ["Order Received","Active Customer","Repeat Order Follow-up"].includes(l.stage));
  const converted = ordersReceived.length;
  const convRate = activeLeads.length > 0 ? Math.round((converted/activeLeads.length)*100) : 0;

  // Sales KG - from samples delivered + pipeline kgQty
  const samplesDeliveredKg = (samples||[]).filter(s => s.status==="Delivered").reduce((a,b) => a+(Number(b.qty)||0), 0);
  // Sum KG from all order-stage leads (kgQty field entered during delivery)
  const orderKg = activeLeads
    .filter(l => ["Order Received","Active Customer","Repeat Order Follow-up"].includes(l.stage))
    .reduce((a,l) => {
      // Try kgQty field first, then parse from remarks
      const fromField = Number(l.kgQty) || 0;
      if (fromField > 0) return a + fromField;
      // Try to extract KG from last remark e.g. "10 KG ORDER"
      const lastRemark = (l.remarks||[]).slice(-1)[0] || "";
      const match = lastRemark.match(/(\d+)\s*(?:kg|KG|Kg)/);
      return a + (match ? Number(match[1]) : 0);
    }, 0);
  const totalKg = samplesDeliveredKg + orderKg;

  // Revenue - KG * price (₹120/kg default)
  const pricePerKg = 120;
  const totalRevenue = totalKg * pricePerKg;

  // Expenses from expense tab
  const totalExpenses = (expenses||[]).reduce((a,b) => a+(Number(b.amount)||0), 0);
  const deliveryExp = (expenses||[]).filter(e => e.type==="Delivery" || e.subtype==="Porter").reduce((a,b) => a+(Number(b.amount)||0), 0);
  const marketingExp = (expenses||[]).filter(e => e.type==="Marketing").reduce((a,b) => a+(Number(b.amount)||0), 0);
  const sampleExp = (samples||[]).reduce((a,b) => a+(Number(b.deliveryCost)||0)+(Number(b.productionCost)||0), 0);
  const estProfit = totalRevenue - totalExpenses - sampleExp;

  // Samples
  const samplesSentKg = (samples||[]).reduce((a,b) => a+(Number(b.qty)||0), 0);

  // Pipeline stage counts
  const stageCounts = {};
  activeLeads.forEach(l => { stageCounts[l.stage] = (stageCounts[l.stage]||0) + 1; });
  const liveStages = PIPELINE_STAGES.map(s => ({ ...s, count: stageCounts[s.id]||0 }));

  // Due today repeat orders
  const dueToday = (repeatCustomers||[]).filter(c => c.status === "Due Today");

  // Expense segments for donut
  const expSegs = [
    { label:"Marketing", value:marketingExp, color:T.indigo },
    { label:"Delivery",  value:deliveryExp,  color:T.amber  },
    { label:"Samples",   value:sampleExp,    color:T.accent },
    { label:"Staff",     value:Math.max(0, totalExpenses - marketingExp - deliveryExp), color:T.sky },
  ];
  const totalExp = expSegs.reduce((a,b) => a+b.value, 0);

  const thisMonth = new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"});

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      <BatterGrinderHero theme={T} kgToday={totalKg} compact />

      {/* KPIs */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        <KPI label="Sales this month" value={totalKg}   unit="KG" change={0} color={T.accent}  icon="📦" />
        <KPI label="Revenue"          value={totalRevenue}  unit="₹" change={0} color={T.emerald} icon="💰" />
        <KPI label="Active customers" value={activeCustomers} change={0} color={T.indigo} icon="🏪" />
        <KPI label="Total Leads"      value={activeLeads.length} change={0} color={T.amber} icon="📋" />
        <KPI label="Orders"           value={ordersReceived.length} change={0} color={T.emerald} icon="📦" />
        <KPI label="Conversion"       value={convRate+"%"} change={0} color={T.accent} icon="🎯" />
        <KPI label="Samples sent"     value={samplesSentKg} unit="KG" change={0} color={T.orange} icon="🧪" />
        <KPI label="Total Expenses"   value={totalExpenses} unit="₹" change={0} color={T.rose} icon="💸" />
        <KPI label="Est. profit"      value={estProfit} unit="₹" change={0} color={T.emerald} icon="📈" />
      </div>

      {/* Pipeline live */}
      <Card>
        <Label sub={`${activeLeads.length} total leads across all stages`}>Telecalling Pipeline</Label>
        <PipelineStrip stages={liveStages} />
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:10 }}>
          {liveStages.filter(s => s.count > 0).map(s => (
            <div key={s.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:7,height:7,borderRadius:2,background:s.color }} />
              <span style={{ fontSize:10, color:T.t3 }}>{s.id} {s.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Orders summary */}
      <Card accent={T.emerald}>
        <Label sub={thisMonth}>Orders & Revenue</Label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:8 }}>
          {[
            ["Orders", ordersReceived.length, T.emerald],
            ["KG Sold", totalKg > 0 ? totalKg : "—", T.accent],
            ["Revenue", totalRevenue > 0 ? "₹"+(totalRevenue/1000).toFixed(1)+"K" : "—", T.emerald],
            ["Samples", (samples||[]).length, T.orange],
            ["Expenses", "₹"+(totalExpenses/1000).toFixed(1)+"K", T.rose],
            ["Profit", estProfit > 0 ? "₹"+(estProfit/1000).toFixed(1)+"K" : "—", T.sky],
          ].map(([l,v,c]) => (
            <div key={l} style={{ textAlign:"center", background:T.surface, borderRadius:12, padding:"10px 4px" }}>
              <div style={{ fontSize:16, fontWeight:900, color:c }}>{v}</div>
              <div style={{ fontSize:10, color:T.t3, marginTop:2, fontWeight:600 }}>{l}</div>
            </div>
          ))}
        </div>
        {ordersReceived.length > 0 && (
          <div style={{ marginTop:12, borderTop:`1px solid ${T.border}`, paddingTop:10 }}>
            <div style={{ fontSize:10, color:T.t3, fontWeight:700, marginBottom:6 }}>RECENT ORDERS</div>
            {ordersReceived.slice(0,5).map((l,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${T.border}` }}>
                <span style={{ fontSize:12, color:T.t1, fontWeight:600 }}>{l.name}</span>
                <span style={{ fontSize:11, color:T.accent, fontWeight:700 }}>
                  {l.kgQty ? l.kgQty+"KG" : l.remarks?.slice(-1)[0]?.match(/(\d+)\s*(?:kg|KG)/)?.[0] || "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Repeat order alerts */}
      <Card accent={T.amber}>
        <Label sub="Customers due for re-order today">Re-order Alerts</Label>
        {dueToday.length === 0 && <div style={{ fontSize:12, color:T.t3, padding:"8px 0" }}>No re-orders due today</div>}
        {dueToday.map(c => (
          <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0", borderBottom:`1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{c.name}</div>
              <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>{c.qty} KG {c.product} · {c.frequency}</div>
            </div>
            <Chip label="Call Now" color={T.amber} />
          </div>
        ))}
      </Card>

      {/* Expense breakdown */}
      <Card>
        <Label sub={thisMonth}>Expense Breakdown</Label>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <Donut segments={expSegs} size={110} centerLabel={"₹"+(totalExp/1000).toFixed(0)+"K"} centerSub="Total" />
          <div style={{ flex:1 }}>
            {expSegs.map((s,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:7, height:7, borderRadius:2, background:s.color }} />
                  <span style={{ fontSize:12, color:T.t2, fontWeight:500 }}>{s.label}</span>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:s.color }}>₹{s.value.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Leaderboard */}
      <Card>
        <Label>Team Leaderboard</Label>
        {[...TEAM_DATA].sort((a,b) => b.score-a.score).map((m,i) => (
          <div key={i} style={{
            display:"flex", alignItems:"center", gap:12,
            padding:"11px 0", borderBottom: i < TEAM_DATA.length-1 ? `1px solid ${T.border}` : "none",
          }}>
            <div style={{
              width:28, height:28, borderRadius:8, flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:11, fontWeight:800,
              background: i===0 ? "#F59E0B18" : i===1 ? "#94A3B818" : i===2 ? "#CD7F3218" : T.cardHigh,
              color: i===0 ? "#F59E0B" : i===1 ? "#94A3B8" : i===2 ? "#CD7F32" : T.t3,
              border:`1px solid ${i===0 ? "#F59E0B30" : i===1 ? "#94A3B830" : i===2 ? "#CD7F3230" : T.border}`,
            }}>#{i+1}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{m.name}</div>
              <div style={{ fontSize:10, color:T.t3, fontWeight:500 }}>{m.role}</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:52, height:4, borderRadius:3, background:T.border, overflow:"hidden" }}>
                <div style={{ width:`${m.score}%`, height:"100%", background:m.color, borderRadius:3 }} />
              </div>
              <span style={{ fontSize:15, fontWeight:800, color:m.color, minWidth:26, textAlign:"right" }}>{m.score}</span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── LEADS CRM ────────────────────────────────────────────────────────────

// ── GroupMsgDialog — proper component so hooks work correctly ─────────────────
function GroupMsgDialog({ groupMsg, buildGroupMsg, onClose }) {
  const { lead, targetStage, method, kgQty } = groupMsg;
  const defaultMsg = buildGroupMsg(lead, targetStage, method, "");
  const [editedMsg, setEditedMsg] = useState(defaultMsg);

  function copyAndClose() {
    const copy = () => {
      try {
        navigator.clipboard.writeText(editedMsg).then(() => {
          alert("✅ Message copied! Open WhatsApp → Batter sales and sample group → Paste → Send");
          onClose();
        });
      } catch {
        const ta = document.createElement("textarea");
        ta.value = editedMsg;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        alert("✅ Message copied! Open WhatsApp → Batter sales and sample group → Paste → Send");
        onClose();
      }
    };
    copy();
  }

  return (
    <div style={{ padding:"0 0 80px" }}>
      <div style={{ background:T.card, border:`1px solid ${T.accentGlow}`, borderRadius:18, padding:20, margin:"16px 0" }}>
        <div style={{ fontSize:15, fontWeight:800, color:T.t1, marginBottom:4 }}>
          {targetStage === "Sample Requested" ? "🧪 Share Sample Update" : "🎉 Share Order Update"}
        </div>
        <div style={{ fontSize:12, color:T.t3, marginBottom:16 }}>Send to Batter sales and sample group</div>
        <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:6 }}>MESSAGE (tap to edit)</div>
        <textarea value={editedMsg} onChange={e => setEditedMsg(e.target.value)} rows={10}
          style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12,
            color:T.t1, padding:"12px", fontSize:13, fontFamily:FONT,
            outline:"none", width:"100%", boxSizing:"border-box", resize:"vertical", lineHeight:1.7 }} />
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button onClick={onClose}
            style={{ flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12,
              color:T.t2, padding:"11px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>
            Skip
          </button>
          <button onClick={copyAndClose}
            style={{ flex:2, background:"#25D366", border:"none", borderRadius:12,
              color:"white", padding:"11px", fontSize:13, fontWeight:800,
              cursor:"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            📋 Copy & Send to Group
          </button>
        </div>
        <div style={{ fontSize:11, color:T.amber, textAlign:"center", marginTop:8, fontWeight:600 }}>
          Copy → WhatsApp → Batter sales and sample group → Paste → Send
        </div>
      </div>
    </div>
  );
}

// ── WATemplatePicker — shown when WhatsApp tapped on a lead ──────────────────
function WATemplatePicker({ lead, onClose }) {
  const templates = (() => {
    try { const s = localStorage.getItem("wa_templates"); return s ? JSON.parse(s) : DEFAULT_TEMPLATES; } catch { return DEFAULT_TEMPLATES; }
  })();
  const [selected, setSelected] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (selected) setMsg(fillTemplate(selected.message, lead));
  }, [selected]);

  function send() {
    const phone = (lead.contact||"").replace(/[^0-9]/g,"");
    const number = phone.startsWith("91") ? phone : "91"+phone;
    window.open("https://wa.me/"+number+"?text="+encodeURIComponent(msg), "_blank");
    onClose();
  }

  return (
    <Sheet open={true} onClose={onClose} title={"WhatsApp: " + lead.name}>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ fontSize:11, color:T.t3, fontWeight:600 }}>SELECT TEMPLATE</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:200, overflowY:"auto" }}>
          {templates.map(t => (
            <div key={t.id} onClick={() => setSelected(t)}
              style={{ background: selected?.id===t.id ? T.accentSub : T.surface,
                border:`1px solid ${selected?.id===t.id ? T.accent : T.border}`,
                borderRadius:12, padding:"10px 14px", cursor:"pointer" }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{t.name}</div>
              <div style={{ fontSize:11, color:T.accent, marginTop:2 }}>{t.stage}</div>
            </div>
          ))}
        </div>
        {selected && (
          <>
            <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginTop:4 }}>EDIT MESSAGE</div>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5}
              style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10,
                color:T.t1, padding:"10px 12px", fontSize:13, fontFamily:FONT,
                outline:"none", width:"100%", boxSizing:"border-box", resize:"vertical" }} />
            <button onClick={send}
              style={{ background:"#25D366", border:"none", borderRadius:14, color:"white",
                padding:"13px", fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:FONT,
                display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              📲 Send on WhatsApp
            </button>
          </>
        )}
        <button onClick={() => { window.open("https://wa.me/"+(lead.contact||"").replace(/[^0-9]/g,"").replace(/^(?!91)/,"91"), "_blank"); onClose(); }}
          style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12,
            color:T.t2, padding:"10px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>
          Open WhatsApp without template
        </button>
      </div>
    </Sheet>
  );
}

// ─── HR LEADS IMPORT ─────────────────────────────────────────────────────────
function HRLeads() {
  const [hrLeads] = useSheetSynced("hrLeads","hrLeads",[]);
  const [leads, setLeads] = useSheetSynced("leads","leads",[]);
  const [imported, setImported] = useState(() => {
    try { const s = localStorage.getItem("hr_imported"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [editingLead, setEditingLead] = useState(null); // contact number being filled in
  const [form, setForm] = useState({ name:"", business:"", type:"Restaurant", area:"", address:"", telecaller:"Thulasi" });

  function saveImported(obj) {
    setImported(obj);
    try { localStorage.setItem("hr_imported", JSON.stringify(obj)); } catch {}
  }

  function normalizePhone(raw) {
    const digits = (raw||"").replace(/[^0-9]/g,"");
    if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
    if (digits.startsWith("091") && digits.length === 13) return digits.slice(3);
    return digits.slice(-10);
  }

  function startImport(contact) {
    setEditingLead(contact);
    setForm({ name:"", business:"", type:"Restaurant", area:"", address:"", telecaller:"Thulasi" });
  }

  function confirmImport() {
    if (!form.name || !editingLead) return;
    const phone = normalizePhone(editingLead);
    const alreadyExists = leads.some(l => normalizePhone(l.contact) === phone);
    if (!alreadyExists) {
      setLeads([{
        id: Date.now(),
        name: form.name,
        contact: phone,
        business: form.business,
        type: form.type,
        area: form.area,
        address: form.address,
        stage: "New Lead",
        source: "HR Assignment",
        telecaller: form.telecaller,
        lastContact: "Today",
        priority: "Medium",
        remarks: [],
        createdAt: Date.now(),
      }, ...leads]);
    }
    saveImported({ ...imported, [editingLead]: true });
    setEditingLead(null);
  }

  // ── Edit form view ──
  if (editingLead) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setEditingLead(null)}
            style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, color:T.t2, padding:"6px 12px", fontSize:12, cursor:"pointer", fontFamily:FONT }}>← Back</button>
          <div style={{ fontSize:14, fontWeight:700, color:T.t1 }}>Fill Lead Details</div>
        </div>
        <div style={{ background:T.card, border:`1px solid ${T.accentGlow}`, borderRadius:14, padding:14 }}>
          <div style={{ fontSize:11, color:T.accent, fontWeight:700, marginBottom:4 }}>HR NUMBER</div>
          <div style={{ fontSize:16, fontWeight:800, color:T.t1 }}>📞 {editingLead}</div>
          <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>Normalized: {normalizePhone(editingLead)}</div>
        </div>
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:14, display:"flex", flexDirection:"column", gap:12 }}>
          {[
            ["Customer Name *", "name", "text", "e.g. Anand Tiffin Center"],
            ["Business Name", "business", "text", "e.g. Anand Foods Pvt Ltd"],
            ["Area / Location", "area", "text", "e.g. Koramangala"],
            ["Full Address", "address", "text", "e.g. 12, 5th Block, Koramangala"],
          ].map(([label, key, type, placeholder]) => (
            <div key={key}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>{label.toUpperCase()}</div>
              <input type={type} value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})}
                placeholder={placeholder}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1,
                  padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>BUSINESS TYPE</div>
            <select value={form.type} onChange={e => setForm({...form, type:e.target.value})}
              style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1,
                padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
              {["Home","Restaurant","Mess","Hotel","Bakery","Cloud Kitchen","Other"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>ASSIGN TELECALLER</div>
            <select value={form.telecaller} onChange={e => setForm({...form, telecaller:e.target.value})}
              style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1,
                padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
              {TELECALLERS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <button onClick={confirmImport} disabled={!form.name}
          style={{ background: form.name ? T.accent : T.border, border:"none", borderRadius:14,
            color: form.name ? "#FFFFFF" : T.t3, padding:"14px", fontSize:14, fontWeight:800,
            cursor: form.name ? "pointer" : "default", fontFamily:FONT }}>
          ✓ Add to CRM Pipeline
        </button>
      </div>
    );
  }

  // ── List view ──
  const numbers = hrLeads.map(r => r.contact || r[Object.keys(r)[0]] || "").filter(Boolean);
  const pending = numbers.filter(n => !imported[n] && !leads.some(l => normalizePhone(l.contact) === normalizePhone(n)));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:T.t1 }}>HR Assigned Numbers</div>
          <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>{numbers.length} total · {pending.length} pending</div>
        </div>
        {pending.length > 0 && (
          <div style={{ background:T.rose, borderRadius:20, padding:"4px 10px", fontSize:12, fontWeight:800, color:"white" }}>
            {pending.length} New
          </div>
        )}
      </div>

      {numbers.length === 0 && (
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:24, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:700, color:T.t1, marginBottom:8 }}>No Numbers Yet</div>
          <div style={{ fontSize:12, color:T.t3, lineHeight:1.7 }}>
            Ask HR to create a tab named HRLeads in the Google Sheet and add phone numbers in column A — one number per row. Any format works.
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {numbers.map((num, i) => {
          const isImported = imported[num] || leads.some(l => normalizePhone(l.contact) === normalizePhone(num));
          const normalized = normalizePhone(num);
          const existingLead = leads.find(l => normalizePhone(l.contact) === normalized);
          return (
            <div key={i} style={{ background:T.card, border:`1px solid ${isImported ? T.border : T.accentGlow}`,
              borderRadius:14, padding:"12px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:T.t1 }}>📞 {normalized}</div>
                <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>HR format: {num}</div>
                {existingLead && (
                  <div style={{ fontSize:11, color:T.accent, marginTop:3, fontWeight:600 }}>✓ {existingLead.name} · {existingLead.stage}</div>
                )}
              </div>
              {isImported ? (
                <div style={{ background:T.accentSub, border:`1px solid ${T.accentGlow}`, borderRadius:8,
                  color:T.accent, padding:"5px 12px", fontSize:11, fontWeight:700 }}>✓ Done</div>
              ) : (
                <button onClick={() => startImport(num)}
                  style={{ background:T.accent, border:"none", borderRadius:10, color:"#FFFFFF",
                    padding:"8px 14px", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:FONT }}>
                  Fill & Add
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:12, marginTop:4 }}>
        <div style={{ fontSize:11, color:T.accent, fontWeight:700, marginBottom:6 }}>Setup Guide</div>
        <div style={{ fontSize:11, color:T.t3, lineHeight:1.7 }}>
          Google Sheet tab name: HRLeads. Column A header: contact. HR enters one number per row in any format — +91 98765 43210, 091-9876543210, 9876543210 etc. Telecaller sees new numbers here and taps Fill and Add to enter details and push to CRM pipeline.
        </div>
      </div>
    </div>
  );
}


// ─── CALL LOG DIALOG ──────────────────────────────────────────────────────
// Structured call-outcome capture: did they answer? If yes, confirm/update
// their details + a note. If no, pick a reason. Both paths stamp a real
// timestamp so "last followup" and overdue reminders are accurate.
const CALL_NOT_ANSWERED_REASONS = ["No Answer", "Wrong Number", "Switched Off", "Number Busy", "Call Back Later"];

function CallLogDialog({ lead, onClose, onSubmit }) {
  const [step, setStep] = useState("ask"); // ask | answered | notAnswered
  const [name, setName] = useState(lead.name || "");
  const [business, setBusiness] = useState(lead.business || "");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState(null);

  const submitAnswered = () => onSubmit({ outcome: "Answered", name: name.trim() || lead.name, business: business.trim() || lead.business, note: note.trim() });
  const submitNotAnswered = () => { if (reason) onSubmit({ outcome: reason, name: lead.name, business: lead.business, note: "" }); };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(6,11,22,0.92)", zIndex:210, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:T.card, borderRadius:"20px 20px 0 0", padding:20, width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto", paddingBottom:36 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:800, color:T.t1 }}>📞 Log Call — {lead.name}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.t3, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>

        {step === "ask" && (
          <>
            <div style={{ fontSize:13, color:T.t2, marginBottom:16 }}>Did the customer answer the call?</div>
            <div style={{ display:"flex", gap:10 }}>
              <Btn label="✅ Answered" color={T.emerald} full onClick={() => setStep("answered")} />
              <Btn label="❌ Not Answered" color={T.rose} full onClick={() => setStep("notAnswered")} />
            </div>
          </>
        )}

        {step === "answered" && (
          <>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>CUSTOMER NAME</div>
              <input value={name} onChange={e => setName(e.target.value)}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>BUSINESS NAME</div>
              <input value={business} onChange={e => setBusiness(e.target.value)}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>CALL NOTES</div>
              <textarea value={note} onChange={e => setNote(e.target.value)}
                placeholder="What did they say?"
                style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:12, color:T.t1, fontSize:13, resize:"none", outline:"none", boxSizing:"border-box", height:72, fontFamily:FONT }} />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <Btn label="← Back" color={T.t2} ghost full onClick={() => setStep("ask")} />
              <Btn label="✓ Save" full color={T.accent} onClick={submitAnswered} />
            </div>
          </>
        )}

        {step === "notAnswered" && (
          <>
            <div style={{ fontSize:11, color:T.t3, fontWeight:700, marginBottom:10 }}>WHY NOT ANSWERED?</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
              {CALL_NOT_ANSWERED_REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  style={{
                    padding:"10px 12px", borderRadius:10, textAlign:"left", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:FONT,
                    border:`1px solid ${reason===r ? T.accent : T.border}`,
                    background: reason===r ? T.accentSub : T.surface,
                    color: reason===r ? T.accent : T.t1,
                  }}>{r}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <Btn label="← Back" color={T.t2} ghost full onClick={() => setStep("ask")} />
              <Btn label="✓ Save" full color={T.accent} onClick={submitNotAnswered} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Leads() {
  const [leads, setLeads, leadsSyncStatus] = useSheetSynced("leads", "leads", INITIAL_LEADS);
  const [expenses, setExpenses] = useSheetSynced("expenses", "expenses", INITIAL_EXPENSES);
  const [repeatCustomers, setRepeatCustomers] = useSheetSynced("repeatCustomers", "repeatCustomers", []);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [remark, setRemark] = useState("");
  const [showWAForLead, setShowWAForLead] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [deliveryDialog, setDeliveryDialog] = useState(null); // { lead, targetStage }
  const [porterAmt, setPorterAmt] = useState("");
  const [kgQty, setKgQty] = useState("");
  const [groupMsg, setGroupMsg] = useState(null); // { lead, stage, method }
  const [newLead, setNewLead] = useState({ name:"", contact:"", business:"", type:"Restaurant", area:"", address:"", source:"Instagram", telecaller:"Thulasi" });
  const [newLeadToast, setNewLeadToast] = useState(null);
  const [callLogFor, setCallLogFor] = useState(null);
  const seenLeadIds = useRef(null);

  // ── Keyword search + bulk download / bulk message ──
  // Type ANY word (e.g. "home") and every lead that has it anywhere — name,
  // business, area, address, type, source, stage, telecaller, contact or any
  // remark — is listed. Separate several words with commas to match any of
  // them ("home, mess"). Then bulk-select and download or message them.
  const [showKwExport, setShowKwExport] = useState(false);
  const [kwQuery, setKwQuery] = useState("");
  const [kwWholeWord, setKwWholeWord] = useState(false);
  const [kwMsgText, setKwMsgText] = useState("Hi {name}, this is Sridhi Ventures — ");
  const [kwSelectedIds, setKwSelectedIds] = useState(() => new Set());
  const remarkStr = (r) => typeof r === "string" ? r : (r && r.text) || "";
  const kwTerms = useMemo(
    () => kwQuery.split(",").map(t => t.trim().toLowerCase()).filter(Boolean),
    [kwQuery]
  );
  const kwMatches = useMemo(() => {
    if (!kwTerms.length) return [];
    const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRes = kwWholeWord ? kwTerms.map(t => new RegExp("(^|[^a-z0-9])" + escape(t) + "([^a-z0-9]|$)", "i")) : null;
    return leads.filter(l => {
      if (!l) return false;
      const hay = [
        l.name, l.business, l.area, l.address, l.type, l.source, l.stage,
        l.telecaller, l.contact, l.priority,
        ...(Array.isArray(l.remarks) ? l.remarks.map(remarkStr) : [])
      ].filter(Boolean).join(" \n ").toLowerCase();
      return kwWholeWord ? wordRes.some(re => re.test(hay)) : kwTerms.some(t => hay.includes(t));
    });
  }, [leads, kwTerms, kwWholeWord]);
  const kwKey = (l) => l.contact || l.id;
  const kwTargets = useMemo(() => {
    const base = kwSelectedIds.size ? kwMatches.filter(l => kwSelectedIds.has(kwKey(l))) : kwMatches;
    return base.filter(l => phoneKey(l.contact).length >= 10);
  }, [kwMatches, kwSelectedIds]);
  const kwSelectedVisible = kwMatches.filter(l => kwSelectedIds.has(kwKey(l))).length;
  const toggleKwSelected = (key) => setKwSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const kwSelectAll = () => setKwSelectedIds(new Set(kwMatches.map(kwKey)));
  const kwClearSel = () => setKwSelectedIds(new Set());
  const kwFileTag = () => {
    const w = kwTerms.join("-").replace(/[^a-z0-9-]+/gi, "_").slice(0, 30) || "keyword";
    return `${w}_${new Date().toISOString().slice(0, 10)}`;
  };
  const exportKwContactsVCF = () => {
    if (!kwTargets.length) { alert("No matching contacts with a phone number."); return; }
    const vcf = kwTargets.map(l => {
      const num = "+91" + phoneKey(l.contact);
      const addr = [l.address, l.area].filter(Boolean).join(", ");
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${(l.name || "Unnamed").replace(/\r?\n/g, " ")}\nTEL;TYPE=CELL:${num}\nADR:;;${addr.replace(/,/g, "\\,")};;;;\nEND:VCARD`;
    }).join("\n");
    const blob = new Blob([vcf], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `Contacts_${kwFileTag()}.vcf`; a.click();
    URL.revokeObjectURL(url);
  };
  const exportKwContactsExcel = () => {
    if (!kwTargets.length) { alert("No matching contacts with a phone number."); return; }
    const data = kwTargets.map(l => ({ "Name": l.name, "Business": l.business || "", "Contact": "+91" + phoneKey(l.contact), "Area": l.area || "", "Type": l.type || "", "Stage": l.stage || "", "Telecaller": l.telecaller || "" }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, `Contacts_${kwFileTag()}.xlsx`);
  };
  const copyKwNumbers = () => {
    if (!kwTargets.length) { alert("No matching contacts with a phone number."); return; }
    const list = kwTargets.map(l => "+91" + phoneKey(l.contact)).join("\n");
    navigator.clipboard?.writeText(list).then(
      () => alert(`Copied ${kwTargets.length} number${kwTargets.length === 1 ? "" : "s"} to clipboard.`),
      () => alert("Couldn't copy — your browser blocked clipboard access.")
    );
  };
  const kwMessageFor = (l) => kwMsgText.replace(/\{name\}/gi, l.name || "there");
  const sendKwOne = (l) => window.open(`https://wa.me/91${phoneKey(l.contact)}?text=${encodeURIComponent(kwMessageFor(l))}`, "_blank", "noopener");

  // ── Pop in a small toast whenever a lead appears that we haven't seen before ──
  useEffect(() => {
    const ids = leads.map(l => l.contact || l.id).filter(Boolean);
    let isFirstEver = false;
    if (seenLeadIds.current === null) {
      // First mount — load baseline from localStorage (persists across tab switches/remounts).
      // Only treat as "nothing to compare" if there's truly no stored baseline yet.
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem("bos_seen_lead_ids") || "null"); } catch {}
      if (stored && Array.isArray(stored)) {
        seenLeadIds.current = new Set(stored);
      } else {
        seenLeadIds.current = new Set(ids);
        isFirstEver = true;
      }
    }
    if (isFirstEver) {
      try { localStorage.setItem("bos_seen_lead_ids", JSON.stringify(ids)); } catch {}
      return;
    }
    const fresh = leads.find(l => (l.contact || l.id) && !seenLeadIds.current.has(l.contact || l.id));
    if (fresh) {
      setNewLeadToast(fresh);
      const t = setTimeout(() => setNewLeadToast(null), 6000);
      ids.forEach(id => seenLeadIds.current.add(id));
      try { localStorage.setItem("bos_seen_lead_ids", JSON.stringify([...seenLeadIds.current])); } catch {}
      return () => clearTimeout(t);
    } else {
      ids.forEach(id => seenLeadIds.current.add(id));
      try { localStorage.setItem("bos_seen_lead_ids", JSON.stringify([...seenLeadIds.current])); } catch {}
    }
  }, [leads]);

  const overdueCount = leads.filter(isFollowUpOverdue).length;

  const filtered = leads.filter(l =>
    l && l.name && l.stage &&
    (filterStage==="All" ? true : filterStage==="Needs Follow-up" ? isFollowUpOverdue(l) : l.stage===filterStage) &&
    (l.name.toLowerCase().includes(search.toLowerCase()) ||
     (l.area||"").toLowerCase().includes(search.toLowerCase()) ||
     (l.contact||"").includes(search))
  );

  const addRemark = (id, role) => {
    if (!remark.trim()) return;
    const now = new Date();
    const stamp = now.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}) + " " + now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});
    const remarkWithStamp = "[" + stamp + " · " + (role||"Team") + "] " + remark.trim();
    setLeads(leads.map(l => ((l.contact && l.contact===id) || l.id===id) ? { ...l, remarks:[...(l.remarks||[]),remarkWithStamp], lastContact:"Today", lastContactAt:Date.now() } : l));
    setRemark("");
  };

  // ── Structured call outcome logging ──
  const logCall = (lead, result) => {
    const now = new Date();
    const stamp = now.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}) + " " + now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});
    const remarkText = "[" + result.outcome + "]" + (result.note ? " " + result.note : "");
    const remarkWithStamp = "[" + stamp + " · " + (lead.telecaller||"Team") + "] " + remarkText;
    setLeads(leads.map(l => l.id===lead.id ? {
      ...l,
      name: result.name || l.name,
      business: result.business || l.business,
      remarks: [...(l.remarks||[]), remarkWithStamp],
      lastContact: "Today",
      lastContactAt: Date.now(),
      callOutcome: result.outcome,
      stage: result.outcome === "Call Back Later" ? "Callback Requested" : l.stage,
    } : l));
    setCallLogFor(null);
  };

  const updateStage = (key, stage) => {
    const lead = leads.find(l => (l.contact && l.contact===key) || l.id===key);
    if ((stage === "Sample Requested" || stage === "Order Received") && lead) {
      setDeliveryDialog({ lead, targetStage: stage });
      setPorterAmt("");
      setKgQty("");
    } else {
      setLeads(leads.map(l => {
        const match = (l.contact && l.contact===key) || l.id===key;
        return match ? { ...l, stage, lastContact:"Today", lastContactAt:Date.now() } : l;
      }));
    }
  };

  const confirmDelivery = (method) => {
    if (!deliveryDialog) return;
    const { lead, targetStage } = deliveryDialog;
    const isOrder = targetStage === "Order Received";
    const newOrderCount = (lead.orderCount || 0) + (isOrder ? 1 : 0);
    // More than 3 orders → auto-promote to a repeat customer instead of staying in the one-off pipeline.
    const promoteToRepeat = isOrder && newOrderCount > 3;
    const finalStage = promoteToRepeat ? "Active Customer" : targetStage;
    // Update lead stage — also actually save the KG entered here (previously only used in the WhatsApp message text)
    setLeads(leads.map(l => l.id===lead.id ? {
      ...l,
      stage: finalStage,
      lastContact: "Today",
      lastContactAt: Date.now(),
      orderCount: newOrderCount,
      kgQty: kgQty ? Number(kgQty) : l.kgQty,
    } : l));
    // Log expense if Porter
    if (method === "porter" && porterAmt) {
      const newExp = {
        id: expenses.length + Date.now(),
        category: "Porter Delivery — " + lead.name,
        amount: parseInt(porterAmt) || 0,
        date: todayISO(),
        type: "Delivery",
        subtype: "Porter"
      };
      setExpenses([newExp, ...expenses]);
    }
    if (promoteToRepeat) {
      const alreadyRepeat = (repeatCustomers||[]).some(c => c.contact === lead.contact);
      if (!alreadyRepeat) {
        const todayStr = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
        setRepeatCustomers([{
          id: Date.now(),
          name: lead.name,
          area: lead.area || "",
          contact: lead.contact,
          product: "Dosa Batter",
          qty: parseInt(kgQty) || 0,
          frequency: "Weekly",
          status: "Upcoming",
          lastOrder: todayStr,
          nextDue: todayStr,
          revenue: 0,
        }, ...(repeatCustomers||[])]);
      }
    }
    setGroupMsg({ lead, targetStage: finalStage, method, kgQty });
    setDeliveryDialog(null);
    setPorterAmt("");
    setKgQty("");
  };
  const addLead = () => {
    if (!newLead.name || !newLead.contact) return;
    setLeads([{ ...newLead, id:leads.length+1, stage:"New Lead", lastContact:"Today", lastContactAt:Date.now(), createdAt:Date.now(), orderCount:0, priority:"Medium", remarks:[] }, ...leads]);
    setShowAdd(false);
    setNewLead({ name:"", contact:"", business:"", type:"Restaurant", area:"", address:"", source:"Instagram", telecaller:"Priya" });
  };

  // ── Group WhatsApp message ──
  function buildGroupMsg(lead, targetStage, method, customMsg) {
    const time = new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});
    const date = new Date().toLocaleDateString("en-IN",{weekday:"short",day:"2-digit",month:"short"});
    if (targetStage === "Sample Requested") {
      return customMsg || (
        "🧪 *Sample Dispatched*\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "👤 Customer: " + lead.name + "\n" +
        "📍 Area: " + (lead.area||"-") + "\n" +
        (kgQty ? "⚖️ Quantity: " + kgQty + " KG\n" : "") +
        "🚚 Via: " + (method === "porter" ? "Porter" : "Company Vehicle") + "\n" +
        "🕐 Time: " + time + " · " + date + "\n" +
        "👩 Telecaller: " + (lead.telecaller||"Team") + "\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "Sridhi Ventures 🌿"
      );
    } else {
      return customMsg || (
        "🎉 *Order Confirmed!*\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "👤 Customer: " + lead.name + "\n" +
        "📍 Area: " + (lead.area||"-") + "\n" +
        "🏪 Business: " + (lead.business||lead.name) + "\n" +
        (kgQty ? "⚖️ Quantity: " + kgQty + " KG\n" : "") +
        "🚚 Delivery: " + (method === "porter" ? "Porter" : "Company Vehicle") + "\n" +
        "🕐 Time: " + time + " · " + date + "\n" +
        "👩 Telecaller: " + (lead.telecaller||"Team") + "\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "Sridhi Ventures 🌿"
      );
    }
  }

  // ── Overlays (render on top of whatever view is active) ──
  const renderDeliveryOverlay = () => {
    if (!deliveryDialog) return null;
    const { lead, targetStage } = deliveryDialog;
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(6,11,22,0.92)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
        <div style={{ background:T.card, borderRadius:"20px 20px 0 0", padding:20, width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto", paddingBottom:36 }}>
          <div style={{ fontSize:15, fontWeight:800, color:T.t1, marginBottom:4 }}>
            {targetStage === "Sample Requested" ? "🧪 Sample Delivery" : "📦 Order Delivery"}
          </div>
          <div style={{ fontSize:12, color:T.t3, marginBottom:20 }}>
            Moving <b style={{color:T.t1}}>{lead.name}</b> → <b style={{color:T.accent}}>{targetStage}</b>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:6 }}>QUANTITY (KG)</div>
            <input type="number" value={kgQty} onChange={e => setKgQty(e.target.value)}
              placeholder="Enter KG e.g. 10"
              style={{ background:T.surface, border:`1px solid ${T.accentGlow}`, borderRadius:10,
                color:T.t1, padding:"10px 12px", fontSize:15, fontFamily:FONT,
                outline:"none", width:"100%", boxSizing:"border-box", fontWeight:700 }} />
          </div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:700, marginBottom:12 }}>SELECT DELIVERY METHOD</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ background:T.surface, border:`1px solid ${T.borderHi}`, borderRadius:14, padding:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ fontSize:24 }}>🛵</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:T.t1 }}>Porter</div>
                  <div style={{ fontSize:11, color:T.t3 }}>3rd party delivery — cost logged as expense</div>
                </div>
              </div>
              <input type="number" value={porterAmt} onChange={e => setPorterAmt(e.target.value)}
                placeholder="Enter Porter cost (₹)"
                style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10,
                  color:T.t1, padding:"10px 12px", fontSize:14, fontFamily:FONT,
                  outline:"none", width:"100%", boxSizing:"border-box", marginBottom:10 }} />
              <button onClick={() => confirmDelivery("porter")} disabled={!porterAmt}
                style={{ background: porterAmt ? T.amber : T.border, border:"none", borderRadius:12,
                  color: porterAmt ? "#FFFFFF" : T.t3, padding:"12px", fontSize:13, fontWeight:800,
                  cursor: porterAmt ? "pointer" : "default", fontFamily:FONT, width:"100%" }}>
                🛵 Confirm Porter — ₹{porterAmt || "0"} (logged to expenses)
              </button>
            </div>
            <div style={{ background:T.surface, border:`1px solid ${T.borderHi}`, borderRadius:14, padding:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ fontSize:24 }}>🚗</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:T.t1 }}>Company Vehicle</div>
                  <div style={{ fontSize:11, color:T.t3 }}>Own vehicle — no delivery cost logged</div>
                </div>
              </div>
              <button onClick={() => confirmDelivery("company")}
                style={{ background:T.emerald, border:"none", borderRadius:12,
                  color:"#FFFFFF", padding:"12px", fontSize:13, fontWeight:800,
                  cursor:"pointer", fontFamily:FONT, width:"100%" }}>
                🚗 Confirm Company Vehicle
              </button>
            </div>
            <button onClick={() => setDeliveryDialog(null)}
              style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:12,
                color:T.t3, padding:"10px", fontSize:12, cursor:"pointer", fontFamily:FONT }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (groupMsg) {
    return <GroupMsgDialog groupMsg={groupMsg} buildGroupMsg={buildGroupMsg} onClose={() => setGroupMsg(null)} />;
  }

  if (selected) {
    const lead = leads.find(l => (l.contact && l.contact===selected) || l.id===selected);
    if (!lead) return null;
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <button onClick={() => setSelected(null)}
          style={{ background:"none", border:"none", color:T.accent, fontSize:13, cursor:"pointer", padding:0, textAlign:"left", fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
          ← Back to leads
        </button>
        {showEdit ? (
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <Label>Edit Lead Details</Label>
              <button onClick={() => setShowEdit(false)}
                style={{ background:"none", border:"none", color:T.t3, fontSize:18, cursor:"pointer" }}>✕</button>
            </div>
            {[
              ["Customer Name", "name", "text"],
              ["Business Name", "business", "text"],
              ["Contact Number", "contact", "tel"],
              ["Area", "area", "text"],
              ["Full Address", "address", "text"],
            ].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>{label.toUpperCase()}</div>
                <input type={type} value={editForm[key]||""} onChange={e => setEditForm({...editForm,[key]:e.target.value})}
                  style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1,
                    padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>BUSINESS TYPE</div>
              <select value={editForm.type||""} onChange={e => setEditForm({...editForm,type:e.target.value})}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
                {["Home","Restaurant","Mess","Hotel","Bakery","Cloud Kitchen","Catering","Other"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>ASSIGN TELECALLER</div>
              <select value={editForm.telecaller||""} onChange={e => setEditForm({...editForm,telecaller:e.target.value})}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
                {TELECALLERS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>PRIORITY</div>
              <select value={editForm.priority||""} onChange={e => setEditForm({...editForm,priority:e.target.value})}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
                {["High","Medium","Low"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <Btn label="✓ Save Changes" full color={T.accent} onClick={() => {
              setLeads(leads.map(l => ((l.contact && l.contact===(lead.contact||lead.id)) || l.id===lead.id) ? { ...l, ...editForm } : l));
              setShowEdit(false);
            }} />
          </Card>
        ) : (
        <Card accent={getStageColor(lead.stage)}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:T.t1, letterSpacing:"-0.02em" }}>{lead.name}</div>
              <div style={{ fontSize:12, color:T.t2, marginTop:2 }}>{lead.business}</div>
              <div style={{ fontSize:11, color:T.t3, marginTop:1 }}>{lead.type} · {lead.area}</div>
            </div>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <button onClick={() => { setEditForm({...lead}); setShowEdit(true); }}
                style={{ background:T.accentSub, border:`1px solid ${T.accentGlow}`, borderRadius:8,
                  color:T.accent, padding:"5px 10px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
                ✏️ Edit
              </button>
              <Chip label={lead.priority+" Priority"} color={getPriorityColor(lead.priority)} />
            </div>
          </div>
          <Chip label={lead.stage} color={getStageColor(lead.stage)} />
          <div style={{ marginTop:16 }}>
            {[["Contact",lead.contact],["Address",lead.address||lead.area],["Source",lead.source],["Telecaller",lead.telecaller],["Last contact",formatLastContact(lead.lastContactAt, lead.lastContact)]].map(([k,v]) => (
              <div key={k} style={{ display:"flex", padding:"9px 0", borderBottom:`1px solid ${T.border}` }}>
                <span style={{ fontSize:11, color:T.t3, width:100, flexShrink:0, fontWeight:600 }}>{k}</span>
                <span style={{ fontSize:12, fontWeight:600, color: k==="Last contact" && isFollowUpOverdue(lead) ? T.rose : T.t1 }}>{k==="Last contact" && isFollowUpOverdue(lead) ? "⏰ " : ""}{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <Btn label="📞 Call" color={T.emerald} ghost full onClick={() => {
              const phone = (lead.contact||"").replace(/[^0-9]/g,"");
              if (phone) window.location.href = "tel:+" + (phone.startsWith("91") ? phone : "91"+phone);
            }} />
            <Btn label="💬 WhatsApp" color={T.accent} ghost full onClick={() => {
              setShowWAForLead(lead);
            }} />
          </div>
          <div style={{ marginTop:8 }}>
            <Btn label="📝 Log Call Outcome" color={T.indigo} full onClick={() => setCallLogFor(lead)} />
          </div>
        </Card>
        )}

        {showWAForLead && (
          <WATemplatePicker lead={showWAForLead} onClose={() => setShowWAForLead(null)} />
        )}

        <Card>
          <Label>Update Stage</Label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {PIPELINE_STAGES.map(s => (
              <button key={s.id} onClick={() => updateStage(lead.contact || lead.id, s.id)}
                style={{
                  padding:"5px 10px", borderRadius:7, cursor:"pointer", fontSize:10, fontWeight:700,
                  border:`1px solid ${lead.stage===s.id ? s.color : T.border}`,
                  background: lead.stage===s.id ? s.color+"1A" : "transparent",
                  color: lead.stage===s.id ? s.color : T.t2, fontFamily:FONT,
                }}>{s.id}</button>
            ))}
          </div>
        </Card>

        <Card>
          <Label sub={`${(lead.remarks||[]).length} entries`}>Remarks</Label>
          {(lead.remarks||[]).length===0 && <div style={{ fontSize:12, color:T.t3, marginBottom:12 }}>No remarks yet.</div>}
          {(lead.remarks||[]).slice().reverse().map((r,i) => {
            const match = r.match(/^\[(.+?) · (.+?)\] (.+)$/);
            const timestamp = match ? match[1] : null;
            const who = match ? match[2] : null;
            const text = match ? match[3] : r;
            return (
              <div key={i} style={{
                background:T.surface, borderRadius:10, padding:"10px 12px", marginBottom:8,
                borderLeft:`3px solid ${T.accent}`,
              }}>
                {timestamp && (
                  <div style={{ display:"flex", gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:10, color:T.accent, fontWeight:700 }}>🕐 {timestamp}</span>
                    <span style={{ fontSize:10, color:T.t3 }}>·</span>
                    <span style={{ fontSize:10, color:T.indigo, fontWeight:600 }}>👤 {who}</span>
                  </div>
                )}
                <div style={{ fontSize:12, color:T.t1, lineHeight:1.5 }}>{text}</div>
              </div>
            );
          })}
          <textarea value={remark} onChange={e => setRemark(e.target.value)}
            placeholder="Add a remark..."
            style={{
              width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:12,
              padding:12, color:T.t1, fontSize:13, resize:"none", outline:"none",
              boxSizing:"border-box", height:72, fontFamily:FONT,
            }} />
          <div style={{ marginTop:8 }}><Btn label="Save Remark" full onClick={() => addRemark(lead.id, lead.telecaller)} /></div>
        </Card>
        {callLogFor && <CallLogDialog lead={callLogFor} onClose={() => setCallLogFor(null)} onSubmit={(result) => logCall(callLogFor, result)} />}
        {renderDeliveryOverlay()}
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {newLeadToast && (
        <div onClick={() => { setSelected(newLeadToast.contact || newLeadToast.id); setNewLeadToast(null); }}
          style={{
            position:"fixed", top:14, left:"50%", transform:"translateX(-50%)",
            width:"calc(100% - 32px)", maxWidth:420, zIndex:999, cursor:"pointer",
            background:T.card, border:`1px solid ${T.emerald}55`, borderRadius:16,
            boxShadow:"0 10px 30px rgba(15,23,42,0.18)", padding:"12px 14px",
            display:"flex", alignItems:"center", gap:12,
          }}>
          <div style={{ width:38, height:38, borderRadius:10, background:T.emerald+"1c", display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, flexShrink:0 }}>🎉</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12.5, fontWeight:800, color:T.t1 }}>New lead: {newLeadToast.name}</div>
            <div style={{ fontSize:11, color:T.t3, marginTop:1 }}>{newLeadToast.area || newLeadToast.source || "Tap to view and call"}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); const p=(newLeadToast.contact||"").replace(/[^0-9]/g,""); if(p) window.location.href="tel:+91"+p; }}
            style={{ background:T.emerald, border:"none", borderRadius:10, color:"#FFFFFF", width:34, height:34, fontSize:15, cursor:"pointer", flexShrink:0 }}>📞</button>
        </div>
      )}
      {overdueCount > 0 && (
        <div onClick={() => setFilterStage("Needs Follow-up")}
          style={{
            background:T.rose+"14", border:`1px solid ${T.rose}44`, borderRadius:14,
            padding:"10px 14px", display:"flex", alignItems:"center", gap:10, cursor:"pointer",
          }}>
          <div style={{ fontSize:18 }}>⏰</div>
          <div style={{ fontSize:12, fontWeight:700, color:T.rose }}>
            {overdueCount} lead{overdueCount!==1?"s":""} need{overdueCount===1?"s":""} follow-up — no contact in over {FOLLOWUP_OVERDUE_DAYS} days
          </div>
        </div>
      )}
      <div style={{ display:"flex", gap:8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, area, contact…"
          style={{ ...inputStyle, flex:1 }} />
        <button onClick={() => setShowAdd(true)} style={{
          background:T.accent, color:"#FFFFFF", border:"none",
          borderRadius:12, width:42, height:42, fontWeight:800, fontSize:20, cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        }}>+</button>
      </div>

      <button onClick={() => { setKwSelectedIds(new Set()); if (!kwQuery && search.trim()) setKwQuery(search.trim()); setShowKwExport(true); }} style={{
        display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
        background:T.emerald+"14", border:`1px solid ${T.emerald}44`, borderRadius:12,
        padding:"10px 14px", cursor:"pointer", fontFamily:FONT, textAlign:"left",
      }}>
        <span style={{ fontSize:12, fontWeight:700, color:T.emerald }}>
          🔎 Keyword search — bulk download contacts / bulk message
        </span>
        <span style={{ fontSize:11, fontWeight:800, color:T.emerald }}>📇 Open →</span>
      </button>

      <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4 }}>
        {["All","Needs Follow-up","New Lead","Interested","Sample Requested","Positive Feedback","Negotiation","Order Received","Active Customer","Lost Customer"].map(s => {
          const active = filterStage===s;
          const col = s==="All" ? T.accent : s==="Needs Follow-up" ? T.rose : getStageColor(s);
          return (
            <button key={s} onClick={() => setFilterStage(s)}
              style={{
                padding:"5px 12px", borderRadius:8, whiteSpace:"nowrap",
                border:`1px solid ${active ? col : T.border}`,
                background: active ? col+"1A" : "transparent",
                color: active ? col : T.t2,
                fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT,
              }}>{s==="All" ? `All (${leads.length})` : s==="Needs Follow-up" ? `⏰ Follow-up (${overdueCount})` : s}</button>
          );
        })}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:11, color:T.t3, fontWeight:500 }}>{filtered.length} lead{filtered.length!==1?"s":""}</span>
        <SyncBadge status={leadsSyncStatus} />
      </div>

      {filtered.map(lead => {
        const overdue = isFollowUpOverdue(lead);
        const stageColor = getStageColor(lead.stage);
        return (
        <div key={lead.contact || lead.id} onClick={() => setSelected(lead.contact || lead.id)}
          style={{
            background:T.card, border:`1px solid ${overdue ? T.rose+"55" : T.border}`,
            borderRadius:16, padding:16, cursor:"pointer",
            borderLeft:`4px solid ${stageColor}`,
            transition:"background 0.15s",
          }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:11, gap:10 }}>
            <div style={{ display:"flex", gap:11, alignItems:"flex-start", minWidth:0 }}>
              <div style={{
                width:42, height:42, borderRadius:12, flexShrink:0,
                background:stageColor+"1F", border:`1px solid ${stageColor}40`,
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
              }}>{leadTypeIcon(lead.type)}</div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:14.5, fontWeight:700, color:T.t1 }}>{lead.name}</div>
                <div style={{ fontSize:11, color:T.t3, marginTop:2, fontWeight:500 }}>{lead.type} · {lead.area}</div>
                <div style={{ marginTop:7 }}><Chip label={lead.stage} color={stageColor} /></div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0 }}>
              <Chip label={lead.priority} color={getPriorityColor(lead.priority)} />
              <span style={{ fontSize:10.5, color:T.t3, fontWeight:600, whiteSpace:"nowrap" }}>{lead.contact}</span>
              <span style={{ fontSize:10.5, color: overdue ? T.rose : T.t3, fontWeight: overdue ? 700 : 500, whiteSpace:"nowrap" }}>{overdue ? "⏰ " : ""}{formatLastContact(lead.lastContactAt, lead.lastContact)}</span>
            </div>
          </div>
          {lead.remarks?.length>0 && (
            <div style={{ marginBottom:11, fontSize:11, color:T.t2, background:T.surface, borderRadius:8, padding:"7px 10px", lineHeight:1.5 }}>
              {lead.remarks[lead.remarks.length-1]}
            </div>
          )}
          <div style={{ display:"flex", gap:8 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { const p=(lead.contact||"").replace(/[^0-9]/g,""); if(p) window.location.href="tel:+91"+p; }}
              style={{
                flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                background:T.emerald+"14", border:`1px solid ${T.emerald}33`, borderRadius:10,
                color:T.emerald, padding:"10px 0", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT,
              }}>📞 Call</button>
            <button onClick={() => setCallLogFor(lead)}
              style={{
                flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                background:T.indigo+"14", border:`1px solid ${T.indigo}33`, borderRadius:10,
                color:T.indigo, padding:"10px 0", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT,
              }}>📝 Log Call</button>
            <select value={lead.stage} onChange={e => updateStage(lead.contact || lead.id, e.target.value)}
              style={{
                flex:1.4, background:stageColor+"14", border:`1px solid ${stageColor}33`, borderRadius:10,
                color:stageColor, padding:"10px 6px", fontSize:12, fontWeight:700, cursor:"pointer",
                fontFamily:FONT, appearance:"none", textAlign:"center",
              }}>
              {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
          </div>
        </div>
        );
      })}

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="New Lead">
        <Field label="Customer Name *" value={newLead.name} onChange={e => setNewLead({...newLead,name:e.target.value})} />
        <Field label="Contact *" value={newLead.contact} onChange={e => setNewLead({...newLead,contact:e.target.value})} type="tel" />
        <Field label="Business Name" value={newLead.business} onChange={e => setNewLead({...newLead,business:e.target.value})} />
        <Field label="Area" value={newLead.area} onChange={e => setNewLead({...newLead,area:e.target.value})} />
        <Field label="Address" value={newLead.address} onChange={e => setNewLead({...newLead,address:e.target.value})} />
        <Dropdown label="Business Type" value={newLead.type} onChange={e => setNewLead({...newLead,type:e.target.value})} options={["Home","Restaurant","Mess","Hotel","Bakery","Cloud Kitchen","Distributor","Retailer"]} />
        <Dropdown label="Lead Source" value={newLead.source} onChange={e => setNewLead({...newLead,source:e.target.value})} options={["Instagram","Facebook","WhatsApp","Google","Referral","Field Sales","Telecalling"]} />
        <Dropdown label="Assigned Telecaller" value={newLead.telecaller} onChange={e => setNewLead({...newLead,telecaller:e.target.value})} options={TELECALLERS} />
        <div style={{ display:"flex", gap:10, marginTop:4 }}>
          <Btn label="Cancel" color={T.t2} ghost full onClick={() => setShowAdd(false)} />
          <Btn label="Add Lead" full onClick={addLead} />
        </div>
      </Sheet>

      <Sheet open={showKwExport} onClose={() => setShowKwExport(false)} title="🔎 Keyword Search & Bulk Download">
        <input value={kwQuery} onChange={e => { setKwQuery(e.target.value); setKwSelectedIds(new Set()); }}
          placeholder='Type a keyword, e.g. home  (comma for several: home, mess)'
          autoFocus
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.t2, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={kwWholeWord} onChange={e => setKwWholeWord(e.target.checked)} />
          Whole word only (so "home" won't match "homeland")
        </label>
        <div style={{ fontSize: 12, color: T.t3, marginBottom: 12, lineHeight: 1.5 }}>
          {!kwTerms.length
            ? "Type a word above — every lead with that word in its name, business, area, address, type, source, stage or any remark will be listed."
            : kwSelectedIds.size
              ? `${kwSelectedVisible} selected of ${kwMatches.length} match${kwMatches.length === 1 ? "" : "es"} — downloads use the ${kwTargets.length} selected with a phone number.`
              : `${kwMatches.length} lead${kwMatches.length === 1 ? "" : "s"} match — ${kwTargets.length} with a phone number. Downloads use ALL matches unless you tick specific ones.`}
        </div>
        {kwTerms.length > 0 && kwMatches.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Btn label={`☑️ Select All (${kwMatches.length})`} ghost onClick={kwSelectAll} />
            <Btn label="Clear Selection" ghost onClick={kwClearSel} />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <Btn label="⬇️ Download Contacts (vCard)" ghost onClick={exportKwContactsVCF} />
          <Btn label="⬇️ Download Excel" ghost onClick={exportKwContactsExcel} />
          <Btn label="📋 Copy Numbers" ghost onClick={copyKwNumbers} />
        </div>
        <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>
          Message (use {"{name}"} to personalize)
        </div>
        <textarea value={kwMsgText} onChange={e => setKwMsgText(e.target.value)} rows={4}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 13, fontFamily: FONT, outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 14 }} />
        <div style={{ fontSize: 11, color: T.t3, marginBottom: 8, lineHeight: 1.4 }}>
          WhatsApp doesn't allow a true one-tap "send to everyone" from outside
          its own app — tap <b style={{ color: T.t1 }}>Send</b> next to each name
          to open WhatsApp with the message ready to go.
        </div>
        <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
          {kwTerms.length > 0 && kwMatches.length === 0 && <div style={{ padding: 14, fontSize: 12, color: T.t3, textAlign: "center" }}>No leads contain "{kwQuery.trim()}".</div>}
          {!kwTerms.length && <div style={{ padding: 14, fontSize: 12, color: T.t3, textAlign: "center" }}>Matching leads will appear here.</div>}
          {kwMatches.map((l, i) => {
            const key = kwKey(l);
            const hasPhone = phoneKey(l.contact).length >= 10;
            return (
              <div key={key || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: i < kwMatches.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <input type="checkbox" checked={kwSelectedIds.has(key)} onChange={() => toggleKwSelected(key)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
                  <div style={{ fontSize: 10.5, color: T.t3 }}>{l.contact || "No number"}{l.area ? " · " + l.area : ""}{l.type ? " · " + l.type : ""}</div>
                </div>
                <button onClick={() => sendKwOne(l)} disabled={!hasPhone} style={{ background: hasPhone ? "#25D36622" : T.surface, border: `1px solid ${hasPhone ? "#25D36644" : T.border}`, borderRadius: 8, color: hasPhone ? "#25D366" : T.t3, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: hasPhone ? "pointer" : "default", fontFamily: FONT, flexShrink: 0 }}>💬 Send</button>
              </div>
            );
          })}
        </div>
      </Sheet>

      {renderDeliveryOverlay()}
      {callLogFor && <CallLogDialog lead={callLogFor} onClose={() => setCallLogFor(null)} onSubmit={(result) => logCall(callLogFor, result)} />}
    </div>
  );
}

// ─── PIPELINE ─────────────────────────────────────────────────────────────
function Pipeline() {
  const [allLeads, setAllLeads] = useSheetSynced("leads", "leads", INITIAL_LEADS);
  const [expanded, setExpanded] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [remark, setRemark] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Filter out blank rows from Google Sheet
  const leads = (allLeads || []).filter(l => l && l.name && l.stage);

  // Build live stage counts from real leads
  const stageCounts = {};
  leads.forEach(l => { stageCounts[l.stage] = (stageCounts[l.stage]||0) + 1; });
  const stages = PIPELINE_STAGES.map(s => ({ ...s, count: stageCounts[s.id]||0 }));
  const total = leads.length;
  const [exporting, setExporting] = useState(false);

  // ── Excel export (styled HTML table, opens natively in Excel) ──
  const downloadPipelineExcel = () => {
    setExporting(true);
    const today = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    const rowsHtml = PIPELINE_STAGES.map(stage => {
      const stageLeads = leads.filter(l => l.stage === stage.id);
      if (stageLeads.length === 0) return "";
      return stageLeads.map((l,i) => `
        <tr>
          ${i===0 ? `<td rowspan="${stageLeads.length}" style="background:${stage.color};color:#fff;font-weight:bold;text-align:center;vertical-align:middle;">${stage.id}</td>` : ""}
          <td>${l.name||""}</td>
          <td>${l.business||""}</td>
          <td>${l.contact||""}</td>
          <td>${l.area||""}</td>
          <td>${l.type||""}</td>
          <td>${l.telecaller||""}</td>
          <td style="font-weight:bold;color:${l.priority==="High"?"#F43F5E":l.priority==="Medium"?"#F59E0B":"#7B9DC4"}">${l.priority||"Medium"}</td>
          <td>${l.lastContact||""}</td>
          <td>${l.source||""}</td>
          <td>${(l.remarks&&l.remarks.length) ? l.remarks[l.remarks.length-1].replace(/^\[.+?\]\s*/,"") : ""}</td>
        </tr>`).join("");
    }).join("");

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8"/>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Pipeline</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  table { border-collapse:collapse; font-family:Calibri,Arial,sans-serif; font-size:11pt; }
  th { background:#060B16; color:#00C9A7; padding:10px 12px; text-align:left; border:1px solid #060B16; text-transform:uppercase; font-size:9pt; }
  td { padding:8px 12px; border:1px solid #d9e2f0; }
  tr:nth-child(even) td { background:#f4f8ff; }
  .title { font-size:20pt; font-weight:bold; color:#00C9A7; }
  .subtitle { font-size:10pt; color:#7B9DC4; }
</style>
</head>
<body>
<table>
  <tr><td colspan="10" class="title">⚡ Sridhi Ventures — Telecalling Pipeline</td></tr>
  <tr><td colspan="10" class="subtitle">Exported ${today} · ${total} total leads across all stages</td></tr>
  <tr><td colspan="10">&nbsp;</td></tr>
  <tr>
    <th>Stage</th><th>Name</th><th>Business</th><th>Contact</th><th>Area</th><th>Type</th>
    <th>Telecaller</th><th>Priority</th><th>Last Contact</th><th>Source</th><th>Latest Remark</th>
  </tr>
  ${rowsHtml || `<tr><td colspan="10" style="text-align:center;color:#999">No leads in pipeline</td></tr>`}
</table>
</body>
</html>`;

    const blob = new Blob(["\uFEFF"+html], { type:"application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sridhi-pipeline-" + new Date().toISOString().slice(0,10) + ".xls";
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); setExporting(false); }, 1000);
  };

  // ── PDF export (styled printable report, grouped by stage) ──
  const downloadPipelinePDF = () => {
    setExporting(true);
    const today = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    const stageSections = PIPELINE_STAGES.map(stage => {
      const stageLeads = leads.filter(l => l.stage === stage.id);
      if (stageLeads.length === 0) return "";
      return `
      <div class="stage-section">
        <div class="stage-header" style="border-left-color:${stage.color}">
          <span class="stage-dot" style="background:${stage.color}"></span>
          <span class="stage-name">${stage.id}</span>
          <span class="stage-count" style="background:${stage.color}22;color:${stage.color}">${stageLeads.length}</span>
        </div>
        <table>
          <tr><th>Name</th><th>Business</th><th>Contact</th><th>Area</th><th>Telecaller</th><th>Priority</th><th>Last Contact</th></tr>
          ${stageLeads.map(l => `<tr>
            <td><strong>${l.name||""}</strong></td>
            <td>${l.business||""}</td>
            <td>${l.contact||""}</td>
            <td>${l.area||""}</td>
            <td>${l.telecaller||""}</td>
            <td><span class="badge" style="background:${getPriorityColor(l.priority||"Medium")}22;color:${getPriorityColor(l.priority||"Medium")}">${l.priority||"Medium"}</span></td>
            <td>${l.lastContact||""}</td>
          </tr>`).join("")}
        </table>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; background:#fff; color:#1a1a2e; padding:40px; }
  .header { background:linear-gradient(135deg,#060B16,#0F1C33); color:white; padding:32px; border-radius:16px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; }
  .logo { font-size:28px; font-weight:900; color:#00C9A7; letter-spacing:-1px; }
  .sub { font-size:12px; color:#7B9DC4; margin-top:4px; text-transform:uppercase; letter-spacing:2px; }
  .date { font-size:12px; color:#7B9DC4; text-align:right; }
  .overview { display:flex; gap:12px; margin-bottom:28px; }
  .kpi { flex:1; background:#f8faff; border:1px solid #e0eaff; border-radius:12px; padding:16px; text-align:center; }
  .kpi-val { font-size:24px; font-weight:900; color:#00C9A7; }
  .kpi-label { font-size:10px; color:#666; margin-top:4px; font-weight:600; text-transform:uppercase; }
  .stage-section { margin-bottom:20px; page-break-inside:avoid; }
  .stage-header { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#f8faff; border-left:4px solid; border-radius:6px; margin-bottom:10px; }
  .stage-dot { width:9px; height:9px; border-radius:50%; }
  .stage-name { font-size:13px; font-weight:800; color:#060B16; flex:1; text-transform:uppercase; letter-spacing:0.5px; }
  .stage-count { font-size:12px; font-weight:800; padding:2px 10px; border-radius:20px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th { background:#060B16; color:#00C9A7; padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; }
  td { padding:7px 10px; border-bottom:1px solid #f0f0f0; }
  tr:nth-child(even) td { background:#fafcff; }
  .badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:9px; font-weight:700; }
  .footer { margin-top:32px; padding-top:16px; border-top:2px solid #00C9A7; display:flex; justify-content:space-between; color:#999; font-size:10px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">⚡ Sridhi Ventures</div>
    <div class="sub">Telecalling Pipeline Report</div>
  </div>
  <div class="date">
    <div style="font-size:20px;font-weight:900;color:#00C9A7">${today}</div>
    <div style="margin-top:4px">Chennai · Food Distribution</div>
  </div>
</div>
<div class="overview">
  <div class="kpi"><div class="kpi-val">${total}</div><div class="kpi-label">Total Leads</div></div>
  <div class="kpi"><div class="kpi-val">${stages.filter(s=>s.count>0).length}</div><div class="kpi-label">Active Stages</div></div>
  <div class="kpi"><div class="kpi-val">${stageCounts["Active Customer"]||0}</div><div class="kpi-label">Active Customers</div></div>
</div>
${stageSections || `<div style="text-align:center;color:#999;padding:40px">No leads in pipeline</div>`}
<div class="footer">
  <div>Generated by <strong>Sridhi Ventures BOS v3.0</strong></div>
  <div>Confidential · Internal Use Only</div>
  <div>${today}</div>
</div>
</body>
</html>`;

    const blob = new Blob([html], { type:"text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) { w.onload = () => { w.print(); }; }
    setTimeout(() => { URL.revokeObjectURL(url); setExporting(false); }, 3000);
  };


  const updateStageP = (id, stage) => setAllLeads(allLeads.map(l => l.id===id ? {...l, stage, lastContact:"Today"} : l));
  const addRemarkP = (id) => {
    if (!remark.trim()) return;
    const now = new Date();
    const stamp = now.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}) + " " + now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});
    const r = "["+stamp+"] "+remark.trim();
    setAllLeads(allLeads.map(l => l.id===id ? {...l, remarks:[...(l.remarks||[]),r], lastContact:"Today"} : l));
    setRemark("");
  };

  if (selectedLead) {
    const lead = allLeads.find(l => l.id === selectedLead.id) || selectedLead;
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:80 }}>
        <button onClick={() => { setSelectedLead(null); setShowEdit(false); }}
          style={{ background:"none", border:"none", color:T.accent, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT, textAlign:"left", padding:"4px 0" }}>
          ← Back to pipeline
        </button>

        {showEdit ? (
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
              <Label>Edit Lead</Label>
              <button onClick={() => setShowEdit(false)} style={{ background:"none", border:"none", color:T.t3, fontSize:18, cursor:"pointer" }}>✕</button>
            </div>
            {[["Name","name","text"],["Business","business","text"],["Contact","contact","tel"],["Area","area","text"],["Address","address","text"]].map(([label,key,type]) => (
              <div key={key} style={{ marginBottom:10 }}>
                <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:4 }}>{label.toUpperCase()}</div>
                <input type={type} value={editForm[key]||""} onChange={e => setEditForm({...editForm,[key]:e.target.value})}
                  style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:4 }}>TELECALLER</div>
              <select value={editForm.telecaller||""} onChange={e => setEditForm({...editForm,telecaller:e.target.value})}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
                {TELECALLERS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={() => { setAllLeads(allLeads.map(l => l.id===lead.id ? {...l,...editForm} : l)); setShowEdit(false); }}
              style={{ background:T.accent, border:"none", borderRadius:12, color:"#FFFFFF", padding:"12px", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:FONT, width:"100%" }}>
              ✓ Save Changes
            </button>
          </Card>
        ) : (
          <Card accent={getStageColor(lead.stage)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:T.t1 }}>{lead.name}</div>
                <div style={{ fontSize:12, color:T.t2 }}>{lead.business}</div>
                <div style={{ fontSize:11, color:T.t3 }}>{lead.type} · {lead.area}</div>
              </div>
              <button onClick={() => { setEditForm({...lead}); setShowEdit(true); }}
                style={{ background:T.accentSub, border:`1px solid ${T.accentGlow}`, borderRadius:8, color:T.accent, padding:"5px 10px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
                ✏️ Edit
              </button>
            </div>
            <Chip label={lead.stage} color={getStageColor(lead.stage)} />
            <div style={{ marginTop:12 }}>
              {[["Contact",lead.contact],["Area",lead.area],["Address",lead.address],["Source",lead.source],["Telecaller",lead.telecaller],["Last contact",lead.lastContact]].map(([k,v]) => v ? (
                <div key={k} style={{ display:"flex", padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:11, color:T.t3, width:100, flexShrink:0, fontWeight:600 }}>{k}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:T.t1 }}>{v}</span>
                </div>
              ) : null)}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <button onClick={() => { const p=(lead.contact||"").replace(/[^0-9]/g,""); if(p) window.location.href="tel:+91"+p; }}
                style={{ flex:1, background:T.emerald+"22", border:`1px solid ${T.emerald}44`, borderRadius:10, color:T.emerald, padding:"10px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>📞 Call</button>
              <button onClick={() => { const p=(lead.contact||"").replace(/[^0-9]/g,""); window.open("https://wa.me/91"+p,"_blank"); }}
                style={{ flex:1, background:"#25D36622", border:"1px solid #25D36644", borderRadius:10, color:"#25D366", padding:"10px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>💬 WhatsApp</button>
            </div>
          </Card>
        )}

        <Card>
          <Label>Update Stage</Label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginTop:8 }}>
            {PIPELINE_STAGES.map(s => (
              <button key={s.id} onClick={() => { updateStageP(lead.id, s.id); setSelectedLead({...lead, stage:s.id}); }}
                style={{ background: lead.stage===s.id ? s.color+"22" : T.surface,
                  border:`1px solid ${lead.stage===s.id ? s.color : T.border}`,
                  borderRadius:8, padding:"6px 12px", fontSize:11, fontWeight:600,
                  color: lead.stage===s.id ? s.color : T.t2, cursor:"pointer", fontFamily:FONT }}>
                {s.id}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <Label sub={`${(lead.remarks||[]).length} entries`}>Remarks</Label>
          {(lead.remarks||[]).length === 0 && <div style={{ fontSize:12, color:T.t3, padding:"8px 0" }}>No remarks yet.</div>}
          {(lead.remarks||[]).slice().reverse().map((r,i) => {
            const match = r.match(/^\[(.+?)\] (.+)$/);
            return (
              <div key={i} style={{ background:T.surface, borderRadius:10, padding:"10px 12px", marginBottom:8, borderLeft:`3px solid ${T.accent}` }}>
                {match && <div style={{ fontSize:10, color:T.accent, fontWeight:700, marginBottom:3 }}>🕐 {match[1]}</div>}
                <div style={{ fontSize:12, color:T.t1 }}>{match ? match[2] : r}</div>
              </div>
            );
          })}
          <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={3}
            placeholder="Add a remark..."
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"10px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box", resize:"none", marginTop:8 }} />
          <div style={{ marginTop:8 }}>
            <button onClick={() => addRemarkP(lead.id)}
              style={{ background:T.accent, border:"none", borderRadius:12, color:"#FFFFFF", padding:"11px", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:FONT, width:"100%" }}>
              Save Remark
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <Card accent={T.accent}>
        <Label sub={`${total} total leads across all stages`}>Pipeline Overview</Label>
        <PipelineStrip stages={stages} />
      </Card>
      <Card>
        <Label sub="Downloads real pipeline data">Export Pipeline</Label>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          <button onClick={downloadPipelineExcel} disabled={exporting}
            style={{ flex:1, background:"linear-gradient(135deg,#10B981,#00C9A7)", border:"none", borderRadius:14,
              color:"#FFFFFF", padding:"13px", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:FONT,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {exporting ? "⏳ Preparing..." : "📊 Excel"}
          </button>
          <button onClick={downloadPipelinePDF} disabled={exporting}
            style={{ flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:14,
              color:T.t1, padding:"13px", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:FONT,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {exporting ? "⏳ Preparing..." : "📑 PDF"}
          </button>
        </div>
      </Card>
      {stages.map(stage => {
        const pct = total > 0 ? ((stage.count/total)*100).toFixed(1) : "0.0";
        const isOpen = expanded===stage.id;
        const stageLeads = leads.filter(l => l.stage===stage.id);
        return (
          <div key={stage.id} style={{
            background: isOpen ? stage.color+"0D" : T.card,
            border:`1px solid ${isOpen ? stage.color+"44" : T.border}`,
            borderRadius:16, overflow:"hidden",
          }}>
            <div onClick={() => setExpanded(isOpen ? null : stage.id)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px", cursor:"pointer" }}>
              <div style={{ width:8, height:8, borderRadius:2, background:stage.color, flexShrink:0 }} />
              <span style={{ flex:1, fontSize:13, fontWeight:600, color:T.t1 }}>{stage.id}</span>
              <span style={{ fontSize:10, color:T.t3, fontWeight:500 }}>{pct}%</span>
              <div style={{
                background:stage.color+"1A", color:stage.color,
                borderRadius:8, padding:"3px 10px", fontSize:13, fontWeight:800,
                minWidth:32, textAlign:"center",
              }}>{stage.count}</div>
              <span style={{ color:T.t3, fontSize:12 }}>{isOpen?"▲":"▼"}</span>
            </div>
            <div style={{ height:2, background:T.border }}>
              <div style={{ width:`${pct}%`, height:"100%", background:stage.color }} />
            </div>
            {isOpen && stageLeads.length > 0 && (
              <div style={{ padding:"8px 16px 14px" }}>
                {stageLeads.map(l => (
                  <div key={l.id} onClick={() => setSelectedLead(l)}
                    style={{
                      background:T.surface, borderRadius:10, padding:"10px 12px", marginTop:8,
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                      cursor:"pointer", border:`1px solid transparent`,
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor=T.accentGlow}
                    onMouseLeave={e => e.currentTarget.style.borderColor="transparent"}
                  >
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{l.name}</div>
                      <div style={{ fontSize:10, color:T.t3, marginTop:2 }}>{l.area} · {l.telecaller}</div>
                      {l.contact && (
                        <div style={{ fontSize:11, color:T.accent, marginTop:2, fontWeight:600 }}>📞 {l.contact}</div>
                      )}
                      {l.remarks && l.remarks.length > 0 && (
                        <div style={{ fontSize:10, color:T.t3, marginTop:3, fontStyle:"italic" }}>
                          💬 {typeof l.remarks[l.remarks.length-1] === "string" ? l.remarks[l.remarks.length-1].slice(0,50)+"..." : ""}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end" }}>
                      <Chip label={l.priority||"Medium"} color={getPriorityColor(l.priority||"Medium")} />
                      <span style={{ fontSize:10, color:T.t3 }}>{l.lastContact||""}</span>
                      <span style={{ fontSize:10, color:T.accent }}>Tap to open →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isOpen && stageLeads.length === 0 && (
              <div style={{ padding:"12px 16px", fontSize:12, color:T.t3, fontStyle:"italic" }}>
                No leads in this stage
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── LOST CUSTOMERS ───────────────────────────────────────────────────────
function LostCustomers() {
  const [allLeads, setAllLeads] = useSheetSynced("leads", "leads", INITIAL_LEADS);
  const [selectedLead, setSelectedLead] = useState(null);
  const [customReason, setCustomReason] = useState("");

  // Only customers currently sitting in the "Lost Customer" pipeline stage
  const leads = (allLeads || []).filter(l => l && l.name && l.stage === "Lost Customer");

  const selectReason = (id, r, note) => {
    setAllLeads(allLeads.map(l => l.id === id ? { ...l, lostReason: r, lostReasonNote: r === "Others" ? (note ?? l.lostReasonNote ?? "") : "" } : l));
  };

  const reactivate = (id) => {
    setAllLeads(allLeads.map(l => l.id === id ? { ...l, stage: "Active Customer", lastContact: "Today" } : l));
    setSelectedLead(null);
  };

  if (selectedLead) {
    const lead = allLeads.find(l => l.id === selectedLead.id) || selectedLead;
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:80 }}>
        <button onClick={() => { setSelectedLead(null); setCustomReason(""); }}
          style={{ background:"none", border:"none", color:T.accent, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT, textAlign:"left", padding:"4px 0" }}>
          ← Back to lost customers
        </button>

        <Card accent={T.rose}>
          <div style={{ fontSize:18, fontWeight:800, color:T.t1 }}>{lead.name}</div>
          <div style={{ fontSize:12, color:T.t2 }}>{lead.business}</div>
          <div style={{ fontSize:11, color:T.t3 }}>{lead.type} · {lead.area}</div>
          <div style={{ marginTop:12 }}>
            {[["Contact",lead.contact],["Area",lead.area],["Address",lead.address],["Telecaller",lead.telecaller],["Last contact",lead.lastContact]].map(([k,v]) => v ? (
              <div key={k} style={{ display:"flex", padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
                <span style={{ fontSize:11, color:T.t3, width:100, flexShrink:0, fontWeight:600 }}>{k}</span>
                <span style={{ fontSize:12, fontWeight:600, color:T.t1 }}>{v}</span>
              </div>
            ) : null)}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button onClick={() => { const p=(lead.contact||"").replace(/[^0-9]/g,""); if(p) window.location.href="tel:+91"+p; }}
              style={{ flex:1, background:T.emerald+"22", border:`1px solid ${T.emerald}44`, borderRadius:10, color:T.emerald, padding:"10px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>📞 Call</button>
            <button onClick={() => { const p=(lead.contact||"").replace(/[^0-9]/g,""); window.open("https://wa.me/91"+p,"_blank"); }}
              style={{ flex:1, background:"#25D36622", border:"1px solid #25D36644", borderRadius:10, color:"#25D366", padding:"10px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>💬 WhatsApp</button>
          </div>
        </Card>

        <Card>
          <Label sub="Why did this customer stop ordering?">Reason for stopping</Label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:10 }}>
            {LOST_REASONS.map(r => (
              <button key={r} onClick={() => { selectReason(lead.id, r); if (r === "Others") setCustomReason(lead.lostReasonNote || ""); }}
                style={{
                  background: lead.lostReason===r ? T.rose+"22" : T.surface,
                  border:`1px solid ${lead.lostReason===r ? T.rose : T.border}`,
                  borderRadius:10, padding:"10px 14px", fontSize:12, fontWeight:700,
                  color: lead.lostReason===r ? T.rose : T.t2, cursor:"pointer", fontFamily:FONT,
                }}>
                {r}
              </button>
            ))}
          </div>

          {lead.lostReason === "Others" ? (
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>TYPE THE REASON</div>
              <textarea value={customReason} onChange={e => setCustomReason(e.target.value)} rows={3}
                placeholder="e.g. Switched to a local supplier, moved out of area..."
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"10px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box", resize:"none" }} />
              <button onClick={() => selectReason(lead.id, "Others", customReason)}
                style={{ marginTop:8, background:T.accent, border:"none", borderRadius:12, color:"#FFFFFF", padding:"11px", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:FONT, width:"100%" }}>
                Save Reason
              </button>
            </div>
          ) : lead.lostReason ? (
            <div style={{ marginTop:12, fontSize:12, color:T.t2 }}>
              ✓ Saved: <span style={{ color:T.rose, fontWeight:700 }}>{lead.lostReason}</span>
            </div>
          ) : (
            <div style={{ marginTop:12, fontSize:12, color:T.t3, fontStyle:"italic" }}>No reason set yet — pick one above.</div>
          )}
        </Card>

        <button onClick={() => reactivate(lead.id)}
          style={{ background:T.emerald+"18", border:`1px solid ${T.emerald}44`, borderRadius:12, color:T.emerald, padding:"12px", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:FONT }}>
          ↩ Customer is back — mark as Active Customer
        </button>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <Card accent={T.rose}>
        <Label sub={`${leads.length} customer${leads.length===1?"":"s"} marked as lost`}>Lost Customers</Label>
      </Card>
      {leads.length === 0 && (
        <div style={{ textAlign:"center", color:T.t3, fontSize:13, padding:40 }}>No lost customers right now 🎉</div>
      )}
      {leads.map(l => (
        <div key={l.id} onClick={() => setSelectedLead(l)}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:14, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:T.t1 }}>{l.name}</div>
            <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>{l.area} · {l.telecaller}</div>
            {l.contact && <div style={{ fontSize:11, color:T.accent, marginTop:2, fontWeight:600 }}>📞 {l.contact}</div>}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end" }}>
            <Chip label={l.lostReason ? (l.lostReason==="Others" ? (l.lostReasonNote || "Others") : l.lostReason) : "Reason not set"} color={l.lostReason ? T.rose : T.t3} />
            <span style={{ fontSize:10, color:T.accent }}>Tap to update →</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── EXISTING CUSTOMER PIPELINE ───────────────────────────────────────────
// A separate pipeline from the Leads CRM. Telecallers manually add existing
// customers who've dropped off here to call back and log remarks — entries
// never come from, or feed into, the Leads CRM. Whichever customer was most
// recently updated (a new remark or status change) always sorts to the top.
// A remark can be an old-format plain string, or the newer structured object
// { text, note, telecaller, at } — this reads either format safely.
function remarkText(r) { return typeof r === "string" ? r : (r && r.text) || ""; }
function remarkTelecallerOf(r) { return typeof r === "object" && r ? r.telecaller : null; }
function remarkAt(r) { return typeof r === "object" && r ? r.at : null; }
function remarkSentimentOf(r) { return (typeof r === "object" && r && r.sentiment) || "neutral"; }
function remarkTagOf(r) { return (typeof r === "object" && r && r.tag) || null; }

function ExistingCustomerPipeline() {
  const [customers, setCustomers] = useSheetSynced("existingCustomers", "existingCustomers", []);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newRemark, setNewRemark] = useState("");
  const [remarkTag, setRemarkTag] = useState(null);
  const [remarkTelecaller, setRemarkTelecaller] = useState(TELECALLERS[0]);
  const [remarkDate, setRemarkDate] = useState(todayISO());
  const [form, setForm] = useState({ name: "", contact: "", area: "", address: "", reason: LOST_REASONS[0], telecaller: TELECALLERS[0], date: todayISO() });
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", contact: "", area: "", address: "", reason: LOST_REASONS[0] });
  const [reportTelecaller, setReportTelecaller] = useState(TELECALLERS[0]);
  const [reportPreset, setReportPreset] = useState("Today");
  const [reportFrom, setReportFrom] = useState(todayISO());
  const [reportTo, setReportTo] = useState(todayISO());
  const [generatingTcReport, setGeneratingTcReport] = useState(false);

  const sorted = [...(customers || [])].sort((a, b) => (b.lastRemarkAt || b.createdAt || 0) - (a.lastRemarkAt || a.createdAt || 0));

  // Live Positive / Negative / Neutral tally for the selected telecaller +
  // date range, so the numbers are visible in-app before anyone downloads
  // the PDF. Mirrors exactly what downloadTelecallerReport computes.
  const reportStats = useMemo(() => {
    let positive = 0, negative = 0, neutral = 0;
    (customers || []).forEach(c => {
      (c.remarks || []).forEach(r => {
        const tc = remarkTelecallerOf(r);
        const at = remarkAt(r);
        if (tc !== reportTelecaller || !at) return;
        const dateStr = localISO(at);
        if (dateStr < reportFrom || dateStr > reportTo) return;
        const s = remarkSentimentOf(r);
        if (s === "positive") positive++;
        else if (s === "negative") negative++;
        else neutral++;
      });
    });
    return { positive, negative, neutral, total: positive + negative + neutral };
  }, [customers, reportTelecaller, reportFrom, reportTo]);

  // Combines a picked date (YYYY-MM-DD) with the current time-of-day, so a
  // backfilled entry sorts sensibly and still shows a real time in reports.
  const dateWithNow = (dateStr) => {
    const now = new Date();
    const d = new Date(dateStr + "T00:00:00");
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return d.getTime();
  };

  const addCustomer = () => {
    if (!form.name.trim()) return;
    if (!form.telecaller) { alert("Please select a telecaller."); return; }
    const now = dateWithNow(form.date || todayISO());
    const stamp = new Date(now).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + new Date(now).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const firstEntry = { text: `[${stamp} · ${form.telecaller}] Added to follow-up list`, note: "Added to follow-up list", telecaller: form.telecaller, at: now };
    setCustomers([{
      id: Date.now() + Math.random(),
      name: form.name.trim(),
      contact: form.contact.trim(),
      area: form.area.trim(),
      address: form.address.trim(),
      reason: form.reason,
      status: EXISTING_CUSTOMER_STATUSES[0],
      remarks: [firstEntry],
      lastRemarkAt: now,
      createdAt: now,
    }, ...(customers || [])]);
    setForm({ name: "", contact: "", area: "", address: "", reason: LOST_REASONS[0], telecaller: TELECALLERS[0], date: todayISO() });
    setShowAdd(false);
  };

  // Lets a telecaller correct details entered earlier (spelling, wrong area,
  // fixed-up English, etc.) without deleting and re-adding the customer.
  // Writes straight back into the synced customers list, so the change
  // hits the database and every future PDF/Excel export immediately.
  const openEdit = (c) => {
    setEditForm({ name: c.name || "", contact: c.contact || "", area: c.area || "", address: c.address || "", reason: c.reason || LOST_REASONS[0] });
    setShowEdit(true);
  };

  const saveEdit = () => {
    if (!editForm.name.trim()) return;
    const now = new Date();
    const stamp = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const autoRemark = "[" + stamp + " · System] Details edited";
    setCustomers((customers || []).map(c => c.id === selected.id
      ? {
          ...c,
          name: editForm.name.trim(),
          contact: editForm.contact.trim(),
          area: editForm.area.trim(),
          address: editForm.address.trim(),
          reason: editForm.reason,
          remarks: [...(c.remarks || []), autoRemark],
        }
      : c));
    setShowEdit(false);
  };

  const addRemark = (id) => {
    const tagLabel = remarkTag ? remarkTag.label : "";
    const noteText = newRemark.trim() || tagLabel;
    if (!noteText) return;
    if (!remarkTelecaller) { alert("Please select a telecaller."); return; }
    const at = dateWithNow(remarkDate || todayISO());
    const stamp = new Date(at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + new Date(at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const withStamp = "[" + stamp + " · " + remarkTelecaller + (tagLabel ? " · " + tagLabel : "") + "] " + noteText;
    const entry = { text: withStamp, note: noteText, telecaller: remarkTelecaller, at, tag: tagLabel || null, sentiment: remarkTag ? remarkTag.sentiment : "neutral" };
    setCustomers((customers || []).map(c => c.id === id
      ? { ...c, remarks: [...(c.remarks || []), entry], lastRemarkAt: at }
      : c));
    setNewRemark("");
    setRemarkTag(null);
    setRemarkDate(todayISO());
  };

  const setStatus = (id, status) => {
    const now = new Date();
    const stamp = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const autoRemark = "[" + stamp + " · System] Status changed to \"" + status + "\"";
    setCustomers((customers || []).map(c => c.id === id
      ? { ...c, status, remarks: [...(c.remarks || []), autoRemark], lastRemarkAt: Date.now() }
      : c));
  };

  const deleteCustomer = (c) => {
    if (!window.confirm(`Delete "${c.name}" from this pipeline permanently?\n\nThis removes their entire remark history too. This can't be undone.`)) return;
    setCustomers((customers || []).filter(x => x.id !== c.id));
    setSelected(null);
  };

  const downloadPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 32;

    const NAVY = [8, 40, 25], TEAL = [23, 148, 74], TEAL_TINT = [229, 248, 238];
    const GRID = [214, 220, 214], INK = [26, 32, 46], SUBTLE = [110, 118, 138];
    const STATUS_COLORS = {
      "Calling": [76, 95, 224], "Interested": [16, 150, 100], "Rejoined": [23, 148, 74],
      "Own Making": [180, 110, 5], "Not Reachable": [110, 118, 138], "Not Interested": [200, 45, 60],
    };
    const colorFor = (s) => STATUS_COLORS[s] || [110, 118, 138];

    // Distinct highlight color per telecaller, so the report reads at a
    // glance who owns each customer. Falls back to a neutral tone for
    // anyone not in the fixed palette.
    const TELECALLER_COLORS = {
      "Thulasi": [76, 95, 224], "Ramya": [23, 148, 74],
      "Sabi (Intern)": [180, 110, 5], "Naveen HR": [190, 40, 130],
    };
    const telecallerColorFor = (t) => TELECALLER_COLORS[t] || [90, 98, 120];
    // Who's currently handling this customer — the most recent remark's
    // telecaller, falling back to whoever first added them.
    const telecallerFor = (c) => {
      const remarks = c.remarks || [];
      for (let i = remarks.length - 1; i >= 0; i--) {
        const t = remarkTelecallerOf(remarks[i]);
        if (t) return t;
      }
      return "—";
    };

    const header = () => {
      const headerH = 70;
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageW, headerH, "F");
      doc.setFillColor(...TEAL);
      doc.rect(0, headerH - 2, pageW, 2, "F");

      const logoSize = 34, badgePad = 5, badgeSize = logoSize + badgePad * 2;
      const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 1;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 8, 8, "F");
      try { doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize); } catch (e) { /* logo optional */ }

      const textX = badgeX + badgeSize + 14;
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("SRIDHI VENTURES — Existing Customer Follow-up", textX, 29);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(200, 214, 205);
      doc.text("Dropped customers being re-approached — status & remarks history", textX, 44);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...TEAL.map(c => Math.min(255, c + 70)));
      doc.text(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), pageW - margin, 28, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(200, 214, 205);
      doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 42, { align: "right" });
    };

    const footer = () => {
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(...GRID);
        doc.line(margin, pageH - 26, pageW - margin, pageH - 26);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...SUBTLE);
        doc.text("Sridhi Ventures · Existing Customer Report", margin, pageH - 13);
        doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 13, { align: "right" });
      }
    };

    header();

    // Summary strip — a quick headline count plus one chip per status, so
    // management sees the shape of the pipeline before reading the table.
    const y0 = 90;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(`${sorted.length} CUSTOMER${sorted.length === 1 ? "" : "S"} IN FOLLOW-UP`, margin, y0);
    let chipX = margin;
    const chipY = y0 + 12;
    EXISTING_CUSTOMER_STATUSES.forEach(s => {
      const count = sorted.filter(c => (c.status || EXISTING_CUSTOMER_STATUSES[0]) === s).length;
      if (!count) return;
      const label = `${s}  ${count}`;
      const w = doc.getTextWidth(label) + 20;
      const color = colorFor(s);
      doc.setDrawColor(...color);
      doc.setFillColor(...color.map(c => Math.min(255, c + (255 - c) * 0.88)));
      doc.roundedRect(chipX, chipY, w, 20, 6, 6, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...color);
      doc.text(label, chipX + 10, chipY + 14);
      chipX += w + 8;
    });

    autoTable(doc, {
      startY: chipY + 34,
      margin: { top: 90, bottom: 40 },
      head: [["Customer", "Telecaller", "Contact", "Area", "Reason Dropped", "Status", "Latest Remark", "Last Updated"]],
      body: sorted.map(c => [
        c.name, telecallerFor(c), c.contact || "—", c.area || "—", c.reason || "—", c.status || "—",
        (c.remarks && c.remarks.length) ? remarkText(c.remarks[c.remarks.length - 1]) : "—",
        c.lastRemarkAt ? new Date(c.lastRemarkAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—",
      ]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 6, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "middle" },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 248] },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { fontStyle: "bold", halign: "center" }, 5: { fontStyle: "bold", halign: "center" } },
      didParseCell: (data) => {
        // Color-code the Telecaller column per person, and Status per
        // status, so a manager can scan ownership and progress at a glance.
        if (data.section === "body" && data.column.index === 1) {
          const color = telecallerColorFor(data.cell.raw);
          data.cell.styles.textColor = color;
          data.cell.styles.fillColor = color.map(c => Math.min(255, c + (255 - c) * 0.88));
        }
        if (data.section === "body" && data.column.index === 5) {
          const color = colorFor(data.cell.raw);
          data.cell.styles.textColor = color;
          data.cell.styles.fillColor = color.map(c => Math.min(255, c + (255 - c) * 0.9));
        }
      },
      didDrawPage: () => header(),
    });

    footer();
    doc.save(`Existing-Customer-Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const downloadExcel = () => {
    const rows = sorted.map(c => ({
      "Customer": c.name,
      "Telecaller": (() => {
        const remarks = c.remarks || [];
        for (let i = remarks.length - 1; i >= 0; i--) {
          const t = remarkTelecallerOf(remarks[i]);
          if (t) return t;
        }
        return "";
      })(),
      "Contact": c.contact || "",
      "Area": c.area || "",
      "Address": c.address || "",
      "Reason Dropped": c.reason || "",
      "Status": c.status || "",
      "Latest Remark": (c.remarks && c.remarks.length) ? remarkText(c.remarks[c.remarks.length - 1]) : "",
      "All Remarks": (c.remarks || []).map(remarkText).join(" | "),
      "Last Updated": c.lastRemarkAt ? new Date(c.lastRemarkAt).toLocaleString("en-IN") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Existing Customers");
    XLSX.writeFile(wb, `Existing-Customer-Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Applies the Today / This Week / This Month preset to reportFrom/reportTo.
  const applyReportPreset = (preset) => {
    setReportPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setReportFrom(todayISO()); setReportTo(todayISO());
    } else if (preset === "This Week") {
      const day = now.getDay() || 7; // Monday-start week
      const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
      setReportFrom(localISO(monday)); setReportTo(todayISO());
    } else if (preset === "This Month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setReportFrom(localISO(first)); setReportTo(todayISO());
    }
    // "Custom" leaves reportFrom/reportTo as whatever the user picks manually.
  };

  // ── Telecaller Call Report ──────────────────────────────────────────
  // Pulls every remark made by the selected telecaller, across ALL existing
  // customers, within the chosen date range — a clean call log to send to
  // management. Only remarks saved after telecaller-attribution was added
  // (structured objects, not old plain-string remarks) can be attributed;
  // legacy entries are silently excluded since there's no reliable way to
  // know who made them.
  const downloadTelecallerReport = async () => {
    if (generatingTcReport) return;
    setGeneratingTcReport(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"), import("jspdf-autotable"),
      ]);

      const entries = [];
      (customers || []).forEach(c => {
        (c.remarks || []).forEach(r => {
          const tc = remarkTelecallerOf(r);
          const at = remarkAt(r);
          if (tc !== reportTelecaller || !at) return;
          const dateStr = localISO(at);
          if (dateStr < reportFrom || dateStr > reportTo) return;
          entries.push({ at, dateStr, customer: c.name, area: c.area || "—", note: (typeof r === "object" && r.note) ? r.note : remarkText(r), sentiment: remarkSentimentOf(r), tag: remarkTagOf(r) });
        });
      });
      entries.sort((a, b) => a.at - b.at);

      const NAVY = [8, 40, 25], TEAL = [23, 148, 74], TEAL_TINT = [229, 248, 238];
      const GRID = [214, 220, 214], INK = [26, 32, 46], SUBTLE = [110, 118, 138];
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 32;

      const header = () => {
        const headerH = 74;
        doc.setFillColor(...NAVY);
        doc.rect(0, 0, pageW, headerH, "F");
        doc.setFillColor(...TEAL);
        doc.rect(0, headerH - 2, pageW, 2, "F");
        const logoSize = 34, badgePad = 5, badgeSize = logoSize + badgePad * 2;
        const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 1;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 8, 8, "F");
        try { doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize); } catch (e) {}
        const textX = badgeX + badgeSize + 14;
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text(`Telecaller Call Report — ${reportTelecaller}`, textX, 30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(200, 214, 205);
        const rangeLabel = reportFrom === reportTo ? formatDateReadable(reportFrom) : `${formatDateReadable(reportFrom)}  –  ${formatDateReadable(reportTo)}`;
        doc.text(`${reportPreset} · ${rangeLabel}`, textX, 46);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(200, 214, 205);
        doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 30, { align: "right" });
      };
      const footer = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setDrawColor(...GRID);
          doc.line(margin, pageH - 26, pageW - margin, pageH - 26);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...SUBTLE);
          doc.text("Sridhi Ventures · Telecaller Call Report", margin, pageH - 13);
          doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 13, { align: "right" });
        }
      };

      header();
      let y = 94;

      // Summary strip
      const customersTouched = new Set(entries.map(e => e.customer)).size;
      const daysActive = new Set(entries.map(e => e.dateStr)).size;
      const chips = [
        [`${entries.length} Call${entries.length === 1 ? "" : "s"}`, TEAL, TEAL_TINT],
        [`${customersTouched} Customer${customersTouched === 1 ? "" : "s"} Touched`, [79, 70, 229], [235, 234, 253]],
        [`${daysActive} Active Day${daysActive === 1 ? "" : "s"}`, [180, 110, 5], [254, 246, 224]],
      ];
      let cx = margin;
      chips.forEach(([label, color, tint]) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        const w = doc.getTextWidth(label) + 22;
        doc.setFillColor(...tint);
        doc.setDrawColor(...color);
        doc.roundedRect(cx, y, w, 24, 12, 12, "FD");
        doc.setTextColor(...color);
        doc.text(label, cx + 11, y + 16);
        cx += w + 8;
      });
      y += 40;

      // Response Analysis — Positive / Negative / Neutral scorecard plus a
      // proportional bar, so the page reads at a glance before the
      // call-by-call detail below.
      const POS = [34, 217, 138], NEG = [251, 113, 133], NEU = [251, 191, 36];
      const posCount = entries.filter(e => e.sentiment === "positive").length;
      const negCount = entries.filter(e => e.sentiment === "negative").length;
      const neuCount = entries.filter(e => e.sentiment === "neutral").length;
      const totalResp = posCount + negCount + neuCount;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...NAVY);
      doc.text("RESPONSE ANALYSIS", margin, y);
      y += 10;

      const statBoxes = [["Positive", posCount, POS], ["Negative", negCount, NEG], ["Neutral", neuCount, NEU]];
      const boxW = (pageW - margin * 2 - 16) / 3;
      statBoxes.forEach(([label, count, color], i) => {
        const bx = margin + i * (boxW + 8);
        doc.setFillColor(...color.map(c => Math.min(255, c + (255 - c) * 0.88)));
        doc.setDrawColor(...color);
        doc.roundedRect(bx, y, boxW, 44, 8, 8, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(19);
        doc.setTextColor(...color);
        doc.text(String(count), bx + 12, y + 27);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        const pct = totalResp ? Math.round((count / totalResp) * 100) : 0;
        doc.text(`${label.toUpperCase()} · ${pct}%`, bx + 12, y + 38);
      });
      y += 56;

      if (totalResp) {
        const barX = margin, barY = y, barW = pageW - margin * 2, barH = 12;
        let bx2 = barX;
        [[posCount, POS], [neuCount, NEU], [negCount, NEG]].forEach(([count, color]) => {
          if (!count) return;
          const w = (count / totalResp) * barW;
          doc.setFillColor(...color);
          doc.rect(bx2, barY, w, barH, "F");
          bx2 += w;
        });
        doc.setDrawColor(...GRID);
        doc.roundedRect(barX, barY, barW, barH, 3, 3, "S");
        y += barH + 22;
      } else {
        y += 8;
      }

      if (!entries.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...SUBTLE);
        doc.text(`No calls logged by ${reportTelecaller} in this period.`, margin, y + 10);
      } else {
        // Group rows by date with a bold date separator row, most recent day last
        // (chronological, so it reads like a diary of the period).
        const TAG_SENTIMENT = {};
        REMARK_TAGS.forEach(t => { TAG_SENTIMENT[t.label] = t.sentiment; });
        const SENTIMENT_RGB = { positive: POS, negative: NEG, neutral: NEU };
        const byDate = {};
        entries.forEach(e => { (byDate[e.dateStr] = byDate[e.dateStr] || []).push(e); });
        const body = [];
        Object.keys(byDate).sort().forEach(d => {
          body.push([{ content: formatDateReadable(d) + `  (${byDate[d].length} call${byDate[d].length === 1 ? "" : "s"})`, colSpan: 5, styles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 } }]);
          byDate[d].forEach(e => {
            body.push([
              new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
              e.customer, e.area, e.note || "—", e.tag || "—",
            ]);
          });
        });
        autoTable(doc, {
          startY: y,
          margin: { top: 94, bottom: 40 },
          head: [["Time", "Customer", "Area", "Call Notes", "Response"]],
          body,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8.5, cellPadding: 6, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "middle" },
          headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 9 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          columnStyles: { 0: { cellWidth: 55, fontStyle: "bold", textColor: TEAL }, 1: { fontStyle: "bold", cellWidth: 100 }, 2: { cellWidth: 80 }, 4: { cellWidth: 80, fontStyle: "bold", halign: "center" } },
          didParseCell: (data) => {
            // Color-code the Response column by sentiment, so a manager can
            // scan wins vs losses down the page without reading every note.
            if (data.section === "body" && data.column.index === 4) {
              const sentiment = TAG_SENTIMENT[data.cell.raw] || null;
              const color = sentiment ? SENTIMENT_RGB[sentiment] : SUBTLE;
              data.cell.styles.textColor = color;
              if (sentiment) data.cell.styles.fillColor = color.map(c => Math.min(255, c + (255 - c) * 0.88));
            }
          },
          didDrawPage: () => header(),
        });
      }

      footer();
      doc.save(`Telecaller-Call-Report_${reportTelecaller.replace(/[^a-zA-Z0-9]/g, "")}_${reportFrom}_to_${reportTo}.pdf`);
    } finally {
      setGeneratingTcReport(false);
    }
  };

  if (selected) {
    const c = (customers || []).find(x => x.id === selected.id) || selected;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 80 }}>
        <button onClick={() => setSelected(null)}
          style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, textAlign: "left", padding: "4px 0" }}>
          ← Back to Existing Customers
        </button>

        <Card accent={T.indigo}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.t1 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: T.t3 }}>{c.area}{c.reason ? ` · ${c.reason}` : ""}</div>
            </div>
            <button onClick={() => openEdit(c)}
              style={{ background: T.indigo + "18", border: `1px solid ${T.indigo}44`, borderRadius: 10, color: T.indigo, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, flexShrink: 0 }}>
              ✎ Edit
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            {[["Contact", c.contact], ["Address", c.address]].map(([k, v]) => v ? (
              <div key={k} style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 11, color: T.t3, width: 90, flexShrink: 0, fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.t1 }}>{v}</span>
              </div>
            ) : null)}
          </div>
          {c.contact && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => { const p = (c.contact || "").replace(/[^0-9]/g, ""); if (p) window.location.href = "tel:+91" + p; }}
                style={{ flex: 1, background: T.emerald + "22", border: `1px solid ${T.emerald}44`, borderRadius: 10, color: T.emerald, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📞 Call</button>
              <button onClick={() => { const p = (c.contact || "").replace(/[^0-9]/g, ""); window.open("https://wa.me/91" + p, "_blank"); }}
                style={{ flex: 1, background: "#25D36622", border: "1px solid #25D36644", borderRadius: 10, color: "#25D366", padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>💬 WhatsApp</button>
            </div>
          )}
        </Card>

        <Card>
          <Label sub="Update where this customer stands">Status</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXISTING_CUSTOMER_STATUSES.map(s => (
              <button key={s} onClick={() => setStatus(c.id, s)}
                style={{
                  background: c.status === s ? T.indigo + "22" : T.surface,
                  border: `1px solid ${c.status === s ? T.indigo : T.border}`,
                  borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700,
                  color: c.status === s ? T.indigo : T.t2, cursor: "pointer", fontFamily: FONT,
                }}>{s}</button>
            ))}
          </div>
        </Card>

        <Card>
          <Label sub={`${(c.remarks || []).length} entries`}>Remarks</Label>
          {(c.remarks || []).length === 0 && <div style={{ fontSize: 12, color: T.t3, marginBottom: 12 }}>No remarks yet.</div>}
          {(c.remarks || []).slice().reverse().map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: i < c.remarks.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0, background: SENTIMENT_COLOR[remarkSentimentOf(r)] }} />
              <span style={{ fontSize: 12, color: T.t2 }}>{remarkText(r)}</span>
            </div>
          ))}
          <Dropdown label="Telecaller (required)" value={remarkTelecaller} onChange={e => setRemarkTelecaller(e.target.value)} options={TELECALLERS} />
          <Field label="Call Date" type="date" value={remarkDate} onChange={e => setRemarkDate(e.target.value)} />
          <div style={{ fontSize: 11, color: T.t2, marginTop: 10, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Quick Tag (optional)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {REMARK_TAGS.map(tag => {
              const active = remarkTag && remarkTag.label === tag.label;
              const color = SENTIMENT_COLOR[tag.sentiment];
              return (
                <button key={tag.label} onClick={() => setRemarkTag(active ? null : tag)}
                  style={{
                    background: active ? color + "22" : T.surface,
                    border: `1px solid ${active ? color : T.border}`,
                    borderRadius: 20, padding: "6px 12px", fontSize: 11, fontWeight: 700,
                    color: active ? color : T.t2, cursor: "pointer", fontFamily: FONT,
                  }}>
                  {tag.label}
                </button>
              );
            })}
          </div>
          <textarea value={newRemark} onChange={e => setNewRemark(e.target.value)} rows={3}
            placeholder="Add extra detail (optional if a tag is picked)…"
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 13, fontFamily: FONT, outline: "none", width: "100%", boxSizing: "border-box", resize: "none", marginTop: 10 }} />
          <div style={{ marginTop: 8 }}><Btn label="Save Remark" full onClick={() => addRemark(c.id)} disabled={!newRemark.trim() && !remarkTag} /></div>
        </Card>

        <Btn label="🗑️ Delete Customer" color={T.rose} ghost full onClick={() => deleteCustomer(c)} />

        <Sheet open={showEdit} onClose={() => setShowEdit(false)} title="Edit Customer Details">
          <Field label="Customer / Hotel Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="e.g. Sri Balaji Mess" />
          <Field label="Contact No" value={editForm.contact} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} placeholder="98765 43210" />
          <Field label="Area" value={editForm.area} onChange={e => setEditForm({ ...editForm, area: e.target.value })} placeholder="e.g. Velachery" />
          <Field label="Address" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="Optional" />
          <Dropdown label="Reason they stopped" value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} options={LOST_REASONS} />
          <Btn label="Save Changes" full onClick={saveEdit} disabled={!editForm.name.trim()} />
        </Sheet>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card accent={T.indigo}>
        <Label sub={`${sorted.length} customer${sorted.length === 1 ? "" : "s"} · most recently updated first`}>Existing Customer Follow-up</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn label="+ Add Customer" onClick={() => setShowAdd(true)} />
          <Btn label="📄 PDF Report" ghost onClick={downloadPDF} />
          <Btn label="📊 Excel Report" ghost onClick={downloadExcel} />
        </div>
      </Card>

      <Card accent={T.amber}>
        <Label sub="Every call is now logged with the telecaller's name — download their daily, weekly, monthly, or custom-range call report to send to management">Telecaller Call Report</Label>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Telecaller</div>
          <select value={reportTelecaller} onChange={e => setReportTelecaller(e.target.value)}
            style={{ ...inputStyle, marginBottom: 12 }}>
            {TELECALLERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {["Today", "This Week", "This Month", "Custom"].map(p => (
            <button key={p} onClick={() => applyReportPreset(p)} style={{
              background: reportPreset === p ? T.amber : "transparent",
              color: reportPreset === p ? "#FFFFFF" : T.t2,
              border: `1px solid ${reportPreset === p ? T.amber : T.border}`,
              borderRadius: 10, padding: "8px 13px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT,
            }}>{p}</button>
          ))}
        </div>
        {reportPreset === "Custom" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: T.t3, marginBottom: 4, fontWeight: 600 }}>FROM</div>
              <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: T.t3, marginBottom: 4, fontWeight: 600 }}>TO</div>
              <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: T.t2, marginBottom: 8, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Response Analysis</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["Positive", reportStats.positive, T.emerald], ["Negative", reportStats.negative, T.rose], ["Neutral", reportStats.neutral, T.amber]].map(([label, count, color]) => (
            <div key={label} style={{ flex: 1, background: color + "14", border: `1px solid ${color}44`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{count}</div>
              <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
            </div>
          ))}
        </div>

        <Btn label={generatingTcReport ? "Generating…" : "🧾 Download Call Report (PDF)"} full color={T.amber} onClick={downloadTelecallerReport} />
      </Card>

      {sorted.length === 0 && (
        <div style={{ textAlign: "center", color: T.t3, fontSize: 13, padding: 40 }}>No existing customers added yet. Tap "+ Add Customer" to start.</div>
      )}

      {sorted.map(c => (
        <div key={c.id} onClick={() => setSelected(c)}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>{c.name}</div>
            <div style={{ fontSize: 11, color: T.t3, marginTop: 2 }}>{c.area || "—"}</div>
            {c.contact && <div style={{ fontSize: 11, color: T.accent, marginTop: 2, fontWeight: 600 }}>📞 {c.contact}</div>}
            {c.remarks && c.remarks.length > 0 && (
              <div style={{ fontSize: 11, color: T.t2, marginTop: 4 }}>💬 {remarkText(c.remarks[c.remarks.length - 1]).slice(0, 60)}</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <Chip label={c.status || "New"} color={T.indigo} />
            <span style={{ fontSize: 10, color: T.t3 }}>{formatLastContact(c.lastRemarkAt)}</span>
          </div>
        </div>
      ))}

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Add Existing Customer">
        <Field label="Customer / Hotel Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sri Balaji Mess" />
        <Field label="Contact No" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="98765 43210" />
        <Field label="Area" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="e.g. Velachery" />
        <Field label="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
        <Dropdown label="Reason they stopped" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} options={LOST_REASONS} />
        <Dropdown label="Telecaller (required)" value={form.telecaller} onChange={e => setForm({ ...form, telecaller: e.target.value })} options={TELECALLERS} />
        <Field label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        <Btn label="Add Customer" full onClick={addCustomer} disabled={!form.name.trim()} />
      </Sheet>
    </div>
  );
}

// ─── HOME CUSTOMERS ───────────────────────────────────────────────────────
// Ad-generated (Instagram boost → WhatsApp) home / mixed leads. Distributors
// aren't hired for every area yet, so this is a clean, area-wise register:
// capture the lead + address + map link now, keep status/remarks current,
// and hand the area-wise PDF to each distributor once they're hired.
const HOME_STATUSES = [
  "New Lead", "Contacted", "Interested", "Waiting for Distributor",
  "Handed to Distributor", "Ordered", "Not Interested", "Not Reachable",
];
const HOME_STATUS_COLOR = {
  "New Lead": T.sky, "Contacted": T.indigo, "Interested": T.emerald,
  "Waiting for Distributor": T.amber, "Handed to Distributor": T.accent,
  "Ordered": T.emerald, "Not Interested": T.rose, "Not Reachable": T.t3,
};
const HOME_STATUS_RGB = {
  "New Lead": [14, 130, 190], "Contacted": [76, 95, 224], "Interested": [16, 150, 100],
  "Waiting for Distributor": [180, 110, 5], "Handed to Distributor": [13, 130, 120],
  "Ordered": [23, 148, 74], "Not Interested": [200, 45, 60], "Not Reachable": [110, 118, 138],
};
const HOME_LEAD_TYPES = ["Home", "Mixed"];
const HOME_SOURCES = ["Instagram Ad", "WhatsApp", "Referral", "Other"];
const NO_AREA = "No Area";

function homeId() {
  return "hc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function phoneKey(p) {
  return String(p || "").replace(/\D/g, "").slice(-10);
}
// Keeps area names consistent ("velachery", "Velachery " and "VELACHERY" all
// become one area) — reuses the spelling already in the data when there is one.
function normalizeAreaName(raw, knownAreas) {
  const cleaned = String(raw || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const hit = (knownAreas || []).find(a => a.toLowerCase() === cleaned.toLowerCase());
  if (hit) return hit;
  return cleaned.split(" ").map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
}
// Accepts a pasted Google Maps link, a bare "maps.app.goo.gl/..." link, or
// plain "lat, long" coordinates, and returns a link that always opens.
function normalizeMapLink(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const coords = s.match(/^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (coords) return `https://www.google.com/maps?q=${coords[1]},${coords[2]}`;
  if (/^(www\.|maps\.|goo\.gl|maps\.app\.goo\.gl|google\.[a-z.]+\/maps)/i.test(s)) return "https://" + s;
  return s;
}
function homeStamp(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function homeLastRemarkText(c) {
  const r = c.remarks || [];
  return r.length ? remarkText(r[r.length - 1]) : "";
}

function HomeCustomers() {
  const [rows, setRows, syncStatus, retrySync, syncError] = useSheetSynced("homeCustomers", "homeCustomers", []);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [groupByArea, setGroupByArea] = useState(true);
  const [newRemark, setNewRemark] = useState("");
  const [remarkTag, setRemarkTag] = useState(null);
  const [remarkTelecaller, setRemarkTelecaller] = useState(TELECALLERS[0]);
  const [remarkDate, setRemarkDate] = useState(todayISO());
  const emptyForm = () => ({ name: "", contact: "", area: "", address: "", mapLink: "", leadType: "Home", source: "Instagram Ad", batchTitle: bt, telecaller: TELECALLERS[0], date: todayISO() });
  const [form, setForm] = useState(emptyForm());
  const [editForm, setEditForm] = useState(emptyForm());
  const [distributorDraft, setDistributorDraft] = useState("");
  const [busyPdf, setBusyPdf] = useState(false);

  // ── Per-record access control (same "key" system as Hub Distributors) ──
  // Opening any lead asks for the owning telecaller's personal key first.
  // Nothing is remembered between taps — every open is checked fresh.
  const [pendingOpen, setPendingOpen] = useState(null);
  const [openKeyValue, setOpenKeyValue] = useState("");
  const [openKeyError, setOpenKeyError] = useState(""); // "" | "wrong" | "notyours"
  const [currentTelecaller, setCurrentTelecaller] = useState(null);

  // ── Bulk selection (for bulk message / contact export) ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelectMode = () => { setSelectMode(m => !m); setSelectedIds(new Set()); };
  const toggleSelected = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── Bulk Import (paste from Excel/Sheets, same parser as Hub Distributors) ──
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importDefaultTc, setImportDefaultTc] = useState(TELECALLERS[0]);
  const [importPreview, setImportPreview] = useState(null); // { rows, skipped } | null
  const [importing, setImporting] = useState(false);
  const [importTitle, setImportTitle] = useState("");

  // ── Split Equally — paste a fresh batch of contacts and divide them
  // evenly, round-robin, across whichever telecallers are selected.
  const [showSplit, setShowSplit] = useState(false);
  const [splitText, setSplitText] = useState("");
  const [splitTitle, setSplitTitle] = useState("");
  const [splitTelecallers, setSplitTelecallers] = useState(() => new Set(TELECALLERS));
  const [splitArea, setSplitArea] = useState("");
  const [splitPreview, setSplitPreview] = useState(null); // { buckets, skipped, total } | null
  const [splitCommitting, setSplitCommitting] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const toggleSplitTelecaller = (t) => setSplitTelecallers(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });

  // ── Bulk Message / Export Contacts ──
  const [showBulkMsg, setShowBulkMsg] = useState(false);
  const [bulkMsgText, setBulkMsgText] = useState("Hi {name}, this is Sridhi Ventures — ");

  const all = rows || [];
  const knownAreas = useMemo(() => {
    const set = new Set();
    all.forEach(c => { if (c.area) set.add(c.area); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [all]);

  const areaCounts = useMemo(() => {
    const m = {};
    all.forEach(c => { const k = c.area || NO_AREA; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return all
      .filter(c => areaFilter === "All" || (c.area || NO_AREA) === areaFilter)
      .filter(c => statusFilter === "All" || (c.status || HOME_STATUSES[0]) === statusFilter)
      .filter(c => typeFilter === "All" || (c.leadType || "Home") === typeFilter)
      .filter(c => !q || (c.name || "").toLowerCase().includes(q) || (c.area || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q) || (qDigits.length >= 3 && phoneKey(c.contact).includes(qDigits)))
      .sort((a, b) => (b.lastRemarkAt || b.createdAt || 0) - (a.lastRemarkAt || a.createdAt || 0));
  }, [all, search, areaFilter, statusFilter, typeFilter]);

  const kpi = useMemo(() => ({
    total: all.length,
    fresh: all.filter(c => (c.status || HOME_STATUSES[0]) === "New Lead").length,
    waiting: all.filter(c => c.status === "Waiting for Distributor").length,
    areas: areaCounts.filter(([a]) => a !== NO_AREA).length,
  }), [all, areaCounts]);

  const dateWithNow = (dateStr) => {
    const now = new Date();
    const d = new Date((dateStr || todayISO()) + "T00:00:00");
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return d.getTime();
  };

  const addLead = () => {
    if (!form.name.trim()) return;
    if (!form.telecaller) { alert("Please select a telecaller."); return; }
    const key = phoneKey(form.contact);
    if (key.length >= 10) {
      const dup = all.find(c => phoneKey(c.contact) === key);
      if (dup && !window.confirm(`This number is already saved as "${dup.name}"${dup.area ? " (" + dup.area + ")" : ""}.\n\nAdd it again anyway?`)) return;
    }
    const at = dateWithNow(form.date);
    const firstEntry = { text: `[${homeStamp(at)} · ${form.telecaller}] Lead added (${form.source})`, note: `Lead added (${form.source})`, telecaller: form.telecaller, at };
    setRows([{
      id: homeId(),
      name: form.name.trim(),
      contact: form.contact.trim(),
      area: normalizeAreaName(form.area, knownAreas),
      address: form.address.trim(),
      mapLink: normalizeMapLink(form.mapLink),
      leadType: form.leadType,
      source: form.source,
      status: HOME_STATUSES[0],
      telecaller: form.telecaller,
      distributor: "",
      remarks: [firstEntry],
      lastRemarkAt: at,
      createdAt: at,
    }, ...all]);
    setForm(emptyForm());
    setShowAdd(false);
  };

  const openEdit = (c) => {
    setEditForm({ name: c.name || "", contact: c.contact || "", area: c.area || "", address: c.address || "", mapLink: c.mapLink || "", leadType: c.leadType || "Home", source: c.source || "Instagram Ad", telecaller: c.telecaller || TELECALLERS[0], date: todayISO() });
    setShowEdit(true);
  };
  const saveEdit = () => {
    if (!editForm.name.trim()) return;
    const now = Date.now();
    setRows(all.map(c => c.id === selectedId ? {
      ...c,
      name: editForm.name.trim(),
      contact: editForm.contact.trim(),
      area: normalizeAreaName(editForm.area, knownAreas),
      address: editForm.address.trim(),
      mapLink: normalizeMapLink(editForm.mapLink),
      leadType: editForm.leadType,
      source: editForm.source,
      telecaller: editForm.telecaller,
      remarks: [...(c.remarks || []), `[${homeStamp(now)} · System] Details edited`],
    } : c));
    setShowEdit(false);
  };

  const setStatus = (id, status) => {
    const now = Date.now();
    setRows(all.map(c => c.id === id
      ? { ...c, status, remarks: [...(c.remarks || []), `[${homeStamp(now)} · System] Status changed to "${status}"`], lastRemarkAt: now }
      : c));
  };

  const saveDistributor = (id) => {
    const name = distributorDraft.trim();
    const now = Date.now();
    setRows(all.map(c => c.id === id
      ? { ...c, distributor: name, remarks: [...(c.remarks || []), `[${homeStamp(now)} · System] Distributor ${name ? "set to \"" + name + "\"" : "cleared"}`], lastRemarkAt: now }
      : c));
  };

  const addRemark = (id) => {
    const tagLabel = remarkTag ? remarkTag.label : "";
    const noteText = newRemark.trim() || tagLabel;
    if (!noteText) return;
    if (!remarkTelecaller) { alert("Please select a telecaller."); return; }
    const at = dateWithNow(remarkDate);
    const text = `[${homeStamp(at)} · ${remarkTelecaller}${tagLabel ? " · " + tagLabel : ""}] ${noteText}`;
    const entry = { text, note: noteText, telecaller: remarkTelecaller, at, tag: tagLabel || null, sentiment: remarkTag ? remarkTag.sentiment : "neutral" };
    setRows(all.map(c => c.id === id ? { ...c, remarks: [...(c.remarks || []), entry], lastRemarkAt: at } : c));
    setNewRemark(""); setRemarkTag(null); setRemarkDate(todayISO());
  };

  const deleteLead = (c) => {
    if (!window.confirm(`Delete "${c.name}" permanently?\n\nThis removes their remark history too. This can't be undone.`)) return;
    setRows(all.filter(x => x.id !== c.id));
    setSelectedId(null);
  };

  const openMap = (c) => {
    const url = normalizeMapLink(c.mapLink);
    if (url) window.open(url, "_blank", "noopener");
  };

  // ── Open a record only after its owning telecaller's key is verified ──
  const requestOpen = (c) => { setPendingOpen(c); setOpenKeyValue(""); setOpenKeyError(""); };
  const closeKeyPrompt = () => { setPendingOpen(null); setOpenKeyValue(""); setOpenKeyError(""); };
  const submitOpenKey = () => {
    if (!openKeyValue) return;
    const name = SECRET_KEYS[openKeyValue.trim()];
    if (!name) { setOpenKeyError("wrong"); setOpenKeyValue(""); return; }
    const c = pendingOpen;
    if (name !== c.telecaller) { setOpenKeyError("notyours"); setOpenKeyValue(""); return; }
    setCurrentTelecaller(name);
    setSelectedId(c.id);
    closeKeyPrompt();
  };
  const closeDetail = () => { setSelectedId(null); setCurrentTelecaller(null); };

  // ── Bulk Import — same parser Hub Distributors uses (Name/Phone/Area/
  // Address/Map/Remark/Telecaller columns, in any order, header or not).
  // Re-pasting an updated sheet is safe: matched by phone number and
  // merged into the existing lead instead of duplicated.
  const runImportPreview = () => setImportPreview(parseHubBulkImport(importText, importDefaultTc));
  const commitImport = () => {
    if (!importPreview || !importPreview.rows.length) return;
    if (!importTitle.trim()) { alert("Please enter a Batch Title / Heading first."); return; }
    const bt = importTitle.trim();
    setImporting(true);
    setRows(prev => {
      const existing = [...(prev || [])];
      importPreview.rows.forEach(ir => {
        const phone = phoneKey(ir.contact);
        const matchIdx = existing.findIndex(e =>
          (phone && phone.length >= 10 && phoneKey(e.contact) === phone) ||
          (!phone && ir.name && (e.name || "").trim().toLowerCase() === ir.name.toLowerCase())
        );
        const telecaller = TELECALLERS.find(t => t.toLowerCase() === (ir.telecaller || "").toLowerCase()) || importDefaultTc;
        const area = normalizeAreaName(ir.area, knownAreas);
        const now = Date.now();
        if (matchIdx >= 0) {
          const cur = existing[matchIdx];
          const lastNote = (cur.remarks || []).length ? (cur.remarks[cur.remarks.length - 1].text || cur.remarks[cur.remarks.length - 1]) : null;
          const newRemarks = [...(cur.remarks || [])];
          if (ir.remark && ir.remark !== lastNote) {
            newRemarks.push({ text: `[${homeStamp(now)} · ${telecaller}] ${ir.remark}`, note: ir.remark, telecaller, at: now });
          }
          existing[matchIdx] = {
            ...cur,
            name: cur.name || ir.name || cur.name,
            area: cur.area || area,
            address: cur.address || ir.address || "",
            mapLink: cur.mapLink || normalizeMapLink(ir.mapLink) || "",
            contact: cur.contact || ir.contact || "",
            telecaller: cur.telecaller || telecaller,
            batchTitle: cur.batchTitle || bt,
            remarks: newRemarks,
            lastRemarkAt: newRemarks.length ? now : cur.lastRemarkAt,
          };
        } else {
          const firstEntry = { text: `[${homeStamp(now)} · ${telecaller}] Lead added (Bulk Import · ${bt})${ir.remark ? " — " + ir.remark : ""}`, note: ir.remark || `Lead added (Bulk Import · ${bt})`, telecaller, at: now };
          existing.push({
            id: homeId(),
            name: ir.name || (ir.contact ? "Unnamed · " + ir.contact : "Unnamed Lead"),
            contact: ir.contact || "",
            area, address: ir.address || "", mapLink: normalizeMapLink(ir.mapLink) || "",
            leadType: "Home", source: "Bulk Import", batchTitle: bt,
            status: HOME_STATUSES[0], telecaller, distributor: "",
            remarks: [firstEntry], lastRemarkAt: now, createdAt: now,
          });
        }
      });
      return existing;
    });
    setImporting(false);
    setShowImport(false);
    setImportText("");
    setImportTitle("");
    setImportPreview(null);
  };

  // ── Split Equally — paste a fresh batch of contacts, pick who's working
  // today, and divide the batch evenly (round-robin) between them. Each
  // new lead lands in the main list exactly like any other.
  const buildSplitPreview = () => {
    const telecallerList = Array.from(splitTelecallers);
    if (!telecallerList.length) { alert("Select at least one telecaller to split between."); return; }
    if (!splitText.trim()) { alert("Paste or type in the numbers first."); return; }
    const parsed = parseHubBulkImport(splitText, "").rows;
    const existingPhones = new Set(all.map(c => phoneKey(c.contact)).filter(k => k.length >= 10));
    const fresh = [];
    let skipped = 0;
    parsed.forEach(p => {
      const key = phoneKey(p.contact);
      if (key.length >= 10 && existingPhones.has(key)) { skipped++; return; } // already a lead — don't duplicate
      fresh.push(p);
    });
    if (!fresh.length) { alert(skipped ? `All ${skipped} number(s) already exist as leads — nothing new to split.` : "No valid numbers found in what was pasted."); return; }
    const shuffled = [...fresh].sort(() => Math.random() - 0.5);
    const buckets = telecallerList.map(t => ({ telecaller: t, contacts: [] }));
    shuffled.forEach((p, i) => buckets[i % buckets.length].contacts.push(p));
    setSplitPreview({ buckets, skipped, total: fresh.length });
  };
  const shuffleSplit = () => {
    if (!splitPreview) return;
    setIsShuffling(true);
    setTimeout(() => {
      setSplitPreview(prev => {
        if (!prev) return prev;
        const flat = prev.buckets.flatMap(b => b.contacts);
        const reshuffled = [...flat].sort(() => Math.random() - 0.5);
        const buckets = prev.buckets.map(b => ({ ...b, contacts: [] }));
        reshuffled.forEach((p, i) => buckets[i % buckets.length].contacts.push(p));
        return { ...prev, buckets };
      });
      setIsShuffling(false);
    }, 380);
  };
  const commitSplit = () => {
    if (!splitPreview || !splitPreview.total) return;
    if (!splitTitle.trim()) { alert("Please enter a Batch Title / Heading first."); return; }
    const bt = splitTitle.trim();
    setSplitCommitting(true);
    const now = Date.now();
    const area = normalizeAreaName(splitArea, knownAreas);
    const newRecs = [];
    splitPreview.buckets.forEach(b => {
      b.contacts.forEach(p => {
        const firstEntry = { text: `[${homeStamp(now)} · ${b.telecaller}] Lead added (Split Import · ${bt})`, note: `Lead added (Split Import · ${bt})`, telecaller: b.telecaller, at: now };
        newRecs.push({
          id: homeId(),
          name: p.name || (p.contact ? "Unnamed · " + p.contact : "Unnamed Lead"),
          contact: p.contact || "",
          area, address: "", mapLink: "",
          leadType: "Home", source: "Instagram Ad",
          status: HOME_STATUSES[0], telecaller: b.telecaller, distributor: "",
          remarks: [firstEntry], lastRemarkAt: now, createdAt: now,
        });
      });
    });
    setRows([...newRecs, ...all]);
    setSplitCommitting(false);
    setShowSplit(false);
    setSplitText("");
    setSplitTitle("");
    setSplitPreview(null);
    alert(`Added ${newRecs.length} lead${newRecs.length === 1 ? "" : "s"}, split evenly across ${splitPreview.buckets.length} telecaller${splitPreview.buckets.length === 1 ? "" : "s"}.`);
  };

  // ── Bulk contacts export / bulk WhatsApp message ──
  // Targets whatever is checked in Select mode, or falls back to every
  // currently filtered lead with a phone number.
  const bulkTargets = useMemo(() => {
    const base = selectedIds.size ? filtered.filter(c => selectedIds.has(c.id)) : filtered;
    return base.filter(c => phoneKey(c.contact).length >= 10);
  }, [filtered, selectedIds]);

  const exportContactsVCF = () => {
    if (!bulkTargets.length) { alert("No contacts with a phone number in the current selection."); return; }
    const vcf = bulkTargets.map(c => {
      const num = "+91" + phoneKey(c.contact);
      const addr = [c.address, c.area].filter(Boolean).join(", ");
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${(c.name || "Unnamed").replace(/\r?\n/g, " ")}\nTEL;TYPE=CELL:${num}\nADR:;;${addr.replace(/,/g, "\\,")};;;;\nEND:VCARD`;
    }).join("\n");
    const blob = new Blob([vcf], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `Home-Customers-Contacts_${fileTag()}.vcf`; a.click();
    URL.revokeObjectURL(url);
  };
  const exportContactsExcel = () => {
    if (!bulkTargets.length) { alert("No contacts with a phone number in the current selection."); return; }
    const data = bulkTargets.map(c => ({ "Name": c.name, "Contact": "+91" + phoneKey(c.contact), "Area": c.area || "", "Status": c.status || HOME_STATUSES[0] }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, `Home-Customers-Contacts_${fileTag()}.xlsx`);
  };
  const copyAllNumbers = () => {
    if (!bulkTargets.length) { alert("No contacts with a phone number in the current selection."); return; }
    const list = bulkTargets.map(c => "+91" + phoneKey(c.contact)).join("\n");
    navigator.clipboard?.writeText(list).then(
      () => alert(`Copied ${bulkTargets.length} number${bulkTargets.length === 1 ? "" : "s"} to clipboard.`),
      () => alert("Couldn't copy — your browser blocked clipboard access.")
    );
  };
  const bulkMessageFor = (c) => bulkMsgText.replace(/\{name\}/gi, c.name || "there");
  const sendBulkOne = (c) => window.open(`https://wa.me/91${phoneKey(c.contact)}?text=${encodeURIComponent(bulkMessageFor(c))}`, "_blank", "noopener");

  const filterLabel = () => {
    const bits = [];
    if (areaFilter !== "All") bits.push(areaFilter);
    if (statusFilter !== "All") bits.push(statusFilter);
    if (typeFilter !== "All") bits.push(typeFilter + " leads");
    return bits.join(" · ");
  };
  const fileTag = () => {
    const t = [areaFilter, statusFilter].filter(x => x !== "All").join("_").replace(/[^a-zA-Z0-9_]/g, "");
    return (t ? t + "_" : "") + new Date().toISOString().slice(0, 10);
  };

  // ── Excel export (whatever the current filters show) ─────────────────
  const downloadExcel = () => {
    const data = filtered.map(c => ({
      "Name": c.name, "Contact": c.contact || "", "Area": c.area || "", "Address": c.address || "",
      "Map Link": c.mapLink || "", "Lead Type": c.leadType || "Home", "Source": c.source || "",
      "Status": c.status || HOME_STATUSES[0], "Telecaller": c.telecaller || "", "Distributor": c.distributor || "",
      "Latest Remark": homeLastRemarkText(c), "All Remarks": (c.remarks || []).map(remarkText).join(" | "),
      "Added On": c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "",
      "Last Updated": c.lastRemarkAt ? new Date(c.lastRemarkAt).toLocaleString("en-IN") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Home Customers");
    XLSX.writeFile(wb, `Home-Customers_${fileTag()}.xlsx`);
  };

  // ── PDF export ─────────────────────────────────────────────────────────
  // Uses the same filters as the screen, so "Velachery + Interested" gives
  // exactly that list. Grouped area-wise by default — one section per area
  // with its own count — which doubles as the handoff sheet for a distributor.
  const downloadPDF = async () => {
    if (busyPdf) return;
    if (!filtered.length) { alert("No leads match the current filters."); return; }
    setBusyPdf(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 32;
      const NAVY = [8, 40, 25], TEAL = [23, 148, 74], GRID = [214, 220, 214], INK = [26, 32, 46], SUBTLE = [110, 118, 138];
      const tint = (c, k = 0.88) => c.map(v => Math.min(255, Math.round(v + (255 - v) * k)));
      const colorFor = (s) => HOME_STATUS_RGB[s] || SUBTLE;
      const scopeLine = filterLabel();

      const header = () => {
        const headerH = 70;
        doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, headerH, "F");
        doc.setFillColor(...TEAL); doc.rect(0, headerH - 2, pageW, 2, "F");
        const logoSize = 34, pad = 5, badge = logoSize + pad * 2;
        const bx = margin, by = (headerH - badge) / 2 - 1;
        doc.setFillColor(255, 255, 255); doc.roundedRect(bx, by, badge, badge, 8, 8, "F");
        try { doc.addImage(SRIDHI_LOGO_PNG, "PNG", bx + pad, by + pad, logoSize, logoSize); } catch (e) { /* logo optional */ }
        const tx = bx + badge + 14;
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
        doc.text("SRIDHI VENTURES — Home Customer Leads", tx, 29);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(200, 214, 205);
        doc.text(scopeLine ? `Filtered: ${scopeLine}` : "Area-wise lead register · ready for distributor handoff", tx, 44);
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...TEAL.map(v => Math.min(255, v + 70)));
        doc.text(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), pageW - margin, 28, { align: "right" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(200, 214, 205);
        doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 42, { align: "right" });
      };
      const footer = () => {
        const n = doc.internal.getNumberOfPages();
        for (let i = 1; i <= n; i++) {
          doc.setPage(i);
          doc.setDrawColor(...GRID); doc.line(margin, pageH - 26, pageW - margin, pageH - 26);
          doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SUBTLE);
          doc.text("Sridhi Ventures · Home Customer Leads · Confidential", margin, pageH - 13);
          doc.text(`Page ${i} of ${n}`, pageW - margin, pageH - 13, { align: "right" });
        }
      };

      header();

      // Headline + status chips
      let y = 92;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
      const areaSet = new Set(filtered.map(c => c.area || NO_AREA));
      doc.text(`${filtered.length} LEAD${filtered.length === 1 ? "" : "S"}  ·  ${areaSet.size} AREA${areaSet.size === 1 ? "" : "S"}`, margin, y);
      let chipX = margin; const chipY = y + 10;
      HOME_STATUSES.forEach(s => {
        const count = filtered.filter(c => (c.status || HOME_STATUSES[0]) === s).length;
        if (!count) return;
        const label = `${s}  ${count}`;
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
        const w = doc.getTextWidth(label) + 20;
        if (chipX + w > pageW - margin) return;
        const col = colorFor(s);
        doc.setDrawColor(...col); doc.setFillColor(...tint(col)); doc.roundedRect(chipX, chipY, w, 20, 6, 6, "FD");
        doc.setTextColor(...col); doc.text(label, chipX + 10, chipY + 14);
        chipX += w + 8;
      });
      y = chipY + 36;

      // Area spread — a compact bar chart (top 8 areas) so the shape of the
      // demand is visible before any rows.
      const spread = {};
      filtered.forEach(c => { const k = c.area || NO_AREA; spread[k] = (spread[k] || 0) + 1; });
      const spreadRows = Object.entries(spread).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (groupByArea && spreadRows.length > 1) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
        doc.text("LEADS BY AREA", margin, y);
        y += 8;
        const maxV = spreadRows[0][1];
        const labelW = 120, barMax = pageW - margin * 2 - labelW - 40;
        spreadRows.forEach(([area, count]) => {
          doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...INK);
          doc.text(doc.splitTextToSize(area, labelW - 8)[0], margin, y + 9);
          doc.setFillColor(...tint(TEAL, 0.85)); doc.roundedRect(margin + labelW, y, barMax, 11, 3, 3, "F");
          doc.setFillColor(...TEAL); doc.roundedRect(margin + labelW, y, Math.max(6, (count / maxV) * barMax), 11, 3, 3, "F");
          doc.setFont("helvetica", "bold"); doc.setTextColor(...NAVY);
          doc.text(String(count), margin + labelW + barMax + 8, y + 9);
          y += 15;
        });
        y += 10;
      }

      const showDistributor = filtered.some(c => c.distributor);
      const head = ["#", "Customer", "Contact", "Address", "Status", "Latest Remark"];
      if (showDistributor) head.push("Distributor");
      head.push("Map");
      const colCount = head.length;

      const makeRow = (c, i) => {
        const r = [String(i + 1), c.name + ((c.leadType || "Home") === "Mixed" ? "  (Mixed)" : ""), c.contact || "—", c.address || "—", c.status || HOME_STATUSES[0], homeLastRemarkText(c) || "—"];
        if (showDistributor) r.push(c.distributor || "—");
        r.push(normalizeMapLink(c.mapLink) ? "Open Map" : "—");
        return r;
      };
      const linkByRow = new Map(); // body row index -> url
      const body = [];
      const pushLead = (c, i) => { if (normalizeMapLink(c.mapLink)) linkByRow.set(body.length, normalizeMapLink(c.mapLink)); body.push(makeRow(c, i)); };

      if (groupByArea) {
        const groups = {};
        filtered.forEach(c => { const k = c.area || NO_AREA; (groups[k] = groups[k] || []).push(c); });
        Object.keys(groups).sort((a, b) => (a === NO_AREA) - (b === NO_AREA) || a.localeCompare(b)).forEach(area => {
          body.push([{ content: `${area.toUpperCase()}   ·   ${groups[area].length} lead${groups[area].length === 1 ? "" : "s"}`, colSpan: colCount, styles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 9.5, cellPadding: { top: 6, bottom: 6, left: 8, right: 8 } } }]);
          groups[area].forEach((c, i) => pushLead(c, i));
        });
      } else {
        head.splice(3, 0, "Area");
        // rebuild rows with an Area column when not grouped
        filtered.forEach((c, i) => {
          const r = makeRow(c, i); r.splice(3, 0, c.area || "—");
          if (normalizeMapLink(c.mapLink)) linkByRow.set(body.length, normalizeMapLink(c.mapLink));
          body.push(r);
        });
      }
      const mapIdx = head.length - 1;

      autoTable(doc, {
        startY: y,
        margin: { top: 90, bottom: 40, left: margin, right: margin },
        head: [head],
        body,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 6, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "middle", overflow: "linebreak" },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 248] },
        columnStyles: {
          0: { cellWidth: 24, halign: "center", textColor: SUBTLE },
          1: { fontStyle: "bold", cellWidth: 110 },
          2: { cellWidth: 78 },
          [head.indexOf("Status")]: { cellWidth: 92, fontStyle: "bold", halign: "center" },
          [mapIdx]: { cellWidth: 56, halign: "center", fontStyle: "bold" },
        },
        didParseCell: (d) => {
          if (d.section !== "body" || d.cell.colSpan > 1) return;
          if (d.column.index === head.indexOf("Status")) {
            const col = colorFor(d.cell.raw);
            d.cell.styles.textColor = col; d.cell.styles.fillColor = tint(col, 0.9);
          }
          if (d.column.index === mapIdx && d.cell.raw === "Open Map") { d.cell.styles.textColor = [14, 100, 200]; }
        },
        didDrawCell: (d) => {
          if (d.section === "body" && d.column.index === mapIdx && d.cell.raw === "Open Map") {
            const url = linkByRow.get(d.row.index);
            if (url) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url });
          }
        },
        didDrawPage: () => header(),
      });

      footer();
      doc.save(`Home-Customers_${fileTag()}.pdf`);
    } finally {
      setBusyPdf(false);
    }
  };

  const areaInput = (value, onChange) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Area</div>
      <input list="home-areas" value={value} onChange={onChange} placeholder="e.g. Velachery — pick or type new" style={inputStyle} />
      <datalist id="home-areas">{knownAreas.map(a => <option key={a} value={a} />)}</datalist>
    </div>
  );

  const leadFormFields = (f, setF, withDate) => (
    <>
      <Field label="Customer Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Priya Lakshmi" />
      <Field label="WhatsApp / Contact No" value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} placeholder="98765 43210" />
      {areaInput(f.area, e => setF({ ...f, area: e.target.value }))}
      <Field label="Address" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} placeholder="Door no, street, landmark" />
      <Field label="Map Location URL" value={f.mapLink} onChange={e => setF({ ...f, mapLink: e.target.value })} placeholder="Paste Google Maps link (or lat, long)" />
      <Dropdown label="Lead Type" value={f.leadType} onChange={e => setF({ ...f, leadType: e.target.value })} options={HOME_LEAD_TYPES} />
      <Dropdown label="Source" value={f.source} onChange={e => setF({ ...f, source: e.target.value })} options={HOME_SOURCES} />
      <Dropdown label="Telecaller (required)" value={f.telecaller} onChange={e => setF({ ...f, telecaller: e.target.value })} options={TELECALLERS} />
      {withDate && <Field label="Date" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />}
    </>
  );

  // ══ DETAIL VIEW ══════════════════════════════════════════════════════
  const selected = selectedId ? all.find(x => x.id === selectedId) : null;
  if (selected) {
    const c = selected;
    const st = c.status || HOME_STATUSES[0];
    const tel = c.contact ? String(c.contact).replace(/[^0-9]/g, "") : "";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 80 }}>
        <button onClick={closeDetail}
          style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, textAlign: "left", padding: "4px 0" }}>
          ← Back to Home Customers
        </button>

        <Card accent={HOME_STATUS_COLOR[st]}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.t1 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: T.t3, marginTop: 2 }}>{c.area || "No area yet"} · {c.leadType || "Home"} · {c.source || "—"}</div>
              <div style={{ marginTop: 8 }}><Chip label={st} color={HOME_STATUS_COLOR[st] || T.t3} /></div>
            </div>
            <button onClick={() => openEdit(c)}
              style={{ background: T.indigo + "18", border: `1px solid ${T.indigo}44`, borderRadius: 10, color: T.indigo, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, flexShrink: 0 }}>✎ Edit</button>
          </div>
          <div style={{ marginTop: 12 }}>
            {[["Contact", c.contact], ["Address", c.address], ["Telecaller", c.telecaller], ["Distributor", c.distributor]].map(([k, v]) => v ? (
              <div key={k} style={{ display: "flex", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 11, color: T.t3, width: 90, flexShrink: 0, fontWeight: 600 }}>{k}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.t1 }}>{v}</span>
              </div>
            ) : null)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {tel && <button onClick={() => { window.location.href = "tel:+91" + phoneKey(tel); }}
              style={{ flex: 1, minWidth: 90, background: T.emerald + "22", border: `1px solid ${T.emerald}44`, borderRadius: 10, color: T.emerald, padding: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📞 Call</button>}
            {tel && <button onClick={() => window.open("https://wa.me/91" + phoneKey(tel), "_blank", "noopener")}
              style={{ flex: 1, minWidth: 90, background: "#25D36622", border: "1px solid #25D36644", borderRadius: 10, color: "#25D366", padding: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>💬 WhatsApp</button>}
            {c.mapLink
              ? <button onClick={() => openMap(c)}
                  style={{ flex: 1, minWidth: 90, background: T.sky + "22", border: `1px solid ${T.sky}44`, borderRadius: 10, color: T.sky, padding: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📍 Open Map</button>
              : <button onClick={() => openEdit(c)}
                  style={{ flex: 1, minWidth: 90, background: "transparent", border: `1px dashed ${T.border}`, borderRadius: 10, color: T.t3, padding: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>+ Add map link</button>}
          </div>
        </Card>

        <Card>
          <Label sub="Update where this lead stands">Status</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {HOME_STATUSES.map(s => {
              const col = HOME_STATUS_COLOR[s];
              return (
                <button key={s} onClick={() => setStatus(c.id, s)}
                  style={{ background: st === s ? col + "22" : T.surface, border: `1px solid ${st === s ? col : T.border}`, borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: st === s ? col : T.t2, cursor: "pointer", fontFamily: FONT }}>{s}</button>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Assigned Distributor (once hired)</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={distributorDraft} onChange={e => setDistributorDraft(e.target.value)} placeholder={c.distributor || "Distributor name"} style={{ ...inputStyle, flex: 1 }} />
              <Btn label="Save" small onClick={() => saveDistributor(c.id)} disabled={distributorDraft.trim() === (c.distributor || "")} />
            </div>
          </div>
        </Card>

        <Card>
          <Label sub={`${(c.remarks || []).length} entries`}>Remarks</Label>
          {(c.remarks || []).length === 0 && <div style={{ fontSize: 12, color: T.t3, marginBottom: 12 }}>No remarks yet.</div>}
          {(c.remarks || []).slice().reverse().map((r, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0, background: SENTIMENT_COLOR[remarkSentimentOf(r)] }} />
              <span style={{ fontSize: 12, color: T.t2 }}>{remarkText(r)}</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <Dropdown label="Telecaller (required)" value={remarkTelecaller} onChange={e => setRemarkTelecaller(e.target.value)} options={TELECALLERS} />
            <Field label="Call Date" type="date" value={remarkDate} onChange={e => setRemarkDate(e.target.value)} />
          </div>
          <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Quick Tag (optional)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {REMARK_TAGS.map(tag => {
              const active = remarkTag && remarkTag.label === tag.label;
              const col = SENTIMENT_COLOR[tag.sentiment];
              return (
                <button key={tag.label} onClick={() => setRemarkTag(active ? null : tag)}
                  style={{ background: active ? col + "22" : T.surface, border: `1px solid ${active ? col : T.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: active ? col : T.t2, cursor: "pointer", fontFamily: FONT }}>{tag.label}</button>
              );
            })}
          </div>
          <textarea value={newRemark} onChange={e => setNewRemark(e.target.value)} rows={3} placeholder="Add extra detail (optional if a tag is picked)…"
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 13, fontFamily: FONT, outline: "none", width: "100%", boxSizing: "border-box", resize: "none", marginTop: 10 }} />
          <div style={{ marginTop: 8 }}><Btn label="Save Remark" full onClick={() => addRemark(c.id)} disabled={!newRemark.trim() && !remarkTag} /></div>
        </Card>

        <Btn label="🗑️ Delete Lead" color={T.rose} ghost full onClick={() => deleteLead(c)} />

        <Sheet open={showEdit} onClose={() => setShowEdit(false)} title="Edit Lead Details">
          {leadFormFields(editForm, setEditForm, false)}
          <Btn label="Save Changes" full onClick={saveEdit} disabled={!editForm.name.trim()} />
        </Sheet>
      </div>
    );
  }

  // ══ LIST VIEW ════════════════════════════════════════════════════════
  const pill = (active, color) => ({
    background: active ? color : "transparent", color: active ? "#FFFFFF" : T.t2,
    border: `1px solid ${active ? color : T.border}`, borderRadius: 20, padding: "6px 12px",
    fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap", flexShrink: 0,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 80 }}>
      <Card accent={T.sky}>
        <Label sub="Ad leads (Instagram → WhatsApp) — kept area-wise until distributors are hired">Home Customers</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[["Total", kpi.total, T.sky], ["New", kpi.fresh, T.indigo], ["Awaiting Distributor", kpi.waiting, T.amber], ["Areas", kpi.areas, T.emerald]].map(([label, n, col]) => (
            <div key={label} style={{ flex: 1, minWidth: 70, background: col + "14", border: `1px solid ${col}44`, borderRadius: 12, padding: "9px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: col }}>{n}</div>
              <div style={{ fontSize: 9.5, color: col, fontWeight: 700, marginTop: 1, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Btn label="+ Add Lead" onClick={() => { setForm(emptyForm()); setShowAdd(true); }} />
          <Btn label="📥 Bulk Import" ghost onClick={() => { setShowImport(true); setImportPreview(null); }} />
          <Btn label="🔀 Split Equally" color={T.indigo} onClick={() => { setShowSplit(true); setSplitPreview(null); }} />
          <Btn label="📇 Bulk Message" ghost color={T.emerald} onClick={() => setShowBulkMsg(true)} />
          <Btn label={selectMode ? "✕ Cancel Select" : "☑️ Select"} ghost small onClick={toggleSelectMode} />
          <Btn label={busyPdf ? "Preparing…" : "📄 PDF"} ghost onClick={downloadPDF} />
          <Btn label="📊 Excel" ghost onClick={downloadExcel} />
          <SyncBadge status={syncStatus} onRetry={retrySync} error={syncError} />
        </div>
      </Card>

      <Card>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search name, number, area, address…" style={{ ...inputStyle, marginBottom: 12 }} />

        <div style={{ fontSize: 10.5, color: T.t3, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6 }}>AREA</div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
          <button onClick={() => setAreaFilter("All")} style={pill(areaFilter === "All", T.sky)}>All · {all.length}</button>
          {areaCounts.map(([a, n]) => (
            <button key={a} onClick={() => setAreaFilter(areaFilter === a ? "All" : a)} style={pill(areaFilter === a, T.sky)}>{a} · {n}</button>
          ))}
        </div>

        <div style={{ fontSize: 10.5, color: T.t3, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 6 }}>STATUS</div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
          <button onClick={() => setStatusFilter("All")} style={pill(statusFilter === "All", T.accent)}>All</button>
          {HOME_STATUSES.map(s => {
            const n = all.filter(c => (c.status || HOME_STATUSES[0]) === s).length;
            return <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "All" : s)} style={pill(statusFilter === s, HOME_STATUS_COLOR[s])}>{s} · {n}</button>;
          })}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, color: T.t3, fontWeight: 700, letterSpacing: "0.04em" }}>TYPE</span>
          {["All", ...HOME_LEAD_TYPES].map(t => <button key={t} onClick={() => setTypeFilter(t)} style={pill(typeFilter === t, T.indigo)}>{t}</button>)}
          <span style={{ flex: 1 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.t2, fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={groupByArea} onChange={e => setGroupByArea(e.target.checked)} /> PDF grouped by area
          </label>
        </div>
      </Card>

      <div style={{ fontSize: 11, color: T.t3, fontWeight: 600, padding: "0 4px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>{filtered.length} lead{filtered.length === 1 ? "" : "s"}{filterLabel() ? " · " + filterLabel() : ""}{search ? ` · “${search}”` : ""} · PDF/Excel export exactly what's shown</span>
        {selectMode && (
          <>
            <span style={{ color: T.emerald, fontWeight: 700 }}>· {selectedIds.size} selected</span>
            <button onClick={() => setSelectedIds(new Set(filtered.map(c => c.id)))} style={{ background: "none", border: "none", color: T.accent, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT, padding: 0 }}>Select all filtered</button>
            {selectedIds.size > 0 && <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", color: T.t3, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT, padding: 0 }}>Clear</button>}
          </>
        )}
      </div>

      {all.length === 0 && (
        <div style={{ textAlign: "center", color: T.t3, fontSize: 13, padding: 40 }}>No home customers yet. Tap “+ Add Lead” to start.</div>
      )}
      {all.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: "center", color: T.t3, fontSize: 13, padding: 30 }}>Nothing matches these filters.</div>
      )}

      {filtered.map(c => {
        const st = c.status || HOME_STATUSES[0];
        const last = homeLastRemarkText(c);
        return (
          <div key={c.id} onClick={() => { if (selectMode) toggleSelected(c.id); else { setDistributorDraft(c.distributor || ""); requestOpen(c); } }}
            style={{ background: T.card, border: `1px solid ${selectMode && selectedIds.has(c.id) ? T.emerald : T.border}`, borderLeft: `4px solid ${HOME_STATUS_COLOR[st] || T.border}`, borderRadius: 14, padding: 14, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            {selectMode && (
              <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} onClick={e => e.stopPropagation()}
                style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>{c.name}{(c.leadType || "Home") === "Mixed" && <span style={{ marginLeft: 6 }}><Chip label="Mixed" color={T.indigo} small /></span>}</div>
              <div style={{ fontSize: 11, color: T.t3, marginTop: 2 }}>{c.area || "No area yet"}{c.distributor ? ` · 🚚 ${c.distributor}` : ""}{c.telecaller ? ` · 👤 ${c.telecaller}` : ""}</div>
              {c.contact && <div style={{ fontSize: 11, color: T.accent, marginTop: 2, fontWeight: 600 }}>📞 {c.contact}</div>}
              {c.address && <div style={{ fontSize: 11, color: T.t2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>🏠 {c.address}</div>}
              {last && <div style={{ fontSize: 11, color: T.t2, marginTop: 4 }}>💬 {last.slice(0, 60)}</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
              <Chip label={st} color={HOME_STATUS_COLOR[st] || T.t3} />
              {c.mapLink && (
                <button onClick={e => { e.stopPropagation(); openMap(c); }}
                  style={{ background: T.sky + "18", border: `1px solid ${T.sky}44`, borderRadius: 8, color: T.sky, padding: "3px 9px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📍 Map</button>
              )}
              <span style={{ fontSize: 10, color: T.t3 }}>{formatLastContact(c.lastRemarkAt || c.createdAt)}</span>
            </div>
          </div>
        );
      })}

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Add Home Customer Lead">
        {leadFormFields(form, setForm, true)}
        <Btn label="Add Lead" full onClick={addLead} disabled={!form.name.trim()} />
      </Sheet>

      <Sheet open={showImport} onClose={() => setShowImport(false)} title="Bulk Import Home Customers">
        <div style={{ fontSize: 12, color: T.t2, marginBottom: 12, lineHeight: 1.5 }}>
          Paste rows straight from Excel or Google Sheets — with or without
          a header row. Any of these columns are recognized in any order:{" "}
          <b>Name, Phone/Contact, Area, Address, Map Link, Remark/Status, Telecaller</b>.
          A row with only a phone number is fine too. Re-importing an
          updated sheet is safe: rows are matched by phone number and merged
          into the existing lead instead of duplicated.
        </div>
        <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportPreview(null); }} rows={8}
          placeholder={"Paste your data here… even just a list of phone numbers works, e.g.\n9876543210\n9123456780"}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12 }} />
        <Dropdown label="Telecaller for this whole batch *" value={importDefaultTc} onChange={e => { setImportDefaultTc(e.target.value); setImportPreview(null); }} options={TELECALLERS} />
        <div style={{ fontSize: 11, color: T.t3, marginTop: -8, marginBottom: 12, lineHeight: 1.4 }}>
          Every row is marked as <b style={{ color: T.t1 }}>{importDefaultTc}</b>'s, unless the paste itself has a Telecaller column with different names per row.
        </div>

        <BatchTitleField value={importTitle} onChange={v => { setImportTitle(v); setImportPreview(null); }} />
        {!importPreview ? (
          <Btn label="Preview Import" full ghost onClick={runImportPreview} disabled={!importText.trim() || !importTitle.trim()} />
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.emerald }}>{importPreview.rows.length}</div>
                <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>Ready to Import</div>
              </div>
              {importPreview.skipped > 0 && (
                <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.rose }}>{importPreview.skipped}</div>
                  <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>Skipped (blank row)</div>
                </div>
              )}
            </div>
            {importPreview.rows.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 12 }}>
                {importPreview.rows.slice(0, 8).map((row, i) => (
                  <div key={i} style={{ padding: "8px 10px", borderBottom: i < Math.min(importPreview.rows.length, 8) - 1 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.t1 }}>{row.name || <span style={{ fontStyle: "italic", color: T.t3 }}>No name</span>} <span style={{ fontWeight: 400, color: T.t3 }}>{row.contact ? "· " + row.contact : ""}</span></div>
                    <div style={{ fontSize: 10.5, color: T.t3, marginTop: 1 }}>{row.area || "No area"} {row.remark ? "· " + row.remark : ""} {row.telecaller ? "· " + row.telecaller : ""}</div>
                  </div>
                ))}
                {importPreview.rows.length > 8 && <div style={{ padding: "8px 10px", fontSize: 11, color: T.t3, fontStyle: "italic" }}>+ {importPreview.rows.length - 8} more…</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn label="Edit Data" ghost onClick={() => setImportPreview(null)} />
              <Btn label={importing ? "Importing…" : `Import ${importPreview.rows.length} Lead${importPreview.rows.length === 1 ? "" : "s"}`} color={T.emerald}
                onClick={commitImport} disabled={importing || !importPreview.rows.length} />
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={showSplit} onClose={() => setShowSplit(false)} title="🔀 Split Equally">
        <div style={{ fontSize: 12, color: T.t2, marginBottom: 12, lineHeight: 1.5 }}>
          Paste a fresh batch of numbers — bulk (one per line) or type them
          in one by one — pick who's working today, and this splits the
          batch evenly between them. Each new lead lands in the main list
          exactly like any other — the telecaller filters by their own name
          afterward to see their slice.
        </div>
        <textarea value={splitText} onChange={e => { setSplitText(e.target.value); setSplitPreview(null); }} rows={7}
          placeholder={"9876543210\n9123456780\n9988776655\n…"}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12 }} />
        {areaInput(splitArea, e => setSplitArea(e.target.value))}
        <div style={{ fontSize: 11, color: T.t2, marginTop: 4, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Split Between</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {TELECALLERS.map(t => {
            const active = splitTelecallers.has(t);
            return (
              <button key={t} onClick={() => { toggleSplitTelecaller(t); setSplitPreview(null); }} style={{
                background: active ? T.indigo + "22" : T.surface, border: `1px solid ${active ? T.indigo : T.border}`,
                borderRadius: 20, padding: "7px 13px", fontSize: 12, fontWeight: 700,
                color: active ? T.indigo : T.t3, cursor: "pointer", fontFamily: FONT,
              }}>{active ? "✓ " : ""}{t}</button>
            );
          })}
        </div>

        <BatchTitleField value={splitTitle} onChange={setSplitTitle} />
        {!splitPreview ? (
          <Btn label="🔀 Split Equally" full color={T.indigo} onClick={buildSplitPreview} disabled={!splitText.trim() || !splitTitle.trim() || !splitTelecallers.size} />
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.emerald }}>{splitPreview.total}</div>
                <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>To Split</div>
              </div>
              {splitPreview.skipped > 0 && (
                <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.rose }}>{splitPreview.skipped}</div>
                  <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>Already Exist</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {splitPreview.buckets.map(b => {
                const bc = telecallerColor(b.telecaller);
                return (
                  <div key={b.telecaller} style={{
                    background: bc + "14", border: `1.5px solid ${bc}55`, borderRadius: 12, padding: "10px 12px",
                    animation: isShuffling ? "shuffleBounce 0.38s ease" : "none",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: bc }}>{b.telecaller}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: bc, background: bc + "22", borderRadius: 20, padding: "2px 9px" }}>{b.contacts.length} number{b.contacts.length === 1 ? "" : "s"}</div>
                    </div>
                    <div style={{ fontSize: 10.5, color: T.t3, lineHeight: 1.6 }}>
                      {b.contacts.slice(0, 6).map(c => c.name || c.contact).join(" · ")}
                      {b.contacts.length > 6 && ` +${b.contacts.length - 6} more`}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn label={isShuffling ? "🎲 Shuffling…" : "🔀 Shuffle"} ghost color={T.indigo} disabled={isShuffling} onClick={shuffleSplit} />
              <Btn label="Edit Data" ghost onClick={() => setSplitPreview(null)} />
              <Btn label={splitCommitting ? "Adding…" : `✅ Add ${splitPreview.total} — Split Evenly`} color={T.emerald}
                onClick={commitSplit} disabled={splitCommitting || !splitPreview.total} />
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={showBulkMsg} onClose={() => setShowBulkMsg(false)} title="📇 Bulk Message / Export Contacts">
        <div style={{ fontSize: 12, color: T.t3, marginBottom: 14, lineHeight: 1.5 }}>
          {selectedIds.size
            ? `Using ${bulkTargets.length} selected customer${bulkTargets.length === 1 ? "" : "s"} with a phone number.`
            : `Using all ${bulkTargets.length} currently filtered customer${bulkTargets.length === 1 ? "" : "s"} with a phone number. Tap "☑️ Select" on the list to pick specific ones instead.`}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <Btn label="⬇️ Download Contacts (vCard)" ghost onClick={exportContactsVCF} />
          <Btn label="⬇️ Download Excel" ghost onClick={exportContactsExcel} />
          <Btn label="📋 Copy All Numbers" ghost onClick={copyAllNumbers} />
        </div>
        <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>
          Message (use {"{name}"} to personalize)
        </div>
        <textarea value={bulkMsgText} onChange={e => setBulkMsgText(e.target.value)} rows={4}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 13, fontFamily: FONT, outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 14 }} />
        <div style={{ fontSize: 11, color: T.t3, marginBottom: 8, lineHeight: 1.4 }}>
          WhatsApp doesn't allow a true one-tap "send to everyone" from outside
          its own app — tap <b style={{ color: T.t1 }}>Send</b> next to each name below
          to open WhatsApp with the message ready to go, one chat at a time.
        </div>
        <div style={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
          {bulkTargets.length === 0 && <div style={{ padding: 14, fontSize: 12, color: T.t3, textAlign: "center" }}>No contacts with a phone number in this selection.</div>}
          {bulkTargets.map((c, i) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: i < bulkTargets.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ fontSize: 10.5, color: T.t3 }}>{c.contact}</div>
              </div>
              <button onClick={() => sendBulkOne(c)} style={{ background: "#25D36622", border: "1px solid #25D36644", borderRadius: 8, color: "#25D366", padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, flexShrink: 0 }}>💬 Send</button>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!pendingOpen} onClose={closeKeyPrompt} title="Enter Your Key">
        <div style={{ fontSize: 12.5, color: T.t3, marginBottom: 14 }}>
          {pendingOpen && `"${pendingOpen.name || "This lead"}" belongs to ${pendingOpen.telecaller || "an unassigned telecaller"}. Enter your key to open it.`}
        </div>
        <input
          type="password"
          value={openKeyValue}
          onChange={e => { setOpenKeyValue(e.target.value); setOpenKeyError(""); }}
          onKeyDown={e => { if (e.key === "Enter") submitOpenKey(); }}
          autoFocus
          placeholder="Secret key"
          style={{
            width: "100%", boxSizing: "border-box", background: T.surface,
            border: `1.5px solid ${openKeyError ? T.rose : T.border}`, borderRadius: 12,
            padding: "13px 14px", fontSize: 17, fontWeight: 800, color: T.t1,
            textAlign: "center", letterSpacing: "0.05em", fontFamily: FONT, outline: "none",
          }}
        />
        {openKeyError === "wrong" && <div style={{ color: T.rose, fontSize: 12, fontWeight: 700, marginTop: 9 }}>Wrong key — try again.</div>}
        {openKeyError === "notyours" && pendingOpen && (
          <div style={{ color: T.rose, fontSize: 12, fontWeight: 700, marginTop: 9 }}>This lead belongs to {pendingOpen.telecaller || "another telecaller"} — you can't open someone else's data.</div>
        )}
        <div style={{ marginTop: 14 }}>
          <Btn label="Unlock" full onClick={submitOpenKey} disabled={!openKeyValue} />
        </div>
      </Sheet>
    </div>
  );
}

// ─── SAMPLES ──────────────────────────────────────────────────────────────
// ─── HIRING / CANDIDATE TRACKING ───────────────────────────────────────────
// A telecaller-style CRM for recruitment: candidates flow through a pipeline
// (New Applicant → Contacted → Interview Scheduled → Interviewed → Selected
// → Joined, with Rejected/Not Interested/On Hold as side exits), same remark
// timeline + scheduling pattern as Hub Distributors, so it needs no new UI
// vocabulary to learn.
const HIRING_ROLES_DEFAULT = ["Telecaller", "Driver", "Accountant", "Field Sales", "Packing Staff", "HR Executive", "Delivery Staff"];
const HIRING_STAGES = ["New Applicant", "Contacted", "Interview Scheduled", "Interviewed", "Selected", "Joined", "On Hold", "Rejected", "Not Interested"];
const HIRING_STAGE_COLOR = {
  "New Applicant": T.sky, "Contacted": T.indigo, "Interview Scheduled": T.amber,
  "Interviewed": T.orange, "Selected": T.emerald, "Joined": T.accent,
  "On Hold": T.t3, "Rejected": T.rose, "Not Interested": T.t4,
};
const HIRING_STAGE_RGB = {
  "New Applicant": [14, 130, 190], "Contacted": [76, 95, 224], "Interview Scheduled": [180, 110, 5],
  "Interviewed": [217, 119, 6], "Selected": [16, 150, 100], "Joined": [23, 148, 74],
  "On Hold": [138, 151, 168], "Rejected": [200, 45, 60], "Not Interested": [162, 176, 170],
};
const HIRING_TERMINAL = ["Rejected", "Not Interested"];
const HIRING_SOURCES = ["Referral", "WhatsApp Group", "Naukri/Job Portal", "Walk-in", "Newspaper", "Other"];
const HIRING_ROLE_OTHER = "Other (type new role)";
const HIRING_ROLE_PICK = "— Select role —";

// One-tap call-outcome presets — tapping one instantly logs that remark and,
// where it makes sense (Interview Scheduled / Not Interested / Selected /
// Joined), moves the candidate's pipeline stage in the same tap so a
// telecaller doesn't have to log the remark AND separately hunt for the
// matching stage button.
const HIRING_QUICK_REMARKS = [
  { label: "Interested",           tag: "Interested",           sentiment: "positive", stage: null },
  { label: "Ring / No Response",   tag: "Ring No Response",     sentiment: "negative", stage: null },
  { label: "Busy — Call Later",    tag: "Busy",                 sentiment: "neutral",  stage: null },
  { label: "Interview Scheduled",  tag: "Interview Scheduled",  sentiment: "positive", stage: "Interview Scheduled" },
  { label: "Selected",             tag: "Selected",             sentiment: "positive", stage: "Selected" },
  { label: "Joined",               tag: "Joined",                sentiment: "positive", stage: "Joined" },
  { label: "Not Interested",       tag: "Not Interested",       sentiment: "negative", stage: "Not Interested" },
  { label: "Others",               tag: null,                   sentiment: "neutral",  stage: null },
];


function hiringId() { return "hi_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function hiringStageColor(stage) { return HIRING_STAGE_COLOR[stage] || T.t3; }
function hiringStageRgb(stage) { return HIRING_STAGE_RGB[stage] || [110, 118, 138]; }
function hiringLastRemarkText(c) {
  const r = c.remarks || [];
  return r.length ? remarkText(r[r.length - 1]) : "";
}

// Parses a pasted batch of candidates (WhatsApp forward, Excel paste, or a
// plain list of "Name - 9876543210" lines) into import-ready rows. Same
// header-detection + freeform fallback approach as the other bulk-import
// screens, so anyone who has already used Bulk Import elsewhere in the app
// doesn't have to learn a new format.
function parseHiringBulkImport(text, batchRole, batchAssignedTo) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, "")).filter(l => l.trim() !== "");
  if (!lines.length) return { rows: [], skipped: 0 };

  const hasTab = lines[0].includes("\t");
  const hasComma = lines.some(l => l.includes(","));
  const delim = hasTab ? "\t" : (hasComma ? "," : null);
  const rawRows = lines.map(l => delim ? parseDelimitedLine(l, delim) : [l.trim()]);

  const headerCandidate = rawRows[0].map(h => h.toLowerCase().trim());
  const findCol = (...keywords) => headerCandidate.findIndex(h => keywords.some(k => h.includes(k)));
  const looksLikeHeader = delim && (
    findCol("phone", "contact", "number", "mobile") >= 0 || findCol("name") >= 0 || findCol("role", "position") >= 0
  ) && rawRows[0].every(c => !/^\+?[\d\s-]{7,}$/.test(c.trim()));

  let colMap = null, dataRows;
  if (looksLikeHeader) {
    colMap = {
      name: findCol("name"),
      contact: findCol("phone", "number", "contact", "mobile"),
      role: findCol("role", "position", "applying", "post"),
      area: findCol("area", "location"),
      experience: findCol("experience", "exp"),
      source: findCol("source", "reference"),
      remark: findCol("remark", "note", "status"),
    };
    dataRows = rawRows.slice(1);
  } else if (delim) {
    // No header detected — fall back to a progressive column order so a
    // short paste (even just Name, Contact) still works sensibly.
    const order = ["name", "contact", "role", "area", "experience"];
    colMap = {}; order.forEach((key, i) => { colMap[key] = i; });
    colMap.source = -1; colMap.remark = -1;
    dataRows = rawRows;
  } else {
    dataRows = rawRows; // single freeform column — parsed per-line below
  }

  const get = (row, idx) => (idx !== undefined && idx >= 0 && idx < row.length) ? row[idx].trim() : "";

  const rows = [];
  let skipped = 0;
  dataRows.forEach(row => {
    let name, contact, role, area, experience, source, remark;
    if (colMap) {
      name = get(row, colMap.name);
      contact = get(row, colMap.contact);
      role = get(row, colMap.role);
      area = get(row, colMap.area);
      experience = get(row, colMap.experience);
      source = get(row, colMap.source);
      remark = get(row, colMap.remark);
      if (contact) {
        const { phone, remainder } = extractPhoneAndRemainder(contact);
        if (phone) {
          contact = phone;
          if (remainder && !name) name = remainder;
        }
      }
    } else {
      const val = row[0] || "";
      const { phone, remainder } = extractPhoneAndRemainder(val);
      contact = phone;
      const split = classifyNameOrRemark(remainder);
      name = split.name;
      remark = split.remark;
      role = ""; area = ""; experience = ""; source = "";
    }
    if (!name && !contact) { if (row.some(c => (c || "").trim())) skipped++; return; }
    if (/^(candidate\s*)?name$/i.test(name) && !contact) { skipped++; return; } // stray header row
    rows.push({
      name: name || "", contact: contact || "",
      role: batchRole || role || "", area: area || "", experience: experience || "",
      source: source || "", remark: remark || "",
      assignedTo: batchAssignedTo || "",
    });
  });
  return { rows, skipped };
}

function Hiring() {
  const [rows, setRows, syncStatus, retrySync, syncError] = useSheetSynced("hiring", "hiring", []);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [assignedFilter, setAssignedFilter] = useState("All");
  const [followupFilter, setFollowupFilter] = useState("All"); // All | overdue | today | tomorrow | upcoming | none
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const emptyForm = () => ({
    name: "", contact: "", role: HIRING_ROLES_DEFAULT[0], customRole: "",
    area: "", experience: "", expectedSalary: "", source: HIRING_SOURCES[0],
    assignedTo: TELECALLERS[TELECALLERS.length - 1], date: todayISO(),
  });
  const [form, setForm] = useState(emptyForm());
  const [editForm, setEditForm] = useState(emptyForm());
  const [newRemark, setNewRemark] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [scheduleNoteDraft, setScheduleNoteDraft] = useState("");

  // ── Bulk import ──
  const [importText, setImportText] = useState("");
  const [importRole, setImportRole] = useState("");
  const [importCustomRole, setImportCustomRole] = useState("");
  // The role picked for the whole batch (Driver → every row is a Driver; Other → typed manually).
  const finalImportRole = importRole === HIRING_ROLE_OTHER ? importCustomRole.trim() : (importRole === HIRING_ROLE_PICK ? "" : importRole);
  const [importAssignedTo, setImportAssignedTo] = useState(TELECALLERS[TELECALLERS.length - 1]);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importTitle, setImportTitle] = useState("");

  // ── Report ──
  const [reportKind, setReportKind] = useState("all"); // all | overview | scheduled | calling | joined
  const [reportPreset, setReportPreset] = useState("This Month");
  const [reportFrom, setReportFrom] = useState(() => { const d = new Date(); d.setDate(1); return localISO(d); });
  const [reportTo, setReportTo] = useState(todayISO());
  const [reportRole, setReportRole] = useState("All");
  const [generatingReport, setGeneratingReport] = useState(false);

  const applyReportPreset = (preset) => {
    setReportPreset(preset);
    const now = new Date();
    if (preset === "Today") { setReportFrom(todayISO()); setReportTo(todayISO()); }
    else if (preset === "This Week") {
      const day = now.getDay() || 7;
      const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
      setReportFrom(localISO(monday)); setReportTo(todayISO());
    } else if (preset === "This Month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setReportFrom(localISO(first)); setReportTo(todayISO());
    }
  };

  const all = rows || [];
  const selected = all.find(c => c.id === selectedId) || null;

  const roleOptions = useMemo(() => {
    const set = new Set(HIRING_ROLES_DEFAULT);
    all.forEach(c => { if (c.role) set.add(c.role); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return all
      .filter(c => roleFilter === "All" || (c.role || "—") === roleFilter)
      .filter(c => stageFilter === "All" || (c.stage || HIRING_STAGES[0]) === stageFilter)
      .filter(c => assignedFilter === "All" || (c.assignedTo || "") === assignedFilter)
      .filter(c => {
        if (followupFilter === "All") return true;
        const urg = hubVisitUrgency(c.scheduledAt);
        if (followupFilter === "none") return !c.scheduledAt;
        return urg === followupFilter;
      })
      .filter(c => !q || (c.name || "").toLowerCase().includes(q) || (c.role || "").toLowerCase().includes(q) ||
        (c.area || "").toLowerCase().includes(q) || (qDigits.length >= 3 && phoneKey(c.contact).includes(qDigits)))
      .sort((a, b) => {
        // Overdue/today follow-ups first, then most recently touched.
        const ua = hubVisitUrgency(a.scheduledAt), ub = hubVisitUrgency(b.scheduledAt);
        const rank = (u) => u === "overdue" ? 0 : u === "today" ? 1 : u === "tomorrow" ? 2 : u === "upcoming" ? 3 : 4;
        const ra = rank(ua), rb = rank(ub);
        if (ra !== rb) return ra - rb;
        return (b.lastRemarkAt || b.createdAt || 0) - (a.lastRemarkAt || a.createdAt || 0);
      });
  }, [all, search, roleFilter, stageFilter, assignedFilter, followupFilter]);

  const dueList = useMemo(() => all
    .filter(c => c.scheduledAt && !HIRING_TERMINAL.includes(c.stage) && c.stage !== "Joined")
    .map(c => ({ c, urgency: hubVisitUrgency(c.scheduledAt) }))
    .filter(x => x.urgency === "overdue" || x.urgency === "today")
    .sort((a, b) => a.c.scheduledAt.localeCompare(b.c.scheduledAt)),
    [all]);

  const kpi = useMemo(() => {
    const monthStart = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); })();
    return {
      total: all.length,
      due: dueList.length,
      joined: all.filter(c => c.stage === "Joined" && (c.joinedAt || 0) >= monthStart).length,
      openRoles: new Set(all.filter(c => !HIRING_TERMINAL.includes(c.stage) && c.stage !== "Joined").map(c => c.role).filter(Boolean)).size,
    };
  }, [all, dueList]);

  const dateWithNow = (dateStr) => {
    const now = new Date();
    const d = new Date((dateStr || todayISO()) + "T00:00:00");
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return d.getTime();
  };

  const addCandidate = () => {
    if (!form.name.trim()) { alert("Enter the candidate's name."); return; }
    const finalRole = form.role === HIRING_ROLE_OTHER ? form.customRole.trim() : form.role;
    if (!finalRole) { alert("Pick a role, or type a new one."); return; }
    const key = phoneKey(form.contact);
    if (key.length >= 10) {
      const dup = all.find(c => phoneKey(c.contact) === key);
      if (dup && !window.confirm(`This number is already saved as "${dup.name}" (${dup.role}).\n\nAdd it again anyway?`)) return;
    }
    const at = dateWithNow(form.date);
    const firstEntry = { text: `[${homeStamp(at)} · ${form.assignedTo}] Candidate added (${form.source})`, telecaller: form.assignedTo, at };
    setRows([{
      id: hiringId(),
      name: form.name.trim(),
      contact: form.contact.trim(),
      role: finalRole,
      area: form.area.trim(),
      experience: form.experience.trim(),
      expectedSalary: form.expectedSalary.trim(),
      source: form.source,
      stage: HIRING_STAGES[0],
      assignedTo: form.assignedTo,
      scheduledAt: "",
      scheduledNote: "",
      remarks: [firstEntry],
      lastRemarkAt: at,
      createdAt: at,
      joinedAt: null,
      rejectedReason: "",
    }, ...all]);
    setForm(emptyForm());
    setShowAdd(false);
  };

  const updateCandidate = (id, patch) => setRows(all.map(c => c.id === id ? { ...c, ...patch } : c));

  const addRemarkTo = (id, text, tag) => {
    const t = (text || "").trim();
    if (!t) return;
    const c = all.find(x => x.id === id);
    if (!c) return;
    const at = Date.now();
    const entry = { text: `[${homeStamp(at)} · ${c.assignedTo || "—"}] ${t}`, telecaller: c.assignedTo, at, tag: tag || null };
    updateCandidate(id, { remarks: [...(c.remarks || []), entry], lastRemarkAt: at });
  };

  const setStage = (id, stage, remarkLabel) => {
    const c = all.find(x => x.id === id);
    if (!c) return;
    const patch = { stage };
    if (stage === "Joined") patch.joinedAt = Date.now();
    if (HIRING_TERMINAL.includes(stage) && !HIRING_TERMINAL.includes(c.stage)) {
      // A quick-remark tap already carries its own reason (e.g. "Not
      // Interested") — only interrupt with a prompt when the stage was
      // changed some other way (the Move Stage buttons).
      patch.rejectedReason = remarkLabel || window.prompt(`Reason for "${stage}"? (optional)`, "") || "";
    }
    addRemarkTo(id, remarkLabel || `Stage moved to "${stage}"`);
    updateCandidate(id, patch);
  };

  // One-tap call-outcome buttons (Interested / Ring-No-Response / Not
  // Interested / Interview Scheduled / Busy / Selected / Joined / Others).
  // Logs the remark and — for outcomes that clearly mean a stage change —
  // moves the pipeline stage in the same tap, in one combined history entry
  // instead of two separate ones.
  const applyQuickRemark = (id, item) => {
    if (item.tag === null && item.label === "Others") { setNewRemark(""); return; } // just focus the free-text box
    if (item.stage) { setStage(id, item.stage, item.label); return; }
    addRemarkTo(id, item.label, item.tag);
  };

  const saveSchedule = (id) => {
    const c = all.find(x => x.id === id);
    if (!c) return;
    updateCandidate(id, { scheduledAt: scheduleDraft, scheduledNote: scheduleNoteDraft.trim() });
    if (scheduleDraft) addRemarkTo(id, `Follow-up/interview scheduled for ${formatVisitDate(scheduleDraft)}${scheduleNoteDraft.trim() ? " — " + scheduleNoteDraft.trim() : ""}`);
  };

  const deleteCandidate = (id) => {
    const c = all.find(x => x.id === id);
    if (!c) return;
    if (!window.confirm(`Remove "${c.name}" from the hiring tracker? This can't be undone.`)) return;
    setRows(all.filter(x => x.id !== id));
    setSelectedId(null);
  };

  const openDetail = (c) => {
    setSelectedId(c.id);
    setScheduleDraft(c.scheduledAt || "");
    setScheduleNoteDraft(c.scheduledNote || "");
    setNewRemark("");
  };

  // ── Edit candidate details (name/contact/role/area/experience/salary/
  // source/handled-by) — everything except stage and remarks, which have
  // their own dedicated controls above. ──
  const openEditCandidate = (c) => {
    const knownRole = roleOptions.includes(c.role);
    setEditForm({
      name: c.name || "", contact: c.contact || "",
      role: knownRole ? c.role : HIRING_ROLE_OTHER, customRole: knownRole ? "" : (c.role || ""),
      area: c.area || "", experience: c.experience || "", expectedSalary: c.expectedSalary || "",
      source: c.source || HIRING_SOURCES[0], assignedTo: c.assignedTo || TELECALLERS[TELECALLERS.length - 1],
      date: todayISO(),
    });
    setShowEdit(true);
  };
  const saveEditCandidate = () => {
    if (!selected) return;
    if (!editForm.name.trim()) { alert("Enter the candidate's name."); return; }
    const finalRole = editForm.role === HIRING_ROLE_OTHER ? editForm.customRole.trim() : editForm.role;
    if (!finalRole) { alert("Pick a role, or type a new one."); return; }
    updateCandidate(selected.id, {
      name: editForm.name.trim(), contact: editForm.contact.trim(), role: finalRole,
      area: editForm.area.trim(), experience: editForm.experience.trim(),
      expectedSalary: editForm.expectedSalary.trim(), source: editForm.source, assignedTo: editForm.assignedTo,
    });
    addRemarkTo(selected.id, "Details updated");
    setShowEdit(false);
  };

  // ── Bulk import ──

  const runImportPreview = () => {
    const { rows: parsed, skipped } = parseHiringBulkImport(importText, finalImportRole, importAssignedTo);
    setImportPreview({ rows: parsed, skipped });
  };
  const commitImport = () => {
    if (!importPreview || !importPreview.rows.length) return;
    if (!importTitle.trim()) { alert("Please enter a Batch Title / Heading first."); return; }
    const bt = importTitle.trim();
    setImporting(true);
    const now = Date.now();
    const existingKeys = new Set(all.map(c => phoneKey(c.contact)).filter(k => k.length >= 10));
    const toAdd = [];
    let dupCount = 0;
    importPreview.rows.forEach((r, i) => {
      const key = phoneKey(r.contact);
      if (key.length >= 10 && existingKeys.has(key)) { dupCount++; return; }
      if (key.length >= 10) existingKeys.add(key);
      const at = now + i;
      toAdd.push({
        id: hiringId(), name: r.name, contact: r.contact,
        role: finalImportRole || r.role || HIRING_ROLES_DEFAULT[0], batchTitle: bt,
        area: r.area, experience: r.experience, expectedSalary: "",
        source: r.source || HIRING_SOURCES[0], stage: HIRING_STAGES[0],
        assignedTo: r.assignedTo || importAssignedTo,
        scheduledAt: "", scheduledNote: "",
        remarks: [{ text: `[${homeStamp(at)} · ${r.assignedTo || importAssignedTo}] Imported (${bt})${r.remark ? " — " + r.remark : ""}`, telecaller: r.assignedTo || importAssignedTo, at }],
        lastRemarkAt: at, createdAt: at, joinedAt: null, rejectedReason: "",
      });
    });
    setRows([...toAdd, ...all]);
    setImporting(false);
    setShowImport(false);
    setImportText(""); setImportPreview(null); setImportTitle(""); setImportRole(""); setImportCustomRole("");
    window.alert(`Imported ${toAdd.length} candidate${toAdd.length === 1 ? "" : "s"}.${dupCount ? ` Skipped ${dupCount} duplicate number${dupCount === 1 ? "" : "s"}.` : ""}`);
  };

  // ── PDF report — Overview / Scheduled / Calling Log / Joined, or all four
  // combined, each its own clearly-labeled section/page so it reads as a
  // real management report rather than a raw data dump. ──
  const downloadHiringPDF = async () => {
    if (generatingReport) return;
    setGeneratingReport(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const NAVY = [8, 40, 25], TEAL = [23, 148, 74], TEAL_TINT = [229, 248, 238];
      const AMBER = [180, 110, 5], INDIGO = [79, 70, 229], ROSE = [200, 45, 60];
      const GRID = [214, 220, 214], INK = [26, 32, 46], SUBTLE = [110, 118, 138];
      const tint = (rgb, amt = 0.88) => rgb.map(c => Math.min(255, c + (255 - c) * amt));
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight(), margin = 32;
      const rangeLabel = reportFrom === reportTo ? formatDateReadable(reportFrom) : `${formatDateReadable(reportFrom)}  –  ${formatDateReadable(reportTo)}`;
      const kindLabel = { all: "Overall Report", overview: "Overview", scheduled: "Scheduled Interviews", calling: "Calling Log", joined: "Joined Candidates" }[reportKind] || "Report";

      const header = (title, subtitle) => {
        const headerH = 74;
        doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, headerH, "F");
        doc.setFillColor(...TEAL); doc.rect(0, headerH - 2, pageW, 2, "F");
        const logoSize = 34, badgePad = 5, badgeSize = logoSize + badgePad * 2;
        const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 1;
        doc.setFillColor(255, 255, 255); doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 8, 8, "F");
        try { doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize); } catch (e) {}
        const textX = badgeX + badgeSize + 14;
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
        doc.text(title, textX, 30);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(200, 214, 205);
        doc.text(subtitle || `${rangeLabel}${reportRole !== "All" ? " · " + reportRole : ""}`, textX, 46);
        doc.setFontSize(8);
        doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 30, { align: "right" });
        return headerH + 20;
      };
      const sectionTitle = (text, y, color = NAVY) => {
        doc.setFillColor(...color); doc.rect(margin, y - 9, 3, 12, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...color);
        doc.text(text, margin + 9, y);
        return y + 12;
      };
      const footer = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setDrawColor(...GRID); doc.line(margin, pageH - 26, pageW - margin, pageH - 26);
          doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SUBTLE);
          doc.text("Sridhi Ventures · Hiring Report · Confidential — Internal Use", margin, pageH - 13);
          doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 13, { align: "right" });
        }
      };

      let scoped = reportRole === "All" ? all : all.filter(c => c.role === reportRole);
      const inRange = scoped.filter(c => localISO(c.createdAt || Date.now()) >= reportFrom && localISO(c.createdAt || Date.now()) <= reportTo);

      // ═══ OVERVIEW ═══
      if (reportKind === "all" || reportKind === "overview") {
        let y = header(`Hiring — ${kindLabel}`);
        const total = scoped.length;
        const scheduled = scoped.filter(c => !!c.scheduledAt).length;
        const selected = scoped.filter(c => c.stage === "Selected").length;
        const joinedTotal = scoped.filter(c => c.stage === "Joined").length;
        const rejected = scoped.filter(c => HIRING_TERMINAL.includes(c.stage)).length;
        const chips = [
          [`${total} Total Candidates`, TEAL, [229, 248, 238]],
          [`${inRange.length} Added in Range`, NAVY, [222, 230, 226]],
          [`${scheduled} Interviews Scheduled`, AMBER, [254, 246, 224]],
          [`${selected} Selected`, INDIGO, [235, 234, 253]],
          [`${joinedTotal} Joined`, TEAL, [229, 248, 238]],
        ];
        let cx = margin, cyRow = y;
        chips.forEach(([label, color, tintC]) => {
          doc.setFont("helvetica", "bold"); doc.setFontSize(9);
          const w = doc.getTextWidth(label) + 20;
          if (cx + w > pageW - margin) { cx = margin; cyRow += 28; }
          doc.setFillColor(...tintC); doc.setDrawColor(...color);
          doc.roundedRect(cx, cyRow, w, 23, 11.5, 11.5, "FD");
          doc.setTextColor(...color); doc.text(label, cx + 10, cyRow + 15.5);
          cx += w + 7;
        });
        y = cyRow + 40;

        y = sectionTitle("PIPELINE STATUS", y); y += 4;
        const perRow = 5, boxGap = 6;
        const sbw = (pageW - margin * 2 - (perRow - 1) * boxGap) / perRow;
        HIRING_STAGES.forEach((s, i) => {
          const row = Math.floor(i / perRow), col = i % perRow;
          const bx = margin + col * (sbw + boxGap), by2 = y + row * 46;
          const rgb = hiringStageRgb(s);
          const count = scoped.filter(c => (c.stage || HIRING_STAGES[0]) === s).length;
          doc.setFillColor(...tint(rgb)); doc.setDrawColor(...rgb);
          doc.roundedRect(bx, by2, sbw, 42, 6, 6, "FD");
          doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...rgb);
          doc.text(String(count), bx + 6, by2 + 18);
          doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); doc.setTextColor(...SUBTLE);
          doc.text(s.toUpperCase(), bx + 6, by2 + 30, { maxWidth: sbw - 8 });
        });
        y += 46 * Math.ceil(HIRING_STAGES.length / perRow) + 10;

        // Conversion funnel — samples/interviews counted as positive movement,
        // not just an eventual Join, so early-stage hiring effort still shows.
        y = sectionTitle("CONVERSION FUNNEL", y); y += 4;
        const funnelStages = [
          ["Applied", total],
          ["Interview Stage", scoped.filter(c => ["Interview Scheduled", "Interviewed", "Selected", "Joined"].includes(c.stage)).length],
          ["Selected", selected + joinedTotal],
          ["Joined", joinedTotal],
        ];
        const fBoxW = (pageW - margin * 2 - 3 * 8) / 4;
        funnelStages.forEach(([label, count], i) => {
          const bx = margin + i * (fBoxW + 8);
          const pct = total ? Math.round((count / total) * 100) : 0;
          doc.setFillColor(...TEAL_TINT); doc.setDrawColor(...TEAL);
          doc.roundedRect(bx, y, fBoxW, 44, 8, 8, "FD");
          doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...TEAL);
          doc.text(String(count), bx + 10, y + 24);
          doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...INK);
          doc.text(label.toUpperCase(), bx + 10, y + 36);
          doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...SUBTLE);
          doc.text(`${pct}% of total`, bx + fBoxW - 8, y + 36, { align: "right" });
        });
        y += 44 + 22;

        y = sectionTitle("BY ROLE", y);
        const roleRows = roleOptions.map(r => {
          const rC = scoped.filter(c => c.role === r);
          if (!rC.length) return null;
          return [r, rC.length, rC.filter(c => c.stage === "Joined").length, rC.filter(c => !HIRING_TERMINAL.includes(c.stage) && c.stage !== "Joined").length];
        }).filter(Boolean);
        autoTable(doc, {
          startY: y + 6, margin: { top: 94, bottom: 40 },
          head: [["Role", "Candidates", "Joined", "Still Open"]],
          body: roleRows.length ? roleRows : [["—", "—", "—", "—"]], theme: "grid",
          styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          columnStyles: { 0: { fontStyle: "bold" } },
        });
        y = doc.lastAutoTable.finalY + 20;

        if (reportKind === "all") { doc.addPage(); }
      }

      // ═══ SCHEDULED INTERVIEWS ═══
      if (reportKind === "all" || reportKind === "scheduled") {
        let y = header("Hiring — Scheduled Interviews / Follow-ups", `${rangeLabel}${reportRole !== "All" ? " · " + reportRole : ""}`);
        const schedRows = scoped
          .filter(c => !!c.scheduledAt)
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
          .map(c => {
            const urg = hubVisitUrgency(c.scheduledAt);
            const label = urg === "overdue" ? "OVERDUE" : urg === "today" ? "TODAY" : urg === "tomorrow" ? "TOMORROW" : "UPCOMING";
            return [formatVisitDate(c.scheduledAt), label, c.name, c.role || "—", c.contact || "—", c.assignedTo || "—", c.scheduledNote || "—"];
          });
        y = sectionTitle(`${schedRows.length} scheduled`, y);
        autoTable(doc, {
          startY: y + 6, margin: { top: 94, bottom: 40 },
          head: [["Date", "", "Candidate", "Role", "Contact", "Handled By", "Note"]],
          body: schedRows.length ? schedRows : [["—", "—", "No interviews scheduled", "—", "—", "—", "—"]], theme: "grid",
          styles: { font: "helvetica", fontSize: 8.2, cellPadding: 5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 1) {
              const v = data.cell.raw;
              data.cell.styles.textColor = v === "OVERDUE" ? ROSE : v === "TODAY" ? AMBER : SUBTLE;
              data.cell.styles.fontStyle = "bold";
            }
          },
        });
        if (reportKind === "all") { doc.addPage(); }
      }

      // ═══ CALLING LOG ═══
      if (reportKind === "all" || reportKind === "calling") {
        let y = header("Hiring — Calling / Remarks Log", `${rangeLabel}${reportRole !== "All" ? " · " + reportRole : ""}`);
        const entries = [];
        scoped.forEach(c => {
          (c.remarks || []).forEach(r => {
            const at = typeof r === "object" ? r.at : null;
            if (!at) return;
            const dateStr = localISO(at);
            if (dateStr < reportFrom || dateStr > reportTo) return;
            entries.push({ at, dateStr, name: c.name, role: c.role || "—", by: (typeof r === "object" ? r.telecaller : null) || "—", note: remarkText(r) || "—" });
          });
        });
        entries.sort((a, b) => a.at - b.at);
        y = sectionTitle(`${entries.length} entries logged`, y);
        const callRows = entries.map(e => [formatDateReadable(e.dateStr), e.name, e.role, e.by, e.note]);
        autoTable(doc, {
          startY: y + 6, margin: { top: 94, bottom: 40 },
          head: [["Date", "Candidate", "Role", "By", "Note"]],
          body: callRows.length ? callRows : [["—", "No calls logged in this range", "—", "—", "—"]], theme: "grid",
          styles: { font: "helvetica", fontSize: 8.2, cellPadding: 5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          columnStyles: { 4: { cellWidth: 200 } },
        });
        if (reportKind === "all") { doc.addPage(); }
      }

      // ═══ JOINED ═══
      if (reportKind === "all" || reportKind === "joined") {
        let y = header("Hiring — Joined Candidates", `${rangeLabel}${reportRole !== "All" ? " · " + reportRole : ""}`);
        const joinedRows = scoped
          .filter(c => c.stage === "Joined" && c.joinedAt && localISO(c.joinedAt) >= reportFrom && localISO(c.joinedAt) <= reportTo)
          .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
        y = sectionTitle(`${joinedRows.length} joined in this range`, y, TEAL);
        const jRows = joinedRows.map(c => [formatDateReadable(localISO(c.joinedAt)), c.name, c.role || "—", c.contact || "—", c.area || "—", c.assignedTo || "—"]);
        autoTable(doc, {
          startY: y + 6, margin: { top: 94, bottom: 40 },
          head: [["Joined On", "Name", "Role", "Contact", "Area", "Handled By"]],
          body: jRows.length ? jRows : [["—", "No one joined in this range", "—", "—", "—", "—"]], theme: "grid",
          styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
          headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: TEAL_TINT },
          columnStyles: { 1: { fontStyle: "bold" } },
        });
      }

      footer();
      doc.save(`Hiring_${kindLabel.replace(/\s+/g, "")}_${reportFrom}_to_${reportTo}.pdf`);
      setShowReport(false);
    } catch (e) {
      alert("Couldn't generate the report: " + (e && e.message ? e.message : e));
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.t1, letterSpacing: "-0.02em" }}>Hiring</div>
          <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>Candidate tracking, follow-ups & reports for Telecaller / Driver / Accountant / Field Sales & more</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SyncBadge status={syncStatus} onRetry={retrySync} error={syncError} />
          <Btn small label="📥 Bulk Import" ghost onClick={() => { setImportText(""); setImportPreview(null); setImportRole(""); setImportCustomRole(""); setImportTitle(""); setShowImport(true); }} />
          <Btn small label="📄 Report" ghost color={T.indigo} onClick={() => setShowReport(true)} />
          <Btn small label="+ Add Candidate" onClick={() => { setForm(emptyForm()); setShowAdd(true); }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <MobileStatCard icon="🧑‍💼" title="Total Candidates" value={kpi.total} color={T.accent} />
        <MobileStatCard icon="⏰" title="Follow-ups Due" value={kpi.due} sub={kpi.due ? "Overdue + Today" : "All caught up"} color={kpi.due ? T.rose : T.emerald} />
        <MobileStatCard icon="🎉" title="Joined This Month" value={kpi.joined} color={T.emerald} />
        <MobileStatCard icon="📌" title="Open Roles" value={kpi.openRoles} color={T.indigo} />
      </div>

      {dueList.length > 0 && (
        <Card accent={T.rose} style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.rose, marginBottom: 8 }}>⏰ Follow-ups due now ({dueList.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dueList.slice(0, 5).map(({ c, urgency }) => {
              const style = hubVisitUrgencyStyle(urgency);
              return (
                <div key={c.id} onClick={() => openDetail(c)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", borderRadius: 10, background: T.cardHigh, cursor: "pointer",
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.t1 }}>{c.name} <span style={{ fontWeight: 500, color: T.t3 }}>· {c.role}</span></div>
                  <Chip small label={`${style.emoji} ${style.label}`} color={style.color === "#FCA5A5" ? T.rose : style.color} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card noPad style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, role, area, phone…"
            style={{ ...inputStyle, flex: "1 1 200px" }} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...inputStyle, width: "auto", flex: "0 0 auto" }}>
            <option value="All">All Roles</option>
            {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ ...inputStyle, width: "auto", flex: "0 0 auto" }}>
            <option value="All">All Stages</option>
            {HIRING_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)} style={{ ...inputStyle, width: "auto", flex: "0 0 auto" }}>
            <option value="All">Everyone</option>
            {TELECALLERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["All", "All"], ["overdue", "Overdue"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["upcoming", "Upcoming"], ["none", "No Follow-up"]].map(([id, label]) => (
            <button key={id} onClick={() => setFollowupFilter(id)} style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              background: followupFilter === id ? T.accent : "transparent",
              color: followupFilter === id ? "#FFFFFF" : T.t2,
              border: `1px solid ${followupFilter === id ? T.accent : T.border}`,
            }}>{label}</button>
          ))}
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <Card style={{ textAlign: "center", padding: 30, color: T.t3, fontSize: 13 }}>No candidates match these filters.</Card>
        )}
        {filtered.map(c => {
          const urg = hubVisitUrgency(c.scheduledAt);
          const urgStyle = urg ? hubVisitUrgencyStyle(urg) : null;
          return (
            <Card key={c.id} noPad style={{ padding: 14, cursor: "pointer" }} onClick={() => openDetail(c)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: T.t1 }}>{c.name || "—"}</span>
                    <Chip small label={c.role || "—"} color={T.indigo} />
                    <Chip small label={c.stage || HIRING_STAGES[0]} color={hiringStageColor(c.stage)} />
                  </div>
                  <div style={{ fontSize: 11.5, color: T.t3, marginTop: 4 }}>
                    {c.contact ? "📞 " + c.contact : ""}{c.area ? "  ·  📍 " + c.area : ""}{c.assignedTo ? "  ·  " + c.assignedTo : ""}
                  </div>
                  {hiringLastRemarkText(c) && (
                    <div style={{ fontSize: 11.5, color: T.t2, marginTop: 6, fontStyle: "italic" }}>"{hiringLastRemarkText(c)}"</div>
                  )}
                </div>
                {urgStyle && (
                  <Chip small label={`${urgStyle.emoji} ${urgStyle.label} · ${formatVisitDate(c.scheduledAt)}`} color={urgStyle.color === "#FCA5A5" ? T.rose : urgStyle.color} />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Add Candidate ── */}
      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Add Candidate">
        <Field label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Candidate's full name" />
        <Field label="Contact" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="10-digit phone number" />
        <Dropdown label="Role Applying For" value={form.role}
          onChange={e => setForm({ ...form, role: e.target.value })}
          options={[...roleOptions, HIRING_ROLE_OTHER]} />
        {form.role === HIRING_ROLE_OTHER && (
          <Field label="New Role Name" value={form.customRole} onChange={e => setForm({ ...form, customRole: e.target.value })} placeholder="e.g. Warehouse Supervisor" />
        )}
        <Field label="Area / Location" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="e.g. Ambattur" />
        <Field label="Experience" value={form.experience} onChange={e => setForm({ ...form, experience: e.target.value })} placeholder="e.g. 2 years" />
        <Field label="Expected Salary" value={form.expectedSalary} onChange={e => setForm({ ...form, expectedSalary: e.target.value })} placeholder="e.g. 15000" />
        <Dropdown label="Source" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} options={HIRING_SOURCES} />
        <Dropdown label="Handled By" value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })} options={TELECALLERS} />
        <Btn full label="Add Candidate" onClick={addCandidate} />
      </Sheet>

      {/* ── Bulk Import ── */}
      <Sheet open={showImport} onClose={() => setShowImport(false)} title="Bulk Import Candidates">
        <div style={{ fontSize: 11.5, color: T.t3, marginBottom: 10, lineHeight: 1.5 }}>
          Paste a list from Excel/WhatsApp — Name, Phone (one per line, or copy straight from a spreadsheet). The role you pick below is applied to the whole batch.
        </div>
        <Dropdown label="Role for this whole batch *" value={importRole || HIRING_ROLE_PICK}
          onChange={e => { setImportRole(e.target.value); setImportPreview(null); }}
          options={[HIRING_ROLE_PICK, ...roleOptions, HIRING_ROLE_OTHER]} />
        {importRole === HIRING_ROLE_OTHER && (
          <Field label="Type the role" value={importCustomRole} onChange={e => { setImportCustomRole(e.target.value); setImportPreview(null); }} placeholder="e.g. Warehouse Supervisor" />
        )}
        <BatchTitleField value={importTitle} onChange={v => { setImportTitle(v); setImportPreview(null); }} />
        <Dropdown label="Handled By" value={importAssignedTo} onChange={e => setImportAssignedTo(e.target.value)} options={TELECALLERS} />
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Paste List</div>
          <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportPreview(null); }} rows={8}
            placeholder={"Ramesh Kumar, 9876543210\nPriya S, 9123456780"}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
        </div>
        {!importPreview ? (
          <Btn full label="Preview Import" ghost onClick={runImportPreview} disabled={!importText.trim() || !finalImportRole || !importTitle.trim()} />
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: T.t2, marginBottom: 10 }}>
              Found <b style={{ color: T.emerald }}>{importPreview.rows.length}</b> candidate{importPreview.rows.length === 1 ? "" : "s"} to import
              {importPreview.skipped ? `, skipped ${importPreview.skipped} unreadable line${importPreview.skipped === 1 ? "" : "s"}` : ""}.
            </div>
            <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 12 }}>
              {importPreview.rows.map((r, i) => (
                <div key={i} style={{ padding: "8px 10px", fontSize: 12, borderBottom: i < importPreview.rows.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <b>{r.name || "(no name)"}</b> — {r.contact || "no phone"} — {r.role}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn label="Back" ghost onClick={() => setImportPreview(null)} />
              <Btn full label={importing ? "Importing…" : `Import ${importPreview.rows.length} Candidates`} disabled={importing || !importPreview.rows.length} onClick={commitImport} />
            </div>
          </>
        )}
      </Sheet>

      {/* ── Report ── */}
      <Sheet open={showReport} onClose={() => setShowReport(false)} title="Hiring Report">
        <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Report Type</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {[["all", "Overall (Combined)"], ["overview", "Overview Only"], ["scheduled", "Scheduled"], ["calling", "Calling Log"], ["joined", "Joined"]].map(([id, label]) => (
            <button key={id} onClick={() => setReportKind(id)} style={{
              padding: "7px 12px", borderRadius: 10, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              background: reportKind === id ? T.indigo : "transparent",
              color: reportKind === id ? "#FFFFFF" : T.t2,
              border: `1px solid ${reportKind === id ? T.indigo : T.border}`,
            }}>{label}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Date Range</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {["Today", "This Week", "This Month", "Custom"].map(p => (
            <button key={p} onClick={() => applyReportPreset(p)} style={{
              padding: "7px 12px", borderRadius: 10, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              background: reportPreset === p ? T.amber : "transparent",
              color: reportPreset === p ? "#FFFFFF" : T.t2,
              border: `1px solid ${reportPreset === p ? T.amber : T.border}`,
            }}>{p}</button>
          ))}
        </div>
        {reportPreset === "Custom" && (
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="From" type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} />
            <Field label="To" type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} />
          </div>
        )}
        <Dropdown label="Role" value={reportRole} onChange={e => setReportRole(e.target.value)} options={["All", ...roleOptions]} />
        <Btn full label={generatingReport ? "Generating…" : "Download PDF Report"} disabled={generatingReport} onClick={downloadHiringPDF} />
      </Sheet>

      {/* ── Candidate Detail ── */}
      <Sheet open={!!selected} onClose={() => setSelectedId(null)} title={selected ? selected.name : ""}>
        {selected && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Chip label={selected.role || "—"} color={T.indigo} />
                <Chip label={selected.stage || HIRING_STAGES[0]} color={hiringStageColor(selected.stage)} />
              </div>
              <button onClick={() => openEditCandidate(selected)} style={{
                background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, color: T.t2,
                padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT, flexShrink: 0,
              }}>✏️ Edit Details</button>
            </div>
            <div style={{ fontSize: 12.5, color: T.t2, lineHeight: 1.8, marginBottom: 14 }}>
              📞 {selected.contact || "—"}<br />
              📍 {selected.area || "—"} · 🧾 {selected.experience || "—"} exp · ₹{selected.expectedSalary || "—"}<br />
              🗂️ Source: {selected.source || "—"} · Handled by {selected.assignedTo || "—"}
              {selected.stage === "Joined" && selected.joinedAt ? <><br />🎉 Joined {homeStamp(selected.joinedAt)}</> : null}
              {HIRING_TERMINAL.includes(selected.stage) && selected.rejectedReason ? <><br />📝 {selected.rejectedReason}</> : null}
            </div>

            <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Move Stage</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {HIRING_STAGES.map(s => (
                <button key={s} onClick={() => setStage(selected.id, s)} style={{
                  padding: "6px 11px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                  background: selected.stage === s ? hiringStageColor(s) : "transparent",
                  color: selected.stage === s ? "#FFFFFF" : hiringStageColor(s),
                  border: `1px solid ${hiringStageColor(s)}55`,
                }}>{s}</button>
              ))}
            </div>

            <Rule />
            <div style={{ height: 14 }} />
            <div style={{ fontSize: 11, color: T.t2, marginBottom: 8, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Schedule Interview / Follow-up</div>
            <CalendarDatePicker label="" value={scheduleDraft} onChange={setScheduleDraft} min={todayISO()} />
            <Field label="Note (optional)" value={scheduleNoteDraft} onChange={e => setScheduleNoteDraft(e.target.value)} placeholder="e.g. Telephonic round, 11am" />
            <Btn small label="Save Schedule" ghost onClick={() => saveSchedule(selected.id)} />

            <div style={{ height: 18 }} />
            <Rule />
            <div style={{ height: 14 }} />
            <div style={{ fontSize: 11, color: T.t2, marginBottom: 8, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Add Remark / Call Note</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {HIRING_QUICK_REMARKS.map(item => (
                <button key={item.label} onClick={() => applyQuickRemark(selected.id, item)} style={{
                  padding: "6px 11px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                  background: item.sentiment === "positive" ? T.emerald + "18" : item.sentiment === "negative" ? T.rose + "18" : T.cardHigh,
                  color: item.sentiment === "positive" ? T.emerald : item.sentiment === "negative" ? T.rose : T.t2,
                  border: `1px solid ${item.sentiment === "positive" ? T.emerald + "44" : item.sentiment === "negative" ? T.rose + "44" : T.border}`,
                }}>{item.label}</button>
              ))}
            </div>
            <textarea value={newRemark} onChange={e => setNewRemark(e.target.value)} rows={2} placeholder="Or type a custom note — e.g. Called, asked to come Monday 10am"
              style={{ ...inputStyle, resize: "vertical", marginBottom: 10 }} />
            <Btn small label="Save Remark" onClick={() => { addRemarkTo(selected.id, newRemark); setNewRemark(""); }} />

            <div style={{ height: 18 }} />
            <div style={{ fontSize: 11, color: T.t2, marginBottom: 8, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>History</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
              {(selected.remarks || []).slice().reverse().map((r, i) => (
                <div key={i} style={{ fontSize: 11.5, color: T.t2, padding: "8px 10px", background: T.cardHigh, borderRadius: 8 }}>
                  {remarkText(r)}
                </div>
              ))}
              {(!selected.remarks || !selected.remarks.length) && <div style={{ fontSize: 12, color: T.t3 }}>No history yet.</div>}
            </div>

            <div style={{ height: 18 }} />
            <button onClick={() => deleteCandidate(selected.id)} style={{
              width: "100%", background: "transparent", border: `1px solid ${T.rose}55`, color: T.rose,
              borderRadius: 12, padding: "10px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: FONT,
            }}>Remove Candidate</button>
          </>
        )}
      </Sheet>

      {/* ── Edit Candidate Details ── */}
      <Sheet open={showEdit} onClose={() => setShowEdit(false)} title="Edit Candidate Details">
        <Field label="Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Candidate's full name" />
        <Field label="Contact" value={editForm.contact} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} placeholder="10-digit phone number" />
        <Dropdown label="Role Applying For" value={editForm.role}
          onChange={e => setEditForm({ ...editForm, role: e.target.value })}
          options={[...roleOptions, HIRING_ROLE_OTHER]} />
        {editForm.role === HIRING_ROLE_OTHER && (
          <Field label="New Role Name" value={editForm.customRole} onChange={e => setEditForm({ ...editForm, customRole: e.target.value })} placeholder="e.g. Warehouse Supervisor" />
        )}
        <Field label="Area / Location" value={editForm.area} onChange={e => setEditForm({ ...editForm, area: e.target.value })} placeholder="e.g. Ambattur" />
        <Field label="Experience" value={editForm.experience} onChange={e => setEditForm({ ...editForm, experience: e.target.value })} placeholder="e.g. 2 years" />
        <Field label="Expected Salary" value={editForm.expectedSalary} onChange={e => setEditForm({ ...editForm, expectedSalary: e.target.value })} placeholder="e.g. 15000" />
        <Dropdown label="Source" value={editForm.source} onChange={e => setEditForm({ ...editForm, source: e.target.value })} options={HIRING_SOURCES} />
        <Dropdown label="Handled By" value={editForm.assignedTo} onChange={e => setEditForm({ ...editForm, assignedTo: e.target.value })} options={TELECALLERS} />
        <Btn full label="Save Changes" onClick={saveEditCandidate} />
      </Sheet>
    </div>
  );
}

function Samples() {
  const [samples, setSamples, samplesSyncStatus] = useSheetSynced("samples", "samples", INITIAL_SAMPLES);
  const [leads, setLeads] = useSheetSynced("leads","leads",[]);
  const [showAdd, setShowAdd] = useState(false);
  const [showFeedback, setShowFeedback] = useState(null);
  const [ratings, setRatings] = useState({ taste:0, texture:0, quality:0, pricing:"", competitor:"", interest:"Yes", comments:"" });
  const [newSample, setNewSample] = useState({ customer:"", qty:"", type:"Dosa Batter", exec:"Arjun P.", deliveryCost:"", scheduledDate:"", scheduledTime:"" });

  const totalKG = samples.reduce((a,b) => a+b.qty, 0);
  const converted = samples.filter(s => s.converted).length;
  const totalCost = samples.reduce((a,b) => a+b.deliveryCost+b.productionCost, 0);

  const saveFeedback = id => {
    const sample = samples.find(s => s.id === id);
    const isConverted = ratings.interest === "Yes";
    const feedbackVal = ratings.taste>=4?"Positive":ratings.taste>=3?"Neutral":"Negative";
    setSamples(samples.map(s => s.id===id ? { ...s, feedback:feedbackVal, converted:isConverted, status:"Delivered" } : s));
    // Auto update lead stage based on feedback
    if (sample) {
      const matchedLead = leads.find(l => l.name === sample.customer || l.contact === sample.customer);
      if (matchedLead) {
        const newStage = isConverted ? "Order Received" : feedbackVal === "Positive" ? "Positive Feedback" : feedbackVal === "Neutral" ? "Feedback Pending" : "Lost Customer";
        const now = new Date();
        const stamp = now.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}) + " " + now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});
        const autoRemark = "[" + stamp + " · System] Sample feedback: " + feedbackVal + (isConverted ? " — Converted to Order! 🎉" : "");
        setLeads(leads.map(l => l.id===matchedLead.id ? { ...l, stage:newStage, lastContact:"Today", remarks:[...(l.remarks||[]), autoRemark] } : l));
      }
    }
    setShowFeedback(null);
    setRatings({ taste:0, texture:0, quality:0, pricing:"", competitor:"", interest:"Yes", comments:"" });
  };

  const addSample = () => {
    if (!newSample.customer || !newSample.qty) return;
    const today2 = new Date(); const dateStr = today2.toLocaleDateString("en-IN",{day:"2-digit",month:"short"});
    setSamples([{ ...newSample, id:samples.length+1, qty:parseInt(newSample.qty), unit:"KG", date:dateStr, deliveryCost:parseInt(newSample.deliveryCost)||0, productionCost:parseInt(newSample.qty)*50, status:"Pending", feedback:null, converted:false }, ...samples]);
    setShowAdd(false);
    setNewSample({ customer:"", qty:"", type:"Dosa Batter", exec:"Arjun P.", deliveryCost:"" });
  };

  const fbColor = f => f==="Positive" ? T.emerald : f==="Neutral" ? T.amber : T.rose;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        <KPI label="Total samples"    value={totalKG}  unit="KG" color={T.amber}   icon="🧪" />
        <KPI label="Converted"        value={converted}           color={T.emerald} icon="✅" />
        <KPI label="Sample cost"      value={totalCost} unit="₹" color={T.rose}    icon="💸" />
        <KPI label="Conversion rate"  value={`${Math.round((converted/samples.length)*100)}%`} color={T.accent} icon="🎯" />
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <SyncBadge status={samplesSyncStatus} />
      </div>

      <button onClick={() => setShowAdd(true)} style={{
        background:T.amber+"18", border:`1px solid ${T.amber}33`, borderRadius:14,
        color:T.amber, padding:13, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:FONT,
      }}>+ Log New Sample</button>

      <Card>
        <Label sub="Tap a sample to log feedback">Sample Log</Label>
        {samples.map(s => (
          <div key={s.id} style={{ padding:"14px 0", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{s.customer}</div>
              <div style={{ fontSize:11, color:T.t3, marginTop:2, fontWeight:500 }}>{s.exec} · {s.date} · ₹{(s.deliveryCost+s.productionCost).toLocaleString("en-IN")}</div>
              <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
                <Chip label={`${s.qty} ${s.unit} ${s.type}`} color={T.amber} />
                <Chip label={s.status} color={s.status==="Delivered" ? T.emerald : T.amber} />
                {s.feedback && <Chip label={s.feedback} color={fbColor(s.feedback)} />}
                {s.converted && <Chip label="Converted" color={T.accent} />}
              </div>
            </div>
            {s.status==="Delivered" && !s.feedback && (
              <button onClick={() => setShowFeedback(s.id)} style={{
                background:T.accentSub, border:`1px solid ${T.accent}33`,
                borderRadius:10, color:T.accent, padding:"7px 12px",
                fontSize:11, fontWeight:700, cursor:"pointer", flexShrink:0, fontFamily:FONT,
              }}>Log Feedback</button>
            )}
          </div>
        ))}
      </Card>

      <Card>
        <Label>By Field Executive</Label>
        {["Arjun P.","Suresh R."].map(exec => {
          const es = samples.filter(s => s.exec===exec);
          const kg = es.reduce((a,b) => a+b.qty, 0);
          return (
            <div key={exec} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0", borderBottom:`1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{exec}</div>
                <div style={{ fontSize:11, color:T.t3, fontWeight:500 }}>{es.length} deliveries</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:16, fontWeight:800, color:T.amber }}>{kg} KG</div>
                <div style={{ fontSize:11, color:T.emerald, fontWeight:600 }}>{es.filter(s => s.converted).length} converted</div>
              </div>
            </div>
          );
        })}
      </Card>

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Log New Sample">
        <Field label="Customer Name" value={newSample.customer} onChange={e => setNewSample({...newSample,customer:e.target.value})} />
        <Field label="Quantity (KG)" value={newSample.qty} onChange={e => setNewSample({...newSample,qty:e.target.value})} type="number" />
        <Dropdown label="Product Type" value={newSample.type} onChange={e => setNewSample({...newSample,type:e.target.value})} options={["Dosa Batter","Idli Batter","Mixed Batter"]} />
        <Dropdown label="Delivery Executive" value={newSample.exec} onChange={e => setNewSample({...newSample,exec:e.target.value})} options={["Arjun P.","Suresh R."]} />
        <Field label="Delivery Cost (₹)" value={newSample.deliveryCost} onChange={e => setNewSample({...newSample,deliveryCost:e.target.value})} type="number" />
        <div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>SCHEDULED DATE (optional)</div>
          <input type="date" value={newSample.scheduledDate} onChange={e => setNewSample({...newSample,scheduledDate:e.target.value})}
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
        </div>
        <div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:5 }}>SCHEDULED TIME (optional)</div>
          <input type="time" value={newSample.scheduledTime} onChange={e => setNewSample({...newSample,scheduledTime:e.target.value})}
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Btn label="Cancel" color={T.t2} ghost full onClick={() => setShowAdd(false)} />
          <Btn label="Log Sample" full onClick={addSample} />
        </div>
      </Sheet>

      <Sheet open={!!showFeedback} onClose={() => setShowFeedback(null)} title="Log Customer Feedback">
        {[["Taste Rating","taste"],["Texture Rating","texture"],["Quality Rating","quality"]].map(([label,key]) => (
          <div key={key} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:T.t2, fontWeight:600, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.03em" }}>{label}</div>
            <Stars value={ratings[key]} onChange={v => setRatings({...ratings,[key]:v})} />
          </div>
        ))}
        <Field label="Pricing Feedback" value={ratings.pricing} onChange={e => setRatings({...ratings,pricing:e.target.value})} placeholder="Too high / Fair / Good value" />
        <Field label="Competitor Brand" value={ratings.competitor} onChange={e => setRatings({...ratings,competitor:e.target.value})} placeholder="Brand name" />
        <Dropdown label="Purchase Interest" value={ratings.interest} onChange={e => setRatings({...ratings,interest:e.target.value})} options={["Yes","Maybe","No"]} />
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:T.t2, fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.03em" }}>Additional Comments</div>
          <textarea value={ratings.comments} onChange={e => setRatings({...ratings,comments:e.target.value})}
            placeholder="Customer's exact words…"
            style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:12, color:T.t1, fontSize:13, resize:"none", outline:"none", boxSizing:"border-box", height:72, fontFamily:FONT }} />
        </div>
        <Btn label="Save Feedback" full onClick={() => saveFeedback(showFeedback)} />
      </Sheet>
    </div>
  );
}

// ─── FIELD SYNC ───────────────────────────────────────────────────────────
function FieldSync() {
  const [tasks, setTasks] = useState(FIELD_TASKS);
  const [filter, setFilter] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ customer:"", area:"", address:"", task:"Sample Delivery", product:"Dosa Batter", qty:"", priority:"High", assignedTo:"Arjun P.", notes:"" });

  const filtered = tasks.filter(t => filter==="All" || t.status===filter);
  const updateStatus = (id, status) => setTasks(tasks.map(t => t.id===id ? {...t,status} : t));
  const statusColor = { Pending:T.amber, "In Progress":T.sky, Completed:T.emerald };
  const createTask = () => {
    if (!newTask.customer) return;
    setTasks([{ ...newTask, id:tasks.length+1, status:"Pending", createdBy:"Manual" }, ...tasks]);
    setShowCreate(false);
    setNewTask({ customer:"", area:"", address:"", task:"Sample Delivery", product:"Dosa Batter", qty:"", priority:"High", assignedTo:"Arjun P.", notes:"" });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:T.accentSub, border:`1px solid ${T.accentGlow}`, borderRadius:14, padding:"13px 16px", display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:T.accent, boxShadow:`0 0 8px ${T.accent}` }} />
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:T.accent }}>Real-time Sync Active</div>
          <div style={{ fontSize:11, color:T.t2, fontWeight:500 }}>Telecalling CRM ↔ Field Sales · last synced just now</div>
        </div>
      </div>

      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        <KPI label="Open tasks"   value={tasks.filter(t => t.status==="Pending").length}     color={T.amber}   icon="📌" />
        <KPI label="In progress"  value={tasks.filter(t => t.status==="In Progress").length}  color={T.sky}     icon="🚗" />
        <KPI label="Completed"    value={tasks.filter(t => t.status==="Completed").length}    color={T.emerald} icon="✅" />
      </div>

      <div style={{ display:"flex", gap:7 }}>
        {["All","Pending","In Progress","Completed"].map(s => {
          const active = filter===s;
          const col = statusColor[s] || T.accent;
          return (
            <button key={s} onClick={() => setFilter(s)}
              style={{
                flex:1, padding:"8px 4px", borderRadius:10, fontSize:11, fontWeight:700,
                border:`1px solid ${active ? col : T.border}`,
                background: active ? col+"1A" : "transparent",
                color: active ? col : T.t2, cursor:"pointer", fontFamily:FONT,
              }}>{s}</button>
          );
        })}
      </div>

      <button onClick={() => setShowCreate(true)} style={{
        background:T.indigo+"18", border:`1px solid ${T.indigo}33`,
        borderRadius:14, color:T.indigo, padding:13,
        fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:FONT,
      }}>+ Create Field Task</button>

      {filtered.map(task => (
        <Card key={task.id} accent={statusColor[task.status]}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:T.t1, letterSpacing:"-0.01em" }}>{task.customer}</div>
              <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>{task.area}</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
              <Chip label={task.status} color={statusColor[task.status]} />
              <Chip label={task.priority+" Priority"} color={getPriorityColor(task.priority)} />
            </div>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
            <Chip label={task.task} color={T.sky} />
            {task.qty!=="—" && <Chip label={`${task.qty} ${task.product}`} color={T.amber} />}
            <Chip label={`→ ${task.assignedTo}`} color={T.indigo} />
          </div>
          <div style={{ fontSize:11, color:T.t2, background:T.surface, borderRadius:10, padding:"8px 12px", marginBottom:12, lineHeight:1.6 }}>
            {task.address}
            {task.notes && <><br />{task.notes}</>}
            <br /><span style={{ color:T.t3 }}>By {task.createdBy}</span>
          </div>
          {task.status!=="Completed" && (
            <div style={{ display:"flex", gap:8 }}>
              {task.status==="Pending" && <Btn label="Start" color={T.sky} ghost full onClick={() => updateStatus(task.id,"In Progress")} />}
              <Btn label="Mark Complete" color={T.emerald} ghost full onClick={() => updateStatus(task.id,"Completed")} />
            </div>
          )}
        </Card>
      ))}

      <Sheet open={showCreate} onClose={() => setShowCreate(false)} title="Create Field Task">
        <Field label="Customer Name" value={newTask.customer} onChange={e => setNewTask({...newTask,customer:e.target.value})} />
        <Field label="Area" value={newTask.area} onChange={e => setNewTask({...newTask,area:e.target.value})} />
        <Field label="Address" value={newTask.address} onChange={e => setNewTask({...newTask,address:e.target.value})} />
        <Dropdown label="Task Type" value={newTask.task} onChange={e => setNewTask({...newTask,task:e.target.value})} options={["Sample Delivery","Customer Visit","Order Collection","Retail Onboarding"]} />
        <Dropdown label="Product" value={newTask.product} onChange={e => setNewTask({...newTask,product:e.target.value})} options={["Dosa Batter","Idli Batter","Mixed Batter","—"]} />
        <Field label="Quantity (KG)" value={newTask.qty} onChange={e => setNewTask({...newTask,qty:e.target.value})} type="number" />
        <Dropdown label="Assign To" value={newTask.assignedTo} onChange={e => setNewTask({...newTask,assignedTo:e.target.value})} options={["Arjun P.","Suresh R."]} />
        <Dropdown label="Priority" value={newTask.priority} onChange={e => setNewTask({...newTask,priority:e.target.value})} options={["High","Medium","Low"]} />
        <Field label="Notes" value={newTask.notes} onChange={e => setNewTask({...newTask,notes:e.target.value})} placeholder="Special instructions…" />
        <div style={{ display:"flex", gap:10 }}>
          <Btn label="Cancel" color={T.t2} ghost full onClick={() => setShowCreate(false)} />
          <Btn label="Create Task" full onClick={createTask} />
        </div>
      </Sheet>
    </div>
  );
}

// ─── REPEAT ORDERS ────────────────────────────────────────────────────────
function RepeatOrders() {
  const [repeatCustomers, setRepeatCustomers, repeatSyncStatus] = useSheetSynced("repeatCustomers", "repeatCustomers", REPEAT_CUSTOMERS);
  const [showAdd, setShowAdd] = useState(false);
  const [newCust, setNewCust] = useState({ name:"", area:"", contact:"", product:"Ghee", qty:"", frequency:"Weekly", status:"Upcoming", lastOrder:"", nextDue:"", revenue:"" });
  const statusColor = { "Due Today":T.rose, Tomorrow:T.amber, Upcoming:T.emerald };
  const grouped = {
    "Due Today": repeatCustomers.filter(c => c.status==="Due Today"),
    "Tomorrow":  repeatCustomers.filter(c => c.status==="Tomorrow"),
    "Upcoming":  repeatCustomers.filter(c => c.status==="Upcoming"),
  };
  const activeCount = repeatCustomers.length;
  const monthlyRevenue = repeatCustomers.reduce((a,c) => a + ((parseInt(c.revenue)||0)/12), 0);
  const avgQty = activeCount ? Math.round(repeatCustomers.reduce((a,c) => a + (parseInt(c.qty)||0), 0) / activeCount) : 0;

  const addCustomer = () => {
    if (!newCust.name || !newCust.contact) return;
    const today = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short"});
    setRepeatCustomers([{ ...newCust, id: Date.now(), qty: parseInt(newCust.qty)||0, revenue: parseInt(newCust.revenue)||0, lastOrder: newCust.lastOrder || today, nextDue: newCust.nextDue || today }, ...repeatCustomers]);
    setShowAdd(false);
    setNewCust({ name:"", area:"", contact:"", product:"Ghee", qty:"", frequency:"Weekly", status:"Upcoming", lastOrder:"", nextDue:"", revenue:"" });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        <KPI label="Active customers" value={activeCount}      color={T.accent}  icon="🏪" />
        <KPI label="Monthly revenue"  value={Math.round(monthlyRevenue)} unit="₹" color={T.emerald} icon="💰" />
        <KPI label="Due today"        value={grouped["Due Today"].length} color={T.rose} icon="⚠️" />
        <KPI label="Avg order"        value={avgQty ? `${avgQty} KG` : "—"}  color={T.amber}   icon="📦" />
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <SyncBadge status={repeatSyncStatus} />
      </div>

      <button onClick={() => setShowAdd(true)} style={{
        background:T.indigo+"18", border:`1px solid ${T.indigo}33`,
        borderRadius:14, color:T.indigo, padding:13,
        fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:FONT,
      }}>+ Add Repeat Customer</button>

      {activeCount===0 && (
        <Card>
          <div style={{ textAlign:"center", padding:"28px 12px" }}>
            <div style={{ fontSize:36, marginBottom:10 }}>🔁</div>
            <div style={{ fontSize:14, fontWeight:800, color:T.t1, marginBottom:6 }}>No repeat customers yet</div>
            <div style={{ fontSize:12, color:T.t3, lineHeight:1.5, maxWidth:280, margin:"0 auto" }}>
              Once a lead converts into a recurring customer, add them here to track their order cycle, revenue and due dates.
            </div>
          </div>
        </Card>
      )}

      {Object.entries(grouped).map(([group, customers]) => customers.length>0 && (
        <div key={group}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:statusColor[group] }} />
            <span style={{ fontSize:13, fontWeight:700, color:statusColor[group] }}>{group}</span>
            <span style={{ fontSize:11, color:T.t3 }}>({customers.length})</span>
          </div>
          {customers.map(c => (
            <Card key={c.id} style={{ marginBottom:10 }} accent={statusColor[group]}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:T.t1, letterSpacing:"-0.01em" }}>{c.name}</div>
                  <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>{c.area} · {c.contact}</div>
                </div>
                <Chip label={c.status} color={statusColor[group]} />
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                <Chip label={`${c.qty} KG / order`} color={T.amber} />
                <Chip label={c.frequency} color={T.indigo} />
                <Chip label={c.product} color={T.sky} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:T.t3, marginBottom:12, fontWeight:500 }}>
                <span>Last: {c.lastOrder}</span>
                <span>Next: {c.nextDue}</span>
                <span style={{ color:T.emerald, fontWeight:700 }}>₹{(c.revenue/12).toLocaleString("en-IN")}/mo</span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn label="📞 Call" color={T.emerald} ghost full onClick={() => { const p = (c.contact||"").replace(/[^0-9]/g,""); if(p) window.location.href="tel:+91"+p; }} />
                <Btn label="Remind" color={T.accent} ghost full onClick={() => {}} />
                {group==="Due Today" && <Btn label="Confirm Order" color={T.rose} ghost full onClick={() => {}} />}
              </div>
            </Card>
          ))}
        </div>
      ))}

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Add Repeat Customer">
        <Field label="Customer Name *" value={newCust.name} onChange={e => setNewCust({...newCust,name:e.target.value})} />
        <Field label="Contact *" value={newCust.contact} onChange={e => setNewCust({...newCust,contact:e.target.value})} type="tel" />
        <Field label="Area" value={newCust.area} onChange={e => setNewCust({...newCust,area:e.target.value})} />
        <Dropdown label="Product" value={newCust.product} onChange={e => setNewCust({...newCust,product:e.target.value})} options={["Ghee","Honey","Millets","Oil","Spices","Other"]} />
        <Field label="Qty per order (KG)" value={newCust.qty} onChange={e => setNewCust({...newCust,qty:e.target.value})} type="number" />
        <Dropdown label="Order Frequency" value={newCust.frequency} onChange={e => setNewCust({...newCust,frequency:e.target.value})} options={["Weekly","Fortnightly","Monthly"]} />
        <Dropdown label="Status" value={newCust.status} onChange={e => setNewCust({...newCust,status:e.target.value})} options={["Due Today","Tomorrow","Upcoming"]} />
        <Field label="Annual Revenue (₹)" value={newCust.revenue} onChange={e => setNewCust({...newCust,revenue:e.target.value})} type="number" placeholder="e.g. 24000" />
        <div style={{ display:"flex", gap:10 }}>
          <Btn label="Cancel" color={T.t2} ghost full onClick={() => setShowAdd(false)} />
          <Btn label="Add Customer" full onClick={addCustomer} />
        </div>
      </Sheet>
    </div>
  );
}

// ─── DAILY ORDERS (telecaller: new vs regular conversions, kg-wise) ───────
const RATE_PER_KG = 35;
const PRODUCTS = [
  { name: "Idli Dosa Batter", rate: 35 },
  { name: "Vada Batter", rate: 100 },
];
const rateForProduct = (name) => (PRODUCTS.find(p => p.name === name) || PRODUCTS[0]).rate;
const ORDER_TYPES = ["New Order", "Regular Order", "Sample"];
const SAMPLE_TYPES = ["Free", "Paid"];
const AMOUNT_MODES = ["Auto", "Manual"];
function orderTypeLabel(o) {
  if (o.orderType !== "Sample") return o.orderType;
  return `Sample (${o.sampleType || "Free"})`;
}
function orderTypeColor(o, theme) {
  if (o.orderType === "New Order") return theme.accent;
  if (o.orderType === "Sample") return theme.orange;
  return theme.indigo;
}
const CANCEL_REASONS = ["Plan Changed", "Batter Quality Issue", "Delivery Delay", "Other"];
const NEW_CUSTOMER_OPTION = "+ Add New Customer";
const INITIAL_DAILY_ORDERS = [];

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
// Same local-timezone correction as todayISO(), but for any Date/timestamp —
// plain toISOString() is UTC, which silently shifts anything before ~5:30am
// IST onto the previous calendar day. Used anywhere we need "what date did
// this actually happen on, in the user's own timezone."
function localISO(dateOrTs) {
  const d = new Date(dateOrTs);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
function formatDateReadable(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function emptyOrderForm(date) {
  return {
    date: date || todayISO(), customer: "", area: "", contact: "", address: "", mapLink: "", deliveryTime: "", orderType: "New Order",
    items: PRODUCTS.map(p => ({ product: p.name, kgs: "" })),
    telecaller: "",
    sampleType: "Free", amountMode: "Auto", manualAmount: "",
  };
}
// For a Sample order, works out the final ₹ amount from the auto (kg×rate)
// total plus the Free/Paid + Auto/Manual choices made in the form.
function sampleAmount(form, autoAmount) {
  if (form.sampleType === "Free") return 0;
  if (form.amountMode === "Manual") return parseFloat(form.manualAmount) || 0;
  return autoAmount;
}
// Returns the line items for an order, whether it's a new-style multi-product
// order (o.items) or an old-style single-product order (o.product/o.kgs).
function orderLineItems(o) {
  if (Array.isArray(o.items) && o.items.length) return o.items;
  return [{ product: o.product || PRODUCTS[0].name, kgs: parseFloat(o.kgs) || 0, rate: o.rate ?? rateForProduct(o.product), amount: o.amount || 0 }];
}

// A customer is "Regular" once they've ordered on more than 2 distinct days.
// This also works out each regular customer's rough ordering rhythm (Daily,
// Every 2 days, Weekly, etc.) from the average gap between their order days,
// and whether they've ordered today — used by the Dashboard and both reports.
function computeCustomerPatterns(orders, asOfDate) {
  const today = asOfDate || todayISO();
  const active = (orders || []).filter(o => o.status !== "Cancelled" && o.customer && o.date);
  const byCustomer = new Map();
  active.forEach(o => {
    const name = (o.customer || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!byCustomer.has(key)) byCustomer.set(key, { name, dates: new Set(), orderCount: 0, totalKg: 0, totalRevenue: 0, area: "", contact: "" });
    const c = byCustomer.get(key);
    c.dates.add(o.date);
    c.orderCount += 1;
    c.totalKg += parseFloat(o.kgs) || 0;
    c.totalRevenue += parseFloat(o.amount) || 0;
    if (o.area) c.area = o.area;
    if (o.contact) c.contact = o.contact;
  });

  return Array.from(byCustomer.values()).map(c => {
    const dates = Array.from(c.dates).sort();
    const dayCount = dates.length;
    const lastDate = dates[dates.length - 1];
    const daysSince = Math.round((new Date(today) - new Date(lastDate)) / 86400000);
    let avgGap = null;
    if (dates.length > 1) {
      const gaps = [];
      for (let i = 1; i < dates.length; i++) gaps.push((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000);
      avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    }
    let pattern = "Not enough data yet";
    if (avgGap !== null) {
      if (avgGap <= 1.4) pattern = "Daily";
      else if (avgGap <= 2.5) pattern = "Every 2 days";
      else if (avgGap <= 4) pattern = "Every 3 days";
      else if (avgGap <= 9) pattern = "Weekly";
      else if (avgGap <= 20) pattern = "Fortnightly";
      else pattern = "Occasional";
    }
    return {
      name: c.name, area: c.area, contact: c.contact,
      dayCount, orderCount: c.orderCount, totalKg: c.totalKg, totalRevenue: c.totalRevenue,
      isRegular: dayCount > 2, // ordered on more than 2 distinct days
      lastDate, daysSince, avgGap, pattern,
      orderedToday: dates.includes(today),
    };
  }).sort((a, b) => b.dayCount - a.dayCount);
}

// ── CSV report export helpers ──────────────────────────────────────────────
function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvRow(cells) { return cells.map(csvEscape).join(","); }
function downloadCSV(filename, content) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── TELECALLER DAILY ACTIVITY ───────────────────────────────────────────
// Dedicated daybook for telecallers: log each Interested lead, each Order
// (customer + kg), and each Sample (customer + qty) as its own dated entry,
// separate from the full CRM pipeline. Management gets a Team Overview +
// per-telecaller detail, day/week/month, with a downloadable PDF.
const ACTIVITY_KG_RATE = 35;

function summarizeActivity(rows, telecaller) {
  const set = telecaller ? rows.filter(r => r.telecaller === telecaller) : rows;
  const interested = set.filter(r => r.type === "interested").length;
  const orderRows = set.filter(r => r.type === "order");
  const samples = set.filter(r => r.type === "sample").length;
  const totalKg = orderRows.reduce((s, r) => s + (parseFloat(r.kg) || 0), 0);
  const totalAmount = orderRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const conv = interested ? Math.round((orderRows.length / interested) * 100) : 0;
  return { interested, orders: orderRows.length, samples, totalKg, totalAmount, conv };
}

function TelecallerActivity({ embedded = false } = {}) {
  const [activity, setActivity, activitySyncStatus] = useSheetSynced("telecallerActivity", "telecallerActivity", []);
  const [view, setView] = useState("entry"); // entry | reports

  // ── Entry state ──
  const [telecaller, setTelecaller] = useState(TELECALLERS[0]);
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState("interested");
  const [form, setForm] = useState({ customer: "", area: "", notes: "", kg: "", amount: "", qty: "", unit: "KG" });

  // ── Report state ──
  const [reportPreset, setReportPreset] = useState("Today");
  const [reportFrom, setReportFrom] = useState(todayISO());
  const [reportTo, setReportTo] = useState(todayISO());
  const [reportTelecaller, setReportTelecaller] = useState("All");
  const [generatingReport, setGeneratingReport] = useState(false);

  const applyReportPreset = (preset) => {
    setReportPreset(preset);
    const now = new Date();
    if (preset === "Today") { setReportFrom(todayISO()); setReportTo(todayISO()); }
    else if (preset === "This Week") {
      const day = now.getDay() || 7;
      const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
      setReportFrom(localISO(monday)); setReportTo(todayISO());
    } else if (preset === "This Month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setReportFrom(localISO(first)); setReportTo(todayISO());
    }
  };

  const dayEntries = useMemo(
    () => (activity || []).filter(a => a.telecaller === telecaller && a.date === date),
    [activity, telecaller, date]
  );
  const dayTally = useMemo(() => summarizeActivity(dayEntries, null), [dayEntries]);

  const rangeEntries = useMemo(
    () => (activity || []).filter(a => a.date >= reportFrom && a.date <= reportTo),
    [activity, reportFrom, reportTo]
  );

  const resetForm = () => setForm({ customer: "", area: "", notes: "", kg: "", amount: "", qty: "", unit: "KG" });

  const addEntry = () => {
    const name = form.customer.trim();
    if (!name) { alert("Enter a customer / business name."); return; }
    const entry = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      date, telecaller, type, customer: name,
      createdAt: Date.now(),
    };
    if (type === "interested") {
      entry.area = form.area.trim(); entry.notes = form.notes.trim();
    } else if (type === "order") {
      entry.kg = parseFloat(form.kg) || 0;
      entry.amount = form.amount !== "" ? (parseFloat(form.amount) || 0) : entry.kg * ACTIVITY_KG_RATE;
    } else {
      entry.qty = parseFloat(form.qty) || 0; entry.unit = (form.unit || "KG").trim(); entry.notes = form.notes.trim();
    }
    setActivity(prev => [...(prev || []), entry]);
    resetForm();
  };

  const deleteEntry = (id) => setActivity(prev => (prev || []).filter(e => e.id !== id));

  const detailFor = (e) => {
    if (e.type === "interested") return [e.area, e.notes].filter(Boolean).join(" — ") || "—";
    if (e.type === "order") return `${e.kg || 0} kg · ₹${(e.amount || 0).toLocaleString("en-IN")}`;
    return `${e.qty || 0} ${e.unit || ""}${e.notes ? " — " + e.notes : ""}`;
  };
  const typeChip = (t) => {
    const map = { interested: [T.indigo, "Interested"], order: [T.amber, "Order"], sample: [T.sky, "Sample"] };
    const [color, label] = map[t] || [T.t3, t];
    return <Chip small label={label} color={color} />;
  };

  // ── PDF export: Team Overview page + one detail page per telecaller ──
  const downloadActivityReport = async () => {
    if (generatingReport) return;
    setGeneratingReport(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"), import("jspdf-autotable"),
      ]);
      const NAVY = [8, 40, 25], TEAL = [23, 148, 74], AMBER = [180, 110, 5], INDIGO = [79, 70, 229];
      const GRID = [214, 220, 214], INK = [26, 32, 46], SUBTLE = [110, 118, 138];
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 32;
      const rangeLabel = reportFrom === reportTo ? formatDateReadable(reportFrom) : `${formatDateReadable(reportFrom)}  –  ${formatDateReadable(reportTo)}`;

      const header = (title) => {
        const headerH = 74;
        doc.setFillColor(...NAVY);
        doc.rect(0, 0, pageW, headerH, "F");
        doc.setFillColor(...TEAL);
        doc.rect(0, headerH - 2, pageW, 2, "F");
        const logoSize = 34, badgePad = 5, badgeSize = logoSize + badgePad * 2;
        const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 1;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 8, 8, "F");
        try { doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize); } catch (e) {}
        const textX = badgeX + badgeSize + 14;
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold"); doc.setFontSize(15);
        doc.text(title, textX, 30);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(200, 214, 205);
        doc.text(`${reportPreset} · ${rangeLabel}`, textX, 46);
        doc.setFontSize(8);
        doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 30, { align: "right" });
        return headerH + 20;
      };
      const footer = (label) => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setDrawColor(...GRID);
          doc.line(margin, pageH - 26, pageW - margin, pageH - 26);
          doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SUBTLE);
          doc.text(label, margin, pageH - 13);
          doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 13, { align: "right" });
        }
      };

      // ── Page 1: Team overview ──
      let y = header("Telecaller Performance Report");
      const totals = summarizeActivity(rangeEntries, null);
      const boxes = [
        ["Interested", totals.interested, TEAL], ["Orders", totals.orders, AMBER],
        ["Kg Sold", totals.totalKg, INDIGO], ["Order Value", "₹" + totals.totalAmount.toLocaleString("en-IN"), TEAL],
        ["Samples", totals.samples, [58, 174, 224]], ["Conversion", totals.conv + "%", AMBER],
      ];
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
      doc.text("TEAM TOTALS", margin, y); y += 10;
      const bw = (pageW - margin * 2 - 5 * 8) / 6;
      boxes.forEach(([label, val, color], i) => {
        const bx = margin + i * (bw + 8);
        doc.setFillColor(...color.map(c => Math.min(255, c + (255 - c) * 0.88)));
        doc.setDrawColor(...color);
        doc.roundedRect(bx, y, bw, 46, 8, 8, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...color);
        doc.text(String(val), bx + 8, y + 24);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...SUBTLE);
        doc.text(label.toUpperCase(), bx + 8, y + 37);
      });
      y += 68;

      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
      doc.text("BY TELECALLER", margin, y); y += 8;
      const teamRows = TELECALLERS.map(t => {
        const s = summarizeActivity(rangeEntries, t);
        return [t, s.interested, s.orders, s.totalKg, "₹" + s.totalAmount.toLocaleString("en-IN"), s.samples, s.conv + "%"];
      });
      autoTable(doc, {
        startY: y,
        margin: { top: 94, bottom: 40 },
        head: [["Telecaller", "Interested", "Orders", "Kg", "Value", "Samples", "Conv."]],
        body: teamRows,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 9, cellPadding: 6, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "middle" },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 248] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 100 } },
      });

      // ── One detail page per telecaller ──
      const targets = reportTelecaller === "All" ? TELECALLERS : [reportTelecaller];
      targets.forEach(t => {
        doc.addPage();
        const s = summarizeActivity(rangeEntries, t);
        let yy = header(`${t} — Activity Detail`);
        const rows = rangeEntries.filter(e => e.telecaller === t).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

        const chips = [
          [`${s.interested} Interested`, TEAL], [`${s.orders} Orders`, AMBER],
          [`${s.samples} Samples`, [58, 174, 224]], [`${s.conv}% Conversion`, INDIGO],
        ];
        let cx = margin;
        chips.forEach(([label, color]) => {
          doc.setFont("helvetica", "bold"); doc.setFontSize(9);
          const w = doc.getTextWidth(label) + 20;
          doc.setFillColor(...color.map(c => Math.min(255, c + (255 - c) * 0.88)));
          doc.setDrawColor(...color);
          doc.roundedRect(cx, yy, w, 22, 11, 11, "FD");
          doc.setTextColor(...color);
          doc.text(label, cx + 10, yy + 15);
          cx += w + 8;
        });
        yy += 36;

        const section = (title, color, cols, body) => {
          doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...color);
          doc.text(title, margin, yy); yy += 6;
          if (!body.length) {
            doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...SUBTLE);
            doc.text("None recorded.", margin, yy + 12); yy += 24; return;
          }
          autoTable(doc, {
            startY: yy + 4, margin: { top: 94, bottom: 40 },
            head: [cols], body,
            theme: "grid",
            styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
            headStyles: { fillColor: color, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
            alternateRowStyles: { fillColor: [248, 250, 248] },
            didDrawPage: () => header(`${t} — Activity Detail`),
          });
          yy = doc.lastAutoTable.finalY + 18;
        };

        section("INTERESTED LEADS", TEAL, ["Date", "Customer", "Area", "Notes"],
          rows.filter(e => e.type === "interested").map(e => [formatDateReadable(e.date), e.customer, e.area || "—", e.notes || "—"]));
        section("ORDERS", AMBER, ["Date", "Customer", "Kg", "Amount"],
          rows.filter(e => e.type === "order").map(e => [formatDateReadable(e.date), e.customer, e.kg, "₹" + (e.amount || 0).toLocaleString("en-IN")]));
        section("SAMPLES", INDIGO, ["Date", "Customer", "Qty", "Notes"],
          rows.filter(e => e.type === "sample").map(e => [formatDateReadable(e.date), e.customer, `${e.qty || 0} ${e.unit || ""}`, e.notes || "—"]));
      });

      footer("Sridhi Ventures · Telecaller Performance Report");
      doc.save(`Telecaller-Activity-Report_${reportFrom}_to_${reportTo}.pdf`);
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div>
      <Label sub="Interested · Orders · Samples — logged daily, reported to management">Telecaller Activity</Label>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["entry", "✍️ Entry"], ["reports", "📊 Reports"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setView(id)} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer", fontFamily: FONT,
            fontWeight: 700, fontSize: 13, border: `1px solid ${view === id ? T.accent : T.border}`,
            background: view === id ? T.accentSub : "transparent", color: view === id ? T.accent : T.t2,
          }}>{lbl}</button>
        ))}
      </div>

      {view === "entry" ? (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <Dropdown label="Telecaller" value={telecaller} onChange={e => setTelecaller(e.target.value)} options={TELECALLERS} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Date</div>
                <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value || todayISO())} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, margin: "10px 0 14px" }}>
              {[["interested", "☎ Interested", T.indigo], ["order", "📦 Order", T.amber], ["sample", "🧪 Sample", T.sky]].map(([id, lbl, color]) => (
                <button key={id} onClick={() => setType(id)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontFamily: FONT,
                  fontWeight: 700, fontSize: 12, border: `1px solid ${type === id ? color : T.border}`,
                  background: type === id ? color + "18" : "transparent", color: type === id ? color : T.t2,
                }}>{lbl}</button>
              ))}
            </div>

            <Field label="Customer / Business Name" value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} placeholder="e.g. Sri Krishna Mess" />
            {type === "interested" && (
              <>
                <Field label="Area" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="e.g. Ambattur" />
                <Field label="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What they said, follow-up plan…" />
              </>
            )}
            {type === "order" && (
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Kilograms" type="number" value={form.kg} onChange={e => {
                    const kg = e.target.value;
                    setForm({ ...form, kg, amount: kg ? String((parseFloat(kg) || 0) * ACTIVITY_KG_RATE) : "" });
                  }} placeholder="e.g. 10" />
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder={`auto: kg × ${ACTIVITY_KG_RATE}`} />
                </div>
              </div>
            )}
            {type === "sample" && (
              <>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}><Field label="Quantity" type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="e.g. 3" /></div>
                  <div style={{ flex: 1 }}><Field label="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="KG" /></div>
                </div>
                <Field label="Feedback / notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Sample feedback…" />
              </>
            )}
            <Btn full label={`+ Add ${type === "interested" ? "Interested Lead" : type === "order" ? "Order" : "Sample"}`}
              color={type === "interested" ? T.indigo : type === "order" ? T.amber : T.sky} onClick={addEntry} />
          </Card>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Label size={14}>{telecaller} · {formatDateReadable(date)}</Label>
              <SyncBadge status={activitySyncStatus} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[["Interested", dayTally.interested, T.indigo], ["Orders", dayTally.orders, T.amber], ["Samples", dayTally.samples, T.sky]].map(([l, v, c]) => (
                <div key={l} style={{ flex: 1, textAlign: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 4px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
                  <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{l}</div>
                </div>
              ))}
            </div>
            {!dayEntries.length ? (
              <div style={{ fontSize: 12.5, color: T.t3, fontStyle: "italic", padding: "10px 2px" }}>No entries logged yet for this day.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...dayEntries].sort((a, b) => b.createdAt - a.createdAt).map(e => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                    {typeChip(e.type)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.customer}</div>
                      <div style={{ fontSize: 11, color: T.t3 }}>{detailFor(e)}</div>
                    </div>
                    <button onClick={() => deleteEntry(e.id)} style={{ background: "none", border: "none", color: T.rose, cursor: "pointer", fontSize: 16, padding: "0 2px" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card style={{ marginBottom: 14 }}>
            <Label size={14}>Report Range</Label>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {["Today", "This Week", "This Month", "Custom"].map(p => (
                <button key={p} onClick={() => applyReportPreset(p)} style={{
                  padding: "7px 13px", borderRadius: 20, cursor: "pointer", fontFamily: FONT,
                  fontWeight: 700, fontSize: 11.5,
                  background: reportPreset === p ? T.amber : "transparent",
                  color: reportPreset === p ? "#FFFFFF" : T.t2,
                  border: `1px solid ${reportPreset === p ? T.amber : T.border}`,
                }}>{p}</button>
              ))}
            </div>
            {reportPreset === "Custom" && (
              <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
                <div style={{ flex: 1 }}><input type="date" value={reportFrom} max={todayISO()} onChange={e => { setReportFrom(e.target.value); setReportPreset("Custom"); }} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><input type="date" value={reportTo} max={todayISO()} onChange={e => { setReportTo(e.target.value); setReportPreset("Custom"); }} style={inputStyle} /></div>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Dropdown label="Telecaller filter (PDF detail pages)" value={reportTelecaller} onChange={e => setReportTelecaller(e.target.value)} options={["All", ...TELECALLERS]} />
            </div>
            <Btn full label={generatingReport ? "Generating…" : "🧾 Download PDF Report"} color={T.amber} disabled={generatingReport} onClick={downloadActivityReport} />
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <Label size={14} sub={reportFrom === reportTo ? formatDateReadable(reportFrom) : `${formatDateReadable(reportFrom)} – ${formatDateReadable(reportTo)}`}>Team Overview</Label>
            {!rangeEntries.length ? (
              <div style={{ fontSize: 12.5, color: T.t3, fontStyle: "italic" }}>No activity logged in this range yet.</div>
            ) : (() => {
              const totals = summarizeActivity(rangeEntries, null);
              const maxInterested = Math.max(1, ...TELECALLERS.map(t => summarizeActivity(rangeEntries, t).interested));
              return (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {[["Interested", totals.interested, T.indigo], ["Orders", totals.orders, T.amber], ["Kg Sold", totals.totalKg, T.sky],
                      ["Value", "₹" + totals.totalAmount.toLocaleString("en-IN"), T.emerald], ["Samples", totals.samples, T.orange], ["Conv.", totals.conv + "%", T.accent]]
                      .map(([l, v, c]) => (
                        <div key={l} style={{ flex: "1 1 90px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px" }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: c }}>{v}</div>
                          <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>{l}</div>
                        </div>
                      ))}
                  </div>
                  {TELECALLERS.map(t => {
                    const s = summarizeActivity(rangeEntries, t);
                    const pct = (s.interested / maxInterested) * 100;
                    return (
                      <div key={t} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: T.t1 }}>{t}</span>
                          <span style={{ color: T.t3 }}>{s.interested} interested · {s.orders} orders · {s.samples} samples · {s.conv}%</span>
                        </div>
                        <div style={{ height: 8, background: T.surface, borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: pct + "%", height: "100%", background: T.indigo, borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </Card>

          <Card>
            <Label size={14}>Telecaller Detail</Label>
            {(reportTelecaller === "All" ? TELECALLERS : [reportTelecaller]).map(t => {
              const rows = rangeEntries.filter(e => e.telecaller === t).sort((a, b) => b.createdAt - a.createdAt);
              const s = summarizeActivity(rangeEntries, t);
              return (
                <div key={t} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.t1, marginBottom: 6 }}>
                    {t} <span style={{ fontWeight: 500, color: T.t3, fontSize: 11 }}>— {s.interested} interested · {s.orders} orders · {s.samples} samples · {s.conv}% conversion</span>
                  </div>
                  {!rows.length ? (
                    <div style={{ fontSize: 12, color: T.t3, fontStyle: "italic" }}>No entries in this range.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {rows.map(e => (
                        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                          {typeChip(e.type)}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.t1 }}>{e.customer} <span style={{ color: T.t3, fontWeight: 400 }}>· {formatDateReadable(e.date)}</span></div>
                            <div style={{ fontSize: 11, color: T.t3 }}>{detailFor(e)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}

function MilkDistributors({ embedded = false } = {}) {
  const [rows, setRows, syncStatus] = useSheetSynced("milkDistributors", "milkDistributors", []);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", contact: "", area: "", address: "", mapLink: "", currentBrand: "", telecaller: MILK_TELECALLERS[0] });
  const [stageFilter, setStageFilter] = useState("All");
  const [search, setSearch] = useState("");

  // Bulk import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importDefaultTc, setImportDefaultTc] = useState("Leave unassigned");
  const [importPreview, setImportPreview] = useState(null); // { rows, skipped } | null
  const [importing, setImporting] = useState(false);
  const [importTitle, setImportTitle] = useState("");

  // Telecaller remark composer
  const [tcTelecaller, setTcTelecaller] = useState(MILK_TELECALLERS[0]);
  const [tcTag, setTcTag] = useState(null);
  const [tcNote, setTcNote] = useState("");
  const [detailEdit, setDetailEdit] = useState({ name: "", contact: "", area: "", address: "", currentBrand: "", mapLink: "" });

  // Field sales remark composer
  const [fsVisitedBy, setFsVisitedBy] = useState("");
  const [fsTag, setFsTag] = useState(null);
  const [fsNote, setFsNote] = useState("");

  // Report state
  const [reportPreset, setReportPreset] = useState("Today");
  const [reportFrom, setReportFrom] = useState(todayISO());
  const [reportTo, setReportTo] = useState(todayISO());
  const [reportTelecaller, setReportTelecaller] = useState("All");
  const [generatingReport, setGeneratingReport] = useState(false);

  const applyReportPreset = (preset) => {
    setReportPreset(preset);
    const now = new Date();
    if (preset === "Today") { setReportFrom(todayISO()); setReportTo(todayISO()); }
    else if (preset === "This Week") {
      const day = now.getDay() || 7;
      const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
      setReportFrom(localISO(monday)); setReportTo(todayISO());
    } else if (preset === "This Month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setReportFrom(localISO(first)); setReportTo(todayISO());
    }
  };

  const selected = (rows || []).find(r => r.id === selectedId) || null;
  useEffect(() => {
    if (selected) {
      setTcTelecaller(selected.telecaller || MILK_TELECALLERS[0]);
      setDetailEdit({
        name: selected.name || "", contact: selected.contact || "", area: selected.area || "",
        address: selected.address || "", currentBrand: selected.currentBrand || "", mapLink: selected.mapLink || "",
      });
    }
  }, [selectedId]); // eslint-disable-line

  const filtered = useMemo(() => {
    let list = rows || [];
    if (stageFilter !== "All") list = list.filter(r => r.status === stageFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => (r.name || "").toLowerCase().includes(q) || (r.area || "").toLowerCase().includes(q) || (r.contact || "").includes(q));
    }
    return [...list].sort((a, b) => (b.lastTelecallerRemarkAt || b.lastFieldSalesRemarkAt || b.createdAt || 0) - (a.lastTelecallerRemarkAt || a.lastFieldSalesRemarkAt || a.createdAt || 0));
  }, [rows, stageFilter, search]);

  const addDistributor = () => {
    if (!addForm.name.trim()) { alert("Enter the distributor / shop name."); return; }
    const rec = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      name: addForm.name.trim(), contact: addForm.contact.trim(), area: addForm.area.trim(),
      address: addForm.address.trim(), mapLink: addForm.mapLink.trim(), currentBrand: addForm.currentBrand.trim(), status: "New",
      telecaller: addForm.telecaller, telecallerRemarks: [], fieldSalesRemarks: [],
      createdAt: Date.now(), lastTelecallerRemarkAt: null, lastFieldSalesRemarkAt: null,
    };
    setRows(prev => [...(prev || []), rec]);
    setAddForm({ name: "", contact: "", area: "", address: "", mapLink: "", currentBrand: "", telecaller: MILK_TELECALLERS[0] });
    setShowAdd(false);
    setSelectedId(rec.id);
  };

  const saveDetailEdit = (id) => {
    if (!detailEdit.name.trim()) { alert("Name can't be empty."); return; }
    setRows(prev => (prev || []).map(r => r.id === id ? {
      ...r, name: detailEdit.name.trim(), contact: detailEdit.contact.trim(), area: detailEdit.area.trim(),
      address: detailEdit.address.trim(), currentBrand: detailEdit.currentBrand.trim(), mapLink: detailEdit.mapLink.trim(),
    } : r));
  };

  // ── Bulk import ──
  const runImportPreview = () => setImportPreview(parseMilkBulkImport(importText));
  const commitImport = () => {
    if (!importPreview || !importPreview.rows.length) return;
    if (!importTitle.trim()) { alert("Please enter a Batch Title / Heading first."); return; }
    const bt = importTitle.trim();
    setImporting(true);
    setRows(prev => {
      const existing = [...(prev || [])];
      importPreview.rows.forEach(ir => {
        const phone = normalizePhone(ir.contact);
        const matchIdx = existing.findIndex(e =>
          (phone && normalizePhone(e.contact) === phone) ||
          (!phone && e.name.trim().toLowerCase() === ir.name.toLowerCase() && (e.area || "").trim().toLowerCase() === (ir.area || "").toLowerCase())
        );
        const cls = classifyCallingRemark(ir.callingRemark);
        let telecaller = MILK_TELECALLERS.find(t => t.toLowerCase() === ir.telecaller.toLowerCase()) || "";
        if (!telecaller && importDefaultTc !== "Leave unassigned") telecaller = importDefaultTc;
        const status = cls.sentiment === "positive" ? "Interested" : (ir.callingRemark ? "Contacted" : "New");

        if (matchIdx >= 0) {
          const cur = existing[matchIdx];
          const lastNote = (cur.telecallerRemarks || []).length ? cur.telecallerRemarks[cur.telecallerRemarks.length - 1].text : null;
          const newRemarks = [...(cur.telecallerRemarks || [])];
          if (ir.callingRemark && ir.callingRemark !== lastNote) {
            newRemarks.push({ text: ir.callingRemark, tag: cls.tag, sentiment: cls.sentiment, telecaller: telecaller || cur.telecaller || "Import", at: Date.now() });
          }
          existing[matchIdx] = {
            ...cur,
            area: cur.area || ir.area, mapLink: cur.mapLink || ir.mapLink, currentBrand: cur.currentBrand || ir.currentBrand,
            telecaller: telecaller || cur.telecaller,
            batchTitle: cur.batchTitle || bt,
            telecallerRemarks: newRemarks,
            lastTelecallerRemarkAt: newRemarks.length ? newRemarks[newRemarks.length - 1].at : cur.lastTelecallerRemarkAt,
          };
        } else {
          const rec = {
            id: Date.now() + "_" + Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 5),
            name: ir.name, contact: ir.contact, area: ir.area, address: "", mapLink: ir.mapLink, currentBrand: ir.currentBrand,
            status, telecaller: telecaller || "",
            telecallerRemarks: ir.callingRemark ? [{ text: ir.callingRemark, tag: cls.tag, sentiment: cls.sentiment, telecaller: telecaller || "Import", at: Date.now() }] : [],
            fieldSalesRemarks: [], batchTitle: bt, createdAt: Date.now(),
            lastTelecallerRemarkAt: ir.callingRemark ? Date.now() : null, lastFieldSalesRemarkAt: null,
          };
          existing.push(rec);
        }
      });
      return existing;
    });
    setImporting(false);
    setShowImport(false);
    setImportText("");
    setImportTitle("");
    setImportPreview(null);
  };

  const setStatus = (id, status) => setRows(prev => (prev || []).map(r => r.id === id ? { ...r, status } : r));
  const deleteDistributor = (r) => {
    if (!confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
    setRows(prev => (prev || []).filter(x => x.id !== r.id));
    setSelectedId(null);
  };

  const addTelecallerRemark = (id) => {
    if (!tcNote.trim() && !tcTag) return;
    const entry = { text: tcNote.trim(), tag: tcTag ? tcTag.label : null, sentiment: tcTag ? tcTag.sentiment : "neutral", telecaller: tcTelecaller, at: Date.now() };
    setRows(prev => (prev || []).map(r => r.id === id ? {
      ...r, telecaller: tcTelecaller, telecallerRemarks: [...(r.telecallerRemarks || []), entry], lastTelecallerRemarkAt: entry.at,
    } : r));
    setTcNote(""); setTcTag(null);
  };
  const addFieldSalesRemark = (id) => {
    if (!fsNote.trim() && !fsTag) return;
    const entry = { text: fsNote.trim(), tag: fsTag ? fsTag.label : null, sentiment: fsTag ? fsTag.sentiment : "neutral", visitedBy: fsVisitedBy.trim() || "Field Sales", at: Date.now() };
    setRows(prev => (prev || []).map(r => r.id === id ? {
      ...r, fieldSalesRemarks: [...(r.fieldSalesRemarks || []), entry], lastFieldSalesRemarkAt: entry.at,
    } : r));
    setFsNote(""); setFsTag(null);
  };

  // ── PDF: Team Overview + unified Activity Log (telecaller calls + field visits) ──
  const downloadMilkReport = async () => {
    if (generatingReport) return;
    setGeneratingReport(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const NAVY = [8, 40, 25], TEAL = [23, 148, 74], AMBER = [180, 110, 5], INDIGO = [79, 70, 229];
      const GRID = [214, 220, 214], INK = [26, 32, 46], SUBTLE = [110, 118, 138];
      const POS = [34, 217, 138], NEG = [251, 113, 133], NEU = [251, 191, 36];
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight(), margin = 32;
      const rangeLabel = reportFrom === reportTo ? formatDateReadable(reportFrom) : `${formatDateReadable(reportFrom)}  –  ${formatDateReadable(reportTo)}`;

      const header = (title) => {
        const headerH = 74;
        doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, headerH, "F");
        doc.setFillColor(...TEAL); doc.rect(0, headerH - 2, pageW, 2, "F");
        const logoSize = 34, badgePad = 5, badgeSize = logoSize + badgePad * 2;
        const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 1;
        doc.setFillColor(255, 255, 255); doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 8, 8, "F");
        try { doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize); } catch (e) {}
        const textX = badgeX + badgeSize + 14;
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
        doc.text(title, textX, 30);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(200, 214, 205);
        doc.text(`${reportPreset} · ${rangeLabel}`, textX, 46);
        doc.setFontSize(8);
        doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 30, { align: "right" });
        return headerH + 20;
      };
      const footer = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setDrawColor(...GRID); doc.line(margin, pageH - 26, pageW - margin, pageH - 26);
          doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SUBTLE);
          doc.text("Sridhi Ventures · Milk Distributor Report", margin, pageH - 13);
          doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 13, { align: "right" });
        }
      };

      const all = rows || [];
      // Every telecaller call + field visit, flattened, scoped to the date range.
      const entries = [];
      all.forEach(d => {
        (d.telecallerRemarks || []).forEach(r => {
          const dateStr = localISO(r.at);
          if (dateStr < reportFrom || dateStr > reportTo) return;
          if (reportTelecaller !== "All" && r.telecaller !== reportTelecaller) return;
          entries.push({ at: r.at, dateStr, distributor: d.name, area: d.area || "—", by: r.telecaller || "—", kind: "Telecaller Call", note: r.text || r.tag || "—", tag: r.tag, sentiment: r.sentiment });
        });
        (d.fieldSalesRemarks || []).forEach(r => {
          const dateStr = localISO(r.at);
          if (dateStr < reportFrom || dateStr > reportTo) return;
          entries.push({ at: r.at, dateStr, distributor: d.name, area: d.area || "—", by: r.visitedBy || "Field Sales", kind: "Field Visit", note: r.text || r.tag || "—", tag: r.tag, sentiment: r.sentiment });
        });
      });
      entries.sort((a, b) => a.at - b.at);

      // ── Page 1: Team overview ──
      let y = header("Milk Distributor — Team Overview");
      const totalDistributors = all.length;
      const stageBreakdown = MILK_STAGES.map(s => ({ ...s, count: all.filter(d => d.status === s.id).length }));
      const callsInRange = entries.filter(e => e.kind === "Telecaller Call").length;
      const visitsInRange = entries.filter(e => e.kind === "Field Visit").length;
      const chips = [
        [`${totalDistributors} Total Distributors`, TEAL, [229, 248, 238]],
        [`${callsInRange} Calls Logged`, INDIGO, [235, 234, 253]],
        [`${visitsInRange} Field Visits`, AMBER, [254, 246, 224]],
      ];
      let cx = margin;
      chips.forEach(([label, color, tint]) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        const w = doc.getTextWidth(label) + 22;
        doc.setFillColor(...tint); doc.setDrawColor(...color);
        doc.roundedRect(cx, y, w, 24, 12, 12, "FD");
        doc.setTextColor(...color); doc.text(label, cx + 11, y + 16);
        cx += w + 8;
      });
      y += 42;

      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
      doc.text("PIPELINE STATUS", margin, y); y += 10;
      const sbw = (pageW - margin * 2 - 7 * 6) / 8;
      stageBreakdown.forEach((s, i) => {
        const bx = margin + i * (sbw + 6);
        const rgb = s.color.startsWith("#") ? [parseInt(s.color.slice(1, 3), 16), parseInt(s.color.slice(3, 5), 16), parseInt(s.color.slice(5, 7), 16)] : SUBTLE;
        doc.setFillColor(...rgb.map(c => Math.min(255, c + (255 - c) * 0.88)));
        doc.setDrawColor(...rgb);
        doc.roundedRect(bx, y, sbw, 40, 6, 6, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...rgb);
        doc.text(String(s.count), bx + 6, y + 20);
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); doc.setTextColor(...SUBTLE);
        doc.text(s.id.toUpperCase(), bx + 6, y + 32, { maxWidth: sbw - 8 });
      });
      y += 58;

      const posCount = entries.filter(e => e.sentiment === "positive").length;
      const negCount = entries.filter(e => e.sentiment === "negative").length;
      const neuCount = entries.filter(e => e.sentiment === "neutral").length;
      const totalResp = posCount + negCount + neuCount;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
      doc.text("RESPONSE ANALYSIS (CALLS + VISITS)", margin, y); y += 10;
      const statBoxes = [["Positive", posCount, POS], ["Negative", negCount, NEG], ["Neutral", neuCount, NEU]];
      const boxW = (pageW - margin * 2 - 16) / 3;
      statBoxes.forEach(([label, count, color], i) => {
        const bx = margin + i * (boxW + 8);
        doc.setFillColor(...color.map(c => Math.min(255, c + (255 - c) * 0.88)));
        doc.setDrawColor(...color);
        doc.roundedRect(bx, y, boxW, 44, 8, 8, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(...color);
        doc.text(String(count), bx + 12, y + 27);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
        const pct = totalResp ? Math.round((count / totalResp) * 100) : 0;
        doc.text(`${label.toUpperCase()} · ${pct}%`, bx + 12, y + 38);
      });
      y += 56;
      if (totalResp) {
        const barX = margin, barY = y, barW = pageW - margin * 2, barH = 12;
        let bx2 = barX;
        [[posCount, POS], [neuCount, NEU], [negCount, NEG]].forEach(([count, color]) => {
          if (!count) return;
          const w = (count / totalResp) * barW;
          doc.setFillColor(...color); doc.rect(bx2, barY, w, barH, "F");
          bx2 += w;
        });
        doc.setDrawColor(...GRID); doc.roundedRect(barX, barY, barW, barH, 3, 3, "S");
        y += barH + 22;
      } else y += 8;

      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
      doc.text("BY TELECALLER", margin, y); y += 8;
      const tcRows = MILK_TELECALLERS.map(t => {
        const tEntries = entries.filter(e => e.kind === "Telecaller Call" && e.by === t);
        const pos = tEntries.filter(e => e.sentiment === "positive").length;
        const neg = tEntries.filter(e => e.sentiment === "negative").length;
        return [t, all.filter(d => d.telecaller === t).length, tEntries.length, pos, neg];
      });
      autoTable(doc, {
        startY: y, margin: { top: 94, bottom: 40 },
        head: [["Telecaller", "Distributors Assigned", "Calls in Range", "Positive", "Negative"]],
        body: tcRows, theme: "grid",
        styles: { font: "helvetica", fontSize: 9, cellPadding: 6, lineColor: GRID, lineWidth: 0.6, textColor: INK },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 248] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 120 } },
      });

      // ── Page 2+: Unified activity log ──
      doc.addPage();
      let yy = header("Milk Distributor — Activity Log");
      if (!entries.length) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...SUBTLE);
        doc.text("No calls or visits logged in this period.", margin, yy + 10);
      } else {
        const TAG_SENTIMENT = {};
        [...MILK_TC_TAGS, ...MILK_FS_TAGS].forEach(t => { TAG_SENTIMENT[t.label] = t.sentiment; });
        const SENTIMENT_RGB = { positive: POS, negative: NEG, neutral: NEU };
        const byDate = {};
        entries.forEach(e => { (byDate[e.dateStr] = byDate[e.dateStr] || []).push(e); });
        const body = [];
        Object.keys(byDate).sort().forEach(d => {
          body.push([{ content: formatDateReadable(d) + `  (${byDate[d].length} entr${byDate[d].length === 1 ? "y" : "ies"})`, colSpan: 6, styles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 } }]);
          byDate[d].forEach(e => {
            body.push([
              new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
              e.kind, e.distributor, e.area, e.by, e.note || "—",
            ]);
          });
        });
        autoTable(doc, {
          startY: yy, margin: { top: 94, bottom: 40 },
          head: [["Time", "Type", "Distributor", "Area", "By", "Remark"]],
          body, theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "middle" },
          headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 9 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 62, fontStyle: "bold" }, 2: { fontStyle: "bold", cellWidth: 90 }, 3: { cellWidth: 68 }, 4: { cellWidth: 62 } },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 1) {
              const color = data.cell.raw === "Field Visit" ? AMBER : INDIGO;
              data.cell.styles.textColor = color;
              data.cell.styles.fillColor = color.map(c => Math.min(255, c + (255 - c) * 0.88));
            }
          },
          didDrawPage: () => header("Milk Distributor — Activity Log"),
        });
      }

      footer();
      doc.save(`Milk-Distributor-Report_${reportFrom}_to_${reportTo}.pdf`);
    } finally {
      setGeneratingReport(false);
    }
  };

  // ── Detail view ──
  if (selected) {
    const r = selected;
    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12, fontFamily: FONT }}>← Back to list</button>

        <Card accent={milkStageColor(r.status)} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.t1 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>{r.area || "No area"} {r.contact ? "· " + r.contact : ""}</div>
            </div>
            <Chip label={r.status} color={milkStageColor(r.status)} />
          </div>
          {r.address && <div style={{ fontSize: 12, color: T.t2, marginTop: 8 }}>{r.address}</div>}
          {r.currentBrand && <div style={{ marginTop: 8 }}><Chip small label={"Currently uses: " + r.currentBrand} color={T.t3} /></div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {r.contact && <button onClick={() => window.open("tel:" + r.contact)} style={{ flex: "1 1 100px", background: T.emerald + "22", border: `1px solid ${T.emerald}44`, borderRadius: 10, color: T.emerald, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📞 Call</button>}
            {r.mapLink && <button onClick={() => window.open(r.mapLink, "_blank")} style={{ flex: "1 1 100px", background: T.sky + "22", border: `1px solid ${T.sky}44`, borderRadius: 10, color: T.sky, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📍 Open Map</button>}
            <button onClick={() => deleteDistributor(r)} style={{ flex: "1 1 100px", background: T.rose + "18", border: `1px solid ${T.rose}44`, borderRadius: 10, color: T.rose, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>🗑️ Delete</button>
          </div>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Label sub="Map location is set by the telecaller — field sales taps Open Map above to navigate there">Distributor Details</Label>
          <Field label="Name" value={detailEdit.name} onChange={e => setDetailEdit({ ...detailEdit, name: e.target.value })} />
          <Field label="Contact" value={detailEdit.contact} onChange={e => setDetailEdit({ ...detailEdit, contact: e.target.value })} type="tel" />
          <Field label="Area" value={detailEdit.area} onChange={e => setDetailEdit({ ...detailEdit, area: e.target.value })} />
          <Field label="Address" value={detailEdit.address} onChange={e => setDetailEdit({ ...detailEdit, address: e.target.value })} />
          <Field label="Currently Uses (brand)" value={detailEdit.currentBrand} onChange={e => setDetailEdit({ ...detailEdit, currentBrand: e.target.value })} placeholder="e.g. Arokiya, Aavin" />
          <Field label="Google Maps Link" value={detailEdit.mapLink} onChange={e => setDetailEdit({ ...detailEdit, mapLink: e.target.value })} placeholder="Paste Google Maps link here" />
          <Btn label="Save Details" small onClick={() => saveDetailEdit(r.id)} />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Label sub="Update where this distributor stands">Status</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {MILK_STAGES.map(s => (
              <button key={s.id} onClick={() => setStatus(r.id, s.id)} style={{
                background: r.status === s.id ? s.color + "22" : T.surface,
                border: `1px solid ${r.status === s.id ? s.color : T.border}`,
                borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700,
                color: r.status === s.id ? s.color : T.t2, cursor: "pointer", fontFamily: FONT,
              }}>{s.id}</button>
            ))}
          </div>
        </Card>

        <Card style={{ marginBottom: 14 }} accent={T.indigo}>
          <Label sub={`${(r.telecallerRemarks || []).length} call${(r.telecallerRemarks || []).length === 1 ? "" : "s"} logged`}>☎ Telecaller Remarks</Label>
          {(r.telecallerRemarks || []).length === 0 && <div style={{ fontSize: 12, color: T.t3, marginBottom: 10 }}>No calls logged yet.</div>}
          {(r.telecallerRemarks || []).slice().reverse().map((rm, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: i < r.telecallerRemarks.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0, background: SENTIMENT_COLOR[rm.sentiment || "neutral"] }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: T.t2 }}>{rm.tag ? <b style={{ color: T.t1 }}>{rm.tag}</b> : null}{rm.tag && rm.text ? " — " : ""}{rm.text}</div>
                <div style={{ fontSize: 10, color: T.t4, marginTop: 1 }}>{rm.telecaller} · {new Date(rm.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          ))}
          <Dropdown label="Telecaller" value={tcTelecaller} onChange={e => setTcTelecaller(e.target.value)} options={MILK_TELECALLERS} />
          <div style={{ fontSize: 11, color: T.t2, marginTop: 2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Quick Tag (optional)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {MILK_TC_TAGS.map(tag => {
              const active = tcTag && tcTag.label === tag.label;
              const color = SENTIMENT_COLOR[tag.sentiment];
              return (
                <button key={tag.label} onClick={() => setTcTag(active ? null : tag)} style={{
                  background: active ? color + "22" : T.surface, border: `1px solid ${active ? color : T.border}`,
                  borderRadius: 20, padding: "6px 12px", fontSize: 11, fontWeight: 700,
                  color: active ? color : T.t2, cursor: "pointer", fontFamily: FONT,
                }}>{tag.label}</button>
              );
            })}
          </div>
          <textarea value={tcNote} onChange={e => setTcNote(e.target.value)} rows={2}
            placeholder="Add extra detail (optional if a tag is picked)…"
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 13, fontFamily: FONT, outline: "none", width: "100%", boxSizing: "border-box", resize: "none", marginTop: 10 }} />
          <div style={{ marginTop: 8 }}><Btn label="Save Telecaller Remark" color={T.indigo} full onClick={() => addTelecallerRemark(r.id)} disabled={!tcNote.trim() && !tcTag} /></div>
        </Card>

        <Card accent={T.amber}>
          <Label sub={`${(r.fieldSalesRemarks || []).length} visit${(r.fieldSalesRemarks || []).length === 1 ? "" : "s"} logged`}>🚗 Field Sales Remarks</Label>
          {(r.fieldSalesRemarks || []).length === 0 && <div style={{ fontSize: 12, color: T.t3, marginBottom: 10 }}>No visits logged yet.</div>}
          {(r.fieldSalesRemarks || []).slice().reverse().map((rm, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: i < r.fieldSalesRemarks.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0, background: SENTIMENT_COLOR[rm.sentiment || "neutral"] }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: T.t2 }}>{rm.tag ? <b style={{ color: T.t1 }}>{rm.tag}</b> : null}{rm.tag && rm.text ? " — " : ""}{rm.text}</div>
                <div style={{ fontSize: 10, color: T.t4, marginTop: 1 }}>{rm.visitedBy} · {new Date(rm.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          ))}
          <Field label="Visited By (optional)" value={fsVisitedBy} onChange={e => setFsVisitedBy(e.target.value)} placeholder="e.g. Ramesh K" />
          <div style={{ fontSize: 11, color: T.t2, marginTop: 2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Quick Tag (optional)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {MILK_FS_TAGS.map(tag => {
              const active = fsTag && fsTag.label === tag.label;
              const color = SENTIMENT_COLOR[tag.sentiment];
              return (
                <button key={tag.label} onClick={() => setFsTag(active ? null : tag)} style={{
                  background: active ? color + "22" : T.surface, border: `1px solid ${active ? color : T.border}`,
                  borderRadius: 20, padding: "6px 12px", fontSize: 11, fontWeight: 700,
                  color: active ? color : T.t2, cursor: "pointer", fontFamily: FONT,
                }}>{tag.label}</button>
              );
            })}
          </div>
          <textarea value={fsNote} onChange={e => setFsNote(e.target.value)} rows={2}
            placeholder="What happened at the visit…"
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 13, fontFamily: FONT, outline: "none", width: "100%", boxSizing: "border-box", resize: "none", marginTop: 10 }} />
          <div style={{ marginTop: 8 }}><Btn label="Save Field Sales Remark" color={T.amber} full onClick={() => addFieldSalesRemark(r.id)} disabled={!fsNote.trim() && !fsTag} /></div>
        </Card>
      </div>
    );
  }

  // ── List view ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card accent={T.emerald}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SyncBadge status={syncStatus} />
        </div>
        <Label sub={`${(rows || []).length} distributor${(rows || []).length === 1 ? "" : "s"} · telecaller adds & calls, field sales visits & updates`}>🥛 Milk Distributors</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn label="+ Add Distributor" onClick={() => setShowAdd(true)} />
          <Btn label="📥 Bulk Import" ghost onClick={() => { setShowImport(true); setImportPreview(null); }} />
        </div>
      </Card>

      <Card accent={T.amber}>
        <Label sub="Every telecaller call and field visit is logged with who did it and when — download a day, week, month, or custom-range report">Milk Distributor Report</Label>
        <Dropdown label="Telecaller (for the by-telecaller breakdown)" value={reportTelecaller} onChange={e => setReportTelecaller(e.target.value)} options={["All", ...MILK_TELECALLERS]} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {["Today", "This Week", "This Month", "Custom"].map(p => (
            <button key={p} onClick={() => applyReportPreset(p)} style={{
              background: reportPreset === p ? T.amber : "transparent", color: reportPreset === p ? "#FFFFFF" : T.t2,
              border: `1px solid ${reportPreset === p ? T.amber : T.border}`, borderRadius: 10, padding: "8px 13px",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            }}>{p}</button>
          ))}
        </div>
        {reportPreset === "Custom" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, color: T.t3, marginBottom: 4, fontWeight: 600 }}>FROM</div><input type="date" value={reportFrom} max={todayISO()} onChange={e => { setReportFrom(e.target.value); setReportPreset("Custom"); }} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, color: T.t3, marginBottom: 4, fontWeight: 600 }}>TO</div><input type="date" value={reportTo} max={todayISO()} onChange={e => { setReportTo(e.target.value); setReportPreset("Custom"); }} style={inputStyle} /></div>
          </div>
        )}
        <Btn full label={generatingReport ? "Generating…" : "🧾 Download PDF Report"} color={T.amber} disabled={generatingReport} onClick={downloadMilkReport} />
      </Card>

      <Field label="Search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, area, contact…" />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        {["All", ...MILK_STAGES.map(s => s.id)].map(s => (
          <button key={s} onClick={() => setStageFilter(s)} style={{
            background: stageFilter === s ? (s === "All" ? T.accent : milkStageColor(s)) + "22" : T.surface,
            border: `1px solid ${stageFilter === s ? (s === "All" ? T.accent : milkStageColor(s)) : T.border}`,
            borderRadius: 20, padding: "6px 12px", fontSize: 11, fontWeight: 700,
            color: stageFilter === s ? (s === "All" ? T.accent : milkStageColor(s)) : T.t2, cursor: "pointer", fontFamily: FONT,
          }}>{s}</button>
        ))}
      </div>

      {!filtered.length ? (
        <div style={{ fontSize: 12.5, color: T.t3, fontStyle: "italic", padding: "10px 2px" }}>No distributors yet — add the first one above.</div>
      ) : filtered.map(r => {
        const lastTc = (r.telecallerRemarks || [])[r.telecallerRemarks.length - 1];
        const lastFs = (r.fieldSalesRemarks || [])[r.fieldSalesRemarks.length - 1];
        const latest = [lastTc, lastFs].filter(Boolean).sort((a, b) => b.at - a.at)[0];
        return (
          <div key={r.id} onClick={() => setSelectedId(r.id)} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: T.t3, marginTop: 2 }}>{r.area || "No area"} {r.telecaller ? "· " + r.telecaller : ""}</div>
              </div>
              <Chip small label={r.status} color={milkStageColor(r.status)} />
            </div>
            {latest && <div style={{ fontSize: 11.5, color: T.t2, marginTop: 8 }}>{latest.tag ? <b>{latest.tag}</b> : null}{latest.tag && latest.text ? " — " : ""}{latest.text || (!latest.tag ? "—" : "")}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              {r.mapLink && <div style={{ fontSize: 10.5, color: T.sky }}>📍 Location set</div>}
              {r.currentBrand && <div style={{ fontSize: 10.5, color: T.t3 }}>Uses: {r.currentBrand}</div>}
            </div>
          </div>
        );
      })}

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Add Milk Distributor">
        <Field label="Distributor / Shop Name *" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. Sri Lakshmi Dairy" />
        <Field label="Contact" value={addForm.contact} onChange={e => setAddForm({ ...addForm, contact: e.target.value })} type="tel" placeholder="98765 43210" />
        <Field label="Area" value={addForm.area} onChange={e => setAddForm({ ...addForm, area: e.target.value })} placeholder="e.g. Ambattur" />
        <Field label="Address" value={addForm.address} onChange={e => setAddForm({ ...addForm, address: e.target.value })} placeholder="Optional" />
        <Field label="Map Location (optional now, can add later)" value={addForm.mapLink} onChange={e => setAddForm({ ...addForm, mapLink: e.target.value })} placeholder="Paste Google Maps link" />
        <Field label="Currently Uses (brand, optional)" value={addForm.currentBrand} onChange={e => setAddForm({ ...addForm, currentBrand: e.target.value })} placeholder="e.g. Arokiya, Aavin" />
        <Dropdown label="Telecaller" value={addForm.telecaller} onChange={e => setAddForm({ ...addForm, telecaller: e.target.value })} options={MILK_TELECALLERS} />
        <Btn label="Add Distributor" full onClick={addDistributor} disabled={!addForm.name.trim()} />
      </Sheet>

      <Sheet open={showImport} onClose={() => setShowImport(false)} title="Bulk Import Distributors">
        <div style={{ fontSize: 12, color: T.t2, marginBottom: 12, lineHeight: 1.5 }}>
          Copy the rows straight from Excel or Google Sheets (including the
          header row) and paste them below. Expected columns: <b>Customer
          Name, Phone Number, Area, Remarks (current brand), Map Link,
          Calling Remark, Telecaller Name</b> — same order works even
          without a header row. Re-importing an updated sheet is safe: rows
          are matched by phone number (or name + area) and merged into
          existing distributors instead of duplicating them.
        </div>
        <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportPreview(null); }} rows={8}
          placeholder="Paste your data here…"
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12 }} />
        <Dropdown label="Default telecaller (used for rows with no Telecaller Name)" value={importDefaultTc} onChange={e => setImportDefaultTc(e.target.value)} options={["Leave unassigned", ...MILK_TELECALLERS]} />

        <BatchTitleField value={importTitle} onChange={v => { setImportTitle(v); setImportPreview(null); }} />
        {!importPreview ? (
          <Btn label="Preview Import" full ghost onClick={runImportPreview} disabled={!importText.trim() || !importTitle.trim()} />
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.emerald }}>{importPreview.rows.length}</div>
                <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>Ready to Import</div>
              </div>
              {importPreview.skipped > 0 && (
                <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.rose }}>{importPreview.skipped}</div>
                  <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>Skipped (no name)</div>
                </div>
              )}
            </div>
            {importPreview.rows.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 12 }}>
                {importPreview.rows.slice(0, 8).map((row, i) => (
                  <div key={i} style={{ padding: "8px 10px", borderBottom: i < Math.min(importPreview.rows.length, 8) - 1 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.t1 }}>{row.name} <span style={{ fontWeight: 400, color: T.t3 }}>{row.area ? "· " + row.area : ""}</span></div>
                    <div style={{ fontSize: 10.5, color: T.t3, marginTop: 1 }}>{row.callingRemark || "No calling remark"} {row.telecaller ? "· " + row.telecaller : ""}</div>
                  </div>
                ))}
                {importPreview.rows.length > 8 && <div style={{ padding: "8px 10px", fontSize: 11, color: T.t3, fontStyle: "italic" }}>+ {importPreview.rows.length - 8} more…</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn label="Edit Data" ghost onClick={() => setImportPreview(null)} />
              <Btn label={importing ? "Importing…" : `Import ${importPreview.rows.length} Distributors`} color={T.emerald}
                onClick={commitImport} disabled={importing || !importPreview.rows.length} />
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

// ─── HUB DISTRIBUTORS ───────────────────────────────────────────────────────
// Hub-wise distributor tracker: log each distributor under a hub with their
// location, basic details and up to 5 areas they cover; maintain one status
// (from the fixed pipeline above) plus a timestamped remark trail showing
// which telecaller approached them and when. Built for a clean management
// report (PDF + Excel) filterable by date range, telecaller, and hub.
function HubDistributors({ embedded = false } = {}) {
  const [rows, setRows, syncStatus, retrySync, syncError] = useSheetSynced("hubDistributors", "hubDistributors", []);
  const [selectedId, setSelectedId] = useState(null);
  // ── Per-record access control ──────────────────────────────────────────
  // Nobody can open a specific distributor without proving they're either
  // the telecaller it's currently assigned to, or the telecaller a pending
  // transfer is addressed to. Nothing here is remembered — every tap on a
  // row asks for the key fresh, even for a record you just closed.
  const [pendingOpen, setPendingOpen] = useState(null);   // record awaiting key entry
  const [openKeyValue, setOpenKeyValue] = useState("");
  const [openKeyError, setOpenKeyError] = useState("");   // "" | "wrong" | "notyours"
  const [currentTelecaller, setCurrentTelecaller] = useState(null); // who is verified & viewing `selected`
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const blankForm = { hub: "", name: "", contact: "", address: "", mapLink: "", details: "", telecaller: TELECALLERS[0], area1: "", area2: "", area3: "", area4: "", area5: "", scheduledVisitAt: "", scheduledVisitNote: "" };
  const [addForm, setAddForm] = useState(blankForm);
  const [statusFilter, setStatusFilter] = useState("All");
  const [hubFilter, setHubFilter] = useState("All");
  const [telecallerFilter, setTelecallerFilter] = useState("All");
  const [search, setSearch] = useState("");

  // Bulk selection (for multi-delete)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelectMode = () => { setSelectMode(m => !m); setSelectedIds(new Set()); };
  const toggleSelected = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [detailEdit, setDetailEdit] = useState(blankForm);

  // Bulk import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  // Most sparse phone-only pastes so far have come from field calls made
  // by Azgar (Intern), so that's the sensible default rather than blank —
  // still fully overridable per import, and never overrides a telecaller
  // name actually found inline in the pasted text.
  const [importDefaultTc, setImportDefaultTc] = useState("Azgar (Intern)");
  const [importDefaultHub, setImportDefaultHub] = useState("");
  const [importPreview, setImportPreview] = useState(null); // { rows, skipped } | null
  const [importing, setImporting] = useState(false);
  const [importTitle, setImportTitle] = useState("");

  // Split & Assign — paste a fresh batch of numbers (bulk or one at a
  // time) and divide them evenly, round-robin, across whichever telecallers
  // are selected. A Shuffle button re-randomizes who gets which number
  // before committing, purely for fun/fairness — the split stays equal
  // either way, only the assignment order changes.
  const [showSplit, setShowSplit] = useState(false);
  const [splitText, setSplitText] = useState("");
  const [splitTitle, setSplitTitle] = useState("");
  const [splitTelecallers, setSplitTelecallers] = useState(() => new Set(["Thulasi", "Sabi (Intern)", "Azgar (Intern)", "Naveen HR"]));
  const [splitHub, setSplitHub] = useState("");
  const [splitPreview, setSplitPreview] = useState(null); // { buckets: [{telecaller, contacts}], skipped, total } | null
  const [splitCommitting, setSplitCommitting] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const toggleSplitTelecaller = (t) => setSplitTelecallers(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });

  // Remark / status composer
  const [rmTelecaller, setRmTelecaller] = useState(TELECALLERS[0]);
  const [rmStatus, setRmStatus] = useState(HUB_STAGES[0].id);
  const [rmNote, setRmNote] = useState("");

  // Scheduled visit composer — settable at creation or updated anytime
  // later from the detail screen, independent of the remark timeline.
  const [visitDateEdit, setVisitDateEdit] = useState("");
  const [visitNoteEdit, setVisitNoteEdit] = useState("");

  // Report state
  const [reportPreset, setReportPreset] = useState("Today");
  const [reportFrom, setReportFrom] = useState(todayISO());
  const [reportTo, setReportTo] = useState(todayISO());
  const [reportTelecaller, setReportTelecaller] = useState("All");
  const [reportHub, setReportHub] = useState("All");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [showRebalance, setShowRebalance] = useState(false);
  const [rebalancePreview, setRebalancePreview] = useState(null);
  const [rebalanceIncluded, setRebalanceIncluded] = useState(() => TELECALLERS.reduce((o, t) => ({ ...o, [t]: true }), {}));
  const [rebalanceManual, setRebalanceManual] = useState(false);
  const [manualNeeds, setManualNeeds] = useState({});
  const [generatingCallSheet, setGeneratingCallSheet] = useState(false);

  const applyReportPreset = (preset) => {
    setReportPreset(preset);
    const now = new Date();
    if (preset === "Today") { setReportFrom(todayISO()); setReportTo(todayISO()); }
    else if (preset === "This Week") {
      const day = now.getDay() || 7;
      const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
      setReportFrom(localISO(monday)); setReportTo(todayISO());
    } else if (preset === "This Month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setReportFrom(localISO(first)); setReportTo(todayISO());
    }
  };

  const hubOptions = useMemo(() => {
    const set = new Set((rows || []).map(r => (r.hub || "").trim()).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [rows]);

  // Visits due today, tomorrow, or overdue — computed off the full list
  // (not the current filter/search), so the reminder banner never hides a
  // schedule just because you're mid-search or on a different status tab.
  const dueVisits = useMemo(() => {
    return (rows || [])
      .map(r => ({ r, urgency: hubVisitUrgency(r.scheduledVisitAt) }))
      .filter(x => x.urgency === "overdue" || x.urgency === "today" || x.urgency === "tomorrow")
      .sort((a, b) => (a.r.scheduledVisitAt || "").localeCompare(b.r.scheduledVisitAt || ""));
  }, [rows]);
  const [showOnlyScheduled, setShowOnlyScheduled] = useState(false);
  const [showOnlyUnopened, setShowOnlyUnopened] = useState(false);

  const areasFromForm = (f) => [f.area1, f.area2, f.area3, f.area4, f.area5].map(a => (a || "").trim()).filter(Boolean).slice(0, MAX_HUB_AREAS);

  const selected = (rows || []).find(r => r.id === selectedId) || null;
  useEffect(() => {
    if (selected) {
      setRmTelecaller(selected.telecaller || TELECALLERS[0]);
      setRmStatus(selected.status || HUB_STAGES[0].id);
      setVisitDateEdit(selected.scheduledVisitAt || "");
      setVisitNoteEdit(selected.scheduledVisitNote || "");
      const areas = selected.areas || [];
      setDetailEdit({
        hub: selected.hub || "", name: selected.name || "", contact: selected.contact || "",
        address: selected.address || "", mapLink: selected.mapLink || "", details: selected.details || "",
        telecaller: selected.telecaller || TELECALLERS[0],
        area1: areas[0] || "", area2: areas[1] || "", area3: areas[2] || "", area4: areas[3] || "", area5: areas[4] || "",
      });
    }
  }, [selectedId]); // eslint-disable-line

  const filtered = useMemo(() => {
    let list = rows || [];
    if (statusFilter !== "All") list = list.filter(r => r.status === statusFilter);
    if (hubFilter !== "All") list = list.filter(r => (r.hub || "") === hubFilter);
    if (telecallerFilter !== "All") list = list.filter(r => (r.telecaller || "") === telecallerFilter);
    if (showOnlyScheduled) list = list.filter(r => !!r.scheduledVisitAt);
    if (showOnlyUnopened) list = list.filter(r => (r.remarks || []).length === 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.hub || "").toLowerCase().includes(q) ||
        (r.contact || "").includes(q) ||
        (r.areas || []).some(a => (a || "").toLowerCase().includes(q))
      );
    }
    if (showOnlyScheduled) {
      return [...list].sort((a, b) => (a.scheduledVisitAt || "").localeCompare(b.scheduledVisitAt || ""));
    }
    return [...list].sort((a, b) => (b.lastRemarkAt || b.createdAt || 0) - (a.lastRemarkAt || a.createdAt || 0));
  }, [rows, statusFilter, hubFilter, telecallerFilter, search, showOnlyScheduled, showOnlyUnopened]);

  const addDistributor = () => {
    if (!addForm.name.trim()) { alert("Enter the distributor name."); return; }
    if (!addForm.hub.trim()) { alert("Enter the hub name."); return; }
    // Bulk Import already refuses to duplicate a phone number — the manual
    // Add form didn't, which is how the same contact ended up saved twice
    // under slightly different hub spellings (e.g. "koyambadu" vs
    // "koyambedu"). Same check here, but as a confirm rather than a hard
    // block, since two genuinely different people can share a landline.
    const phone = normalizePhone(addForm.contact);
    if (phone) {
      const dupe = (rows || []).find(r => normalizePhone(r.contact) === phone);
      if (dupe) {
        const proceed = confirm(
          `"${dupe.name}" (${dupe.hub || "no hub"}) already has this phone number.\n\nAdd this as a separate distributor anyway? Tap Cancel to open the existing one instead.`
        );
        if (!proceed) { setShowAdd(false); requestOpen(dupe); return; }
      }
    }
    const now = Date.now();
    const rec = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      hub: addForm.hub.trim(), name: addForm.name.trim(), contact: addForm.contact.trim(),
      areas: areasFromForm(addForm),
      address: addForm.address.trim(), mapLink: addForm.mapLink.trim(), details: addForm.details.trim(),
      status: "New", telecaller: addForm.telecaller, remarks: [],
      createdAt: now, lastRemarkAt: null,
      scheduledVisitAt: addForm.scheduledVisitAt || null, scheduledVisitNote: addForm.scheduledVisitNote.trim(),
    };
    setRows(prev => [rec, ...(prev || [])]);
    setAddForm(blankForm);
    setShowAdd(false);
    setCurrentTelecaller(rec.telecaller);
    setSelectedId(rec.id);
  };

  // Scheduled visit can be set at creation or updated any time later from
  // the detail screen — saved independently of the remark timeline so
  // rescheduling a visit doesn't require typing an unrelated call note.
  const saveScheduledVisit = (id) => {
    setRows(prev => (prev || []).map(r => r.id === id ? {
      ...r, scheduledVisitAt: visitDateEdit || null, scheduledVisitNote: visitNoteEdit.trim(),
    } : r));
  };
  const clearScheduledVisit = (id) => {
    setVisitDateEdit(""); setVisitNoteEdit("");
    setRows(prev => (prev || []).map(r => r.id === id ? { ...r, scheduledVisitAt: null, scheduledVisitNote: "" } : r));
  };

  // ── Bulk import ──
  // Accepts sparse pasted rows — down to just a phone number with nothing
  // else — and either merges onto a matching existing distributor (matched
  // by phone, falling back to name+hub) or creates a new minimal record.
  // Re-pasting an updated sheet is safe: matches are merged, not duplicated,
  // and existing details are never overwritten by a blank incoming cell.
  const runImportPreview = () => setImportPreview(parseHubBulkImport(importText, importDefaultTc));
  const commitImport = () => {
    if (!importPreview || !importPreview.rows.length) return;
    if (!importTitle.trim()) { alert("Please enter a Batch Title / Heading first."); return; }
    const bt = importTitle.trim();
    setImporting(true);
    setRows(prev => {
      const existing = [...(prev || [])];
      importPreview.rows.forEach(ir => {
        const phone = normalizePhone(ir.contact);
        const matchIdx = existing.findIndex(e =>
          (phone && normalizePhone(e.contact) === phone) ||
          (!phone && ir.name && e.name.trim().toLowerCase() === ir.name.toLowerCase() && (e.hub || "").trim().toLowerCase() === (ir.hub || importDefaultHub || "").trim().toLowerCase())
        );
        let telecaller = TELECALLERS.find(t => t.toLowerCase() === (ir.telecaller || "").toLowerCase()) || importDefaultTc;
        const statusFromRemark = classifyHubRemark(ir.remark);
        const areas = (ir.area || "").split(/[,/|]/).map(a => a.trim()).filter(Boolean).slice(0, MAX_HUB_AREAS);
        // A contact-only row still needs something to show in the list.
        const placeholderName = ir.contact ? ("Unnamed · " + ir.contact) : "Unnamed Distributor";
        const displayName = ir.name || placeholderName;

        if (matchIdx >= 0) {
          const cur = existing[matchIdx];
          const lastNote = (cur.remarks || []).length ? cur.remarks[cur.remarks.length - 1].text : null;
          const newRemarks = [...(cur.remarks || [])];
          const newStatus = statusFromRemark || cur.status;
          if (ir.remark && ir.remark !== lastNote) {
            newRemarks.push({ text: ir.remark, status: newStatus, telecaller: telecaller || cur.telecaller || "", at: Date.now() });
          }
          const curIsPlaceholder = !cur.name || cur.name === "Unnamed Distributor" || cur.name.startsWith("Unnamed · ");
          existing[matchIdx] = {
            ...cur,
            name: (curIsPlaceholder && ir.name) ? ir.name : cur.name,
            hub: cur.hub && cur.hub !== "Unassigned" ? cur.hub : (ir.hub || importDefaultHub || cur.hub || "Unassigned"),
            areas: (cur.areas && cur.areas.length) ? cur.areas : areas,
            address: cur.address || ir.address,
            mapLink: cur.mapLink || ir.mapLink,
            details: cur.details || ir.details,
            contact: cur.contact || ir.contact,
            telecaller: telecaller || cur.telecaller,
            batchTitle: cur.batchTitle || bt,
            status: newStatus,
            remarks: newRemarks,
            lastRemarkAt: newRemarks.length ? newRemarks[newRemarks.length - 1].at : cur.lastRemarkAt,
          };
        } else {
          const now = Date.now();
          const initialStatus = statusFromRemark || "New";
          const rec = {
            id: Date.now() + "_" + Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 5),
            hub: ir.hub || importDefaultHub || "Unassigned",
            name: displayName,
            contact: ir.contact || "",
            areas,
            address: ir.address || "", mapLink: ir.mapLink || "", details: ir.details || "", batchTitle: bt,
            status: initialStatus, telecaller: telecaller || "",
            remarks: ir.remark ? [{ text: ir.remark, status: initialStatus, telecaller: telecaller || "", at: now }] : [],
            createdAt: now, lastRemarkAt: ir.remark ? now : null,
          };
          existing.push(rec);
        }
      });
      return existing;
    });
    setImporting(false);
    setShowImport(false);
    setImportText("");
    setImportTitle("");
    setImportPreview(null);
  };

  // ── Split & Assign ──
  // Paste a fresh batch of numbers, pick which telecallers are working
  // today, and divide the batch evenly (round-robin) between them —
  // sparse rows (contact-only, no name) are welcome here just like Bulk
  // Import. Every new record lands in the same Hub Distributors list as
  // everything else, so once split, each telecaller just filters the main
  // list down to their own name and works it like normal — nothing about
  // status/remarks/reports is special-cased for a "split" record.
  const buildSplitPreview = () => {
    const telecallerList = Array.from(splitTelecallers);
    if (!telecallerList.length) { alert("Select at least one telecaller to split between."); return; }
    if (!splitText.trim()) { alert("Paste or type in the numbers first."); return; }
    const parsed = parseHubBulkImport(splitText, "").rows;
    const existingPhones = new Set((rows || []).map(r => normalizePhone(r.contact)).filter(Boolean));
    const fresh = [];
    let skipped = 0;
    parsed.forEach(p => {
      const phone = normalizePhone(p.contact);
      if (phone && existingPhones.has(phone)) { skipped++; return; } // already a distributor — don't duplicate
      fresh.push(p);
    });
    if (!fresh.length) { alert(skipped ? `All ${skipped} number(s) already exist as distributors — nothing new to split.` : "No valid numbers found in what was pasted."); return; }
    const shuffled = [...fresh].sort(() => Math.random() - 0.5);
    const buckets = telecallerList.map(t => ({ telecaller: t, contacts: [] }));
    shuffled.forEach((p, i) => buckets[i % buckets.length].contacts.push(p));
    setSplitPreview({ buckets, skipped, total: fresh.length });
  };

  // Re-randomizes who gets which number without changing the total split —
  // a little animated flourish (isShuffling) makes it feel like a real
  // shuffle rather than an instant silent re-sort.
  const shuffleSplit = () => {
    if (!splitPreview) return;
    setIsShuffling(true);
    setTimeout(() => {
      setSplitPreview(prev => {
        if (!prev) return prev;
        const all = prev.buckets.flatMap(b => b.contacts);
        const reshuffled = [...all].sort(() => Math.random() - 0.5);
        const buckets = prev.buckets.map(b => ({ ...b, contacts: [] }));
        reshuffled.forEach((p, i) => buckets[i % buckets.length].contacts.push(p));
        return { ...prev, buckets };
      });
      setIsShuffling(false);
    }, 380);
  };

  const commitSplit = () => {
    if (!splitPreview || !splitPreview.total) return;
    if (!splitTitle.trim()) { alert("Please enter a Batch Title / Heading first."); return; }
    const bt = splitTitle.trim();
    setSplitCommitting(true);
    const now = Date.now();
    const newRecs = [];
    splitPreview.buckets.forEach(b => {
      b.contacts.forEach(p => {
        newRecs.push({
          id: Date.now() + "_" + Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 5),
          hub: splitHub.trim() || "Unassigned",
          name: p.name || (p.contact ? "Unnamed · " + p.contact : "Unnamed Distributor"),
          contact: p.contact || "",
          areas: [], address: "", mapLink: "", details: "", batchTitle: bt,
          status: "New", telecaller: b.telecaller, remarks: [],
          createdAt: now, lastRemarkAt: null, scheduledVisitAt: null, scheduledVisitNote: "",
        });
      });
    });
    setRows(prev => [...newRecs, ...(prev || [])]);
    setSplitCommitting(false);
    setShowSplit(false);
    setSplitText("");
    setSplitTitle("");
    setSplitPreview(null);
    alert(`Added ${newRecs.length} distributor${newRecs.length === 1 ? "" : "s"}, split evenly across ${splitPreview.buckets.length} telecaller${splitPreview.buckets.length === 1 ? "" : "s"}.`);
  };

  const saveDetailEdit = (id) => {
    if (!detailEdit.name.trim()) { alert("Name can't be empty."); return; }
    if (!detailEdit.hub.trim()) { alert("Hub can't be empty."); return; }
    setRows(prev => (prev || []).map(r => r.id === id ? {
      ...r, hub: detailEdit.hub.trim(), name: detailEdit.name.trim(), contact: detailEdit.contact.trim(),
      address: detailEdit.address.trim(), mapLink: detailEdit.mapLink.trim(), details: detailEdit.details.trim(),
      areas: areasFromForm(detailEdit),
    } : r));
  };

  // ── Open a record only after its owner's (or incoming transfer target's) key is verified ──
  const requestOpen = (r) => { setPendingOpen(r); setOpenKeyValue(""); setOpenKeyError(""); };
  const closeKeyPrompt = () => { setPendingOpen(null); setOpenKeyValue(""); setOpenKeyError(""); };
  const submitOpenKey = () => {
    if (!openKeyValue) return;
    const name = SECRET_KEYS[openKeyValue.trim()];
    if (!name) { setOpenKeyError("wrong"); setOpenKeyValue(""); return; }
    const r = pendingOpen;
    const isOwner = name === r.telecaller;
    const isIncoming = r.transferStatus === "pending" && r.transferTo === name;
    if (!isOwner && !isIncoming) { setOpenKeyError("notyours"); setOpenKeyValue(""); return; }
    setCurrentTelecaller(name);
    setSelectedId(r.id);
    closeKeyPrompt();
  };
  const closeDetail = () => { setSelectedId(null); setCurrentTelecaller(null); };

  // ── Transfer / accept workflow ──────────────────────────────────────────
  // Ownership only ever changes at the moment of Accept — sending a transfer
  // just proposes it. Every accepted transfer is appended to transferHistory
  // permanently, so "who this came from" is never lost even much later.
  const sendTransfer = (id) => {
    if (!transferTarget) { alert("Pick who to transfer this to."); return; }
    const at = Date.now();
    setRows(prev => (prev || []).map(x => x.id === id ? {
      ...x, transferTo: transferTarget, transferStatus: "pending", transferRequestedAt: at, lastRemarkAt: at,
      remarks: [...(x.remarks || []), { text: `Requested transfer to ${transferTarget}`, status: x.status, telecaller: currentTelecaller || x.telecaller, at }],
    } : x));
    setTransferOpen(false); setTransferTarget("");
  };
  const cancelTransfer = (id) => {
    const at = Date.now();
    setRows(prev => (prev || []).map(x => x.id === id ? {
      ...x, transferTo: null, transferStatus: null, transferRequestedAt: null, lastRemarkAt: at,
      remarks: [...(x.remarks || []), { text: "Cancelled the transfer request", status: x.status, telecaller: currentTelecaller || x.telecaller, at }],
    } : x));
  };
  const acceptTransfer = (id) => {
    const at = Date.now();
    setRows(prev => (prev || []).map(x => {
      if (x.id !== id) return x;
      return {
        ...x,
        transferHistory: [...(x.transferHistory || []), { from: x.telecaller, to: currentTelecaller, at }],
        telecaller: currentTelecaller,
        transferTo: null, transferStatus: null, transferRequestedAt: null, lastRemarkAt: at,
        remarks: [...(x.remarks || []), { text: `Accepted transfer from ${x.telecaller}`, status: x.status, telecaller: currentTelecaller, at }],
      };
    }));
  };
  const declineTransfer = (id) => {
    const at = Date.now();
    setRows(prev => (prev || []).map(x => x.id === id ? {
      ...x, transferTo: null, transferStatus: null, transferRequestedAt: null, lastRemarkAt: at,
      remarks: [...(x.remarks || []), { text: `${currentTelecaller} declined the transfer`, status: x.status, telecaller: currentTelecaller, at }],
    } : x));
    closeDetail(); // it was never theirs — send them back to their own list
  };

  // A remark always carries the status at the time it was logged, and who
  // logged it (used to colour it) — this is what lets the report show "who
  // approached them, what happened, when" in one line. Reassigning who owns
  // a distributor no longer happens here: that only happens through Transfer
  // + Accept below, so a record never changes hands without the other
  // telecaller's key confirming they took it.
  const addRemark = (id) => {
    const cur = (rows || []).find(x => x.id === id);
    const statusChanged = !!cur && rmStatus !== cur.status;
    if (!rmNote.trim() && !statusChanged) {
      alert("Change the status or type a note before saving.");
      return;
    }
    const at = Date.now();
    const text = rmNote.trim() || `Status set to "${rmStatus}"`;
    const entry = { text, status: rmStatus, telecaller: currentTelecaller || cur.telecaller, at };
    setRows(prev => (prev || []).map(r => r.id === id ? {
      ...r, status: rmStatus, remarks: [...(r.remarks || []), entry], lastRemarkAt: at,
    } : r));
    setRmNote("");
  };

  const deleteDistributor = (r) => {
    if (!confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
    setRows(prev => (prev || []).filter(x => x.id !== r.id));
    closeDetail();
  };

  const bulkDeleteSelected = () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} selected distributor${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setRows(prev => (prev || []).filter(x => !selectedIds.has(x.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  // ── Clean up messy rows ──
  // Fixes distributors that were imported before the parser correctly split
  // freeform text (e.g. Contact showing "80935 73503 Just enquiry" and Name
  // echoing the same string) — re-splits the phone number out, moves any
  // leftover note into a proper timestamped remark, and clears the
  // "Unnamed · ..." placeholder once a real value is available. Safe to run
  // repeatedly: rows that are already clean are left untouched.
  const cleanupHubRow = (r) => {
    let changed = false;
    let name = r.name || "";
    let contact = r.contact || "";
    let foundRemark = "";

    // A Name field that's actually a stray remark (e.g. "remark : intrested
    // location kovilambakam", "give sample") — these slipped through an
    // earlier version of the bulk-import parser that didn't catch common
    // typos like "intrested". Re-run the same classifier now that it's
    // fixed, and move it into a proper remark instead.
    if (name && (REMARK_PREFIX.test(name) || HUB_REMARK_HINTS.test(name))) {
      const split = classifyNameOrRemark(name);
      if (split.remark) { foundRemark = split.remark; name = ""; changed = true; }
    }

    if (contact) {
      const { phone, remainder } = extractPhoneAndRemainder(contact);
      if (phone && (phone !== contact)) {
        contact = phone;
        changed = true;
        if (remainder) {
          const split = classifyNameOrRemark(remainder);
          if (split.name && (!name || /^unnamed/i.test(name))) name = split.name;
          if (split.remark && !foundRemark) foundRemark = split.remark;
        }
      }
    }

    if (/^unnamed/i.test(name)) {
      const stripped = name.replace(/^unnamed\s*[·:-]?\s*/i, "").trim();
      const { phone, remainder } = extractPhoneAndRemainder(stripped);
      if (phone && !contact) { contact = phone; changed = true; }
      if (remainder) {
        const split = classifyNameOrRemark(remainder);
        if (split.name) { name = split.name; changed = true; }
        if (split.remark && !foundRemark) foundRemark = split.remark;
      }
    }

    // Regenerate the "Unnamed · ..." placeholder if it's now stale (the
    // contact just changed) or was never set, so it always matches the
    // cleaned-up phone number rather than echoing the old messy text.
    if (!name || /^unnamed/i.test(name)) {
      const regenerated = contact ? ("Unnamed · " + contact) : "Unnamed Distributor";
      if (regenerated !== name) { name = regenerated; changed = true; }
    }

    let remarks = r.remarks || [];
    let status = r.status;
    if (foundRemark && !remarks.some(rm => rm.text === foundRemark)) {
      const newStatus = classifyHubRemark(foundRemark) || status || "New";
      remarks = [...remarks, { text: foundRemark, status: newStatus, telecaller: r.telecaller || "", at: Date.now() }];
      status = newStatus;
      changed = true;
    }

    // "Import" was a leftover internal placeholder from an earlier version
    // of bulk import — it's not a real telecaller and shouldn't appear
    // as one in a report. Blank it out wherever it was written, on the
    // record itself and on any individual remark.
    let telecaller = r.telecaller;
    if (telecaller === "Import") { telecaller = ""; changed = true; }
    if (remarks.some(rm => rm.telecaller === "Import")) {
      remarks = remarks.map(rm => rm.telecaller === "Import" ? { ...rm, telecaller: "" } : rm);
      changed = true;
    }

    if (!changed) return r;
    return { ...r, name, contact, telecaller, remarks, status, lastRemarkAt: remarks.length ? remarks[remarks.length - 1].at : r.lastRemarkAt };
  };

  const [cleaningUp, setCleaningUp] = useState(false);
  const cleanupAllRows = () => {
    if (!confirm("Scan every distributor and split any Name/Contact fields that still have a note stuck to the phone number (like \"80935 73503 Just enquiry\")? The leftover note becomes a proper remark instead. Rows already clean are left untouched.")) return;
    setCleaningUp(true);
    let fixedCount = 0;
    setRows(prev => (prev || []).map(r => {
      const cleaned = cleanupHubRow(r);
      if (cleaned !== r) fixedCount++;
      return cleaned;
    }));
    setTimeout(() => { setCleaningUp(false); alert(fixedCount ? `Fixed ${fixedCount} distributor${fixedCount === 1 ? "" : "s"}.` : "Nothing needed fixing — all rows already look clean."); }, 50);
  };

  // Collapses hubs that only differ by case or stray spacing — "UNKNOWN",
  // "unknown", and "Unknown" are the same hub, just typed differently each
  // time, and were fragmenting the By-Hub report into duplicate rows. This
  // is deliberately conservative: it only merges exact matches once
  // lowercased and trimmed, never genuinely different names (it won't
  // guess that "AMBATTUR" and "AMBATTUR DISTRIBUTOR" are the same place —
  // that needs a human decision, since merging wrongly would be worse than
  // leaving it split).
  const [normalizingHubs, setNormalizingHubs] = useState(false);
  const normalizeHubNames = () => {
    const groups = {};
    (rows || []).forEach(r => {
      const key = (r.hub || "").trim().toLowerCase();
      if (!key) return;
      groups[key] = groups[key] || [];
      groups[key].push(r.hub.trim());
    });
    // Pick the most common exact casing within each group as the canonical
    // spelling, so the merge doesn't arbitrarily impose Title Case on a hub
    // name the team already types consistently one way.
    const canonical = {};
    let mergeCount = 0;
    Object.entries(groups).forEach(([key, variants]) => {
      const counts = {};
      variants.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      const distinctVariants = Object.keys(counts);
      if (distinctVariants.length <= 1) return; // nothing to merge
      const best = distinctVariants.sort((a, b) => counts[b] - counts[a])[0];
      canonical[key] = best;
      mergeCount += distinctVariants.length - 1;
    });
    if (!mergeCount) { alert("No case-only duplicate hub names found — nothing to merge."); return; }
    const preview = Object.entries(canonical).map(([key, best]) => `${groups[key].filter((v, i, a) => a.indexOf(v) === i).join(" / ")}  →  "${best}"`).join("\n");
    if (!confirm(`Merge these hub name variants (keeping the most-used spelling)?\n\n${preview}\n\nThis only merges exact matches that differ by case/spacing — it won't touch genuinely different hub names.`)) return;
    setNormalizingHubs(true);
    setRows(prev => (prev || []).map(r => {
      const key = (r.hub || "").trim().toLowerCase();
      return canonical[key] ? { ...r, hub: canonical[key] } : r;
    }));
    setTimeout(() => setNormalizingHubs(false), 50);
  };

  // ── PDF: Team Overview + detailed Activity Log (status, remark, telecaller, date & time) ──
  const downloadHubReport = async () => {
    if (generatingReport) return;
    setGeneratingReport(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const NAVY = [8, 40, 25], TEAL = [23, 148, 74], AMBER = [180, 110, 5], INDIGO = [79, 70, 229];
      const GRID = [214, 220, 214], INK = [26, 32, 46], SUBTLE = [110, 118, 138];
      const POS = [34, 217, 138], NEG = [251, 113, 133], NEU = [251, 191, 36];
      const hexToRgb = (hex) => hex && hex.startsWith("#")
        ? [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
        : SUBTLE;
      const tint = (rgb, amt = 0.88) => rgb.map(c => Math.min(255, c + (255 - c) * amt));
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight(), margin = 32;
      const rangeLabel = reportFrom === reportTo ? formatDateReadable(reportFrom) : `${formatDateReadable(reportFrom)}  –  ${formatDateReadable(reportTo)}`;

      const header = (title, subtitle) => {
        const headerH = 74;
        doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, headerH, "F");
        doc.setFillColor(...TEAL); doc.rect(0, headerH - 2, pageW, 2, "F");
        const logoSize = 34, badgePad = 5, badgeSize = logoSize + badgePad * 2;
        const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 1;
        doc.setFillColor(255, 255, 255); doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 8, 8, "F");
        try { doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize); } catch (e) {}
        const textX = badgeX + badgeSize + 14;
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
        doc.text(title, textX, 30);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(200, 214, 205);
        doc.text(subtitle || `${reportPreset} · ${rangeLabel}${reportHub !== "All" ? " · " + reportHub + " Hub" : ""}`, textX, 46);
        doc.setFontSize(8);
        doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 30, { align: "right" });
        return headerH + 20;
      };
      // A small colored section rule with a title — used to visually break
      // the report into clearly labeled parts, the way a professional
      // report has running headers rather than one undifferentiated wall
      // of tables.
      const sectionTitle = (text, y, color = NAVY) => {
        doc.setFillColor(...color); doc.rect(margin, y - 9, 3, 12, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...color);
        doc.text(text, margin + 9, y);
        return y + 12;
      };
      const footer = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setDrawColor(...GRID); doc.line(margin, pageH - 26, pageW - margin, pageH - 26);
          doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SUBTLE);
          doc.text("Sridhi Ventures · Hub Distributor Report · Confidential — Internal Use", margin, pageH - 13);
          doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 13, { align: "right" });
        }
      };

      let all = rows || [];
      if (reportHub !== "All") all = all.filter(d => (d.hub || "") === reportHub);

      // Every remark, flattened, scoped to the date range + telecaller + hub.
      const entries = [];
      all.forEach(d => {
        (d.remarks || []).forEach(r => {
          const at = typeof r === "object" ? r.at : null;
          if (!at) return;
          const dateStr = localISO(at);
          if (dateStr < reportFrom || dateStr > reportTo) return;
          const tc = typeof r === "object" ? r.telecaller : null;
          if (reportTelecaller !== "All" && tc !== reportTelecaller) return;
          entries.push({
            at, dateStr, hub: d.hub || "—", distributor: d.name, areas: (d.areas || []).join(", ") || "—",
            by: tc || "—", status: r.status || d.status || "—", note: r.text || "—",
            sentiment: HUB_STATUS_SENTIMENT[r.status] || "neutral",
          });
        });
      });
      entries.sort((a, b) => a.at - b.at);

      const scheduled = all.filter(d => !!d.scheduledVisitAt);
      const dueSoon = scheduled
        .map(d => ({ d, urgency: hubVisitUrgency(d.scheduledVisitAt) }))
        .filter(x => x.urgency === "overdue" || x.urgency === "today" || x.urgency === "tomorrow")
        .sort((a, b) => a.d.scheduledVisitAt.localeCompare(b.d.scheduledVisitAt));

      // ── Page 1: Team overview ──
      let y = header("Hub Distributors — Team Overview");
      const totalDistributors = all.length;
      const totalHubs = new Set(all.map(d => (d.hub || "").trim()).filter(Boolean)).size;
      const stageBreakdown = HUB_STAGES.map(s => ({ ...s, count: all.filter(d => d.status === s.id).length }));
      const dealsAccepted = all.filter(d => d.status === "Deal Accepted").length;
      const chips = [
        [`${totalDistributors} Distributors`, TEAL, [229, 248, 238]],
        [`${totalHubs} Hubs`, NAVY, [222, 230, 226]],
        [`${entries.length} Remarks Logged`, INDIGO, [235, 234, 253]],
        [`${dealsAccepted} Deals Accepted`, AMBER, [254, 246, 224]],
        [`${scheduled.length} Visits Scheduled`, [23, 130, 195], [219, 240, 252]],
      ];
      let cx = margin, cyRow = y;
      chips.forEach(([label, color, tintC]) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        const w = doc.getTextWidth(label) + 20;
        if (cx + w > pageW - margin) { cx = margin; cyRow += 28; }
        doc.setFillColor(...tintC); doc.setDrawColor(...color);
        doc.roundedRect(cx, cyRow, w, 23, 11.5, 11.5, "FD");
        doc.setTextColor(...color); doc.text(label, cx + 10, cyRow + 15.5);
        cx += w + 7;
      });
      y = cyRow + 40;

      y = sectionTitle("PIPELINE STATUS", y); y += 4;
      // Two rows of 5 — the fixed 10-stage pipeline doesn't fit legibly on one row.
      const perRow = 5, boxGap = 6;
      const sbw = (pageW - margin * 2 - (perRow - 1) * boxGap) / perRow;
      const shortStageLabel = { "Demanding Something Different": "DEMANDING DIFF.", "Ring No Response": "RING/NO RESP." };
      stageBreakdown.forEach((s, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const bx = margin + col * (sbw + boxGap), by2 = y + row * 46;
        const rgb = hexToRgb(s.color);
        doc.setFillColor(...tint(rgb)); doc.setDrawColor(...rgb);
        doc.roundedRect(bx, by2, sbw, 42, 6, 6, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...rgb);
        doc.text(String(s.count), bx + 6, by2 + 18);
        doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); doc.setTextColor(...SUBTLE);
        doc.text((shortStageLabel[s.id] || s.id).toUpperCase(), bx + 6, by2 + 30, { maxWidth: sbw - 8 });
      });
      y += 46 * 2 + 10;

      const posCount = entries.filter(e => e.sentiment === "positive").length;
      const negCount = entries.filter(e => e.sentiment === "negative").length;
      const neuCount = entries.filter(e => e.sentiment === "neutral").length;
      const totalResp = posCount + negCount + neuCount;
      y = sectionTitle("RESPONSE ANALYSIS — REMARKS IN RANGE", y); y += 4;
      const statBoxes = [["Positive", posCount, POS], ["Negative", negCount, NEG], ["Neutral", neuCount, NEU]];
      const boxW = (pageW - margin * 2 - 16) / 3;
      statBoxes.forEach(([label, count, color], i) => {
        const bx = margin + i * (boxW + 8);
        doc.setFillColor(...tint(color)); doc.setDrawColor(...color);
        doc.roundedRect(bx, y, boxW, 42, 8, 8, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...color);
        doc.text(String(count), bx + 12, y + 26);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
        const pct = totalResp ? Math.round((count / totalResp) * 100) : 0;
        doc.text(`${label.toUpperCase()} · ${pct}%`, bx + 12, y + 36);
      });
      y += 54;
      if (totalResp) {
        const barX = margin, barY = y, barW = pageW - margin * 2, barH = 11;
        let bx2 = barX;
        [[posCount, POS], [neuCount, NEU], [negCount, NEG]].forEach(([count, color]) => {
          if (!count) return;
          const w = (count / totalResp) * barW;
          doc.setFillColor(...color); doc.rect(bx2, barY, w, barH, "F");
          bx2 += w;
        });
        doc.setDrawColor(...GRID); doc.roundedRect(barX, barY, barW, barH, 3, 3, "S");
        y += barH + 18;
      } else y += 6;

      y = sectionTitle("BY TELECALLER", y);
      const tcRows = TELECALLERS.map(t => {
        const tEntries = entries.filter(e => e.by === t);
        const deals = tEntries.filter(e => e.status === "Deal Accepted").length;
        const notInt = tEntries.filter(e => e.status === "Not Interested").length;
        const visitsFor = all.filter(d => d.telecaller === t && d.scheduledVisitAt).length;
        return [t, all.filter(d => d.telecaller === t).length, tEntries.length, deals, notInt, visitsFor];
      }).filter(row => row[1] > 0 || row[2] > 0);
      autoTable(doc, {
        startY: y + 6, margin: { top: 94, bottom: 40 },
        head: [["Telecaller", "Assigned", "Remarks", "Deals", "Not Int.", "Visits Set"]],
        body: tcRows.length ? tcRows : [["—", "—", "—", "—", "—", "—"]], theme: "grid",
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        alternateRowStyles: { fillColor: [248, 250, 248] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
      });
      y = doc.lastAutoTable.finalY + 20;

      // Keep the Hub breakdown on page 1 if it fits, otherwise let it flow —
      // autoTable handles the page break, and re-draws the header itself.
      y = sectionTitle("BY HUB", y);
      const hubRows = Array.from(new Set(all.map(d => (d.hub || "Unassigned").trim() || "Unassigned"))).sort().map(h => {
        const hubDs = all.filter(d => (d.hub || "Unassigned").trim() === h);
        return [
          h, hubDs.length,
          hubDs.filter(d => d.status === "Deal Accepted").length,
          hubDs.filter(d => d.status === "Not Interested").length,
          hubDs.filter(d => !!d.scheduledVisitAt).length,
        ];
      });
      autoTable(doc, {
        startY: y + 6, margin: { top: 94, bottom: 40 },
        head: [["Hub", "Distributors", "Deals Accepted", "Not Interested", "Visits Scheduled"]],
        body: hubRows.length ? hubRows : [["—", "—", "—", "—", "—"]], theme: "grid",
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        alternateRowStyles: { fillColor: [248, 250, 248] },
        columnStyles: { 0: { fontStyle: "bold" } },
        didDrawPage: () => header("Hub Distributors — Team Overview"),
      });

      // ── Page: Upcoming & Overdue Visits — the headline feature, so it
      // gets its own clearly-flagged section rather than being buried in a
      // column of the activity log. ──
      doc.addPage();
      let vy = header("Hub Distributors — Scheduled Visits", `${scheduled.length} total scheduled · ${dueSoon.length} due within the next day (or overdue)`);
      if (!scheduled.length) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...SUBTLE);
        doc.text("No visits currently scheduled.", margin, vy + 10);
      } else {
        const overdueN = scheduled.filter(d => hubVisitUrgency(d.scheduledVisitAt) === "overdue").length;
        const todayN = scheduled.filter(d => hubVisitUrgency(d.scheduledVisitAt) === "today").length;
        const tomorrowN = scheduled.filter(d => hubVisitUrgency(d.scheduledVisitAt) === "tomorrow").length;
        const upcomingN = scheduled.length - overdueN - todayN - tomorrowN;
        const visitChips = [
          [`${overdueN} Overdue`, [252, 165, 165]], [`${todayN} Today`, [251, 113, 133]],
          [`${tomorrowN} Tomorrow`, AMBER], [`${upcomingN} Upcoming`, [23, 130, 195]],
        ];
        let vcx = margin;
        visitChips.forEach(([label, color]) => {
          doc.setFont("helvetica", "bold"); doc.setFontSize(9);
          const w = doc.getTextWidth(label) + 20;
          doc.setFillColor(...tint(color)); doc.setDrawColor(...color);
          doc.roundedRect(vcx, vy, w, 23, 11.5, 11.5, "FD");
          doc.setTextColor(...color); doc.text(label, vcx + 10, vy + 15.5);
          vcx += w + 7;
        });
        vy += 38;

        const sortedScheduled = [...scheduled].sort((a, b) => a.scheduledVisitAt.localeCompare(b.scheduledVisitAt));
        autoTable(doc, {
          startY: vy, margin: { top: 94, bottom: 40 },
          head: [["Visit Date", "", "Distributor", "Hub", "Contact", "Telecaller", "Note"]],
          body: sortedScheduled.map(d => {
            const u = hubVisitUrgency(d.scheduledVisitAt);
            const us = hubVisitUrgencyStyle(u);
            return [formatVisitDate(d.scheduledVisitAt), us.label, d.name, d.hub || "—", d.contact || "—", d.telecaller || "—", d.scheduledVisitNote || "—"];
          }),
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "top" },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 62 }, 1: { cellWidth: 58 }, 2: { fontStyle: "bold" }, 6: { cellWidth: 110 } },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 1) {
              const map = { OVERDUE: [252, 165, 165], TODAY: [251, 113, 133], TOMORROW: AMBER, UPCOMING: [23, 130, 195] };
              const rgb = map[data.cell.raw] || SUBTLE;
              data.cell.styles.textColor = rgb;
              data.cell.styles.fillColor = tint(rgb, 0.9);
              data.cell.styles.fontStyle = "bold";
            }
          },
          didDrawPage: () => header("Hub Distributors — Scheduled Visits"),
        });
      }

      // ── Page: Full Distributor Directory — every distributor with its
      // complete profile, independent of the date range, so management
      // gets the whole roster in one place rather than only what moved
      // during the selected window. ──
      doc.addPage();
      let dy = header("Hub Distributors — Full Directory", `${all.length} distributor${all.length === 1 ? "" : "s"}${reportHub !== "All" ? " · " + reportHub + " Hub" : " · all hubs"}`);
      const directorySorted = [...all].sort((a, b) => (a.hub || "").localeCompare(b.hub || "") || (a.name || "").localeCompare(b.name || ""));
      autoTable(doc, {
        startY: dy, margin: { top: 94, bottom: 40 },
        head: [["Hub", "Distributor", "Contact", "Areas", "Status", "Telecaller", "Visit", "Address"]],
        body: directorySorted.map(d => [
          d.hub || "—", d.name || "—", d.contact || "—", (d.areas || []).join(", ") || "—",
          d.status || "—", d.telecaller || "—",
          d.scheduledVisitAt ? formatVisitDate(d.scheduledVisitAt) : "—",
          d.address || "—",
        ]),
        theme: "grid",
        styles: { font: "helvetica", fontSize: 7.8, cellPadding: 5, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "top" },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        alternateRowStyles: { fillColor: [248, 250, 248] },
        columnStyles: { 1: { fontStyle: "bold" }, 7: { cellWidth: 100 } },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 4) {
            const rgb = hexToRgb(hubStageColor(data.cell.raw));
            data.cell.styles.textColor = rgb;
            data.cell.styles.fillColor = tint(rgb, 0.9);
            data.cell.styles.fontStyle = "bold";
          }
        },
        didDrawPage: () => header("Hub Distributors — Full Directory"),
      });

      // ── Page: detailed activity log — every remark in the selected range ──
      doc.addPage();
      let yy = header("Hub Distributors — Activity Log");
      if (!entries.length) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...SUBTLE);
        doc.text("No remarks logged in this date range.", margin, yy + 10);
      } else {
        autoTable(doc, {
          startY: yy,
          margin: { top: 94, bottom: 40 },
          head: [["Date & Time", "Hub", "Distributor", "Areas", "Telecaller", "Status", "Remark"]],
          body: entries.map(e => [
            new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
            e.hub, e.distributor, e.areas, e.by, e.status, e.note,
          ]),
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: 5, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "top" },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: [248, 250, 248] },
          columnStyles: { 2: { fontStyle: "bold" }, 6: { cellWidth: 130 } },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 5) {
              const rgb = hexToRgb(hubStageColor(data.cell.raw));
              data.cell.styles.textColor = rgb;
              data.cell.styles.fillColor = tint(rgb, 0.9);
              data.cell.styles.fontStyle = "bold";
            }
          },
          didDrawPage: () => header("Hub Distributors — Activity Log"),
        });
      }

      footer();
      doc.save(`Hub-Distributor-Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setGeneratingReport(false);
    }
  };

  // ── Excel: one row per distributor, full remark history included ──
  const downloadHubExcel = () => {
    if (generatingExcel) return;
    setGeneratingExcel(true);
    try {
      let all = rows || [];
      if (reportHub !== "All") all = all.filter(d => (d.hub || "") === reportHub);
      const excelRows = all.map(d => {
        const remarks = d.remarks || [];
        const latest = remarks.length ? remarks[remarks.length - 1] : null;
        return {
          "Hub": d.hub || "",
          "Distributor Name": d.name || "",
          "Contact": d.contact || "",
          "Area 1": (d.areas || [])[0] || "", "Area 2": (d.areas || [])[1] || "", "Area 3": (d.areas || [])[2] || "",
          "Area 4": (d.areas || [])[3] || "", "Area 5": (d.areas || [])[4] || "",
          "Address": d.address || "",
          "Map Location": d.mapLink || "",
          "Business Details": d.details || "",
          "Status": d.status || "",
          "Approached By (Telecaller)": d.telecaller || "",
          "Scheduled Visit Date": d.scheduledVisitAt || "",
          "Scheduled Visit Note": d.scheduledVisitNote || "",
          "Latest Remark": latest ? latest.text : "",
          "Latest Remark Date & Time": latest && latest.at ? new Date(latest.at).toLocaleString("en-IN") : "",
          "Full Remark History": remarks.map(r => `[${new Date(r.at).toLocaleString("en-IN")} · ${r.telecaller} · ${r.status}] ${r.text}`).join(" | "),
          "Added On": d.createdAt ? new Date(d.createdAt).toLocaleString("en-IN") : "",
        };
      });
      const ws = XLSX.utils.json_to_sheet(excelRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Hub Distributors");
      XLSX.writeFile(wb, `Hub-Distributor-Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setGeneratingExcel(false);
    }
  };

  // ── Rebalance existing data ─────────────────────────────────────────────
  // Two things must both be true when this is done:
  //  1) Every INCLUDED telecaller ends up with the same total count (fully
  //     equal split), and
  //  2) Nobody's previous positive remark (Interested / Visited / Deal
  //     Accepted) ever moves away from them — those relationships are
  //     never touched.
  // A telecaller can be excluded entirely (the tick-list below) — e.g.
  // Ramya isn't available right now, so she's pulled out of the split:
  // everything currently in her name (positive or not) goes back into the
  // shared pool and gets handed out among whoever's still ticked, so she
  // ends up with nothing and nobody's data sits idle under her name.
  // Those two only work together if the *new* (non-positive) leads are
  // handed out unevenly on purpose among the included telecallers: someone
  // who already holds a lot of positive leads gets fewer new ones, someone
  // who holds few gets more — so everyone's final total lands on the same
  // number (or as close as the numbers allow). A manual mode is also
  // available to type in exact counts per telecaller instead.
  const isProtectedHubRecord = (r) => {
    if (HUB_STATUS_SENTIMENT[r.status] === "positive") return true;
    return (r.remarks || []).some(rm => HUB_STATUS_SENTIMENT[rm.status] === "positive");
  };
  const computeRebalancePlan = (activeTc) => {
    const positiveByTc = {}; activeTc.forEach(t => { positiveByTc[t] = 0; });
    const eligible = [];
    (rows || []).forEach(r => {
      // A record currently owned by someone NOT in this rebalance (unticked,
      // e.g. Ramya while unavailable) always goes into the shared pool to be
      // handed out to the included telecallers — even if it was positive,
      // since it isn't being "protected" for someone who isn't part of this
      // split. Only an INCLUDED telecaller's own positive leads are kept.
      if (activeTc.includes(r.telecaller) && isProtectedHubRecord(r)) {
        positiveByTc[r.telecaller] += 1;
      } else {
        eligible.push(r);
      }
    });
    const totalConsidered = activeTc.reduce((s, t) => s + positiveByTc[t], 0) + eligible.length;
    const idealTotal = totalConsidered / (activeTc.length || 1);
    // Already holding at least a fair share of positives? Keep exactly what
    // they have and give them none of the new pool.
    const overflow = activeTc.filter(t => positiveByTc[t] >= idealTotal);
    const underGroup = activeTc.filter(t => !overflow.includes(t));

    const need = {}; activeTc.forEach(t => { need[t] = 0; });
    if (underGroup.length) {
      const positivesInUnder = underGroup.reduce((s, t) => s + positiveByTc[t], 0);
      const fairFinal = (eligible.length + positivesInUnder) / underGroup.length;
      const base = Math.floor(fairFinal);
      let distributed = 0;
      underGroup.forEach(t => {
        const give = Math.max(0, base - positiveByTc[t]);
        need[t] = give;
        distributed += give;
      });
      let leftover = eligible.length - distributed;
      let i = 0;
      while (leftover > 0) { need[underGroup[i % underGroup.length]] += 1; leftover--; i++; }
    }
    const afterCounts = {}; activeTc.forEach(t => { afterCounts[t] = positiveByTc[t] + need[t]; });
    return { activeTc, positiveByTc, eligible, need, afterCounts, overflow };
  };
  const openRebalance = () => {
    const activeTc = TELECALLERS.filter(t => rebalanceIncluded[t]);
    if (!activeTc.length) { alert("Tick at least one telecaller to rebalance."); return; }
    const plan = computeRebalancePlan(activeTc);
    setRebalancePreview(plan);
    setManualNeeds(plan.need);
    setShowRebalance(true);
  };
  const toggleRebalanceIncluded = (t) => {
    setRebalanceIncluded(prev => {
      const next = { ...prev, [t]: !prev[t] };
      const activeTc = TELECALLERS.filter(x => next[x]);
      if (activeTc.length) {
        const plan = computeRebalancePlan(activeTc);
        setRebalancePreview(plan);
        setManualNeeds(plan.need);
      }
      return next;
    });
  };
  const manualTotal = Object.values(manualNeeds).reduce((s, v) => s + (Number(v) || 0), 0);
  const commitRebalance = () => {
    if (!rebalancePreview || !rebalancePreview.eligible.length) return;
    const need = rebalanceManual ? manualNeeds : rebalancePreview.need;
    if (rebalanceManual && manualTotal > rebalancePreview.eligible.length) {
      alert(`Those counts add up to ${manualTotal}, but there are only ${rebalancePreview.eligible.length} new leads to give out. Reduce one or more counts.`);
      return;
    }
    const { eligible } = rebalancePreview;
    const at = Date.now();
    const queue = [];
    rebalancePreview.activeTc.forEach(t => { for (let i = 0; i < (Number(need[t]) || 0); i++) queue.push(t); });
    const shuffled = [...eligible].sort(() => Math.random() - 0.5); // mix hubs across telecallers rather than assigning in list order
    const idToNewOwner = new Map();
    shuffled.forEach((r, i) => { if (queue[i]) idToNewOwner.set(r.id, queue[i]); });
    let moved = 0;
    setRows(prev => (prev || []).map(r => {
      const newOwner = idToNewOwner.get(r.id);
      if (!newOwner || newOwner === r.telecaller) return r;
      moved++;
      return {
        ...r,
        telecaller: newOwner,
        transferHistory: [...(r.transferHistory || []), { from: r.telecaller, to: newOwner, at }],
        lastRemarkAt: at,
        remarks: [...(r.remarks || []), { text: `Rebalanced — equal split (previously ${r.telecaller})`, status: r.status, telecaller: newOwner, at }],
      };
    }));
    setShowRebalance(false); setRebalancePreview(null); setRebalanceManual(false);
    alert(`Rebalanced ${moved} distributor${moved === 1 ? "" : "s"} among ${rebalancePreview.activeTc.join(", ")}. Anyone unticked now has none of this data — it was pulled back into the pool and handed out to the rest.`);
  };

  // ── Printable telecaller call sheet ─────────────────────────────────────
  // A working paper for one telecaller (or one page per telecaller, for
  // everyone) — their currently assigned distributors, with the current
  // status for context, and genuinely blank ruled boxes to write in by hand
  // after each call: one box per day for a short range, one per week for a
  // longer one, so the same sheet covers a day, a week, or a month.
  const downloadCallSheet = async () => {
    if (generatingCallSheet) return;
    setGeneratingCallSheet(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const NAVY = [8, 40, 25], TEAL = [23, 148, 74], GRID = [214, 220, 214], INK = [26, 32, 46], SUBTLE = [110, 118, 138];
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight(), margin = 26;

      const from = new Date(reportFrom + "T00:00:00"), to = new Date(reportTo + "T00:00:00");
      const spanDays = Math.max(1, Math.round((to - from) / 86400000) + 1);
      let blankCols = [];
      if (spanDays <= 1) {
        blankCols = [formatDateReadable(reportFrom)];
      } else if (spanDays <= 7) {
        for (let i = 0; i < spanDays; i++) {
          const d = new Date(from); d.setDate(from.getDate() + i);
          blankCols.push(d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }));
        }
      } else {
        const weeks = Math.ceil(spanDays / 7);
        for (let i = 0; i < weeks; i++) blankCols.push(`Week ${i + 1}`);
      }

      const telecallersToPrint = reportTelecaller === "All" ? TELECALLERS : [reportTelecaller];
      const rangeLabel2 = reportFrom === reportTo ? formatDateReadable(reportFrom) : `${formatDateReadable(reportFrom)} – ${formatDateReadable(reportTo)}`;

      // A telecaller calling from this sheet needs two kinds of history at a
      // glance: the best thing ever said about this lead (so they know it's
      // worth the call) and the most recent thing said (so they don't repeat
      // a dead conversation) — then a genuinely blank box to add today's.
      const lastPositiveFor = (r) => {
        const list = r.remarks || [];
        for (let i = list.length - 1; i >= 0; i--) {
          if (HUB_STATUS_SENTIMENT[list[i].status] === "positive") {
            const p = list[i];
            return `${p.status}${p.text ? " — " + p.text : ""}`;
          }
        }
        return "—";
      };
      const lastRemarkFor = (r) => {
        const list = r.remarks || [];
        if (!list.length) return "No remarks yet";
        const last = list[list.length - 1];
        return `${last.status}${last.text ? " — " + last.text : ""}`;
      };

      telecallersToPrint.forEach((tc, tcIdx) => {
        if (tcIdx > 0) doc.addPage();
        const list = (rows || []).filter(r => r.telecaller === tc && r.status !== "Wrong Number");

        doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, 58, "F");
        doc.setFillColor(...TEAL); doc.rect(0, 56, pageW, 2, "F");
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
        doc.text(`${tc} — Call Sheet`, margin, 26);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(210, 220, 214);
        doc.text(`${rangeLabel2}  ·  ${list.length} distributor${list.length === 1 ? "" : "s"} to call`, margin, 42);

        const head = [["#", "Distributor", "Hub", "Contact", "Positive Remark", "Last Remark", "Status", ...blankCols]];
        const body = list.map((r, i) => [
          String(i + 1), r.name || "Unnamed", r.hub || "—", r.contact || "—",
          lastPositiveFor(r), lastRemarkFor(r), r.status || "—",
          ...blankCols.map(() => ""),
        ]);
        const blankStartIdx = 7;
        autoTable(doc, {
          startY: 74, margin: { top: 74, bottom: 30 },
          head, body: body.length ? body : [["—", "No distributors assigned to " + tc, "—", "—", "—", "—", "—", ...blankCols.map(() => "")]],
          theme: "grid",
          styles: { font: "helvetica", fontSize: 7.5, cellPadding: 5, lineColor: GRID, lineWidth: 0.6, textColor: INK, minCellHeight: 26, overflow: "linebreak" },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 16 }, 1: { cellWidth: 82, fontStyle: "bold" }, 2: { cellWidth: 52 }, 3: { cellWidth: 58 },
            4: { cellWidth: 92 }, 5: { cellWidth: 92 }, 6: { cellWidth: 46 },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index >= blankStartIdx) data.cell.styles.minCellHeight = 34;
            if (data.section === "body" && data.column.index === 4 && data.cell.raw !== "—") {
              data.cell.styles.textColor = [15, 118, 71]; data.cell.styles.fontStyle = "bold";
            }
          },
        });

        const fy = pageH - 16;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SUBTLE);
        doc.text("Sridhi Ventures · Telecaller Call Sheet · write the outcome of each call directly in the boxes above", margin, fy);
        doc.text(`Page ${tcIdx + 1} of ${telecallersToPrint.length}`, pageW - margin, fy, { align: "right" });
      });

      const fileTag = reportTelecaller === "All" ? "AllTelecallers" : reportTelecaller.replace(/[^A-Za-z0-9]/g, "");
      doc.save(`CallSheet_${fileTag}_${reportFrom}_to_${reportTo}.pdf`);
    } catch (e) {
      alert("Couldn't generate the call sheet: " + (e?.message || e));
    } finally {
      setGeneratingCallSheet(false);
    }
  };

  // ── Detail view ──
  if (selected) {
    const r = selected;
    const iAmOwner = currentTelecaller && currentTelecaller === r.telecaller;
    const incomingForMe = currentTelecaller && r.transferStatus === "pending" && r.transferTo === currentTelecaller;
    // Safety net: if the record changed hands (or the key session was lost)
    // while this was open, don't silently keep showing someone else's data.
    if (!iAmOwner && !incomingForMe) {
      return (
        <div>
          <button onClick={closeDetail} style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12, fontFamily: FONT }}>← Back to list</button>
          <Card><div style={{ fontSize: 12.5, color: T.t2 }}>This no longer belongs to your key — it's now assigned to <b style={{ color: T.t1 }}>{r.telecaller || "someone else"}</b>. Go back and re-enter a key to open it again.</div></Card>
        </div>
      );
    }
    return (
      <div>
        <button onClick={closeDetail} style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12, fontFamily: FONT }}>← Back to list</button>

        {incomingForMe && (
          <Card style={{ marginBottom: 14, background: T.amber + "14", border: `1.5px solid ${T.amber}66` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.amber, marginBottom: 4 }}>🔁 Transfer Request</div>
            <div style={{ fontSize: 12, color: T.t2, marginBottom: 10 }}><b style={{ color: telecallerColor(r.telecaller) }}>{r.telecaller}</b> wants to hand this distributor to you. Accept it to make it yours — until then you can't log remarks on it.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn label="✅ Accept" small onClick={() => acceptTransfer(r.id)} />
              <Btn label="Decline" small ghost color={T.rose} onClick={() => declineTransfer(r.id)} />
            </div>
          </Card>
        )}

        <Card accent={hubStageColor(r.status)} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: (r.remarks || []).length === 0 ? "#F472B6" : T.t1 }}>{r.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: T.t3 }}>{r.hub ? "🏢 " + r.hub + " Hub" : "No hub set"} {r.contact ? "· " + r.contact : ""}</span>
                {r.telecaller && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, color: telecallerColor(r.telecaller), background: telecallerColor(r.telecaller) + "1E",
                    border: `1px solid ${telecallerColor(r.telecaller)}55`, borderRadius: 20, padding: "1px 8px",
                  }}>{r.telecaller}</span>
                )}
                {r.transferStatus === "pending" && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: T.amber, background: T.amber + "1E", border: `1px solid ${T.amber}55`, borderRadius: 20, padding: "1px 8px" }}>🔁 Pending → {r.transferTo}</span>
                )}
              </div>
              {(r.transferHistory || []).length > 0 && (
                <div style={{ fontSize: 10.5, color: T.t3, marginTop: 6 }}>
                  🔁 {r.transferHistory.map((t, i) => `${t.from} → ${t.to}`).join("  ·  ")}
                </div>
              )}
              {(r.remarks || []).length === 0 && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8,
                  background: "#F472B622", border: "1px solid #F472B688", borderRadius: 20,
                  padding: "3px 10px", fontSize: 10.5, fontWeight: 800, color: "#F472B6",
                }}>🆕 Not Called Yet — Please Call &amp; Update</div>
              )}
            </div>
            <Chip label={r.status} color={hubStageColor(r.status)} />
          </div>
          {r.address && <div style={{ fontSize: 12, color: T.t2, marginTop: 8 }}>{r.address}</div>}
          {(r.areas || []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {r.areas.map((a, i) => <Chip key={i} small label={a} color={T.sky} />)}
            </div>
          )}
          {r.details && <div style={{ fontSize: 12, color: T.t2, marginTop: 8 }}>{r.details}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {r.contact && <button onClick={() => window.open("tel:" + r.contact)} style={{ flex: "1 1 100px", background: T.emerald + "22", border: `1px solid ${T.emerald}44`, borderRadius: 10, color: T.emerald, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📞 Call</button>}
            {r.mapLink && <button onClick={() => window.open(r.mapLink, "_blank")} style={{ flex: "1 1 100px", background: T.sky + "22", border: `1px solid ${T.sky}44`, borderRadius: 10, color: T.sky, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>📍 Open Map</button>}
            {iAmOwner && r.transferStatus !== "pending" && (
              <button onClick={() => { setTransferTarget(""); setTransferOpen(true); }} style={{ flex: "1 1 100px", background: T.amber + "22", border: `1px solid ${T.amber}44`, borderRadius: 10, color: T.amber, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>🔁 Transfer</button>
            )}
            {iAmOwner && r.transferStatus === "pending" && (
              <button onClick={() => cancelTransfer(r.id)} style={{ flex: "1 1 100px", background: T.t3 + "22", border: `1px solid ${T.t3}44`, borderRadius: 10, color: T.t2, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Cancel Transfer</button>
            )}
            <button onClick={() => deleteDistributor(r)} style={{ flex: "1 1 100px", background: T.rose + "18", border: `1px solid ${T.rose}44`, borderRadius: 10, color: T.rose, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>🗑️ Delete</button>
          </div>

        </Card>

        {(() => {
          const urgency = hubVisitUrgency(r.scheduledVisitAt);
          const us = urgency ? hubVisitUrgencyStyle(urgency) : null;
          return (
            <Card style={{
              marginBottom: 14,
              ...(us ? { background: us.color + "14", border: `1.5px solid ${us.color}66`, animation: (urgency === "today" || urgency === "overdue") ? "visitGlow 1.8s ease-in-out infinite" : "none" } : {}),
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <Label sub="Set once, updated anytime — this is what powers your reminder">📅 Scheduled Visit</Label>
                {us && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: us.color, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>{us.emoji} {us.label}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <CalendarDatePicker value={visitDateEdit} onChange={setVisitDateEdit} />
              </div>
              <Field value={visitNoteEdit} onChange={e => setVisitNoteEdit(e.target.value)} placeholder="What's the visit for? (optional)" />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Btn label="Save Visit Date" small onClick={() => saveScheduledVisit(r.id)} />
                {r.scheduledVisitAt && <Btn label="Clear" small ghost color={T.rose} onClick={() => clearScheduledVisit(r.id)} />}
              </div>
            </Card>
          );
        })()}

        <Card style={{ marginBottom: 14 }}>
          <Label sub="Basic details — hub, location and the areas this distributor covers (up to 5)">Distributor Details</Label>
          <Field label="Hub *" value={detailEdit.hub} onChange={e => setDetailEdit({ ...detailEdit, hub: e.target.value })} placeholder="e.g. Ambattur Hub" />
          <Field label="Name *" value={detailEdit.name} onChange={e => setDetailEdit({ ...detailEdit, name: e.target.value })} />
          <Field label="Contact" value={detailEdit.contact} onChange={e => setDetailEdit({ ...detailEdit, contact: e.target.value })} type="tel" />
          <Field label="Address / Location" value={detailEdit.address} onChange={e => setDetailEdit({ ...detailEdit, address: e.target.value })} />
          <Field label="Google Maps Link" value={detailEdit.mapLink} onChange={e => setDetailEdit({ ...detailEdit, mapLink: e.target.value })} placeholder="Paste Google Maps link here" />
          <Field label="Basic Details (business type, capacity, etc.)" value={detailEdit.details} onChange={e => setDetailEdit({ ...detailEdit, details: e.target.value })} placeholder="Optional" />
          <div style={{ fontSize: 11, color: T.t2, marginTop: 4, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Areas Distributed (up to 5)</div>
          {[1, 2, 3, 4, 5].map(n => (
            <Field key={n} value={detailEdit[`area${n}`]} onChange={e => setDetailEdit({ ...detailEdit, [`area${n}`]: e.target.value })} placeholder={`Area ${n}`} />
          ))}
          <Btn label="Save Details" small onClick={() => saveDetailEdit(r.id)} />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Label sub={`${(r.remarks || []).length} remark${(r.remarks || []).length === 1 ? "" : "s"} logged`}>Remarks & Status</Label>
          {(r.remarks || []).length === 0 && <div style={{ fontSize: 12, color: T.t3, marginBottom: 10 }}>No remarks logged yet.</div>}
          {(r.remarks || []).slice().reverse().map((rm, i) => {
            const rmColor = telecallerColor(rm.telecaller);
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 8px 8px 10px", marginBottom: 4, borderLeft: `3px solid ${rmColor}`, background: rmColor + "0F", borderRadius: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0, background: hubStageColor(rm.status) }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: T.t2 }}><b style={{ color: T.t1 }}>{rm.status}</b>{rm.text ? " — " + rm.text : ""}</div>
                  <div style={{ fontSize: 10, color: rmColor, marginTop: 1, fontWeight: 800 }}>{rm.telecaller} · {new Date(rm.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            );
          })}
          {incomingForMe ? (
            <div style={{ fontSize: 12, color: T.t3, marginTop: 10, fontStyle: "italic" }}>Accept the transfer above before logging a remark on this one.</div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: T.t2, marginTop: 10, marginBottom: 2 }}>Logging as <b style={{ color: telecallerColor(currentTelecaller) }}>{currentTelecaller}</b> · to hand this to someone else, use 🔁 Transfer above</div>
              <div style={{ fontSize: 11, color: T.t2, marginTop: 8, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Status</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {HUB_STAGES.map(s => {
                  const active = rmStatus === s.id;
                  return (
                    <button key={s.id} onClick={() => setRmStatus(s.id)} style={{
                      background: active ? s.color + "22" : T.surface, border: `1px solid ${active ? s.color : T.border}`,
                      borderRadius: 20, padding: "6px 12px", fontSize: 11, fontWeight: 700,
                      color: active ? s.color : T.t2, cursor: "pointer", fontFamily: FONT,
                    }}>{s.id}</button>
                  );
                })}
              </div>
              <textarea value={rmNote} onChange={e => setRmNote(e.target.value)} rows={2}
                placeholder="What happened on the call / visit… (optional — you can also just change the status above and save)"
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 13, fontFamily: FONT, outline: "none", width: "100%", boxSizing: "border-box", resize: "none" }} />
              <div style={{ marginTop: 8 }}>
                <Btn label="Save" full onClick={() => addRemark(r.id)} disabled={!rmNote.trim() && rmStatus === r.status} />
              </div>
            </>
          )}
        </Card>

        <Sheet open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer This Distributor">
          <div style={{ fontSize: 12, color: T.t3, marginBottom: 12 }}>They'll need to open it with their own key and accept before it becomes theirs — it stays yours until then.</div>
          <Dropdown label="Transfer to" value={transferTarget} onChange={e => setTransferTarget(e.target.value)} options={TELECALLERS.filter(t => t !== r.telecaller)} />
          <div style={{ marginTop: 12 }}>
            <Btn label="Send Transfer Request" full onClick={() => sendTransfer(r.id)} disabled={!transferTarget} />
          </div>
        </Sheet>
      </div>

    );
  }

  // ── List view ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card accent={T.emerald}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SyncBadge status={syncStatus} onRetry={retrySync} error={syncError} />
        </div>
        <Label sub={`${(rows || []).length} distributor${(rows || []).length === 1 ? "" : "s"} across ${Math.max(hubOptions.length - 1, 0)} hub${hubOptions.length - 1 === 1 ? "" : "s"}${(() => { const n = (rows || []).filter(r => (r.remarks || []).length === 0).length; return n ? ` · 🆕 ${n} not called yet` : ""; })()}`}>🏢 Hub Distributors</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn label="+ Add Distributor" onClick={() => setShowAdd(true)} />
          <Btn label="📥 Bulk Import" ghost onClick={() => { setShowImport(true); setImportPreview(null); }} />
          <Btn label="🔀 Split & Assign" color={T.indigo} onClick={() => { setShowSplit(true); setSplitPreview(null); }} />
          <Btn label={cleaningUp ? "Cleaning…" : "🧹 Clean Up Data"} ghost small disabled={cleaningUp} onClick={cleanupAllRows} />
          <Btn label={normalizingHubs ? "Merging…" : "🏢 Merge Duplicate Hubs"} ghost small disabled={normalizingHubs} onClick={normalizeHubNames} />
          <Btn label={selectMode ? "✕ Cancel Select" : "☑️ Select"} ghost small onClick={toggleSelectMode} />
        </div>
      </Card>

      {dueVisits.length > 0 && (() => {
        const overdueN = dueVisits.filter(x => x.urgency === "overdue").length;
        const todayN = dueVisits.filter(x => x.urgency === "today").length;
        const tomorrowN = dueVisits.filter(x => x.urgency === "tomorrow").length;
        const headline = overdueN
          ? `${overdueN} visit${overdueN === 1 ? "" : "s"} overdue!`
          : todayN
          ? `${todayN} visit${todayN === 1 ? "" : "s"} scheduled today!`
          : `${tomorrowN} visit${tomorrowN === 1 ? "" : "s"} scheduled tomorrow`;
        return (
          <div style={{
            background: "linear-gradient(135deg, #FB717522, #F59E0B18)",
            border: `1.5px solid ${T.rose}55`, borderRadius: 16, padding: "14px 16px",
            animation: (overdueN || todayN) ? "visitGlow 1.8s ease-in-out infinite" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>🔔</span>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.t1 }}>{headline}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dueVisits.map(({ r, urgency }) => {
                const us = hubVisitUrgencyStyle(urgency);
                return (
                  <div key={r.id} onClick={() => setSelectedId(r.id)} style={{
                    display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                    background: T.card + "CC", border: `1px solid ${us.color}44`, borderRadius: 10, padding: "8px 10px",
                  }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{us.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                      <div style={{ fontSize: 10.5, color: T.t3 }}>{r.hub || "No hub"} {r.scheduledVisitNote ? "· " + r.scheduledVisitNote : ""}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: us.color, whiteSpace: "nowrap" }}>{us.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <Card accent={T.amber}>
        <Label sub="Every remark is logged with status, telecaller and date & time — download a report to share with management">Hub Distributor Report</Label>
        <Dropdown label="Hub" value={reportHub} onChange={e => setReportHub(e.target.value)} options={hubOptions} />
        <Dropdown label="Telecaller (for the by-telecaller breakdown)" value={reportTelecaller} onChange={e => setReportTelecaller(e.target.value)} options={["All", ...TELECALLERS]} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {["Today", "This Week", "This Month", "Custom"].map(p => (
            <button key={p} onClick={() => applyReportPreset(p)} style={{
              background: reportPreset === p ? T.amber : "transparent", color: reportPreset === p ? "#FFFFFF" : T.t2,
              border: `1px solid ${reportPreset === p ? T.amber : T.border}`, borderRadius: 10, padding: "8px 13px",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            }}>{p}</button>
          ))}
        </div>
        {reportPreset === "Custom" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, color: T.t3, marginBottom: 4, fontWeight: 600 }}>FROM</div><input type="date" value={reportFrom} max={todayISO()} onChange={e => { setReportFrom(e.target.value); setReportPreset("Custom"); }} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 10.5, color: T.t3, marginBottom: 4, fontWeight: 600 }}>TO</div><input type="date" value={reportTo} max={todayISO()} onChange={e => { setReportTo(e.target.value); setReportPreset("Custom"); }} style={inputStyle} /></div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn label={generatingReport ? "Generating…" : "🧾 PDF Report"} color={T.amber} disabled={generatingReport} onClick={downloadHubReport} />
          <Btn label={generatingExcel ? "Generating…" : "📊 Excel"} ghost color={T.amber} disabled={generatingExcel} onClick={downloadHubExcel} />
          <Btn label={generatingCallSheet ? "Generating…" : "🖨️ Telecaller Call Sheet"} ghost color={T.emerald} disabled={generatingCallSheet} onClick={downloadCallSheet} />
        </div>
        <div style={{ fontSize: 10.5, color: T.t3, marginTop: 6 }}>Call Sheet prints one page per telecaller (or just the one selected above) with the phone number, their best positive remark, their last remark, and a blank box per {reportPreset === "Today" || reportFrom === reportTo ? "day" : reportPreset === "This Week" ? "day of the week" : "week"} to write in after each call.</div>
      </Card>

      <Card accent={T.indigo}>
        <Label sub="Distributors with a positive remark (Interested / Visited / Deal Accepted) stay with their current telecaller — only the rest get split evenly">Rebalance Existing Data</Label>
        <Btn label="⚖️ Preview Equal Split" color={T.indigo} onClick={openRebalance} />
      </Card>

      <Sheet open={showRebalance} onClose={() => { setShowRebalance(false); setRebalancePreview(null); setRebalanceManual(false); }} title="⚖️ Rebalance Existing Data">
        <div style={{ fontSize: 11, color: T.t2, fontWeight: 600, marginBottom: 6 }}>Include in this rebalance</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {TELECALLERS.map(t => {
            const on = rebalanceIncluded[t];
            return (
              <button key={t} onClick={() => toggleRebalanceIncluded(t)} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: on ? telecallerColor(t) + "1E" : T.surface,
                border: `1.5px solid ${on ? telecallerColor(t) : T.border}`, borderRadius: 20,
                padding: "6px 12px", fontSize: 12, fontWeight: 700,
                color: on ? telecallerColor(t) : T.t3, cursor: "pointer", fontFamily: FONT,
              }}>{on ? "✅" : "⬜"} {t}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 10.5, color: T.t3, marginBottom: 14 }}>Untick anyone unavailable (on leave, etc.) — everything currently in their name goes back into the pool and gets handed out among whoever's left ticked, so they end up with none.</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setRebalanceManual(false)} style={{
            flex: 1, background: !rebalanceManual ? T.indigo : "transparent", color: !rebalanceManual ? "#fff" : T.t2,
            border: `1px solid ${!rebalanceManual ? T.indigo : T.border}`, borderRadius: 10, padding: "8px 10px",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}>⚖️ Auto Equal Split</button>
          <button onClick={() => setRebalanceManual(true)} style={{
            flex: 1, background: rebalanceManual ? T.indigo : "transparent", color: rebalanceManual ? "#fff" : T.t2,
            border: `1px solid ${rebalanceManual ? T.indigo : T.border}`, borderRadius: 10, padding: "8px 10px",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}>✍️ Manual Counts</button>
        </div>

        {rebalancePreview && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: T.emerald }}>
                  {rebalancePreview.activeTc.reduce((s, t) => s + rebalancePreview.positiveByTc[t], 0)}
                </div>
                <div style={{ fontSize: 10, color: T.t3, marginTop: 2 }}>Positive remarks — never move</div>
              </div>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: T.indigo }}>{rebalancePreview.eligible.length}</div>
                <div style={{ fontSize: 10, color: T.t3, marginTop: 2 }}>New leads to hand out</div>
              </div>
            </div>

            {!rebalanceManual ? (
              <>
                <div style={{ fontSize: 11, color: T.t2, fontWeight: 600, marginBottom: 8 }}>Positives kept + new leads given, per telecaller:</div>
                {rebalancePreview.activeTc.map(t => {
                  const isOver = rebalancePreview.overflow.includes(t);
                  return (
                    <div key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 2px", borderBottom: `1px solid ${T.border}` }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: telecallerColor(t) }}>{t}</span>
                        <div style={{ fontSize: 10, color: T.t3, marginTop: 1 }}>
                          {rebalancePreview.positiveByTc[t]} positive kept {rebalancePreview.need[t] > 0 ? `+ ${rebalancePreview.need[t]} new` : ""}
                          {isOver ? " · already above fair share" : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: T.t1 }}>{rebalancePreview.afterCounts[t] || 0}</span>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: T.t2, fontWeight: 600, marginBottom: 8 }}>Type how many new leads each telecaller should get:</div>
                {rebalancePreview.activeTc.map(t => (
                  <div key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 2px", borderBottom: `1px solid ${T.border}`, gap: 10 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: telecallerColor(t) }}>{t}</span>
                      <div style={{ fontSize: 10, color: T.t3, marginTop: 1 }}>{rebalancePreview.positiveByTc[t]} positive kept</div>
                    </div>
                    <input type="number" min={0} max={rebalancePreview.eligible.length} value={manualNeeds[t] ?? 0}
                      onChange={e => setManualNeeds(prev => ({ ...prev, [t]: Math.max(0, Number(e.target.value) || 0) }))}
                      style={{ width: 64, boxSizing: "border-box", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 13, fontWeight: 700, color: T.t1, textAlign: "center", fontFamily: FONT, outline: "none" }} />
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: manualTotal > rebalancePreview.eligible.length ? T.rose : T.t2 }}>
                    {manualTotal} of {rebalancePreview.eligible.length} new leads allocated
                  </span>
                  <button onClick={() => setManualNeeds(rebalancePreview.need)} style={{ background: "none", border: "none", color: T.indigo, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Reset to equal</button>
                </div>
              </>
            )}

            <div style={{ marginTop: 16 }}>
              <Btn label={`✅ Rebalance ${rebalancePreview.eligible.length} New Lead${rebalancePreview.eligible.length === 1 ? "" : "s"}`} color={T.indigo} full
                onClick={commitRebalance} disabled={!rebalancePreview.eligible.length} />
            </div>
          </>
        )}
      </Sheet>

      <Field label="Search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, hub, area, contact…" />
      {hubOptions.length > 1 && (
        <Dropdown label="Filter by Hub" value={hubFilter} onChange={e => setHubFilter(e.target.value)} options={hubOptions} />
      )}
      <Dropdown label="Filter by Telecaller — see just their assigned list" value={telecallerFilter} onChange={e => setTelecallerFilter(e.target.value)} options={["All", ...TELECALLERS]} />
      <button onClick={() => setShowOnlyScheduled(v => !v)} style={{
        alignSelf: "flex-start", background: showOnlyScheduled ? T.sky + "22" : T.surface,
        border: `1px solid ${showOnlyScheduled ? T.sky : T.border}`, borderRadius: 20, padding: "6px 12px",
        fontSize: 11.5, fontWeight: 700, color: showOnlyScheduled ? T.sky : T.t2, cursor: "pointer", fontFamily: FONT,
      }}>📅 {showOnlyScheduled ? "Showing Scheduled Only" : "Show Scheduled Only"}</button>
      <button onClick={() => setShowOnlyUnopened(v => !v)} style={{
        alignSelf: "flex-start", background: showOnlyUnopened ? "#F472B622" : T.surface,
        border: `1px solid ${showOnlyUnopened ? "#F472B6" : T.border}`, borderRadius: 20, padding: "6px 12px",
        fontSize: 11.5, fontWeight: 700, color: showOnlyUnopened ? "#F472B6" : T.t2, cursor: "pointer", fontFamily: FONT,
      }}>🆕 {showOnlyUnopened ? "Showing Not Called Yet" : "Show Not Called Yet"}</button>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        {["All", ...HUB_STAGES.map(s => s.id)].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            background: statusFilter === s ? (s === "All" ? T.accent : hubStageColor(s)) + "22" : T.surface,
            border: `1px solid ${statusFilter === s ? (s === "All" ? T.accent : hubStageColor(s)) : T.border}`,
            borderRadius: 20, padding: "6px 12px", fontSize: 11, fontWeight: 700,
            color: statusFilter === s ? (s === "All" ? T.accent : hubStageColor(s)) : T.t2, cursor: "pointer", fontFamily: FONT,
          }}>{s}</button>
        ))}
      </div>

      {selectMode && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 12px" }}>
          <span style={{ fontSize: 12, color: T.t2, fontWeight: 700 }}>{selectedIds.size} selected</span>
          <button onClick={() => setSelectedIds(new Set(filtered.map(r => r.id)))} style={{ background: "none", border: "none", color: T.accent, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Select All ({filtered.length})</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", color: T.t3, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Clear</button>
          <div style={{ flex: 1 }} />
          <Btn label={`🗑️ Delete Selected (${selectedIds.size})`} color={T.rose} small disabled={!selectedIds.size} onClick={bulkDeleteSelected} />
        </div>
      )}

      {!filtered.length ? (
        <div style={{ fontSize: 12.5, color: T.t3, fontStyle: "italic", padding: "10px 2px" }}>No distributors yet — add the first one above.</div>
      ) : filtered.map(r => {
        const latest = (r.remarks || [])[r.remarks.length - 1];
        const isSelected = selectedIds.has(r.id);
        const visitUrgency = hubVisitUrgency(r.scheduledVisitAt);
        const visitStyle = visitUrgency ? hubVisitUrgencyStyle(visitUrgency) : null;
        // "Unopened" = nobody has ever logged a remark on this lead — the
        // telecaller hasn't called/spoken yet. The moment they save their
        // first remark it flips to "opened" automatically, no separate
        // button to press — saving a remark IS pressing the option.
        const isUnopened = (r.remarks || []).length === 0;
        const tcColor = telecallerColor(r.telecaller);
        // The number now always shows separately below, so the old
        // "Unnamed · 88073 62044" placeholder would just repeat it right
        // under the name — trim it back to plain "Unnamed" on the card.
        const cardName = r.name && r.name.startsWith("Unnamed · ") ? "Unnamed" : (r.name || "Unnamed");
        return (
          <div key={r.id} onClick={() => selectMode ? toggleSelected(r.id) : requestOpen(r)} style={{
            background: T.card,
            border: `1.5px solid ${isSelected ? T.accent : isUnopened ? "#F472B6" : (visitStyle ? visitStyle.color + "66" : T.border)}`,
            borderRadius: 14, padding: "12px 14px", cursor: "pointer",
            display: "flex", gap: 10, alignItems: "flex-start",
            animation: (isUnopened && !isSelected) ? "newLeadGlow 2.2s ease-in-out infinite" : "none",
          }}>
            {selectMode && (
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(r.id)} onClick={e => e.stopPropagation()}
                style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, cursor: "pointer", accentColor: T.accent }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: isUnopened ? "#F472B6" : T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cardName}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: T.sky }}>🏢 {r.hub || "No hub"}</span>
                    {/* Contact number intentionally hidden on the list card — visible only after opening the distributor. */}
                    {r.telecaller && (
                      <span style={{
                        fontSize: 10.5, fontWeight: 800, color: tcColor, background: tcColor + "1E",
                        border: `1px solid ${tcColor}55`, borderRadius: 20, padding: "1px 8px",
                      }}>{r.telecaller}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                  <Chip small label={r.status} color={hubStageColor(r.status)} />
                  {r.lastRemarkAt && (() => {
                    const d = daysSince(r.lastRemarkAt);
                    const badgeColor = d === 0 ? T.emerald : d === 1 ? T.sky : d < 7 ? T.amber : T.t3;
                    return (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                        background: `linear-gradient(90deg, ${badgeColor}2E, ${badgeColor}14)`,
                        border: `1px solid ${badgeColor}77`, borderRadius: 20,
                        padding: "2px 9px", fontSize: 9.5, fontWeight: 800, color: badgeColor,
                        letterSpacing: "0.02em",
                      }}>⚡ {formatUpdatedBadge(r.lastRemarkAt)}</div>
                    );
                  })()}
                </div>
              </div>
              {isUnopened && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7,
                  background: "#F472B622", border: "1px solid #F472B688", borderRadius: 20,
                  padding: "3px 10px", fontSize: 10.5, fontWeight: 800, color: "#F472B6",
                }}>🆕 Not Called Yet — Please Call &amp; Update</div>
              )}
              {visitStyle && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7, marginLeft: isUnopened ? 6 : 0,
                  background: visitStyle.color + "22", border: `1px solid ${visitStyle.color}55`, borderRadius: 20,
                  padding: "3px 9px", fontSize: 10.5, fontWeight: 800, color: visitStyle.color,
                }}>
                  {visitStyle.emoji} {visitUrgency === "today" ? "Visit Today" : visitUrgency === "tomorrow" ? "Visit Tomorrow" : visitUrgency === "overdue" ? "Visit Overdue" : "Visit " + formatVisitDate(r.scheduledVisitAt)}
                </div>
              )}
              {(r.areas || []).length > 0 && (
                <div style={{ fontSize: 10.5, color: T.t3, marginTop: 6 }}>Areas: {r.areas.join(", ")}</div>
              )}
              {latest && <div style={{ fontSize: 11.5, color: T.t2, marginTop: 6 }}>{latest.text}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                {r.mapLink && <div style={{ fontSize: 10.5, color: T.sky }}>📍 Location set</div>}
              </div>
            </div>
          </div>
        );
      })}

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Add Hub Distributor">
        <Field label="Hub *" value={addForm.hub} onChange={e => setAddForm({ ...addForm, hub: e.target.value })} placeholder="e.g. Ambattur Hub" />
        <Field label="Distributor Name *" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. Sri Lakshmi Traders" />
        <Field label="Contact" value={addForm.contact} onChange={e => setAddForm({ ...addForm, contact: e.target.value })} type="tel" placeholder="98765 43210" />
        <Field label="Address / Location" value={addForm.address} onChange={e => setAddForm({ ...addForm, address: e.target.value })} placeholder="Optional" />
        <Field label="Google Maps Link" value={addForm.mapLink} onChange={e => setAddForm({ ...addForm, mapLink: e.target.value })} placeholder="Paste Google Maps link" />
        <Field label="Basic Details" value={addForm.details} onChange={e => setAddForm({ ...addForm, details: e.target.value })} placeholder="Business type, capacity, etc. (optional)" />
        <div style={{ fontSize: 11, color: T.t2, marginTop: 4, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Areas Distributed (up to 5)</div>
        {[1, 2, 3, 4, 5].map(n => (
          <Field key={n} value={addForm[`area${n}`]} onChange={e => setAddForm({ ...addForm, [`area${n}`]: e.target.value })} placeholder={`Area ${n}`} />
        ))}
        <Dropdown label="Approached By (Telecaller)" value={addForm.telecaller} onChange={e => setAddForm({ ...addForm, telecaller: e.target.value })} options={TELECALLERS} />
        <CalendarDatePicker label="📅 Schedule a Visit (optional)" value={addForm.scheduledVisitAt} min={todayISO()}
          onChange={(d) => setAddForm({ ...addForm, scheduledVisitAt: d })} />
        {addForm.scheduledVisitAt && (
          <Field value={addForm.scheduledVisitNote} onChange={e => setAddForm({ ...addForm, scheduledVisitNote: e.target.value })} placeholder="What's the visit for? (optional)" />
        )}
        <Btn label="Add Distributor" full onClick={addDistributor} disabled={!addForm.name.trim() || !addForm.hub.trim()} />
      </Sheet>

      <Sheet open={showImport} onClose={() => setShowImport(false)} title="Bulk Import Hub Distributors">
        <div style={{ fontSize: 12, color: T.t2, marginBottom: 12, lineHeight: 1.5 }}>
          Paste rows straight from Excel or Google Sheets — with or without
          a header row. Any of these columns are recognized in any order:{" "}
          <b>Hub, Name, Phone/Contact, Area, Address, Map Link, Details,
          Remark/Status, Telecaller</b>. A row with only a phone number (or
          only a name) is perfectly fine — it's still imported, just with
          the other fields left blank for you to fill in later. Re-importing
          an updated sheet is safe: rows are matched by phone number (or
          name + hub) and merged into the existing distributor instead of
          duplicated.
        </div>
        <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportPreview(null); }} rows={8}
          placeholder={"Paste your data here… even just a list of phone numbers works, e.g.\n9876543210\n9123456780"}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12 }} />
        <Field label="Default Hub (used for rows with no Hub column)" value={importDefaultHub} onChange={e => setImportDefaultHub(e.target.value)} placeholder="e.g. Ambattur Hub — optional" />
        <Dropdown label="Approached By — Telecaller for this whole batch *" value={importDefaultTc} onChange={e => { setImportDefaultTc(e.target.value); setImportPreview(null); }} options={TELECALLERS} />
        <div style={{ fontSize: 11, color: T.t3, marginTop: -8, marginBottom: 12, lineHeight: 1.4 }}>
          Every row in this paste is marked as approached by <b style={{ color: T.t1 }}>{importDefaultTc}</b>, unless the paste itself has its own Telecaller column with different names per row.
        </div>

        <BatchTitleField value={importTitle} onChange={v => { setImportTitle(v); setImportPreview(null); }} />
        {!importPreview ? (
          <Btn label="Preview Import" full ghost onClick={runImportPreview} disabled={!importText.trim() || !importTitle.trim()} />
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.emerald }}>{importPreview.rows.length}</div>
                <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>Ready to Import</div>
              </div>
              {importPreview.skipped > 0 && (
                <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.rose }}>{importPreview.skipped}</div>
                  <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>Skipped (blank row)</div>
                </div>
              )}
            </div>
            {importPreview.rows.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 12 }}>
                {importPreview.rows.slice(0, 8).map((row, i) => (
                  <div key={i} style={{ padding: "8px 10px", borderBottom: i < Math.min(importPreview.rows.length, 8) - 1 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.t1 }}>{row.name || <span style={{ fontStyle: "italic", color: T.t3 }}>No name</span>} <span style={{ fontWeight: 400, color: T.t3 }}>{row.contact ? "· " + row.contact : ""}</span></div>
                    <div style={{ fontSize: 10.5, color: T.t3, marginTop: 1 }}>{row.hub || "No hub"} {row.area ? "· " + row.area : ""} {row.remark ? "· " + row.remark : ""} {row.telecaller ? "· " + row.telecaller : ""}</div>
                  </div>
                ))}
                {importPreview.rows.length > 8 && <div style={{ padding: "8px 10px", fontSize: 11, color: T.t3, fontStyle: "italic" }}>+ {importPreview.rows.length - 8} more…</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn label="Edit Data" ghost onClick={() => setImportPreview(null)} />
              <Btn label={importing ? "Importing…" : `Import ${importPreview.rows.length} Distributors`} color={T.emerald}
                onClick={commitImport} disabled={importing || !importPreview.rows.length} />
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={showSplit} onClose={() => setShowSplit(false)} title="🔀 Split & Assign Numbers">
        <div style={{ fontSize: 12, color: T.t2, marginBottom: 12, lineHeight: 1.5 }}>
          Paste a fresh batch of numbers — bulk (one per line) or type them
          in one by one — pick who's working today, and this splits the
          batch evenly between them. Each new distributor lands in the main
          list exactly like any other — the telecaller just filters by
          their own name afterward to see their slice and work it as usual.
        </div>
        <textarea value={splitText} onChange={e => { setSplitText(e.target.value); setSplitPreview(null); }} rows={7}
          placeholder={"9876543210\n9123456780\n9988776655\n…"}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.t1, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12 }} />
        <Field label="Default Hub (optional)" value={splitHub} onChange={e => setSplitHub(e.target.value)} placeholder="e.g. Ambattur Hub — leave blank for Unassigned" />
        <div style={{ fontSize: 11, color: T.t2, marginTop: 4, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Split Between</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {TELECALLERS.map(t => {
            const active = splitTelecallers.has(t);
            return (
              <button key={t} onClick={() => { toggleSplitTelecaller(t); setSplitPreview(null); }} style={{
                background: active ? T.indigo + "22" : T.surface, border: `1px solid ${active ? T.indigo : T.border}`,
                borderRadius: 20, padding: "7px 13px", fontSize: 12, fontWeight: 700,
                color: active ? T.indigo : T.t3, cursor: "pointer", fontFamily: FONT,
              }}>{active ? "✓ " : ""}{t}</button>
            );
          })}
        </div>

        <BatchTitleField value={splitTitle} onChange={setSplitTitle} />
        {!splitPreview ? (
          <Btn label="🔀 Split Equally" full color={T.indigo} onClick={buildSplitPreview} disabled={!splitText.trim() || !splitTitle.trim() || !splitTelecallers.size} />
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.emerald }}>{splitPreview.total}</div>
                <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>To Split</div>
              </div>
              {splitPreview.skipped > 0 && (
                <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.amber }}>{splitPreview.skipped}</div>
                  <div style={{ fontSize: 9, color: T.t3, fontWeight: 700, textTransform: "uppercase" }}>Already Exist</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {splitPreview.buckets.map((b, i) => {
                const bucketColors = [T.emerald, T.sky, T.amber, T.rose, T.indigo, T.accent];
                const bc = bucketColors[i % bucketColors.length];
                return (
                  <div key={b.telecaller} style={{
                    background: bc + "14", border: `1.5px solid ${bc}55`, borderRadius: 12, padding: "10px 12px",
                    animation: isShuffling ? "shuffleBounce 0.38s ease" : "none",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: bc }}>{b.telecaller}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: bc, background: bc + "22", borderRadius: 20, padding: "2px 9px" }}>{b.contacts.length} number{b.contacts.length === 1 ? "" : "s"}</div>
                    </div>
                    <div style={{ fontSize: 10.5, color: T.t3, lineHeight: 1.6 }}>
                      {b.contacts.slice(0, 6).map(c => c.name || c.contact).join(" · ")}
                      {b.contacts.length > 6 && ` +${b.contacts.length - 6} more`}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Btn label={isShuffling ? "🎲 Shuffling…" : "🔀 Shuffle"} ghost color={T.indigo} disabled={isShuffling} onClick={shuffleSplit} />
              <Btn label="Edit Data" ghost onClick={() => setSplitPreview(null)} />
              <Btn label={splitCommitting ? "Adding…" : `✅ Add ${splitPreview.total} — Split Evenly`} color={T.emerald}
                onClick={commitSplit} disabled={splitCommitting || !splitPreview.total} />
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={!!pendingOpen} onClose={closeKeyPrompt} title="Enter Your Key">
        <div style={{ fontSize: 12.5, color: T.t3, marginBottom: 14 }}>
          {pendingOpen && (
            pendingOpen.transferStatus === "pending"
              ? `"${pendingOpen.name || "This distributor"}" is currently ${pendingOpen.telecaller}'s, with a pending transfer. Enter your key to open it.`
              : `"${pendingOpen.name || "This distributor"}" belongs to ${pendingOpen.telecaller || "an unassigned telecaller"}. Enter your key to open it.`
          )}
        </div>
        <input
          type="password"
          value={openKeyValue}
          onChange={e => { setOpenKeyValue(e.target.value); setOpenKeyError(""); }}
          onKeyDown={e => { if (e.key === "Enter") submitOpenKey(); }}
          autoFocus
          placeholder="Secret key"
          style={{
            width: "100%", boxSizing: "border-box", background: T.surface,
            border: `1.5px solid ${openKeyError ? T.rose : T.border}`, borderRadius: 12,
            padding: "13px 14px", fontSize: 17, fontWeight: 800, color: T.t1,
            textAlign: "center", letterSpacing: "0.05em", fontFamily: FONT, outline: "none",
          }}
        />
        {openKeyError === "wrong" && <div style={{ color: T.rose, fontSize: 12, fontWeight: 700, marginTop: 9 }}>Wrong key — try again.</div>}
        {openKeyError === "notyours" && pendingOpen && (
          <div style={{ color: T.rose, fontSize: 12, fontWeight: 700, marginTop: 9 }}>This data belongs to {pendingOpen.telecaller || "another telecaller"} — you can't open someone else's data.</div>
        )}
        <div style={{ marginTop: 14 }}>
          <Btn label="Unlock" full onClick={submitOpenKey} disabled={!openKeyValue} />
        </div>
      </Sheet>
    </div>
  );
}

function DailyOrders({ embedded = false } = {}) {
  const [orders, setOrders, ordersSyncStatus] = useSheetSynced("dailyOrders", "dailyOrders", INITIAL_DAILY_ORDERS);
  const [leads, setLeads] = useSheetSynced("leads", "leads", []);
  const [repeatCustomers] = useSheetSynced("repeatCustomers", "repeatCustomers", []);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyOrderForm());
  const [customerPick, setCustomerPick] = useState(NEW_CUSTOMER_OPTION);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelForm, setCancelForm] = useState({ reason: CANCEL_REASONS[0], remarks: "" });
  const [filterDate, setFilterDate] = useState(todayISO());
  const [reportFrom, setReportFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [reportTo, setReportTo] = useState(todayISO());
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [reportPreset, setReportPreset] = useState("last30");
  const [acctDate, setAcctDate] = useState(todayISO());
  const [generatingAcctPDF, setGeneratingAcctPDF] = useState(false);
  const [generatingOrderSheet, setGeneratingOrderSheet] = useState(false);

  const applyPreset = (preset) => {
    setReportPreset(preset);
    const t = todayISO();
    if (preset === "today") { setReportFrom(t); setReportTo(t); return; }
    if (preset === "week") {
      const d = new Date(); const day = d.getDay(); const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff);
      setReportFrom(d.toISOString().slice(0, 10)); setReportTo(t); return;
    }
    if (preset === "month") {
      const d = new Date();
      setReportFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`); setReportTo(t); return;
    }
    if (preset === "last30") {
      const d = new Date(); d.setDate(d.getDate() - 29);
      setReportFrom(d.toISOString().slice(0, 10)); setReportTo(t); return;
    }
  };

  // Combined, deduped list of known customers pulled from Leads, RepeatCustomers
  // and every customer name already logged in Daily Orders — so telecallers can
  // pick an existing customer instead of retyping their name/area every time.
  const knownCustomers = (() => {
    const map = new Map();
    (leads || []).forEach(l => { const n = (l.name || "").trim(); if (n) map.set(n.toLowerCase(), { name: n, area: l.area || "", contact: l.contact || "", address: l.address || "", mapLink: l.mapLink || "" }); });
    (repeatCustomers || []).forEach(c => { const n = (c.name || "").trim(); if (n) map.set(n.toLowerCase(), { name: n, area: c.area || "", contact: c.contact || map.get(n.toLowerCase())?.contact || "", address: c.address || map.get(n.toLowerCase())?.address || "", mapLink: c.mapLink || map.get(n.toLowerCase())?.mapLink || "" }); });
    orders.forEach(o => {
      const n = (o.customer || "").trim();
      if (n) {
        const existing = map.get(n.toLowerCase());
        map.set(n.toLowerCase(), { name: n, area: o.area || existing?.area || "", contact: o.contact || existing?.contact || "", address: o.address || existing?.address || "", mapLink: o.mapLink || existing?.mapLink || "" });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();
  const customerOptions = [NEW_CUSTOMER_OPTION, ...knownCustomers.map(c => c.name)];
  const pickCustomer = (value) => {
    setCustomerPick(value);
    if (value === NEW_CUSTOMER_OPTION) { setForm(f => ({ ...f, customer: "", area: "", contact: "", address: "", mapLink: "" })); return; }
    const match = knownCustomers.find(c => c.name === value);
    setForm(f => ({ ...f, customer: value, area: match ? match.area : f.area, contact: match ? match.contact : f.contact, address: match ? match.address : f.address, mapLink: match ? match.mapLink : f.mapLink }));
  };

  const today = todayISO();
  const active = orders.filter(o => o.status !== "Cancelled");
  const todays = active.filter(o => o.date === today);
  const todaysNew = todays.filter(o => o.orderType === "New Order");
  const todaysRegular = todays.filter(o => o.orderType === "Regular Order");
  const todaysKgs = todays.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0);
  const todaysRevenue = todays.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);

  // ── Income overview: today / this week / this month / all-time ─────────
  const startOfWeekISO = (() => {
    const d = new Date();
    const day = d.getDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? 6 : day - 1; // days since Monday
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  })();
  const startOfMonthISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();
  const weekOrders = active.filter(o => o.date >= startOfWeekISO && o.date <= today);
  const monthOrders = active.filter(o => o.date >= startOfMonthISO && o.date <= today);
  const weekRevenue = weekOrders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);
  const monthRevenue = monthOrders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);
  const allTimeRevenue = active.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);
  const allTimeKgs = active.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0);

  const dateOrders = orders
    .filter(o => o.date === filterDate)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const dateActiveOrders = dateOrders.filter(o => o.status !== "Cancelled");
  const dateTotals = {
    newCount: dateActiveOrders.filter(o => o.orderType === "New Order").length,
    regularCount: dateActiveOrders.filter(o => o.orderType === "Regular Order").length,
    sampleCount: dateActiveOrders.filter(o => o.orderType === "Sample").length,
    kgs: dateActiveOrders.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0),
    revenue: dateActiveOrders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0),
  };
  const dateTotalsByProduct = PRODUCTS.map(p => {
    let kgs = 0, revenue = 0;
    dateActiveOrders.forEach(o => orderLineItems(o).forEach(i => { if (i.product === p.name) { kgs += i.kgs; revenue += i.amount; } }));
    return { name: p.name, kgs, revenue };
  }).filter(p => p.kgs > 0);

  // Date-wise summary: new vs regular vs sample counts, kgs and revenue per day
  const byDate = {};
  active.forEach(o => {
    if (!byDate[o.date]) byDate[o.date] = { newCount: 0, regularCount: 0, sampleCount: 0, kgs: 0, revenue: 0 };
    const b = byDate[o.date];
    if (o.orderType === "New Order") b.newCount += 1;
    else if (o.orderType === "Regular Order") b.regularCount += 1;
    else b.sampleCount += 1;
    b.kgs += parseFloat(o.kgs) || 0;
    b.revenue += parseFloat(o.amount) || 0;
  });
  const summaryRows = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 21);

  const cancelledOrders = orders.filter(o => o.status === "Cancelled")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const cancelReasonCounts = CANCEL_REASONS.map(r => ({
    reason: r, count: cancelledOrders.filter(o => o.cancelReason === r).length,
  }));

  const openAdd = () => { setEditingId(null); setForm(emptyOrderForm(filterDate)); setCustomerPick(NEW_CUSTOMER_OPTION); setShowForm(true); };
  const openEdit = (o) => {
    setEditingId(o.id);
    const existing = orderLineItems(o);
    setForm({
      date: o.date, customer: o.customer, area: o.area || "", contact: o.contact || "", address: o.address || "", mapLink: o.mapLink || "", deliveryTime: o.deliveryTime || "", orderType: o.orderType,
      items: PRODUCTS.map(p => {
        const match = existing.find(i => i.product === p.name);
        return { product: p.name, kgs: match ? String(match.kgs) : "" };
      }),
      telecaller: o.telecaller || "",
      sampleType: o.sampleType || "Free",
      amountMode: o.amountMode || "Auto",
      manualAmount: o.manualAmount != null && o.manualAmount !== "" ? String(o.manualAmount) : "",
    });
    setCustomerPick(knownCustomers.some(c => c.name === o.customer) ? o.customer : NEW_CUSTOMER_OPTION);
    setShowForm(true);
  };

  // Whenever an order is saved, push the customer's contact/area/address/
  // map link into the CRM (Leads) too — so it's stored centrally, not just
  // local to Daily Orders, and next time this customer is picked (here or
  // in the CRM) it's already filled in.
  const syncCustomerToCRM = (customer, area, contact, address, mapLink, telecaller) => {
    const name = (customer || "").trim();
    if (!name) return;
    const idx = leads.findIndex(l => (l.name || "").trim().toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      const existing = leads[idx];
      const updated = {
        ...existing,
        area: area || existing.area || "",
        contact: contact || existing.contact || "",
        address: address || existing.address || "",
        mapLink: mapLink || existing.mapLink || "",
      };
      const changed = ["area", "contact", "address", "mapLink"].some(f => (updated[f] || "") !== (existing[f] || ""));
      if (changed) setLeads(leads.map((l, i) => i === idx ? updated : l));
    } else {
      setLeads([{
        id: Date.now() + Math.random(),
        name, contact: contact || "", business: name, type: "",
        area: area || "", address: address || "", mapLink: mapLink || "",
        stage: "Active Customer", source: "Daily Orders", telecaller: telecaller || "",
        lastContact: "Today", priority: "Medium", remarks: [], createdAt: Date.now(),
      }, ...leads]);
    }
  };

  const saveOrder = () => {
    const items = form.items
      .map(i => ({ product: i.product, kgs: parseFloat(i.kgs) || 0, rate: rateForProduct(i.product) }))
      .filter(i => i.kgs > 0)
      .map(i => ({ ...i, amount: Math.round(i.kgs * i.rate) }));
    if (!form.customer.trim() || !items.length || !form.date) return;
    const kgs = items.reduce((a, i) => a + i.kgs, 0);
    const autoAmount = items.reduce((a, i) => a + i.amount, 0);
    const isSample = form.orderType === "Sample";
    const amount = isSample ? sampleAmount(form, autoAmount) : autoAmount;
    const product = items.map(i => i.product).join(" + ");
    const { items: _formItems, ...formRest } = form;
    // Only persist sample fields on actual Sample orders, so New/Regular
    // orders never carry stray sampleType/amountMode leftovers.
    const sampleFields = isSample
      ? { sampleType: form.sampleType, amountMode: form.amountMode, manualAmount: form.amountMode === "Manual" ? amount : "" }
      : { sampleType: "", amountMode: "", manualAmount: "" };
    if (editingId) {
      setOrders(orders.map(o => o.id === editingId ? { ...o, ...formRest, ...sampleFields, items, kgs, amount, product } : o));
    } else {
      setOrders([{
        id: Date.now(), ...formRest, ...sampleFields, items, kgs, amount, product,
        status: "Active", cancelReason: "", cancelRemarks: "",
        createdAt: Date.now(),
      }, ...orders]);
    }
    syncCustomerToCRM(form.customer, form.area, form.contact, form.address, form.mapLink, form.telecaller);
    setShowForm(false); setEditingId(null); setForm(emptyOrderForm(filterDate));
  };

  const openCancel = (o) => { setCancelTarget(o); setCancelForm({ reason: CANCEL_REASONS[0], remarks: "" }); };
  const confirmCancel = () => {
    if (!cancelTarget) return;
    setOrders(orders.map(o => o.id === cancelTarget.id
      ? { ...o, status: "Cancelled", cancelReason: cancelForm.reason, cancelRemarks: cancelForm.remarks }
      : o));
    setCancelTarget(null);
  };
  const reactivate = (o) => setOrders(orders.map(x => x.id === o.id ? { ...x, status: "Active", cancelReason: "", cancelRemarks: "" } : x));
  const deleteOrder = (o) => {
    if (!window.confirm(`Delete this order permanently?\n\n${o.customer} — ${o.kgs} KG — ₹${o.amount}\n\nThis can't be undone. Use this only if the entry was a mistake.`)) return;
    setOrders(orders.filter(x => x.id !== o.id));
  };

  const presetLabel = () => ({
    today: "Daily", week: "Weekly", month: "Monthly", last30: "Last-30-Days", custom: "Custom-Range",
  }[reportPreset] || "Custom-Range");

  const getReportData = () => {
    const rangeOrders = orders
      .filter(o => o.date >= reportFrom && o.date <= reportTo)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
    const rangeActive = rangeOrders.filter(o => o.status !== "Cancelled");
    const rangeCancelled = rangeOrders.filter(o => o.status === "Cancelled");

    const rangeByDate = {};
    rangeActive.forEach(o => {
      if (!rangeByDate[o.date]) rangeByDate[o.date] = { newCount: 0, regularCount: 0, sampleCount: 0, newKg: 0, regularKg: 0, sampleKg: 0, kgs: 0, revenue: 0 };
      const b = rangeByDate[o.date];
      const kg = parseFloat(o.kgs) || 0;
      if (o.orderType === "New Order") { b.newCount += 1; b.newKg += kg; }
      else if (o.orderType === "Regular Order") { b.regularCount += 1; b.regularKg += kg; }
      else { b.sampleCount += 1; b.sampleKg += kg; }
      b.kgs += kg;
      b.revenue += parseFloat(o.amount) || 0;
    });

    const rangeByProduct = PRODUCTS.map(p => {
      let kgs = 0, revenue = 0, orderCount = 0;
      rangeActive.forEach(o => orderLineItems(o).forEach(i => {
        if (i.product === p.name && (parseFloat(i.kgs) || 0) > 0) { kgs += parseFloat(i.kgs) || 0; revenue += parseFloat(i.amount) || 0; orderCount += 1; }
      }));
      return { name: p.name, rate: p.rate, kgs, revenue, orderCount };
    });

    const rangeSamples = rangeActive.filter(o => o.orderType === "Sample");
    const sampleSummary = {
      count: rangeSamples.length,
      freeCount: rangeSamples.filter(o => o.sampleType !== "Paid").length,
      paidCount: rangeSamples.filter(o => o.sampleType === "Paid").length,
      kgs: rangeSamples.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0),
      revenue: rangeSamples.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0),
    };

    return {
      rangeOrders, rangeActive, rangeCancelled, rangeByDate, rangeByProduct, sampleSummary,
      totalNew: rangeActive.filter(o => o.orderType === "New Order").length,
      totalRegular: rangeActive.filter(o => o.orderType === "Regular Order").length,
      totalSample: rangeActive.filter(o => o.orderType === "Sample").length,
      totalNewKg: rangeActive.filter(o => o.orderType === "New Order").reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0),
      totalRegularKg: rangeActive.filter(o => o.orderType === "Regular Order").reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0),
      totalSampleKg: rangeActive.filter(o => o.orderType === "Sample").reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0),
      totalKg: rangeActive.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0),
      totalRevenue: rangeActive.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0),
    };
  };

  const downloadCSVReport = () => {
    const { rangeOrders, rangeActive, rangeCancelled, rangeByDate, rangeByProduct, totalNew, totalRegular, totalSample, totalKg, totalRevenue } = getReportData();
    const lines = [];
    lines.push(csvRow(["Sridhi Ventures BOS — Daily Orders Report"]));
    lines.push(csvRow([`Range: ${formatDateReadable(reportFrom)} to ${formatDateReadable(reportTo)}`]));
    lines.push(csvRow([`Generated: ${new Date().toLocaleString("en-IN")}`]));
    lines.push("");

    lines.push(csvRow(["ORDER LOG"]));
    lines.push(csvRow(["Date", "Customer", "Area", "Order Type", "Product Breakdown", "Total KG", "Amount (Rs)", "Telecaller", "Status", "Cancel Reason", "Cancel Remarks"]));
    rangeOrders.forEach(o => {
      const breakdown = orderLineItems(o).map(i => `${i.product}: ${i.kgs}KG @ Rs${i.rate}`).join(" | ");
      lines.push(csvRow([formatDateReadable(o.date), o.customer, o.area || "", orderTypeLabel(o), breakdown, o.kgs, o.amount, o.telecaller || "", o.status, o.cancelReason || "", o.cancelRemarks || ""]));
    });
    lines.push("");

    lines.push(csvRow(["PRODUCT SUMMARY (active orders only)"]));
    lines.push(csvRow(["Product", "Rate (Rs/KG)", "Orders", "Total KG", "Revenue (Rs)"]));
    rangeByProduct.forEach(p => {
      lines.push(csvRow([p.name, p.rate, p.orderCount, Math.round(p.kgs), Math.round(p.revenue)]));
    });
    lines.push("");

    lines.push(csvRow(["DAILY SUMMARY (active orders only)"]));
    lines.push(csvRow(["Date", "New Orders", "Regular Orders", "Samples", "Total KG", "Revenue (Rs)"]));
    Object.entries(rangeByDate).sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, s]) => {
      lines.push(csvRow([formatDateReadable(date), s.newCount, s.regularCount, s.sampleCount, Math.round(s.kgs), Math.round(s.revenue)]));
    });
    lines.push(csvRow(["TOTAL", totalNew, totalRegular, totalSample, Math.round(totalKg), Math.round(totalRevenue)]));
    lines.push("");

    lines.push(csvRow(["CANCELLED / STOPPED CUSTOMERS"]));
    lines.push(csvRow(["Date", "Customer", "Area", "KG", "Cancel Reason", "Remarks"]));
    rangeCancelled.forEach(o => {
      lines.push(csvRow([formatDateReadable(o.date), o.customer, o.area || "", o.kgs, o.cancelReason || "", o.cancelRemarks || ""]));
    });
    lines.push("");
    lines.push(csvRow(["Cancellation reason breakdown"]));
    CANCEL_REASONS.forEach(r => {
      lines.push(csvRow([r, rangeCancelled.filter(o => o.cancelReason === r).length]));
    });

    downloadCSV(`Sridhi-Daily-Orders-${presetLabel()}-Report_${reportFrom}_to_${reportTo}.csv`, lines.join("\n"));
  };

  const downloadPDFReport = async () => {
    if (generatingPDF) return;
    setGeneratingPDF(true);
    try {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const { rangeOrders, rangeCancelled, rangeByDate, rangeByProduct, sampleSummary, totalNew, totalRegular, totalSample, totalNewKg, totalRegularKg, totalSampleKg, totalKg, totalRevenue } = getReportData();

    // Brand palette — drawn from the Sridhi Ventures logo (deep forest green
    // header with the signature emerald accent), rather than generic navy/teal.
    const NAVY = [8, 40, 25];        // deep forest green header background
    const TEAL = [23, 148, 74];      // brand emerald (from the logo wordmark)
    const TEAL_TINT = [229, 248, 238]; // pale emerald tint for banners
    const INDIGO = [79, 70, 229];
    const AMBER = [180, 110, 5];
    const ROSE = [190, 24, 72];
    const ROSE_TINT = [253, 240, 244];
    const ORANGE = [217, 119, 6];
    const INK = [26, 32, 46];
    const SUBTLE = [110, 118, 138];
    const GRID = [228, 231, 238];

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;

    const header = () => {
      const headerH = 92;
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageW, headerH, "F");
      // Two-tone brand accent line under the header (emerald → pale emerald)
      doc.setFillColor(...TEAL);
      doc.rect(0, headerH - 3, pageW * 0.65, 3, "F");
      doc.setFillColor(...TEAL.map(c => Math.min(255, c + 60)));
      doc.rect(pageW * 0.65, headerH - 3, pageW * 0.35, 3, "F");

      // Logo badge — white rounded card so the logo's own white background
      // reads as an intentional badge rather than a stray box.
      const logoSize = 46;
      const badgePad = 7;
      const badgeSize = logoSize + badgePad * 2;
      const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 2;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 10, 10, "F");
      try {
        doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize);
      } catch (e) { /* logo optional — never block report generation */ }

      const textX = badgeX + badgeSize + 16;
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("SRIDHI VENTURES", textX, 34);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...TEAL.map(c => Math.min(255, c + 70)));
      doc.text(`${presetLabel().toUpperCase().replace(/-/g, " ")} ORDERS REPORT — NEW & REGULAR CONVERSIONS`, textX, 51);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(200, 214, 205);
      doc.text(`Period: ${formatDateReadable(reportFrom)}  –  ${formatDateReadable(reportTo)}`, textX, 68);
      doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 68, { align: "right" });
    };

    const footer = () => {
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(...GRID);
        doc.setLineWidth(0.6);
        doc.line(margin, pageH - 34, pageW - margin, pageH - 34);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...SUBTLE);
        doc.text("Sridhi Ventures · Business Operating System", margin, pageH - 20);
        doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 20, { align: "right" });
      }
    };

    header();
    let y = 118;

    // ── KPI summary cards ────────────────────────────────────────────────
    // ── New Orders KG — headline banner, shown first above the KPI row ────
    const newKgBannerH = 44;
    doc.setFillColor(...ROSE_TINT);
    doc.setDrawColor(...ROSE);
    doc.setLineWidth(1);
    doc.roundedRect(margin, y, pageW - margin * 2, newKgBannerH, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...ROSE);
    doc.text("NEW ORDERS — KG", margin + 16, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SUBTLE);
    doc.text(`Quantity booked from New Orders (${totalNew} order${totalNew === 1 ? "" : "s"}) in this period`, margin + 16, y + 32);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...INK);
    doc.text(`${Math.round(totalNewKg).toLocaleString("en-IN")} KG`, pageW - margin - 16, y + 29, { align: "right" });
    y += newKgBannerH + 16;

    const kpis = [
      { label: "New Conversions", value: String(totalNew), color: TEAL },
      { label: "Regular Conversions", value: String(totalRegular), color: INDIGO },
      { label: "Total KG Sold", value: Math.round(totalKg).toLocaleString("en-IN"), color: AMBER },
      { label: "Total Revenue", value: `Rs ${Math.round(totalRevenue).toLocaleString("en-IN")}`, color: [16, 150, 110] },
    ];
    const gap = 12;
    const cardW = (pageW - margin * 2 - gap * 3) / 4;
    const cardH = 62;
    kpis.forEach((k, i) => {
      const x = margin + i * (cardW + gap);
      doc.setFillColor(248, 249, 251);
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.7);
      doc.roundedRect(x, y, cardW, cardH, 7, 7, "FD");
      doc.setFillColor(...k.color);
      doc.roundedRect(x, y, 4, cardH, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SUBTLE);
      doc.text(k.label.toUpperCase(), x + 14, y + 22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...INK);
      doc.text(k.value, x + 14, y + 45);
    });
    y += cardH + 30;

    // ── Today's Snapshot banner — only shown on the Daily report ──────────
    if (reportPreset === "today") {
      const bannerH = 46;
      doc.setFillColor(...TEAL_TINT);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(1);
      doc.roundedRect(margin, y, pageW - margin * 2, bannerH, 8, 8, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...TEAL);
      doc.text(`TODAY'S SNAPSHOT — ${formatDateReadable(today)}`, margin + 16, y + 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...SUBTLE);
      doc.text("Total quantity moved and revenue booked today", margin + 16, y + 32);

      const snapW = 150;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...INK);
      doc.text(`${Math.round(todaysKgs).toLocaleString("en-IN")} KG`, pageW - margin - snapW - 100, y + 28, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SUBTLE);
      doc.text("TODAY'S KG", pageW - margin - snapW - 100, y + 39, { align: "right" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(16, 150, 110);
      doc.text(`Rs ${Math.round(todaysRevenue).toLocaleString("en-IN")}`, pageW - margin - 16, y + 28, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SUBTLE);
      doc.text("TODAY'S AMOUNT", pageW - margin - 16, y + 39, { align: "right" });

      y += bannerH + 22;
    }

    const sectionTitle = (text, color = NAVY) => {
      doc.setFillColor(...color);
      doc.roundedRect(margin, y - 12, 4, 14, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(...INK);
      doc.text(text, margin + 12, y);
      y += 12;
    };

    // ── Product summary — KG & revenue broken out per product, plus Samples ─
    if (y > pageH - 160) { doc.addPage(); header(); y = 118; }
    sectionTitle("Product Summary", TEAL);
    const productColors = [AMBER, INDIGO, ROSE, [16, 150, 110], [56, 189, 248]];
    const showSampleCard = sampleSummary.count > 0;
    const cardCount = rangeByProduct.length + (showSampleCard ? 1 : 0);
    const pGap = 12;
    const pCardW = (pageW - margin * 2 - pGap * (cardCount - 1)) / Math.max(cardCount, 1);
    const pCardH = 68;
    rangeByProduct.forEach((p, i) => {
      const x = margin + i * (pCardW + pGap);
      const color = productColors[i % productColors.length];
      doc.setFillColor(248, 249, 251);
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.7);
      doc.roundedRect(x, y, pCardW, pCardH, 7, 7, "FD");
      doc.setFillColor(...color);
      doc.roundedRect(x, y, pCardW, 4, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(p.name, x + 14, y + 22);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SUBTLE);
      doc.text(`Rs ${p.rate}/KG · ${p.orderCount} order${p.orderCount === 1 ? "" : "s"}`, x + 14, y + 33);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13.5);
      doc.setTextColor(...color);
      doc.text(`${Math.round(p.kgs).toLocaleString("en-IN")} KG`, x + 14, y + 51);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      doc.text(`Rs ${Math.round(p.revenue).toLocaleString("en-IN")}`, x + pCardW - 14, y + 51, { align: "right" });
    });
    if (showSampleCard) {
      const x = margin + rangeByProduct.length * (pCardW + pGap);
      // Tinted fill (not the plain grey used by the product cards) so the
      // Samples card reads as its own category at a glance.
      doc.setFillColor(254, 243, 226);
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(0.7);
      doc.roundedRect(x, y, pCardW, pCardH, 7, 7, "FD");
      doc.setFillColor(...ORANGE);
      doc.roundedRect(x, y, pCardW, 4, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text("Samples", x + 14, y + 22);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SUBTLE);
      doc.text(`${sampleSummary.freeCount} free · ${sampleSummary.paidCount} paid`, x + 14, y + 33);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13.5);
      doc.setTextColor(...ORANGE);
      doc.text(`${Math.round(sampleSummary.kgs).toLocaleString("en-IN")} KG`, x + 14, y + 51);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      doc.text(`Rs ${Math.round(sampleSummary.revenue).toLocaleString("en-IN")}`, x + pCardW - 14, y + 51, { align: "right" });
    }
    y += pCardH + 30;

    // ── Daily summary table ──────────────────────────────────────────────
    sectionTitle("Daily Summary — New vs Regular vs Sample");
    const summaryBody = Object.entries(rangeByDate).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, s]) => [
        formatDateReadable(date),
        String(s.newCount), `${Math.round(s.newKg).toLocaleString("en-IN")} KG`,
        String(s.regularCount), `${Math.round(s.regularKg).toLocaleString("en-IN")} KG`,
        String(s.sampleCount),
        Math.round(s.kgs).toLocaleString("en-IN"), `Rs ${Math.round(s.revenue).toLocaleString("en-IN")}`,
      ]);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 50 },
      head: [["Date", "New", "New KG", "Regular", "Regular KG", "Sample", "Total KG", "Revenue"]],
      body: summaryBody.length ? summaryBody : [["—", "—", "—", "—", "—", "—", "—", "—"]],
      foot: [["TOTAL",
        String(totalNew), `${Math.round(totalNewKg).toLocaleString("en-IN")} KG`,
        String(totalRegular), `${Math.round(totalRegularKg).toLocaleString("en-IN")} KG`,
        String(totalSample),
        Math.round(totalKg).toLocaleString("en-IN"), `Rs ${Math.round(totalRevenue).toLocaleString("en-IN")}`,
      ]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6, lineColor: GRID, lineWidth: 0.6, textColor: INK },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 },
      footStyles: { fillColor: TEAL_TINT, textColor: INK, fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: [249, 250, 252] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
      didParseCell: (data) => {
        // New/New KG in teal, Regular/Regular KG in indigo — same color logic
        // used for order-type elsewhere in this report, so New vs Regular is
        // easy to tell apart at a glance down the whole table.
        if (data.section !== "body") return;
        if (data.column.index === 1 || data.column.index === 2) data.cell.styles.textColor = TEAL;
        if (data.column.index === 3 || data.column.index === 4) data.cell.styles.textColor = INDIGO;
      },
    });
    y = doc.lastAutoTable.finalY + 30;

    // ── Order log table ──────────────────────────────────────────────────
    if (y > pageH - 160) { doc.addPage(); header(); y = 118; }
    sectionTitle("Order Log", TEAL);
    const orderBody = rangeOrders.map(o => [
      formatDateReadable(o.date), o.customer, o.area || "—", orderTypeLabel(o).replace(" Order", ""),
      orderLineItems(o).map(i => `${i.product}: ${i.kgs}KG`).join(", "), String(o.kgs), `Rs ${(o.amount || 0).toLocaleString("en-IN")}`, o.telecaller || "—", o.status,
    ]);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 50 },
      head: [["Date", "Customer", "Area", "Type", "Product", "KG", "Amount", "Telecaller", "Status"]],
      body: orderBody.length ? orderBody : [["—", "No orders in this range", "—", "—", "—", "—", "—", "—", "—"]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [249, 250, 252] },
      columnStyles: { 5: { halign: "right" }, 6: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          data.cell.styles.textColor = data.cell.raw === "New" ? TEAL : (String(data.cell.raw).startsWith("Sample") ? [217, 119, 6] : INDIGO);
          data.cell.styles.fontStyle = "bold";
        }
        if (data.section === "body" && data.column.index === 8) {
          data.cell.styles.textColor = data.cell.raw === "Cancelled" ? ROSE : [16, 150, 110];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 30;

    // ── Cancelled customers ──────────────────────────────────────────────
    if (rangeCancelled.length) {
      if (y > pageH - 160) { doc.addPage(); header(); y = 118; }
      sectionTitle("Cancelled / Stopped Customers", ROSE);
      const cancelBody = rangeCancelled.map(o => [formatDateReadable(o.date), o.customer, o.area || "—", String(o.kgs), o.cancelReason || "Other", o.cancelRemarks || "—"]);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, bottom: 50 },
        head: [["Date", "Customer", "Area", "KG", "Reason", "Remarks"]],
        body: cancelBody,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
        headStyles: { fillColor: ROSE, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        alternateRowStyles: { fillColor: ROSE_TINT },
      });
      y = doc.lastAutoTable.finalY + 18;

      if (y > pageH - 90) { doc.addPage(); header(); y = 118; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text("Reason breakdown:", margin, y);
      let bx = margin + 88;
      CANCEL_REASONS.forEach(r => {
        const count = rangeCancelled.filter(o => o.cancelReason === r).length;
        const label = `${r}: ${count}`;
        doc.setFillColor(...ROSE_TINT);
        const w = doc.getTextWidth(label) + 16;
        doc.roundedRect(bx, y - 11, w, 16, 8, 8, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...ROSE);
        doc.text(label, bx + 8, y);
        bx += w + 8;
      });
      // NOTE: without this, y never advances past the reason-breakdown chip
      // row, so the next section header ("Regular Customers Not Ordered…")
      // gets drawn on the same line and overlaps it — this was the alignment
      // bug in the report.
      y += 28;
    }

    // ── Regular customers who haven't ordered recently ────────────────────
    // A customer is "Regular" once they've ordered on more than 2 distinct
    // days (based on full order history, not just this report's range).
    // "Not ordered" here means they didn't order on the report's end date.
    const regularPatterns = computeCustomerPatterns(orders, reportTo);
    const missingRegularsRange = regularPatterns.filter(c => c.isRegular && !c.orderedToday).sort((a, b) => a.daysSince - b.daysSince);
    if (missingRegularsRange.length) {
      if (y > pageH - 160) { doc.addPage(); header(); y = 118; }
      sectionTitle(`Regular Customers Not Ordered on ${formatDateReadable(reportTo)}`, AMBER);
      const missBody = missingRegularsRange.map(c => [c.name, c.contact || "—", c.pattern, `${c.orderCount} orders / ${c.dayCount} days`, `${c.daysSince} day${c.daysSince === 1 ? "" : "s"} ago`]);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, bottom: 50 },
        head: [["Customer", "Contact", "Usual Pattern", "History", "Last Ordered"]],
        body: missBody,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
        headStyles: { fillColor: AMBER, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
        alternateRowStyles: { fillColor: [254, 246, 224] },
        columnStyles: { 4: { fontStyle: "bold", textColor: AMBER } },
      });
      y = doc.lastAutoTable.finalY + 30;
    }

    // ── Leads & Conversion Summary — final page ────────────────────────────
    const EMERALD = [16, 150, 110];
    const SKY = [56, 189, 248];
    const GRAY = [148, 163, 184];
    const STAGE_COLOR = {
      "New Lead": GRAY, "Contacted": SKY, "Interested": INDIGO, "Callback Requested": AMBER,
      "Sample Requested": ORANGE, "Assigned to Field Sales": ROSE, "Sample Delivered": EMERALD,
      "Feedback Pending": SKY, "Positive Feedback": EMERALD, "Negotiation": AMBER,
      "Order Received": TEAL, "Repeat Order Follow-up": INDIGO, "Active Customer": EMERALD,
      "Lost Customer": ROSE, "Invalid Number": GRAY,
    };
    const STAGE_ORDER = Object.keys(STAGE_COLOR);
    // Samples count as a positive outcome alongside actual orders/customers —
    // a delivered/well-received sample means the lead is engaged, not lost.
    const POSITIVE_STAGES = ["Sample Delivered", "Positive Feedback", "Negotiation", "Order Received", "Repeat Order Follow-up", "Active Customer"];
    // Use the same local-timezone date conversion as todayISO() (not raw UTC)
    // so a lead created "today" in local time isn't bucketed into yesterday/
    // tomorrow and silently dropped from the range filter.
    const localISO = (ts) => {
      const d = new Date(ts);
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d - tz).toISOString().slice(0, 10);
    };
    const periodLeads = (leads || []).filter(l => {
      if (!l || !l.stage) return false;
      const d = l.createdAt ? localISO(l.createdAt) : null;
      return d && d >= reportFrom && d <= reportTo;
    });
    const totalLeadsPeriod = periodLeads.length;
    const positiveLeadsPeriod = periodLeads.filter(l => POSITIVE_STAGES.includes(l.stage)).length;
    const leadConvRate = totalLeadsPeriod > 0 ? Math.round((positiveLeadsPeriod / totalLeadsPeriod) * 100) : 0;
    const stageBreakdown = STAGE_ORDER
      .map(s => ({ stage: s, count: periodLeads.filter(l => l.stage === s).length, color: STAGE_COLOR[s] }))
      .filter(s => s.count > 0);

    doc.addPage(); header(); y = 118;
    sectionTitle(`${presetLabel()} Leads & Conversions`, INDIGO);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...SUBTLE);
    doc.text(`New leads created between ${formatDateReadable(reportFrom)} and ${formatDateReadable(reportTo)}`, margin, y);
    y += 16;

    // KPI cards — simple, attractive snapshot up top
    const leadKpis = [
      { label: "Total Leads", value: String(totalLeadsPeriod), color: INDIGO },
      { label: "Converted / Positive", value: String(positiveLeadsPeriod), color: EMERALD },
      { label: "Conversion Rate", value: `${leadConvRate}%`, color: leadConvRate >= 40 ? EMERALD : leadConvRate >= 15 ? AMBER : ROSE },
    ];
    const lGap = 12;
    const lCardW = (pageW - margin * 2 - lGap * 2) / 3;
    const lCardH = 62;
    leadKpis.forEach((k, i) => {
      const x = margin + i * (lCardW + lGap);
      doc.setFillColor(248, 249, 251);
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.7);
      doc.roundedRect(x, y, lCardW, lCardH, 7, 7, "FD");
      doc.setFillColor(...k.color);
      doc.roundedRect(x, y, lCardW, 4, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...SUBTLE);
      doc.text(k.label.toUpperCase(), x + 14, y + 24);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.setTextColor(...k.color);
      doc.text(k.value, x + 14, y + 48);
    });
    y += lCardH + 24;

    // Note on how samples are treated, for transparency in the report
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...SUBTLE);
    doc.text("Delivered / well-received samples are counted as a positive outcome, alongside orders and active customers.", margin, y);
    y += 18;

    // ── Diagram — horizontal bar chart of pipeline stage counts ───────────
    if (y > pageH - 160) { doc.addPage(); header(); y = 118; }
    sectionTitle("Pipeline Breakdown", INDIGO);
    if (stageBreakdown.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...SUBTLE);
      doc.text("No leads created in this period.", margin, y + 4);
      y += 20;
    } else {
      const maxCount = Math.max(...stageBreakdown.map(s => s.count));
      const barLabelW = 150;
      const barValW = 34;
      const barMaxW = pageW - margin * 2 - barLabelW - barValW - 10;
      const barH = 14;
      const barGap = 8;
      stageBreakdown.forEach(s => {
        if (y > pageH - 60) { doc.addPage(); header(); y = 118; }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...INK);
        doc.text(s.stage, margin, y + barH - 4);
        doc.setFillColor(...GRID);
        doc.roundedRect(margin + barLabelW, y, barMaxW, barH, 3, 3, "F");
        const w = Math.max(6, Math.round((s.count / maxCount) * barMaxW));
        doc.setFillColor(...s.color);
        doc.roundedRect(margin + barLabelW, y, w, barH, 3, 3, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        doc.text(String(s.count), margin + barLabelW + barMaxW + 10, y + barH - 4, { align: "right" });
        y += barH + barGap;
      });
      y += 10;
    }

    // ── Today's leads status — simple attractive chip row (Daily report only) ─
    if (reportPreset === "today" && totalLeadsPeriod > 0) {
      if (y > pageH - 100) { doc.addPage(); header(); y = 118; }
      sectionTitle("Today's Leads — Status", TEAL);
      let cx = margin;
      const chipH = 22;
      stageBreakdown.forEach(s => {
        const label = `${s.stage}: ${s.count}`;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        const w = doc.getTextWidth(label) + 20;
        if (cx + w > pageW - margin) { cx = margin; y += chipH + 8; }
        doc.setFillColor(...s.color.map(c => Math.min(255, c + (255 - c) * 0.85)));
        doc.setDrawColor(...s.color);
        doc.setLineWidth(0.7);
        doc.roundedRect(cx, y, w, chipH, 11, 11, "FD");
        doc.setTextColor(...s.color);
        doc.text(label, cx + 10, y + 14.5);
        cx += w + 8;
      });
      y += chipH + 20;
    }

    footer();
    doc.save(`Sridhi-Daily-Orders-${presetLabel()}-Report_${reportFrom}_to_${reportTo}.pdf`);
    } finally {
      setGeneratingPDF(false);
    }
  };

  // ── Accountant / Dispatch Report ───────────────────────────────────────
  // A SEPARATE, additional report — does not touch or replace the report
  // above. Built for handing to the accountant/driver each day: sorted by
  // the time the order was logged (so dispatch order is clear), with
  // customer name, phone, address, a KG column per product, order type,
  // and amount — laid out to be read at a glance for billing + delivery.
  const downloadAccountantReport = async () => {
    if (generatingAcctPDF) return;
    setGeneratingAcctPDF(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      // Time shown/sorted: only the customer's actual delivery time is
      // displayed. Orders without one don't get a guessed time — they just
      // show "—" and sort after every order that does have a time set.
      const timeInfo = (o) => {
        if (o.deliveryTime) {
          const [hh, mm] = o.deliveryTime.split(":").map(Number);
          const d = new Date(); d.setHours(hh || 0, mm || 0, 0, 0);
          return { sortKey: "0:" + o.deliveryTime, label: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) };
        }
        const fallbackOrder = o.createdAt ? String(o.createdAt).padStart(14, "0") : "99999999999999";
        return { sortKey: "1:" + fallbackOrder, label: "—" };
      };

      const dayOrders = orders
        .filter(o => o.date === acctDate && o.status !== "Cancelled")
        .sort((a, b) => timeInfo(a).sortKey.localeCompare(timeInfo(b).sortKey)); // customer delivery time priority
      const dayCancelled = orders.filter(o => o.date === acctDate && o.status === "Cancelled");
      const missingRegulars = computeCustomerPatterns(orders, acctDate)
        .filter(c => c.isRegular && !c.orderedToday)
        .sort((a, b) => a.daysSince - b.daysSince);

      // Same brand palette as the Daily Orders report — deep forest green +
      // brand emerald, drawn from the Sridhi logo.
      const NAVY = [8, 40, 25];
      const TEAL = [23, 148, 74];
      const TEAL_TINT = [229, 248, 238];
      const AMBER = [180, 110, 5];
      const AMBER_TINT = [254, 246, 224];
      const INDIGO = [79, 70, 229];
      const ORANGE = [217, 119, 6];
      const INK = [26, 32, 46];
      const SUBTLE = [110, 118, 138];
      const GRID = [228, 231, 238];
      const typeColor = (t) => t === "New Order" ? TEAL : t === "Sample" ? ORANGE : INDIGO;

      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 36;

      const header = () => {
        const headerH = 78;
        doc.setFillColor(...NAVY);
        doc.rect(0, 0, pageW, headerH, "F");
        doc.setFillColor(...TEAL);
        doc.rect(0, headerH - 2, pageW, 2, "F");

        const logoSize = 40;
        const badgePad = 6;
        const badgeSize = logoSize + badgePad * 2;
        const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 1;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 9, 9, "F");
        try {
          doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize);
        } catch (e) { /* logo optional — never block report generation */ }

        const textX = badgeX + badgeSize + 14;
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("SRIDHI VENTURES — Accountant & Dispatch Report", textX, 31);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(200, 214, 205);
        doc.text(`For billing + driver dispatch  ·  Sorted by customer delivery time (— = no delivery time set)`, textX, 47);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(...TEAL.map(c => Math.min(255, c + 70)));
        doc.text(formatDateReadable(acctDate), pageW - margin, 32, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(200, 214, 205);
        doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 48, { align: "right" });
      };

      const footer = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setDrawColor(...GRID);
          doc.setLineWidth(0.6);
          doc.line(margin, pageH - 28, pageW - margin, pageH - 28);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...SUBTLE);
          doc.text("Sridhi Ventures · Accountant & Dispatch Report", margin, pageH - 14);
          doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 14, { align: "right" });
        }
      };

      header();
      let y = 96;

      // ── Headline summary strip: total orders, total per product KG, total ₹ ──
      const activeCount = dayOrders.length;
      const newCount = dayOrders.filter(o => o.orderType === "New Order").length;
      const regularCount = dayOrders.filter(o => o.orderType === "Regular Order").length;
      const sampleCount = dayOrders.filter(o => o.orderType === "Sample").length;
      const productTotals = PRODUCTS.map(p => {
        let kgs = 0;
        dayOrders.forEach(o => orderLineItems(o).forEach(i => { if (i.product === p.name) kgs += parseFloat(i.kgs) || 0; }));
        return { name: p.name, kgs };
      });
      const totalAmount = dayOrders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);

      const chips = [
        [`${activeCount} Orders`, TEAL, TEAL_TINT],
        [`${newCount} New · ${regularCount} Regular${sampleCount ? ` · ${sampleCount} Sample` : ""}`, INDIGO, [235, 234, 253]],
        ...productTotals.filter(p => p.kgs > 0).map(p => [`${p.name}: ${p.kgs.toLocaleString("en-IN", { maximumFractionDigits: 1 })} KG`, AMBER, AMBER_TINT]),
        [`Total Rs ${Math.round(totalAmount).toLocaleString("en-IN")}`, TEAL, TEAL_TINT],
        ...(dayCancelled.length ? [[`${dayCancelled.length} Cancelled`, [190, 30, 65], [253, 232, 235]]] : []),
        ...(missingRegulars.length ? [[`${missingRegulars.length} Regulars missing today`, [180, 110, 5], AMBER_TINT]] : []),
      ];
      let cx = margin;
      const chipH = 26;
      chips.forEach(([label, color, tint]) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        const w = doc.getTextWidth(label) + 24;
        if (cx + w > pageW - margin) { cx = margin; y += chipH + 8; }
        doc.setFillColor(...tint);
        doc.setDrawColor(...color);
        doc.setLineWidth(0.8);
        doc.roundedRect(cx, y, w, chipH, 13, 13, "FD");
        doc.setTextColor(...color);
        doc.text(label, cx + 12, y + 17);
        cx += w + 8;
      });
      y += chipH + 18;

      if (!dayOrders.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...SUBTLE);
        doc.text(`No active orders logged for ${formatDateReadable(acctDate)}.`, margin, y + 10);
      } else {
        const productCols = PRODUCTS.map(p => p.name);
        // Column layout: Time, Customer, Contact, Address, Map, <one col per product>, Order Type, Amount
        const contactColIdx = 2;
        const mapColIdx = 4;
        const porterColIdx = 5;
        const typeColIdx = 6 + productCols.length;
        const amountColIdx = 7 + productCols.length;

        const body = dayOrders.map(o => {
          const items = orderLineItems(o);
          const kgByProduct = productCols.map(name => {
            const it = items.find(i => i.product === name);
            return it && it.kgs ? `${it.kgs} KG` : "—";
          });
          const typeLabel = o.orderType === "Sample" ? `Sample (${o.sampleType || "Free"})` : o.orderType.replace(" Order", "");
          const fullAddress = [o.address, o.area].filter(Boolean).join(", ") || "—";
          return [timeInfo(o).label, o.customer, o.contact || "—", fullAddress, o.mapLink ? "View Map" : "—", fullAddress !== "—" ? "Book" : "—", ...kgByProduct, typeLabel, `Rs ${(o.amount || 0).toLocaleString("en-IN")}`];
        });

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin, bottom: 40 },
          head: [["Time", "Customer Name", "Contact", "Address (full)", "Map", "Porter", ...productCols, "Order Type", "Amount"]],
          body,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 6, lineColor: GRID, lineWidth: 0.6, textColor: INK, valign: "middle" },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 9 },
          alternateRowStyles: { fillColor: [249, 250, 252] },
          columnStyles: {
            0: { fontStyle: "bold", cellWidth: 55 },        // Time — prioritized visually
            1: { fontStyle: "bold" },                        // Customer name
            3: { cellWidth: 150 },                            // Full address gets room to breathe
            4: { halign: "center", cellWidth: 46 },           // Map link
            [porterColIdx]: { halign: "center", cellWidth: 46 }, // Porter booking link
            [amountColIdx]: { halign: "right", fontStyle: "bold" },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === typeColIdx) {
              const raw = String(data.cell.raw);
              const col = raw.startsWith("New") ? TEAL : raw.startsWith("Sample") ? ORANGE : INDIGO;
              data.cell.styles.textColor = col;
              data.cell.styles.fontStyle = "bold";
            }
            if (data.section === "body" && data.column.index === 0) {
              data.cell.styles.textColor = TEAL;
            }
            if (data.section === "body" && data.column.index === mapColIdx && data.cell.raw === "View Map") {
              data.cell.styles.textColor = INDIGO;
              data.cell.styles.fontStyle = "bold";
            }
            if (data.section === "body" && data.column.index === porterColIdx && data.cell.raw === "Book") {
              data.cell.styles.textColor = AMBER; // Porter's brand-ish amber to distinguish from the Maps link
              data.cell.styles.fontStyle = "bold";
            }
            if (data.section === "body" && data.column.index === contactColIdx && data.cell.raw !== "—") {
              data.cell.styles.textColor = [37, 130, 90]; // WhatsApp-green to signal it's tappable
              data.cell.styles.fontStyle = "bold";
            }
          },
          didDrawCell: (data) => {
            // Make the "View Map" cell an actual clickable link to the saved Google Maps URL.
            if (data.section === "body" && data.column.index === mapColIdx) {
              const order = dayOrders[data.row.index];
              if (order && order.mapLink) {
                doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: order.mapLink });
              }
            }
            // Make the "Book" cell open Porter so the driver/accountant can book a Porter pickup for this delivery.
            // Porter doesn't support prefilling pickup/drop via a public URL, so this opens Porter's
            // booking page/app — the address is already right there in the row to copy in.
            if (data.section === "body" && data.column.index === porterColIdx && data.cell.raw === "Book") {
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: "https://porter.in/" });
            }
            // Make the Contact cell an actual clickable link that opens a WhatsApp chat with that number.
            if (data.section === "body" && data.column.index === contactColIdx) {
              const order = dayOrders[data.row.index];
              const digits = order && order.contact ? String(order.contact).replace(/[^0-9]/g, "") : "";
              if (digits) {
                const withCountryCode = digits.length === 10 ? "91" + digits : digits;
                doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: `https://wa.me/${withCountryCode}` });
              }
            }
          },
        });
        y = doc.lastAutoTable.finalY + 24;
      }

      // ── Cancelled / stopped orders for this day ─────────────────────
      const ROSE = [190, 30, 65];
      const ROSE_TINT = [253, 232, 235];
      if (dayCancelled.length) {
        if (y > pageH - 140) { doc.addPage(); header(); y = 96; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11.5);
        doc.setTextColor(...ROSE);
        doc.text(`Cancelled / Stopped Orders (${dayCancelled.length})`, margin, y);
        y += 12;
        const cancelBody = dayCancelled.map(o => [o.customer, [o.address, o.area].filter(Boolean).join(", ") || "—", String(o.kgs), o.cancelReason || "Other", o.cancelRemarks || "—"]);
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin, bottom: 40 },
          head: [["Customer", "Address", "KG", "Reason", "Remarks"]],
          body: cancelBody,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
          headStyles: { fillColor: ROSE, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: ROSE_TINT },
          columnStyles: { 3: { fontStyle: "bold", textColor: ROSE } },
        });
        y = doc.lastAutoTable.finalY + 24;
      }

      // ── Regular customers who haven't ordered today ─────────────────
      // A customer is "Regular" once they've ordered on more than 2 distinct
      // days. This flags regulars who are missing from today's dispatch —
      // useful for a quick follow-up call.
      if (missingRegulars.length) {
        if (y > pageH - 140) { doc.addPage(); header(); y = 96; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11.5);
        doc.setTextColor(...AMBER);
        doc.text(`Regular Customers Who Haven't Ordered Today (${missingRegulars.length})`, margin, y);
        y += 12;
        const missBody = missingRegulars.map(c => [c.name, c.contact || "—", c.pattern, `${c.orderCount} orders / ${c.dayCount} days`, `${c.daysSince} day${c.daysSince === 1 ? "" : "s"} ago`]);
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin, bottom: 40 },
          head: [["Customer", "Contact", "Usual Pattern", "History", "Last Ordered"]],
          body: missBody,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
          headStyles: { fillColor: [180, 110, 5], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: AMBER_TINT },
          columnStyles: { 4: { fontStyle: "bold", textColor: AMBER } },
        });
        y = doc.lastAutoTable.finalY + 24;
      }

      // ── Signature / handoff strip for accountant + driver ────────────
      if (y < pageH - 90) {
        doc.setDrawColor(...GRID);
        doc.setLineWidth(0.8);
        const sigW = (pageW - margin * 2 - 24) / 2;
        [["Prepared By (Accountant)", margin], ["Received By (Driver)", margin + sigW + 24]].forEach(([label, x]) => {
          doc.line(x, y + 34, x + sigW, y + 34);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(...SUBTLE);
          doc.text(label, x, y + 48);
        });
      }

      footer();
      doc.save(`Sridhi-Accountant-Dispatch-Report_${acctDate}.pdf`);
    } finally {
      setGeneratingAcctPDF(false);
    }
  };

  // ── Order Sheet PDF ──────────────────────────────────────────────────
  // A separate, additional printout modeled on the paper order-sheet format
  // the logistics team already uses: Regular Orders and New Orders side by
  // side, S.No / Name / Area / per-product KG / Contact columns, with blank
  // ruled rows left at the end of each table so any sudden/walk-in orders
  // can be written in by hand in the same format.
  const downloadOrderSheet = async () => {
    if (generatingOrderSheet) return;
    setGeneratingOrderSheet(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const dayActive = orders.filter(o => o.date === acctDate && o.status !== "Cancelled");
      const regularOrders = dayActive.filter(o => o.orderType === "Regular Order");
      const newOrders = dayActive.filter(o => o.orderType === "New Order");
      const productCols = PRODUCTS.map(p => p.name);

      const NAVY = [8, 40, 25];
      const TEAL = [23, 148, 74];
      const TEAL_TINT = [229, 248, 238];
      const INK = [26, 32, 46];
      const SUBTLE = [110, 118, 138];
      const GRID = [200, 206, 200];

      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 32;

      const header = () => {
        const headerH = 70;
        doc.setFillColor(...NAVY);
        doc.rect(0, 0, pageW, headerH, "F");
        doc.setFillColor(...TEAL);
        doc.rect(0, headerH - 2, pageW, 2, "F");

        const logoSize = 34;
        const badgePad = 5;
        const badgeSize = logoSize + badgePad * 2;
        const badgeX = margin, badgeY = (headerH - badgeSize) / 2 - 1;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 8, 8, "F");
        try {
          doc.addImage(SRIDHI_LOGO_PNG, "PNG", badgeX + badgePad, badgeY + badgePad, logoSize, logoSize);
        } catch (e) { /* logo optional — never block report generation */ }

        const textX = badgeX + badgeSize + 14;
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("SRIDHI VENTURES — DAILY ORDER SHEET", textX, 29);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(200, 214, 205);
        doc.text("Regular & New orders for dispatch  ·  Blank rows for sudden / walk-in orders — fill in by hand", textX, 44);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(...TEAL.map(c => Math.min(255, c + 70)));
        doc.text(formatDateReadable(acctDate), pageW - margin, 28, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(200, 214, 205);
        doc.text(`Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`, pageW - margin, 42, { align: "right" });
      };

      const footer = () => {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setDrawColor(...GRID);
          doc.setLineWidth(0.6);
          doc.line(margin, pageH - 26, pageW - margin, pageH - 26);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...SUBTLE);
          doc.text("Sridhi Ventures · Order Sheet", margin, pageH - 13);
          doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 13, { align: "right" });
        }
      };

      header();

      // ── Total Sales — shown up top on page 1, not buried at the end ────
      const dayActiveKg = dayActive.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0);
      const boxY = 82, boxW = 300, boxH = 28;
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(1.1);
      doc.setFillColor(...TEAL_TINT);
      doc.roundedRect(margin, boxY, boxW, boxH, 6, 6, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...NAVY);
      doc.text("TOTAL SALES IN KGs", margin + 14, boxY + boxH / 2 + 4);
      doc.setFontSize(13);
      doc.setTextColor(...TEAL);
      doc.text(`${dayActiveKg.toLocaleString("en-IN", { maximumFractionDigits: 1 })} KG`, margin + boxW - 14, boxY + boxH / 2 + 4, { align: "right" });

      const y0 = boxY + boxH + 20;

      // Build one section's table rows: real orders first, then blank ruled
      // rows so the logistics team can add sudden orders in the same format.
      // Area/Location intentionally shows the short area name (not the full
      // multi-line address) — full addresses blow rows out to 3-4 lines each
      // and push the table past a single page, which is what caused the
      // earlier misalignment. Full addresses are still on the Accountant
      // Report, which has room for them.
      const shortLocation = (o) => {
        if (o.area && o.area.trim()) return o.area.trim();
        if (o.address && o.address.trim()) return o.address.split(",")[0].trim();
        return "—";
      };
      const buildRows = (list, startY) => {
        const dataRows = list.map((o, idx) => {
          const items = orderLineItems(o);
          const kgByProduct = productCols.map(name => {
            const it = items.find(i => i.product === name);
            return it && it.kgs ? String(it.kgs) : "";
          });
          return [String(idx + 1), o.customer, shortLocation(o), ...kgByProduct, o.contact || ""];
        });
        // How many blank rows actually fit without spilling onto another
        // page — measured empirically at this font/padding: ~20pt per row,
        // plus a fixed allowance for the (3-line-wrapped) header and the
        // totals footer row. A fixed "+6" here previously ignored how much
        // room the header/footer actually take, so a full 12-row order list
        // would silently push one blank row past the page bottom and cascade
        // into extra pages for everything after it.
        const ROW_H = 20;
        const HEADER_FOOTER_ALLOWANCE = 90;
        const available = pageH - startY - 40 - HEADER_FOOTER_ALLOWANCE;
        const maxRowsThatFit = Math.max(dataRows.length, Math.floor(available / ROW_H));
        const desiredRows = Math.max(dataRows.length + 6, 12);
        const targetRows = Math.min(desiredRows, maxRowsThatFit);
        const blankRows = Array.from({ length: Math.max(0, targetRows - dataRows.length) }, (_, i) => [String(dataRows.length + i + 1), "", "", ...productCols.map(() => ""), ""]);
        return [...dataRows, ...blankRows];
      };

      const totalsRow = (list) => {
        const perProduct = productCols.map(name => {
          let kg = 0;
          list.forEach(o => orderLineItems(o).forEach(i => { if (i.product === name) kg += parseFloat(i.kgs) || 0; }));
          return kg > 0 ? kg.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : "";
        });
        return ["", "TOTAL", "", ...perProduct, ""];
      };

      const halfW = (pageW - margin * 2 - 20) / 2;
      const sectionCols = [
        { label: "S.No", w: 22 },
        { label: "Customer / Hotel Name", w: null },
        { label: "Area / Location", w: 68 },
        ...productCols.map(name => ({ label: `${name}\n(KG)`, w: 54 })),
        { label: "Contact No", w: 64 },
      ];
      const sumFixed = sectionCols.reduce((a, c) => a + (c.w || 0), 0);
      // Name column gets whatever is left over — this is the column that
      // actually needs the room (short area names/contact numbers never
      // wrap, but a cramped name column wraps to 2-3 lines and is what
      // pushes a normal-sized order list past a single page).
      const flexW = Math.max(halfW - sumFixed, 100);
      const colStyles = {};
      sectionCols.forEach((c, i) => { colStyles[i] = c.w ? { cellWidth: c.w } : { cellWidth: flexW }; });
      colStyles[0] = { ...colStyles[0], halign: "center" };
      productCols.forEach((_, i) => { colStyles[3 + i] = { ...colStyles[3 + i], halign: "center" }; });

      // Renders one section's table. If it spills past the current page,
      // the header/logo banner is redrawn on every continuation page.
      const renderSection = (title, list, x, startY) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11.5);
        doc.setTextColor(...TEAL);
        doc.text(title, x, startY - 8);
        autoTable(doc, {
          startY,
          margin: { left: x, right: pageW - x - halfW, bottom: 40, top: y0 },
          tableWidth: halfW,
          head: [sectionCols.map(c => c.label)],
          body: buildRows(list, startY),
          foot: [totalsRow(list)],
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: 5, lineColor: GRID, lineWidth: 0.7, textColor: INK, valign: "middle", minCellHeight: 16 },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 7.8, halign: "center" },
          footStyles: { fillColor: TEAL_TINT, textColor: TEAL, fontStyle: "bold", fontSize: 8.5 },
          columnStyles: colStyles,
          alternateRowStyles: { fillColor: [250, 251, 250] },
          didDrawPage: () => header(), // keep the branded banner on every continuation page
        });
        return doc.lastAutoTable.finalY;
      };

      const pagesBeforeRegular = doc.internal.getNumberOfPages();
      const leftBottom = renderSection(`REGULAR ORDERS  (${regularOrders.length})`, regularOrders, margin, y0);
      const regularOverflowed = doc.internal.getNumberOfPages() > pagesBeforeRegular;

      let rightX = margin + halfW + 20;
      let rightStartY = y0;
      if (regularOverflowed) {
        // Regular Orders needed more than one page — give New Orders a
        // clean fresh page of its own instead of squeezing it in next to
        // a continuation table (this was the main misalignment before).
        doc.addPage();
        header();
        rightX = margin;
      }
      const rightBottom = renderSection(`NEW ORDERS  (${newOrders.length})`, newOrders, rightX, rightStartY);

      // ── Regular customers who haven't ordered today ─────────────────
      // Same list as the Accountant Report — a customer is "Regular" once
      // they've ordered on more than 2 distinct days. This always starts
      // on its own fresh page: Page 1 is Regular + New Orders, Page 2 is
      // Missing Regulars — never conditionally squeezed onto whatever
      // room happens to be left at the bottom of page 1.
      const AMBER = [180, 110, 5];
      const AMBER_TINT = [254, 246, 224];
      const missingRegulars = computeCustomerPatterns(orders, acctDate)
        .filter(c => c.isRegular && !c.orderedToday)
        .sort((a, b) => a.daysSince - b.daysSince);
      if (missingRegulars.length) {
        doc.addPage();
        header();
        let y = y0;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11.5);
        doc.setTextColor(...AMBER);
        doc.text(`Regular Customers Who Haven't Ordered Today (${missingRegulars.length})`, margin, y);
        y += 12;
        const missBody = missingRegulars.map(c => [c.name, c.contact || "—", c.pattern, `${c.orderCount} orders / ${c.dayCount} days`, `${c.daysSince} day${c.daysSince === 1 ? "" : "s"} ago`]);
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin, bottom: 40, top: y0 },
          head: [["Customer", "Contact No", "Usual Pattern", "History", "Last Ordered"]],
          body: missBody,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5.5, lineColor: GRID, lineWidth: 0.6, textColor: INK },
          headStyles: { fillColor: [180, 110, 5], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          alternateRowStyles: { fillColor: AMBER_TINT },
          columnStyles: { 1: { fontStyle: "bold" }, 4: { fontStyle: "bold", textColor: AMBER } },
          didDrawPage: () => header(),
        });
        y = doc.lastAutoTable.finalY + 26;
      }

      footer();
      doc.save(`Sridhi-Order-Sheet_${acctDate}.pdf`);
    } finally {
      setGeneratingOrderSheet(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!embedded && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <MobileStatCard icon="🆕" title="Today's Orders" value={todaysNew.length} sub="New Orders" color={T.accent} />
          <MobileStatCard icon="🔁" title="Regular Orders" value={todaysRegular.length} sub="Today · Regular" color={T.sky} />
          <MobileStatCard icon="⚖️" title="Total KGs" value={`${Math.round(todaysKgs).toLocaleString("en-IN")} KG`} sub="Today" color={T.indigo} />
          <MobileStatCard icon="💰" title="Today Revenue" value={`₹${Math.round(todaysRevenue).toLocaleString("en-IN")}`} sub="Today" color={T.amber} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <SyncBadge status={ordersSyncStatus} />
      </div>

      {!embedded && (
        <Card accent={T.emerald}>
          <Label sub="Auto-calculated from every active order — cancelled orders are excluded">Income Overview</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            <MobileStatCard icon="📆" title="Today" value={`₹${Math.round(todaysRevenue).toLocaleString("en-IN")}`} color={T.emerald} />
            <MobileStatCard icon="📈" title="This Week" value={`₹${Math.round(weekRevenue).toLocaleString("en-IN")}`} color={T.sky} />
            <MobileStatCard icon="🗓️" title="This Month" value={`₹${Math.round(monthRevenue).toLocaleString("en-IN")}`} color={T.indigo} />
            <MobileStatCard icon="🏆" title="All-Time" value={`₹${Math.round(allTimeRevenue).toLocaleString("en-IN")}`} color={T.accent} />
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, color: T.t3 }}>
            {allTimeKgs.toLocaleString("en-IN", { maximumFractionDigits: 0 })} KG sold overall · avg ₹{allTimeKgs > 0 ? Math.round(allTimeRevenue / allTimeKgs) : RATE_PER_KG}/KG
          </div>
        </Card>
      )}

      <button onClick={openAdd} style={{
        background: T.accentSub, border: `1px solid ${T.accentGlow}`,
        borderRadius: 14, color: T.accent, padding: 13,
        fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT,
      }}>+ Log Order (₹{RATE_PER_KG}/KG)</button>

      <Card>
        <Label sub="A branded, print-ready report — KPI summary, daily breakdown, order log and cancellations">Download Report</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, marginBottom: 14 }}>
          {[
            { id: "today", label: "📆 Daily" },
            { id: "week",  label: "📈 Weekly" },
            { id: "month", label: "🗓️ Monthly" },
            { id: "last30", label: "Last 30 Days" },
          ].map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)} style={{
              background: reportPreset === p.id ? T.accent : "transparent",
              color: reportPreset === p.id ? "#FFFFFF" : T.t2,
              border: `1px solid ${reportPreset === p.id ? T.accent : T.border}`,
              borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT, transition: "background 0.12s, color 0.12s",
            }}>{p.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
          <div style={{ flex: "1 1 130px" }}>
            <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>From</div>
            <input type="date" value={reportFrom} onChange={e => { setReportFrom(e.target.value); setReportPreset("custom"); }} style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>To</div>
            <input type="date" value={reportTo} onChange={e => { setReportTo(e.target.value); setReportPreset("custom"); }} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label={generatingPDF ? "Generating…" : "📄 Download PDF Report"} full onClick={downloadPDFReport} />
          <Btn label="Raw CSV" color={T.t2} ghost onClick={downloadCSVReport} />
        </div>
      </Card>

      <Card accent={T.amber}>
        <Label sub="A separate, driver-friendly report for one day — name, contact, address, KG per product and order type, sorted by the time each order was logged so dispatch is clear">Accountant / Dispatch Report</Label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10, marginBottom: 14 }}>
          <div style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: 11, color: T.t2, marginBottom: 6, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}>Date</div>
            <input type="date" value={acctDate} onChange={e => setAcctDate(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={() => setAcctDate(todayISO())} style={{
            background: acctDate === todayISO() ? T.amber : "transparent",
            color: acctDate === todayISO() ? "#FFFFFF" : T.t2,
            border: `1px solid ${acctDate === todayISO() ? T.amber : T.border}`,
            borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: FONT, height: 44,
          }}>Today</button>
        </div>
        <Btn label={generatingAcctPDF ? "Generating…" : "🧾 Download Accountant Report"} full color={T.amber} onClick={downloadAccountantReport} />
        <div style={{ height: 10 }} />
        <div style={{ fontSize: 11, color: T.t3, marginBottom: 8 }}>Or a ruled order sheet — Regular vs New, side by side, with blank rows for sudden/walk-in orders to be filled in by hand:</div>
        <Btn label={generatingOrderSheet ? "Generating…" : "📋 Download Order Sheet"} full color={T.sky} onClick={downloadOrderSheet} />
      </Card>

      <Card id="orders-by-date-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <Label sub="Pick any date to view, edit or backfill that day's orders">Orders by Date</Label>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        </div>

        {dateOrders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", marginBottom: 14, borderRadius: 12, background: T.cardHigh, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.t3, letterSpacing: 0.3 }}>
              TOTAL FOR {formatDateReadable(filterDate).toUpperCase()}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Chip label={`${dateTotals.newCount} New`} color={T.accent} />
              <Chip label={`${dateTotals.regularCount} Regular`} color={T.indigo} />
              {dateTotals.sampleCount > 0 && <Chip label={`${dateTotals.sampleCount} Sample`} color={T.orange} />}
              <Chip label={`${dateTotals.kgs.toLocaleString("en-IN", { maximumFractionDigits: 1 })} KG`} color={T.amber} />
              <Chip label={`₹${Math.round(dateTotals.revenue).toLocaleString("en-IN")}`} color={T.emerald} />
            </div>
            {dateTotalsByProduct.length > 0 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: T.t3, marginTop: 2 }}>
                {dateTotalsByProduct.map(p => (
                  <span key={p.name}>{p.name}: {p.kgs.toLocaleString("en-IN", { maximumFractionDigits: 1 })} KG · ₹{Math.round(p.revenue).toLocaleString("en-IN")}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {dateOrders.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 12px", color: T.t3, fontSize: 12 }}>
            No orders logged for {formatDateReadable(filterDate)} yet.
          </div>
        )}

        {dateOrders.map(o => {
          const cancelled = o.status === "Cancelled";
          return (
            <div key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 0", borderBottom: `1px solid ${T.border}`, opacity: cancelled ? 0.6 : 1 }}>
              <div style={{
                width:38, height:38, borderRadius:11, flexShrink:0, marginTop:1,
                background: orderTypeColor(o, T)+"22",
                border:`1px solid ${orderTypeColor(o, T)}44`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:14, fontWeight:800, color: orderTypeColor(o, T),
              }}>{(o.customer || "?").trim().charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{o.customer}</div>
                    <div style={{ fontSize:11, color:T.t3, marginTop:2, fontWeight:500 }}>
                      {[o.area, o.telecaller].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                    <span style={{ fontSize:11, color:T.t3, fontWeight:600, whiteSpace:"nowrap" }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" }) : ""}
                    </span>
                    <span style={{ color:T.t4, fontSize:14 }}>›</span>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Chip label={orderTypeLabel(o)} color={orderTypeColor(o, T)} />
                  {orderLineItems(o).map((i, idx) => (
                    <Chip key={idx} label={`${i.product}: ${i.kgs} KG`} color={T.sky} />
                  ))}
                  <Chip label={`₹${(o.amount || 0).toLocaleString("en-IN")}`} color={T.emerald} />
                  {cancelled && <Chip label={`Cancelled · ${o.cancelReason || "—"}`} color={T.rose} />}
                </div>
                {cancelled && o.cancelRemarks && (
                  <div style={{ fontSize: 11, color: T.t3, marginTop: 6 }}>Note: {o.cancelRemarks}</div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <Btn label="Edit" color={T.sky} ghost small onClick={() => openEdit(o)} />
                  {!cancelled
                    ? <Btn label="Customer Stopped / Cancel" color={T.rose} ghost small onClick={() => openCancel(o)} />
                    : <Btn label="Reactivate" color={T.emerald} ghost small onClick={() => reactivate(o)} />}
                  <Btn label="🗑️ Delete" color={T.rose} ghost small onClick={() => deleteOrder(o)} />
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {!embedded && (
        <Card id="daily-summary-section">
          <Label sub="New vs regular conversions, total KGs and revenue, day by day">Daily Summary</Label>
          {summaryRows.length === 0 && (
            <div style={{ textAlign: "center", padding: "16px", color: T.t3, fontSize: 12 }}>No orders logged yet.</div>
          )}
          {summaryRows.map(([date, s]) => (
            <div key={date} style={{ padding: "12px 0", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.t1, minWidth: 100 }}>{formatDateReadable(date)}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <Chip label={`${s.newCount} NEW`} color={T.accent} small />
                <Chip label={`${s.regularCount} REGULAR`} color={T.sky} small />
                {s.sampleCount > 0 && <Chip label={`${s.sampleCount} SAMPLE`} color={T.orange} small />}
                <Chip label={`${Math.round(s.kgs)} KG`} color={T.amber} small />
                <Chip label={`₹${Math.round(s.revenue).toLocaleString("en-IN")}`} color={T.emerald} small />
                <span style={{ color:T.t4, fontSize:14, marginLeft:4 }}>›</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {cancelledOrders.length > 0 && (
        <Card>
          <Label sub="Customers who stopped buying — grouped by reason">Cancelled / Stopped Customers</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {cancelReasonCounts.map(c => (
              <Chip key={c.reason} label={`${c.reason}: ${c.count}`} color={c.reason === "Delivery Issue" ? T.orange : c.reason === "Quality Issue" ? T.rose : T.t2} />
            ))}
          </div>
          {cancelledOrders.slice(0, 20).map(o => (
            <div key={o.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.t1 }}>{o.customer}</div>
                  <div style={{ fontSize: 11, color: T.t3, marginTop: 2 }}>{formatDateReadable(o.date)} · {o.area || "—"}</div>
                </div>
                <Chip label={o.cancelReason || "Other"} color={T.rose} small />
              </div>
              {o.cancelRemarks && <div style={{ fontSize: 11, color: T.t3, marginTop: 4 }}>{o.cancelRemarks}</div>}
            </div>
          ))}
        </Card>
      )}

      <Sheet open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? "Edit Order" : "Log Order"}>
        <Field label="Order Date *" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        <Dropdown label="Customer *" value={customerPick} onChange={e => pickCustomer(e.target.value)} options={customerOptions} />
        {customerPick === NEW_CUSTOMER_OPTION && (
          <Field label="New Customer Name *" value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} placeholder="e.g. Ganesh Stores" />
        )}
        <Field label="Area" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="e.g. Ambattur" />
        <Field label="Contact Number" type="tel" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="e.g. 9876543210" />
        <Field label="Delivery Address (full address)" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Door no., street, landmark — for the driver" />
        <Field label="Google Maps Link (optional)" value={form.mapLink} onChange={e => setForm({ ...form, mapLink: e.target.value })} placeholder="Paste a Google Maps share link" />
        <Field label="Customer Delivery Time" type="time" value={form.deliveryTime} onChange={e => setForm({ ...form, deliveryTime: e.target.value })} />
        <div style={{ fontSize: 10.5, color: T.t3, marginTop: -8, marginBottom: 14 }}>Leave blank to use the time this order was logged. Setting this controls the order shown in the Accountant/Dispatch Report.</div>
        <Dropdown label="Order Type" value={form.orderType} onChange={e => setForm({ ...form, orderType: e.target.value, sampleType: "Free", amountMode: "Auto", manualAmount: "" })} options={ORDER_TYPES} />
        {form.orderType === "Sample" && (
          <>
            <Dropdown label="Sample Type" value={form.sampleType} onChange={e => setForm({ ...form, sampleType: e.target.value, amountMode: "Auto", manualAmount: "" })} options={SAMPLE_TYPES} />
            {form.sampleType === "Free" ? (
              <div style={{ fontSize: 11, color: T.orange, marginTop: -8, marginBottom: 14 }}>Free sample — no charge to customer.</div>
            ) : (
              <>
                <Dropdown label="Amount Mode" value={form.amountMode} onChange={e => setForm({ ...form, amountMode: e.target.value })} options={AMOUNT_MODES} />
                <div style={{ fontSize: 11, color: T.t3, marginTop: -8, marginBottom: 14 }}>
                  {form.amountMode === "Auto" ? "Auto: calculated at ₹/KG rate below." : "Manual: enter a custom amount — useful when there's an extra delivery cost."}
                </div>
                {form.amountMode === "Manual" && (
                  <Field label="Manual Amount (₹)" type="number" value={form.manualAmount} onChange={e => setForm({ ...form, manualAmount: e.target.value })} placeholder="e.g. 50" />
                )}
              </>
            )}
          </>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: T.t3, letterSpacing: 0.3, marginBottom: 8 }}>PRODUCTS · enter KG for each you're logging</div>
        {form.items.map((item, idx) => (
          <Field
            key={item.product}
            label={`${item.product} (₹${rateForProduct(item.product)}/KG)`}
            type="number"
            value={item.kgs}
            onChange={e => {
              const items = form.items.map((it, i) => i === idx ? { ...it, kgs: e.target.value } : it);
              setForm({ ...form, items });
            }}
            placeholder="e.g. 10"
          />
        ))}
        <Field label="Telecaller" value={form.telecaller} onChange={e => setForm({ ...form, telecaller: e.target.value })} placeholder="Your name" />
        <div style={{ fontSize: 12, color: T.t2, marginBottom: 14 }}>
          {form.items.filter(i => parseFloat(i.kgs) > 0).map(i => (
            <div key={i.product} style={{ color: T.t3 }}>{i.product}: {i.kgs} KG × ₹{rateForProduct(i.product)} = ₹{Math.round((parseFloat(i.kgs) || 0) * rateForProduct(i.product)).toLocaleString("en-IN")}</div>
          ))}
          <div style={{ marginTop: 4 }}>
            Total Amount: <span style={{ color: T.emerald, fontWeight: 700 }}>
              ₹{(form.orderType === "Sample"
                  ? sampleAmount(form, form.items.reduce((a, i) => a + Math.round((parseFloat(i.kgs) || 0) * rateForProduct(i.product)), 0))
                  : form.items.reduce((a, i) => a + Math.round((parseFloat(i.kgs) || 0) * rateForProduct(i.product)), 0)
                ).toLocaleString("en-IN")}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Cancel" color={T.t2} ghost full onClick={() => { setShowForm(false); setEditingId(null); }} />
          <Btn label={editingId ? "Save Changes" : "Log Order"} full onClick={saveOrder} />
        </div>
      </Sheet>

      <Sheet open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Customer Stopped Buying">
        {cancelTarget && (
          <div style={{ fontSize: 12, color: T.t2, marginBottom: 14 }}>
            {cancelTarget.customer} · {formatDateReadable(cancelTarget.date)} · {cancelTarget.kgs} KG
          </div>
        )}
        <Dropdown label="Reason for cancellation" value={cancelForm.reason} onChange={e => setCancelForm({ ...cancelForm, reason: e.target.value })} options={CANCEL_REASONS} />
        <Field
          label={cancelForm.reason === "Other" ? "Reason (required) *" : "Remarks (optional)"}
          value={cancelForm.remarks}
          onChange={e => setCancelForm({ ...cancelForm, remarks: e.target.value })}
          placeholder={cancelForm.reason === "Other" ? "Please describe the reason" : "Any extra detail"}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Back" color={T.t2} ghost full onClick={() => setCancelTarget(null)} />
          <Btn label="Confirm Cancel" color={T.rose} full onClick={confirmCancel} disabled={cancelForm.reason === "Other" && !cancelForm.remarks.trim()} />
        </div>
      </Sheet>
    </div>
  );
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────
function Expenses() {
  const [expenses, setExpenses, expensesSyncStatus] = useSheetSynced("expenses", "expenses", INITIAL_EXPENSES);
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState("All");
  const [newExp, setNewExp] = useState({ category:"", amount:"", type:"Marketing", subtype:"Facebook", date: todayISO() });

  const typeColor = { Marketing:T.indigo, Delivery:T.amber, Sample:T.accent, Employee:T.sky };
  const filtered = expenses.filter(e => filterType==="All" || e.type===filterType);
  const totals = Object.fromEntries(["Marketing","Delivery","Sample","Employee"].map(t => [t, expenses.filter(e => e.type===t).reduce((a,b) => a+b.amount,0)]));
  const grand = Object.values(totals).reduce((a,b) => a+b, 0);

  const addExpense = () => {
    if (!newExp.category || !newExp.amount) return;
    setExpenses([{ ...newExp, id:expenses.length+1, amount:parseInt(newExp.amount), date: newExp.date || todayISO() }, ...expenses]);
    setShowAdd(false);
    setNewExp({ category:"", amount:"", type:"Marketing", subtype:"Facebook", date: todayISO() });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        {Object.entries(totals).map(([type,val]) => (
          <KPI key={type} label={type} value={val} unit="₹" color={typeColor[type]}
            icon={type==="Marketing"?"📢":type==="Delivery"?"🚚":type==="Sample"?"🧪":"👥"} />
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <SyncBadge status={expensesSyncStatus} />
      </div>

      <Card>
        <Label sub={`₹${grand.toLocaleString("en-IN")} total`}>Expense Distribution</Label>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <Donut segments={Object.entries(totals).map(([k,v]) => ({ label:k, value:v, color:typeColor[k] }))}
            size={110} centerLabel={"₹"+(grand/1000).toFixed(0)+"K"} centerSub="Total" />
          <div style={{ flex:1 }}>
            {Object.entries(totals).map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:7, height:7, borderRadius:2, background:typeColor[k] }} />
                  <span style={{ fontSize:12, color:T.t2, fontWeight:500 }}>{k}</span>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:typeColor[k] }}>₹{v.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display:"flex", gap:7 }}>
        {["All","Marketing","Delivery","Sample","Employee"].map(t => {
          const active = filterType===t;
          const col = typeColor[t] || T.accent;
          return (
            <button key={t} onClick={() => setFilterType(t)}
              style={{
                flex:1, padding:"7px 3px", borderRadius:9, fontSize:10, fontWeight:700,
                border:`1px solid ${active ? col : T.border}`,
                background: active ? col+"1A" : "transparent",
                color: active ? col : T.t2, cursor:"pointer", fontFamily:FONT,
              }}>{t}</button>
          );
        })}
      </div>

      <button onClick={() => setShowAdd(true)} style={{
        background:T.indigo+"18", border:`1px solid ${T.indigo}33`,
        borderRadius:14, color:T.indigo, padding:13,
        fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:FONT,
      }}>+ Add Expense</button>

      <Card>
        <Label sub={`${filtered.length} entries`}>Expense Log</Label>
        {filtered.map(e => (
          <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:T.t1 }}>{e.category}</div>
              <div style={{ fontSize:11, color:T.t3, marginTop:2, fontWeight:500 }}>{/^\d{4}-\d{2}-\d{2}$/.test(e.date || "") ? formatDateReadable(e.date) : (e.date || "—")}</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <Chip label={e.type} color={typeColor[e.type]} />
              <span style={{ fontSize:14, fontWeight:800, color:T.rose }}>₹{e.amount.toLocaleString("en-IN")}</span>
            </div>
          </div>
        ))}
      </Card>

      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Add Expense">
        <Field label="Description" value={newExp.category} onChange={e => setNewExp({...newExp,category:e.target.value})} placeholder="e.g. Facebook Ads — June Week 3" />
        <Field label="Date" type="date" value={newExp.date} onChange={e => setNewExp({...newExp,date:e.target.value})} />
        <Field label="Amount (₹)" value={newExp.amount} onChange={e => setNewExp({...newExp,amount:e.target.value})} type="number" placeholder="0" />
        <Dropdown label="Category" value={newExp.type} onChange={e => setNewExp({...newExp,type:e.target.value})} options={["Marketing","Delivery","Sample","Employee"]} />
        <div style={{ display:"flex", gap:10 }}>
          <Btn label="Cancel" color={T.t2} ghost full onClick={() => setShowAdd(false)} />
          <Btn label="Add" full onClick={addExpense} />
        </div>
      </Sheet>
    </div>
  );
}

// ─── MARKETING ────────────────────────────────────────────────────────────
function Marketing() {
  const [tab, setTab] = useState("overview");
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name:"", platform:"Facebook", objective:"Lead Generation", budget:"", budgetType:"Daily" });

  const totalLeads = MARKETING_SOURCES.reduce((a,b) => a+b.leads, 0);
  const totalSpend = MARKETING_SOURCES.reduce((a,b) => a+b.spend, 0);
  const totalConverted = MARKETING_SOURCES.reduce((a,b) => a+b.converted, 0);
  const metaLeads = META_CAMPAIGNS.reduce((a,b) => a+b.leads, 0);
  const metaSpend = META_CAMPAIGNS.reduce((a,b) => a+b.spend, 0);
  const metaActive = META_CAMPAIGNS.filter(c => c.status==="Active").length;
  const platformIcon = { Facebook:"f", Instagram:"▶", WhatsApp:"W" };
  const statusColor = { Active:T.emerald, Paused:T.amber, Ended:T.t2 };
  const tabs = [{ id:"overview",label:"Overview" },{ id:"meta",label:"Meta Ads" },{ id:"channels",label:"Channels" },{ id:"roi",label:"ROI" }];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", background:T.surface, borderRadius:12, padding:3, gap:2 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:"7px 4px", borderRadius:9, fontSize:11, fontWeight:700,
            background: tab===t.id ? T.card : "transparent",
            color: tab===t.id ? T.accent : T.t3,
            border: tab===t.id ? `1px solid ${T.border}` : "1px solid transparent",
            cursor:"pointer", fontFamily:FONT, letterSpacing:"-0.01em",
          }}>{t.label}</button>
        ))}
      </div>

      {tab==="overview" && <>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
          <KPI label="Total leads"  value={totalLeads}  color={T.accent}  icon="📋" />
          <KPI label="Ad spend"     value={totalSpend}  unit="₹" color={T.rose}    icon="💸" />
          <KPI label="Converted"    value={totalConverted} color={T.emerald} icon="✅" />
          <KPI label="Avg CPL"      value={`₹${Math.round(totalSpend/totalLeads)}`} color={T.amber} icon="🎯" />
        </div>
        <div style={{
          background:`linear-gradient(135deg, rgba(24,119,242,0.12), rgba(225,48,108,0.08))`,
          border:`1px solid rgba(24,119,242,0.3)`, borderRadius:18, padding:"14px 16px",
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"#1877F2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:900, color:"white" }}>f</div>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:T.t1 }}>Meta Ads Manager</div>
                <div style={{ fontSize:10, color:T.emerald, fontWeight:600 }}>Connected · Act #160703</div>
              </div>
            </div>
            <button onClick={() => setTab("meta")} style={{ background:"rgba(24,119,242,0.15)", border:"1px solid rgba(24,119,242,0.3)", borderRadius:10, color:"#1877F2", padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>Open →</button>
          </div>
          <div style={{ display:"flex" }}>
            {[{ label:"Active", value:metaActive, color:T.emerald },{ label:"Leads", value:metaLeads, color:"#1877F2" },{ label:"Spend", value:`₹${(metaSpend/1000).toFixed(1)}K`, color:T.rose }].map((s,i) => (
              <div key={i} style={{ flex:1, textAlign:"center", borderRight:i<2?`1px solid ${T.border}`:"none" }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.color, letterSpacing:"-0.02em" }}>{s.value}</div>
                <div style={{ fontSize:10, color:T.t3, fontWeight:500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <Card>
          <Label sub="By channel">Channel Summary</Label>
          {MARKETING_SOURCES.slice(0,4).map((s,i) => {
            const conv = Math.round((s.converted/s.leads)*100);
            return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:s.color }} />
                  <span style={{ fontSize:13, fontWeight:600, color:T.t1 }}>{s.source}</span>
                </div>
                <div style={{ display:"flex", gap:12 }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:800, color:T.accent }}>{s.leads}</div>
                    <div style={{ fontSize:9, color:T.t3 }}>Leads</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:800, color:T.emerald }}>{conv}%</div>
                    <div style={{ fontSize:9, color:T.t3 }}>Conv.</div>
                  </div>
                  {s.spend>0 ? <Chip label={`₹${s.spend.toLocaleString("en-IN")}`} color={T.rose} small /> : <Chip label="Organic" color={T.emerald} small />}
                </div>
              </div>
            );
          })}
        </Card>
      </>}

      {tab==="meta" && <>
        <div style={{ background:`linear-gradient(135deg, rgba(24,119,242,0.14), rgba(225,48,108,0.1))`, border:`1px solid rgba(24,119,242,0.3)`, borderRadius:18, padding:"16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:"#1877F2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:900, color:"white", flexShrink:0 }}>f</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:800, color:T.t1 }}>Sridhi Ventures</div>
              <div style={{ fontSize:11, color:T.t2 }}>Business Portfolio</div>
              <div style={{ fontSize:10, color:T.emerald, fontWeight:600, marginTop:1 }}>Ad Account #120215709476160703</div>
            </div>
            <Chip label="Active" color={T.emerald} />
          </div>
          <div style={{ marginBottom:6 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:5 }}>
              <span style={{ color:T.t2, fontWeight:500 }}>Monthly Spend</span>
              <span style={{ color:T.t1, fontWeight:700 }}>₹15,500 / ₹20,000</span>
            </div>
            <div style={{ height:5, background:"rgba(0,0,0,0.3)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ width:"77.5%", height:"100%", borderRadius:3, background:`linear-gradient(90deg, #1877F2, #E1306C)` }} />
            </div>
          </div>
          <div style={{ fontSize:10, color:T.t3, fontWeight:500 }}>Daily budget: ₹1,100 · Billing threshold: ₹20,000</div>
        </div>

        <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
          <KPI label="Active campaigns" value={metaActive}  color={T.emerald} icon="📡" />
          <KPI label="Total leads"      value={metaLeads}   color={"#1877F2"} icon="📋" />
          <KPI label="Total spend"      value={metaSpend}  unit="₹" color={T.rose} icon="💸" />
          <KPI label="Avg CPL"          value={`₹${Math.round(metaSpend/metaLeads)}`} color={T.amber} icon="🎯" />
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>Campaigns</div>
          <button onClick={() => setShowNewCampaign(true)} style={{ background:"rgba(24,119,242,0.14)", border:"1px solid rgba(24,119,242,0.3)", borderRadius:10, color:"#1877F2", padding:"6px 14px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>+ New</button>
        </div>

        {META_CAMPAIGNS.map(c => (
          <div key={c.id} onClick={() => setSelectedCampaign(selectedCampaign?.id===c.id ? null : c)}
            style={{ background:T.card, border:`1px solid ${selectedCampaign?.id===c.id ? c.color+"44" : T.border}`, borderRadius:18, padding:16, cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
              <div style={{ flex:1, paddingRight:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                  <div style={{ width:20, height:20, borderRadius:5, background:c.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:900, color:"white", flexShrink:0 }}>{platformIcon[c.platform]||"•"}</div>
                  <span style={{ fontSize:10, color:c.color, fontWeight:700 }}>{c.platform} · {c.objective}</span>
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:T.t1, lineHeight:1.3 }}>{c.name}</div>
              </div>
              <Chip label={c.status} color={statusColor[c.status]} />
            </div>
            <div style={{ display:"flex", gap:0, background:T.surface, borderRadius:10, overflow:"hidden", marginBottom:10 }}>
              {[{ label:"Reach", value:(c.reach/1000).toFixed(0)+"K", color:T.sky },{ label:"Clicks", value:c.clicks.toLocaleString("en-IN"), color:T.indigo },{ label:"Leads", value:c.leads, color:T.emerald },{ label:"CPL", value:`₹${c.cpl}`, color:T.amber }].map((m,i) => (
                <div key={i} style={{ flex:1, padding:"9px 4px", textAlign:"center", borderRight:i<3?`1px solid ${T.border}`:"none" }}>
                  <div style={{ fontSize:14, fontWeight:800, color:m.color }}>{m.value}</div>
                  <div style={{ fontSize:9, color:T.t3, fontWeight:500 }}>{m.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:T.t3, fontWeight:500 }}>
              <span>Spend: <span style={{ color:T.rose, fontWeight:700 }}>₹{c.spend.toLocaleString("en-IN")}</span></span>
              <span>Budget: ₹{c.budget}/day</span>
              <span>Since {c.startDate}</span>
            </div>
            {selectedCampaign?.id===c.id && (
              <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
                  {[["Impressions",c.impressions.toLocaleString("en-IN")],["CPM",`₹${c.cpm}`],["CPC",`₹${c.cpc}`],["CTR",`${((c.clicks/c.impressions)*100).toFixed(2)}%`],["Lead Rate",`${((c.leads/c.clicks)*100).toFixed(1)}%`]].map(([k,v]) => (
                    <div key={k} style={{ background:T.surface, borderRadius:9, padding:"7px 10px", border:`1px solid ${T.border}` }}>
                      <div style={{ fontSize:13, fontWeight:800, color:T.t1 }}>{v}</div>
                      <div style={{ fontSize:9, color:T.t3, fontWeight:500 }}>{k}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn label={c.status==="Active"?"Pause":"Resume"} color={c.status==="Active"?T.amber:T.emerald} ghost full onClick={() => {}} />
                  <Btn label="View in Meta" color={"#1877F2"} ghost full onClick={() => {}} />
                </div>
              </div>
            )}
          </div>
        ))}
      </>}

      {tab==="channels" && (
        <Card>
          <Label sub="Cost per lead and conversion by channel">All Channels</Label>
          {MARKETING_SOURCES.map((s,i) => {
            const cpl = s.spend>0 ? Math.round(s.spend/s.leads) : 0;
            const conv = Math.round((s.converted/s.leads)*100);
            return (
              <div key={i} style={{ padding:"12px 0", borderBottom:i<MARKETING_SOURCES.length-1?`1px solid ${T.border}`:"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:9, height:9, borderRadius:"50%", background:s.color }} />
                    <span style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{s.source}</span>
                  </div>
                  {s.spend>0 ? <Chip label={`₹${s.spend.toLocaleString("en-IN")}`} color={T.rose} /> : <Chip label="Organic" color={T.emerald} />}
                </div>
                <div style={{ display:"flex", gap:16, marginBottom:7 }}>
                  {[["Leads",s.leads,T.accent],["Conv.",s.converted,T.emerald],[`${conv}%`,"Rate",T.indigo],[cpl===0?"Free":`₹${cpl}`,"CPL",T.amber]].map(([v,l,c]) => (
                    <div key={l} style={{ textAlign:"center" }}>
                      <div style={{ fontSize:15, fontWeight:800, color:c }}>{v}</div>
                      <div style={{ fontSize:9, color:T.t3 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height:4, background:T.border, borderRadius:3, overflow:"hidden" }}>
                  <div style={{ width:`${(s.leads/Math.max(...MARKETING_SOURCES.map(x=>x.leads)))*100}%`, height:"100%", background:s.color, borderRadius:3 }} />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {tab==="roi" && <>
        <Card>
          <Label sub="Revenue vs ad spend">ROI by Channel</Label>
          {MARKETING_SOURCES.filter(s => s.spend>0).map((s,i) => {
            const revenue = s.converted*6000;
            const roi = Math.round(((revenue-s.spend)/s.spend)*100);
            return (
              <div key={i} style={{ padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:s.color }} />
                    <span style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{s.source}</span>
                  </div>
                  <Chip label={roi>0?`+${roi}% ROI`:`${roi}% ROI`} color={roi>300?T.emerald:roi>0?T.amber:T.rose} />
                </div>
                <div style={{ display:"flex", gap:0, background:T.surface, borderRadius:10, overflow:"hidden" }}>
                  {[["Spend",`₹${s.spend.toLocaleString("en-IN")}`,T.rose],["Revenue",`₹${revenue.toLocaleString("en-IN")}`,T.emerald],["Profit",`₹${(revenue-s.spend).toLocaleString("en-IN")}`,T.accent]].map(([l,v,c],idx) => (
                    <div key={l} style={{ flex:1, padding:"9px 4px", textAlign:"center", borderRight:idx<2?`1px solid ${T.border}`:"none" }}>
                      <div style={{ fontSize:13, fontWeight:800, color:c }}>{v}</div>
                      <div style={{ fontSize:9, color:T.t3 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
        <Card>
          <Label>Top Performers</Label>
          {[{ label:"Best CPL", value:"WhatsApp (₹44)", color:"#25D366" },{ label:"Best Conversion", value:"Referral (43%)", color:T.accent },{ label:"Most Leads", value:"Facebook (78)", color:"#1877F2" },{ label:"Best ROI", value:"Referral (Organic)", color:T.emerald }].map((r,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:i<3?`1px solid ${T.border}`:"none" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:T.t3, fontWeight:500 }}>{r.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:r.color, marginTop:2 }}>{r.value}</div>
              </div>
            </div>
          ))}
        </Card>
      </>}

      <Sheet open={showNewCampaign} onClose={() => setShowNewCampaign(false)} title="New Campaign">
        <Field label="Campaign Name" value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign,name:e.target.value})} placeholder="e.g. Dosa Batter — Koramangala Restaurants" />
        <Dropdown label="Platform" value={newCampaign.platform} onChange={e => setNewCampaign({...newCampaign,platform:e.target.value})} options={["Facebook","Instagram","WhatsApp"]} />
        <Dropdown label="Objective" value={newCampaign.objective} onChange={e => setNewCampaign({...newCampaign,objective:e.target.value})} options={["Lead Generation","Conversions","Messages","Reach","Traffic"]} />
        <Field label="Daily Budget (₹)" value={newCampaign.budget} onChange={e => setNewCampaign({...newCampaign,budget:e.target.value})} type="number" placeholder="500" />
        <div style={{ display:"flex", gap:10 }}>
          <Btn label="Cancel" color={T.t2} ghost full onClick={() => setShowNewCampaign(false)} />
          <Btn label="Create Campaign" full onClick={() => setShowNewCampaign(false)} />
        </div>
      </Sheet>
    </div>
  );
}

// ─── REPORTS ──────────────────────────────────────────────────────────────
function Reports() {
  const [leads] = useSheetSynced("leads","leads",[]);
  const [expenses] = useSheetSynced("expenses","expenses",[]);
  const [samples] = useSheetSynced("samples","samples",[]);
  const [repeatCustomers] = useSheetSynced("repeatCustomers","repeatCustomers",[]);
  const [exporting, setExporting] = useState(false);
  const [leadsPreset, setLeadsPreset] = useState("all");

  // ── Leads date-range filter for export (Today / This Week / This Month / All Time) ──
  const leadsRangeStart = (() => {
    const now = new Date();
    if (leadsPreset === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); }
    if (leadsPreset === "week") {
      const d = new Date(now); const day = d.getDay(); const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff); d.setHours(0,0,0,0); return d.getTime();
    }
    if (leadsPreset === "month") { return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
    return null; // "all"
  })();
  const filteredLeads = leadsRangeStart == null ? leads : leads.filter(l => (l.createdAt || 0) >= leadsRangeStart);
  const leadsPresetLabel = { today: "Today's", week: "This Week's", month: "This Month's", all: "All-Time" }[leadsPreset];

  // ── Compute real metrics from data ──
  const totalLeads = leads.length;
  const activeCustomers = leads.filter(l => l.stage === "Active Customer").length;
  const ordersReceived = leads.filter(l => l.stage === "Order Received").length;
  const converted = leads.filter(l => ["Order Received","Active Customer","Repeat Order Follow-up"].includes(l.stage)).length;
  const convRate = totalLeads > 0 ? Math.round((converted/totalLeads)*100) : 0;
  const totalExpenses = expenses.reduce((a,b) => a+(Number(b.amount)||0), 0);
  const porterExp = expenses.filter(e=>e.subtype==="Porter").reduce((a,b)=>a+(Number(b.amount)||0),0);
  const marketingExp = expenses.filter(e=>e.type==="Marketing").reduce((a,b)=>a+(Number(b.amount)||0),0);
  const samplesCost = expenses.filter(e=>e.type==="Sample").reduce((a,b)=>a+(Number(b.amount)||0),0);
  const samplesDelivered = samples.filter(s=>s.status==="Delivered").length;
  const samplesConverted = samples.filter(s=>s.converted).length;
  const stageCount = stage => leads.filter(l=>l.stage===stage).length;
  const today = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});

  // ── PDF Generator ──
  const downloadPDF = () => {
    setExporting(true);
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; background:#fff; color:#1a1a2e; padding:40px; }
  .header { background:linear-gradient(135deg,#060B16,#0F1C33); color:white; padding:32px; border-radius:16px; margin-bottom:28px; display:flex; justify-content:space-between; align-items:center; }
  .logo { font-size:28px; font-weight:900; color:#00C9A7; letter-spacing:-1px; }
  .sub { font-size:12px; color:#7B9DC4; margin-top:4px; text-transform:uppercase; letter-spacing:2px; }
  .date { font-size:12px; color:#7B9DC4; text-align:right; }
  .section { margin-bottom:24px; }
  .section-title { font-size:14px; font-weight:700; color:#060B16; background:#f0f6ff; padding:8px 14px; border-radius:8px; border-left:4px solid #00C9A7; margin-bottom:14px; text-transform:uppercase; letter-spacing:1px; }
  .kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px; }
  .kpi { background:#f8faff; border:1px solid #e0eaff; border-radius:12px; padding:16px; text-align:center; }
  .kpi-val { font-size:22px; font-weight:900; color:#00C9A7; }
  .kpi-val.red { color:#F43F5E; }
  .kpi-val.blue { color:#818CF8; }
  .kpi-val.amber { color:#F59E0B; }
  .kpi-label { font-size:10px; color:#666; margin-top:4px; font-weight:600; text-transform:uppercase; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { background:#060B16; color:#00C9A7; padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
  td { padding:9px 12px; border-bottom:1px solid #f0f0f0; }
  tr:nth-child(even) td { background:#f8faff; }
  .badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; }
  .badge-green { background:#d1fae5; color:#065f46; }
  .badge-amber { background:#fef3c7; color:#92400e; }
  .badge-red { background:#fee2e2; color:#991b1b; }
  .footer { margin-top:32px; padding-top:16px; border-top:2px solid #00C9A7; display:flex; justify-content:space-between; color:#999; font-size:10px; }
  .highlight { color:#00C9A7; font-weight:700; }
  .bar-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .bar-label { width:120px; font-size:11px; color:#444; flex-shrink:0; }
  .bar-bg { flex:1; height:8px; background:#f0f0f0; border-radius:4px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:4px; }
  .bar-val { width:60px; font-size:11px; font-weight:700; text-align:right; color:#060B16; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="logo">⚡ Sridhi Ventures</div>
    <div class="sub">Business Operating System — ${leadsPresetLabel} Leads Report</div>
  </div>
  <div class="date">
    <div style="font-size:20px;font-weight:900;color:#00C9A7">${today}</div>
    <div style="margin-top:4px">Chennai · Food Distribution</div>
  </div>
</div>

<div class="section">
  <div class="section-title">📊 Key Metrics</div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${totalLeads}</div><div class="kpi-label">Total Leads</div></div>
    <div class="kpi"><div class="kpi-val blue">${activeCustomers}</div><div class="kpi-label">Active Customers</div></div>
    <div class="kpi"><div class="kpi-val">${convRate}%</div><div class="kpi-label">Conversion Rate</div></div>
    <div class="kpi"><div class="kpi-val amber">${samplesDelivered}</div><div class="kpi-label">Samples Delivered</div></div>
    <div class="kpi"><div class="kpi-val">${samplesConverted}</div><div class="kpi-label">Samples Converted</div></div>
    <div class="kpi"><div class="kpi-val red">₹${totalExpenses.toLocaleString("en-IN")}</div><div class="kpi-label">Total Expenses</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">🔄 Pipeline Breakdown</div>
  <table>
    <tr><th>Stage</th><th>Count</th><th>Status</th></tr>
    ${["New Lead","Contacted","Interested","Sample Requested","Sample Delivered","Positive Feedback","Negotiation","Order Received","Active Customer","Lost Customer"].map(s => {
      const count = stageCount(s);
      const badge = s==="Active Customer"||s==="Order Received" ? "badge-green" : s==="Lost Customer" ? "badge-red" : "badge-amber";
      return `<tr><td>${s}</td><td><strong>${count}</strong></td><td><span class="badge ${badge}">${count > 0 ? "Active" : "Empty"}</span></td></tr>`;
    }).join("")}
  </table>
</div>

<div class="section">
  <div class="section-title">💸 Expense Breakdown</div>
  <table>
    <tr><th>Category</th><th>Amount</th><th>Type</th></tr>
    ${expenses.slice(0,15).map(e => `<tr><td>${e.category||""}</td><td><strong>₹${Number(e.amount||0).toLocaleString("en-IN")}</strong></td><td>${e.type||""}</td></tr>`).join("")}
    ${expenses.length === 0 ? "<tr><td colspan='3' style='text-align:center;color:#999'>No expenses recorded</td></tr>" : ""}
    <tr style="background:#f0f6ff"><td><strong>TOTAL</strong></td><td><strong class="highlight">₹${totalExpenses.toLocaleString("en-IN")}</strong></td><td></td></tr>
  </table>
  <div style="margin-top:16px">
    <div class="bar-row"><div class="bar-label">Marketing</div><div class="bar-bg"><div class="bar-fill" style="width:${totalExpenses?Math.round(marketingExp/totalExpenses*100):0}%;background:#818CF8"></div></div><div class="bar-val">₹${marketingExp.toLocaleString("en-IN")}</div></div>
    <div class="bar-row"><div class="bar-label">Porter Delivery</div><div class="bar-bg"><div class="bar-fill" style="width:${totalExpenses?Math.round(porterExp/totalExpenses*100):0}%;background:#F59E0B"></div></div><div class="bar-val">₹${porterExp.toLocaleString("en-IN")}</div></div>
    <div class="bar-row"><div class="bar-label">Samples</div><div class="bar-bg"><div class="bar-fill" style="width:${totalExpenses?Math.round(samplesCost/totalExpenses*100):0}%;background:#00C9A7"></div></div><div class="bar-val">₹${samplesCost.toLocaleString("en-IN")}</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">👥 ${leadsPresetLabel} Leads (${filteredLeads.length})</div>
  <table>
    <tr><th>Name</th><th>Area</th><th>Stage</th><th>Telecaller</th></tr>
    ${filteredLeads.slice(0,50).map(l => `<tr><td><strong>${l.name||""}</strong></td><td>${l.area||""}</td><td>${l.stage||""}</td><td>${l.telecaller||""}</td></tr>`).join("")}
    ${filteredLeads.length === 0 ? `<tr><td colspan='4' style='text-align:center;color:#999'>No leads in this period</td></tr>` : ""}
  </table>
</div>

<div class="footer">
  <div>Generated by <strong>Sridhi Ventures BOS v3.0</strong></div>
  <div>Confidential · Internal Use Only</div>
  <div>${today}</div>
</div>

</body>
</html>`;

    const blob = new Blob([html], { type:"text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) {
      w.onload = () => { w.print(); };
    }
    setTimeout(() => { URL.revokeObjectURL(url); setExporting(false); }, 3000);
  };

  // ── CSV Export ──
  const downloadCSV = () => {
    setExporting(true);
    const rows = [
      ["Name","Contact","Business","Area","Stage","Source","Telecaller","Last Contact","Priority"],
      ...filteredLeads.map(l => [l.name,l.contact,l.business,l.area,l.stage,l.source,l.telecaller,l.lastContact,l.priority])
    ];
    const csv = rows.map(r => r.map(c => `"${c||""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sridhi-leads-${leadsPreset}-` + new Date().toISOString().slice(0,10) + ".csv";
    a.click();
    setTimeout(() => setExporting(false), 1000);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <Card accent={T.emerald}>
        <Label sub="Live data from Google Sheets">Business Summary</Label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:8 }}>
          {[
            ["Leads", totalLeads, T.amber],
            ["Customers", activeCustomers, T.emerald],
            ["Conv %", convRate+"%", T.accent],
            ["Samples", samplesDelivered, T.sky],
            ["Converted", samplesConverted, T.indigo],
            ["Expenses", "₹"+totalExpenses.toLocaleString("en-IN"), T.rose],
          ].map(([l,v,c]) => (
            <div key={l} style={{ textAlign:"center", background:T.surface, borderRadius:12, padding:"12px 4px" }}>
              <div style={{ fontSize:18, fontWeight:900, color:c }}>{v}</div>
              <div style={{ fontSize:10, color:T.t3, marginTop:3, fontWeight:600 }}>{l}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Label>Pipeline Status</Label>
        {["New Lead","Contacted","Interested","Sample Requested","Order Received","Active Customer","Lost Customer"].map(s => {
          const count = stageCount(s);
          const color = s==="Active Customer"||s==="Order Received" ? T.emerald : s==="Lost Customer" ? T.rose : T.sky;
          return (
            <div key={s} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
              <span style={{ fontSize:12, color:T.t2 }}>{s}</span>
              <span style={{ fontSize:13, fontWeight:800, color }}>{count}</span>
            </div>
          );
        })}
      </Card>

      <Card>
        <Label>Expense Summary</Label>
        {[["Marketing", marketingExp, T.indigo],["Porter Delivery", porterExp, T.amber],["Samples", samplesCost, T.accent],["Total", totalExpenses, T.rose]].map(([l,v,c]) => (
          <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${T.border}` }}>
            <span style={{ fontSize:12, color:T.t2, fontWeight: l==="Total"?700:400 }}>{l}</span>
            <span style={{ fontSize:13, fontWeight:800, color:c }}>₹{v.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </Card>

      <Card>
        <Label sub={`${filteredLeads.length} lead${filteredLeads.length === 1 ? "" : "s"} in this period`}>Download Leads Report</Label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10, marginBottom:14 }}>
          {[
            { id: "today", label: "📆 Today" },
            { id: "week",  label: "📈 This Week" },
            { id: "month", label: "🗓️ This Month" },
            { id: "all",   label: "🏆 All Time" },
          ].map(p => (
            <button key={p.id} onClick={() => setLeadsPreset(p.id)} style={{
              background: leadsPreset === p.id ? T.accent : "transparent",
              color: leadsPreset === p.id ? "#FFFFFF" : T.t2,
              border: `1px solid ${leadsPreset === p.id ? T.accent : T.border}`,
              borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT, transition: "background 0.12s, color 0.12s",
            }}>{p.label}</button>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={downloadPDF} disabled={exporting}
            style={{ background:"linear-gradient(135deg,#00C9A7,#10B981)", border:"none", borderRadius:14,
              color:"#FFFFFF", padding:"14px", fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:FONT,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {exporting ? "⏳ Generating..." : "📑 Download PDF Report"}
          </button>
          <button onClick={downloadCSV} disabled={exporting}
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14,
              color:T.t1, padding:"12px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            📄 Download Leads CSV
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── AI ASSISTANT ─────────────────────────────────────────────────────────
function AIAssistant() {
  const [leads] = useSheetSynced("leads","leads",[]);
  const [samples] = useSheetSynced("samples","samples",[]);
  const [expenses] = useSheetSynced("expenses","expenses",[]);
  const [repeatCustomers] = useSheetSynced("repeatCustomers","repeatCustomers",[]);
  const [messages, setMessages] = useState([
    { role:"assistant", content:"Hi! I'm your Sridhi Ventures AI. I can analyze your sales data, write call scripts, identify follow-up priorities, and give business insights. What would you like to know?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  const activeCustomers = leads.filter(l=>l.stage==="Active Customer").length;
  const callbackLeads = leads.filter(l=>l.stage==="Callback Requested");
  const sampleReqLeads = leads.filter(l=>l.stage==="Sample Requested");
  const negotiationLeads = leads.filter(l=>l.stage==="Negotiation");
  const pendingSamples = samples.filter(s=>s.status==="Pending");
  const dueToday = repeatCustomers.filter(c=>c.status==="Due Today");
  const totalExpenses = expenses.reduce((a,b)=>a+(Number(b.amount)||0),0);
  const converted2 = leads.filter(l=>["Order Received","Active Customer","Repeat Order Follow-up"].includes(l.stage)).length;
  const convRate2 = leads.length>0?Math.round(converted2/leads.length*100):0;
  const todayStr2 = new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  const CONTEXT = "You are an AI business assistant for Sridhi Ventures, a fresh dosa and idli batter distributor in Chennai, India. Answer questions using the LIVE data below. Be specific, use actual names." +
    "\n\nTODAY: " + todayStr2 +
    "\nTotal Leads: " + leads.length + " | Active Customers: " + activeCustomers + " | Conversion: " + convRate2 + "%" +
    "\nTotal Expenses: Rs." + totalExpenses.toLocaleString("en-IN") +
    "\n\nPENDING SAMPLES (" + pendingSamples.length + "):" +
    (pendingSamples.length ? "\n" + pendingSamples.map(s=>s.customer+" - "+s.qty+"KG "+s.type+(s.scheduledDate?" on "+s.scheduledDate:"")).join("\n") : " None") +
    "\n\nCALLBACK REQUESTED (" + callbackLeads.length + "):" +
    (callbackLeads.length ? "\n" + callbackLeads.slice(0,8).map(l=>l.name+" ("+l.contact+") - "+l.area).join("\n") : " None") +
    "\n\nSAMPLE REQUESTED (" + sampleReqLeads.length + "):" +
    (sampleReqLeads.length ? "\n" + sampleReqLeads.slice(0,8).map(l=>l.name+" - "+l.area).join("\n") : " None") +
    "\n\nNEGOTIATION (" + negotiationLeads.length + "):" +
    (negotiationLeads.length ? "\n" + negotiationLeads.slice(0,5).map(l=>l.name+" - "+l.remarks?.slice(-1)[0]||"").join("\n") : " None") +
    "\n\nDUE TODAY REPEAT ORDERS (" + dueToday.length + "):" +
    (dueToday.length ? "\n" + dueToday.map(c=>c.name+" - "+c.qty+"KG "+c.product).join("\n") : " None") +
    "\n\nALL LEADS (recent 15):\n" + leads.slice(0,15).map(l=>l.name+" | "+l.stage+" | "+l.telecaller+" | "+l.contact).join("\n") +
    "\n\nINSTRUCTIONS: Answer in English. Be specific and actionable. For who to call today - prioritize Callback Requested, then Sample Requested, then Negotiation. Keep answers concise.";

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role:"user", content:input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE ?? "";
      const groqKey = import.meta.env.VITE_GROQ_API_KEY ?? "";
      let text = "";
      // Try backend first, fallback to direct Groq
      try {
        const r = await fetch(API_BASE + "/api/ai", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ system:CONTEXT, messages:[...messages,userMsg].map(m=>({role:m.role,content:m.content})) }),
        });
        if (r.ok) {
          const d = await r.json();
          text = d.content?.map(b=>b.text||"").join("") || d.reply || "";
        }
      } catch(e) {}
      // Fallback: direct Groq
      if (!text && groqKey) {
        const r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method:"POST",
          headers:{ "Content-Type":"application/json", "Authorization":"Bearer " + groqKey },
          body:JSON.stringify({ model:"llama-3.3-70b-versatile", max_tokens:1000, messages:[{ role:"system", content:CONTEXT }, ...[...messages,userMsg].map(m=>({role:m.role,content:m.content}))] }),
        });
        const d2 = await r2.json();
        text = d2.choices?.[0]?.message?.content || "";
      }
      if (!text) text = "AI is not configured. Add ANTHROPIC_API_KEY or VITE_GROQ_API_KEY in Vercel dashboard.";
      setMessages(prev => [...prev, { role:"assistant", content:text }]);
    } catch {
      setMessages(prev => [...prev, { role:"assistant", content:"Connection error. Please check your network and try again." }]);
    }
    setLoading(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
  };

  const QUICK = ["Who should I call first today?","Write a script for a new restaurant lead","Which channel has best ROI?","How do I close Morning Star Bakery?","Tips to improve conversion rate"];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0, height:"calc(100vh - 180px)" }}>
      <div style={{
        background:`linear-gradient(135deg, ${T.accentSub}, rgba(129,140,248,0.1))`,
        border:`1px solid ${T.accentGlow}`, borderRadius:16, padding:"14px 16px", marginBottom:12,
      }}>
        <div style={{ fontSize:14, fontWeight:800, color:T.accent, letterSpacing:"-0.02em" }}>AI Business Assistant</div>
        <div style={{ fontSize:11, color:T.t2, marginTop:2, fontWeight:500 }}>Powered by Claude · Knows your live business data</div>
      </div>

      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:12 }}>
        {messages.map((m,i) => (
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{
              maxWidth:"86%", padding:"12px 15px",
              borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",
              background:m.role==="user" ? T.accent : T.card,
              color:m.role==="user" ? "#FFFFFF" : T.t1,
              border:m.role==="assistant"?`1px solid ${T.border}`:"none",
              fontSize:13, lineHeight:1.6, fontWeight:m.role==="user"?600:400,
            }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:"18px 18px 18px 4px", padding:"12px 16px", display:"flex", gap:5, alignItems:"center" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:T.accent, opacity:0.5, animation:"pulse 1.2s ease-in-out infinite", animationDelay:`${i*0.2}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length<=1 && (
        <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:10 }}>
          {QUICK.map((q,i) => (
            <button key={i} onClick={() => setInput(q)} style={{
              background:T.card, border:`1px solid ${T.border}`, borderRadius:20,
              color:T.t2, padding:"7px 13px", fontSize:11, fontWeight:600,
              cursor:"pointer", whiteSpace:"nowrap", fontFamily:FONT,
            }}>{q}</button>
          ))}
        </div>
      )}

      <div style={{ display:"flex", gap:8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==="Enter" && !e.shiftKey && send()}
          placeholder="Ask anything about your business…"
          style={{ ...inputStyle, flex:1 }} />
        <button onClick={send} disabled={loading || !input.trim()}
          style={{
            background: input.trim()&&!loading ? T.accent : T.border,
            color: input.trim()&&!loading ? "#FFFFFF" : T.t2,
            border:"none", borderRadius:12, width:42, height:42, flexShrink:0,
            fontWeight:800, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
          }}>→</button>
      </div>
    </div>
  );
}


// ─── WHATSAPP TEMPLATES ──────────────────────────────────────────────────────
const PIPELINE_STAGE_LIST = [
  "All Stages","New Lead","Contacted","Interested","Callback Requested",
  "Sample Requested","Assigned to Field Sales","Sample Delivered",
  "Feedback Pending","Positive Feedback","Negotiation","Order Received",
  "Repeat Order Follow-up","Active Customer","Lost Customer","Invalid Number",
];

const DEFAULT_TEMPLATES = [
  { id:1, name:"Introduction", stage:"New Lead", message:"Hi {customer_name}, I\'m calling from Sridhi Ventures, Chennai. We supply fresh dosa & idli batter to restaurants. Would you be interested in a free 3 KG trial? 🙏" },
  { id:2, name:"Sample Follow-up", stage:"Sample Requested", message:"Hello {customer_name} ji, your {product} sample is ready! Our executive {executive} will deliver it to {address} today. Please confirm your availability 🙏" },
  { id:3, name:"Feedback Request", stage:"Sample Delivered", message:"Namaste {customer_name} ji! Hope you enjoyed our {product} sample. Did it meet your quality expectations? We can offer {qty} KG/week at great prices 😊" },
  { id:4, name:"Order Confirmation", stage:"Order Received", message:"Thank you {customer_name} ji! 🎉 Your order of {qty} KG {product} is confirmed. We will deliver fresh tomorrow morning. Sridhi Ventures!" },
  { id:5, name:"Reorder Reminder", stage:"Repeat Order Follow-up", message:"Hello {customer_name} ji, Sridhi Ventures here! Your regular {product} order is due. Shall we arrange {qty} KG delivery? Reply YES to confirm 🙏" },
];

const WA_VARIABLES = ["{customer_name}","{product}","{qty}","{address}","{executive}","{contact}","{area}","{stage}"];

function fillTemplate(msg, lead) {
  if (!lead) return msg;
  return msg
    .replace(/{customer_name}/g, lead.name || "")
    .replace(/{product}/g, lead.type || "Dosa Batter")
    .replace(/{qty}/g, "10")
    .replace(/{address}/g, lead.address || lead.area || "")
    .replace(/{executive}/g, lead.telecaller || "")
    .replace(/{contact}/g, lead.contact || "")
    .replace(/{area}/g, lead.area || "")
    .replace(/{stage}/g, lead.stage || "");
}

function sendWhatsApp(template, lead) {
  const msg = fillTemplate(template.message, lead);
  const phone = (lead.contact || "").replace(/[^0-9]/g,"");
  const number = phone.startsWith("91") ? phone : "91" + phone;
  window.open("https://wa.me/" + number + "?text=" + encodeURIComponent(msg), "_blank");
}

function loadWATemplates() {
  try { const s = localStorage.getItem("wa_templates"); return s ? JSON.parse(s) : DEFAULT_TEMPLATES; } catch { return DEFAULT_TEMPLATES; }
}
function saveWATemplates(t) {
  try { localStorage.setItem("wa_templates", JSON.stringify(t)); } catch {}
}

// ── Edit Form subcomponent ──
function WAEditForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { name:"", stage:"New Lead", message:"" });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={onCancel}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, color:T.t2, padding:"6px 12px", fontSize:12, cursor:"pointer", fontFamily:FONT }}>← Back</button>
        <div style={{ fontSize:14, fontWeight:700, color:T.t1 }}>{initial ? "Edit Template" : "New Template"}</div>
      </div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:14, display:"flex", flexDirection:"column", gap:12 }}>
        <div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:6 }}>TEMPLATE NAME</div>
          <input value={form.name} onChange={e => setForm({...form, name:e.target.value})}
            placeholder="e.g. Sample Follow-up"
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
        </div>
        <div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:6 }}>PIPELINE STAGE</div>
          <select value={form.stage} onChange={e => setForm({...form, stage:e.target.value})}
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }}>
            {PIPELINE_STAGE_LIST.filter(s => s !== "All Stages").map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:6 }}>MESSAGE</div>
          <textarea value={form.message} onChange={e => setForm({...form, message:e.target.value})}
            rows={6} placeholder="Type your WhatsApp message..."
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box", resize:"vertical" }} />
        </div>
        <div>
          <div style={{ fontSize:11, color:T.t3, fontWeight:600, marginBottom:6 }}>INSERT VARIABLE</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {WA_VARIABLES.map(v => (
              <button key={v} onClick={() => setForm({...form, message: form.message + v})}
                style={{ background:T.accentSub, border:`1px solid ${T.accentGlow}`, borderRadius:8,
                  color:T.accent, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
                {v}
              </button>
            ))}
          </div>
        </div>
        {form.message && (
          <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:10 }}>
            <div style={{ fontSize:10, color:T.accent, fontWeight:700, marginBottom:4 }}>PREVIEW</div>
            <div style={{ fontSize:12, color:T.t2, lineHeight:1.6 }}>{form.message}</div>
          </div>
        )}
      </div>
      <button onClick={() => onSave(form)} disabled={!form.name || !form.message}
        style={{ background: form.name && form.message ? T.accent : T.border, border:"none", borderRadius:14,
          color: form.name && form.message ? "#FFFFFF" : T.t3, padding:"14px", fontSize:14, fontWeight:800,
          cursor: form.name && form.message ? "pointer" : "default", fontFamily:FONT }}>
        Save Template
      </button>
    </div>
  );
}

// ── Send View subcomponent ──
function WASendView({ template, leads, onBack }) {
  const [selectedLead, setSelectedLead] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = leads.filter(l =>
    (template.stage === "All Stages" || l.stage === template.stage) &&
    (search === "" || (l.name||"").toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={onBack}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, color:T.t2, padding:"6px 12px", fontSize:12, cursor:"pointer", fontFamily:FONT }}>← Back</button>
        <div style={{ fontSize:14, fontWeight:700, color:T.t1 }}>Send: {template.name}</div>
      </div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:14 }}>
        <div style={{ fontSize:11, color:T.accent, fontWeight:700, marginBottom:8 }}>MESSAGE PREVIEW</div>
        <div style={{ fontSize:12, color:T.t2, lineHeight:1.6, whiteSpace:"pre-wrap" }}>
          {selectedLead ? fillTemplate(template.message, selectedLead) : template.message}
        </div>
      </div>
      <div style={{ fontSize:11, color:T.t3, fontWeight:700 }}>SELECT LEAD TO SEND</div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lead name..."
        style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
      <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:300, overflowY:"auto" }}>
        {filtered.map(lead => (
          <div key={lead.id} onClick={() => setSelectedLead(lead)}
            style={{ background: selectedLead?.id === lead.id ? T.accentSub : T.card,
              border:`1px solid ${selectedLead?.id === lead.id ? T.accent : T.border}`,
              borderRadius:12, padding:"10px 14px", cursor:"pointer" }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.t1 }}>{lead.name}</div>
            <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>{lead.stage} · {lead.contact}</div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ textAlign:"center", color:T.t3, fontSize:12, padding:20 }}>No leads found</div>}
      </div>
      {selectedLead && (
        <button onClick={() => sendWhatsApp(template, selectedLead)}
          style={{ background:"#25D366", border:"none", borderRadius:14, color:"white",
            padding:"14px", fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:FONT,
            display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          📲 Open WhatsApp & Send
        </button>
      )}
    </div>
  );
}

function WhatsAppTemplates() {
  const [templates, setTemplates] = useState(loadWATemplates);
  const [leads] = useSheetSynced("leads","leads", []);
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [sending, setSending] = useState(null);
  const [filterStage, setFilterStage] = useState("All Stages");
  const [search, setSearch] = useState("");

  function updateTemplates(t) { setTemplates(t); saveWATemplates(t); }

  function handleSave(form) {
    if (form.id) {
      updateTemplates(templates.map(x => x.id === form.id ? form : x));
    } else {
      updateTemplates([...templates, { ...form, id: Date.now() }]);
    }
    setView("list"); setEditing(null);
  }

  function deleteTemplate(id) { updateTemplates(templates.filter(t => t.id !== id)); }

  if (view === "edit") return <WAEditForm initial={editing} onSave={handleSave} onCancel={() => { setView("list"); setEditing(null); }} />;
  if (view === "send" && sending) return <WASendView template={sending} leads={leads} onBack={() => { setView("list"); setSending(null); }} />;

  const filtered = templates.filter(t =>
    (filterStage === "All Stages" || t.stage === filterStage) &&
    (search === "" || t.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:T.t1 }}>WA Templates</div>
          <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>{templates.length} templates · tap to send</div>
        </div>
        <button onClick={() => { setEditing(null); setView("edit"); }}
          style={{ background:T.accent, border:"none", borderRadius:12, color:"#FFFFFF", padding:"8px 16px", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:FONT }}>
          + New
        </button>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..."
        style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.t1, padding:"9px 12px", fontSize:13, fontFamily:FONT, outline:"none", width:"100%", boxSizing:"border-box" }} />
      <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
        {["All Stages","New Lead","Sample Requested","Order Received","Active Customer"].map(s => (
          <button key={s} onClick={() => setFilterStage(s)}
            style={{ background: filterStage===s ? T.accent : T.card, border:`1px solid ${filterStage===s ? T.accent : T.border}`,
              borderRadius:20, color: filterStage===s ? "#FFFFFF" : T.t2, padding:"5px 12px", fontSize:11,
              fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, fontFamily:FONT }}>
            {s}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {filtered.map(t => (
          <div key={t.id} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:T.t1 }}>{t.name}</div>
                <div style={{ fontSize:11, color:T.accent, fontWeight:600, marginTop:2 }}>{t.stage}</div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={() => { setEditing(t); setView("edit"); }}
                  style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, color:T.t2, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:FONT }}>Edit</button>
                <button onClick={() => deleteTemplate(t.id)}
                  style={{ background:"rgba(244,63,94,0.1)", border:"1px solid rgba(244,63,94,0.3)", borderRadius:8, color:T.rose, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:FONT }}>Del</button>
              </div>
            </div>
            <div style={{ fontSize:12, color:T.t3, lineHeight:1.5, marginBottom:10, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{t.message}</div>
            <button onClick={() => { setSending(t); setView("send"); }}
              style={{ background:"#25D366", border:"none", borderRadius:10, color:"white", padding:"8px 16px",
                fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT, width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              📲 Send to Lead
            </button>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ textAlign:"center", color:T.t3, fontSize:13, padding:40 }}>No templates found</div>}
      </div>
    </div>
  );
}


// ─── NAV ──────────────────────────────────────────────────────────────────
const NAV = [
  { id:"dashboard", label:"Home",     icon:"dashboard" },
  { id:"leads",     label:"CRM",      icon:"crm"       },
  { id:"pipeline",  label:"Pipeline", icon:"pipeline"  },
  { id:"fieldsync", label:"Field",    icon:"field"     },
  { id:"more",      label:"More",     icon:"more"      },
];
const MORE_MENU = [
  { id:"activity",  label:"Telecaller Activity", icon:"📝" },
  { id:"milkdistributors", label:"Milk Distributors", icon:"🥛" },
  { id:"hubdistributors", label:"Hub Distributors", icon:"🏢" },
  { id:"dailyorders", label:"Daily Orders", icon:"📦" },
  { id:"samples",   label:"Samples",       icon:"🧪" },
  { id:"repeat",    label:"Repeat Orders", icon:"🔁" },
  { id:"lostcustomers", label:"Lost Customers", icon:"🚫" },
  { id:"existingcustomers", label:"Existing Customers", icon:"🔄" },
  { id:"homecustomers", label:"Home Customers", icon:"🏠" },
  { id:"expenses",  label:"Expenses",      icon:"💸" },
  { id:"marketing", label:"Marketing",     icon:"📢" },
  { id:"reports",   label:"Reports",       icon:"📈" },
  { id:"today",     label:"Today Tasks",    icon:"📅"  },
  { id:"prospects",  label:"Find Prospects", icon:"🗺️"  },
  { id:"hrleads",   label:"HR Leads",       icon:"📋"  },
  { id:"hiring",    label:"Hiring",         icon:"🧑‍💼" },
  { id:"whatsapp",  label:"WA Templates",  icon:"💬"  },
  { id:"ai",        label:"AI Assistant",  icon:"✦"  },
];

// ══════════════════════════════════════════════════════════════════════════
// ─── DESKTOP EXPERIENCE (≥1024px) ──────────────────────────────────────────
// Dark "control room" theme — sidebar + topbar shell used only on wide
// screens. The mobile app above is completely untouched.
// ══════════════════════════════════════════════════════════════════════════

// Desktop shell — same light, professional palette as the mobile design
// system (T) above, tuned for the wider sidebar/topbar/card layout.
const DT = {
  bg:        "#F4F7F5",
  sidebar:   "#FFFFFF",
  surface:   "#FFFFFF",
  card:      "#FFFFFF",
  cardHi:    "#F1F6F3",
  border:    "#E3EAE5",
  borderHi:  "#CBD8D1",

  t1: "#101828",
  t2: "#5B6472",
  t3: "#8894A0",

  accent:     "#0E9F6E",
  accentSoft: "rgba(14,159,110,0.10)",
  accentGlow: "rgba(14,159,110,0.30)",

  emerald: "#059669",
  amber:   "#B45309",
  rose:    "#DC2626",
  indigo:  "#4F46E5",
  sky:     "#0284C7",
  orange:  "#EA580C",
  purple:  "#7C3AED",
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024
  );
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isDesktop;
}

const ROLE_PROFILE = {
  "Admin":       { name: "Naveen S", sub: "Admin" },
  "Telecaller":  { name: "Priya R",  sub: "Telecaller" },
  "Field Sales": { name: "Ramesh K", sub: "Field Sales" },
  "Management":  { name: "Kumar S",  sub: "Management" },
};

// ── Icon set for the desktop shell ──────────────────────────────────────
function DIcon({ id, size = 18, color = "currentColor", strokeWidth = 1.8 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (id) {
    case "dashboard": return <svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>;
    case "crm": return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "pipeline": return <svg {...p}><path d="M3 4h18l-7 9v6l-4 2v-8L3 4z"/></svg>;
    case "orders": return <svg {...p}><path d="M6 8V6a3 3 0 0 1 6 0v2"/><rect x="3" y="8" width="12" height="13" rx="2"/><path d="M14 8h4l3 4v9h-4"/><circle cx="7" cy="21" r="1.4"/><circle cx="17" cy="21" r="1.4"/></svg>;
    case "lostuser": return <svg {...p}><circle cx="9" cy="7" r="4"/><path d="M1 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>;
    case "existing": return <svg {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>;
    case "dispatch": return <svg {...p}><rect x="1" y="6" width="14" height="11" rx="1.5"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="6" cy="19.5" r="1.6"/><circle cx="17.5" cy="19.5" r="1.6"/></svg>;
    case "samples": return <svg {...p}><path d="M10 2v6.2L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.2V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/></svg>;
    case "milk": return <svg {...p}><path d="M9 2h6l1 4-1.5 2v10a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V8L8 4z"/><path d="M8 12h8"/></svg>;
    case "homecust": return <svg {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>;
    case "hub": return <svg {...p}><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9 14h.01"/><path d="M15 14h.01"/></svg>;
    case "phone": return <svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.8 2.1z"/></svg>;
    case "followups": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></svg>;
    case "expenses": return <svg {...p}><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M17 12h.01"/><path d="M3 10h18"/></svg>;
    case "reports": return <svg {...p}><path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/></svg>;
    case "ai": return <svg {...p}><path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.2.7.7 1.2 1.5 1.4H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>;
    case "bell": return <svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>;
    case "chevron": return <svg {...p}><polyline points="15 6 9 12 15 18"/></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14"/><path d="M5 12h14"/></svg>;
    case "call": return <svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.8 2.1z"/></svg>;
    case "chat": return <svg {...p}><path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.5a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5z"/></svg>;
    case "pin": return <svg {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case "up": return <svg {...p} strokeWidth="2.5"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>;
    case "down": return <svg {...p} strokeWidth="2.5"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>;
    case "cart": return <svg {...p}><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.6L21 7H6"/></svg>;
    case "wallet2": return <svg {...p}><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M17 12h.01"/></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/></svg>;
    case "marketing": return <svg {...p}><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>;
    case "compass": return <svg {...p}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>;
    case "clipboard": return <svg {...p}><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M9 12h6"/><path d="M9 16h6"/><path d="M9 8h1"/></svg>;
    case "hiring": return <svg {...p}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><path d="M3 12h18"/></svg>;
    default: return null;
  }
}

// ── Sidebar nav definition ───────────────────────────────────────────────
const DESKTOP_NAV = [
  { id: "dashboard", label: "Dashboard",    icon: "dashboard" },
  { id: "leads",     label: "CRM",          icon: "crm" },
  { id: "pipeline",  label: "Pipeline",     icon: "pipeline" },
  { id: "repeat",    label: "Orders",       icon: "orders" },
  { id: "activity",  label: "Telecaller Activity", icon: "clipboard", tag: "New" },
  { id: "milkdistributors", label: "Milk Distributors", icon: "milk", tag: "New" },
  { id: "hubdistributors", label: "Hub Distributors", icon: "hub", tag: "New" },
  { id: "lostcustomers", label: "Lost Customers", icon: "lostuser" },
  { id: "existingcustomers", label: "Existing Customers", icon: "existing" },
  { id: "homecustomers", label: "Home Customers", icon: "homecust", tag: "New" },
  { id: "dailyorders", label: "Daily Orders", icon: "cart" },
  { id: "fieldsync", label: "Dispatch",     icon: "dispatch" },
  { id: "samples",   label: "Samples",      icon: "samples" },
  { id: "today",     label: "Telecalling",  icon: "phone" },
  { id: "prospects", label: "Find Prospects", icon: "compass", tag: "New" },
  { id: "hrleads",   label: "HR Leads",     icon: "clipboard" },
  { id: "hiring",    label: "Hiring",       icon: "hiring", tag: "New" },
  { id: "whatsapp",  label: "Follow-ups",   icon: "followups" },
  { id: "marketing", label: "Marketing",    icon: "marketing" },
  { id: "expenses",  label: "Expenses",     icon: "expenses" },
  { id: "reports",   label: "Reports",      icon: "reports" },
  { id: "ai",        label: "AI Assistant", icon: "ai", tag: "New" },
  { id: "settings",  label: "Settings",     icon: "settings" },
];

function DesktopSidebar({ activeTab, setActiveTab, collapsed, setCollapsed, leadsCount }) {
  const w = collapsed ? 76 : 232;
  return (
    <div style={{
      width: w, flexShrink: 0, background: DT.sidebar, borderRight: `1px solid ${DT.border}`,
      display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0,
      transition: "width 0.18s ease", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "22px 0" : "22px 20px", justifyContent: collapsed ? "center" : "flex-start" }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: `linear-gradient(135deg, ${DT.accent}, ${DT.sky})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚡</div>
        {!collapsed && <span style={{ fontSize: 15, fontWeight: 800, color: DT.t1, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>Sridhi BOS</span>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {DESKTOP_NAV.map(n => {
          const isActive = activeTab === n.id;
          return (
            <button key={n.id} onClick={() => setActiveTab(n.id)} title={collapsed ? n.label : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: collapsed ? "10px 0" : "10px 12px", justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 10, border: "none", cursor: "pointer", fontFamily: FONT,
                background: isActive ? DT.accentSoft : "transparent",
                color: isActive ? DT.accent : DT.t2,
                fontSize: 13, fontWeight: isActive ? 700 : 500, transition: "background 0.12s, color 0.12s",
              }}>
              <DIcon id={n.icon} size={18} color={isActive ? DT.accent : DT.t2} />
              {!collapsed && <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap" }}>{n.label}</span>}
              {!collapsed && n.id === "leads" && leadsCount > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: isActive ? DT.accent : DT.t3, background: isActive ? "rgba(20,201,166,0.18)" : DT.cardHi, borderRadius: 20, padding: "2px 7px" }}>{leadsCount}</span>
              )}
              {!collapsed && n.tag && (
                <span style={{ fontSize: 9.5, fontWeight: 800, color: DT.accent, background: DT.accentSoft, borderRadius: 20, padding: "2px 6px", letterSpacing: "0.02em" }}>{n.tag}</span>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}

function DesktopTopbar({ role, setRole, search, setSearch, collapsed, setCollapsed, notifCount, setActiveTab }) {
  const todayStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const [leads] = useSheetSynced("leads", "leads", []);
  const [repeatCustomers] = useSheetSynced("repeatCustomers", "repeatCustomers", []);
  const [orders] = useSheetSynced("dailyOrders", "dailyOrders", []);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClick(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  const q = search.trim().toLowerCase();
  const matches = (val) => (val || "").toString().toLowerCase().includes(q);

  const leadResults = q ? (leads || []).filter(l => matches(l.name) || matches(l.area) || matches(l.contact)).slice(0, 5) : [];
  const repeatResults = q ? (repeatCustomers || []).filter(c => matches(c.name) || matches(c.area) || matches(c.contact)).slice(0, 5) : [];
  const orderResults = q ? (orders || []).filter(o => matches(o.customer) || matches(o.area)).slice(0, 5) : [];
  const totalResults = leadResults.length + repeatResults.length + orderResults.length;

  function goTo(tab) {
    setActiveTab(tab);
    setOpen(false);
  }

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 40, background: `${DT.bg}F2`, backdropFilter: "blur(10px)",
      borderBottom: `1px solid ${DT.border}`, padding: "14px 28px", display: "flex", alignItems: "center", gap: 16,
    }}>
      <button onClick={() => setCollapsed(!collapsed)}
        style={{ width: 30, height: 30, borderRadius: "50%", background: DT.card, border: `1px solid ${DT.borderHi}`, color: DT.t2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
        <DIcon id="chevron" size={14} color={DT.t2} strokeWidth={2.4} style={{ transform: collapsed ? "rotate(180deg)" : "none" }} />
      </button>

      <div ref={boxRef} style={{ position: "relative", width: 320 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><DIcon id="search" size={15} color={DT.t3} /></span>
        <input value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => { if (search.trim()) setOpen(true); }}
          placeholder="Search leads, customers, tasks..."
          style={{ width: "100%", background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 10, padding: "9px 12px 9px 34px", fontSize: 12.5, color: DT.t1, fontFamily: FONT, outline: "none" }} />

        {open && q && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, width: 380, maxHeight: 420, overflowY: "auto",
            background: DT.card, border: `1px solid ${DT.borderHi}`, borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.35)", zIndex: 60,
          }}>
            {totalResults === 0 ? (
              <div style={{ padding: "18px 16px", fontSize: 12.5, color: DT.t3, textAlign: "center" }}>No matches for "{search}"</div>
            ) : (
              <>
                {leadResults.length > 0 && (
                  <div>
                    <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: DT.t3, letterSpacing: "0.05em", textTransform: "uppercase" }}>Leads</div>
                    {leadResults.map((l, i) => (
                      <div key={"l" + i} onClick={() => goTo("leads")}
                        style={{ padding: "8px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                        onMouseEnter={e => e.currentTarget.style.background = DT.cardHi} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: DT.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                          <div style={{ fontSize: 11, color: DT.t3 }}>{l.area || "—"}{l.stage ? " · " + l.stage : ""}</div>
                        </div>
                        <DIcon id="chevron" size={12} color={DT.t3} style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                )}
                {repeatResults.length > 0 && (
                  <div>
                    <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: DT.t3, letterSpacing: "0.05em", textTransform: "uppercase" }}>Repeat Customers</div>
                    {repeatResults.map((c, i) => (
                      <div key={"c" + i} onClick={() => goTo("repeat")}
                        style={{ padding: "8px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                        onMouseEnter={e => e.currentTarget.style.background = DT.cardHi} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: DT.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: DT.t3 }}>{c.area || "—"}</div>
                        </div>
                        <DIcon id="chevron" size={12} color={DT.t3} style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                )}
                {orderResults.length > 0 && (
                  <div>
                    <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 800, color: DT.t3, letterSpacing: "0.05em", textTransform: "uppercase" }}>Daily Orders</div>
                    {orderResults.map((o, i) => (
                      <div key={"o" + i} onClick={() => goTo("dailyorders")}
                        style={{ padding: "8px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                        onMouseEnter={e => e.currentTarget.style.background = DT.cardHi} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: DT.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.customer}</div>
                          <div style={{ fontSize: 11, color: DT.t3 }}>{o.area || "—"}{o.date ? " · " + o.date : ""}</div>
                        </div>
                        <DIcon id="chevron" size={12} color={DT.t3} style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 12, color: DT.t2, whiteSpace: "nowrap" }}>
        <DIcon id="calendar" size={13} color={DT.t3} />Today, {todayStr}
      </div>

      <div style={{ position: "relative", width: 36, height: 36, borderRadius: "50%", background: DT.card, border: `1px solid ${DT.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <DIcon id="bell" size={16} color={DT.t2} />
        {notifCount > 0 && (
          <span style={{ position: "absolute", top: -3, right: -3, background: DT.rose, color: "#fff", fontSize: 9.5, fontWeight: 800, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${DT.bg}` }}>{notifCount}</span>
        )}
      </div>

      <button onClick={() => setRole(null)} title={`Switch role (currently ${role})`}
        style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg, ${DT.indigo}, ${DT.purple})`, border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {(role || "?").slice(0, 1)}
      </button>
    </div>
  );
}

// ── Mini sparkline used inside stat cards ────────────────────────────────
function MiniSparkline({ data, color, width = 96, height = 34 }) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const areaPts = `0,${height} ${pts} ${width},${height}`;
  const gid = "spark-" + color.replace("#", "");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function seededWave(seed, n, base, spread) {
  const out = [];
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const r = x / 233280;
    out.push(Math.max(2, Math.round(base + Math.sin(i / 1.7 + seed) * spread * 0.5 + (r - 0.5) * spread * 0.5)));
  }
  return out;
}

function StatCard({ icon, iconBg, label, value, unit, change, color, onClick, hint }) {
  const up = change >= 0;
  const spark = seededWave(label.length + value.toString().length, 8, 10, 8);
  return (
    <div onClick={onClick} style={{
      flex: 1,
      minWidth: 175,
      background: `radial-gradient(130% 130% at 12% 15%, ${color}3D 0%, ${color}14 32%, ${DT.card} 62%)`,
      border: `1px solid ${color}40`,
      borderRadius: 16,
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${color}F2 0%, ${color}B8 100%)`, boxShadow: `0 4px 12px ${color}4D`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{icon}</div>
        <span style={{ fontSize: 12.5, color: DT.t3, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: DT.t1, letterSpacing: "-0.02em" }}>
        {value}{unit && <span style={{ fontSize: 13, color: DT.t3, fontWeight: 600 }}> {unit}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {hint ? (
          <div style={{ fontSize: 11.5, fontWeight: 700, color }}>{hint}</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: up ? DT.emerald : DT.rose }}>
            <DIcon id={up ? "up" : "down"} size={11} color={up ? DT.emerald : DT.rose} strokeWidth={3} />
            {Math.abs(change)}% <span style={{ color: DT.t3, fontWeight: 500 }}>vs Yesterday</span>
          </div>
        )}
        <MiniSparkline data={spark} color={color} />
      </div>
    </div>
  );
}

// ── Batter Grinder Hero — animated illustration of the traditional wet ───
// grinder churning out fresh idli/dosa/vada batter. Purely decorative +
// a live "KG ground today" readout, used to open both the mobile and
// desktop dashboards with something warmer than another stat card.
function BatterGrinderHero({ theme = DT, kgToday = 0, compact = false }) {
  const stone   = "#5B6B8C";
  const stoneHi = "#7688AD";
  const batter  = "#F7EFE0";
  const wood    = "#8A5A3A";
  const skin    = theme.accent || "#14C9A6";

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 18,
        border: `1px solid ${theme.border}`,
        background: `linear-gradient(120deg, ${theme.surface || theme.card} 0%, ${theme.card} 55%, ${theme.cardHi || theme.cardHigh || theme.card} 100%)`,
        padding: compact ? "16px 18px" : "20px 26px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,
        flexWrap: "wrap",
      }}
    >
      <style>{`
        @keyframes grinderSpin      { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes grinderCrank     { 0%,100% { transform: rotate(-10deg); } 50% { transform: rotate(14deg); } }
        @keyframes grinderShoulder  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
        @keyframes grinderDrip1     { 0% { opacity:0; transform: translateY(0) scale(0.5); } 25% { opacity:1; } 85% { opacity:1; } 100% { opacity:0; transform: translateY(20px) scale(1); } }
        @keyframes grinderDrip2     { 0% { opacity:0; transform: translateY(0) scale(0.4); } 35% { opacity:1; } 90% { opacity:1; } 100% { opacity:0; transform: translateY(18px) scale(0.9); } }
        @keyframes grinderRipple    { 0%,100% { transform: scaleX(1); opacity:0.9; } 50% { transform: scaleX(1.08); opacity:0.5; } }
        @keyframes grinderSteam     { 0% { opacity:0; transform: translateY(0) scale(0.85); } 30% { opacity:0.8; } 100% { opacity:0; transform: translateY(-18px) scale(1.25); } }
        @keyframes grinderDust      { 0%,100% { transform: translateY(0); opacity:0.35; } 50% { transform: translateY(-5px); opacity:0.9; } }
        @keyframes grinderPulseDot  { 0%,100% { opacity:0.35; transform: scale(0.8); } 50% { opacity:1; transform: scale(1.15); } }
      `}</style>

      {/* Text side */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: theme.emerald, display: "inline-block" }}>
            <span style={{ position: "absolute", inset: -4, borderRadius: "50%", background: theme.emerald, animation: "grinderPulseDot 1.6s ease-in-out infinite" }} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: theme.emerald, textTransform: "uppercase" }}>Live in the kitchen</span>
        </div>
        <div style={{ fontSize: compact ? 15 : 18, fontWeight: 800, color: theme.t1, letterSpacing: "-0.01em" }}>
          Fresh batter, ground daily
        </div>
        <div style={{ fontSize: compact ? 20 : 26, fontWeight: 800, color: theme.t1 }}>
          {Math.round(kgToday).toLocaleString("en-IN")}
          <span style={{ fontSize: 13, color: theme.t3, fontWeight: 600 }}> KG ground today</span>
        </div>
        <div style={{ fontSize: 11.5, color: theme.t3, fontWeight: 500 }}>Idli · Dosa · Vada — straight off the stone</div>
      </div>

      {/* Animated illustration */}
      <svg viewBox="0 0 300 150" width={compact ? 190 : 250} height={compact ? 95 : 125} style={{ flexShrink: 0 }}>
        {/* dust / flour sparkles */}
        <circle cx="30" cy="34" r="2" fill={batter} opacity="0.6" style={{ animation: "grinderDust 2.4s ease-in-out infinite" }} />
        <circle cx="255" cy="26" r="1.6" fill={batter} opacity="0.5" style={{ animation: "grinderDust 2.8s ease-in-out infinite 0.5s" }} />
        <circle cx="205" cy="18" r="1.8" fill={batter} opacity="0.5" style={{ animation: "grinderDust 2s ease-in-out infinite 0.9s" }} />

        {/* steam curls above the drum */}
        <g stroke={batter} strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M120 44 Q126 34 120 26 Q114 18 120 10" style={{ animation: "grinderSteam 3s ease-out infinite" }} />
          <path d="M138 44 Q144 35 138 27 Q132 19 138 11" style={{ animation: "grinderSteam 3s ease-out infinite 1s" }} />
          <path d="M156 44 Q162 34 156 26 Q150 18 156 10" style={{ animation: "grinderSteam 3s ease-out infinite 2s" }} />
        </g>

        {/* stand legs */}
        <path d="M108 128 L100 148 M180 128 L188 148 M120 128 L116 148 M168 128 L172 148" stroke={wood} strokeWidth="4" strokeLinecap="round" />

        {/* drum body */}
        <rect x="102" y="70" width="86" height="58" rx="14" fill={stone} />
        <rect x="102" y="70" width="86" height="20" rx="10" fill={stoneHi} />
        <ellipse cx="145" cy="70" rx="43" ry="10" fill={stoneHi} />

        {/* rotating grinding window */}
        <g transform="translate(145,70)">
          <ellipse cx="0" cy="0" rx="30" ry="7" fill={batter} />
          <g style={{ transformOrigin: "0px 0px", animation: "grinderSpin 2.2s linear infinite" }}>
            <ellipse cx="0" cy="0" rx="30" ry="7" fill="none" stroke={stone} strokeWidth="2" strokeDasharray="10 10" />
          </g>
        </g>

        {/* spout + pouring batter */}
        <path d="M102 108 Q80 110 76 118" stroke={stone} strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M78 120 Q76 132 78 144" stroke={batter} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.95" />
        <circle cx="78" cy="128" r="3" fill={batter} style={{ animation: "grinderDrip1 1.4s ease-in infinite" }} />
        <circle cx="79" cy="118" r="2.4" fill={batter} style={{ animation: "grinderDrip2 1.4s ease-in infinite 0.6s" }} />

        {/* bowl catching the batter */}
        <ellipse cx="80" cy="146" rx="24" ry="7" fill={wood} opacity="0.9" />
        <ellipse cx="80" cy="143" rx="19" ry="4.5" fill={batter} style={{ animation: "grinderRipple 2.4s ease-in-out infinite", transformOrigin: "80px 143px" }} />

        {/* person cranking the grinder */}
        <g style={{ animation: "grinderShoulder 1.6s ease-in-out infinite" }}>
          {/* head */}
          <circle cx="222" cy="66" r="11" fill={skin} />
          {/* torso */}
          <path d="M208 128 Q206 92 222 88 Q238 92 238 128 Z" fill={skin} opacity="0.92" />
          {/* upper arm (fixed) */}
          <path d="M212 98 Q198 100 192 104" stroke={skin} strokeWidth="8" strokeLinecap="round" fill="none" />
          {/* forearm + hand cranking the wheel */}
          <g transform="translate(192,104)" style={{ animation: "grinderCrank 1.1s ease-in-out infinite" }}>
            <path d="M0 0 Q-8 10 -4 20" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
            <circle cx="-4" cy="21" r="4.5" fill={wood} />
          </g>
        </g>
      </svg>
    </div>
  );
}

// ── Sales trend area chart ───────────────────────────────────────────────
// Built from real Daily Orders records (date + kgs + amount) for the last
// 14 days. No fabricated data: if there isn't enough real history yet, an
// empty state is shown instead of a randomly-generated wave.
function SalesTrendChart({ orders = [] }) {
  const active = (orders || []).filter(o => o.status !== "Cancelled" && o.date);

  // Real rolling 14-day window ending today, so the axis always makes sense
  // even before any orders exist.
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  const byDate = {};
  active.forEach(o => {
    if (!byDate[o.date]) byDate[o.date] = { kg: 0, revenue: 0, orders: 0 };
    byDate[o.date].kg += parseFloat(o.kgs) || 0;
    byDate[o.date].revenue += parseFloat(o.amount) || 0;
    byDate[o.date].orders += 1;
  });

  const hasData = days.some(d => byDate[d]);
  const points = days.map(d => byDate[d]?.kg || 0);
  const revenuePoints = days.map(d => byDate[d]?.revenue || 0);
  const labelDates = days.map(d => formatDateReadable(d).replace(/, \d{4}$/, ""));

  const totalSales = points.reduce((a, b) => a + b, 0);
  const totalRevenue = revenuePoints.reduce((a, b) => a + b, 0);
  const bestDay = Math.max(...points, 0);
  const avgDay = days.length ? Math.round(totalSales / days.length) : 0;
  const ordersCount = days.reduce((a, d) => a + (byDate[d]?.orders || 0), 0);

  const W = 640, H = 190, PAD = 8;
  const maxV = Math.max(...points, 1);
  const step = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const coords = points.map((v, i) => [PAD + i * step, H - PAD - (v / maxV) * (H - PAD * 2)]);
  const linePath = coords.length ? coords.map((c, i) => (i === 0 ? "M" : "L") + c[0] + "," + c[1]).join(" ") : "";
  const areaPath = coords.length ? linePath + ` L${coords[coords.length - 1][0]},${H} L${coords[0][0]},${H} Z` : "";
  const hiIdx = hasData ? points.indexOf(bestDay) : -1;
  const hi = hiIdx >= 0 && bestDay > 0 ? coords[hiIdx] : null;

  // Thin x-axis labels so 14 dates don't overlap — show every other one.
  const shownLabels = labelDates.map((d, i) => (i % 2 === 0 || i === labelDates.length - 1) ? d : "");

  return (
    <div style={{ flex: 1.4, minWidth: 380, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Sales Trend</div>
          <div style={{ fontSize: 11.5, color: DT.t3, marginTop: 2 }}>From Daily Orders — last 14 days</div>
        </div>
        <div style={{ background: DT.cardHi, border: `1px solid ${DT.borderHi}`, borderRadius: 8, padding: "5px 10px", fontSize: 11.5, color: DT.t2, fontWeight: 600 }}>Last 14 Days</div>
      </div>

      <div style={{ position: "relative", marginTop: 14 }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
          <defs>
            <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DT.accent} stopOpacity="0.35" />
              <stop offset="100%" stopColor={DT.accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke={DT.border} strokeDasharray="4 5" />)}
          {hasData && areaPath && <path d={areaPath} fill="url(#salesArea)" />}
          {hasData && linePath && <path d={linePath} fill="none" stroke={DT.accent} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
          {!hasData && <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke={DT.borderHi} strokeWidth="2" />}
          {hi && <circle cx={hi[0]} cy={hi[1]} r="4.5" fill={DT.bg} stroke={DT.accent} strokeWidth="2.5" />}
          {hi && <line x1={hi[0]} x2={hi[0]} y1={hi[1]} y2={H} stroke={DT.borderHi} strokeDasharray="3 4" />}
        </svg>
        {hi && (
          <div style={{ position: "absolute", left: `calc(${(hi[0] / W) * 100}% - 46px)`, top: Math.max(hi[1] - 46, 0), background: DT.cardHi, border: `1px solid ${DT.borderHi}`, borderRadius: 8, padding: "6px 10px", fontSize: 10.5, color: DT.t1, whiteSpace: "nowrap", boxShadow: "0 8px 20px rgba(0,0,0,0.35)" }}>
            <div style={{ fontWeight: 700 }}>{labelDates[hiIdx]}</div>
            <div style={{ color: DT.accent, fontWeight: 700 }}>{bestDay.toLocaleString("en-IN", { maximumFractionDigits: 1 })} KG</div>
          </div>
        )}
        {!hasData && (
          <div style={{ position: "absolute", left: "50%", top: "38%", transform: "translate(-50%, -50%)", color: DT.t3, fontSize: 12.5, textAlign: "center", width: "80%" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📈</div>
            <div>No orders in the last 14 days yet</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>The trend will appear once orders are logged in Daily Orders</div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {shownLabels.map((d, i) => <span key={i} style={{ fontSize: 10.5, color: DT.t3 }}>{d}</span>)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 22, marginTop: 16, borderTop: `1px solid ${DT.border}`, paddingTop: 14, flexWrap: "wrap" }}>
        {[
          ["Total Sales", totalSales.toLocaleString("en-IN", { maximumFractionDigits: 1 }) + " KG"],
          ["Average / Day", avgDay.toLocaleString("en-IN") + " KG"],
          ["Best Day", bestDay.toLocaleString("en-IN", { maximumFractionDigits: 1 }) + " KG"],
          ["Orders", ordersCount],
          ["Revenue", "₹" + Math.round(totalRevenue).toLocaleString("en-IN")],
        ].map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize: 14, fontWeight: 800, color: DT.t1 }}>{v}</div>
            <div style={{ fontSize: 10.5, color: DT.t3, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pipeline funnel (desktop) ────────────────────────────────────────────
function PipelineFunnelDesktop({ liveStages, totalLeads }) {
  const countFor = (...ids) => ids.reduce((a, id) => a + (liveStages.find(s => s.id === id)?.count || 0), 0);
  const rows = [
    { label: "New Lead",      value: countFor("New Lead"), color: DT.indigo },
    { label: "Contacted",     value: countFor("Contacted"), color: DT.sky },
    { label: "Interested",    value: countFor("Interested"), color: DT.emerald },
    { label: "Sample Sent",   value: countFor("Sample Requested", "Assigned to Field Sales", "Sample Delivered"), color: DT.orange },
    { label: "Order Received",value: countFor("Order Received", "Active Customer", "Repeat Order Follow-up"), color: DT.rose },
  ];
  const denom = Math.max(totalLeads, 1);
  const maxW = 100;

  return (
    <div style={{ flex: 1, minWidth: 280, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Pipeline Overview</div>
        <div style={{ background: DT.cardHi, border: `1px solid ${DT.borderHi}`, borderRadius: 8, padding: "5px 10px", fontSize: 11.5, color: DT.t2, fontWeight: 600 }}>This Month ⌄</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {rows.map((r, i) => {
          const pct = totalLeads > 0 ? (r.value / denom) * 100 : 0;
          const widthPct = 100 - i * 15;
          return (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: `${widthPct}%`, maxWidth: maxW + "%", background: r.color, borderRadius: 8, padding: "10px 0", textAlign: "center", color: "#fff", fontSize: 14, fontWeight: 800 }}>
                {r.value}
              </div>
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span style={{ color: DT.t2, fontWeight: 600 }}>{r.label}</span>
                <span style={{ color: DT.t3, fontWeight: 700 }}>{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${DT.border}` }}>
        <span style={{ fontSize: 12, color: DT.t2, fontWeight: 600 }}>Overall Conversion Rate</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: DT.accent }}>
          {totalLeads > 0 ? ((rows[4].value / denom) * 100).toFixed(1) : "0.0"}%
        </span>
      </div>
    </div>
  );
}

// ── Today's Tasks (desktop) ──────────────────────────────────────────────
function TodayTasksDesktop({ leads, samples, repeatCustomers, setActiveTab }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const times = ["10:00 AM", "11:30 AM", "02:00 PM", "04:30 PM", "06:00 PM"];
  const items = [];

  leads.filter(l => l.stage === "Callback Requested").slice(0, 3).forEach(l =>
    items.push({ icon: "followups", color: DT.emerald, title: "Follow up with " + l.name, sub: (l.telecaller || "Team") + " · Manager" }));
  samples.filter(s => s.status === "Pending" && s.scheduledDate === todayStr).slice(0, 2).forEach(s =>
    items.push({ icon: "samples", color: DT.orange, title: "Send sample to " + s.customer, sub: (s.exec || "Team") + " · Owner" }));
  repeatCustomers.filter(c => c.status === "Due Today").slice(0, 2).forEach(c =>
    items.push({ icon: "orders", color: DT.sky, title: "Collect payment from " + c.name, sub: "Manager" }));
  leads.filter(l => l.stage === "Sample Requested").slice(0, 2).forEach(l =>
    items.push({ icon: "phone", color: DT.purple, title: "Call " + l.name, sub: "Follow up" }));

  const list = items.slice(0, 5);

  return (
    <div style={{ flex: 1, minWidth: 260, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Today's Tasks</div>
        <button onClick={() => setActiveTab("today")} style={{ background: "none", border: "none", color: DT.accent, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>View All</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
        {list.length === 0 && <div style={{ fontSize: 12, color: DT.t3, padding: "16px 0" }}>All clear — no pending tasks today.</div>}
        {list.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < list.length - 1 ? `1px solid ${DT.border}` : "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: it.color + "22", border: `1px solid ${it.color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <DIcon id={it.icon} size={14} color={it.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: DT.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
              <div style={{ fontSize: 11, color: DT.t3, marginTop: 1 }}>{it.sub}</div>
            </div>
            <div style={{ fontSize: 10.5, color: DT.t3, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
              <DIcon id="calendar" size={11} color={DT.t3} />{times[i] || "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recent Activities (desktop) ──────────────────────────────────────────
function RecentActivitiesDesktop({ leads, samples, repeatCustomers, setActiveTab }) {
  const labels = ["10:30 AM", "09:45 AM", "Yesterday", "Yesterday", new Date(Date.now() - 6 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })];
  const items = [];
  leads.slice(0, 2).forEach(l => items.push({ icon: "user", color: DT.emerald, title: "New lead added - " + l.name, who: l.telecaller || "Team" }));
  samples.slice(0, 1).forEach(s => items.push({ icon: "samples", color: DT.purple, title: "Sample sent to " + s.customer, who: s.exec || "Team" }));
  repeatCustomers.filter(c => c.status === "Paid").slice(0, 1).forEach(c => items.push({ icon: "wallet2", color: DT.accent, title: "Payment received from " + c.name, who: "Rahul" }));
  leads.filter(l => l.stage === "Order Received").slice(0, 1).forEach(l => items.push({ icon: "cart", color: DT.orange, title: "Order placed - " + l.name, who: l.telecaller || "Team" }));
  leads.slice(2, 3).forEach(l => items.push({ icon: "user", color: DT.sky, title: "New lead added - " + l.name, who: l.telecaller || "Team" }));

  const list = items.slice(0, 5);

  return (
    <div style={{ flex: 1, minWidth: 260, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Recent Activities</div>
        <button onClick={() => setActiveTab("leads")} style={{ background: "none", border: "none", color: DT.accent, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>View All</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
        {list.length === 0 && <div style={{ fontSize: 12, color: DT.t3, padding: "16px 0" }}>No recent activity yet.</div>}
        {list.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < list.length - 1 ? `1px solid ${DT.border}` : "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: it.color + "22", border: `1px solid ${it.color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <DIcon id={it.icon} size={14} color={it.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: DT.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
              <div style={{ fontSize: 11, color: DT.t3, marginTop: 1 }}>{it.who}</div>
            </div>
            <div style={{ fontSize: 10.5, color: DT.t3, flexShrink: 0 }}>{labels[i] || "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recent Leads grid (desktop) ───────────────────────────────────────────
function stageChipColorDesktop(stage) {
  if (stage === "New Lead") return DT.sky;
  if (stage === "Contacted") return DT.orange;
  if (stage === "Interested") return DT.emerald;
  if ((stage || "").includes("Sample")) return DT.purple;
  if ((stage || "").includes("Order") || stage === "Active Customer") return DT.accent;
  return DT.t3;
}

function RecentLeadsDesktop({ leads, setActiveTab }) {
  const list = leads.filter(l => l && l.name).slice(0, 4);
  return (
    <div style={{ flex: "1 1 100%", minWidth: 560, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Recent Leads</div>
        <button onClick={() => setActiveTab("leads")} style={{ background: "none", border: "none", color: DT.accent, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>View All</button>
      </div>
      {list.length === 0 ? (
        <div style={{ fontSize: 12, color: DT.t3, padding: "24px 0", textAlign: "center" }}>No leads yet — add your first lead from the CRM tab.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginTop: 14 }}>
          {list.map((l, i) => {
            const chip = stageChipColorDesktop(l.stage);
            const initials = (l.name || "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
            const phone = (l.contact || "").replace(/[^0-9]/g, "");
            return (
              <div key={i} style={{ background: DT.surface, border: `1px solid ${DT.border}`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${DT.indigo}, ${DT.sky})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DT.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: DT.t3 }}>{l.type || l.business || "Business"}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: chip, background: chip + "22", border: `1px solid ${chip}44`, borderRadius: 20, padding: "3px 8px", height: "fit-content", whiteSpace: "nowrap" }}>{l.stage}</span>
                </div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  {l.contact && <div style={{ fontSize: 11.5, color: DT.t2, display: "flex", alignItems: "center", gap: 6 }}><DIcon id="phone" size={11} color={DT.t3} />{l.contact}</div>}
                  {l.area && <div style={{ fontSize: 11.5, color: DT.t2, display: "flex", alignItems: "center", gap: 6 }}><DIcon id="pin" size={11} color={DT.t3} />{l.area}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${DT.border}` }}>
                  <button onClick={() => { if (phone) window.location.href = "tel:+91" + phone; }} style={{ flex: 1, background: DT.emerald + "1c", border: `1px solid ${DT.emerald}40`, borderRadius: 8, padding: "6px 0", cursor: "pointer" }}><DIcon id="call" size={13} color={DT.emerald} /></button>
                  <button onClick={() => { if (phone) window.open("https://wa.me/91" + phone, "_blank"); }} style={{ flex: 1, background: "#25D3661c", border: "1px solid #25D36640", borderRadius: 8, padding: "6px 0", cursor: "pointer" }}><DIcon id="chat" size={13} color="#25D366" /></button>
                  <button onClick={() => { if (l.area) window.open("https://maps.google.com/?q=" + encodeURIComponent(l.area), "_blank"); }} style={{ flex: 1, background: DT.sky + "1c", border: `1px solid ${DT.sky}40`, borderRadius: 8, padding: "6px 0", cursor: "pointer" }}><DIcon id="pin" size={13} color={DT.sky} /></button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: DT.t3 }}>
                  <span>Last Contact <b style={{ color: DT.t2 }}>{l.lastContact || "—"}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Full desktop dashboard home ──────────────────────────────────────────
// ── Regular Customers detail modal — shown from the Dashboard stat card ──
function RegularCustomersModal({ open, onClose, customers }) {
  if (!open) return null;
  const notToday = customers.filter(c => !c.orderedToday);
  return (
    <Sheet open={open} onClose={onClose} title={`Regular Customers (${customers.length})`}>
      <div style={{ fontSize: 12, color: T.t2, marginBottom: 14 }}>
        Ordered on more than 2 different days. {notToday.length > 0 && (
          <span style={{ color: T.amber, fontWeight: 700 }}>{notToday.length} haven't ordered today.</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
        {customers.map(c => (
          <div key={c.name} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 12px", borderRadius: 10,
            background: c.orderedToday ? T.cardHigh : T.amber + "14",
            border: `1px solid ${c.orderedToday ? T.border : T.amber + "44"}`,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: T.t3, marginTop: 2 }}>
                {c.orderCount} orders · {c.dayCount} days · {c.pattern}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {c.orderedToday ? (
                <Chip label="Ordered today" color={T.emerald} />
              ) : (
                <Chip label={`${c.daysSince}d since last order`} color={T.amber} />
              )}
            </div>
          </div>
        ))}
        {!customers.length && <div style={{ fontSize: 12, color: T.t3, textAlign: "center", padding: 20 }}>No regular customers yet.</div>}
      </div>
    </Sheet>
  );
}

function DesktopDashboardHome({ setActiveTab }) {
  const [leads] = useSheetSynced("leads", "leads", []);
  const [samples] = useSheetSynced("samples", "samples", []);
  const [repeatCustomers] = useSheetSynced("repeatCustomers", "repeatCustomers", []);
  const [dailyOrders] = useSheetSynced("dailyOrders", "dailyOrders", []);
  const [expenses] = useSheetSynced("expenses", "expenses", []);
  const [showRegularModal, setShowRegularModal] = useState(false);

  const activeLeads = (leads || []).filter(l => l && l.name && l.stage);
  const activeCustomers = activeLeads.filter(l => l.stage === "Active Customer").length;
  const ordersReceived = activeLeads.filter(l => ["Order Received", "Active Customer", "Repeat Order Follow-up"].includes(l.stage));
  const convRate = activeLeads.length > 0 ? Math.round((ordersReceived.length / activeLeads.length) * 100) : 0;

  const samplesSentKg = (samples || []).reduce((a, b) => a + (Number(b.qty) || 0), 0);

  // ── Regular customers — ordered on more than 2 distinct days ───────────
  const customerPatterns = computeCustomerPatterns(dailyOrders || []);
  const regularCustomers = customerPatterns.filter(c => c.isRegular);
  const regularNotToday = regularCustomers.filter(c => !c.orderedToday).length;

  // ── Revenue & Sales — sourced directly from Daily Orders (matches the Daily Orders page exactly) ──
  const today = todayISO();
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  const activeOrders = (dailyOrders || []).filter(o => o.status !== "Cancelled");
  const todaysOrders = activeOrders.filter(o => o.date === today);
  const yesterdaysOrders = activeOrders.filter(o => o.date === yesterday);
  const totalRevenue = todaysOrders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);
  const totalKg = todaysOrders.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0);
  const yestRevenue = yesterdaysOrders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);
  const yestKg = yesterdaysOrders.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0);
  const revenueChange = yestRevenue > 0 ? Math.round(((totalRevenue - yestRevenue) / yestRevenue) * 100) : (totalRevenue > 0 ? 100 : 0);
  const kgChange = yestKg > 0 ? Math.round(((totalKg - yestKg) / yestKg) * 100) : (totalKg > 0 ? 100 : 0);

  // ── Expenses — pulled from the Expenses log for today ──────────────────
  const todaysExpenses = (expenses || []).filter(e => e.date === today).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const yesterdaysExpenses = (expenses || []).filter(e => e.date === yesterday).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const netToday = totalRevenue - todaysExpenses;
  const expenseChange = yesterdaysExpenses > 0 ? Math.round(((todaysExpenses - yesterdaysExpenses) / yesterdaysExpenses) * 100) : (todaysExpenses > 0 ? 100 : 0);

  const stageCounts = {};
  activeLeads.forEach(l => { stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1; });
  const liveStages = PIPELINE_STAGES.map(s => ({ ...s, count: stageCounts[s.id] || 0 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <BatterGrinderHero theme={DT} kgToday={totalKg} />

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard icon="💰" iconBg={DT.purple + "26"} label="Today's Revenue" value={"₹" + totalRevenue.toLocaleString("en-IN")} change={revenueChange} color={DT.purple} />
        <StatCard icon="🛍️" iconBg={DT.emerald + "26"} label="Today's Sales" value={totalKg} unit="KG" change={kgChange} color={DT.emerald} />
        <StatCard icon="💸" iconBg={DT.rose + "26"} label="Today's Expenses" value={"₹" + todaysExpenses.toLocaleString("en-IN")} change={expenseChange} color={DT.rose} />
        <StatCard icon="📈" iconBg={(netToday >= 0 ? DT.emerald : DT.rose) + "26"} label="Net Profit (Today)" value={"₹" + netToday.toLocaleString("en-IN")} change={netToday >= 0 ? 1 : -1} color={netToday >= 0 ? DT.emerald : DT.rose} />
        <StatCard icon="🎯" iconBg={DT.sky + "26"} label="Conversion Rate" value={convRate + "%"} change={convRate > 0 ? 8 : 0} color={DT.sky} />
        <StatCard icon="🏪" iconBg={DT.orange + "26"} label="Active Customers" value={activeCustomers} change={activeCustomers > 0 ? 5 : 0} color={DT.orange} />
        <StatCard
          icon="🔁" iconBg={DT.indigo + "26"} label="Regular Customers"
          value={regularCustomers.length}
          color={DT.indigo}
          onClick={() => setShowRegularModal(true)}
          hint={regularNotToday > 0 ? `${regularNotToday} haven't ordered today · Tap for details` : "Tap for details"}
        />
        <StatCard icon="🧪" iconBg={DT.purple + "26"} label="Samples Sent" value={samplesSentKg} unit="KG" change={samplesSentKg > 0 ? -4 : 0} color={DT.purple} />
      </div>

      <RegularCustomersModal open={showRegularModal} onClose={() => setShowRegularModal(false)} customers={regularCustomers} />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        <SalesTrendChart orders={dailyOrders || []} />
        <PipelineFunnelDesktop liveStages={liveStages} totalLeads={activeLeads.length} />
        <TodayTasksDesktop leads={activeLeads} samples={samples || []} repeatCustomers={repeatCustomers || []} setActiveTab={setActiveTab} />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        <RecentLeadsDesktop leads={activeLeads} setActiveTab={setActiveTab} />
        <RecentActivitiesDesktop leads={activeLeads} samples={samples || []} repeatCustomers={repeatCustomers || []} setActiveTab={setActiveTab} />
      </div>
    </div>
  );
}

// ── Product Overview (desktop) — proportional bar per product, KG-wise ───
function ProductOverviewDesktop({ orders }) {
  const today = todayISO();
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const monthOrders = (orders || []).filter(o => o.status !== "Cancelled" && o.date >= monthStart && o.date <= today);
  const totals = PRODUCTS.map(p => {
    let kgs = 0;
    monthOrders.forEach(o => orderLineItems(o).forEach(i => { if (i.product === p.name) kgs += parseFloat(i.kgs) || 0; }));
    return { name: p.name, kgs };
  });
  const totalKg = totals.reduce((a, t) => a + t.kgs, 0);
  const denom = totalKg || 1;
  const colors = [DT.accent, DT.indigo, DT.orange, DT.rose];

  return (
    <div style={{ flex: 1, minWidth: 280, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Product Overview</div>
        <div style={{ background: DT.cardHi, border: `1px solid ${DT.borderHi}`, borderRadius: 8, padding: "5px 10px", fontSize: 11.5, color: DT.t2, fontWeight: 600 }}>This Month ⌄</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {totals.map((t, i) => {
          const pct = (t.kgs / denom) * 100;
          const widthPct = Math.max(pct, 8);
          return (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: `${widthPct}%`, maxWidth: "70%", background: colors[i % colors.length], borderRadius: 8, padding: "10px 0", textAlign: "center", color: "#fff", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>
                {Math.round(t.kgs).toLocaleString("en-IN")} KG
              </div>
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span style={{ color: DT.t2, fontWeight: 600 }}>{t.name}</span>
                <span style={{ color: DT.t3, fontWeight: 700 }}>{totalKg > 0 ? pct.toFixed(1) : "0.0"}%</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${DT.border}` }}>
        <span style={{ fontSize: 12, color: DT.t2, fontWeight: 600 }}>Total This Month</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: DT.accent }}>{Math.round(totalKg).toLocaleString("en-IN")} KG</span>
      </div>
    </div>
  );
}

// ── Revenue Summary donut (desktop) ───────────────────────────────────────
function RevenueSummaryDesktop({ todaysRevenue, weekRevenue, monthRevenue, allTimeRevenue }) {
  const segs = [
    { label: "Today", value: todaysRevenue, color: DT.accent },
    { label: "This Week", value: Math.max(weekRevenue - todaysRevenue, 0), color: DT.sky },
    { label: "This Month", value: Math.max(monthRevenue - weekRevenue, 0), color: DT.purple },
    { label: "Earlier", value: Math.max(allTimeRevenue - monthRevenue, 0), color: DT.rose },
  ];
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={{ flex: 1, minWidth: 280, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Revenue Summary</div>
      <div style={{ fontSize: 11.5, color: DT.t3, marginTop: 2 }}>This Month Overview</div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
        <svg width={136} height={136} viewBox="0 0 136 136" style={{ flexShrink: 0 }}>
          <g transform="translate(68,68) rotate(-90)">
            <circle r={R} fill="none" stroke={DT.border} strokeWidth={16} />
            {segs.map((s, i) => {
              const len = (s.value / total) * C;
              const el = <circle key={i} r={R} fill="none" stroke={s.color} strokeWidth={16} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
              offset += len;
              return el;
            })}
          </g>
          <text x="68" y="64" textAnchor="middle" fontSize="9.5" fill={DT.t3} fontFamily={FONT}>Total</text>
          <text x="68" y="80" textAnchor="middle" fontSize="13" fontWeight="800" fill={DT.t1} fontFamily={FONT}>₹{Math.round(total).toLocaleString("en-IN")}</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minWidth: 140 }}>
          {segs.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: DT.t2, fontWeight: 600, whiteSpace: "nowrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />{s.label}
              </span>
              <span style={{ color: DT.t1, fontWeight: 700, whiteSpace: "nowrap" }}>₹{Math.round(s.value).toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Today's Orders list (desktop) ─────────────────────────────────────────
function TodaysOrdersDesktop({ orders, setActiveTab }) {
  const today = todayISO();
  const list = (orders || []).filter(o => o.date === today).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);

  return (
    <div style={{ flex: 1, minWidth: 380, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Today's Orders</div>
          <div style={{ fontSize: 11, color: DT.t3, marginTop: 2 }}>All orders placed today</div>
        </div>
        <button onClick={() => document.getElementById("orders-by-date-section")?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ background: "none", border: "none", color: DT.accent, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>View All</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
        {list.length === 0 && <div style={{ fontSize: 12, color: DT.t3, padding: "20px 0", textAlign: "center" }}>No orders logged today yet.</div>}
        {list.map((o, i) => {
          const cancelled = o.status === "Cancelled";
          const items = orderLineItems(o);
          const col = o.orderType === "New Order" ? DT.accent : o.orderType === "Sample" ? DT.purple : DT.sky;
          return (
            <div key={o.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < list.length - 1 ? `1px solid ${DT.border}` : "none", opacity: cancelled ? 0.55 : 1 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: col + "22", border: `1px solid ${col}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: col, flexShrink: 0 }}>
                {(o.customer || "?").trim().charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: DT.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.customer}</div>
                <div style={{ fontSize: 11, color: DT.t3, marginTop: 1 }}>{o.area || "—"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: col, background: col + "1c", border: `1px solid ${col}40`, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{o.orderType === "New Order" ? "NEW ORDER" : o.orderType === "Sample" ? `SAMPLE (${(o.sampleType || "FREE").toUpperCase()})` : "REGULAR ORDER"}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: DT.sky, background: DT.sky + "1c", border: `1px solid ${DT.sky}40`, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{items.map(it => `${it.product} - ${it.kgs}KG`).join(", ")}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: DT.emerald, flexShrink: 0, width: 66, textAlign: "right" }}>₹{(o.amount || 0).toLocaleString("en-IN")}</div>
              <div style={{ fontSize: 10.5, color: DT.t3, flexShrink: 0, width: 60, textAlign: "right" }}>{o.createdAt ? new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
              <DIcon id="chevron" size={14} color={DT.t3} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Daily Summary list (desktop) ──────────────────────────────────────────
function DailySummaryDesktop({ orders, setActiveTab }) {
  const active = (orders || []).filter(o => o.status !== "Cancelled");
  const byDate = {};
  active.forEach(o => {
    if (!byDate[o.date]) byDate[o.date] = { newCount: 0, regularCount: 0, sampleCount: 0, kgs: 0, revenue: 0 };
    const b = byDate[o.date];
    if (o.orderType === "New Order") b.newCount += 1;
    else if (o.orderType === "Regular Order") b.regularCount += 1;
    else b.sampleCount += 1;
    b.kgs += parseFloat(o.kgs) || 0;
    b.revenue += parseFloat(o.amount) || 0;
  });
  const rows = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5);

  return (
    <div style={{ flex: 1, minWidth: 380, background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Daily Summary</div>
          <div style={{ fontSize: 11, color: DT.t3, marginTop: 2 }}>New vs regular, total KGs and revenue</div>
        </div>
        <button onClick={() => document.getElementById("orders-by-date-section")?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ background: "none", border: "none", color: DT.accent, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>View Full History</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
        {rows.length === 0 && <div style={{ fontSize: 12, color: DT.t3, padding: "20px 0", textAlign: "center" }}>No orders logged yet.</div>}
        {rows.map(([date, s], i) => (
          <div key={date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 0", borderBottom: i < rows.length - 1 ? `1px solid ${DT.border}` : "none" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: DT.t1, minWidth: 96 }}>{formatDateReadable(date)}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: DT.accent, background: DT.accent + "1c", border: `1px solid ${DT.accent}40`, borderRadius: 20, padding: "3px 8px" }}>{s.newCount} NEW</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: DT.sky, background: DT.sky + "1c", border: `1px solid ${DT.sky}40`, borderRadius: 20, padding: "3px 8px" }}>{s.regularCount} REGULAR</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: DT.orange, background: DT.orange + "1c", border: `1px solid ${DT.orange}40`, borderRadius: 20, padding: "3px 8px" }}>{Math.round(s.kgs)} KG</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: DT.emerald, background: DT.emerald + "1c", border: `1px solid ${DT.emerald}40`, borderRadius: 20, padding: "3px 8px" }}>₹{Math.round(s.revenue).toLocaleString("en-IN")}</span>
              <DIcon id="chevron" size={14} color={DT.t3} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Full desktop Daily Orders home (dashboard-style overview) ─────────────
function DesktopDailyOrdersHome({ setActiveTab }) {
  const [dailyOrders] = useSheetSynced("dailyOrders", "dailyOrders", []);
  const [leads] = useSheetSynced("leads", "leads", []);

  const today = todayISO();
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  const active = (dailyOrders || []).filter(o => o.status !== "Cancelled");
  const todaysOrders = active.filter(o => o.date === today);
  const yestOrders = active.filter(o => o.date === yesterday);

  const todaysNew = todaysOrders.filter(o => o.orderType === "New Order").length;
  const todaysRegular = todaysOrders.filter(o => o.orderType === "Regular Order").length;
  const todaysKg = todaysOrders.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0);
  const todaysRevenue = todaysOrders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);

  const yestNew = yestOrders.filter(o => o.orderType === "New Order").length;
  const yestRegular = yestOrders.filter(o => o.orderType === "Regular Order").length;
  const yestKg = yestOrders.reduce((a, o) => a + (parseFloat(o.kgs) || 0), 0);
  const yestRevenue = yestOrders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);

  const pctChange = (now, prev) => prev > 0 ? Math.round(((now - prev) / prev) * 100) : (now > 0 ? 100 : 0);

  const activeCustomers = (leads || []).filter(l => l && l.stage === "Active Customer").length;

  const startOfWeekISO = (() => { const d = new Date(); const day = d.getDay(); const diff = day === 0 ? 6 : day - 1; d.setDate(d.getDate() - diff); return d.toISOString().slice(0, 10); })();
  const startOfMonthISO = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const weekRevenue = active.filter(o => o.date >= startOfWeekISO && o.date <= today).reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);
  const monthRevenue = active.filter(o => o.date >= startOfMonthISO && o.date <= today).reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);
  const allTimeRevenue = active.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard icon="🆕" iconBg={DT.accent + "26"} label="Today's Orders" value={todaysNew} unit="New Orders" change={pctChange(todaysNew, yestNew)} color={DT.accent} />
        <StatCard icon="🔁" iconBg={DT.sky + "26"} label="Regular Orders" value={todaysRegular} unit="Today" change={pctChange(todaysRegular, yestRegular)} color={DT.sky} />
        <StatCard icon="⚖️" iconBg={DT.purple + "26"} label="Total KGs" value={Math.round(todaysKg)} unit="KG Today" change={pctChange(todaysKg, yestKg)} color={DT.purple} />
        <StatCard icon="💰" iconBg={DT.orange + "26"} label="Today Revenue" value={"₹" + Math.round(todaysRevenue).toLocaleString("en-IN")} change={pctChange(todaysRevenue, yestRevenue)} color={DT.orange} />
        <StatCard icon="🏪" iconBg={DT.emerald + "26"} label="Active Customers" value={activeCustomers} unit="Total" change={activeCustomers > 0 ? 5 : 0} color={DT.emerald} />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        <ProductOverviewDesktop orders={dailyOrders || []} />
        <RevenueSummaryDesktop todaysRevenue={todaysRevenue} weekRevenue={weekRevenue} monthRevenue={monthRevenue} allTimeRevenue={allTimeRevenue} />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        <TodaysOrdersDesktop orders={dailyOrders || []} setActiveTab={setActiveTab} />
        <DailySummaryDesktop orders={dailyOrders || []} setActiveTab={setActiveTab} />
      </div>
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div style={{ background: DT.card, border: `1px solid ${DT.border}`, borderRadius: 16, padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚙️</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: DT.t1 }}>Settings</div>
      <div style={{ fontSize: 12.5, color: DT.t3, marginTop: 6 }}>Account and workspace settings are coming soon.</div>
    </div>
  );
}

// ── Desktop shell wrapping sidebar + topbar + module content ─────────────
function DesktopShell({ activeTab, setActiveTab, role, setRole, leadsCount, renderModule }) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: DT.bg, fontFamily: FONT }}>
      <style>{`
        * { box-sizing: border-box; }
        body { background: ${DT.bg}; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${DT.borderHi}; border-radius: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        input::placeholder { color: ${DT.t3}; }
      `}</style>
      <DesktopSidebar activeTab={activeTab} setActiveTab={setActiveTab} collapsed={collapsed} setCollapsed={setCollapsed} leadsCount={leadsCount} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <DesktopTopbar role={role} setRole={setRole} search={search} setSearch={setSearch} collapsed={collapsed} setCollapsed={setCollapsed} notifCount={3} setActiveTab={setActiveTab} />
        <div style={{ flex: 1, padding: "24px 28px 60px" }}>
          {activeTab === "dashboard" ? (
            <DesktopDashboardHome setActiveTab={setActiveTab} />
          ) : activeTab === "settings" ? (
            <SettingsPlaceholder />
          ) : activeTab === "dailyorders" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <DesktopDailyOrdersHome setActiveTab={setActiveTab} />
              <div style={{ background: T.bg, borderRadius: 16, overflow: "hidden" }}>
                {renderModule({ embedded: true })}
              </div>
            </div>
          ) : (
            <div style={{ background: T.bg, borderRadius: 16, overflow: "hidden" }}>
              {renderModule()}
            </div>
          )}
        </div>
      </div>
      <button
        style={{ position: "fixed", bottom: 28, right: 28, width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${DT.accent}, ${DT.sky})`, border: "none", color: "#04140F", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: `0 10px 26px ${DT.accentGlow}` }}
        onClick={() => setActiveTab("leads")}>
        <DIcon id="plus" size={22} color="#04140F" strokeWidth={2.6} />
      </button>
    </div>
  );
}


// ─── LOGIN HERO — a small "movie": batter is ground fresh at the Sridhi
// factory, loaded onto the delivery truck, and driven out to happy hotels,
// restaurants, caterers and PG/hostel kitchens — each lighting up with a
// smile as the truck arrives. Pure SVG + CSS keyframes, no image assets,
// drawn entirely in the brand's forest-green / emerald / gold palette so it
// reads as one continuous scene rather than a bolted-on graphic.
function FactoryHero() {
  return (
    <div style={{ width: "100%", maxWidth: 430, margin: "0 auto 8px", position: "relative", overflow: "hidden", borderRadius: 18 }}>
      <style>{`
        @keyframes svGrind    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes svSteamA   { 0% { transform: translateY(0) scaleX(1); opacity:0; } 18% { opacity:.6; } 100% { transform: translateY(-26px) scaleX(1.3); opacity:0; } }
        @keyframes svSteamB   { 0% { transform: translateY(0) scaleX(1); opacity:0; } 22% { opacity:.5; } 100% { transform: translateY(-32px) scaleX(1.4); opacity:0; } }
        @keyframes svBob      { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-2.5px) rotate(-2deg); } }
        @keyframes svStir     { 0%,100% { transform: rotate(-14deg); } 50% { transform: rotate(14deg); } }
        @keyframes svSizzle   { 0%,100% { opacity:.85; } 50% { opacity:1; } }
        @keyframes svRoad     { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -48; } }
        @keyframes svWheel    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes svShine    { 0%,85%,100% { transform: translateX(-140px) skewX(-18deg); opacity:0; } 90% { opacity:.35; } 95% { transform: translateX(720px) skewX(-18deg); opacity:0; } }

        @keyframes svTruckMove {
          0%   { transform: translateX(0px); }
          6%   { transform: translateX(0px); }
          20%  { transform: translateX(150px); }
          30%  { transform: translateX(150px); }
          44%  { transform: translateX(280px); }
          54%  { transform: translateX(280px); }
          68%  { transform: translateX(410px); }
          78%  { transform: translateX(410px); }
          92%  { transform: translateX(536px); }
          100% { transform: translateX(536px); }
        }
        @keyframes svTruckFade {
          0% { opacity:0; } 4% { opacity:1; } 96% { opacity:1; } 100% { opacity:0; }
        }
        @keyframes svDust {
          0%,100% { opacity:0; } 10%,92% { opacity:.45; } 50% { opacity:.2; }
        }
        @keyframes svBubHotel {
          0%,17%,36%,100% { opacity:0; transform:scale(.4) translateY(6px); }
          21%,31%          { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes svBubResto {
          0%,41%,60%,100% { opacity:0; transform:scale(.4) translateY(6px); }
          45%,55%          { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes svBubCater {
          0%,65%,84%,100% { opacity:0; transform:scale(.4) translateY(6px); }
          69%,79%          { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes svBubPg {
          0%,89%,100%      { opacity:0; transform:scale(.4) translateY(6px); }
          93%,98%          { opacity:1; transform:scale(1) translateY(0); }
        }

        .sv-hero * { transform-box: fill-box; transform-origin: center; }
        .sv-grinder-wheel { animation: svGrind 5s linear infinite; }
        .sv-steam-1 { animation: svSteamA 2.4s ease-in-out infinite; }
        .sv-steam-2 { animation: svSteamB 2.8s ease-in-out infinite .5s; }
        .sv-steam-3 { animation: svSteamA 2.6s ease-in-out infinite 1.1s; }
        .sv-worker-l { animation: svBob 2.2s ease-in-out infinite; }
        .sv-ladle { animation: svStir 1.8s ease-in-out infinite; }
        .sv-sizzle { animation: svSizzle 1.2s ease-in-out infinite; }
        .sv-road { animation: svRoad 1.1s linear infinite; }
        .sv-wheel { animation: svWheel 0.7s linear infinite; }
        .sv-shine { animation: svShine 7s ease-in-out infinite; }
        .sv-truck-move { animation: svTruckMove 16s cubic-bezier(.45,0,.55,1) infinite; }
        .sv-truck-fade { animation: svTruckFade 16s linear infinite; }
        .sv-dust { animation: svDust 16s linear infinite; }
        .sv-bub-hotel  { animation: svBubHotel 16s linear infinite; transform-origin: center bottom; }
        .sv-bub-resto  { animation: svBubResto 16s linear infinite; transform-origin: center bottom; }
        .sv-bub-cater  { animation: svBubCater 16s linear infinite; transform-origin: center bottom; }
        .sv-bub-pg     { animation: svBubPg 16s linear infinite; transform-origin: center bottom; }
      `}</style>
      <svg className="sv-hero" viewBox="0 0 640 210" style={{ display: "block", width: "100%", height: "auto" }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="svGlow" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#1a8f52" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0a2e1c" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="svBatter" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fdf7e8" /><stop offset="100%" stopColor="#f3e6c4" />
          </linearGradient>
          <linearGradient id="svSteel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cfd8d4" /><stop offset="100%" stopColor="#93a29c" />
          </linearGradient>
          <linearGradient id="svSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e3b25" /><stop offset="100%" stopColor="#0a2717" />
          </linearGradient>
          <clipPath id="svSceneClip"><rect x="0" y="0" width="640" height="210" rx="18" /></clipPath>
        </defs>

        <g clipPath="url(#svSceneClip)">
          <rect x="0" y="0" width="640" height="210" fill="url(#svSky)" />
          <ellipse cx="320" cy="90" rx="340" ry="120" fill="url(#svGlow)" />
          {/* cinematic light sweep */}
          <rect className="sv-shine" x="0" y="0" width="60" height="210" fill="#ffffff" opacity="0" />

          {/* road */}
          <line x1="6" y1="180" x2="634" y2="180" stroke="#123322" strokeWidth="3" opacity="0.5" />
          <line className="sv-road" x1="6" y1="180" x2="634" y2="180" stroke="#3fae7a" strokeWidth="2" strokeDasharray="10 14" opacity="0.55" />

          {/* ── FACTORY (grinder + worker) ── */}
          <g transform="translate(18,86)">
            <ellipse cx="30" cy="70" rx="36" ry="8" fill="#0d2e1c" opacity="0.3" />
            <rect x="8" y="24" width="44" height="42" rx="9" fill="url(#svSteel)" stroke="#5c6d66" strokeWidth="1.4" />
            <circle className="sv-grinder-wheel" cx="30" cy="24" r="27" fill="#e9ede9" stroke="#8a9992" strokeWidth="2" />
            <circle cx="30" cy="24" r="27" fill="none" stroke="#c7d1cb" strokeWidth="1" strokeDasharray="2 5" />
            <circle cx="30" cy="24" r="6.5" fill="#17794a" />
            <rect x="26.5" y="1" width="7" height="12" rx="3" fill="#17794a" />
          </g>
          <g transform="translate(96,46)">
            <g className="sv-worker-l">
              <circle cx="24" cy="8" r="9.5" fill="#0c3a24" />
              <path d="M8 40 Q10 20 24 19 Q38 20 40 40 Z" fill="#17794a" />
              <g className="sv-ladle" style={{ transformOrigin: "24px 28px" }}>
                <rect x="22" y="8" width="3.4" height="24" rx="1.7" fill="#c98a1c" />
                <circle cx="24" cy="34" r="5" fill="#e8b64a" />
              </g>
            </g>
            <path d="M-4 52 Q24 74 52 52 L47 56 Q24 68 1 56 Z" fill="#7d8b85" />
            <ellipse cx="24" cy="50" rx="26" ry="9" fill="url(#svBatter)" stroke="#e2d3a3" strokeWidth="1.3" />
            <path className="sv-steam-1" d="M14 44 Q11 37 16 32" stroke="#dfe9e3" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0" />
            <path className="sv-steam-2" d="M34 44 Q37 37 32 32" stroke="#dfe9e3" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0" />
          </g>
          <text x="30" y="196" fontSize="9" fontWeight="700" fill="#8fd4b0" textAnchor="middle" fontFamily="Arial, sans-serif">FACTORY</text>

          {/* ── DESTINATIONS ── */}
          {/* Hotel */}
          <g transform="translate(200,108)">
            <rect x="0" y="18" width="40" height="46" rx="3" fill="#e9eef0" />
            <polygon points="-4,18 44,18 20,2" fill="#caa14a" />
            <rect x="14" y="42" width="12" height="22" rx="2" fill="#123322" />
            <rect x="4" y="26" width="8" height="8" rx="1.5" fill="#123322" opacity="0.7" />
            <rect x="28" y="26" width="8" height="8" rx="1.5" fill="#123322" opacity="0.7" />
            <circle cx="20" cy="10" r="3.2" fill="#fff" />
            <g className="sv-bub-hotel" style={{ opacity: 0 }}>
              <circle cx="20" cy="-10" r="11" fill="#fff" />
              <circle cx="16" cy="-12" r="1.6" fill="#0c3a24" /><circle cx="24" cy="-12" r="1.6" fill="#0c3a24" />
              <path d="M14 -7 Q20 -2 26 -7" stroke="#0c3a24" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </g>
            <text x="20" y="78" fontSize="9" fontWeight="700" fill="#8fd4b0" textAnchor="middle" fontFamily="Arial, sans-serif">HOTEL</text>
          </g>

          {/* Restaurant */}
          <g transform="translate(330,108)">
            <rect x="0" y="20" width="40" height="44" rx="3" fill="#eef0e9" />
            <rect x="-4" y="12" width="48" height="9" rx="3" fill="#b6462f" />
            <rect x="-4" y="12" width="12" height="9" fill="#eee" /><rect x="20" y="12" width="12" height="9" fill="#eee" />
            <rect x="14" y="42" width="12" height="22" rx="2" fill="#123322" />
            <path d="M8 30 v8 M8 30 h1.6 M8 30 h-1.6 M6.6 30 v4" stroke="#123322" strokeWidth="1.1" fill="none" strokeLinecap="round" />
            <circle cx="32" cy="30" r="0.9" fill="#123322" /><path d="M32 27.5 v3 M30.5 27.5 v6 a1.5 1.5 0 0 0 3 0 v-6" stroke="#123322" strokeWidth="1" fill="none" />
            <g className="sv-bub-resto" style={{ opacity: 0 }}>
              <circle cx="20" cy="-6" r="11" fill="#fff" />
              <circle cx="16" cy="-8" r="1.6" fill="#0c3a24" /><circle cx="24" cy="-8" r="1.6" fill="#0c3a24" />
              <path d="M14 -3 Q20 2 26 -3" stroke="#0c3a24" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </g>
            <text x="20" y="78" fontSize="9" fontWeight="700" fill="#8fd4b0" textAnchor="middle" fontFamily="Arial, sans-serif">RESTAURANT</text>
          </g>

          {/* Catering (tent) */}
          <g transform="translate(460,104)">
            <polygon points="20,0 44,44 -4,44" fill="#17794a" />
            <polygon points="20,0 32,44 8,44" fill="#0f5c39" />
            <rect x="4" y="44" width="32" height="4" fill="#0d2e1c" opacity="0.4" />
            <ellipse cx="20" cy="58" rx="16" ry="4.5" fill="#caa14a" />
            <ellipse cx="20" cy="56.5" rx="12" ry="3.2" fill="#f3e6c4" />
            <g className="sv-bub-cater" style={{ opacity: 0 }}>
              <circle cx="20" cy="-14" r="11" fill="#fff" />
              <circle cx="16" cy="-16" r="1.6" fill="#0c3a24" /><circle cx="24" cy="-16" r="1.6" fill="#0c3a24" />
              <path d="M14 -11 Q20 -6 26 -11" stroke="#0c3a24" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </g>
            <text x="20" y="82" fontSize="9" fontWeight="700" fill="#8fd4b0" textAnchor="middle" fontFamily="Arial, sans-serif">CATERING</text>
          </g>

          {/* PG / Hostel */}
          <g transform="translate(578,92)">
            <rect x="0" y="6" width="40" height="58" rx="3" fill="#e4e9e6" />
            {[0, 1, 2].map(row => (
              <g key={row}>
                <rect x="5" y={13 + row * 15} width="7" height="7" rx="1.2" fill="#123322" opacity="0.7" />
                <rect x="17" y={13 + row * 15} width="7" height="7" rx="1.2" fill="#123322" opacity="0.7" />
                <rect x="29" y={13 + row * 15} width="7" height="7" rx="1.2" fill="#123322" opacity="0.7" />
              </g>
            ))}
            <g className="sv-bub-pg" style={{ opacity: 0 }}>
              <circle cx="20" cy="-8" r="11" fill="#fff" />
              <circle cx="16" cy="-10" r="1.6" fill="#0c3a24" /><circle cx="24" cy="-10" r="1.6" fill="#0c3a24" />
              <path d="M14 -5 Q20 0 26 -5" stroke="#0c3a24" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </g>
            <text x="20" y="80" fontSize="9" fontWeight="700" fill="#8fd4b0" textAnchor="middle" fontFamily="Arial, sans-serif">PG / HOSTEL</text>
          </g>

          {/* ── DELIVERY TRUCK — drives the full route, looping ── */}
          <g className="sv-truck-fade" opacity="0">
            <g className="sv-truck-move">
              <ellipse className="sv-dust" cx="42" cy="182" rx="34" ry="4" fill="#caa14a" opacity="0" />
              <g transform="translate(30,138)">
                <rect x="0" y="4" width="34" height="26" rx="3" fill="#e9ede9" stroke="#8a9992" strokeWidth="1.2" />
                <text x="17" y="20" fontSize="8.5" fontWeight="900" fill="#17794a" textAnchor="middle" fontFamily="Arial, sans-serif">SRIDHI</text>
                <path d="M34 30 h14 v-14 l8 0 a3 3 0 0 1 3 2.4 l3 9.2 a3 3 0 0 1 .1 .9 v1.5 h-4" fill="#17794a" stroke="#0f5c39" strokeWidth="1" />
                <rect x="46" y="18" width="9" height="7" rx="1" fill="#cfe9dc" opacity="0.85" />
                <circle className="sv-wheel" cx="9" cy="32" r="5.5" fill="#1c1f1e" stroke="#555" strokeWidth="1" />
                <circle className="sv-wheel" cx="49" cy="32" r="5.5" fill="#1c1f1e" stroke="#555" strokeWidth="1" />
                <circle cx="9" cy="32" r="1.6" fill="#8a9992" /><circle cx="49" cy="32" r="1.6" fill="#8a9992" />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

// ─── Sand-pour reveal for the brand title — small amber/gold grains fall and
// settle as the "Sridhi Ventures" wordmark wipes into view, like batter/flour
// pouring into the name. Plays once on mount (fill-mode forwards).
function SandTitle({ children, style }) {
  const particles = useMemo(() => (
    Array.from({ length: 26 }, (_, i) => ({
      left: (i * 37) % 100,
      size: 2 + ((i * 13) % 4),
      delay: (i % 9) * 0.05,
      dur: 0.9 + (i % 5) * 0.12,
    }))
  ), []);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <style>{`
        @keyframes sandFall   { 0% { transform: translateY(-34px); opacity:0; } 45% { opacity:.9; } 100% { transform: translateY(26px); opacity:0; } }
        @keyframes sandReveal { 0% { clip-path: inset(0 100% 0 0); } 100% { clip-path: inset(0 0 0 0); } }
        .sand-grain  { position:absolute; top:-18px; border-radius:50%; background:#e8b64a; animation-name: sandFall; animation-timing-function: ease-in; animation-fill-mode: forwards; animation-iteration-count: 1; }
        .sand-reveal { animation: sandReveal 1.15s cubic-bezier(.22,1,.36,1) both; }
      `}</style>
      {particles.map((p, i) => (
        <span key={i} className="sand-grain" style={{ left: `${p.left}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />
      ))}
      <div className="sand-reveal" style={style}>{children}</div>
    </div>
  );
}

// ─── Live clock for the desktop login header ───────────────────────────────
function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return {
    dateStr: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
    timeStr: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

// Small inline icon set just for the desktop login screen.
function LIcon({ id, size = 26, color = "currentColor" }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (id) {
    case "shieldlock": return <svg {...p}><path d="M12 2l8 3.5v6c0 5-3.4 8.7-8 10.5-4.6-1.8-8-5.5-8-10.5v-6z"/><rect x="9" y="11" width="6" height="5" rx="1.3"/><path d="M10.3 11V9.3a1.7 1.7 0 0 1 3.4 0V11"/></svg>;
    case "phone":      return <svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.8 2.1z"/></svg>;
    case "truck":      return <svg {...p}><rect x="1" y="7" width="13" height="10" rx="1.4"/><path d="M14 10h4l4 3.4V17h-8z"/><circle cx="6" cy="19.4" r="1.7"/><circle cx="17.5" cy="19.4" r="1.7"/></svg>;
    case "chart":      return <svg {...p}><path d="M4 20V11"/><path d="M12 20V4"/><path d="M20 20v-7"/></svg>;
    case "calendar":   return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/></svg>;
    case "download":   return <svg {...p}><path d="M12 3v13"/><path d="m6 11 6 6 6-6"/><path d="M4 21h16"/></svg>;
    case "devicecheck":return <svg {...p}><rect x="6" y="2" width="12" height="20" rx="2.4"/><path d="M10 18h4"/></svg>;
    case "shieldcheck":return <svg {...p}><path d="M12 2l8 3.5v6c0 5-3.4 8.7-8 10.5-4.6-1.8-8-5.5-8-10.5v-6z"/><path d="m9 12 2 2 4-4"/></svg>;
    case "bolt":       return <svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>;
    case "cloud":      return <svg {...p}><path d="M7 18a4.5 4.5 0 0 1-.7-8.94A5.5 5.5 0 0 1 17 8a4 4 0 0 1-.4 8H7z"/><path d="M12 12v6"/><path d="m9.5 15.5 2.5-2.5 2.5 2.5"/></svg>;
    case "team":       return <svg {...p}><circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M3 20v-.6A5.4 5.4 0 0 1 8.4 14h1.2A5.4 5.4 0 0 1 15 19.4V20"/><path d="M16 14.3a4.2 4.2 0 0 1 5 4.1V20"/></svg>;
    case "chevron":    return <svg {...p} strokeWidth="2.6"><polyline points="9 6 15 12 9 18"/></svg>;
    default: return null;
  }
}

// ─── Desktop login skyline — dark building silhouettes with warm lit
// windows: factory silo (steaming), two shopfronts, a delivery van, a tree,
// and an apartment tower — sitting on a glowing brand-green ground arc.
function DesktopSkyline() {
  return (
    <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
      <style>{`
        @keyframes dsGlowPulse { 0%,100% { opacity:.55; } 50% { opacity:.9; } }
        @keyframes dsSteam     { 0% { transform:translateY(0) scaleX(1); opacity:0; } 20% { opacity:.6; } 100% { transform:translateY(-22px) scaleX(1.4); opacity:0; } }
        @keyframes dsWinFlick  { 0%,92%,100% { opacity:1; } 95% { opacity:.4; } }
        @keyframes dsSceneIn   { 0% { transform:translateY(26px); opacity:0; } 100% { transform:translateY(0); opacity:1; } }
        @keyframes dsTruckIn   { 0% { transform:translateX(-220px); opacity:0; } 65% { opacity:1; } 100% { transform:translateX(0); opacity:1; } }
        @keyframes dsLightning { 0%,100% { opacity:0; } 1%,2.4% { opacity:1; } 3.2% { opacity:.15; } 4.4%,5.6% { opacity:.85; } 6.4% { opacity:0; } }
        @keyframes dsArcDrawIn { 0% { stroke-dashoffset: 620; opacity:0; } 8% { opacity:1; } 100% { stroke-dashoffset: 0; opacity:1; } }
        .ds-scene { animation: dsSceneIn 1s cubic-bezier(.22,1,.36,1) both; }
        .ds-arc { stroke-dasharray: 620; animation: dsArcDrawIn 1.3s cubic-bezier(.3,.8,.4,1) both, dsGlowPulse 3.4s ease-in-out infinite 1.3s; }
        .ds-steam1 { animation: dsSteam 2.6s ease-in-out infinite; }
        .ds-steam2 { animation: dsSteam 3s ease-in-out infinite .7s; }
        .ds-win-a { animation: dsWinFlick 5s ease-in-out infinite; }
        .ds-win-b { animation: dsWinFlick 6.2s ease-in-out infinite 1.4s; }
        .ds-truck { animation: dsTruckIn 1.1s cubic-bezier(.2,.9,.3,1) both 0.5s; }
        .ds-bolt { animation: dsLightning 7s ease-in-out infinite; }
        .ds-bolt2 { animation: dsLightning 8.5s ease-in-out infinite 2.4s; }
      `}</style>
      <svg viewBox="0 0 640 190" width="100%" height="auto" style={{ display: "block" }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="dsWin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd97a" /><stop offset="100%" stopColor="#f0b23c" />
          </linearGradient>
          <radialGradient id="dsGround" cx="50%" cy="0%" r="75%">
            <stop offset="0%" stopColor="#1fe0b8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1fe0b8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="ds-scene">
          {/* big glowing arc behind the skyline — draws itself in, then pulses */}
          <path className="ds-arc" d="M40 168 C 40 40, 600 40, 600 168" fill="none" stroke="#22e0a8" strokeWidth="2.5" opacity="0.7" />
          {/* lightning crackle accents off the arc */}
          <path className="ds-bolt" d="M120 90 L134 100 L124 104 L142 122" fill="none" stroke="#c9fff0" strokeWidth="1.6" strokeLinecap="round" opacity="0" />
          <path className="ds-bolt2" d="M520 88 L508 98 L518 102 L500 120" fill="none" stroke="#c9fff0" strokeWidth="1.6" strokeLinecap="round" opacity="0" />
          {/* ground glow + baseline */}
          <ellipse cx="320" cy="176" rx="300" ry="16" fill="url(#dsGround)" />
          <line x1="30" y1="176" x2="610" y2="176" stroke="#1fe0b8" strokeWidth="2" opacity="0.8" />

          {/* factory silo + steaming bowl */}
          <g transform="translate(58,90)">
            <rect x="0" y="26" width="30" height="60" rx="4" fill="#123322" stroke="#1fe0b8" strokeWidth="1" opacity="0.9" />
            <rect x="-4" y="20" width="38" height="8" rx="3" fill="#0d2e1c" />
            <path d="M15 20 a7 7 0 0 1 -7 -7 a7 7 0 0 1 7 -7 a5 5 0 0 1 5 5" fill="none" stroke="#22e0a8" strokeWidth="2" strokeLinecap="round" />
            <circle cx="15" cy="12" r="2.4" fill="#22e0a8" />
          </g>
          <g transform="translate(96,104)">
            <ellipse cx="20" cy="44" rx="22" ry="6" fill="#0d2e1c" />
            <path d="M2 40 Q20 56 38 40 L34 44 Q20 52 6 44 Z" fill="#1c1f1e" />
            <ellipse cx="20" cy="38" rx="18" ry="7" fill="#f2f2ec" />
            <path className="ds-steam1" d="M12 30 Q9 22 14 16" stroke="#bff2df" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0" />
            <path className="ds-steam2" d="M28 30 Q31 22 26 16" stroke="#bff2df" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0" />
          </g>

          {/* house 1 */}
          <g transform="translate(180,108)">
            <polygon points="0,26 40,26 20,4" fill="#0f1a14" />
            <rect x="4" y="26" width="32" height="40" fill="#12201a" />
            <rect className="ds-win-a" x="10" y="36" width="8" height="10" rx="1.4" fill="url(#dsWin)" />
            <rect className="ds-win-b" x="22" y="36" width="8" height="10" rx="1.4" fill="url(#dsWin)" />
            <rect x="15" y="52" width="10" height="14" fill="#08150f" />
          </g>
          {/* house 2 */}
          <g transform="translate(255,102)">
            <polygon points="0,30 46,30 23,6" fill="#0f1a14" />
            <rect x="4" y="30" width="38" height="46" fill="#12201a" />
            <rect className="ds-win-b" x="10" y="40" width="9" height="11" rx="1.4" fill="url(#dsWin)" />
            <rect className="ds-win-a" x="27" y="40" width="9" height="11" rx="1.4" fill="url(#dsWin)" />
            <rect x="17" y="58" width="12" height="18" fill="#08150f" />
          </g>

          {/* delivery van — drives in from off-screen left as part of the intro */}
          <g className="ds-truck" transform="translate(345,138)">
            <ellipse cx="26" cy="34" rx="30" ry="5" fill="#0d2e1c" opacity="0.6" />
            <rect x="0" y="8" width="34" height="20" rx="2.4" fill="#e9ede9" />
            <text x="17" y="21" fontSize="7" fontWeight="900" fill="#17794a" textAnchor="middle" fontFamily="Arial, sans-serif">SRIDHI</text>
            <path d="M34 28 h12 v-11 l7 0 a2.6 2.6 0 0 1 2.5 2 l2.3 7.4 a2.6 2.6 0 0 1 .1 .8 v.8 h-3.4" fill="#1fae7c" stroke="#0f5c39" strokeWidth="0.8" />
            <rect x="44" y="18" width="7.5" height="6" rx="1" fill="#cfe9dc" opacity="0.85" />
            <circle cx="9" cy="30" r="4.6" fill="#141414" /><circle cx="46" cy="30" r="4.6" fill="#141414" />
          </g>

          {/* tree */}
          <g transform="translate(432,120)">
            <rect x="12" y="34" width="6" height="18" fill="#3a2a18" />
            <polygon points="15,0 30,30 0,30" fill="#0f5c39" />
            <polygon points="15,12 27,38 3,38" fill="#0d4a2e" />
          </g>

          {/* apartment tower */}
          <g transform="translate(486,60)">
            <rect x="0" y="0" width="66" height="116" rx="3" fill="#0f1a14" stroke="#1c3a2a" strokeWidth="1" />
            {Array.from({ length: 5 }, (_, row) => (
              <g key={row}>
                {[0, 1, 2, 3].map(col => (
                  <rect key={col}
                    className={(row + col) % 3 === 0 ? "ds-win-a" : (row + col) % 3 === 1 ? "ds-win-b" : ""}
                    x={8 + col * 14} y={10 + row * 20} width="9" height="12" rx="1.3"
                    fill={(row * 4 + col) % 4 === 3 ? "#1c2b24" : "url(#dsWin)"} />
                ))}
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}

// ─── Desktop login background — deep space gradient, drifting glow waves,
// and a scatter of twinkling data-points. ─────────────────────────────────
function DesktopLoginBackdrop() {
  const dots = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    left: (i * 29) % 100, top: (i * 53) % 100,
    size: 1.4 + (i % 3) * 0.8, delay: (i % 10) * 0.4, dur: 3 + (i % 5),
  })), []);
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
      <style>{`
        @keyframes dbTwinkle { 0%,100% { opacity:.15; } 50% { opacity:.9; } }
        @keyframes dbWaveA { 0% { transform: translateX(-4%) translateY(0); } 50% { transform: translateX(2%) translateY(-1.5%); } 100% { transform: translateX(-4%) translateY(0); } }
        @keyframes dbWaveB { 0% { transform: translateX(3%) translateY(0); } 50% { transform: translateX(-3%) translateY(1.5%); } 100% { transform: translateX(3%) translateY(0); } }
        .db-dot { position:absolute; border-radius:50%; background:#1fe0b8; animation-name: dbTwinkle; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        .db-wave-a { animation: dbWaveA 18s ease-in-out infinite; }
        .db-wave-b { animation: dbWaveB 22s ease-in-out infinite; }
      `}</style>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 8%, rgba(31,224,184,0.10) 0%, transparent 60%), #050b12" }} />
      <svg className="db-wave-a" style={{ position: "absolute", left: "-10%", top: "10%", width: "70%", opacity: 0.35 }} viewBox="0 0 500 300" fill="none">
        <path d="M0 150 C 100 40, 200 260, 300 130 S 500 60, 500 150" stroke="#1fe0b8" strokeWidth="1.4" />
      </svg>
      <svg className="db-wave-b" style={{ position: "absolute", right: "-10%", top: "45%", width: "70%", opacity: 0.3 }} viewBox="0 0 500 300" fill="none">
        <path d="M0 150 C 120 250, 220 20, 320 150 S 480 260, 500 150" stroke="#1fe0b8" strokeWidth="1.4" />
      </svg>
      {dots.map((d, i) => (
        <span key={i} className="db-dot" style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }} />
      ))}
    </div>
  );
}

// ─── DESKTOP LOGIN — full landing screen for wide viewports, with a staged
// cinematic entrance: flash → skyline rises → emblem flashes in → title does
// a chrome wipe+shine reveal → cards fly in one by one with a radar ping.
function DesktopLogin({ installPrompt, handleInstall, setRole }) {
  const { dateStr, timeStr } = useLiveClock();
  const THEME = {
    green:  { c: "#1FE0B8", glow: "rgba(31,224,184,.4)",  bg: "rgba(31,224,184,.05)" },
    purple: { c: "#B36BFF", glow: "rgba(179,107,255,.4)", bg: "rgba(179,107,255,.05)" },
    blue:   { c: "#38BDF8", glow: "rgba(56,189,248,.4)",  bg: "rgba(56,189,248,.05)" },
    gold:   { c: "#FBBF24", glow: "rgba(251,191,36,.4)",  bg: "rgba(251,191,36,.05)" },
  };
  const ROLES = [
    { key: "Admin",       icon: "shieldlock", theme: "green",  desc: ["Full access to all modules", "& system reports"], cta: "Open Dashboard" },
    { key: "Telecaller",  icon: "phone",      theme: "purple", desc: ["Leads, CRM, pipeline", "& follow-ups"],           cta: "Open Workspace" },
    { key: "Field Sales", icon: "truck",      theme: "blue",   desc: ["Tasks, deliveries &", "order collection"],       cta: "Open Field App" },
    { key: "Management",  icon: "chart",      theme: "gold",   desc: ["Reports, analytics &", "dashboards"],            cta: "Open Analytics" },
  ];
  const FEATURES = [
    { icon: "shieldcheck", title: "Secure & Reliable", sub: "Enterprise Grade Security" },
    { icon: "bolt",        title: "Fast & Efficient",  sub: "Optimized Performance" },
    { icon: "cloud",       title: "Cloud Sync",        sub: "Real-time Data Sync" },
    { icon: "team",        title: "Team Collaboration",sub: "Work Better Together" },
  ];
  const pillStyle = { display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 999, border: "1px solid rgba(31,224,184,0.35)", background: "rgba(15,25,20,0.6)", color: "#cfe9dc", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.04em" };
  const CARD_START = 1.75, CARD_STEP = 0.16;

  return (
    <div style={{ minHeight: "100vh", position: "relative", fontFamily: FONT, padding: "32px 40px 56px" }}>
      <style>{`
        @keyframes dlPulseDot  { 0%,100% { box-shadow:0 0 0 0 rgba(31,224,184,.55);} 50% { box-shadow:0 0 0 6px rgba(31,224,184,0);} }
        @keyframes dlRing      { 0% { transform:scale(0.85); opacity:.5; } 100% { transform:scale(1.6); opacity:0; } }
        @keyframes dlFlash     { 0% { opacity:0; } 6% { opacity:1; } 100% { opacity:0; } }
        @keyframes dlBarIn     { 0% { transform:translateY(-14px); opacity:0; } 100% { transform:translateY(0); opacity:1; } }
        @keyframes dlEmblemIn  { 0% { transform:scale(.35) rotate(-8deg); opacity:0; filter:blur(8px) brightness(2.4); } 55% { transform:scale(1.12) rotate(1deg); opacity:1; filter:blur(0) brightness(1.6); } 75% { transform:scale(.97) rotate(0deg); } 100% { transform:scale(1); opacity:1; filter:blur(0) brightness(1); } }
        @keyframes dlEmblemGlow{ 0%,100% { box-shadow:0 0 18px rgba(31,224,184,.5); } 50% { box-shadow:0 0 32px rgba(31,224,184,.85); } }
        @keyframes dlWipe      { 0% { clip-path:inset(0 100% 0 0); } 100% { clip-path:inset(0 0 0 0); } }
        @keyframes dlShine     { 0% { background-position:-160% 0; } 100% { background-position:260% 0; } }
        @keyframes dlRise      { 0% { transform:translateY(20px); opacity:0; } 100% { transform:translateY(0); opacity:1; } }
        @keyframes dlCardIn    { 0% { transform:translateY(46px) scale(.92); opacity:0; } 70% { transform:translateY(-4px) scale(1.015); opacity:1; } 100% { transform:translateY(0) scale(1); opacity:1; } }
        @keyframes dlPing      { 0% { transform:scale(.6); opacity:.9; } 100% { transform:scale(2.4); opacity:0; } }
        .dl-bar    { animation: dlBarIn .7s ease-out both; }
        .dl-emblem { animation: dlEmblemIn 1s cubic-bezier(.2,.8,.3,1) both .35s, dlEmblemGlow 2.6s ease-in-out infinite 1.4s; }
        .dl-title-wipe { display:inline-block; animation: dlWipe .85s cubic-bezier(.65,0,.35,1) both .95s; }
        .dl-title-shine {
          background-image: linear-gradient(100deg, #F8FAFC 40%, #ffffff 50%, #F8FAFC 60%);
          background-size: 250% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
          animation: dlShine 1.4s ease-out both 1.3s;
        }
        .dl-title-shine-g {
          background-image: linear-gradient(100deg, #1fb888 35%, #baffe8 50%, #1fb888 65%);
          background-size: 250% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
          animation: dlShine 1.4s ease-out both 1.3s;
        }
        .dl-sub   { animation: dlRise .6s ease-out both 1.7s; }
        .dl-tag   { animation: dlRise .6s ease-out both 1.85s; }
        .dl-card  { animation: dlCardIn .7s cubic-bezier(.2,.85,.3,1.1) both; }
        .dl-ping  { animation: dlPing 1s ease-out both; }
        .dl-install { animation: dlRise .6s ease-out both; }
        .dl-feat  { animation: dlRise .6s ease-out both; }
      `}</style>
      <DesktopLoginBackdrop />
      {/* cinematic opening flash */}
      <div style={{ position: "fixed", inset: 0, zIndex: 5, pointerEvents: "none", background: "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.9), rgba(31,224,184,0.25) 40%, transparent 70%)", animation: "dlFlash 1s ease-out both", mixBlendMode: "screen" }} />

      <div className="dl-bar" style={{ position: "relative", zIndex: 2, maxWidth: 1400, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={pillStyle}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22e0a8", animation: "dlPulseDot 1.8s ease-in-out infinite" }} />
          SYSTEM ONLINE
        </div>
        <div style={pillStyle}>
          <LIcon id="calendar" size={14} color="#8fd4b0" />
          {dateStr}<span style={{ opacity: 0.5 }}>|</span>{timeStr}
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 900, margin: "8px auto 0", textAlign: "center" }}>
        <DesktopSkyline />

        <img src={SRIDHI_LOGO_PNG} alt="" className="dl-emblem" style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", marginTop: 4, background: "#fff" }} />

        <div style={{ position: "relative", display: "block", marginTop: 6 }}>
          <svg width="46" height="30" style={{ position: "absolute", left: "calc(50% - 300px)", top: "50%", marginTop: -15, opacity: 0.5 }} viewBox="0 0 46 30"><path d="M46 15H20L10 5" stroke="#1fe0b8" strokeWidth="1.2" fill="none" /><circle cx="8" cy="3" r="2.4" fill="#1fe0b8" /></svg>
          <svg width="46" height="30" style={{ position: "absolute", right: "calc(50% - 300px)", top: "50%", marginTop: -15, opacity: 0.5 }} viewBox="0 0 46 30"><path d="M0 15h26l10-10" stroke="#1fe0b8" strokeWidth="1.2" fill="none" /><circle cx="38" cy="3" r="2.4" fill="#1fe0b8" /></svg>
          <div className="dl-title-wipe">
            <h1 style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.05 }}>
              <span className="dl-title-shine">Sridhi </span>
              <span className="dl-title-shine-g">Ventures</span>
            </h1>
          </div>
        </div>
        <div className="dl-sub" style={{ fontSize: 14, color: "#22e0a8", fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 10 }}>Business Operating System</div>
        <div className="dl-tag" style={{ fontSize: 14, color: "#8CA3B5", marginTop: 6 }}>Chennai • Food Distribution</div>
      </div>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1160, margin: "40px auto 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22 }}>
        {ROLES.map((r, i) => {
          const th = THEME[r.theme];
          const delay = CARD_START + i * CARD_STEP;
          return (
            <div key={r.key} className="dl-card" style={{ animationDelay: `${delay}s`, background: "rgba(10,16,14,0.55)", border: `1px solid ${th.c}55`, borderRadius: 18, padding: "30px 22px 24px", textAlign: "center", boxShadow: `0 0 30px -14px ${th.glow}` }}>
              <div style={{ position: "relative", width: 68, height: 68, margin: "0 auto 18px" }}>
                <span className="dl-ping" style={{ animationDelay: `${delay + 0.55}s`, position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${th.c}` }} />
                <div style={{ width: 68, height: 68, borderRadius: "50%", background: th.bg, border: `1.5px solid ${th.c}`, boxShadow: `0 0 22px ${th.glow}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LIcon id={r.icon} size={28} color={th.c} />
                </div>
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#F1F5F9" }}>{r.key}</div>
              <div style={{ width: 30, height: 2.5, borderRadius: 2, background: th.c, margin: "8px auto 12px" }} />
              <div style={{ fontSize: 12.5, color: "#8CA3B5", lineHeight: 1.6, minHeight: 40 }}>{r.desc[0]}<br />{r.desc[1]}</div>
              <button onClick={() => setRole(r.key)} style={{
                marginTop: 16, width: "100%", background: th.bg, border: `1px solid ${th.c}70`, color: th.c,
                borderRadius: 11, padding: "10px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: FONT,
              }}>
                {r.cta} <LIcon id="chevron" size={14} color={th.c} />
              </button>
            </div>
          );
        })}
      </div>

      {installPrompt && (
        <div className="dl-install" style={{ animationDelay: "2.5s", position: "relative", zIndex: 2, textAlign: "center", marginTop: 40 }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <span style={{ position: "absolute", inset: -14, borderRadius: 999, border: "1.5px solid rgba(31,224,184,.4)", animation: "dlRing 2.6s ease-out infinite" }} />
            <span style={{ position: "absolute", inset: -14, borderRadius: 999, border: "1.5px solid rgba(31,224,184,.4)", animation: "dlRing 2.6s ease-out infinite 1.3s" }} />
            <button onClick={handleInstall} style={{
              position: "relative", background: "linear-gradient(180deg,#1fe0b8,#149a71)", border: "none", borderRadius: 999,
              color: "#04140d", padding: "14px 30px", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
              display: "flex", alignItems: "center", gap: 12, boxShadow: "0 0 40px rgba(31,224,184,.4)",
            }}>
              <LIcon id="devicecheck" size={18} color="#04140d" />
              Install App on This Device
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(4,20,13,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LIcon id="download" size={15} color="#04140d" />
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="dl-feat" style={{ animationDelay: "2.7s", position: "relative", zIndex: 2, maxWidth: 1000, margin: "48px auto 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
        {FEATURES.map(f => (
          <div key={f.title} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
            <LIcon id={f.icon} size={20} color="#5fb894" />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#CBD5E1" }}>{f.title}</div>
              <div style={{ fontSize: 10.5, color: "#64748B" }}>{f.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: "relative", zIndex: 2, textAlign: "center", marginTop: 40, fontSize: 12, color: "#3B4A6B", fontWeight: 500 }}>Sridhi Ventures BOS v3.0</div>
    </div>
  );
}

// SVG icons for nav
function NavIcon({ id, active }) {
  const col = active ? T.accent : T.t3;
  const icons = {
    dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    crm:       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    pipeline:  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    field:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>,
    more:      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  };
  return icons[id] || null;
}

// ─── ROOT ──────────────────────────────────────────────────────────────────
// ── Branded intro video — plays once per browser session before login ────
function IntroVideo({ onDone }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [fading, setFading] = useState(false);

  const finish = () => {
    if (fading) return;
    setFading(true);
    setTimeout(onDone, 380); // let the fade-out play before unmounting
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {}); // some mobile browsers still require a user gesture
    const t = setTimeout(finish, 12000); // hard safety cap so nobody is ever stuck
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000, background: "#060B16",
      display: "flex", alignItems: "center", justifyContent: "center",
      opacity: fading ? 0 : 1, transition: "opacity 380ms ease",
    }}>
      <video
        ref={videoRef}
        poster="/intro-poster.jpg"
        autoPlay muted={muted} playsInline preload="auto"
        onEnded={finish}
        onClick={() => setMuted(m => !m)}
        style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
      >
        <source src="/intro.webm" type="video/webm" />
        <source src="/intro.mp4" type="video/mp4" />
      </video>

      <button onClick={finish} style={{
        position: "absolute", top: "max(18px, env(safe-area-inset-top))", right: 18,
        background: "rgba(10,14,26,0.55)", backdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999,
        color: "#fff", padding: "8px 16px", fontSize: 12.5, fontWeight: 700,
        cursor: "pointer", fontFamily: FONT, letterSpacing: "0.02em",
      }}>Skip →</button>

      <button onClick={() => setMuted(m => !m)} style={{
        position: "absolute", bottom: "max(18px, env(safe-area-inset-bottom))", right: 18,
        width: 38, height: 38, borderRadius: "50%",
        background: "rgba(10,14,26,0.55)", backdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,0.18)",
        color: "#fff", fontSize: 15, cursor: "pointer", fontFamily: FONT,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{muted ? "🔇" : "🔊"}</button>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTabRaw] = useState(() => {
    try { return localStorage.getItem("bos_activeTab") || "dashboard"; } catch { return "dashboard"; }
  });
  const [role, setRoleRaw] = useState(() => {
    try { return localStorage.getItem("bos_role") || null; } catch { return null; }
  });
  const [showIntro, setShowIntro] = useState(() => {
    try { return !sessionStorage.getItem("bos_intro_seen"); } catch { return true; }
  });
  const setActiveTab = (tab) => {
    setActiveTabRaw(tab);
    try { localStorage.setItem("bos_activeTab", tab); } catch {}
  };
  const setRole = (r) => {
    setRoleRaw(r);
    try {
      if (r) localStorage.setItem("bos_role", r);
      else { localStorage.removeItem("bos_role"); localStorage.removeItem("bos_activeTab"); setActiveTabRaw("dashboard"); }
    } catch {}
  };
  const [showMore, setShowMore] = useState(false);
  const contentRef = useRef(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const isDesktop = useIsDesktop();
  const [leadsForBadge] = useSheetSynced("leads", "leads", []);

  useEffect(() => {
    const handler = e => { e.preventDefault(); setInstallPrompt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setShowInstall(false);
    setInstallPrompt(null);
  };

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [activeTab]);

  const tabLabel = { dashboard:"Dashboard", leads:"Leads CRM", pipeline:"Pipeline", fieldsync:"Field Sync", samples:"Samples", repeat:"Repeat Orders", dailyorders:"Daily Orders", activity:"Telecaller Activity", milkdistributors:"Milk Distributors", hubdistributors:"Hub Distributors", homecustomers:"Home Customers", expenses:"Expenses", marketing:"Marketing", reports:"Reports", ai:"AI Assistant", whatsapp:"WA Templates", hrleads:"HR Leads", today:"Today Tasks", prospects:"Find Prospects", lostcustomers:"Lost Customers" };

  // ── INSTALL BANNER ──
  const InstallBanner = () => showInstall ? (
    <div style={{
      position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)",
      width:"calc(100% - 32px)", maxWidth:448, zIndex:999,
      background:T.card,
      boxShadow:`0 8px 32px rgba(15,23,42,0.12)`,
      border:`1px solid ${T.accentGlow}`, borderRadius:18,
      padding:"14px 16px", display:"flex", alignItems:"center", gap:12,
    }}>
      <div style={{ width:42, height:42, borderRadius:12, background:T.accentSub,
        border:`1px solid ${T.accentGlow}`, display:"flex", alignItems:"center",
        justifyContent:"center", fontSize:22, flexShrink:0 }}>⚡</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:800, color:T.t1 }}>Install Sridhi BOS</div>
        <div style={{ fontSize:11, color:T.t3, marginTop:2 }}>Add to home screen for quick access</div>
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <button onClick={() => setShowInstall(false)}
          style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:8,
            color:T.t3, padding:"6px 10px", fontSize:11, cursor:"pointer", fontFamily:FONT }}>Later</button>
        <button onClick={handleInstall}
          style={{ background:T.accent, border:"none", borderRadius:8,
            color:"#FFFFFF", padding:"6px 12px", fontSize:11, fontWeight:800,
            cursor:"pointer", fontFamily:FONT }}>Install</button>
      </div>
    </div>
  ) : null;

  // ── LOGIN ──
  if (!role) {
    if (showIntro) {
      return <IntroVideo onDone={() => { try { sessionStorage.setItem("bos_intro_seen", "1"); } catch {} setShowIntro(false); }} />;
    }
    if (isDesktop) {
      return <DesktopLogin installPrompt={installPrompt} handleInstall={handleInstall} setRole={setRole} />;
    }
    return (
      <div style={{ minHeight:"100vh", background:T.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:FONT }}>
        <div style={{ position:"fixed", top:"10%", left:"50%", transform:"translateX(-50%)", width:360, height:360, borderRadius:"50%", background:`radial-gradient(circle, ${T.accentGlow} 0%, transparent 65%)`, pointerEvents:"none" }} />
        <div style={{ position:"relative", zIndex:1, textAlign:"center", marginBottom:44 }}>
          <FactoryHero />
          <SandTitle style={{ fontSize:28, fontWeight:900, color:T.t1, letterSpacing:"-0.04em" }}>Sridhi Ventures</SandTitle>
          <div style={{ fontSize:11, color:T.accent, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", marginTop:6 }}>Business Operating System</div>
          <div style={{ fontSize:11, color:T.t3, marginTop:6, fontWeight:500 }}>Chennai · Food Distribution</div>
        </div>
        <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:360, display:"flex", flexDirection:"column", gap:10 }}>
          {[
            { label:"Admin",      desc:"Full access — all modules & reports",    color:T.accent,  icon:"🛡️" },
            { label:"Telecaller", desc:"Leads, CRM, pipeline & follow-ups",      color:T.indigo,  icon:"📞" },
            { label:"Field Sales",desc:"Tasks, deliveries & order collection",   color:T.emerald, icon:"🚗" },
            { label:"Management", desc:"Reports, analytics & dashboards",        color:T.amber,   icon:"📊" },
          ].map(r => (
            <button key={r.label} onClick={() => setRole(r.label)}
              style={{
                background:T.card, border:`1px solid ${T.border}`, borderRadius:18,
                padding:"15px 18px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:14, textAlign:"left", fontFamily:FONT,
                transition:"border-color 0.15s",
              }}>
              <div style={{
                width:44, height:44, borderRadius:12, background:r.color+"18",
                border:`1px solid ${r.color}30`, display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:20, flexShrink:0,
              }}>{r.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:800, color:T.t1, letterSpacing:"-0.01em" }}>{r.label}</div>
                <div style={{ fontSize:11, color:T.t3, marginTop:2, fontWeight:500 }}>{r.desc}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
        {installPrompt && (
          <button onClick={handleInstall}
            style={{ position:"relative", zIndex:1, marginTop:16, background:"#25D366", border:"none",
              borderRadius:14, color:"white", padding:"12px 28px", fontSize:14, fontWeight:800,
              cursor:"pointer", fontFamily:FONT, display:"flex", alignItems:"center", gap:8 }}>
            📲 Install App on This Device
          </button>
        )}
        <div style={{ position:"relative", zIndex:1, marginTop:16, fontSize:11, color:T.t4, fontWeight:500 }}>Sridhi Ventures BOS v3.0</div>
      </div>
    );
  }

  const renderModule = (moduleProps = {}) => {
    switch (activeTab) {
      case "dashboard": return <Dashboard />;
      case "leads":     return <Leads />;
      case "pipeline":  return <Pipeline />;
      case "fieldsync": return <FieldSync />;
      case "samples":   return <Samples />;
      case "repeat":    return <RepeatOrders />;
      case "lostcustomers": return <LostCustomers />;
      case "existingcustomers": return <ExistingCustomerPipeline />;
      case "homecustomers": return <HomeCustomers />;
      case "dailyorders": return <DailyOrders {...moduleProps} />;
      case "activity":  return <TelecallerActivity {...moduleProps} />;
      case "milkdistributors": return <MilkDistributors {...moduleProps} />;
      case "hubdistributors": return <HubDistributors {...moduleProps} />;
      case "expenses":  return <Expenses />;
      case "marketing": return <Marketing />;
      case "reports":   return <Reports />;
      case "today":     return <TodayTasks />;
      case "prospects":  return <ProspectFinder />;
      case "hrleads":   return <HRLeads />;
      case "hiring":    return <Hiring />;
      case "whatsapp":  return <WhatsAppTemplates />;
      case "ai":        return <AIAssistant />;
      case "settings":  return <SettingsPlaceholder />;
      default:          return <Dashboard />;
    }
  };

  if (isDesktop && role) {
    return (
      <DesktopShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        role={role}
        setRole={setRole}
        leadsCount={(leadsForBadge || []).filter(l => l && l.name).length}
        renderModule={renderModule}
      />
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.t1, fontFamily:FONT, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", position:"relative" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: ${T.borderHi}; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        select option { background: ${T.card}; color: ${T.t1}; }
        @keyframes pulse { 0%,100% { opacity:0.25; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.1); } }
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes visitGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(251,113,133,0.35); } 50% { box-shadow: 0 0 0 6px rgba(251,113,133,0); } }
        @keyframes shuffleBounce { 0% { transform: scale(1) rotate(0deg); } 30% { transform: scale(1.05) rotate(-2deg); } 60% { transform: scale(0.97) rotate(2deg); } 100% { transform: scale(1) rotate(0deg); } }
        @keyframes newLeadGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(244,114,182,0.4); } 50% { box-shadow: 0 0 8px 2px rgba(244,114,182,0.25); } }
        input::placeholder { color: ${T.t3}; }
        textarea::placeholder { color: ${T.t3}; }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 100px ${T.card} inset; -webkit-text-fill-color: ${T.t1}; }

        button { transition: transform 0.12s ease, opacity 0.12s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease; }
        button:active { transform: scale(0.96); opacity: 0.9; }
        a, .tappable, [role="button"] { transition: transform 0.12s ease, opacity 0.12s ease; }

        .bos-content-fade { animation: fadeSlideIn 0.28s ease both; }
      `}</style>

      {/* Header */}
      <div style={{ background:T.glass, borderBottom:`1px solid ${T.border}`, padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:80, backdropFilter:"blur(14px)", boxShadow:"0 4px 20px rgba(0,0,0,0.25)" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:900, color:T.t1, letterSpacing:"-0.03em" }}>Sridhi BOS</div>
          <div style={{ fontSize:10, color:T.t3, marginTop:1, fontWeight:500, letterSpacing:"0.02em", textTransform:"uppercase" }}>{tabLabel[activeTab]}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {installPrompt && (
            <button onClick={handleInstall}
              style={{ background:"#25D366", border:"none", borderRadius:8, color:"white",
                padding:"4px 10px", fontSize:11, fontWeight:800, cursor:"pointer", fontFamily:FONT }}>
              📲 Install
            </button>
          )}
          <div style={{ background:T.accentSub, border:`1px solid ${T.accentGlow}`, borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:700, color:T.accent }}>{role}</div>
          <button onClick={() => setRole(null)} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, color:T.t3, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:FONT, fontWeight:600 }}>Exit</button>
        </div>
      </div>

      {/* Accent bar */}
      <div style={{ height:2, flexShrink:0, background:`linear-gradient(90deg, ${T.sky}, ${T.indigo}, ${T.accent}, ${T.emerald})`, boxShadow:`0 0 12px ${T.accentGlow}` }} />

      {/* Content */}
      <div ref={contentRef} key={activeTab} className="bos-content-fade" style={{ flex:1, overflowY:"auto", padding: activeTab==="ai" ? "16px 16px 0" : "16px 16px 90px" }}>
        {renderModule()}
      </div>

      {/* Bottom nav */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:T.glass, backdropFilter:"blur(14px)", borderTop:`1px solid ${T.border}`, display:"flex", padding:"10px 0 20px", zIndex:80, boxShadow:"0 -4px 20px rgba(0,0,0,0.3)" }}>
        {NAV.map(n => {
          const isActive = n.id==="more" ? MORE_MENU.some(m => m.id===activeTab) : activeTab===n.id;
          return (
            <button key={n.id}
              onClick={() => { if (n.id==="more") setShowMore(true); else { setActiveTab(n.id); setShowMore(false); } }}
              style={{ flex:1, background:"none", border:"none", display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer", padding:"4px 0", position:"relative" }}>
              {isActive && (
                <div style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", width:20, height:2, borderRadius:1, background:T.accent, boxShadow:`0 0 8px ${T.accent}` }} />
              )}
              <NavIcon id={n.id} active={isActive} />
              <span style={{ fontSize:10, fontWeight: isActive ? 700 : 500, color: isActive ? T.accent : T.t3, letterSpacing:"0.01em" }}>{n.label}</span>
            </button>
          );
        })}
      </div>

      <InstallBanner />

      {/* More menu */}
      <Sheet open={showMore} onClose={() => setShowMore(false)} title="All Modules">
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {MORE_MENU.map(m => (
            <button key={m.id} onClick={() => { setActiveTab(m.id); setShowMore(false); }}
              style={{
                background: activeTab===m.id ? T.accentSub : T.surface,
                border:`1px solid ${activeTab===m.id ? T.accentGlow : T.border}`,
                borderRadius:16, padding:"16px 14px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:10, fontFamily:FONT,
                boxShadow: activeTab===m.id ? `0 0 16px ${T.accentGlow}` : "none",
              }}>
              <span style={{ fontSize:20 }}>{m.icon}</span>
              <span style={{ fontSize:13, fontWeight:700, color: activeTab===m.id ? T.accent : T.t1, letterSpacing:"-0.01em" }}>{m.label}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
