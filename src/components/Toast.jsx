import { useEffect, useRef } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  // Stash onClose in a ref so the auto-dismiss timer doesn't reset every time
  // the parent re-renders with a new inline closure.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current?.(), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button className="toast-close" onClick={onClose}>✕</button>
    </div>
  );
}
