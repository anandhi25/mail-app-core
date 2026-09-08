import React, { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Inbox,
  Send,
  File,
  Trash2,
  AlertCircle,
  Archive,
  Menu,
  Settings,
  User,
  Search,
  PenSquare,
} from 'lucide-react';
import clsx from 'clsx';
import ComposeModal from '../components/ComposeModal';
import { useMailNotifications } from '../hooks/useMailNotifications';
import { webmailProfileApi } from '../lib/api';

const folders = [
  { name: 'INBOX', label: 'Inbox', icon: Inbox },
  { name: 'Drafts', label: 'Drafts', icon: File },
  { name: 'Sent', label: 'Sent', icon: Send },
  { name: 'Spam', label: 'Spam', icon: AlertCircle },
  { name: 'Trash', label: 'Trash', icon: Trash2 },
  { name: 'Archive', label: 'Archive', icon: Archive },
];

export default function WebmailLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isComposeOpen, setComposeOpen] = useState(false);
  const { unreadCounts, isConnected } = useMailNotifications();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    webmailProfileApi.getProfile()
      .then(setProfile)
      .catch(console.error);
  }, []);

  return (
    <div className="flex h-screen bg-white text-gray-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside
        className={clsx(
          'bg-[#1A1A1A] text-gray-300 w-64 flex-shrink-0 flex flex-col transition-all duration-300',
          !isSidebarOpen && '-ml-64'
        )}
      >
        <div className="h-16 flex items-center px-4 font-bold text-xl text-white tracking-wide gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Inbox className="w-5 h-5 text-white" />
          </div>
          ProtonClone
        </div>

        <div className="px-4 py-4">
          <button
            onClick={() => setComposeOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <PenSquare className="w-4 h-4" />
            New Message
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 space-y-1">
          {folders.map((f) => {
            const unread = unreadCounts[f.name] ?? 0;
            return (
              <NavLink
                key={f.name}
                to={`/${f.name.toLowerCase()}`}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive ? 'bg-[#2D2D2D] text-white' : 'hover:bg-[#252525] hover:text-white'
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <f.icon className="w-4 h-4" />
                  {f.label}
                </div>
                {unread > 0 && (
                  <span className="bg-blue-600 text-white text-xs py-0.5 px-2 rounded-full font-bold">
                    {unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-[#2D2D2D] flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm flex-1 min-w-0">
            <div className="w-8 h-8 bg-[#2D2D2D] rounded-full flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-400" />
            </div>
            <div className="truncate flex-1">
              <div className="font-medium text-white truncate" title={profile?.email || 'Loading...'}>
                {profile?.name || profile?.email || 'Loading...'}
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                {isConnected ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    <span className="text-green-500">Live</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block animate-pulse" />
                    <span className="text-yellow-500">Connecting...</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('auth_token');
              window.location.href = '/login';
            }}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 shrink-0"
            title="Log out"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-md text-gray-600"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="max-w-xl w-full relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search messages..."
                className="w-full bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-lg pl-10 pr-4 py-2 text-sm transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NavLink
              to="/admin"
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors hidden sm:block"
            >
              Admin Panel
            </NavLink>
            <NavLink to="/settings" className={({isActive}) => clsx("p-2 rounded-md transition-colors", isActive ? "bg-blue-50 text-blue-600" : "hover:bg-gray-100 text-gray-600")}>
              <Settings className="w-5 h-5" />
            </NavLink>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
      </div>

      {/* Compose Modal */}
      {isComposeOpen && <ComposeModal onClose={() => setComposeOpen(false)} />}
    </div>
  );
}
