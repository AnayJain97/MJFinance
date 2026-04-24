/**
 * Inline error banner used to surface read failures from useCollection /
 * useDocument that would otherwise leave the page silently empty.
 */
export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        background: '#fdecea',
        color: '#a61b1b',
        border: '1px solid #f5c2c0',
        padding: '0.75rem 1rem',
        borderRadius: 6,
        margin: '1rem 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <span style={{ fontSize: '0.9rem' }}>⚠ {message}</span>
      {onRetry && (
        <button className="btn btn-sm btn-outline" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}
