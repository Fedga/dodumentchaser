import React, { useState, useEffect } from 'react';
import { Firm, User } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Building2, BellRing, Shield, CreditCard, Save, Check } from 'lucide-react';

interface SettingsViewProps {
  user: User | null;
  firm: Firm | null;
  onFirmUpdated: (firm: Firm) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  firm,
  onFirmUpdated,
}) => {
  const { showToast } = useToast();
  const [name, setName] = useState(firm?.name || 'Example Accounting Ltd');
  const [defaultReminderDays, setDefaultReminderDays] = useState(firm?.defaultReminderDays || 3);
  const [defaultMaxReminders, setDefaultMaxReminders] = useState(firm?.defaultMaxReminders || 5);
  const [defaultReminderSubject, setDefaultReminderSubject] = useState(
    firm?.defaultReminderSubject || 'Documents still needed for {{request_name}}'
  );
  const [defaultReminderBody, setDefaultReminderBody] = useState(
    firm?.defaultReminderBody ||
      `Hi {{client_name}},\n\nWe're still waiting for the following documents for {{request_name}}:\n\n{{missing_documents}}\n\nPlease upload them using your secure client portal:\n{{portal_link}}\n\nThank you,\n{{firm_name}}`
  );
  const [plan, setPlan] = useState<'Starter' | 'Professional' | 'Practice'>(firm?.plan || 'Professional');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (firm) {
      setName(firm.name);
      setDefaultReminderDays(firm.defaultReminderDays);
      setDefaultMaxReminders(firm.defaultMaxReminders);
      setDefaultReminderSubject(firm.defaultReminderSubject);
      setDefaultReminderBody(firm.defaultReminderBody);
      setPlan(firm.plan);
    }
  }, [firm]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.updateFirm({
        name,
        defaultReminderDays,
        defaultMaxReminders,
        defaultReminderSubject,
        defaultReminderBody,
        plan,
      });
      showToast('Settings saved successfully');
      onFirmUpdated(res.firm);
    } catch (err: any) {
      showToast('Failed to save settings: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Practice Settings</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Configure accounting practice branding, automated reminder frequencies, and email chase templates.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Firm Details */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">Firm Profile</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Accounting Practice Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">Appears on client portals and reminder emails.</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Active Subscription Plan</label>
              <select
                value={plan}
                onChange={e => setPlan(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="Starter">Starter (£19/mo - Up to 15 clients)</option>
                <option value="Professional">Professional (£49/mo - Up to 60 clients)</option>
                <option value="Practice">Practice (£99/mo - Unlimited clients)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Ready for Stripe subscription integration.</p>
            </div>
          </div>
        </div>

        {/* Section 2: Automated Chaser Defaults */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <BellRing className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">Default Reminder Chasing Rules</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Default Chasing Cadence</label>
              <select
                value={defaultReminderDays}
                onChange={e => setDefaultReminderDays(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value={1}>Every 1 day (Aggressive)</option>
                <option value={3}>Every 3 days (Recommended)</option>
                <option value={5}>Every 5 days</option>
                <option value={7}>Every 7 days (Weekly)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">How often reminders dispatch until all items are received.</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Maximum Reminders per Request</label>
              <select
                value={defaultMaxReminders}
                onChange={e => setDefaultMaxReminders(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value={1}>1 reminder</option>
                <option value={2}>2 reminders</option>
                <option value={3}>3 reminders</option>
                <option value={5}>5 reminders (Default)</option>
                <option value={999}>Unlimited (Chase until submitted)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Auto-pauses if client fails to respond after limit.</p>
            </div>
          </div>
        </div>

        {/* Section 3: Reminder Template Message */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">Default Reminder Email Copy</h2>
            <div className="text-[11px] text-slate-500 font-mono">
              Available tags: &#123;&#123;client_name&#125;&#125;, &#123;&#123;request_name&#125;&#125;, &#123;&#123;missing_documents&#125;&#125;, &#123;&#123;portal_link&#125;&#125;, &#123;&#123;firm_name&#125;&#125;
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Subject Line</label>
              <input
                type="text"
                value={defaultReminderSubject}
                onChange={e => setDefaultReminderSubject(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Message Body</label>
              <textarea
                rows={6}
                value={defaultReminderBody}
                onChange={e => setDefaultReminderBody(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-md p-3 text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                required
              />
            </div>
          </div>
        </div>

        {/* Section 4: User Profile & Security */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-emerald-600" />
            <div>
              <div className="text-xs font-bold text-slate-900">{user?.name} &middot; {user?.role.toUpperCase()}</div>
              <div className="text-[11px] text-slate-500">{user?.email} &middot; Multi-tenant firm boundary enforced</div>
            </div>
          </div>
          <span className="text-xs text-emerald-700 font-medium">ICAEW/GDPR Compliant</span>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
