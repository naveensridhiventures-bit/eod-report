// ─────────────────────────────────────────────────────────────
//  TEAM, ROLES & BULK-IMPORT RECORD TYPES
//  When live, the "Employees" sheet replaces DEFAULT_EMPLOYEES.
// ─────────────────────────────────────────────────────────────

// Status options for each kind of call. `positive` ones are highlighted to management.
export const CALL_STATUSES = [
  { value: 'interested', label: 'Interested', tone: 'good', positive: true },
  { value: 'callback', label: 'Call back', tone: 'gold' },
  { value: 'not_interested', label: 'Not interested', tone: 'bad' },
  { value: 'no_answer', label: 'No answer', tone: 'muted' },
  { value: 'other', label: 'Other', tone: 'muted' }
];

// `quick` = shown as a one-tap button when logging a new HR call; the rest appear as the candidate moves along
export const HIRING_STATUSES = [
  { value: 'scheduled', label: 'Interview scheduled', tone: 'blue', positive: true, quick: true },
  { value: 'attended', label: 'Attended interview', tone: 'blue', positive: true },
  { value: 'selected', label: 'Selected', tone: 'good', positive: true },
  { value: 'joined', label: 'Joined', tone: 'good', positive: true, quick: true },
  { value: 'working', label: 'Still working', tone: 'good' },
  { value: 'driver_arranged', label: 'Driver arranged', tone: 'good', positive: true, quick: true },
  { value: 'no_show', label: 'No-show', tone: 'bad' },
  { value: 'rejected', label: 'Rejected', tone: 'bad' },
  { value: 'relieved', label: 'Relieved', tone: 'bad', quick: true },
  { value: 'called', label: 'Called', tone: 'muted', quick: true },
  { value: 'not_interested', label: 'Not interested', tone: 'bad', quick: true },
  { value: 'no_answer', label: 'No answer', tone: 'muted', quick: true }
];

// Hiring pipeline stages (latest result of each candidate decides the stage)
export const HIRING_STAGES = [
  { key: 'contacted', label: 'Contacted', statuses: ['called', 'no_answer'] },
  { key: 'scheduled', label: 'Scheduled', statuses: ['scheduled'] },
  { key: 'attended', label: 'Attended', statuses: ['attended'] },
  { key: 'selected', label: 'Selected', statuses: ['selected'] },
  { key: 'joined', label: 'Joined', statuses: ['joined', 'working', 'driver_arranged'] },
  { key: 'dropped', label: 'Dropped', statuses: ['no_show', 'rejected', 'not_interested', 'relieved'] }
];

// Lists that aren't daily work: the call queue, do-not-call numbers and job openings
export const LIST_TYPES = {
  leads: { cols: ['title', 'kind', 'name', 'phone', 'area', 'notes', 'state', 'result', 'doneAt', 'assignedBy'] },
  dnc: { cols: ['name', 'phone', 'reason'] },
  openings: { cols: ['title', 'needed', 'active'] }
};

// Daily targets used when nothing is set in Settings
export const TARGET_METRICS = [
  { key: 'calls_made', label: 'Calls', role: 'telecaller' },
  { key: 'interested_calls', label: 'Interested', role: 'telecaller' },
  { key: 'orders', label: 'Orders', role: 'telecaller' },
  { key: 'hr_calls', label: 'HR calls', role: 'hiring' },
  { key: 'scheduled', label: 'Interviews scheduled', role: 'hiring' }
];
export const DEFAULT_TARGETS = { _default: { calls_made: 50, interested_calls: 5, orders: 3, hr_calls: 40, scheduled: 5 } };

export const CUSTOMER_TYPES = [
  { value: 'new', label: 'New', tone: 'good' },
  { value: 'existing', label: 'Existing', tone: 'blue' }
];

// What each bulk import stores. `cols` = columns shown and saved.
export const RECORD_TYPES = {
  calls: {
    label: 'Customer calls', short: 'Calls', noun: 'calls', verb: 'Import calls',
    cols: ['title', 'name', 'phone', 'remarks', 'status', 'followUp', 'duration'],
    statuses: CALL_STATUSES,
    titleHint: 'What is this call list for?',
    titles: ['Sales', 'Distributor hiring', 'Retail follow-up', 'New leads'],
    example: 'Ramesh Traders\t9876543210\tInterested, send price list\nKumar Stores, 9123456780, call back tomorrow\nLakshmi 98765 12345 not interested'
  },
  orders: {
    label: 'Sales / orders', short: 'Orders', noun: 'orders', verb: 'Import orders',
    cols: ['title', 'name', 'phone', 'product', 'qty', 'unit', 'amount'],
    titleHint: 'What kind of orders are these?',
    titles: ['Retail', 'Distributor', 'Wholesale'],
    example: 'Ramesh Traders\t9876543210\tGroundnut oil\t15 L\t3450\nKumar Stores, 9123456780, Rice, 50kg, Rs 2800'
  },
  customers: {
    label: 'My customers', short: 'Customers', noun: 'customers', verb: 'Import customers',
    cols: ['title', 'name', 'phone', 'area', 'type'],
    statuses: CUSTOMER_TYPES,
    titleHint: 'What kind of customers are these?',
    titles: ['Retail', 'Distributor', 'Wholesale'],
    example: 'Ramesh Traders\t9876543210\tTambaram\texisting\nKumar Stores, 9123456780, Velachery, new'
  },
  cancellations: {
    label: 'Cancelled orders', short: 'Cancelled', noun: 'cancelled orders', verb: 'Import cancellations',
    cols: ['title', 'name', 'phone', 'product', 'qty', 'unit', 'amount', 'reason'],
    titleHint: 'What kind of orders were cancelled?',
    titles: ['Retail', 'Distributor', 'Wholesale'],
    example: 'Kumar Stores\t9123456780\tRice\t25 kg\t1400\tPrice too high'
  },
  hiring: {
    label: 'Hiring calls', short: 'HR calls', noun: 'HR calls', verb: 'Import HR calls',
    cols: ['title', 'name', 'phone', 'remarks', 'status', 'followUp', 'duration'],
    statuses: HIRING_STATUSES,
    titleHint: 'Which position are you hiring for?',
    titles: ['Driver', 'Call driver', 'Telecaller', 'Delivery boy', 'Distributor'],
    example: 'Suresh\t9876501234\tInterview scheduled Monday 11am\nPriya, 9988776655, joined today\nArun 9090909090 relieved'
  }
};

export const COL_LABELS = {
  title: 'Title', name: 'Name', phone: 'Number', remarks: 'Remarks', status: 'Status', product: 'Product',
  qty: 'Qty', unit: 'Unit', amount: 'Amount (₹)', area: 'Area', type: 'Type', reason: 'Reason', position: 'Position', followUp: 'Follow-up', duration: 'Talk time (s)'
};

export const ROLES = {
  telecaller: {
    label: 'Sales & telecalling', short: 'Sales', color: '#2E9E6A',
    imports: ['calls', 'orders', 'customers', 'cancellations'],
    text: []
  },
  hiring: {
    label: 'HR & hiring', short: 'Hiring', color: '#3D7DD8',
    imports: ['hiring'],
    text: []
  },
  developer: {
    label: 'Development', short: 'Dev', color: '#8A5CD1',
    imports: [],
    text: [
      { key: 'work_done', short: 'Work done', label: 'What did you work on today?', placeholder: 'e.g. Finished the payments screen, fixed login bug on Android, deployed v1.4…', required: true, rows: 5 },
      { key: 'blockers', short: 'Blockers', label: 'Blockers', placeholder: 'Anything stopping progress?' }
    ]
  },
  saleshead: {
    label: 'Sales head', short: 'Head', color: '#E0782F',
    imports: [],
    text: [
      { key: 'head_update', short: 'Team update', label: 'Team & sales update', placeholder: 'Team performance, key deals, decisions, follow-ups for the team…', rows: 4 }
    ]
  }
};

// Daily counts saved with each report (worked out from the imported records)
export const SNAPSHOT = [
  { key: 'calls_made', label: 'Calls made', role: 'telecaller' },
  { key: 'interested_calls', label: 'Interested calls', role: 'telecaller', good: true },
  { key: 'callbacks', label: 'Call backs', role: 'telecaller' },
  { key: 'orders', label: 'Orders', role: 'telecaller', good: true },
  { key: 'sales_value', label: 'Sales value (₹)', role: 'telecaller', money: true, good: true },
  { key: 'sales_kg', label: 'Sales (kg)', role: 'telecaller' },
  { key: 'sales_l', label: 'Sales (L)', role: 'telecaller' },
  { key: 'orders_cancelled', label: 'Orders cancelled', role: 'telecaller', bad: true },
  { key: 'cancelled_value', label: 'Cancelled value (₹)', role: 'telecaller', money: true, bad: true },
  { key: 'customers_added', label: 'Customers added', role: 'telecaller' },
  { key: 'hr_calls', label: 'HR calls', role: 'hiring' },
  { key: 'scheduled', label: 'Interviews scheduled', role: 'hiring', good: true },
  { key: 'attended', label: 'Attended interview', role: 'hiring', good: true },
  { key: 'no_shows', label: 'Interview no-shows', role: 'hiring', bad: true },
  { key: 'selected', label: 'Selected', role: 'hiring', good: true },
  { key: 'joined', label: 'Joined', role: 'hiring', good: true },
  { key: 'drivers_arranged', label: 'Drivers arranged', role: 'hiring', good: true },
  { key: 'relieved', label: 'Relieved', role: 'hiring', bad: true },
  { key: 'talk_mins', label: 'Talk time (min)', role: 'telecaller' }
];

export const DEFAULT_EMPLOYEES = [
  { id: 'naveen', name: 'Naveen', title: 'Sales head', roles: ['saleshead', 'telecaller', 'hiring', 'developer'], pin: '1111', isAdmin: true },
  { id: 'imran', name: 'Imran', title: 'Developer', roles: ['developer'], pin: '2222', isAdmin: false },
  { id: 'thulasi', name: 'Thulasi', title: 'Telecaller', roles: ['telecaller'], pin: '3333', isAdmin: false },
  { id: 'azgar', name: 'Azgar', title: 'Intern — sales & hiring', roles: ['telecaller', 'hiring'], pin: '4444', isAdmin: false },
  { id: 'sabi', name: 'Sabi', title: 'Intern — sales & hiring', roles: ['telecaller', 'hiring'], pin: '5555', isAdmin: false },
  { id: 'umar', name: 'Mohammed Umar', title: 'HR — hiring', roles: ['hiring'], pin: '6666', isAdmin: false },
  { id: 'management', name: 'Management', title: 'View all reports', roles: [], pin: '9999', isAdmin: true, viewOnly: true }
];

export const MOODS = [
  { value: 5, label: 'Great day' },
  { value: 4, label: 'Good' },
  { value: 3, label: 'Okay' },
  { value: 2, label: 'Tough' },
  { value: 1, label: 'Very tough' }
];

export const statusInfo = (type, value) =>
  (RECORD_TYPES[type]?.statuses || []).find((s) => s.value === value) || { label: value || '—', tone: 'muted' };
