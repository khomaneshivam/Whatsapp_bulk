/**
 * Universal Indian Standard Time (IST, UTC+5:30) Formatter
 * Guarantees that all dates and times across the entire application
 * display and parse in exact Indian Standard Time regardless of local OS or browser settings.
 */

export function parseIndianDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    return new Date(val < 1e11 ? val * 1000 : val);
  }
  const str = String(val).trim();
  if (!str) return null;

  if (/^\d{10}$/.test(str)) {
    return new Date(parseInt(str, 10) * 1000);
  }
  if (/^\d{13}$/.test(str)) {
    return new Date(parseInt(str, 10));
  }
  // SQLite format YYYY-MM-DD HH:mm:ss without timezone -> stored as UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(str)) {
    return new Date(str.replace(' ', 'T') + 'Z');
  }
  // Datetime-local format YYYY-MM-DDTHH:mm without timezone -> user picked Indian time
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
    return new Date(str + '+05:30');
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function formatIndianDateTime(val, includeSeconds = false) {
  const d = parseIndianDate(val);
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: true
  }).format(d);
}

export function formatIndianTime(val, includeSeconds = false) {
  const d = parseIndianDate(val);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: true
  }).format(d);
}

export function formatIndianDate(val) {
  const d = parseIndianDate(val);
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(d);
}

export function getIndianCurrentInputString(offsetMinutes = 5) {
  const now = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);

  const lookup = {};
  parts.forEach(p => { lookup[p.type] = p.value; });
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}`;
}
