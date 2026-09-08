import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api';
import { Save, Server, Shield, Mail, Activity } from 'lucide-react';
import clsx from 'clsx';

interface ConfigItem {
  key: string;
  value: string;
}

export default function SettingsAdmin() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Grouped configuration states
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const data: ConfigItem[] = await adminApi.getConfigs();

      const map: Record<string, string> = {};
      if (Array.isArray(data)) {
        setConfigs(data);
        data.forEach(item => {
          map[item.key] = item.value;
        });
      }

      // Default keys that should exist in the form even if not in DB yet
      const defaultKeys = [
        'smtp_host', 'smtp_port', 'smtp_encryption',
        'imap_host', 'imap_port', 'imap_encryption',
        'relay_host', 'relay_port', 'relay_username', 'relay_password', 'relay_auth'
      ];

      defaultKeys.forEach(k => {
        if (map[k] === undefined) map[k] = '';
      });

      setFormData(map);
    } catch (err) {
      console.error('Failed to load configs', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = Object.entries(formData).map(([key, value]) => ({ key, value }));

    try {
      await adminApi.updateConfigs(payload);
      alert('Settings saved successfully!');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Server Settings</h2>
          <p className="text-gray-500 mt-1">Configure IMAP, SMTP, and Mail Relay (SmartHost) options.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">

        {/* IMAP SETTINGS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
            <Server className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900 text-lg">IMAP Configuration</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Host</label>
              <input
                type="text"
                value={formData.imap_host || ''}
                onChange={(e) => handleChange('imap_host', e.target.value)}
                placeholder="mail.example.com or 127.0.0.1"
                className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm"
              />
            </div>
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={formData.imap_port || ''}
                  onChange={(e) => handleChange('imap_port', e.target.value)}
                  placeholder="993"
                  className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Encryption</label>
                <select
                  value={formData.imap_encryption || ''}
                  onChange={(e) => handleChange('imap_encryption', e.target.value)}
                  className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm bg-white"
                >
                  <option value="ssl">SSL / TLS</option>
                  <option value="tls">STARTTLS</option>
                  <option value="false">None</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* SMTP SETTINGS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-3">
            <Mail className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900 text-lg">Local SMTP Configuration</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
              <input
                type="text"
                value={formData.smtp_host || ''}
                onChange={(e) => handleChange('smtp_host', e.target.value)}
                placeholder="mail.example.com or 127.0.0.1"
                className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
              />
            </div>
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={formData.smtp_port || ''}
                  onChange={(e) => handleChange('smtp_port', e.target.value)}
                  placeholder="465 or 587"
                  className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Encryption</label>
                <select
                  value={formData.smtp_encryption || ''}
                  onChange={(e) => handleChange('smtp_encryption', e.target.value)}
                  className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm bg-white"
                >
                  <option value="ssl">SSL / TLS</option>
                  <option value="tls">STARTTLS</option>
                  <option value="null">None</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* RELAY SETTINGS (SmartHost) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-gray-900 text-lg">SMTP Relay (SmartHost)</h3>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={formData.relay_auth === 'true'}
                  onChange={(e) => handleChange('relay_auth', e.target.checked ? 'true' : 'false')}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                <span className="ml-3 font-medium text-gray-700">Enable Relay</span>
              </label>
            </div>
          </div>

          <div className={clsx("p-6 transition-opacity", formData.relay_auth !== 'true' && "opacity-50 pointer-events-none")}>
            <p className="text-sm text-gray-500 mb-6">
              Use a third-party SMTP provider (like SendGrid, Amazon SES, or Mailgun) to deliver outbound emails and improve deliverability.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relay Host</label>
                <input
                  type="text"
                  value={formData.relay_host || ''}
                  onChange={(e) => handleChange('relay_host', e.target.value)}
                  placeholder="smtp.sendgrid.net"
                  className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-orange-500 focus:border-orange-500 outline-none shadow-sm"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={formData.relay_port || ''}
                  onChange={(e) => handleChange('relay_port', e.target.value)}
                  placeholder="587"
                  className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-orange-500 focus:border-orange-500 outline-none shadow-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={formData.relay_username || ''}
                  onChange={(e) => handleChange('relay_username', e.target.value)}
                  placeholder="apikey or username"
                  className="w-full border-gray-300 rounded-lg py-2 px-3 border focus:ring-orange-500 focus:border-orange-500 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <Shield className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={formData.relay_password || ''}
                    onChange={(e) => handleChange('relay_password', e.target.value)}
                    placeholder="Relay password or API Key"
                    className="w-full pl-10 pr-3 border-gray-300 rounded-lg py-2 border focus:ring-orange-500 focus:border-orange-500 outline-none shadow-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}
