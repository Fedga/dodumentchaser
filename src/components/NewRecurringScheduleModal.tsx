import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, AlertCircle, Sparkles, Check, Repeat, FileText, User } from 'lucide-react';
import { Client, Template, RecurringSchedule, RecurringFrequency, DueDateRule } from '../types';
import { api } from '../api';
import { useToast } from './Toast';

interface NewRecurringScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  templates: Template[];
  scheduleToEdit?: RecurringSchedule | null;
  onSaved: (schedule: RecurringSchedule) => void;
}

export const NewRecurringScheduleModal: React.FC<NewRecurringScheduleModalProps> = ({
  isOpen,
  onClose,
  clients,
  templates,
  scheduleToEdit,
  onSaved,
}) => {
  const { showToast } = useToast();

  const [clientId, setClientId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('Monthly');
  const [nextOccurrence, setNextOccurrence] = useState('');
  const [ruleType, setRuleType] = useState<DueDateRule['type']>('days_after_start');
  const [ruleDaysOffset, setRuleDaysOffset] = useState<number>(14);
  const [reminderFrequencyDays, setReminderFrequencyDays] = useState<number>(3);
  const [isCustomInterval, setIsCustomInterval] = useState(false);
  const [maxReminders, setMaxReminders] = useState<number>(5);
  const [generateFirstImmediately, setGenerateFirstImmediately] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (scheduleToEdit) {
      setClientId(scheduleToEdit.clientId);
      setTemplateId(scheduleToEdit.templateId);
      setName(scheduleToEdit.name);
      setDescription(scheduleToEdit.description || '');
      setFrequency(scheduleToEdit.frequency);
      setNextOccurrence(scheduleToEdit.nextOccurrence);
      setRuleType(scheduleToEdit.dueDateRule?.type || 'days_after_start');
      setRuleDaysOffset(scheduleToEdit.dueDateRule?.daysOffset || 14);
      setReminderFrequencyDays(scheduleToEdit.reminderFrequencyDays || 3);
      setMaxReminders(scheduleToEdit.maxReminders || 5);
      setGenerateFirstImmediately(false);
    } else {
      setClientId(clients[0]?.id || '');
      setTemplateId(templates[0]?.id || '');
      setName('Monthly Bookkeeping');
      setDescription('');
      setFrequency('Monthly');
      setNextOccurrence(new Date().toISOString().split('T')[0]);
      setRuleType('days_after_start');
      setRuleDaysOffset(14);
      setReminderFrequencyDays(3);
      setMaxReminders(5);
      setGenerateFirstImmediately(true);
    }
  }, [scheduleToEdit, clients, templates, isOpen]);

  // Auto-update suggested name when client or template changes
  const handleTemplateChange = (newTmplId: string) => {
    setTemplateId(newTmplId);
    const tmpl = templates.find(t => t.id === newTmplId);
    if (tmpl && !scheduleToEdit) {
      setName(tmpl.name);
      if (tmpl.category?.toLowerCase().includes('vat')) {
        setFrequency('Quarterly');
      } else if (tmpl.category?.toLowerCase().includes('year')) {
        setFrequency('Annual');
      } else {
        setFrequency('Monthly');
      }
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientId) {
      showToast('Please select a client', 'error');
      return;
    }
    if (!templateId) {
      showToast('Please select a template', 'error');
      return;
    }
    if (!name.trim()) {
      showToast('Please enter a schedule name', 'error');
      return;
    }
    if (!nextOccurrence) {
      showToast('Please specify the next run date', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const dueDateRule: DueDateRule = {
        type: ruleType,
        daysOffset: Number(ruleDaysOffset),
      };

      if (scheduleToEdit) {
        const updated = await api.updateRecurringSchedule(scheduleToEdit.id, {
          clientId,
          templateId,
          name: name.trim(),
          description: description.trim(),
          frequency,
          nextOccurrence,
          dueDateRule,
          reminderFrequencyDays: Number(reminderFrequencyDays),
          maxReminders: Number(maxReminders),
        });
        showToast(`Updated recurring schedule "${updated.name}"`, 'success');
        onSaved(updated);
      } else {
        const created = await api.createRecurringSchedule({
          clientId,
          templateId,
          name: name.trim(),
          description: description.trim(),
          frequency,
          nextOccurrence,
          dueDateRule,
          reminderFrequencyDays: Number(reminderFrequencyDays),
          maxReminders: Number(maxReminders),
          generateFirstImmediately,
        });
        showToast(
          created.firstRequest
            ? `Created schedule and generated first request "${created.firstRequest.name}"`
            : `Created recurring schedule "${created.name}"`,
          'success'
        );
        onSaved(created);
      }
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to save recurring schedule', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {scheduleToEdit ? 'Edit Recurring Schedule' : 'New Recurring Document Request'}
              </h2>
              <p className="text-xs text-slate-500">
                Automatically generate requests on a repeating schedule with duplicate prevention
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Target Client & Template */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Client *
              </label>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-800"
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Document Checklist Template *
              </label>
              <select
                value={templateId}
                onChange={e => handleTemplateChange(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-800"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.requirements?.length || 0} items)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Schedule Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Schedule Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Monthly Bookkeeping, Quarterly VAT Return"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-800"
            />
          </div>

          {/* Frequency & Next Occurrence */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Frequency *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Monthly', 'Quarterly', 'Annual'] as RecurringFrequency[]).map(freq => (
                  <button
                    type="button"
                    key={freq}
                    onClick={() => setFrequency(freq)}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all text-center ${
                      frequency === freq
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Next Occurrence Run Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={nextOccurrence}
                  onChange={e => setNextOccurrence(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Due Date Calculation Rule */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Due Date Calculation Rule
              </span>
              <span className="text-xs text-slate-500">
                Determines the client deadline for each generated period
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <select
                  value={ruleType}
                  onChange={e => setRuleType(e.target.value as DueDateRule['type'])}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="days_after_start">Days after period starts</option>
                  <option value="day_of_month">Specific day of month</option>
                  <option value="end_of_month">Last day of the month</option>
                </select>
              </div>

              {ruleType !== 'end_of_month' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    max={ruleType === 'day_of_month' ? 28 : 90}
                    value={ruleDaysOffset}
                    onChange={e => setRuleDaysOffset(Number(e.target.value))}
                    className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <span className="text-xs text-slate-600">
                    {ruleType === 'days_after_start' ? 'days after cycle date' : 'th day of the month'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Reminder Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Chaser Interval
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
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-800"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
                <option value="custom">Custom interval...</option>
              </select>
              {isCustomInterval && (
                <div className="mt-2 flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={reminderFrequencyDays}
                    onChange={e => setReminderFrequencyDays(Math.max(1, Number(e.target.value)))}
                    className="w-20 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <span className="text-xs text-slate-500">days between reminders</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Maximum Reminders
              </label>
              <select
                value={maxReminders}
                onChange={e => setMaxReminders(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-800"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={999}>Unlimited</option>
              </select>
            </div>
          </div>

          {/* Generate first request immediately toggle (only for new schedules) */}
          {!scheduleToEdit && (
            <label className="flex items-center space-x-3 p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 cursor-pointer hover:bg-emerald-50 transition-colors">
              <input
                type="checkbox"
                checked={generateFirstImmediately}
                onChange={e => setGenerateFirstImmediately(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <div className="text-xs">
                <span className="font-semibold text-emerald-900 block">
                  Generate first period request immediately
                </span>
                <span className="text-emerald-700">
                  Creates the current cycle request right away and schedules subsequent periods automatically.
                </span>
              </div>
            </label>
          )}

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center space-x-2"
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{scheduleToEdit ? 'Save Changes' : 'Create Schedule'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
