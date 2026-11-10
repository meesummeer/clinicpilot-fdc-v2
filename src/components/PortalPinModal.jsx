import { useEffect, useRef, useState } from 'react';
import { PORTAL_PIN } from '../lib/portal';

const MAX_TRIES = 5;
const PAUSE_MS = 30000;

// Asks for the staff PIN before leaving the Portal. After 5 wrong tries it
// pauses for 30 seconds.
export default function PortalPinModal({ onUnlock, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [, tick] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!pausedUntil) return undefined;
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (Date.now() >= pausedUntil) {
        setPausedUntil(0);
        setTries(0);
        setError('');
        clearInterval(t);
      }
    }, 500);
    return () => clearInterval(t);
  }, [pausedUntil]);

  const waitSec = Math.max(0, Math.ceil((pausedUntil - Date.now()) / 1000));

  function submit(e) {
    e.preventDefault();
    if (waitSec > 0) return;
    if (pin === PORTAL_PIN) {
      onUnlock();
      return;
    }
    const n = tries + 1;
    setTries(n);
    setPin('');
    if (n >= MAX_TRIES) {
      setPausedUntil(Date.now() + PAUSE_MS);
      setError('Too many wrong tries.');
    } else {
      setError('Wrong PIN.');
    }
    inputRef.current?.focus();
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Staff PIN">
      <form className="modal-content portal-pin" onSubmit={submit}>
        <h2 style={{ margin: '0 0 4px' }}>Staff only</h2>
        <p className="checkin-muted" style={{ margin: '0 0 12px' }}>Enter the PIN to open ClinicPilot.</p>
        <input
          ref={inputRef}
          className="portal-pin__input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          aria-label="PIN"
          value={pin}
          disabled={waitSec > 0}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
            {waitSec > 0 ? ` Try again in ${waitSec} s.` : ''}
          </p>
        )}
        <div className="checkin-panel__actions">
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={pin.length !== 4 || waitSec > 0}>
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
