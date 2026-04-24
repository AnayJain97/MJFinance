import { useMemo } from 'react';
import { useCollection } from './useFirestore';
import { getOrgCollection } from '../context/OrgContext';

/**
 * Hook to subscribe to lock state for an org.
 * Returns:
 *   - locks: { [fyLabel]: { isLocked, lockedAt, lockedBy } }
 *   - lockedFYs: Set of FY labels currently locked
 *   - maxLockedFY: highest locked FY label (string, sortable) or null
 *   - isLocked(fy): convenience check
 *   - canLockFY(fy, allKnownFYs): true only when every previous FY (with data) is locked
 *   - isAddBlockedForDate(jsDate): blocks adds dated in or before maxLockedFY
 *   - loading
 */
export function useLocks(orgId) {
  const { data: lockDocs, loading } = useCollection(orgId ? getOrgCollection(orgId, 'locks') : null);

  return useMemo(() => {
    const locks = {};
    const lockedFYs = new Set();
    lockDocs.forEach(d => {
      // The doc id IS the fyLabel (we write them deterministically), but we
      // still require the explicit fyLabel field so a partial/legacy write
      // can't silently create a key like "cf-2024-25" that desyncs lock state.
      if (!d.fyLabel || typeof d.fyLabel !== 'string') {
        console.warn('useLocks: lock doc missing fyLabel field, ignoring:', d.id);
        return;
      }
      locks[d.fyLabel] = d;
      if (d.isLocked) lockedFYs.add(d.fyLabel);
    });

    const sortedLocked = [...lockedFYs].sort();
    const maxLockedFY = sortedLocked.length ? sortedLocked[sortedLocked.length - 1] : null;

    function isLocked(fy) {
      return lockedFYs.has(fy);
    }

    function canLockFY(fy, allKnownFYs) {
      // Must not already be locked
      if (lockedFYs.has(fy)) return false;
      // Every previous FY that has data must be locked
      const previous = (allKnownFYs || []).filter(f => f < fy);
      return previous.every(f => lockedFYs.has(f));
    }

    function isAddBlockedForFY(fyLabel) {
      // Adds blocked if target FY is at or before the highest locked FY
      if (!maxLockedFY) return false;
      return fyLabel <= maxLockedFY;
    }

    return { locks, lockedFYs, maxLockedFY, isLocked, canLockFY, isAddBlockedForFY, loading };
  }, [lockDocs, loading]);
}
