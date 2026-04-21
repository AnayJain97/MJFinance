import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import lendingRoutes from './modules/lending';
import { OrgProvider } from './context/OrgContext';

export default function App() {
  return (
    <OrgProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          {lendingRoutes}
        </Route>
      </Routes>
    </OrgProvider>
  );
}
