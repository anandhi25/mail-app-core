import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api';
import { Plus, Trash2, Mail } from 'lucide-react';

interface Domain { id: number; name: string; }
interface MailUser { id: number; email: string; quota_bytes: number | null; created_at: string; }

export default function UsersAdmin() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<number | ''>('');
  const [users, setUsers] = useState<MailUser[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [emailPrefix, setEmailPrefix] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    adminApi.getDomains().then(setDomains).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      loadUsers();
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
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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
    </div>
  );
}
