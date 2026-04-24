/**
 * Generic informational modal with a single dismiss button.
 *
 * Props:
 *   open, title, description, onClose, confirmLabel?
 */
export default function InfoDialog({ open, title, description, onClose, confirmLabel = 'OK' }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: '0.5rem' }}>{title}</h3>
        {description && (
          <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>{description}</p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onClose}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
