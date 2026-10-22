import { useState } from 'react';
import { supabase, fetchAllRows } from '../lib/supabaseClient';
import { todayKarachi } from '../lib/format';

export default function Settings({ profile, isAdmin }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      const [patients, invoices, payments, appointments, expenses] = await Promise.all([
        fetchAllRows(() => supabase.from('patients').select('*')),
        fetchAllRows(() => supabase.from('invoices').select('*')),
        fetchAllRows(() => supabase.from('payments').select('*')),
        fetchAllRows(() => supabase.from('appointments').select('*')),
        fetchAllRows(() => supabase.from('expenses').select('*')),
      ]);
      const failures = [patients, invoices, payments, appointments, expenses].filter((r) => r.error);
      if (failures.length) throw new Error(failures[0].error.message);

      const snapshot = {
        exported_at: new Date().toISOString(),
        patients: patients.data,
        invoices: invoices.data,
        payments: payments.data,
        appointments: appointments.data,
        expenses: expenses.data,
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clinicpilot-fdc-backup-${todayKarachi()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

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
      {isAdmin && (
        <div className="card settings-block">
          <h3 className="settings-block-title">Backup</h3>
          <p className="settings-desc">
            Download a full JSON snapshot of patients, invoices, payments, appointments, and expenses — keep a copy
            somewhere safe (e.g. Google Drive) after big billing days.
          </p>
          {exportError && <div className="error-text">{exportError}</div>}
          <button type="button" className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export All Data'}
          </button>
          <p className="settings-desc" style={{ marginTop: 10 }}>
            This is a manual, point-in-time snapshot, not continuous backup. For automated nightly backups and
            point-in-time recovery straight from Supabase, upgrade the project to the Pro plan.
          </p>
        </div>
      )}
    </section>
  );
}
