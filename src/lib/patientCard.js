import QRCode from 'qrcode';

// A patient's UID is 8 characters (see supabase/05_patient_uid.sql). People
// see it as K7Q2-9XMD; the QR code carries FDC-K7Q2-9XMD. The scanner side
// (parsePatientCode in visits.js) understands this exact form.
export function formatUid(uid) {
  const u = String(uid || '').toUpperCase();
  return u.length === 8 ? `${u.slice(0, 4)}-${u.slice(4)}` : u;
}

export function uidPayload(uid) {
  return `FDC-${formatUid(uid)}`;
}

export function cardFilename(patient) {
  return `FDC-patient-${patient.mr_no}-${patient.uid}.png`;
}

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // the card is still valid without the logo
    img.src = src;
  });
}

// Shrinks the font until the text fits the width.
function fitText(ctx, text, maxWidth, startPx, weight) {
  let px = startPx;
  do {
    ctx.font = `${weight} ${px}px ${FONT}`;
    px -= 2;
  } while (ctx.measureText(text).width > maxWidth && px > 16);
}

// QR code as a data URL, for the on-screen preview.
export function qrDataUrl(uid, width = 320) {
  return QRCode.toDataURL(uidPayload(uid), { errorCorrectionLevel: 'M', margin: 1, width });
}

// The picture that gets sent to the patient: clinic, QR, name, MR number and
// the UID in text, so it still works if the QR will not scan. Returns a PNG Blob.
export async function makePatientCardBlob(patient) {
  const W = 720;
  const H = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#009688';
  ctx.fillRect(0, 0, W, 14);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const logo = await loadImage(`${import.meta.env.BASE_URL}fdc-logo.png`);
  let y = 56;
  if (logo) {
    const h = 84;
    const w = Math.min(300, (logo.width / logo.height) * h);
    ctx.drawImage(logo, (W - w) / 2, y, w, h);
    y += h + 20;
  }
  ctx.fillStyle = '#0f172a';
  fitText(ctx, 'Faseeh Dental Clinic', W - 80, 38, 700);
  ctx.fillText('Faseeh Dental Clinic', W / 2, y + 36);
  ctx.fillStyle = '#6b7280';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText('Patient ID', W / 2, y + 72);

  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, uidPayload(patient.uid), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 480,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
  const qrY = y + 100;
  ctx.drawImage(qr, (W - 480) / 2, qrY, 480, 480);

  let ty = qrY + 480 + 64;
  ctx.fillStyle = '#0f172a';
  fitText(ctx, patient.name, W - 80, 42, 700);
  ctx.fillText(patient.name, W / 2, ty);
  ty += 40;
  ctx.fillStyle = '#6b7280';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(`MR #${patient.mr_no}`, W / 2, ty);
  ty += 64;
  ctx.fillStyle = '#009688';
  ctx.font = '700 46px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  ctx.fillText(formatUid(patient.uid), W / 2, ty);
  ty += 44;
  ctx.fillStyle = '#6b7280';
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText('Show this code at reception to check in.', W / 2, ty);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png')
  );
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
