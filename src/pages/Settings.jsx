import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '../lib/format';
import {
  BACKUP_ENDPOINT,
  buildSnapshot,
  downloadSnapshot,
  listBackups,
  uploadSnapshot,
} from '../lib/backup';

const COUNT_LABELS = [
  ['patients', 'patients'],
  ['invoices', 'invoices'],
  ['payments', 'payments'],
  ['appointments', 'appointments'],
  ['expenses', 'expenses'],
];

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function countSummary(counts) {
  return COUNT_LABELS.map(([key, label]) => `${counts[key] ?? 0} ${label}`).join(' · ');
}

function BackupCard() {
  const configured = Boolean(BACKUP_ENDPOINT);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState(null);
  const [recentError, setRecentError] = useState('');

  const loadRecent = useCallback(async () => {
    if (!configured) return;
    try {
      setRecent(await listBackups());
      setRecentError('');
    } catch (err) {
      setRecentError(err.message);
    }
  }, [configured]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  async function handleBackup() {
    setBusy('backup');
    setError('');
    setResult(null);
    let built;
    try {
      built = await buildSnapshot();
    } catch (err) {
      setError(`Could not read the data, nothing was saved. ${err.message}`);
      setBusy('');
      return;
    }

    if (!configured) {
      downloadSnapshot(built.snapshot);
      setResult({ where: 'computer', counts: built.counts, verified: true });
      setBusy('');
      return;
    }

    try {
      const saved = await uploadSnapshot(built.snapshot, built.counts);
      setResult({ where: 'cloud', ...saved });
      loadRecent();
    } catch (err) {
      // Never lose the work: if the cloud save failed, hand over the file locally.
      downloadSnapshot(built.snapshot);
      setError(`Cloud backup failed (${err.message}). A copy was downloaded to this computer instead.`);
    }
    setBusy('');
  }

  async function handleDownloadOnly() {
    setBusy('download');
    setError('');
    setResult(null);
    try {
      const built = await buildSnapshot();
      downloadSnapshot(built.snapshot);
      setResult({ where: 'computer', counts: built.counts, verified: true });
    } catch (err) {
      setError(`Could not read the data, nothing was saved. ${err.message}`);
    }
    setBusy('');
  }

  return (
    <div className="card settings-block">
      <h3 className="settings-block-title">Backup</h3>
      <p className="settings-desc">
        {configured
          ? 'Saves a complete, dated copy of all clinic data (patients, invoices, payments, appointments, expenses, notes, staff, audit log) to private cloud storage. Press it at the end of each day.'
          : 'Cloud backup is not connected yet, so Back Up Now will download the file to this computer. Keep it somewhere safe.'}
      </p>

      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}

      {result && (
        <div
          style={{
            background: result.verified ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${result.verified ? '#bbf7d0' : '#fecaca'}`,
            color: result.verified ? '#166534' : 'var(--danger)',
            borderRadius: 'var(--radius)',
            padding: '10px 12px',
            fontSize: '0.8125rem',
            marginBottom: 12,
          }}
        >
          <strong>
            {result.where === 'cloud'
              ? result.verified ? 'Backed up to cloud storage and verified.' : 'Saved to cloud storage, but the stored size does not match.'
              : 'Downloaded to this computer.'}
          </strong>
          {result.filename && <div>{result.filename}{result.size ? ` · ${formatSize(result.size)}` : ''}</div>}
          <div>{countSummary(result.counts)}</div>
          {result.where === 'cloud' && !result.verified && <div>Press Back Up Now again.</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={handleBackup} disabled={Boolean(busy)}>
          {busy === 'backup' ? 'Backing up…' : 'Back Up Now'}
        </button>
        {configured && (
          <button type="button" className="btn btn-secondary" onClick={handleDownloadOnly} disabled={Boolean(busy)}>
            {busy === 'download' ? 'Preparing…' : 'Download a copy'}
          </button>
        )}
      </div>

      {configured && (
        <div style={{ marginTop: 16 }}>
          <div className="settings-desc" style={{ marginBottom: 6 }}>
            {recent === null && !recentError && 'Checking cloud storage…'}
            {recent && recent.length === 0 && 'No backups in cloud storage yet.'}
            {recent && recent.length > 0 && <>Last backup: <strong>{formatDateTime(recent[0].createdAt)}</strong></>}
            {recentError && `Could not read the backup list (${recentError}).`}
          </div>
          {recent && recent.length > 1 && (
            <ul className="settings-desc" style={{ margin: 0, paddingLeft: 18 }}>
              {recent.slice(0, 5).map((f) => (
                <li key={f.name}>{formatDateTime(f.createdAt)} · {formatSize(f.size)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="settings-desc" style={{ marginTop: 14, marginBottom: 0 }}>
        This is a point-in-time snapshot, not continuous backup. Anything entered after you press the button is
        not in that file.
      </p>
    </div>
  );
}

export default function Settings({ profile, isAdmin }) {
  return (
    <section className="pane active settings-pane">
      <h2 className="settings-heading">Settings</h2>
      <div className="card settings-block">
        <h3 className="settings-block-title">Account</h3>
        <p className="settings-desc">
          Signed in as <strong>{profile.full_name}</strong> ({profile.role}).
        </p>
      </div>
      {isAdmin && (
        <div className="card settings-block">
          <h3 className="settings-block-title">Staff Accounts</h3>
          <p className="settings-desc">
            Add or remove staff logins from the Supabase dashboard (Authentication → Users), then add a matching row
            to <code>staff_profiles</code> with their role. To let a CSR account use Expenses, set
            <code> has_expenses_access = true</code> on their row.
          </p>
        </div>
      )}
      {isAdmin && <BackupCard />}
    </section>
  );
}
