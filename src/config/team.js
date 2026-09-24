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

export const HIRING_STATUSES = [
  { value: 'scheduled', label: 'Interview scheduled', tone: 'blue', positive: true },
  { value: 'joined', label: 'Joined', tone: 'good', positive: true },
  { value: 'driver_arranged', label: 'Driver arranged', tone: 'good', positive: true },
  { value: 'relieved', label: 'Relieved', tone: 'bad' },
  { value: 'called', label: 'Called', tone: 'muted' },
  { value: 'not_interested', label: 'Not interested', tone: 'bad' },
  { value: 'no_answer', label: 'No answer', tone: 'muted' }
];

export const CUSTOMER_TYPES = [
  { value: 'new', label: 'New', tone: 'good' },
  { value: 'existing', label: 'Existing', tone: 'blue' }
];

// What each bulk import stores. `cols` = columns shown and saved.
export const RECORD_TYPES = {
  calls: {
    label: 'Customer calls', short: 'Calls', verb: 'Import calls',
    cols: ['name', 'phone', 'remarks', 'status'],
    statuses: CALL_STATUSES,
    example: 'Ramesh Traders\t9876543210\tInterested, send price list\nKumar Stores, 9123456780, call back tomorrow\nLakshmi 98765 12345 not interested'
  },
  orders: {
    label: 'Sales / orders', short: 'Orders', verb: 'Import orders',
    cols: ['name', 'phone', 'product', 'qty', 'unit', 'amount'],
    example: 'Ramesh Traders\t9876543210\tGroundnut oil\t15 L\t3450\nKumar Stores, 9123456780, Rice, 50kg, Rs 2800'
  },
  customers: {
    label: 'My customers', short: 'Customers', verb: 'Import customers',
    cols: ['name', 'phone', 'area', 'type'],
    statuses: CUSTOMER_TYPES,
    example: 'Ramesh Traders\t9876543210\tTambaram\texisting\nKumar Stores, 9123456780, Velachery, new'
  },
  cancellations: {
    label: 'Cancelled orders', short: 'Cancelled', verb: 'Import cancellations',
    cols: ['name', 'phone', 'product', 'qty', 'unit', 'amount', 'reason'],
    example: 'Kumar Stores\t9123456780\tRice\t25 kg\t1400\tPrice too high'
  },
  hiring: {
    label: 'Hiring calls', short: 'HR calls', verb: 'Import HR calls',
    cols: ['name', 'phone', 'position', 'remarks', 'status'],
    statuses: HIRING_STATUSES,
    example: 'Suresh\t9876501234\tDriver\tInterview scheduled Monday 11am\nPriya, 9988776655, Telecaller, joined today\nArun 9090909090 driver relieved'
  }
};

export const COL_LABELS = {
  name: 'Name', phone: 'Number', remarks: 'Remarks', status: 'Status', product: 'Product',
  qty: 'Qty', unit: 'Unit', amount: 'Amount (₹)', area: 'Area', type: 'Type', reason: 'Reason', position: 'Position'
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
  { key: 'joined', label: 'Joined', role: 'hiring', good: true },
  { key: 'drivers_arranged', label: 'Drivers arranged', role: 'hiring', good: true },
  { key: 'relieved', label: 'Relieved', role: 'hiring', bad: true }
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
