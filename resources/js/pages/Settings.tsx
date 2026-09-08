import React, { useEffect, useState } from 'react';
import { webmailProfileApi } from '../lib/api';
import { Save, Cloud } from 'lucide-react';
import clsx from 'clsx';

export default function Settings() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    name: '',
    current_password: '',
    password: '',
    password_confirmation: '',
  });

  useEffect(() => {
    webmailProfileApi.getProfile()
      .then(data => {
        setProfile(data);
        setFormData(f => ({ ...f, name: data.name || '' }));
      })
      .catch(err => {
        setMessage({ type: 'error', text: 'Failed to load profile.' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await webmailProfileApi.updateProfile(formData);
      setMessage({ type: 'success', text: res.message || 'Profile updated successfully.' });
      setFormData(f => ({
        ...f,
        current_password: '',
        password: '',
        password_confirmation: '',
      }));
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to update profile.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-500 mt-1">Manage your webmail account and cloud storage integrations.</p>
      </div>

      {message.text && (
        <div className={clsx(
          "mb-6 p-4 rounded-lg text-sm font-medium",
          message.type === 'success' ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
        )}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Profile Details Column */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Account Profile</h3>
            </div>
            <div className="p-6">
              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="text"
                    disabled
                    value={profile?.email || ''}
                    className="w-full border-gray-200 bg-gray-50 text-gray-500 rounded-lg py-2.5 px-3 border"
                  />
                  <p className="text-xs text-gray-400 mt-1">Your email address cannot be changed.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full border-gray-300 rounded-lg py-2.5 px-3 border focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="e.g. John Doe"
                  />
                  <p className="text-xs text-gray-500 mt-1">This name will be displayed when you send emails.</p>
                </div>

                <hr className="border-gray-100" />

                <h4 className="font-medium text-gray-900 text-sm">Change Password</h4>
                <p className="text-xs text-gray-500 -mt-1">Leave blank if you do not want to change your password.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      name="current_password"
                      value={formData.current_password}
                      onChange={handleChange}
                      className="w-full border-gray-300 rounded-lg py-2.5 px-3 border focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full border-gray-300 rounded-lg py-2.5 px-3 border focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      name="password_confirmation"
                      value={formData.password_confirmation}
                      onChange={handleChange}
                      className="w-full border-gray-300 rounded-lg py-2.5 px-3 border focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Cloud Integrations Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Cloud className="w-5 h-5 text-gray-400" />
                Cloud Integrations
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                Connect your cloud storage accounts to easily attach large files to your emails.
              </p>

              {/* Google Drive */}
              <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Drive" className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Google Drive</p>
                    <p className="text-xs text-gray-500">Not connected</p>
                  </div>
                </div>
                <button className="text-sm font-medium text-blue-600 hover:text-blue-700">Connect</button>
              </div>

              {/* Dropbox */}
              <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/cb/Dropbox_logo_2017.svg" alt="Dropbox" className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Dropbox</p>
                    <p className="text-xs text-gray-500">Not connected</p>
                  </div>
                </div>
                <button className="text-sm font-medium text-blue-600 hover:text-blue-700">Connect</button>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
