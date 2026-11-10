// The Portal is the tablet-facing check-in screen. It lives at /portal and
// opens in its own named window, so clicking Portal again reuses that window
// instead of piling up tabs.
const WINDOW_NAME = 'fdc-portal';

export function portalHref(search = '') {
  return new URL(`${import.meta.env.BASE_URL}portal${search}`, window.location.origin).href;
}

export function openPortal(search = '') {
  const win = window.open(portalHref(search), WINDOW_NAME);
  if (win) win.focus();
  else window.location.assign(portalHref(search)); // popup blocked: use this tab
}

// ---- Portal lock ----
// Keeps whoever is handed the tablet inside the Portal. The PIN sits in the
// page code, so this stops casual taps and typed URLs, not a determined user:
// pair it with iPad Guided Access / Android screen pinning for a real lock.
// To change the PIN, edit it here.
export const PORTAL_PIN = '2024';

const LOCK_KEY = 'fdc.portal.locked';

// sessionStorage is per tab, so only the Portal window is ever locked; staff
// using ClinicPilot in another tab are untouched.
export function isPortalLocked() {
  try {
    return sessionStorage.getItem(LOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function lockPortal() {
  try {
    sessionStorage.setItem(LOCK_KEY, '1');
  } catch {
    // no storage: the PIN button still works, the tab just is not locked
  }
}

export function unlockPortal() {
  try {
    sessionStorage.removeItem(LOCK_KEY);
  } catch {
    // nothing to clear
  }
}
