import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar onClose={() => setSidebarOpen(false)} />
      <div className="main-area">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="topbar-spacer" />
          <span className="user-name">{user?.displayName || 'MJ Finance'}</span>
          <button className="btn btn-sm btn-outline" onClick={signOut} style={{ marginLeft: '0.5rem' }}>
            Sign out
          </button>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
