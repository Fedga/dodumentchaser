import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Pause,
  Play,
  RefreshCw,
  Mail,
  CheckSquare,
  Square,
  AlertTriangle,
  Info,
  Calendar,
  X,
  Clock,
  ShieldCheck,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { ReminderQueueItem, Reminder } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface RemindersViewProps {
  initialTab?: 'queue' | 'history';
}

export const RemindersView: React.FC<RemindersViewProps> = ({
  initialTab = 'queue',
}) => {
  const { showToast } = useToast();
  const [queue, setQueue] = useState<ReminderQueueItem[]>([]);
  const [history, setHistory] = useState<Reminder[]>([]);
  const [providerName, setProviderName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isRunningBatch, setIsRunningBatch] = useState(false);

  // Bulk Chasing Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [respectFrequency, setRespectFrequency] = useState(true);

  const loadReminders = async () => {
    setIsLoading(true);
    try {
      const data = await api.getReminders();
      setQueue(data.queue || []);
      setHistory(data.history || []);
      setProviderName(data.providerName || 'Development Notification Logger');
    } catch (err: any) {
      showToast('Failed to load reminders: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
  }, []);

  // Filter eligible requests for bulk chasing
  const isRequestEligible = (item: ReminderQueueItem) => {
    const isPaused = item.remindersPaused;
    const isMaxReached = item.maxReminders > 0 && item.maxReminders < 999 && item.reminderCount >= item.maxReminders;
    const hasMissingDocs = item.missingCount > 0;
    return !isPaused && !isMaxReached && hasMissingDocs;
  };

  const eligibleItems = useMemo(() => queue.filter(isRequestEligible), [queue]);

  const selectedItems = useMemo(
    () => queue.filter(item => selectedIds.has(item.requestId)),
    [queue, selectedIds]
  );

  const uniqueClientsCount = useMemo(() => {
    const clients = new Set(selectedItems.map(item => item.clientId));
    return clients.size;
  }, [selectedItems]);

  const handleToggleSelect = (requestId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  const handleSelectAllEligible = () => {
    if (selectedIds.size === eligibleItems.length && eligibleItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleItems.map(item => item.requestId)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleRunBatch = async () => {
    setIsRunningBatch(true);
    try {
      const res = await api.runBatchChasing();
      if (res.sentCount > 0) {
        showToast(`Chasing Engine dispatched ${res.sentCount} due reminder${res.sentCount > 1 ? 's' : ''}`, 'success');
      } else {
        showToast('All clients are up-to-date or have pending cooldowns. No reminders due.', 'info');
      }
      loadReminders();
    } catch (err: any) {
      showToast('Chasing engine run failed: ' + err.message, 'error');
    } finally {
      setIsRunningBatch(false);
    }
  };

  const handleSendNow = async (requestId: string, clientName: string) => {
    setSendingId(requestId);
    try {
      const res = await api.sendChaser(requestId);
      if (res.sent) {
        showToast(`Reminder #${res.reminder?.reminderNumber || ''} dispatched to ${clientName}`, 'success');
      } else {
        showToast(`Reminder skipped: ${res.reason}`, 'info');
      }
      loadReminders();
    } catch (err: any) {
      showToast('Could not dispatch reminder: ' + err.message, 'error');
    } finally {
      setSendingId(null);
    }
  };

  const handleToggle = async (requestId: string) => {
    try {
      const res = await api.toggleReminders(requestId);
      showToast(`Reminders ${res.remindersPaused ? 'paused' : 'resumed'}`);
      loadReminders();
    } catch (err: any) {
      showToast('Failed to toggle reminders: ' + err.message, 'error');
    }
  };

  const handleExecuteBulkSend = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkSending(true);
    try {
      const res = await api.bulkSendReminders(Array.from(selectedIds), respectFrequency);
      if (res.sentCount > 0) {
        showToast(
          `Successfully dispatched ${res.sentCount} personalized reminder${res.sentCount > 1 ? 's' : ''}${
            res.skippedCount > 0 ? ` (${res.skippedCount} skipped)` : ''
          }`,
          'success'
        );
      } else {
        showToast(
          `No reminders sent. ${res.skippedCount} request${res.skippedCount > 1 ? 's were' : ' was'} skipped (not due or limits reached).`,
          'info'
        );
      }
      setIsBulkModalOpen(false);
      setSelectedIds(new Set());
      loadReminders();
    } catch (err: any) {
      showToast('Bulk send failed: ' + err.message, 'error');
    } finally {
      setIsBulkSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Automated Chaser Queue</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Monitor clients requiring attention, configure cadences, and trigger targeted bulk chasers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Reminders ({selectedIds.size})</span>
            </button>
          )}

          <button
            onClick={handleRunBatch}
            disabled={isRunningBatch}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningBatch ? 'animate-spin' : ''}`} />
            <span>{isRunningBatch ? 'Checking Queue...' : 'Run Automated Chaser'}</span>
          </button>

          <button
            onClick={loadReminders}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            title="Refresh queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Provider Status & Queue Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/90 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <div className="text-slate-500 text-[11px] font-medium">Notification Engine</div>
            <div className="font-semibold text-slate-900 truncate max-w-[200px]" title={providerName}>
              {providerName}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/90 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <div className="text-slate-500 text-[11px] font-medium">Actionable Clients</div>
            <div className="font-semibold text-slate-900">
              {queue.filter(q => q.missingCount > 0).length} client requests outstanding
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/90 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <div className="text-slate-500 text-[11px] font-medium">Idempotency & Isolation</div>
            <div className="font-semibold text-slate-900">
              Zero generic spam &middot; Strict tenant safety
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('queue')}
            className={`pb-2.5 px-3 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'queue'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Active Chaser Queue ({queue.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'history'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Sent Reminders Log ({history.length})
          </button>
        </div>

        {activeTab === 'queue' && eligibleItems.length > 0 && (
          <div className="pb-2.5 flex items-center gap-3 text-xs">
            <button
              onClick={handleSelectAllEligible}
              className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              {selectedIds.size === eligibleItems.length && eligibleItems.length > 0 ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                  <span>Select All Eligible ({eligibleItems.length})</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Bulk Selection Floating Bar */}
      {activeTab === 'queue' && selectedIds.size > 0 && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>{selectedIds.size} request{selectedIds.size > 1 ? 's' : ''}</strong> selected across{' '}
              <strong>{uniqueClientsCount} unique client{uniqueClientsCount > 1 ? 's' : ''}</strong>.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleClearSelection}
              className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Reminders</span>
            </button>
          </div>
        </div>
      )}

      {/* Queue Table */}
      {activeTab === 'queue' ? (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 font-medium">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-2.5 px-3">Client</th>
                  <th className="py-2.5 px-3">Request</th>
                  <th className="py-2.5 px-3">Missing Documents</th>
                  <th className="py-2.5 px-3">Days Outstanding</th>
                  <th className="py-2.5 px-3">Last Reminder</th>
                  <th className="py-2.5 px-3">Next Reminder</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      No active requests currently in the chasing queue.
                    </td>
                  </tr>
                ) : (
                  queue.map(item => {
                    const isSelected = selectedIds.has(item.requestId);
                    const isEligible = isRequestEligible(item);

                    return (
                      <tr
                        key={item.requestId}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isSelected ? 'bg-emerald-50/30' : ''
                        }`}
                      >
                        {/* Checkbox column */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isEligible}
                            onChange={() => handleToggleSelect(item.requestId)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 disabled:opacity-30 cursor-pointer"
                            title={isEligible ? 'Select request for bulk chasing' : `Not eligible (${item.status})`}
                          />
                        </td>

                        {/* Client Column */}
                        <td className="py-3 px-3 font-semibold text-slate-900">
                          <div>{item.companyName}</div>
                          <div className="text-[11px] font-normal text-slate-400">
                            {item.clientName} &middot; {item.clientEmail}
                          </div>
                        </td>

                        {/* Request Column */}
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800">{item.requestName}</div>
                          {item.period && (
                            <div className="text-[11px] text-slate-400 font-mono">{item.period}</div>
                          )}
                        </td>

                        {/* Missing Documents Column */}
                        <td className="py-3 px-3">
                          <span
                            className={`font-mono tabular-nums font-semibold px-2 py-0.5 rounded text-[11px] ${
                              item.missingCount > 0
                                ? 'text-amber-700 bg-amber-50 border border-amber-200/60'
                                : 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                            }`}
                          >
                            {item.missingCount} missing
                          </span>
                          <div className="text-[10px] text-slate-500 mt-1 max-w-xs truncate" title={item.missingDocNames.join(', ')}>
                            {item.missingDocNames.length > 0 ? item.missingDocNames.join(', ') : 'All approved'}
                          </div>
                        </td>

                        {/* Days Outstanding Column */}
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          <div>
                            <strong>{item.daysOutstanding}</strong> day{item.daysOutstanding === 1 ? '' : 's'}
                          </div>
                          {item.isPastDue && item.daysOverdue && item.daysOverdue > 0 && (
                            <div className="text-[10px] text-rose-600 font-medium">
                              {item.daysOverdue}d overdue
                            </div>
                          )}
                        </td>

                        {/* Last Reminder Column */}
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {item.lastReminder ? (
                            new Date(item.lastReminder).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                          ) : (
                            <span className="text-slate-400">Not sent yet</span>
                          )}
                        </td>

                        {/* Next Reminder Column */}
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {item.remindersPaused ? (
                            <span className="text-slate-400 italic">Paused</span>
                          ) : item.isDue ? (
                            <span className="text-emerald-600 font-semibold">Due now</span>
                          ) : (
                            new Date(item.nextReminder).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                          )}
                        </td>

                        {/* Status Column */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              item.status === 'Due Now'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.status === 'Overdue'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : item.status === 'Paused'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : item.status === 'Max Reached'
                                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            <span>{item.status}</span>
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 pl-2">
                            {item.reminderCount} / {item.maxReminders >= 999 || item.maxReminders <= 0 ? '\u221E' : item.maxReminders} sent
                          </div>
                        </td>

                        {/* Actions Column */}
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleToggle(item.requestId)}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors inline-flex items-center gap-1"
                          >
                            {item.remindersPaused ? <Play className="w-3 h-3 text-emerald-600" /> : <Pause className="w-3 h-3 text-amber-600" />}
                            <span>{item.remindersPaused ? 'Resume' : 'Pause'}</span>
                          </button>

                          <button
                            onClick={() => handleSendNow(item.requestId, item.companyName)}
                            disabled={sendingId === item.requestId || item.remindersPaused}
                            className="px-2.5 py-1 text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors inline-flex items-center gap-1 disabled:opacity-40"
                          >
                            <Send className="w-3 h-3" />
                            <span>{sendingId === item.requestId ? 'Sending...' : 'Send Now'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Sent Reminders History Log */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {history.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No reminders sent in history.
              </div>
            ) : (
              history.map(rem => (
                <div key={rem.id} className="p-4 hover:bg-slate-50/70 transition-colors text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                      {rem.reminderNumber !== undefined && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          #{rem.reminderNumber}
                        </span>
                      )}
                      <span>{rem.subject}</span>
                      <span className="text-[10px] font-normal text-slate-500 uppercase px-1.5 py-0.5 bg-slate-100 rounded">
                        {rem.triggerType}
                      </span>
                      {rem.deliveryStatus && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          rem.deliveryStatus === 'simulated'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : rem.deliveryStatus === 'delivered' || rem.deliveryStatus === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {rem.deliveryStatus}
                        </span>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-slate-500 text-[11px]">
                      {new Date(rem.sentAt).toLocaleString('en-GB')}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-4">
                    <span>
                      Recipient: <strong className="text-slate-800">{rem.recipientName}</strong> &lt;{rem.recipientEmail}&gt;
                    </span>
                    {rem.missingDocuments && rem.missingDocuments.length > 0 && (
                      <span>
                        Missing ({rem.missingDocuments.length}):{' '}
                        <strong className="text-slate-700">{rem.missingDocuments.join(', ')}</strong>
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-700 bg-slate-50 p-3 rounded border border-slate-200/60 font-mono whitespace-pre-wrap">
                    {rem.body}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Bulk Chasing */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Confirm Bulk Chaser Dispatch</h3>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Core User Confirmation Sentence */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
              <p className="text-sm font-bold text-emerald-900">
                You are about to send {selectedItems.length} reminder{selectedItems.length > 1 ? 's' : ''} to {uniqueClientsCount} client{uniqueClientsCount > 1 ? 's' : ''}.
              </p>
              <p className="text-slate-600 text-xs">
                Each reminder will be generated <strong>individually</strong> containing only the documents actually missing for that specific request. No generic messages will be sent.
              </p>
            </div>

            {/* List of Targeted Requests & Their Individual Missing Documents */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Recipients &amp; Specific Missing Documents:
              </div>
              <div className="space-y-2">
                {selectedItems.map(item => (
                  <div key={item.requestId} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>{item.companyName} &mdash; <span className="font-normal text-slate-600">{item.requestName}</span></span>
                      <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-mono">
                        {item.missingCount} missing
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Missing items: <strong className="text-slate-700">{item.missingDocNames.join(', ')}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Frequency Respect Guard */}
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={respectFrequency}
                onChange={e => setRespectFrequency(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <div className="text-xs">
                <span className="font-semibold text-slate-800 block">Respect reminder frequency rules</span>
                <span className="text-slate-500 text-[11px]">
                  Only dispatch reminders to requests whose reminder interval is currently due. Requests not yet due will be skipped.
                </span>
              </div>
            </label>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                disabled={isBulkSending}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkSend}
                disabled={isBulkSending}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isBulkSending ? 'Sending Reminders...' : `Confirm & Send ${selectedItems.length} Reminders`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
