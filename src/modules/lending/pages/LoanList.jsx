import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '../../../hooks/useFirestore';
import { getLendingSummary } from '../utils/lendingCalcs';
import LoanTable from '../components/LoanTable';
import LoanSummary from '../components/LoanSummary';
import LendingTabs from '../components/LendingTabs';
import { exportToExcel } from '../../../services/exportService';
import { formatCurrency } from '../../../utils/formatUtils';
import { formatDate, getCurrentFYLabel } from '../../../utils/dateUtils';

export default function LoanList() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');

  const { data: allLoans, loading } = useCollection('loans');

  const filteredLoans = useMemo(() => {
    let loans = allLoans;
    if (filter !== 'all') {
      loans = loans.filter(l => l.status === filter);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      loans = loans.filter(l => l.clientName.toLowerCase().includes(s));
    }
    return loans;
  }, [allLoans, filter, search]);

  const summaries = useMemo(() => {
    return filteredLoans.map(getLendingSummary);
  }, [filteredLoans]);

  const handleExport = () => {
    const rows = filteredLoans.map((loan, idx) => {
      const s = summaries[idx];
      return {
        loanDate: formatDate(loan.loanDate),
        principal: loan.principalAmount,
        clientName: loan.clientName,
        interestTillFY: s.interestTillFYEnd,
        totalDue: s.totalDue,
      };
    });

    exportToExcel(rows, [
      { header: 'Date', key: 'loanDate', width: 12 },
      { header: 'Amount (₹)', key: 'principal', width: 15 },
      { header: 'Name', key: 'clientName', width: 20 },
      { header: 'Interest till FY End (₹)', key: 'interestTillFY', width: 22 },
      { header: 'Total Due (₹)', key: 'totalDue', width: 15 },
    ], `Loans FY ${getCurrentFYLabel()}`, 'Loans');
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading loans...</p></div>;
  }

  return (
    <div>
      <LendingTabs />

      <div className="page-header">
        <h1>Lendings (Money Given Out)</h1>
        <div className="page-actions">
          <Link to="/lending/new" className="btn btn-primary">+ New Loan</Link>
          {filteredLoans.length > 0 && (
            <button className="btn btn-export" onClick={handleExport}>📥 Export Excel</button>
          )}
        </div>
      </div>

      <LoanSummary loans={filteredLoans} summaries={summaries} />

      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by client name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="filter-tabs">
          {['active', 'closed', 'all'].map(f => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <LoanTable loans={filteredLoans} summaries={summaries} filter={filter} />
    </div>
  );
}
