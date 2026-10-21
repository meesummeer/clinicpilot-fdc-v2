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
            to <code>staff_profiles</code> with their role.
          </p>
        </div>
      )}
    </section>
  );
}
