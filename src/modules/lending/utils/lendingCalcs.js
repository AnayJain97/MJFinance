import { getFYEndDate, toJSDate } from '../../../utils/dateUtils';

/**
 * Calculate monthly interest on a principal amount.
 */
export function calcMonthlyInterest(principal, monthlyRatePercent) {
  return principal * (monthlyRatePercent / 100);
}

/**
 * Get number of days from a date to FY end (March 31).
 */
export function getDaysTillFYEnd(fromDate = new Date()) {
  const now = new Date(fromDate);
  const fyEnd = getFYEndDate(now);
  if (now >= fyEnd) return 0;
  const diffMs = fyEnd.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate interest from a date till FY end.
 * Formula: days × (principal × monthlyRate / 100 / 30)
 */
export function calcInterestTillFYEnd(principal, monthlyRatePercent, fromDate = new Date()) {
  const days = getDaysTillFYEnd(fromDate);
  if (days === 0) return 0;
  const dailyRate = monthlyRatePercent / 30;
  const dailyInterest = principal * (dailyRate / 100);
  return dailyInterest * days;
}

/**
 * Build the formula description string for tooltip display.
 */
export function getInterestFormula(principal, monthlyRatePercent, fromDate = new Date()) {
  const now = new Date(fromDate);
  const fyEnd = getFYEndDate(now);
  if (now >= fyEnd) return 'FY ended — no interest due';

  const days = getDaysTillFYEnd(now);
  const dailyRate = monthlyRatePercent / 30;
  const dailyInterest = principal * (dailyRate / 100);
  const total = dailyInterest * days;

  return `Monthly rate: ${monthlyRatePercent}%\n`
    + `Daily rate: ${monthlyRatePercent}% / 30 = ${dailyRate.toFixed(4)}%\n`
    + `Daily interest: ₹${principal.toLocaleString('en-IN')} × ${dailyRate.toFixed(4)}% = ₹${dailyInterest.toFixed(2)}\n`
    + `Days till FY end (31 Mar): ${days}\n`
    + `Interest = ${days} × ₹${dailyInterest.toFixed(2)} = ₹${total.toFixed(0)}`;
}

/**
 * Build a summary for a lending entry.
 * Interest is always on full principal from loan date to FY end.
 */
export function getLendingSummary(loan) {
  const principal = loan.principalAmount;
  const loanDate = toJSDate(loan.loanDate);
  const monthlyInterest = calcMonthlyInterest(principal, loan.monthlyInterestRate);
  const daysTillFYEnd = getDaysTillFYEnd(loanDate);
  const interestTillFYEnd = calcInterestTillFYEnd(principal, loan.monthlyInterestRate, loanDate);
  const totalDue = principal + interestTillFYEnd;
  const formulaText = getInterestFormula(principal, loan.monthlyInterestRate, loanDate);

  return { principal, monthlyInterest, daysTillFYEnd, interestTillFYEnd, totalDue, formulaText };
}

/**
 * Build a summary for a borrowing entry.
 * Interest is on the amount from borrowing date to FY end.
 */
export function getBorrowingSummary(borrowing) {
  const amount = borrowing.amount;
  const borrowDate = toJSDate(borrowing.borrowDate);
  const monthlyInterest = calcMonthlyInterest(amount, borrowing.monthlyInterestRate);
  const daysTillFYEnd = getDaysTillFYEnd(borrowDate);
  const interestTillFYEnd = calcInterestTillFYEnd(amount, borrowing.monthlyInterestRate, borrowDate);
  const totalCredit = amount + interestTillFYEnd;
  const formulaText = getInterestFormula(amount, borrowing.monthlyInterestRate, borrowDate);

  return { amount, monthlyInterest, daysTillFYEnd, interestTillFYEnd, totalCredit, formulaText };
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

    const totalLent = lendingSummaries.reduce((s, v) => s + v.principal, 0);
    const totalLendingInterest = lendingSummaries.reduce((s, v) => s + v.interestTillFYEnd, 0);
    const totalLendingDue = totalLent + totalLendingInterest;

    const totalBorrowed = borrowingSummaries.reduce((s, v) => s + v.amount, 0);
    const totalBorrowingInterest = borrowingSummaries.reduce((s, v) => s + v.interestTillFYEnd, 0);
    const totalBorrowingCredit = totalBorrowed + totalBorrowingInterest;

    const netAmount = totalLendingDue - totalBorrowingCredit;

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
