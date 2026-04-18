import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '../../../hooks/useFirestore';
import { getBorrowingSummary } from '../utils/lendingCalcs';
import { exportToExcel } from '../../../services/exportService';
import { formatCurrency, formatPercent } from '../../../utils/formatUtils';
import { formatDate, getCurrentFYLabel } from '../../../utils/dateUtils';
import LendingTabs from '../components/LendingTabs';
import Tooltip from '../../../components/Tooltip';

export default function BorrowingList() {
  const [search, setSearch] = useState('');
  const { data: allBorrowings, loading } = useCollection('borrowings');

  const filtered = useMemo(() => {
    if (!search.trim()) return allBorrowings;
    const s = search.toLowerCase();
    return allBorrowings.filter(b => b.clientName.toLowerCase().includes(s));
  }, [allBorrowings, search]);

  const summaries = useMemo(() => {
    return filtered.map(getBorrowingSummary);
  }, [filtered]);

  const totals = useMemo(() => ({
    count: filtered.length,
    totalBorrowed: filtered.reduce((s, b) => s + b.amount, 0),
    totalInterest: summaries.reduce((s, v) => s + v.interestTillFYEnd, 0),
    totalCredit: summaries.reduce((s, v) => s + v.totalCredit, 0),
  }), [filtered, summaries]);

  const handleExport = () => {
    const rows = filtered.map((b, idx) => {
      const s = summaries[idx];
      return {
        date: formatDate(b.borrowDate),
        amount: b.amount,
        clientName: b.clientName,
        interestTillFY: s.interestTillFYEnd,
        totalCredit: s.totalCredit,
      };
    });

    exportToExcel(rows, [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Amount (₹)', key: 'amount', width: 15 },
      { header: 'Name', key: 'clientName', width: 20 },
      { header: 'Interest till FY End (₹)', key: 'interestTillFY', width: 22 },
      { header: 'Total Credit (₹)', key: 'totalCredit', width: 15 },
    ], `Borrowings FY ${getCurrentFYLabel()}`, 'Borrowings');
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>;
  }

  return (
    <div>
      <LendingTabs />

      <div className="page-header">
        <h1>Borrowings (Money Received Back)</h1>
        <div className="page-actions">
          <Link to="/lending/borrowings/new" className="btn btn-primary">+ New Borrowing</Link>
          {filtered.length > 0 && (
            <button className="btn btn-export" onClick={handleExport}>📥 Export Excel</button>
          )}
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Total Entries</div>
          <div className="value text-primary">{totals.count}</div>
        </div>
        <div className="summary-card">
          <div className="label">Total Received</div>
          <div className="value">{formatCurrency(totals.totalBorrowed)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Interest till FY End</div>
          <div className="value text-success">{formatCurrency(totals.totalInterest)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Total Credit (Amount + Interest)</div>
          <div className="value text-primary">{formatCurrency(totals.totalCredit)}</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by client name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔄</div>
          <p>No borrowings found. Record money received back from clients here.</p>
          <Link to="/lending/borrowings/new" className="btn btn-primary">Add Borrowing</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th>Client</th>
                <th className="text-right">
                  Int. till FY End
                  <Tooltip text="Interest on amount received, from date to FY end" />
                </th>
                <th className="text-right">Total Credit</th>
                <th className="text-right">Rate/Mo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, idx) => {
                const s = summaries[idx];
                return (
                  <tr key={b.id}>
                    <td>{formatDate(b.borrowDate)}</td>
                    <td className="text-right">{formatCurrency(b.amount)}</td>
                    <td>{b.clientName}</td>
                    <td className="text-right">
                      {formatCurrency(s.interestTillFYEnd)}
                      <Tooltip text={s.formulaText} />
                    </td>
                    <td className="text-right">{formatCurrency(s.totalCredit)}</td>
                    <td className="text-right">{formatPercent(b.monthlyInterestRate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
