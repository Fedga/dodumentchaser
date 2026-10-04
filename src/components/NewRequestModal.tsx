import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Sparkles, Check, FileCheck2, Clock, Calendar, Repeat } from 'lucide-react';
import { Client, Template, RecurringFrequency } from '../types';
import { api } from '../api';
import { useToast } from './Toast';

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  templates: Template[];
  preselectedClientId?: string;
  onRequestCreated: (newRequestId: string) => void;
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  isOpen,
  onClose,
  clients,
  templates,
  preselectedClientId,
  onRequestCreated,
}) => {
  const { showToast } = useToast();
  const [clientId, setClientId] = useState(preselectedClientId || (clients[0]?.id || ''));
  const [requestName, setRequestName] = useState('April 2027 Bookkeeping');
  const [description, setDescription] = useState('Monthly accounting document collection for routine reconciliation.');
  const [period, setPeriod] = useState('April 2027');
  const [dueDate, setDueDate] = useState('2027-04-15');
  const [reminderFrequencyDays, setReminderFrequencyDays] = useState(3);
  const [isCustomInterval, setIsCustomInterval] = useState(false);
  const [maxReminders, setMaxReminders] = useState(5);
  const [frequency, setFrequency] = useState<RecurringFrequency>('One-off');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [requirements, setRequirements] = useState<Array<{ name: string; description: string; required: boolean }>>([
    { name: 'Bank Statement (All Accounts)', description: 'Full monthly statement in PDF format.', required: true },
    { name: 'Credit Card Statement', description: 'Itemised transactions breakdown.', required: true },
    { name: 'Sales Invoices & Output Ledger', description: 'Invoices issued to clients during the period.', required: true },
    { name: 'Supplier Invoices & Receipts', description: 'All bills, receipts and petty expenses.', required: true },
    { name: 'Payroll Summary Report (P32)', description: 'Gross to net monthly report.', required: false },
  ]);

  const [newItemName, setNewItemName] = useState('');
  const [newItemRequired, setNewItemRequired] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    if (preselectedClientId) {
      setClientId(preselectedClientId);
    } else if (clients.length > 0 && !clientId) {
      setClientId(clients[0].id);
    }
  }, [preselectedClientId, clients]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const tmpl = templates.find(t => t.id === templateId);
    if (tmpl) {
      setRequestName(`${period} ${tmpl.name}`);
      setDescription(tmpl.description);
      setRequirements(tmpl.requirements.map(r => ({
        name: r.name,
        description: r.description,
        required: r.required,
      })));
    }
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    setRequirements([...requirements, { name: newItemName.trim(), description: '', required: newItemRequired }]);
    setNewItemName('');
    setNewItemRequired(true);
  };

  const handleRemoveItem = (index: number) => {
    setRequirements(requirements.filter((_, idx) => idx !== index));
  };

  const handleSuggestAi = async () => {
    setIsAiLoading(true);
    try {
      const res = await api.suggestRequirements(requestName, period, requirements.map(r => r.name));
      if (res.suggestedRequirements?.length > 0) {
        setRequirements(prev => [
          ...prev,
          ...res.suggestedRequirements.filter(item => !prev.some(p => p.name.toLowerCase() === item.name.toLowerCase())),
        ]);
        showToast(`AI suggested ${res.suggestedRequirements.length} additional documents`);
      }
    } catch (err: any) {
      showToast('Could not load AI suggestions: ' + err.message, 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      showToast('Please select a client', 'error');
      return;
    }
    if (!requestName.trim()) {
      showToast('Please enter a request title', 'error');
      return;
    }
    if (requirements.length === 0) {
      showToast('Please add at least one document requirement', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createRequest({
        clientId,
        name: requestName.trim(),
        description: description.trim(),
        period: period.trim(),
        dueDate,
        reminderFrequencyDays,
        maxReminders,
        requirements,
        templateId: selectedTemplateId || undefined,
        isRecurring: frequency !== 'One-off',
        frequency,
      } as any);

      showToast(`Request "${created.name}" created successfully`);
      onRequestCreated(created.id);
      onClose();
    } catch (err: any) {
      showToast('Failed to create request: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-2xl w-full my-8 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900">Create Document Request</h2>
            <p className="text-xs text-slate-500 mt-0.5">Send a secure upload portal to your client with automated chasing.</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Client & Template Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Company <span className="text-rose-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full text-xs font-medium bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                required
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Apply Template (Optional)
              </label>
              <select
                value={selectedTemplateId}
                onChange={e => handleTemplateChange(e.target.value)}
                className="w-full text-xs font-medium bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              >
                <option value="">-- Choose Reusable Checklist --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.requirements.length} docs)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Request Name & Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Request Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={requestName}
                onChange={e => setRequestName(e.target.value)}
                placeholder="e.g. March 2027 Bookkeeping"
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Accounting Period
              </label>
              <input
                type="text"
                value={period}
                onChange={e => setPeriod(e.target.value)}
                placeholder="e.g. March 2027"
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
            </div>
          </div>

          {/* Repeat Frequency */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                <Repeat className="w-3.5 h-3.5 text-emerald-600" />
                <span>Repeat Frequency</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {frequency === 'One-off' ? 'Single one-off request' : `Automatically creates future ${frequency.toLowerCase()} requests`}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(['One-off', 'Monthly', 'Quarterly', 'Annual'] as RecurringFrequency[]).map(freq => (
                <button
                  type="button"
                  key={freq}
                  onClick={() => setFrequency(freq)}
                  className={`py-1.5 px-2 text-xs font-medium rounded-md border text-center transition-all ${
                    frequency === freq
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {freq}
                </button>
              ))}
            </div>
          </div>

          {/* Due date & Automated Reminders */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Due Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reminder Interval
              </label>
              <select
                value={isCustomInterval ? 'custom' : reminderFrequencyDays}
                onChange={e => {
                  if (e.target.value === 'custom') {
                    setIsCustomInterval(true);
                  } else {
                    setIsCustomInterval(false);
                    setReminderFrequencyDays(Number(e.target.value));
                  }
                }}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
                <option value="custom">Custom interval...</option>
              </select>
              {isCustomInterval && (
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={reminderFrequencyDays}
                    onChange={e => setReminderFrequencyDays(Math.max(1, Number(e.target.value)))}
                    className="w-16 text-xs bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <span className="text-[10px] text-slate-500">days</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Maximum Reminders
              </label>
              <select
                value={maxReminders}
                onChange={e => setMaxReminders(Number(e.target.value))}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={999}>Unlimited</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instructions for Client
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Provide clear context so your client knows what to prepare..."
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>

          {/* Required Documents Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                <span>Document Checklist ({requirements.length} requested)</span>
              </label>

              <button
                type="button"
                onClick={handleSuggestAi}
                disabled={isAiLoading}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>{isAiLoading ? 'Analyzing...' : 'AI Suggest Docs'}</span>
              </button>
            </div>

            {/* Checklist items table */}
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {requirements.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No documents in checklist yet. Add one below or select a template above.
                </div>
              ) : (
                requirements.map((item, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50/60">
                    <div className="flex items-center gap-2 min-w-0 flex-1 pr-3">
                      <span className="font-mono text-slate-400 text-[11px] shrink-0">{idx + 1}.</span>
                      <span className="font-medium text-slate-900 truncate">{item.name}</span>
                      {item.required ? (
                        <span className="text-[10px] font-semibold text-rose-600 shrink-0">Required</span>
                      ) : (
                        <span className="text-[10px] text-slate-600 shrink-0">Optional</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                      title="Remove document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Quick add custom document */}
            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="text"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                placeholder="Add custom document requirement (e.g. Loan Agreement)..."
                className="flex-1 text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddItem(e);
                  }
                }}
              />
              <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={newItemRequired}
                  onChange={e => setNewItemRequired(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span>Required</span>
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
              >
                Add Item
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
            >
              {isSubmitting ? 'Creating Request...' : 'Create & Generate Portal Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
