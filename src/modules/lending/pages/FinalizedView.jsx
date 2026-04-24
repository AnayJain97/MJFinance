import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useCollection, deleteDocument } from '../../../hooks/useFirestore';
import { useLocks } from '../../../hooks/useLocks';
import { lockFY, unlockFY } from '../../../services/lockService';
import { getClientFinalized, computeCarryForwardPlan } from '../utils/lendingCalcs';
import { exportToExcel } from '../../../services/exportService';
import { formatCurrency } from '../../../utils/formatUtils';
import { getCurrentFYLabel, toJSDate } from '../../../utils/dateUtils';
import LendingTabs from '../components/LendingTabs';
import FYAccordion from '../components/FYAccordion';
import PasswordReauthDialog from '../../../components/PasswordReauthDialog';
import InfoDialog from '../../../components/InfoDialog';
import Toast from '../../../components/Toast';
import ErrorBanner from '../../../components/ErrorBanner';
import { useOrg, getOrgCollection } from '../../../context/OrgContext';

export default function FinalizedView() {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('client');
  const [sortDir, setSortDir] = useState('asc');
  const [toast, setToast] = useState(null);
  const [pendingAction, setPendingAction] = useState(null); // { kind: 'lock'|'unlock'|'deleteAll', fy }
  const { selectedOrg, canWrite } = useOrg();

  const { data: loans, loading: loadingLoans, error: loansError } = useCollection(getOrgCollection(selectedOrg, 'loans'));
  const { data: borrowings, loading: loadingBorrowings, error: borrowingsError } = useCollection(getOrgCollection(selectedOrg, 'borrowings'));
  const { isLocked, canLockFY, locks } = useLocks(selectedOrg);

  // Group active loans & borrowings by FY, compute per-FY finalized summaries.
  // Always include locked FYs even if their data was deleted post-lock.
  const fyGroupedFinalized = useMemo(() => {
    const fySet = new Set();
    loans.forEach(l => fySet.add(getCurrentFYLabel(toJSDate(l.loanDate))));
    borrowings.forEach(b => fySet.add(getCurrentFYLabel(toJSDate(b.borrowDate))));
    Object.entries(locks).forEach(([fy, lock]) => { if (lock?.isLocked) fySet.add(fy); });

    const fyLabels = [...fySet].sort((a, b) => b.localeCompare(a));

    const grouped = {};
    fyLabels.forEach(fy => {
      const fyLoans = loans.filter(l => getCurrentFYLabel(toJSDate(l.loanDate)) === fy);
      const fyBorrowings = borrowings.filter(b => getCurrentFYLabel(toJSDate(b.borrowDate)) === fy);
      const summaries = getClientFinalized(fyLoans, fyBorrowings);
      // Keep section even when empty (locked-and-archived FYs)
      grouped[fy] = summaries;
    });

    return grouped;
  }, [loans, borrowings, locks]);

  // All FYs that have actual data — used for canLockFY ordering check.
  // Excludes locked-but-empty FYs (those are "done") so they don't gate other locks.
  const allFYsWithData = useMemo(() => {
    return Object.entries(fyGroupedFinalized)
      .filter(([, items]) => items.length > 0)
      .map(([fy]) => fy)
      .sort();
  }, [fyGroupedFinalized]);

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

    try {
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
    } catch (err) {
      console.error('Finalized export failed:', err);
      setToast({ message: `Export failed: ${err?.message || 'unknown error'}`, type: 'error' });
    }
  };

  // Lock action — no password reauth required (unlocking + delete-all still are).
  const runLockNow = async (fy) => {
    if (!window.confirm(`Lock FY ${fy}? You can unlock it later (with your password) until you delete its data.`)) return;
    try {
      const plan = computeCarryForwardPlan(loans, borrowings, locks);
      const entry = plan.find(p => p.sourceFY === fy);
      const frozenCF = entry ? { side: entry.side, amount: entry.amount } : { side: null, amount: 0 };
      await lockFY(selectedOrg, fy, frozenCF);
      setToast({ message: `FY ${fy} locked`, type: 'success' });
    } catch (err) {
      console.error('Lock failed:', err);
      setToast({ message: `Lock failed: ${err?.message || 'unknown error'}`, type: 'error' });
    }
  };

  // Unlock and delete-all still run after password reauth via PasswordReauthDialog.
  const runUnlock = (fy) => async () => {
    await unlockFY(selectedOrg, fy);
    setToast({ message: `FY ${fy} unlocked`, type: 'success' });
    setPendingAction(null);
  };
  const runDeleteAll = (fy) => async () => {
    // Read fresh data straight from Firestore so we don't depend on the React snapshot
    // (which can lag or be stale across the password dialog round-trip). We also surface
    // any failure to the user so silent permission/network errors aren't hidden.
    const loansPath = getOrgCollection(selectedOrg, 'loans');
    const borrowingsPath = getOrgCollection(selectedOrg, 'borrowings');
    try {
      const [loansSnap, borrowingsSnap] = await Promise.all([
        getDocs(collection(db, loansPath)),
        getDocs(collection(db, borrowingsPath)),
      ]);

      const fyLoanDocs = loansSnap.docs.filter(d => {
        const data = d.data();
        if (data.isCarryForward) return false;
        if (!data.loanDate) return false;
        return getCurrentFYLabel(toJSDate(data.loanDate)) === fy;
      });
      const fyBorrowingDocs = borrowingsSnap.docs.filter(d => {
        const data = d.data();
        if (data.isCarryForward) return false;
        if (!data.borrowDate) return false;
        return getCurrentFYLabel(toJSDate(data.borrowDate)) === fy;
      });

      const totalToDelete = fyLoanDocs.length + fyBorrowingDocs.length;
      if (totalToDelete === 0) {
        setToast({ message: `No data found in FY ${fy} to delete`, type: 'info' });
        setPendingAction(null);
        return;
      }

      // Run all deletes in parallel; collect failures.
      const results = await Promise.allSettled([
        ...fyLoanDocs.map(d => deleteDocument(`${loansPath}/${d.id}`)),
        ...fyBorrowingDocs.map(d => deleteDocument(`${borrowingsPath}/${d.id}`)),
      ]);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.error('Delete-all failures:', failed.map(f => f.reason));
        setToast({
          message: `${totalToDelete - failed.length} of ${totalToDelete} deleted; ${failed.length} failed (see console)`,
          type: 'error',
        });
      } else {
        setToast({ message: `Deleted ${totalToDelete} entries from FY ${fy} (lock retained)`, type: 'success' });
      }
    } catch (err) {
      console.error('Delete-all error:', err);
      setToast({ message: `Delete failed: ${err?.message || 'unknown error'}`, type: 'error' });
    } finally {
      setPendingAction(null);
    }
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

      <ErrorBanner
        message={loansError ? `Failed to load lending data: ${loansError.message || 'permission denied or network error'}` : (borrowingsError ? `Failed to load borrowing data: ${borrowingsError.message || 'permission denied or network error'}` : null)}
        onRetry={() => window.location.reload()}
      />

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
              {/* Export hidden once a locked FY has been emptied via Delete All —
                  there's nothing to export and the row carries the archived placeholder. */}
              {!(locked && items.length === 0) && (
                <button
                  className="btn btn-sm btn-export"
                  onClick={() => handleExport(fy, items)}
                  disabled={items.length === 0}
                  title={items.length === 0 ? 'No data to export' : `Export FY ${fy}`}
                >
                  📥 Export
                </button>
              )}
              {canWrite && !locked && (
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    if (!eligibleToLock) {
                      setPendingAction({ kind: 'lock', fy, blocked: true });
                      return;
                    }
                    runLockNow(fy);
                  }}
                  title={eligibleToLock ? 'Lock this FY' : 'Previous FYs must be locked first'}
                >
                  🔒 Lock
                </button>
              )}
              {canWrite && locked && (
                <>
                  {/* Unlock is intentionally hidden once the FY has been locked AND
                      its data deleted: unlocking would clear the frozen CF and the
                      plan would then recompute against empty data, zeroing the CF
                      and silently breaking the downstream cascade. The lock + frozen
                      CF must remain to keep the cascade intact. */}
                  {items.length > 0 && (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setPendingAction({ kind: 'unlock', fy })}
                      title="Unlock this FY (requires password)"
                    >
                      🔓 Unlock
                    </button>
                  )}
                  {items.length > 0 && (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => setPendingAction({ kind: 'deleteAll', fy })}
                      title="Delete all data for this FY (requires password)"
                    >
                      🗑️ Delete All
                    </button>
                  )}
                </>
              )}
            </>
          );
        }}
        renderSection={(fy, items) => {
          if (items.length === 0) {
            return (
              <div className="locked-empty-row">
                Transactions for FY {fy} have been finalized, locked, and archived. No entries to display.
              </div>
            );
          }
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
        open={Boolean(pendingAction) && !pendingAction?.blocked && pendingAction?.kind !== 'lock'}
        title={
          pendingAction?.kind === 'unlock' ? `Unlock FY ${pendingAction.fy}` :
          pendingAction?.kind === 'deleteAll' ? `Delete ALL data for FY ${pendingAction.fy}?` : ''
        }
        description={
          pendingAction?.kind === 'unlock' ? `Re-authentication is required to unlock FY ${pendingAction.fy}.` :
          pendingAction?.kind === 'deleteAll' ? `This permanently deletes every lending and borrowing entry dated in FY ${pendingAction.fy}. This cannot be undone.` : ''
        }
        confirmLabel={
          pendingAction?.kind === 'unlock' ? 'Unlock' :
          pendingAction?.kind === 'deleteAll' ? 'Delete All' : 'Confirm'
        }
        confirmVariant={pendingAction?.kind === 'deleteAll' ? 'danger' : 'primary'}
        onCancel={() => setPendingAction(null)}
        onConfirm={
          pendingAction?.kind === 'unlock' ? runUnlock(pendingAction.fy) :
          pendingAction?.kind === 'deleteAll' ? runDeleteAll(pendingAction.fy) :
          (async () => {})
        }
      />

      {pendingAction?.blocked && (
        <InfoDialog
          open
          title={`Cannot lock FY ${pendingAction.fy}`}
          description="All previous financial years with data must be locked before this one. Lock the earlier FYs first, then return here."
          onClose={() => setPendingAction(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
