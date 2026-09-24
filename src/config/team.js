// ─────────────────────────────────────────────────────────────
//  TEAM & METRIC SETUP — edit this file to add people or fields.
//  (When connected to Google Sheets, the "Employees" sheet is used
//   instead of DEFAULT_EMPLOYEES, so PINs can be changed there.)
// ─────────────────────────────────────────────────────────────

export const ROLES = {
  telecaller: {
    label: 'Sales & telecalling',
    short: 'Sales',
    color: '#2E9E6A',
    metrics: [
      { key: 'calls_made', label: 'Calls made', type: 'number' },
      { key: 'calls_connected', label: 'Calls connected', type: 'number' },
      { key: 'leads_generated', label: 'New leads', type: 'number' },
      { key: 'followups_done', label: 'Follow-ups done', type: 'number' },
      { key: 'orders_converted', label: 'Orders converted', type: 'number', highlight: 'good' },
      { key: 'sales_value', label: 'Sales value (₹)', type: 'money', highlight: 'good' },
      { key: 'orders_cancelled', label: 'Orders cancelled', type: 'number', highlight: 'bad' },
      { key: 'cancelled_value', label: 'Cancelled value (₹)', type: 'money', highlight: 'bad' },
      { key: 'callbacks_pending', label: 'Callbacks pending', type: 'number' }
    ],
    notes: [{ key: 'cancel_reasons', label: 'Why were orders cancelled?', placeholder: 'e.g. price too high, delivery delay…' }]
  },

  hiring: {
    label: 'HR & hiring',
    short: 'Hiring',
    color: '#3D7DD8',
    metrics: [
      { key: 'candidates_sourced', label: 'Candidates sourced', type: 'number' },
      { key: 'candidate_calls', label: 'Candidate calls', type: 'number' },
      { key: 'interviews_scheduled', label: 'Interviews scheduled', type: 'number', highlight: 'good' },
      { key: 'interviews_attended', label: 'Interviews attended', type: 'number' },
      { key: 'candidates_selected', label: 'Selected', type: 'number' },
      { key: 'hired', label: 'Hired / joined', type: 'number', highlight: 'good' },
      { key: 'drivers_arranged', label: 'Call drivers arranged', type: 'number', highlight: 'good' },
      { key: 'no_shows', label: 'No-shows / dropped', type: 'number', highlight: 'bad' }
    ],
    notes: [{ key: 'hiring_positions', label: 'Positions worked on', placeholder: 'e.g. 3 drivers, 1 telecaller' }]
  },

  developer: {
    label: 'Development',
    short: 'Dev',
    color: '#8A5CD1',
    metrics: [
      { key: 'tasks_completed', label: 'Tasks completed', type: 'number', highlight: 'good' },
      { key: 'tasks_in_progress', label: 'Tasks in progress', type: 'number' },
      { key: 'bugs_fixed', label: 'Bugs fixed', type: 'number', highlight: 'good' },
      { key: 'features_shipped', label: 'Features shipped', type: 'number', highlight: 'good' },
      { key: 'deployments', label: 'Deployments', type: 'number' },
      { key: 'hours_worked', label: 'Hours worked', type: 'number' }
    ],
    notes: [
      { key: 'project', label: 'Project / module', placeholder: 'e.g. Booking app — payments screen' },
      { key: 'blockers', label: 'Blockers', placeholder: 'Anything stopping progress?' }
    ]
  },

  saleshead: {
    label: 'Sales head',
    short: 'Head',
    color: '#E0782F',
    metrics: [
      { key: 'team_revenue', label: 'Team revenue today (₹)', type: 'money', highlight: 'good' },
      { key: 'client_meetings', label: 'Client meetings', type: 'number' },
      { key: 'new_clients', label: 'New clients closed', type: 'number', highlight: 'good' },
      { key: 'pipeline_value', label: 'Pipeline value (₹)', type: 'money' },
      { key: 'escalations_resolved', label: 'Escalations resolved', type: 'number' },
      { key: 'team_reviews', label: 'Team reviews / coaching', type: 'number' }
    ],
    notes: [{ key: 'strategy_notes', label: 'Strategy / key decisions', placeholder: 'Pricing change, new campaign…' }]
  }
};

export const DEFAULT_EMPLOYEES = [
  { id: 'naveen', name: 'Naveen', title: 'Sales head', roles: ['saleshead', 'telecaller', 'hiring', 'developer'], pin: '1111', isAdmin: true },
  { id: 'imran', name: 'Imran', title: 'Developer', roles: ['developer'], pin: '2222', isAdmin: false },
  { id: 'thulasi', name: 'Thulasi', title: 'Telecaller', roles: ['telecaller'], pin: '3333', isAdmin: false },
  { id: 'azgar', name: 'Azgar', title: 'Intern — sales & hiring', roles: ['telecaller', 'hiring'], pin: '4444', isAdmin: false },
  { id: 'sabi', name: 'Sabi', title: 'Intern — sales & hiring', roles: ['telecaller', 'hiring'], pin: '5555', isAdmin: false },
  { id: 'umar', name: 'Mohammed Umar', title: 'HR — hiring', roles: ['hiring'], pin: '6666', isAdmin: false },
  { id: 'management', name: 'Management', title: 'View all reports', roles: [], pin: '9999', isAdmin: true, viewOnly: true }
];

// Every metric across all roles, handy for exports
export const ALL_METRICS = Object.entries(ROLES).flatMap(([role, r]) =>
  r.metrics.map((m) => ({ ...m, role }))
);

export const MOODS = [
  { value: 5, label: 'Great day' },
  { value: 4, label: 'Good' },
  { value: 3, label: 'Okay' },
  { value: 2, label: 'Tough' },
  { value: 1, label: 'Very tough' }
];
