import React, { useState, useEffect } from 'react';
import {
  Repeat,
  Plus,
  Play,
  Pause,
  StopCircle,
  Edit2,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  ArrowRight,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { RecurringSchedule, Client, Template, RecurringFrequency, RecurringScheduleStatus } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { NewRecurringScheduleModal } from '../components/NewRecurringScheduleModal';

interface RecurringViewProps {
  onOpenRequest?: (requestId: string) => void;
  onOpenClient?: (clientId: string) => void;
}

export const RecurringView: React.FC<RecurringViewProps> = ({ onOpenRequest, onOpenClient }) => {
  const { showToast } = useToast();

  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedFrequency, setSelectedFrequency] = useState<string>('All');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scheduleToEdit, setScheduleToEdit] = useState<RecurringSchedule | null>(null);
  const [isProcessingDue, setIsProcessingDue] = useState(false);
  const [generatingScheduleId, setGeneratingScheduleId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [schedulesData, clientsData, templatesData] = await Promise.all([
        api.getRecurringSchedules(),
        api.getClients(),
        api.getTemplates(),
      ]);
      setSchedules(schedulesData);
      setClients(clientsData);
      setTemplates(templatesData);
    } catch (err: any) {
      showToast(err.message || 'Failed to load recurring schedules', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePauseResume = async (schedule: RecurringSchedule) => {
    try {
      if (schedule.status === 'Active') {
        const res = await api.pauseRecurringSchedule(schedule.id);
        showToast(`Paused recurring schedule "${schedule.name}"`, 'info');
      } else {
        const res = await api.resumeRecurringSchedule(schedule.id);
        showToast(`Resumed recurring schedule "${schedule.name}"`, 'success');
      }
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error');
    }
  };

  const handleStop = async (schedule: RecurringSchedule) => {
    if (!window.confirm(`Stop recurring schedule for "${schedule.name}"? No further periods will be generated.`)) {
      return;
    }
    try {
      await api.stopRecurringSchedule(schedule.id);
      showToast(`Stopped recurring schedule "${schedule.name}"`, 'info');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to stop schedule', 'error');
    }
  };

  const handleDelete = async (schedule: RecurringSchedule) => {
    if (!window.confirm(`Delete recurring schedule "${schedule.name}"? Past generated requests will remain safe.`)) {
      return;
    }
    try {
      await api.deleteRecurringSchedule(schedule.id);
      showToast(`Deleted recurring schedule "${schedule.name}"`, 'success');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete schedule', 'error');
    }
  };

  const handleGenerateNow = async (schedule: RecurringSchedule) => {
    setGeneratingScheduleId(schedule.id);
    try {
      const res = await api.generateNowRecurringSchedule(schedule.id);
      showToast(res.message, 'success');
      loadData();
      if (res.request && onOpenRequest) {
        onOpenRequest(res.request.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to generate request', 'error');
    } finally {
      setGeneratingScheduleId(null);
    }
  };

  const handleRunDueSchedules = async () => {
    setIsProcessingDue(true);
    try {
      const res = await api.runDueRecurringSchedules();
      if (res.generatedCount > 0) {
        showToast(`Processed schedules: Generated ${res.generatedCount} due requests`, 'success');
      } else {
        showToast('All active schedules are currently up-to-date. No periods were due.', 'info');
      }
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to process due schedules', 'error');
    } finally {
      setIsProcessingDue(false);
    }
  };

  const filteredSchedules = schedules.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.companyName || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.templateName || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus = selectedStatus === 'All' || s.status === selectedStatus;
    const matchesFreq = selectedFrequency === 'All' || s.frequency === selectedFrequency;

    return matchesSearch && matchesStatus && matchesFreq;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Recurring Document Requests</h1>
              <p className="text-sm text-slate-500">
                Automate repeating client document requests for monthly bookkeeping, quarterly VAT, and annual accounts
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleRunDueSchedules}
            disabled={isProcessingDue}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 shadow-sm transition-all flex items-center space-x-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${isProcessingDue ? 'animate-spin' : ''}`} />
            <span>{isProcessingDue ? 'Checking...' : 'Run Due Schedules'}</span>
          </button>

          <button
            onClick={() => {
              setScheduleToEdit(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Recurring Schedule</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search client, schedule, template..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl">
            {['All', 'Active', 'Paused', 'Stopped'].map(st => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedStatus === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Frequency Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl">
            {['All', 'Monthly', 'Quarterly', 'Annual'].map(freq => (
              <button
                key={freq}
                onClick={() => setSelectedFrequency(freq)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedFrequency === freq
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {freq}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Schedules List */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-400">Loading recurring schedules...</div>
      ) : filteredSchedules.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <Repeat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No recurring schedules found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
            Set up automatic repeating document requests for regular client workflows like Monthly Bookkeeping or VAT returns.
          </p>
          <button
            onClick={() => {
              setScheduleToEdit(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-all inline-flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Schedule</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredSchedules.map(schedule => {
            const isPaused = schedule.status === 'Paused';
            const isStopped = schedule.status === 'Stopped';
            const isActive = schedule.status === 'Active';

            return (
              <div
                key={schedule.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden hover:border-slate-300 transition-all"
              >
                {/* Header */}
                <div className="p-6 border-b border-slate-100">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight">{schedule.name}</h2>

                        {/* Frequency Badge */}
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          {schedule.frequency}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isPaused
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {schedule.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                        <span>
                          Client:{' '}
                          <button
                            onClick={() => onOpenClient && onOpenClient(schedule.clientId)}
                            className="font-semibold text-slate-700 hover:text-emerald-600 hover:underline"
                          >
                            {schedule.companyName}
                          </button>
                        </span>
                        <span>•</span>
                        <span>
                          Template: <span className="font-medium text-slate-700">{schedule.templateName}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Next scheduled run:{' '}
                            <strong className="text-slate-800">{schedule.nextOccurrence}</strong>
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleGenerateNow(schedule)}
                        disabled={generatingScheduleId === schedule.id}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-all shadow-xs flex items-center space-x-1.5 disabled:opacity-50"
                        title="Generate the next request immediately"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          {generatingScheduleId === schedule.id ? 'Generating...' : 'Generate Next Now'}
                        </span>
                      </button>

                      <button
                        onClick={() => handlePauseResume(schedule)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                          isPaused
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                        title={isPaused ? 'Resume schedule' : 'Pause schedule'}
                      >
                        {isPaused ? (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Resume</span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>Pause</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setScheduleToEdit(schedule);
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                        title="Edit schedule"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {!isStopped && (
                        <button
                          onClick={() => handleStop(schedule)}
                          className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Stop recurring schedule"
                        >
                          <StopCircle className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(schedule)}
                        className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete schedule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Period Breakdown Timeline (Directly matching user prompt requirement) */}
                <div className="p-6 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Period Schedule & Execution History
                    </span>
                    <span className="text-xs text-slate-500">
                      Duplicate prevention enforced • Timing rules applied
                    </span>
                  </div>

                  {schedule.periodHistory && schedule.periodHistory.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {schedule.periodHistory.map((periodItem, idx) => {
                        const isComplete = periodItem.status === 'Complete';
                        const isWaiting = periodItem.status === 'Waiting';
                        const isNotStarted = periodItem.status === 'Not started';
                        const isOverdue = periodItem.status === 'Overdue';

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              if (periodItem.requestId && onOpenRequest) {
                                onOpenRequest(periodItem.requestId);
                              }
                            }}
                            className={`p-3.5 rounded-xl border transition-all ${
                              periodItem.requestId ? 'cursor-pointer hover:shadow-xs' : ''
                            } ${
                              isComplete
                                ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900'
                                : isWaiting
                                ? 'bg-blue-50/70 border-blue-200/80 text-blue-900'
                                : isOverdue
                                ? 'bg-rose-50/70 border-rose-200/80 text-rose-900'
                                : 'bg-white border-slate-200/70 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold tracking-tight">{periodItem.period}</span>
                              {isComplete && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                              {isWaiting && <Clock className="w-4 h-4 text-blue-600" />}
                              {isOverdue && <AlertCircle className="w-4 h-4 text-rose-600" />}
                              {isNotStarted && (
                                <span className="w-2 h-2 rounded-full bg-slate-300 ring-2 ring-slate-100" />
                              )}
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span
                                className={`font-semibold ${
                                  isComplete
                                    ? 'text-emerald-700'
                                    : isWaiting
                                    ? 'text-blue-700'
                                    : isOverdue
                                    ? 'text-rose-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                {periodItem.status === 'Complete' && '— Complete'}
                                {periodItem.status === 'Waiting' && '— Waiting'}
                                {periodItem.status === 'Overdue' && '— Overdue'}
                                {periodItem.status === 'Not started' && '— Not started'}
                              </span>

                              {periodItem.requestId && (
                                <span className="text-slate-400 hover:text-slate-600 flex items-center">
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>

                            {periodItem.dueDate && (
                              <div className="mt-1 pt-1 border-t border-slate-200/50 text-[10px] text-slate-500">
                                Due: {periodItem.dueDate}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">No execution history recorded yet.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for creating or editing recurring schedule */}
      <NewRecurringScheduleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        clients={clients}
        templates={templates}
        scheduleToEdit={scheduleToEdit}
        onSaved={() => {
          loadData();
        }}
      />
    </div>
  );
};
