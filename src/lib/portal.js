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
