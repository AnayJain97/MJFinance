import { useState } from 'react';
import { reauthenticateCurrentUser } from '../services/lockService';

/**
 * Modal that prompts the user for their account password and re-authenticates
 * via Firebase before invoking the supplied async action.
 *
 * Props:
 *   open: boolean
 *   title: string
 *   description?: string
 *   confirmLabel?: string (default "Confirm")
 *   confirmVariant?: 'primary' | 'danger' (default 'primary')
 *   onCancel: () => void
 *   onConfirm: () => Promise<void>  // called after successful reauth
 */
export default function PasswordReauthDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  onCancel,
  onConfirm,
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    if (busy) return;
    setPassword('');
    setError('');
    onCancel();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Password is required');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await reauthenticateCurrentUser(password);
      await onConfirm();
      setPassword('');
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Incorrect password');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Try again later.');
      } else {
        setError(err?.message || 'Authentication failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: '0.5rem' }}>{title}</h3>
        {description && <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>{description}</p>}
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your account password"
            autoFocus
            disabled={busy}
          />
          {error && <div className="login-error">{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              className={`btn ${confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
              disabled={busy}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {busy ? 'Verifying...' : confirmLabel}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleClose}
              disabled={busy}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
