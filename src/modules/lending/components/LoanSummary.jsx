import { formatCurrency } from '../../../utils/formatUtils';

export default function LoanSummary({ loans, summaries, carryForward }) {
  const cfAmount = carryForward?.amount || 0;
  const cfInterest = carryForward?.interest || 0;
  const cfCount = carryForward ? 1 : 0;
  const totalPrincipal = summaries.reduce((sum, s) => sum + s.principal, 0) + cfAmount;
  const totalInterestTillFY = summaries.reduce((sum, s) => sum + s.interestTillFYEnd, 0) + cfInterest;
  const totalDue = summaries.reduce((sum, s) => sum + s.totalDue, 0) + cfAmount + cfInterest;
  const activeCount = loans.length + cfCount;

  return (
    <div className="summary-grid">
      <div className="summary-card">
        <div className="label">Entries (Current FY)</div>
        <div className="value text-primary">{activeCount}</div>
      </div>
      <div className="summary-card">
        <div className="label">Total Lent (Current FY)</div>
        <div className="value">{formatCurrency(totalPrincipal)}</div>
      </div>
      <div className="summary-card">
        <div className="label">Interest till End Date (Current FY)</div>
        <div className="value" style={{ color: '#28a745' }}>{formatCurrency(totalInterestTillFY)}</div>
      </div>
      <div className="summary-card">
        <div className="label">Total Due (Current FY)</div>
        <div className="value" style={{ color: '#28a745' }}>{formatCurrency(totalDue)}</div>
      </div>
    </div>
  );
}
