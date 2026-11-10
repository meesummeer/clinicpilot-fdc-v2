import { useEffect, useState } from 'react';
import { cardFilename, downloadBlob, formatUid, makePatientCardBlob, qrDataUrl } from '../lib/patientCard';

// The patient's UID as text and QR code, with a button that saves it as a PNG
// card to send to the patient. They show it at the clinic and it is scanned
// in the Portal.
export default function PatientIdCard({ patient }) {
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setQr('');
    if (patient.uid) qrDataUrl(patient.uid).then((u) => live && setQr(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [patient.uid]);

  if (!patient.uid) {
    return (
      <div className="id-card">
        <div className="id-card__label">Patient ID</div>
        <p className="checkin-muted">No UID yet. Run supabase/05_patient_uid.sql in the Supabase SQL Editor.</p>
      </div>
    );
  }

  async function run(kind) {
    setBusy(kind);
    setError('');
    try {
      const blob = await makePatientCardBlob(patient);
      const filename = cardFilename(patient);
      if (kind === 'share') {
        const file = new File([blob], filename, { type: 'image/png' });
        await navigator.share({ files: [file], title: 'Faseeh Dental Clinic – Patient ID' });
      } else {
        downloadBlob(blob, filename);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err.message || 'Could not create the card.');
    } finally {
      setBusy('');
    }
  }

  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });

  return (
    <div className="id-card">
      <div className="id-card__label">Patient ID</div>
      {qr ? <img className="id-card__qr" src={qr} alt={`QR code for ${formatUid(patient.uid)}`} /> : <div className="id-card__qr" />}
      <div className="id-card__uid">{formatUid(patient.uid)}</div>
      <div className="id-card__actions">
        <button type="button" className="btn btn-primary btn-small" onClick={() => run('png')} disabled={Boolean(busy)}>
          {busy === 'png' ? 'Saving…' : 'Save as PNG'}
        </button>
        {canShare && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => run('share')} disabled={Boolean(busy)}>
            {busy === 'share' ? 'Preparing…' : 'Share'}
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
