import { useEffect, useMemo, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { getNextFYLabel, toJSDate, fyLabelToEndDate } from '../utils/dateUtils';
import { computeCarryForwardPlan } from '../modules/lending/utils/lendingCalcs';

const CARRY_FORWARD_RATE = 0.8;

/**
 * Hook to auto-create carry-forward entries across FY boundaries.
 *
 * Idempotent and loop-safe:
 *   - Re-runs only when non-CF inputs change (uses a stable signature, not array identity)
 *   - Skips Firestore writes when existing CF docs already match the computed plan
 */
export function useCarryForward(orgId, loans, borrowings, canWrite) {
  const processingRef = useRef(false);

  // Stable signature derived from non-CF entries only.
  // CF docs writing back through onSnapshot won't change this, so the effect won't loop.
  const inputSignature = useMemo(() => {
    const nonCfLoans = loans
      .filter(l => !l.isCarryForward)
      .map(l => `L:${l.id}:${l.principalAmount}:${toJSDate(l.loanDate).getTime()}:${l.monthlyInterestRate}:${l.endDate ? toJSDate(l.endDate).getTime() : ''}`)
      .sort();
    const nonCfBorrowings = borrowings
      .filter(b => !b.isCarryForward)
      .map(b => `B:${b.id}:${b.amount}:${toJSDate(b.borrowDate).getTime()}:${b.monthlyInterestRate}:${b.endDate ? toJSDate(b.endDate).getTime() : ''}`)
      .sort();
    return [...nonCfLoans, ...nonCfBorrowings].join('|');
  }, [loans, borrowings]);

  useEffect(() => {
    if (!orgId || !canWrite) return;
    if (!inputSignature) return;

    const loansPath = `orgs/${orgId}/loans`;
    const borrowingsPath = `orgs/${orgId}/borrowings`;

    async function processCarryForwards() {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        // Compute desired CF plan: one entry per previous FY (lending or borrowing side)
        const plan = computeCarryForwardPlan(loans, borrowings);

        // Read existing CF docs from both collections
        const [existingLoanCFs, existingBorrowingCFs] = await Promise.all([
          getDocs(query(collection(db, loansPath), where('isCarryForward', '==', true))),
          getDocs(query(collection(db, borrowingsPath), where('isCarryForward', '==', true))),
        ]);

        const existingBySource = new Map(); // sourceFY -> { side, amount, id, path }
        const stragglers = []; // duplicates to delete unconditionally
        existingLoanCFs.docs.forEach(d => {
          const data = d.data();
          const entry = { side: 'lending', amount: data.principalAmount, id: d.id, path: loansPath };
          if (existingBySource.has(data.sourceFY)) stragglers.push(entry);
          else existingBySource.set(data.sourceFY, entry);
        });
        existingBorrowingCFs.docs.forEach(d => {
          const data = d.data();
          const entry = { side: 'borrowing', amount: data.amount, id: d.id, path: borrowingsPath };
          if (existingBySource.has(data.sourceFY)) stragglers.push(entry);
          else existingBySource.set(data.sourceFY, entry);
        });

        const planBySource = new Map();
        plan.forEach(p => planBySource.set(p.sourceFY, p));

        // Delete duplicates first
        for (const s of stragglers) {
          await deleteDoc(doc(db, s.path, s.id));
        }

        // Delete existing CF docs that don't match the plan (or aren't in plan at all)
        for (const [sourceFY, existing] of existingBySource.entries()) {
          const desired = planBySource.get(sourceFY);
          const matches = desired
            && desired.side === existing.side
            && Math.abs(desired.amount - existing.amount) < 0.01;
          if (!matches) {
            await deleteDoc(doc(db, existing.path, existing.id));
          }
        }

        // Add CF docs for plan entries that don't have a matching existing doc
        for (const p of plan) {
          const existing = existingBySource.get(p.sourceFY);
          const matches = existing
            && existing.side === p.side
            && Math.abs(existing.amount - p.amount) < 0.01;
          if (matches) continue;

          const path = p.side === 'lending' ? loansPath : borrowingsPath;
          const nextFY = getNextFYLabel(p.sourceFY);
          const fyEnd = fyLabelToEndDate(nextFY);
          const fyStart = new Date(parseInt(nextFY.split('-')[0], 10), 3, 1);
          const newData = buildCarryForwardDoc(p.sourceFY, p.amount, p.side === 'lending', fyStart, fyEnd);
          await addDoc(collection(db, path), newData);
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
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.email || '',
  };

  if (isLending) {
    return { ...base, principalAmount: amount, loanDate: startDate, totalRepaid: 0 };
  } else {
    return { ...base, amount: amount, borrowDate: startDate };
  }
}
