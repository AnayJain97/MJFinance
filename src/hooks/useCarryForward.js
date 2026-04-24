import { useEffect, useMemo, useRef } from 'react';
import { collection, query, where, getDocs, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { getNextFYLabel, toJSDate, fyLabelToEndDate } from '../utils/dateUtils';
import { computeCarryForwardPlan } from '../modules/lending/utils/lendingCalcs';

// Deterministic CF doc ID derived from sourceFY. Using setDoc with this ID makes
// CF writes idempotent — concurrent invocations (e.g. React StrictMode double-mount,
// rapid input changes, navigation races) can never produce two CF docs for the same FY.
const cfDocId = (sourceFY) => `cf-${sourceFY}`;

const CARRY_FORWARD_RATE = 0.8;

/**
 * Hook to auto-create carry-forward entries across FY boundaries.
 *
 * Idempotent and loop-safe:
 *   - Re-runs only when non-CF inputs change (uses a stable signature, not array identity)
 *   - Skips Firestore writes when existing CF docs already match the computed plan
 */
export function useCarryForward(orgId, loans, borrowings, canWrite, locks = {}) {
  const processingRef = useRef(false);
  // Tracks the orgId of the in-flight batch so an org switch mid-batch doesn't
  // leave a stale `processingRef.current = true` that blocks the next org's CF.
  const processingOrgRef = useRef(null);

  // Reset processing state on org switch — a previous org's in-flight batch
  // closure may still be running, but it must not block the new org.
  useEffect(() => {
    processingRef.current = false;
    processingOrgRef.current = null;
  }, [orgId]);

  // Stable signature derived from non-CF entries only + lock state.
  // CF docs writing back through onSnapshot won't change this, so the effect won't loop.
  const inputSignature = useMemo(() => {
    const safeTime = (d) => {
      const js = toJSDate(d);
      return js ? js.getTime() : '';
    };
    const nonCfLoans = loans
      .filter(l => !l.isCarryForward && l.loanDate != null)
      .map(l => `L:${l.id}:${l.principalAmount}:${safeTime(l.loanDate)}:${l.monthlyInterestRate}:${l.endDate ? safeTime(l.endDate) : ''}`)
      .sort();
    const nonCfBorrowings = borrowings
      .filter(b => !b.isCarryForward && b.borrowDate != null)
      .map(b => `B:${b.id}:${b.amount}:${safeTime(b.borrowDate)}:${b.monthlyInterestRate}:${b.endDate ? safeTime(b.endDate) : ''}`)
      .sort();
    const lockSig = Object.entries(locks)
      .filter(([, l]) => l?.isLocked)
      .map(([fy, l]) => `K:${fy}:${l.cfSide || ''}:${l.cfAmount ?? 0}`)
      .sort();
    return [...nonCfLoans, ...nonCfBorrowings, ...lockSig].join('|');
  }, [loans, borrowings, locks]);

  useEffect(() => {
    if (!orgId || !canWrite) return;
    if (!inputSignature) return;

    const loansPath = `orgs/${orgId}/loans`;
    const borrowingsPath = `orgs/${orgId}/borrowings`;

    async function processCarryForwards() {
      if (processingRef.current) return;
      processingRef.current = true;
      processingOrgRef.current = orgId;

      // Local helper: detect org switch mid-batch. If the current effect's orgId
      // no longer matches, abort to avoid writing one org's data into another.
      const stillCurrent = () => processingOrgRef.current === orgId;

      try {
        // Compute desired CF plan: one entry per previous FY (lending or borrowing side)
        const plan = computeCarryForwardPlan(loans, borrowings, locks);

        // Read existing CF docs from both collections
        const [existingLoanCFs, existingBorrowingCFs] = await Promise.all([
          getDocs(query(collection(db, loansPath), where('isCarryForward', '==', true))),
          getDocs(query(collection(db, borrowingsPath), where('isCarryForward', '==', true))),
        ]);

        const existingBySource = new Map(); // sourceFY -> { side, amount, id, path }
        const stragglers = []; // legacy auto-ID docs and duplicates — delete unconditionally

        const ingest = (d, side, path, amount) => {
          const data = d.data();
          if (!data.sourceFY) {
            stragglers.push({ id: d.id, path });
            return;
          }
          const expectedId = cfDocId(data.sourceFY);
          // Any doc not on the deterministic ID is legacy and must be removed.
          if (d.id !== expectedId) {
            stragglers.push({ id: d.id, path });
            return;
          }
          const entry = { side, amount, id: d.id, path };
          if (existingBySource.has(data.sourceFY)) {
            // Shouldn't happen with deterministic IDs, but guard anyway.
            stragglers.push(entry);
          } else {
            existingBySource.set(data.sourceFY, entry);
          }
        };

        existingLoanCFs.docs.forEach(d => ingest(d, 'lending', loansPath, d.data().principalAmount));
        existingBorrowingCFs.docs.forEach(d => ingest(d, 'borrowing', borrowingsPath, d.data().amount));

        const planBySource = new Map();
        plan.forEach(p => planBySource.set(p.sourceFY, p));

        // 1. Delete legacy/duplicate docs first. Each delete is independent — a single
        //    failure must not abort the rest, otherwise the cascade can desync silently.
        const failures = [];
        for (const s of stragglers) {
          if (!stillCurrent()) return;
          try {
            await deleteDoc(doc(db, s.path, s.id));
          } catch (err) {
            failures.push({ op: 'delete-straggler', id: s.id, err });
          }
        }

        // 2. Delete wrong-side existing CF docs (so the deterministic ID is free
        //    on the target side before we setDoc), and any CFs not in the plan.
        //    Note: do NOT skip locked source FYs — the plan already reflects the
        //    frozen value for locked FYs (via locks[].cfAmount/cfSide).
        for (const [sourceFY, existing] of [...existingBySource.entries()]) {
          if (!stillCurrent()) return;
          const desired = planBySource.get(sourceFY);
          if (!desired || desired.side !== existing.side) {
            try {
              await deleteDoc(doc(db, existing.path, existing.id));
              existingBySource.delete(sourceFY);
            } catch (err) {
              failures.push({ op: 'delete-stale-cf', sourceFY, err });
              // Leave entry in map; next run will retry.
            }
          }
        }

        // 3. setDoc each plan entry with the deterministic ID. Idempotent — overwrites
        //    if the doc already exists with stale amount, no-ops if it matches.
        for (const p of plan) {
          if (!stillCurrent()) return;
          // Defensive: never write a NaN/non-finite amount to Firestore.
          if (!Number.isFinite(p.amount)) {
            failures.push({ op: 'plan-entry-invalid', sourceFY: p.sourceFY, amount: p.amount });
            continue;
          }
          const existing = existingBySource.get(p.sourceFY);
          if (existing
            && existing.side === p.side
            && Math.abs(existing.amount - p.amount) < 0.01) {
            continue; // already correct
          }

          const path = p.side === 'lending' ? loansPath : borrowingsPath;
          const nextFY = getNextFYLabel(p.sourceFY);
          const fyEnd = fyLabelToEndDate(nextFY);
          const fyStart = new Date(parseInt(nextFY.split('-')[0], 10), 3, 1);
          const newData = buildCarryForwardDoc(p.sourceFY, p.amount, p.side === 'lending', fyStart, fyEnd);
          try {
            await setDoc(doc(db, path, cfDocId(p.sourceFY)), newData);
          } catch (err) {
            failures.push({ op: 'write-cf', sourceFY: p.sourceFY, err });
          }
        }

        if (failures.length > 0) {
          // Surface to console; the next signature change will retry. We deliberately
          // do not throw — partial progress is better than no progress, and the loop
          // is idempotent because of deterministic IDs and plan-diff logic.
          console.error(`Carry-forward processing completed with ${failures.length} failure(s):`, failures);
        }
      } catch (err) {
        console.error('Carry-forward processing error:', err);
      } finally {
        processingRef.current = false;
      }
    }

    processCarryForwards();
  }, [orgId, inputSignature, canWrite]);
}

function buildCarryForwardDoc(sourceFY, amount, isLending, startDate, endDate) {
  const base = {
    clientName: `FY ${sourceFY} Balance`,
    monthlyInterestRate: CARRY_FORWARD_RATE,
    endDate: endDate,
    notes: `Auto-generated carry-forward from FY ${sourceFY}`,
    isCarryForward: true,
    sourceFY: sourceFY,
    // The CF doc itself sits in the FY following sourceFY; persist that label
    // so Firestore rules can enforce per-FY locks server-side.
    fyLabel: getNextFYLabel(sourceFY),
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.email || '',
  };

  if (isLending) {
    return { ...base, principalAmount: amount, loanDate: startDate, totalRepaid: 0 };
  } else {
    return { ...base, amount: amount, borrowDate: startDate };
  }
}
