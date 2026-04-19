import { Route } from 'react-router-dom';
import LoanList from './pages/LoanList';
import LoanForm from './pages/LoanForm';
import LoanDetail from './pages/LoanDetail';
import BorrowingList from './pages/BorrowingList';
import BorrowingForm from './pages/BorrowingForm';
import BorrowingDetail from './pages/BorrowingDetail';
import FinalizedView from './pages/FinalizedView';
import ClientDetail from './pages/ClientDetail';

// Module route config — imported by App.jsx
const lendingRoutes = (
  <>
    <Route path="lending" element={<LoanList />} />
    <Route path="lending/new" element={<LoanForm />} />
    <Route path="lending/borrowings" element={<BorrowingList />} />
    <Route path="lending/borrowings/new" element={<BorrowingForm />} />
    <Route path="lending/borrowings/:id" element={<BorrowingDetail />} />
    <Route path="lending/finalized" element={<FinalizedView />} />
    <Route path="lending/client/:name" element={<ClientDetail />} />
    <Route path="lending/:id" element={<LoanDetail />} />
    <Route path="lending/:id/edit" element={<LoanForm />} />
  </>
);

export default lendingRoutes;
