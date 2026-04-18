import { useMemo } from 'react';
import { useCollection } from '../../../hooks/useFirestore';
import { getClientFinalized } from '../utils/lendingCalcs';
import { exportToExcel } from '../../../services/exportService';
import { formatCurrency } from '../../../utils/formatUtils';
import { getCurrentFYLabel } from '../../../utils/dateUtils';
import LendingTabs from '../components/LendingTabs';

export default function FinalizedView() {
  const { data: loans, loading: loadingLoans } = useCollection('loans');
  const { data: borrowings, loading: loadingBorrowings } = useCollection('borrowings');

  const clientSummaries = useMemo(() => {
    if (!loans.length && !borrowings.length) return [];
    return getClientFinalized(
      loans.filter(l => l.status === 'active'),
      borrowings
    );
  }, [loans, borrowings]);

  const grandTotals = useMemo(() => ({
    totalLent: clientSummaries.reduce((s, c) => s + c.totalLent, 0),
    totalLendingInterest: clientSummaries.reduce((s, c) => s + c.totalLendingInterest, 0),
    totalLendingDue: clientSummaries.reduce((s, c) => s + c.totalLendingDue, 0),
    totalBorrowed: clientSummaries.reduce((s, c) => s + c.totalBorrowed, 0),
    totalBorrowingInterest: clientSummaries.reduce((s, c) => s + c.totalBorrowingInterest, 0),
    totalBorrowingCredit: clientSummaries.reduce((s, c) => s + c.totalBorrowingCredit, 0),
    netAmount: clientSummaries.reduce((s, c) => s + c.netAmount, 0),
  }), [clientSummaries]);

  const handleExport = () => {
    const rows = clientSummaries.map(c => ({
      clientName: c.clientName,
      totalLent: c.totalLent,
      lendingInterest: c.totalLendingInterest,
      totalLendingDue: c.totalLendingDue,
      totalBorrowed: c.totalBorrowed,
      borrowingInterest: c.totalBorrowingInterest,
      totalBorrowingCredit: c.totalBorrowingCredit,
      netAmount: c.netAmount,
    }));

    // Add grand total row
    rows.push({
      clientName: 'GRAND TOTAL',
      totalLent: grandTotals.totalLent,
      lendingInterest: grandTotals.totalLendingInterest,
      totalLendingDue: grandTotals.totalLendingDue,
      totalBorrowed: grandTotals.totalBorrowed,
      borrowingInterest: grandTotals.totalBorrowingInterest,
      totalBorrowingCredit: grandTotals.totalBorrowingCredit,
      netAmount: grandTotals.netAmount,
    });

    exportToExcel(rows, [
      { header: 'Client', key: 'clientName', width: 20 },
      { header: 'Total Lent (₹)', key: 'totalLent', width: 15 },
      { header: 'Lending Interest (₹)', key: 'lendingInterest', width: 18 },
      { header: 'Total Lending Due (₹)', key: 'totalLendingDue', width: 18 },
      { header: 'Total Borrowed (₹)', key: 'totalBorrowed', width: 16 },
      { header: 'Borrowing Interest (₹)', key: 'borrowingInterest', width: 18 },
      { header: 'Total Credit (₹)', key: 'totalBorrowingCredit', width: 16 },
      { header: 'Net Amount (₹)', key: 'netAmount', width: 15 },
    ], `Finalized FY ${getCurrentFYLabel()}`, 'Settlement');
  };

  if (loadingLoans || loadingBorrowings) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>;
  }

  return (
    <div>
      <LendingTabs />

      <div className="page-header">
        <h1>Finalized View — FY {getCurrentFYLabel()}</h1>
        <div className="page-actions">
          {clientSummaries.length > 0 && (
            <button className="btn btn-export" onClick={handleExport}>📥 Export Excel</button>
          )}
        </div>
      </div>

      {/* Grand totals */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Total Lent + Interest</div>
          <div className="value text-danger">{formatCurrency(grandTotals.totalLendingDue)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Total Borrowed + Interest</div>
          <div className="value text-success">{formatCurrency(grandTotals.totalBorrowingCredit)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Net Receivable</div>
          <div className={`value ${grandTotals.netAmount >= 0 ? 'text-danger' : 'text-success'}`}>
            {formatCurrency(Math.abs(grandTotals.netAmount))}
            {grandTotals.netAmount < 0 ? ' (you owe)' : ' (owed to you)'}
          </div>
        </div>
      </div>

      {clientSummaries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <p>No data yet. Add lendings and borrowings to see the finalized view.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th className="text-right">Lent</th>
                <th className="text-right">Lending Int.</th>
                <th className="text-right">Lending Due</th>
                <th className="text-right">Borrowed</th>
                <th className="text-right">Borrowing Int.</th>
                <th className="text-right">Credit</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {clientSummaries.map(c => (
                <tr key={c.clientName}>
                  <td style={{ fontWeight: 500 }}>{c.clientName}</td>
                  <td className="text-right">{formatCurrency(c.totalLent)}</td>
                  <td className="text-right">{formatCurrency(c.totalLendingInterest)}</td>
                  <td className="text-right">{formatCurrency(c.totalLendingDue)}</td>
                  <td className="text-right">{formatCurrency(c.totalBorrowed)}</td>
                  <td className="text-right">{formatCurrency(c.totalBorrowingInterest)}</td>
                  <td className="text-right">{formatCurrency(c.totalBorrowingCredit)}</td>
                  <td className={`text-right ${c.netAmount >= 0 ? 'text-danger' : 'text-success'}`} style={{ fontWeight: 600 }}>
                    {c.netAmount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(c.netAmount))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #333' }}>
                <td>TOTAL</td>
                <td className="text-right">{formatCurrency(grandTotals.totalLent)}</td>
                <td className="text-right">{formatCurrency(grandTotals.totalLendingInterest)}</td>
                <td className="text-right">{formatCurrency(grandTotals.totalLendingDue)}</td>
                <td className="text-right">{formatCurrency(grandTotals.totalBorrowed)}</td>
                <td className="text-right">{formatCurrency(grandTotals.totalBorrowingInterest)}</td>
                <td className="text-right">{formatCurrency(grandTotals.totalBorrowingCredit)}</td>
                <td className={`text-right ${grandTotals.netAmount >= 0 ? 'text-danger' : 'text-success'}`}>
                  {grandTotals.netAmount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(grandTotals.netAmount))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
