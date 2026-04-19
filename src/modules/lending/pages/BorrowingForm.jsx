import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCollection, addDocument } from '../../../hooks/useFirestore';
import { fromInputDate } from '../../../utils/dateUtils';
import Toast from '../../../components/Toast';

export default function BorrowingForm() {
  const navigate = useNavigate();
  const { data: allLoans } = useCollection('loans');

  // Build client → rate map from existing lendings for auto-fill
  const clientRates = useMemo(() => {
    const map = {};
    allLoans.forEach(l => {
      const key = l.clientName.trim().toLowerCase();
      if (!map[key]) {
        map[key] = { clientName: l.clientName, rate: l.monthlyInterestRate };
      }
    });
    return map;
  }, [allLoans]);

  const clientNames = useMemo(() => Object.values(clientRates).map(c => c.clientName), [clientRates]);

  const [form, setForm] = useState({
    clientName: '',
    amount: '',
    monthlyInterestRate: '',
    borrowDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Auto-fill rate when client name matches an existing lending client
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'clientName') {
        const key = value.trim().toLowerCase();
        if (clientRates[key]) {
          next.monthlyInterestRate = String(clientRates[key].rate);
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientName.trim() || !form.amount || !form.monthlyInterestRate || !form.borrowDate) {
      setToast({ message: 'Please fill all required fields', type: 'error' });
      return;
    }
    const amount = Number(form.amount);
    const rate = Number(form.monthlyInterestRate);
    if (amount <= 0 || rate < 0 || rate > 100) {
      setToast({ message: 'Please enter valid amounts', type: 'error' });
      return;
    }
    if (form.endDate && form.endDate <= form.borrowDate) {
      setToast({ message: 'End date must be after borrowing date', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      await addDocument('borrowings', {
        clientName: form.clientName.trim(),
        amount,
        monthlyInterestRate: rate,
        borrowDate: fromInputDate(form.borrowDate),
        endDate: form.endDate ? fromInputDate(form.endDate) : null,
        notes: form.notes.trim(),
        status: 'active',
      });
      setToast({ message: 'Borrowing recorded successfully', type: 'success' });
      setTimeout(() => navigate('/lending/borrowings'), 500);
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error saving. Please try again.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/lending/borrowings" className="btn btn-sm btn-outline" title="Back">←</Link>
          <h1>Record Borrowing</h1>
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Client Name *</label>
              <input
                type="text"
                name="clientName"
                value={form.clientName}
                onChange={handleChange}
                placeholder="Enter client name"
                list="client-suggestions"
                required
              />
              <datalist id="client-suggestions">
                {clientNames.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label>Amount (₹) *</label>
              <input
                type="number"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                placeholder="e.g. 50000"
                min="1"
                step="any"
                required
              />
            </div>
            <div className="form-group">
              <label>Monthly Interest Rate (%) *</label>
              <input
                type="number"
                name="monthlyInterestRate"
                value={form.monthlyInterestRate}
                onChange={handleChange}
                placeholder="Auto-filled from lending"
                min="0"
                max="100"
                step="any"
                required
              />
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input
                type="date"
                name="borrowDate"
                value={form.borrowDate}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={handleChange}
                min={form.borrowDate}
              />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input
                type="text"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Record Borrowing'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
