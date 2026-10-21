// Formatting helpers. All dates are displayed in Asia/Karachi regardless of
// the viewer's machine, per the brief: DD/MM/YYYY, 12-hour AM/PM, PKR.

const KHI_TZ = 'Asia/Karachi';

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: KHI_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: KHI_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: KHI_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${date}, ${time}`;
}

export function formatMoney(value) {
  const n = Number(value) || 0;
  return 'Rs ' + n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

// YYYY-MM for the current month, in Karachi local time (not UTC — matters
// near midnight for users near the date line from UTC's perspective).
export function currentMonthKarachi() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KHI_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  return `${year}-${month}`;
}

// Returns [startIsoInclusive, endIsoExclusive) for a 'YYYY-MM' month,
// anchored at Asia/Karachi midnight (+05:00, no DST).
export function monthRangeKarachi(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = new Date(`${yyyyMm}-01T00:00:00+05:00`);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:00`);
  return [start.toISOString(), end.toISOString()];
}

export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
};

export const APPOINTMENT_STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
};
