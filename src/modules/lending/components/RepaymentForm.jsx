import { useState } from 'react';
import { fromInputDate } from '../../../utils/dateUtils';

export default function RepaymentForm({ onSubmit }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        amount: Number(amount),
        date: fromInputDate(date),
        notes: notes.trim(),
      });
      setAmount('');
      setNotes('');
      setDate(new Date().toISOString().slice(0, 10));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Amount (₹)</label>
        <input
          type="number"
          min="1"
          step="any"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Enter amount"
          required
        />
      </div>
      <div className="form-group">
        <label>Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label>Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Cash, UPI"
        />
      </div>
      <button type="submit" className="btn btn-success" disabled={submitting}>
        {submitting ? 'Adding...' : 'Add Repayment'}
      </button>
    </form>
  );
}
