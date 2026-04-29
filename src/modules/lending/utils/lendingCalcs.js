import { getFYEndDate, toJSDate, getCurrentFYLabel, fyLabelToEndDate, getNextFYLabel } from '../../../utils/dateUtils';

/**
 * Calculate monthly interest on a principal amount.
 */
function calcMonthlyInterest(principal, monthlyRatePercent) {
  return principal * (monthlyRatePercent / 100);
}

/**
 * Get number of days from a date to the target end date.
 * If endDate is provided, use that; otherwise use current FY end.
 */
function getDaysTillEnd(fromDate = new Date(), endDate = null) {
  const now = new Date(fromDate);
  const target = endDate ? new Date(endDate) : getFYEndDate(new Date());
  if (now >= target) return 0;
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate interest from a date till end date (or current FY end if no end date).
 * Formula: days × (principal × monthlyRate / 100 / 30)
 */
function calcInterestTillFYEnd(principal, monthlyRatePercent, fromDate = new Date(), endDate = null) {
  const days = getDaysTillEnd(fromDate, endDate);
  if (days === 0) return 0;
  const dailyRate = monthlyRatePercent / 30;
  const dailyInterest = principal * (dailyRate / 100);
  return dailyInterest * days;
}

/**
 * Build the formula description string for tooltip display.
 */
function getInterestFormula(principal, monthlyRatePercent, fromDate = new Date(), endDate = null) {
  const now = new Date(fromDate);
  const target = endDate ? new Date(endDate) : getFYEndDate(new Date());
  if (now >= target) return 'Period ended — no interest due';

  const days = getDaysTillEnd(now, endDate);
  const dailyRate = monthlyRatePercent / 30;
  const dailyInterest = principal * (dailyRate / 100);
  const total = dailyInterest * days;
  const targetStr = target.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const endLabel = endDate ? `end date (${targetStr})` : `FY end (31 Mar)`;

  return `Monthly rate: ${monthlyRatePercent}%\n`
    + `Daily rate: ${monthlyRatePercent}% / 30 = ${dailyRate.toFixed(4)}%\n`
    + `Daily interest: ₹${principal.toLocaleString('en-IN')} × ${dailyRate.toFixed(4)}% = ₹${dailyInterest.toFixed(2)}\n`
    + `End date: ${targetStr}\n`
    + `Days till ${endLabel}: ${days}\n`
    + `Interest = ${days} × ₹${dailyInterest.toFixed(2)} = ₹${total.toFixed(2)}`;
}

/**
 * Build a summary for a lending entry.
 * Interest is always on full principal from loan date to FY end.
 */
export function getLendingSummary(loan) {
  const principal = loan.principalAmount;
  const loanDate = toJSDate(loan.loanDate);
  const endDate = loan.endDate ? toJSDate(loan.endDate) : null;
  if (!loanDate) {
    // Defensive: corrupt entry without a usable date. Return zero summary so
    // the row renders but doesn't poison aggregate totals with NaN.
    return { principal: principal || 0, monthlyInterest: 0, daysTillFYEnd: 0, interestTillFYEnd: 0, totalDue: principal || 0, formulaText: 'Missing loan date' };
  }
  const monthlyInterest = calcMonthlyInterest(principal, loan.monthlyInterestRate);
  const daysTillEnd = getDaysTillEnd(loanDate, endDate);
  const interestTillFYEnd = Math.round(calcInterestTillFYEnd(principal, loan.monthlyInterestRate, loanDate, endDate) * 100) / 100;
  const totalDue = Math.round((principal + interestTillFYEnd) * 100) / 100;
  const formulaText = getInterestFormula(principal, loan.monthlyInterestRate, loanDate, endDate);

  return { principal, monthlyInterest, daysTillFYEnd: daysTillEnd, interestTillFYEnd, totalDue, formulaText };
}

/**
 * Build a summary for a borrowing entry.
 * Interest is on the amount from borrowing date to FY end.
 */
export function getBorrowingSummary(borrowing) {
  const amount = borrowing.amount;
  const borrowDate = toJSDate(borrowing.borrowDate);
  const endDate = borrowing.endDate ? toJSDate(borrowing.endDate) : null;
  if (!borrowDate) {
    return { amount: amount || 0, monthlyInterest: 0, daysTillFYEnd: 0, interestTillFYEnd: 0, totalCredit: amount || 0, formulaText: 'Missing borrow date' };
  }
  const monthlyInterest = calcMonthlyInterest(amount, borrowing.monthlyInterestRate);
  const daysTillEnd = getDaysTillEnd(borrowDate, endDate);
  const interestTillFYEnd = Math.round(calcInterestTillFYEnd(amount, borrowing.monthlyInterestRate, borrowDate, endDate) * 100) / 100;
  const totalCredit = Math.round((amount + interestTillFYEnd) * 100) / 100;
  const formulaText = getInterestFormula(amount, borrowing.monthlyInterestRate, borrowDate, endDate);

  return { amount, monthlyInterest, daysTillFYEnd: daysTillEnd, interestTillFYEnd, totalCredit, formulaText };
}

/**
 * Build finalized per-client summary: lendings vs borrowings.
 */
export function getClientFinalized(loans, borrowings) {
  const clientMap = {};

  loans.forEach(loan => {
    const key = loan.clientName.trim().toLowerCase();
    if (!clientMap[key]) {
      clientMap[key] = { clientName: loan.clientName, lendings: [], borrowings: [] };
    }
    clientMap[key].lendings.push(loan);
  });

  borrowings.forEach(b => {
    const key = b.clientName.trim().toLowerCase();
    if (!clientMap[key]) {
      clientMap[key] = { clientName: b.clientName, lendings: [], borrowings: [] };
    }
    clientMap[key].borrowings.push(b);
  });

  return Object.values(clientMap).map(client => {
    const lendingSummaries = client.lendings.map(getLendingSummary);
    const borrowingSummaries = client.borrowings.map(getBorrowingSummary);

    const totalLent = Math.round(lendingSummaries.reduce((s, v) => s + v.principal, 0) * 100) / 100;
    const totalLendingInterest = Math.round(lendingSummaries.reduce((s, v) => s + v.interestTillFYEnd, 0) * 100) / 100;
    const totalLendingDue = Math.round((totalLent + totalLendingInterest) * 100) / 100;

    const totalBorrowed = Math.round(borrowingSummaries.reduce((s, v) => s + v.amount, 0) * 100) / 100;
    const totalBorrowingInterest = Math.round(borrowingSummaries.reduce((s, v) => s + v.interestTillFYEnd, 0) * 100) / 100;
    const totalBorrowingCredit = Math.round((totalBorrowed + totalBorrowingInterest) * 100) / 100;

    const netAmount = Math.round((totalLendingDue - totalBorrowingCredit) * 100) / 100;

    return {
      clientName: client.clientName,
      lendingCount: client.lendings.length,
      borrowingCount: client.borrowings.length,
      totalLent,
      totalLendingInterest,
      totalLendingDue,
      totalBorrowed,
      totalBorrowingInterest,
      totalBorrowingCredit,
      netAmount,
    };
  }).sort((a, b) => a.clientName.localeCompare(b.clientName));
}

/**
 * Calculate the net amount for an org in a given FY.
 * Only considers active, non-carry-forward entries whose date falls in the specified FY.
 * Carry-forward entries are excluded — the cascade is handled separately in useCarryForward.
 * Returns the net: positive = clients owe (lending excess), negative = you owe (borrowing excess).
 */
export function calculateFYNet(loans, borrowings, fyLabel) {
  const { totalLendingDue, totalBorrowingCredit } = calculateFYTotals(loans, borrowings, fyLabel);
  return Math.round((totalLendingDue - totalBorrowingCredit) * 100) / 100;
}

/**
 * Calculate separate lending and borrowing totals for a given FY.
 * Only considers active, non-carry-forward entries whose date falls in the specified FY.
 */
export function calculateFYTotals(loans, borrowings, fyLabel) {
  const fyEnd = fyLabelToEndDate(fyLabel);

  const fyLoans = loans.filter(l => {
    if (l.isCarryForward) return false;
    const fy = getCurrentFYLabel(toJSDate(l.loanDate));
    return fy === fyLabel;
  });

  const fyBorrowings = borrowings.filter(b => {
    if (b.isCarryForward) return false;
    const fy = getCurrentFYLabel(toJSDate(b.borrowDate));
    return fy === fyLabel;
  });

  const totalLendingDue = Math.round(fyLoans.reduce((sum, loan) => {
    const s = getLendingSummary({ ...loan, endDate: loan.endDate || fyEnd });
    return sum + s.totalDue;
  }, 0) * 100) / 100;

  const totalBorrowingCredit = Math.round(fyBorrowings.reduce((sum, b) => {
    const s = getBorrowingSummary({ ...b, endDate: b.endDate || fyEnd });
    return sum + s.totalCredit;
  }, 0) * 100) / 100;

  return { totalLendingDue, totalBorrowingCredit };
}

const CF_RATE = 0.8;

/**
 * Build the per-FY carry-forward plan: for each previous FY, the net amount
 * that should be carried into the next FY, with cascading compound interest.
 * Returns an array of { sourceFY, side: 'lending'|'borrowing', amount }.
 *
 * Pure function. For locked FYs, uses the frozen CF stored on the lock doc
 * (locks[fy].cfSide / locks[fy].cfAmount) instead of recomputing from data.
 * This lets us safely delete a locked FY's data without losing its carry-forward.
 *
 * @param locks  Optional map { [fyLabel]: { isLocked, cfSide, cfAmount, ... } }
 */
export function computeCarryForwardPlan(loans, borrowings, locks = {}) {
  const currentFY = getCurrentFYLabel();

  const fySet = new Set();
  loans.filter(l => !l.isCarryForward).forEach(l => fySet.add(getCurrentFYLabel(toJSDate(l.loanDate))));
  borrowings.filter(b => !b.isCarryForward).forEach(b => fySet.add(getCurrentFYLabel(toJSDate(b.borrowDate))));

  // Locked FYs must contribute to the cascade even if their data has been deleted
  Object.entries(locks).forEach(([fy, lock]) => {
    if (lock?.isLocked && fy < currentFY) fySet.add(fy);
  });

  const sortedFYs = [...fySet].filter(fy => fy < currentFY).sort();
  if (sortedFYs.length === 0) return [];

  const allPreviousFYs = [];
  let fy = sortedFYs[0];
  while (fy < currentFY) {
    allPreviousFYs.push(fy);
    fy = getNextFYLabel(fy);
  }

  const plan = [];
  let pendingNet = 0; // positive = lending excess, negative = borrowing excess

  for (const sourceFY of allPreviousFYs) {
    const nextFY = getNextFYLabel(sourceFY);
    const lock = locks[sourceFY];

    let absAmount;
    let isLending;

    // Recompute from raw data (used both for unlocked FYs and as a fallback
    // for locked FYs whose lock doc is missing the frozen cfAmount/cfSide —
    // typically older locks created before those fields existed).
    const computeFromData = () => {
      const { totalLendingDue, totalBorrowingCredit } = calculateFYTotals(loans, borrowings, sourceFY);
      const net = (totalLendingDue - totalBorrowingCredit) + pendingNet;
      if (Math.abs(net) < 0.01) return { absAmount: 0, isLending: false, isZero: true };
      return {
        absAmount: Math.round(Math.abs(net) * 100) / 100,
        isLending: net > 0,
        isZero: false,
      };
    };

    if (lock?.isLocked) {
      // For locked FYs prefer the frozen state. Defensively handle every
      // malformed shape — but DO NOT silently drop a locked FY when frozen
      // metadata is missing. Falling back to recomputed data preserves the
      // cascade (older locks pre-date the cfAmount/cfSide fields), and a
      // missing-data scenario at least keeps pendingNet intact instead of
      // wiping it (which previously caused downstream CF docs to be deleted).
      const rawAmount = Number(lock.cfAmount);
      const hasValidAmount = lock.cfAmount != null && Number.isFinite(rawAmount);
      const hasValidSide = lock.cfSide === 'lending' || lock.cfSide === 'borrowing';

      if (hasValidAmount && hasValidSide) {
        const rawAbs = Math.abs(rawAmount);
        if (rawAbs < 0.01) {
          // Frozen zero net — no CF needed for this FY.
          pendingNet = 0;
          continue;
        }
        absAmount = Math.round(rawAbs * 100) / 100;
        isLending = lock.cfSide === 'lending';
      } else {
        // Missing or invalid frozen metadata. Fall back to data.
        console.warn(
          `computeCarryForwardPlan: lock for FY ${sourceFY} missing/invalid cfAmount or cfSide; falling back to data`,
          { cfAmount: lock.cfAmount, cfSide: lock.cfSide }
        );
        const fromData = computeFromData();
        if (fromData.isZero) {
          pendingNet = 0;
          continue;
        }
        absAmount = fromData.absAmount;
        isLending = fromData.isLending;
      }
    } else {
      // Compute from raw data
      const fromData = computeFromData();
      if (fromData.isZero) {
        pendingNet = 0;
        continue;
      }
      absAmount = fromData.absAmount;
      isLending = fromData.isLending;
    }

    plan.push({ sourceFY, side: isLending ? 'lending' : 'borrowing', amount: absAmount });

    // Cascade: compound interest through nextFY into the FY after
    const fyEnd = fyLabelToEndDate(nextFY);
    const fyStart = new Date(parseInt(nextFY.split('-')[0], 10), 3, 1);
    const daysInFY = Math.ceil((fyEnd.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24));
    const dailyRate = CF_RATE / 30;
    const interest = absAmount * (dailyRate / 100) * daysInFY;
    const totalWithInterest = Math.round((absAmount + interest) * 100) / 100;
    pendingNet = isLending ? totalWithInterest : -totalWithInterest;
  }

  return plan;
}

/**
 * Get the carry-forward entry that applies to the current FY (in-memory),
 * so summary cards work even when Firestore CF docs are missing (e.g. read-only orgs).
 *
 * Returns { side: 'lending'|'borrowing'|null, amount, interest }
 *   - amount: principal entering current FY
 *   - interest: interest accrued on it through the current FY (to March 31)
 */
export function getCurrentCarryForward(loans, borrowings, locks = {}) {
  const plan = computeCarryForwardPlan(loans, borrowings, locks);
  if (plan.length === 0) return { side: null, amount: 0, interest: 0 };

  const currentFY = getCurrentFYLabel();
  // The plan entry whose sourceFY's nextFY equals the current FY is the one
  // that lands as the CF in the current FY.
  const currentEntry = plan.find(p => getNextFYLabel(p.sourceFY) === currentFY);
  if (!currentEntry) return { side: null, amount: 0, interest: 0 };

  const fyEnd = fyLabelToEndDate(currentFY);
  const fyStart = new Date(parseInt(currentFY.split('-')[0], 10), 3, 1);
  const daysInFY = Math.ceil((fyEnd.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24));
  const dailyRate = CF_RATE / 30;
  const interest = Math.round(currentEntry.amount * (dailyRate / 100) * daysInFY * 100) / 100;

  return { side: currentEntry.side, amount: currentEntry.amount, interest };
}
