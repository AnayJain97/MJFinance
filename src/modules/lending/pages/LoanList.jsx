import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '../../../hooks/useFirestore';
import { useCarryForward } from '../../../hooks/useCarryForward';
import { useLocks } from '../../../hooks/useLocks';
import { getLendingSummary, getCurrentCarryForward } from '../utils/lendingCalcs';
import LoanSummary from '../components/LoanSummary';
import LendingTabs from '../components/LendingTabs';
import FYAccordion from '../components/FYAccordion';
import { exportToExcel } from '../../../services/exportService';
import { formatCurrency, formatPercent } from '../../../utils/formatUtils';
import { formatDate, getCurrentFYLabel, toJSDate } from '../../../utils/dateUtils';
import Tooltip from '../../../components/Tooltip';
import Toast from '../../../components/Toast';
import RapidEntry from '../components/RapidEntry';
import ErrorBanner from '../../../components/ErrorBanner';
import { useOrg, getOrgCollection } from '../../../context/OrgContext';

export default function LoanList() {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [toast, setToast] = useState(null);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const { selectedOrg, canWrite } = useOrg();

  const { data: allLoans, loading, error: loansError } = useCollection(getOrgCollection(selectedOrg, 'loans'));
  const { data: allBorrowings, loading: loadingBorrowings, error: borrowingsError } = useCollection(getOrgCollection(selectedOrg, 'borrowings'));
  const { isLocked, locks } = useLocks(selectedOrg);

  // Auto-create/update carry-forward entries (only when both collections are loaded)
  useCarryForward(selectedOrg, allLoans, allBorrowings, canWrite && !loading && !loadingBorrowings, locks);

  const filteredLoans = useMemo(() => {
    let loans = allLoans;
    if (search.trim()) {
      const s = search.toLowerCase();
      loans = loans.filter(l => l.clientName.toLowerCase().includes(s));
    }
    return loans;
  }, [allLoans, search]);

  const summaries = useMemo(() => {
    return filteredLoans.map(getLendingSummary);
  }, [filteredLoans]);

  const sortedData = useMemo(() => {
    const combined = filteredLoans.map((loan, idx) => ({ loan, summary: summaries[idx] }));
    if (!sortCol) return combined;
    combined.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'date': va = new Date(a.loan.loanDate?.toDate?.() || a.loan.loanDate); vb = new Date(b.loan.loanDate?.toDate?.() || b.loan.loanDate); break;
        case 'principal': va = a.loan.principalAmount; vb = b.loan.principalAmount; break;
        case 'client': va = a.loan.clientName.toLowerCase(); vb = b.loan.clientName.toLowerCase(); break;
        case 'interest': va = a.summary.interestTillFYEnd; vb = b.summary.interestTillFYEnd; break;
        case 'total': va = a.summary.totalDue; vb = b.summary.totalDue; break;
        case 'rate': va = a.loan.monthlyInterestRate; vb = b.loan.monthlyInterestRate; break;
        default: return 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return combined;
  }, [filteredLoans, summaries, sortCol, sortDir]);

  // Group sorted data by FY for accordion display.
  // Always include locked FYs even if data was deleted post-lock so the section stays visible.
  const fyGroupedData = useMemo(() => {
    const grouped = {};
    sortedData.forEach(item => {
      const fy = getCurrentFYLabel(toJSDate(item.loan.loanDate));
      if (!grouped[fy]) grouped[fy] = [];
      grouped[fy].push(item);
    });
    Object.entries(locks).forEach(([fy, lock]) => {
      if (lock?.isLocked && !grouped[fy]) grouped[fy] = [];
    });
    const sorted = {};
    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(k => { sorted[k] = grouped[k]; });
    return sorted;
  }, [sortedData, locks]);

  // Summary for current FY. Excludes Firestore CF entries to avoid double-count;
  // an in-memory carry-forward is folded in below for read-only orgs.
  const currentFYData = useMemo(() => {
    const currentFY = getCurrentFYLabel();
    return sortedData.filter(item =>
      !item.loan.isCarryForward &&
      getCurrentFYLabel(toJSDate(item.loan.loanDate)) === currentFY
    );
  }, [sortedData]);

  const currentFYLoans = useMemo(() => currentFYData.map(d => d.loan), [currentFYData]);
  const currentFYSummaries = useMemo(() => currentFYData.map(d => d.summary), [currentFYData]);

  const currentFYCarryForward = useMemo(() => {
    const cf = getCurrentCarryForward(allLoans, allBorrowings, locks);
    return cf.side === 'lending' && cf.amount > 0 ? cf : null;
  }, [allLoans, allBorrowings, locks]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const SortTh = ({ col, children, className }) => (
    <th className={`sortable ${className || ''}`} onClick={() => handleSort(col)}>
      {children}
      {sortCol === col && <span className="sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
    </th>
  );

  const handleExport = (fyLabel, items) => {
    const rows = items.map(({ loan, summary: s }) => ({
      loanDate: formatDate(loan.loanDate),
      principal: loan.principalAmount,
      clientName: loan.clientName,
      interestTillFY: s.interestTillFYEnd,
      totalDue: s.totalDue,
      rate: loan.monthlyInterestRate,
    }));

    const cols = [
      { header: 'Date', key: 'loanDate', width: 12 },
      { header: 'Principal', key: 'principal', width: 15 },
      { header: 'Client', key: 'clientName', width: 20 },
      { header: 'Int. till End Date', key: 'interestTillFY', width: 20 },
      { header: 'Total Due', key: 'totalDue', width: 15 },
      { header: 'Rate/Mo', key: 'rate', width: 10, noTotal: true },
    ];

    try {
      exportToExcel(rows, cols, `Loans FY ${fyLabel}`, `${selectedOrg}_Loans_${fyLabel}`);
    } catch (err) {
      console.error('Loan export failed:', err);
      setToast({ message: `Export failed: ${err?.message || 'unknown error'}`, type: 'error' });
    }
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading loans...</p></div>;
  }

  return (
    <div>
      <LendingTabs />

      <ErrorBanner
        message={loansError ? `Failed to load lending data: ${loansError.message || 'permission denied or network error'}` : (borrowingsError ? `Failed to load borrowing data: ${borrowingsError.message || 'permission denied or network error'}` : null)}
        onRetry={() => window.location.reload()}
      />

      <div className="page-header">
        <h1>Money Lent Out — FY {getCurrentFYLabel()}</h1>
        <div className="page-actions">
          {canWrite && (
            <button className="btn btn-primary" onClick={() => setQuickEntryOpen(prev => !prev)}>
              {quickEntryOpen ? '✕ Close' : '+ New Loan'}
            </button>
          )}
        </div>
      </div>

      <LoanSummary loans={currentFYLoans} summaries={currentFYSummaries} carryForward={currentFYCarryForward} />

      <RapidEntry type="lending" allLoans={allLoans} open={quickEntryOpen} onToggle={() => setQuickEntryOpen(prev => !prev)} />

      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by client name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {sortedData.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <p>No loans found.</p>
        </div>
      ) : (
        <FYAccordion
          groupedData={fyGroupedData}
          emptyMessage="No loans found."
          isFYLocked={isLocked}
          renderHeaderActions={(fy, items) => (
            // Hide Export entirely for locked + emptied FYs (post Delete-All) —
            // there's nothing to export and the section just shows the archived placeholder.
            isLocked(fy) && items.length === 0 ? null : (
              <button
                className="btn btn-sm btn-export"
                onClick={() => handleExport(fy, items)}
                disabled={items.length === 0}
                title={items.length === 0 ? 'No data to export' : `Export FY ${fy}`}
              >
                📥 Export
              </button>
            )
          )}
          renderSection={(fy, items) => (
            items.length === 0 ? (
              <div className="locked-empty-row">
                Transactions for FY {fy} have been finalized, locked, and archived. No entries to display.
              </div>
            ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortTh col="date">Date</SortTh>
                    <SortTh col="principal" className="text-right">Principal</SortTh>
                    <SortTh col="client">Client</SortTh>
                    <SortTh col="interest" className="text-right">
                      Int. till End Date
                    </SortTh>
                    <SortTh col="total" className="text-right">Total Due</SortTh>
                    <SortTh col="rate" className="text-right">Rate/Mo</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ loan, summary: s }) => (
                    <tr key={loan.id} className={loan.isCarryForward ? 'carry-forward-row' : ''}>
                      <td>{formatDate(loan.loanDate)}</td>
                      <td className="text-right">{formatCurrency(loan.principalAmount)}</td>
                      <td>
                        <Link to={`/money-lending/lending/${loan.id}`} style={{ color: '#4361ee', fontWeight: 500 }}>
                          {loan.clientName}
                        </Link>
                        {loan.isCarryForward && <span className="carry-forward-badge">↪ Carry Forward</span>}
                      </td>
                      <td className="text-right" style={{ color: '#28a745' }}>
                        {formatCurrency(s.interestTillFYEnd)}
                        <Tooltip text={s.formulaText} />
                      </td>
                      <td className="text-right" style={{ color: '#28a745', fontWeight: 600 }}>
                        {formatCurrency(s.totalDue)}
                      </td>
                      <td className="text-right">{formatPercent(loan.monthlyInterestRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )
          )}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
