import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Globe, Users, Forward, Settings, LogOut, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  const menuItems = [
    { name: 'Domains', path: '/admin/domains', icon: Globe },
    { name: 'Mailboxes (Users)', path: '/admin/users', icon: Users },
    { name: 'Aliases', path: '/admin/aliases', icon: Forward },
    { name: 'Server Settings', path: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans overflow-hidden">
      {/* Admin Sidebar */}
      <aside className="bg-gray-900 text-gray-300 w-64 flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-4 font-bold text-lg text-white gap-2 border-b border-gray-800">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          Mail Control Panel
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-800 text-white"
                  : "hover:bg-gray-800 hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white w-full px-2 py-1 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out Admin
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 flex-shrink-0">
          <h1 className="text-xl font-semibold text-gray-800">Administration</h1>
          <NavLink
            to="/inbox"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Go to Webmail
          </NavLink>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
