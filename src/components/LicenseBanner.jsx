// Scrolling red license-expiry notice. To remove it once the license is
// renewed, delete the <LicenseBanner /> usages in App.jsx (this file and the
// .license-banner CSS can then go too).
const MESSAGE =
  'ATTENTION! ClinicPilot-FDC will expire at 11:59pm, 28th October, 2026. ' +
  'Please renew your license by getting in touch at hello@cyberhealth-solutions.com. Thank you!';

// The message is repeated so the track always covers the width of the
// viewport; the animation shifts by half the track, which lands exactly on
// the start of the second group, so the loop has no visible jump.
const COPIES = [0, 1, 2, 3];

export default function LicenseBanner({ fixed = false }) {
  return (
    <div className={'license-banner' + (fixed ? ' license-banner--fixed' : '')} role="status">
      <div className="license-banner__track">
        {COPIES.map((i) => (
          <span key={i} aria-hidden={i > 0 ? 'true' : undefined}>{MESSAGE}</span>
        ))}
      </div>
    </div>
  );
}
