import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCollection, deleteDocument } from '../../../hooks/useFirestore';
import { useLocks } from '../../../hooks/useLocks';
import { lockFY, unlockFY } from '../../../services/lockService';
import { getClientFinalized } from '../utils/lendingCalcs';
import { exportToExcel } from '../../../services/exportService';
import { formatCurrency } from '../../../utils/formatUtils';
import { getCurrentFYLabel, toJSDate } from '../../../utils/dateUtils';
import LendingTabs from '../components/LendingTabs';
import FYAccordion from '../components/FYAccordion';
import PasswordReauthDialog from '../../../components/PasswordReauthDialog';
import Toast from '../../../components/Toast';
import { useOrg, getOrgCollection } from '../../../context/OrgContext';

export default function FinalizedView() {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('client');
  const [sortDir, setSortDir] = useState('asc');
  const [toast, setToast] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { kind: 'lock'|'unlock'|'deleteAll', fy }
  const { selectedOrg, canWrite } = useOrg();

  const { data: loans, loading: loadingLoans } = useCollection(getOrgCollection(selectedOrg, 'loans'));
  const { data: borrowings, loading: loadingBorrowings } = useCollection(getOrgCollection(selectedOrg, 'borrowings'));
  const { isLocked, canLockFY } = useLocks(selectedOrg);

  // Group active loans & borrowings by FY, compute per-FY finalized summaries
  const fyGroupedFinalized = useMemo(() => {
    const activeLoans = loans;
    const activeBorrowings = borrowings;

    // Collect all FYs from both loans and borrowings
    const fySet = new Set();
    activeLoans.forEach(l => fySet.add(getCurrentFYLabel(toJSDate(l.loanDate))));
    activeBorrowings.forEach(b => fySet.add(getCurrentFYLabel(toJSDate(b.borrowDate))));

    const fyLabels = [...fySet].sort((a, b) => b.localeCompare(a));

    const grouped = {};
    fyLabels.forEach(fy => {
      const fyLoans = activeLoans.filter(l => getCurrentFYLabel(toJSDate(l.loanDate)) === fy);
      const fyBorrowings = activeBorrowings.filter(b => getCurrentFYLabel(toJSDate(b.borrowDate)) === fy);
      const summaries = getClientFinalized(fyLoans, fyBorrowings);
      if (summaries.length > 0) grouped[fy] = summaries;
    });

    return grouped;
  }, [loans, borrowings]);

  // All FYs that have data — used for canLockFY ordering check
  const allFYsWithData = useMemo(() => Object.keys(fyGroupedFinalized).sort(), [fyGroupedFinalized]);

  // Current FY summaries for the summary cards
  const currentFYSummaries = useMemo(() => {
    const currentFY = getCurrentFYLabel();
    return fyGroupedFinalized[currentFY] || [];
  }, [fyGroupedFinalized]);

  // Apply search filter per FY group
  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return fyGroupedFinalized;
    const s = search.toLowerCase();
    const result = {};
    Object.entries(fyGroupedFinalized).forEach(([fy, summaries]) => {
      const filtered = summaries.filter(c => c.clientName.toLowerCase().includes(s));
      if (filtered.length > 0) result[fy] = filtered;
    });
    return result;
  }, [fyGroupedFinalized, search]);

  // Sort within each FY group
  const sortedGrouped = useMemo(() => {
    const result = {};
    Object.entries(filteredGrouped).forEach(([fy, items]) => {
      const sorted = [...items];
      if (sortCol) {
        sorted.sort((a, b) => {
          let va, vb;
          switch (sortCol) {
            case 'client': va = a.clientName.toLowerCase(); vb = b.clientName.toLowerCase(); break;
            case 'lent': va = a.totalLent; vb = b.totalLent; break;
            case 'lendInt': va = a.totalLendingInterest; vb = b.totalLendingInterest; break;
            case 'lendDue': va = a.totalLendingDue; vb = b.totalLendingDue; break;
            case 'borrowed': va = a.totalBorrowed; vb = b.totalBorrowed; break;
            case 'borInt': va = a.totalBorrowingInterest; vb = b.totalBorrowingInterest; break;
            case 'credit': va = a.totalBorrowingCredit; vb = b.totalBorrowingCredit; break;
            case 'net': va = a.netAmount; vb = b.netAmount; break;
            default: return 0;
          }
          if (va < vb) return sortDir === 'asc' ? -1 : 1;
          if (va > vb) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      result[fy] = sorted;
    });
    return result;
  }, [filteredGrouped, sortCol, sortDir]);

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

  // Grand totals from current FY for summary cards
  const grandTotals = useMemo(() => {
    const src = currentFYSummaries;
    return {
      totalLendingDue: src.reduce((s, c) => s + c.totalLendingDue, 0),
      totalBorrowingCredit: src.reduce((s, c) => s + c.totalBorrowingCredit, 0),
      netAmount: src.reduce((s, c) => s + c.netAmount, 0),
    };
  }, [currentFYSummaries]);

  const handleExport = (fy, items) => {
    const rows = items.map(c => ({
      clientName: c.clientName,
      totalLent: c.totalLent,
      lendingInterest: c.totalLendingInterest,
      totalLendingDue: c.totalLendingDue,
      totalBorrowed: c.totalBorrowed,
      borrowingInterest: c.totalBorrowingInterest,
      totalBorrowingCredit: c.totalBorrowingCredit,
      netAmount: c.netAmount,
    }));

    exportToExcel(rows, [
      { header: 'Client', key: 'clientName', width: 20 },
      { header: 'Lent', key: 'totalLent', width: 15 },
      { header: 'Lending Int.', key: 'lendingInterest', width: 15 },
      { header: 'Lending Due', key: 'totalLendingDue', width: 15 },
      { header: 'Borrowed', key: 'totalBorrowed', width: 15 },
      { header: 'Borrowing Int.', key: 'borrowingInterest', width: 15 },
      { header: 'Credit', key: 'totalBorrowingCredit', width: 15 },
      { header: 'Net', key: 'netAmount', width: 15 },
    ], `Finalized FY ${fy}`, `${selectedOrg}_Finalized_${fy}`);
  };

  // Lock/unlock/delete-all handlers (executed after password reauth)
  const runLock = (fy) => async () => {
    await lockFY(selectedOrg, fy);
    setToast({ message: `FY ${fy} locked`, type: 'success' });
    setPendingAction(null);
  };
  const runUnlock = (fy) => async () => {
    await unlockFY(selectedOrg, fy);
    setToast({ message: `FY ${fy} unlocked`, type: 'success' });
    setPendingAction(null);
  };
  const runDeleteAll = (fy) => async () => {
    const fyLoans = loans.filter(l => getCurrentFYLabel(toJSDate(l.loanDate)) === fy);
    const fyBorrowings = borrowings.filter(b => getCurrentFYLabel(toJSDate(b.borrowDate)) === fy);
    for (const l of fyLoans) {
      await deleteDocument(`${getOrgCollection(selectedOrg, 'loans')}/${l.id}`);
    }
    for (const b of fyBorrowings) {
      await deleteDocument(`${getOrgCollection(selectedOrg, 'borrowings')}/${b.id}`);
    }
    await unlockFY(selectedOrg, fy);
    setToast({ message: `FY ${fy} data deleted`, type: 'success' });
    setPendingAction(null);
  };

  if (loadingLoans || loadingBorrowings) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>;
  }

  const computeFYTotals = (items) => ({
    totalLent: items.reduce((s, c) => s + c.totalLent, 0),
    totalLendingInterest: items.reduce((s, c) => s + c.totalLendingInterest, 0),
    totalLendingDue: items.reduce((s, c) => s + c.totalLendingDue, 0),
    totalBorrowed: items.reduce((s, c) => s + c.totalBorrowed, 0),
    totalBorrowingInterest: items.reduce((s, c) => s + c.totalBorrowingInterest, 0),
    totalBorrowingCredit: items.reduce((s, c) => s + c.totalBorrowingCredit, 0),
    netAmount: items.reduce((s, c) => s + c.netAmount, 0),
  });

  return (
    <div>
      <LendingTabs />

      <div className="page-header">
        <h1>Finalized View — FY {getCurrentFYLabel()}</h1>
      </div>

      {/* Grand totals — current FY */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Total Lent + Interest</div>
          <div className="value" style={{ color: '#28a745' }}>{formatCurrency(grandTotals.totalLendingDue)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Total Borrowed + Interest</div>
          <div className="value" style={{ color: '#dc3545' }}>{formatCurrency(grandTotals.totalBorrowingCredit)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Net Receivable</div>
          <div className="value" style={{ color: grandTotals.netAmount >= 0 ? '#28a745' : '#dc3545' }}>
            {formatCurrency(Math.abs(grandTotals.netAmount))}
          </div>
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

      <FYAccordion
        groupedData={sortedGrouped}
        emptyMessage="No data yet. Add lendings and borrowings to see the finalized view."
        isFYLocked={isLocked}
        renderHeaderActions={(fy, items) => {
          const locked = isLocked(fy);
          const eligibleToLock = !locked && canLockFY(fy, allFYsWithData);
          return (
            <>
              <button
                className="btn btn-sm btn-export"
                onClick={() => handleExport(fy, items)}
                title={`Export FY ${fy}`}
              >
                📥 Export
              </button>
              {canWrite && !locked && (
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setPendingAction({ kind: 'lock', fy, blocked: !eligibleToLock })}
                  title={eligibleToLock ? 'Lock this FY (requires password)' : 'Previous FYs must be locked first'}
                >
                  🔒 Lock
                </button>
              )}
              {canWrite && locked && (
                <>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => setPendingAction({ kind: 'unlock', fy })}
                    title="Unlock this FY (requires password)"
                  >
                    🔓 Unlock
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => setPendingAction({ kind: 'deleteAll', fy })}
                    title="Delete all data for this FY (requires password)"
                  >
                    🗑️ Delete All
                  </button>
                </>
              )}
            </>
          );
        }}
        renderSection={(fy, items) => {
          const totals = computeFYTotals(items);
          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortTh col="client">Client</SortTh>
                    <SortTh col="lent" className="text-right">Lent</SortTh>
                    <SortTh col="lendInt" className="text-right">Lending Int.</SortTh>
                    <SortTh col="lendDue" className="text-right">Lending Due</SortTh>
                    <SortTh col="borrowed" className="text-right">Borrowed</SortTh>
                    <SortTh col="borInt" className="text-right">Borrowing Int.</SortTh>
                    <SortTh col="credit" className="text-right">Credit</SortTh>
                    <SortTh col="net" className="text-right">Net</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {items.map(c => (
                    <tr key={c.clientName}>
                      <td style={{ fontWeight: 500 }}>
                        <Link to={`/money-lending/client/${encodeURIComponent(c.clientName)}`} style={{ color: '#4361ee', fontWeight: 500 }}>
                          {c.clientName}
                        </Link>
                      </td>
                      <td className="text-right">{formatCurrency(c.totalLent)}</td>
                      <td className="text-right">{formatCurrency(c.totalLendingInterest)}</td>
                      <td className="text-right">{formatCurrency(c.totalLendingDue)}</td>
                      <td className="text-right">{formatCurrency(c.totalBorrowed)}</td>
                      <td className="text-right">{formatCurrency(c.totalBorrowingInterest)}</td>
                      <td className="text-right">{formatCurrency(c.totalBorrowingCredit)}</td>
                      <td className="text-right" style={{ fontWeight: 600, color: c.netAmount >= 0 ? '#28a745' : '#dc3545' }}>
                        {c.netAmount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(c.netAmount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid #333' }}>
                    <td>TOTAL</td>
                    <td className="text-right" style={{ color: '#28a745' }}>{formatCurrency(totals.totalLent)}</td>
                    <td className="text-right" style={{ color: '#28a745' }}>{formatCurrency(totals.totalLendingInterest)}</td>
                    <td className="text-right" style={{ color: '#28a745' }}>{formatCurrency(totals.totalLendingDue)}</td>
                    <td className="text-right" style={{ color: '#dc3545' }}>{formatCurrency(totals.totalBorrowed)}</td>
                    <td className="text-right" style={{ color: '#dc3545' }}>{formatCurrency(totals.totalBorrowingInterest)}</td>
                    <td className="text-right" style={{ color: '#dc3545' }}>{formatCurrency(totals.totalBorrowingCredit)}</td>
                    <td className="text-right" style={{ color: totals.netAmount >= 0 ? '#28a745' : '#dc3545' }}>
                      {totals.netAmount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(totals.netAmount))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        }}
      />

      <PasswordReauthDialog
        open={Boolean(pendingAction) && !pendingAction?.blocked}
        title={
          pendingAction?.kind === 'lock' ? `Lock FY ${pendingAction.fy}` :
          pendingAction?.kind === 'unlock' ? `Unlock FY ${pendingAction.fy}` :
          pendingAction?.kind === 'deleteAll' ? `Delete ALL data for FY ${pendingAction.fy}?` : ''
        }
        description={
          pendingAction?.kind === 'lock' ? `Locking FY ${pendingAction.fy} will block new entries dated in this FY (or any earlier FY) and freeze its carry-forward. You can unlock later with your password.` :
          pendingAction?.kind === 'unlock' ? `Re-authentication is required to unlock FY ${pendingAction.fy}.` :
          pendingAction?.kind === 'deleteAll' ? `This permanently deletes every lending and borrowing entry dated in FY ${pendingAction.fy}. This cannot be undone.` : ''
        }
        confirmLabel={
          pendingAction?.kind === 'lock' ? 'Lock' :
          pendingAction?.kind === 'unlock' ? 'Unlock' :
          pendingAction?.kind === 'deleteAll' ? 'Delete All' : 'Confirm'
        }
        confirmVariant={pendingAction?.kind === 'deleteAll' ? 'danger' : 'primary'}
        onCancel={() => setPendingAction(null)}
        onConfirm={
          pendingAction?.kind === 'lock' ? runLock(pendingAction.fy) :
          pendingAction?.kind === 'unlock' ? runUnlock(pendingAction.fy) :
          pendingAction?.kind === 'deleteAll' ? runDeleteAll(pendingAction.fy) :
          (async () => {})
        }
      />

      {pendingAction?.blocked && (
        <div className="modal-overlay" onClick={() => setPendingAction(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '0.5rem' }}>Cannot lock FY {pendingAction.fy}</h3>
            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
              All previous financial years with data must be locked before this one. Lock the earlier FYs first, then return here.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setPendingAction(null)}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
