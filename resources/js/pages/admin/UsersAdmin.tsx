import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api';
import { Plus, Trash2, Mail, RefreshCw, X } from 'lucide-react';

interface Domain { id: number; name: string; }
interface SyncJob { status: string; total_messages: number; synced_messages: number; error_log: string; }
interface MailUser { id: number; email: string; quota_bytes: number | null; created_at: string; latest_sync_job?: SyncJob; }

export default function UsersAdmin() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<number | ''>('');
  const [users, setUsers] = useState<MailUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [emailPrefix, setEmailPrefix] = useState('');
  const [password, setPassword] = useState('');

  const [syncUserId, setSyncUserId] = useState<number | null>(null);
  const [syncData, setSyncData] = useState({ source_host: '', source_username: '', source_password: '', local_password: '' });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    adminApi.getDomains().then(setDomains).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      loadUsers();
      const t = setInterval(loadUsers, 5000); // Poll for sync status
      return () => clearInterval(t);
    } else {
      setUsers([]);
    }
  }, [selectedDomain]);

  const loadUsers = async () => {
    if (!selectedDomain) return;
    setLoading(true);
    try {
      const data = await adminApi.getMailUsers(selectedDomain as number);
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDomain || !emailPrefix || !password) return;

    const domainName = domains.find(d => d.id === Number(selectedDomain))?.name;
    const fullEmail = `${emailPrefix}@${domainName}`;

    try {
      await adminApi.createMailUser(Number(selectedDomain), {
        email: fullEmail,
        password: password,
        active: true,
      });
      setEmailPrefix('');
      setPassword('');
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create mailbox');
    }
  };

  
  const handleTriggerSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncUserId) return;
    setIsSyncing(true);
    try {
      await adminApi.triggerSync(syncUserId, syncData);
      setSyncUserId(null);
      setSyncData({ source_host: '', source_username: '', source_password: '', local_password: '' });
      loadUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to start migration');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this mailbox? All mail data on the server might be lost!')) return;
    try {
      await adminApi.deleteMailUser(id);
      loadUsers();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mailboxes (Users)</h2>
          <p className="text-gray-500 mt-1">Manage email accounts for your domains.</p>
        </div>
        <div>
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value ? Number(e.target.value) : '')}
            className="border-gray-300 rounded-lg py-2 pl-3 pr-10 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm border outline-none"
          >
            <option value="">Select a Domain...</option>
            {domains.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedDomain && (
        <>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Mailbox</h3>
            <form onSubmit={handleCreate} className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <div className="flex shadow-sm rounded-lg">
                  <div className="relative flex-grow focus-within:z-10">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={emailPrefix}
                      onChange={(e) => setEmailPrefix(e.target.value)}
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full rounded-none rounded-l-lg pl-10 sm:text-sm border-gray-300 border py-2 outline-none"
                      placeholder="username"
                    />
                  </div>
                  <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                    @{domains.find(d => d.id === Number(selectedDomain))?.name}
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Strong password"
                />
              </div>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors h-[42px]"
              >
                <Plus className="w-5 h-5" />
                Add
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quota</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Migration Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">Loading...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">No mailboxes found in this domain.</td></tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.quota_bytes ? `${(user.quota_bytes / 1024 / 1024).toFixed(2)} MB` : 'Unlimited'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {user.latest_sync_job ? (
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              user.latest_sync_job.status === 'completed' ? 'bg-green-100 text-green-800' :
                              user.latest_sync_job.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800 animate-pulse'
                            }`}>
                              {user.latest_sync_job.status.toUpperCase()}
                            </span>
                            {user.latest_sync_job.status === 'processing' && (
                              <span className="text-xs text-gray-500">{user.latest_sync_job.synced_messages} / {user.latest_sync_job.total_messages} msgs</span>
                            )}
                            {user.latest_sync_job.status === 'failed' && (
                              <span className="text-xs text-red-500 truncate max-w-[150px]" title={user.latest_sync_job.error_log}>Error occurred</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => setSyncUserId(user.id)} title="Import / Sync Old Email" className="text-blue-600 hover:text-blue-900 mr-4"><RefreshCw className="w-5 h-5" /></button>
                        <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-900">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Sync Modal */}
      {syncUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">IMAP Migration Sync</h3>
              <button onClick={() => setSyncUserId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleTriggerSync}>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-500 mb-4">
                  Connect to an old IMAP server (e.g. Zimbra) to import all messages (Inbox, Sent, Drafts, Spam) into this account.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Old Server IMAP Host</label>
                  <input type="text" required value={syncData.source_host} onChange={e => setSyncData({...syncData, source_host: e.target.value})} className="w-full border-gray-300 rounded-lg py-2 px-3 border outline-none text-sm" placeholder="e.g. mail.zimbra-client.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Old Server Email / Username</label>
                  <input type="text" required value={syncData.source_username} onChange={e => setSyncData({...syncData, source_username: e.target.value})} className="w-full border-gray-300 rounded-lg py-2 px-3 border outline-none text-sm" placeholder="user@old-domain.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Old Server Password</label>
                  <input type="password" required value={syncData.source_password} onChange={e => setSyncData({...syncData, source_password: e.target.value})} className="w-full border-gray-300 rounded-lg py-2 px-3 border outline-none text-sm" placeholder="••••••••" />
                </div>
                <hr className="my-2 border-gray-100"/>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Current Password (Security Check)</label>
                  <input type="password" required value={syncData.local_password} onChange={e => setSyncData({...syncData, local_password: e.target.value})} className="w-full border-gray-300 rounded-lg py-2 px-3 border outline-none text-sm" placeholder="Password for this local account" />
                  <p className="text-[10px] text-gray-400 mt-1">Needed to push messages to Dovecot. Will be discarded after sync.</p>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 flex justify-end gap-2 border-t border-gray-100">
                <button type="button" onClick={() => setSyncUserId(null)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isSyncing} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {isSyncing ? 'Starting...' : 'Start Migration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
