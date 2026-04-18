import { NavLink } from 'react-router-dom';

export default function LendingTabs() {
  return (
    <div className="lending-tabs">
      <NavLink to="/lending" end className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
        💰 Lendings
      </NavLink>
      <NavLink to="/lending/borrowings" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
        🔄 Borrowings
      </NavLink>
      <NavLink to="/lending/finalized" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
        📊 Finalized
      </NavLink>
    </div>
  );
}
