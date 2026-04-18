import { useState, useRef, useCallback } from 'react';

export default function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const iconRef = useRef(null);

  const show = useCallback(() => {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    const tooltipWidth = 300;
    const tooltipHeight = 100; // approximate

    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    // Clamp to viewport edges
    if (left < 8) left = 8;
    if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8;
    if (top + tooltipHeight > window.innerHeight - 8) {
      top = rect.top - tooltipHeight - 8; // flip above
    }
    if (top < 8) top = 8;

    setPos({ top, left });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <span
      ref={iconRef}
      className="info-icon"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children || 'ⓘ'}
      {visible && (
        <div className="tooltip-box" style={{ top: pos.top, left: pos.left }}>
          {text}
        </div>
      )}
    </span>
  );
}
