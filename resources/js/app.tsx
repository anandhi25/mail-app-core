import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import WebmailLayout from './layouts/WebmailLayout';
import AdminLayout from './layouts/AdminLayout';
import Inbox from './pages/Inbox';
import Drafts from './pages/Drafts';
import Login from './pages/Login';
import LoginAdmin from './pages/LoginAdmin';
import DomainsAdmin from './pages/admin/DomainsAdmin';
import UsersAdmin from './pages/admin/UsersAdmin';
import SettingsAdmin from './pages/admin/SettingsAdmin';
import Settings from "./pages/Settings";

// Basic wrapper for Protected Routes
const ProtectedRoute = () => {
  const token = localStorage.getItem('auth_token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<LoginAdmin />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/domains" replace />} />
            <Route path="domains" element={<DomainsAdmin />} />
            <Route path="users" element={<UsersAdmin />} />
            <Route path="aliases" element={<div className="p-8">Aliases Management (Coming soon)</div>} />
            <Route path="settings" element={<SettingsAdmin />} />
          </Route>

          {/* Webmail Routes */}
          <Route path="/" element={<WebmailLayout />}>
            <Route index element={<Navigate to="/inbox" replace />} />
            <Route path=":folder" element={<Inbox />} />
            <Route path="drafts" element={<Drafts />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
