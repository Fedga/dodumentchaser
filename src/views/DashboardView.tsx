import React, { useState, useEffect } from 'react';
import {
  Users,
  FileCheck2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Send,
  ChevronRight,
  RefreshCw,
  Plus,
  FileText,
  Sparkles,
  UserCheck,
  Info,
  Sliders,
  Check,
  HelpCircle
} from 'lucide-react';
import { DashboardStats, DocumentRequest, ActivityLog, Client } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface DashboardViewProps {
  onOpenRequest: (requestId: string) => void;
  onOpenClient: (clientId: string) => void;
  onNewRequest: () => void;
  onViewAllRequests: () => void;
  onOpenPortalDemo: () => void;
  onNavigateToView?: (
    view: 'clients' | 'requests' | 'reminders' | 'documents',
    filter?: { status?: string; tab?: 'queue' | 'history' }
  ) => void;
}

interface MetricCardProps {
  title: string;
  value: number | string | undefined;
  subtitle: string;
  icon: React.ReactNode;
  theme: 'slate' | 'blue' | 'amber' | 'emerald' | 'rose' | 'indigo' | 'teal' | 'violet';
  filterHint: string;
  onClick?: () => void;
  isLoading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  theme,
  filterHint,
  onClick,
  isLoading,
}) => {
  const getThemeClasses = () => {
    switch (theme) {
      case 'amber':
        return {
          container: 'bg-amber-50/70 border-amber-200/90 hover:border-amber-400 hover:bg-amber-50/90 hover:shadow-xs ring-1 ring-amber-200/50',
          title: 'text-amber-950 font-bold',
          iconWrapper: 'bg-amber-100/90 text-amber-800 border border-amber-200/80',
          number: 'text-amber-900',
          subtitle: 'text-amber-800/80',
          borderDivider: 'border-amber-200/60',
          footer: 'text-amber-700/80 group-hover:text-amber-900',
        };
      case 'rose':
        return {
          container: 'bg-white border-rose-200 hover:border-rose-400 hover:shadow-xs',
          title: 'text-rose-900 font-semibold',
          iconWrapper: 'bg-rose-50 text-rose-600 border border-rose-100',
          number: 'text-rose-600',
          subtitle: 'text-rose-600/80',
          borderDivider: 'border-rose-100',
          footer: 'text-rose-500 group-hover:text-rose-700',
        };
      case 'emerald':
        return {
          container: 'bg-white border-emerald-200 hover:border-emerald-400 hover:shadow-xs',
          title: 'text-slate-800 font-semibold',
          iconWrapper: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
          number: 'text-emerald-700',
          subtitle: 'text-emerald-600/90',
          borderDivider: 'border-emerald-100/80',
          footer: 'text-emerald-600 group-hover:text-emerald-800',
        };
      case 'blue':
        return {
          container: 'bg-white border-blue-200/80 hover:border-blue-400 hover:shadow-xs',
          title: 'text-slate-800 font-semibold',
          iconWrapper: 'bg-blue-50 text-blue-600 border border-blue-100',
          number: 'text-blue-900',
          subtitle: 'text-blue-600/90',
          borderDivider: 'border-blue-100/80',
          footer: 'text-blue-600 group-hover:text-blue-800',
        };
      case 'indigo':
        return {
          container: 'bg-white border-indigo-200/80 hover:border-indigo-400 hover:shadow-xs',
          title: 'text-slate-800 font-semibold',
          iconWrapper: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
          number: 'text-indigo-900',
          subtitle: 'text-indigo-600/90',
          borderDivider: 'border-indigo-100/80',
          footer: 'text-indigo-600 group-hover:text-indigo-800',
        };
      case 'teal':
        return {
          container: 'bg-white border-teal-200/80 hover:border-teal-400 hover:shadow-xs',
          title: 'text-slate-800 font-semibold',
          iconWrapper: 'bg-teal-50 text-teal-600 border border-teal-100',
          number: 'text-teal-900',
          subtitle: 'text-teal-600/90',
          borderDivider: 'border-teal-100/80',
          footer: 'text-teal-600 group-hover:text-teal-800',
        };
      case 'violet':
        return {
          container: 'bg-white border-violet-200/80 hover:border-violet-400 hover:shadow-xs',
          title: 'text-slate-800 font-semibold',
          iconWrapper: 'bg-violet-50 text-violet-600 border border-violet-100',
          number: 'text-violet-900',
          subtitle: 'text-violet-600/90',
          borderDivider: 'border-violet-100/80',
          footer: 'text-violet-600 group-hover:text-violet-800',
        };
      case 'slate':
      default:
        return {
          container: 'bg-white border-slate-200/90 hover:border-slate-400 hover:shadow-xs',
          title: 'text-slate-800 font-semibold',
          iconWrapper: 'bg-slate-100 text-slate-600 border border-slate-200/60',
          number: 'text-slate-900',
          subtitle: 'text-slate-500',
          borderDivider: 'border-slate-100',
          footer: 'text-slate-500 group-hover:text-slate-900',
        };
    }
  };

  const c = getThemeClasses();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={`${title}: ${value ?? 0}. Click to view filtered list.`}
      className={`p-4 rounded-xl border shadow-2xs transition-all duration-150 cursor-pointer group flex flex-col justify-between select-none ${c.container}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs ${c.title}`}>
            {title}
          </span>
          <div className={`p-1.5 rounded-lg shrink-0 ${c.iconWrapper}`}>
            {icon}
          </div>
        </div>
        <div className={`mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight ${c.number}`}>
          {isLoading ? (
            <span className="inline-block w-12 h-7 bg-slate-200/70 rounded animate-pulse" />
          ) : (
            value ?? 0
          )}
        </div>
        <div className={`mt-1 text-[11px] font-medium leading-tight ${c.subtitle}`}>
          {subtitle}
        </div>
      </div>

      <div className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] font-medium transition-colors ${c.borderDivider} ${c.footer}`}>
        <span className="truncate">{filterHint}</span>
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform shrink-0 ml-1" />
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenRequest,
  onOpenClient,
  onNewRequest,
  onViewAllRequests,
  onNavigateToView,
}) => {
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  // Chasing Insights Settings State
  const [showMethodologyTooltip, setShowMethodologyTooltip] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState('');
  const [isUpdatingEstimate, setIsUpdatingEstimate] = useState(false);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [statsData, requestsData, activityData, clientsData] = await Promise.all([
        api.getStats(),
        api.getRequests(),
        api.getActivity(),
        api.getClients(),
      ]);
      setStats(statsData);
      setRequests(requestsData);
      setActivities(activityData);
      setClients(clientsData);
      if (statsData.configuredMinutesPerDocument) {
        setCustomMinutesInput(String(statsData.configuredMinutesPerDocument));
      }
    } catch (err: any) {
      showToast('Failed to load dashboard: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleUpdateMinutes = async (minutes: number) => {
    if (minutes < 1 || minutes > 120) {
      showToast('Please enter a value between 1 and 120 minutes', 'error');
      return;
    }
    setIsUpdatingEstimate(true);
    try {
      await api.updateChasingEstimate(minutes);
      showToast(`Estimated manual chasing baseline set to ${minutes} min/doc`);
      setCustomMinutesInput(String(minutes));
      // Refresh stats to recalculate dynamically from real database state
      const updated = await api.getStats();
      setStats(updated);
    } catch (err: any) {
      showToast('Failed to update estimate baseline: ' + err.message, 'error');
    } finally {
      setIsUpdatingEstimate(false);
    }
  };

  const handleSaveCustomMinutes = () => {
    const parsed = parseInt(customMinutesInput, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 120) {
      showToast('Please enter a valid number of minutes between 1 and 120', 'error');
      return;
    }
    handleUpdateMinutes(parsed);
  };

  const handleSendQuickReminder = async (e: React.MouseEvent, req: DocumentRequest) => {
    e.stopPropagation();
    setSendingReminderId(req.id);
    try {
      await api.sendReminder(req.id);
      showToast(`Reminder sent to ${req.clientName || 'client'}`);
      loadDashboardData();
    } catch (err: any) {
      showToast('Reminder failed: ' + err.message, 'error');
    } finally {
      setSendingReminderId(null);
    }
  };

  // Outstanding requests with missing documents
  const outstandingRequests = requests.filter(r => (r.status === 'Active' || r.status === 'Overdue') && (r.stats?.missingCount || 0) > 0);

  // Clients needing attention: Overdue or with high missing documents
  const clientsNeedingAttention = clients
    .filter(c => (c.missingDocumentsCount || 0) > 0 || requests.some(r => r.clientId === c.id && r.status === 'Overdue'))
    .slice(0, 4);

  const configuredMinutes = stats?.configuredMinutesPerDocument ?? 5;
  const estimatedHours = stats?.estimatedHoursSaved ?? 0;
  const resolvedInteractions = stats?.automaticallyResolvedInteractions ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-7">
      {/* Top Banner / Key Problem Statement */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Stop chasing clients for documents.
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Live overview of missing statements, overdue requests, and automated chasing status for your practice.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadDashboardData}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onNewRequest}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Document Request</span>
          </button>
        </div>
      </div>

      {/* METRICS SECTION 1: Core Practice Status & Outstanding Workload */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Practice Pipeline & Workload
          </h2>
          <span className="text-[11px] text-slate-400">
            Click any metric to filter requests or clients
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
          {/* 1. Total Active Clients */}
          <MetricCard
            title="Total Active Clients"
            value={stats?.totalActiveClients ?? stats?.totalClients}
            subtitle="Active billing entities"
            icon={<Users className="w-4 h-4" />}
            theme="slate"
            filterHint="View active clients"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('clients', { status: 'Active' })}
          />

          {/* 2. Outstanding Requests */}
          <MetricCard
            title="Outstanding Requests"
            value={stats?.outstandingRequests}
            subtitle="In progress & awaiting docs"
            icon={<FileCheck2 className="w-4 h-4" />}
            theme="blue"
            filterHint="View active requests"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('requests', { status: 'Active' })}
          />

          {/* 3. Documents Awaiting Client (Hero Highlight Metric) */}
          <MetricCard
            title="Documents Awaiting Client"
            value={stats?.documentsAwaitingClient}
            subtitle="Pending client upload"
            icon={<Clock className="w-4 h-4" />}
            theme="amber"
            filterHint="View missing requests"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('requests', { status: 'Missing' })}
          />

          {/* 4. Completed This Month */}
          <MetricCard
            title="Completed This Month"
            value={stats?.completedThisMonth}
            subtitle="100% reconciled this month"
            icon={<CheckCircle2 className="w-4 h-4" />}
            theme="emerald"
            filterHint="View completed"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('requests', { status: 'Completed' })}
          />

          {/* 5. Overdue Requests */}
          <div className="col-span-2 md:col-span-1">
            <MetricCard
              title="Overdue Requests"
              value={stats?.overdueRequests}
              subtitle="Past filing deadline"
              icon={<AlertTriangle className="w-4 h-4" />}
              theme="rose"
              filterHint="View overdue requests"
              isLoading={isLoading}
              onClick={() => onNavigateToView?.('requests', { status: 'Overdue' })}
            />
          </div>
        </div>
      </div>

      {/* METRICS SECTION 2: Automated Chasing & Monthly Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Automated Chasing & Monthly Activity
          </h2>
          <span className="text-[11px] text-slate-400">
            Real-time monthly throughput and chaser engine state
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {/* 6. Documents Collected This Month */}
          <MetricCard
            title="Documents Collected This Month"
            value={stats?.documentsCollectedThisMonth}
            subtitle="Files received & verified"
            icon={<FileText className="w-4 h-4" />}
            theme="indigo"
            filterHint="Open document archive"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('documents', { status: 'All' })}
          />

          {/* 7. Requests Completed This Month */}
          <MetricCard
            title="Requests Completed This Month"
            value={stats?.requestsCompletedThisMonth}
            subtitle="Full document packs closed"
            icon={<Sparkles className="w-4 h-4" />}
            theme="teal"
            filterHint="View completed requests"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('requests', { status: 'Completed' })}
          />

          {/* 8. Automated Reminders Sent */}
          <MetricCard
            title="Automated Reminders Sent"
            value={stats?.automatedRemindersSent}
            subtitle="Total chasers logged"
            icon={<Send className="w-4 h-4" />}
            theme="violet"
            filterHint="View reminder audit log"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('reminders', { tab: 'history' })}
          />

          {/* 9. Clients Currently Being Chased */}
          <MetricCard
            title="Clients Currently Being Chased"
            value={stats?.clientsCurrentlyBeingChased}
            subtitle="Active in chasing queue"
            icon={<UserCheck className="w-4 h-4" />}
            theme="amber"
            filterHint="Open chasing queue"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('reminders', { tab: 'queue' })}
          />
        </div>
      </div>

      {/* METRICS SECTION 3: CHASING INSIGHTS */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Chasing Insights</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                Practice Analytics
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Factual turnaround metrics and estimated manual chasing time avoided through automation.
            </p>
          </div>
        </div>

        {/* Featured Estimated Time Saved Card */}
        <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-sm relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 relative z-10">
            {/* Left: Headline & Number */}
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Manual Chasing Time Avoided
                </span>
                {/* Clearly labeled as an ESTIMATE */}
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  ESTIMATE
                </span>

                {/* Tooltip trigger */}
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setShowMethodologyTooltip(!showMethodologyTooltip)}
                    onMouseEnter={() => setShowMethodologyTooltip(true)}
                    onMouseLeave={() => setShowMethodologyTooltip(false)}
                    aria-label="View calculation methodology for estimated time saved"
                    className="p-1 text-slate-400 hover:text-white rounded-full transition-colors focus:outline-none"
                  >
                    <Info className="w-4 h-4 text-slate-400 hover:text-amber-300" />
                  </button>

                  {/* Tooltip Popover */}
                  {showMethodologyTooltip && (
                    <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-80 sm:w-96 p-4 bg-slate-950 text-slate-100 text-xs rounded-xl shadow-2xl border border-slate-700/80 z-50 animate-in fade-in zoom-in-95">
                      <div className="font-bold text-white text-sm">
                        Estimated time saved: {estimatedHours} hours
                      </div>
                      <div className="text-amber-300/90 text-xs mt-0.5">
                        Based on your configured estimate of {configuredMinutes} minutes per document interaction.
                      </div>

                      <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Resolved document interactions:</span>
                          <span className="font-mono font-semibold text-white">{resolvedInteractions} documents</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Configured manual effort baseline:</span>
                          <span className="font-mono font-semibold text-white">{configuredMinutes} mins / document</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-800/80">
                          <span className="text-slate-400">Calculation:</span>
                          <span className="font-mono font-bold text-amber-300">
                            {resolvedInteractions} × {configuredMinutes}m = {stats?.estimatedMinutesSaved ?? 0} mins (~{estimatedHours}h)
                          </span>
                        </div>

                        {/* Explicit disclaimer as instructed */}
                        <div className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-800 leading-normal">
                          Methodology Notice: This models administrative follow-up time avoided via automatic request chasers. It is not presented as measured employee productivity.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-3xl sm:text-4xl font-bold font-mono text-white tracking-tight tabular-nums flex items-baseline gap-2">
                <span>{isLoading ? '—' : `${estimatedHours} hours`}</span>
                <span className="text-xs font-normal text-slate-400 font-sans">
                  ({stats?.estimatedMinutesSaved ?? 0} total minutes)
                </span>
              </div>

              <p className="text-xs text-slate-300 max-w-lg">
                Estimated follow-up time saved based on{' '}
                <span className="font-semibold text-white font-mono">{resolvedInteractions}</span>{' '}
                automatically resolved missing-document interactions.
              </p>
            </div>

            {/* Right: Interactive Configuration Controls */}
            <div className="bg-slate-800/70 p-3.5 rounded-lg border border-slate-700/80 text-xs space-y-2.5 shrink-0 w-full md:w-auto md:min-w-[280px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Configure Baseline</span>
                </span>
                <span className="font-mono text-amber-300 font-bold text-xs">
                  {configuredMinutes} min/doc
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {[3, 5, 10, 15].map(m => (
                  <button
                    key={m}
                    type="button"
                    disabled={isUpdatingEstimate}
                    onClick={() => handleUpdateMinutes(m)}
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                      configuredMinutes === m
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                        : 'bg-slate-700/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-600/70'
                    }`}
                  >
                    {m}m{m === 5 ? '*' : ''}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={customMinutesInput}
                    onChange={e => setCustomMinutesInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomMinutes(); }}
                    className="w-full bg-slate-900 border border-slate-600 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                    placeholder="Custom mins"
                    aria-label="Custom minutes normally spent manually chasing one missing document"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                    min
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveCustomMinutes}
                  disabled={isUpdatingEstimate}
                  className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold rounded text-xs transition-colors shadow-xs"
                >
                  Save
                </button>
              </div>

              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Default: 5 mins (*marked)</span>
                <span>Max: 120 mins</span>
              </div>
            </div>
          </div>
        </div>

        {/* 5 Factual Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
          {/* Factual 1: Reminders Sent */}
          <MetricCard
            title="Reminders Sent"
            value={stats?.remindersSent}
            subtitle="Total chasers dispatched"
            icon={<Send className="w-4 h-4" />}
            theme="violet"
            filterHint="View reminder log"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('reminders', { tab: 'history' })}
          />

          {/* Factual 2: Documents Collected */}
          <MetricCard
            title="Documents Collected"
            value={stats?.documentsCollected}
            subtitle="Uploaded & approved"
            icon={<FileText className="w-4 h-4" />}
            theme="indigo"
            filterHint="Open file archive"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('documents', { status: 'All' })}
          />

          {/* Factual 3: Requests Completed */}
          <MetricCard
            title="Requests Completed"
            value={stats?.requestsCompleted}
            subtitle="Total packs reconciled"
            icon={<CheckCircle2 className="w-4 h-4" />}
            theme="emerald"
            filterHint="View completed"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('requests', { status: 'Completed' })}
          />

          {/* Factual 4: Average Request Completion Time */}
          <MetricCard
            title="Avg Completion Time"
            value={stats?.averageRequestCompletionTime ?? '—'}
            subtitle="Creation to completion"
            icon={<Clock className="w-4 h-4" />}
            theme="blue"
            filterHint="View requests"
            isLoading={isLoading}
            onClick={() => onNavigateToView?.('requests', { status: 'Completed' })}
          />

          {/* Factual 5: Average Reminders per Completed Request */}
          <div className="col-span-2 md:col-span-1">
            <MetricCard
              title="Avg Reminders / Request"
              value={stats?.averageRemindersPerCompletedRequest !== undefined ? `${stats.averageRemindersPerCompletedRequest}` : '0'}
              subtitle="Per completed request"
              icon={<Sparkles className="w-4 h-4" />}
              theme="amber"
              filterHint="Open chaser queue"
              isLoading={isLoading}
              onClick={() => onNavigateToView?.('reminders', { tab: 'queue' })}
            />
          </div>
        </div>
      </div>

      {/* Main Content: Outstanding Documents Table & Sidebar Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Outstanding Documents Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col overflow-hidden">
          <div className="p-4 sm:px-6 border-b border-slate-200/90 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Outstanding Documents Queue</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every request with documents pending client upload.
              </p>
            </div>
            <button
              onClick={onViewAllRequests}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1"
            >
              <span>View all ({requests.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 font-medium">
                <tr>
                  <th className="py-2.5 px-4">Client</th>
                  <th className="py-2.5 px-3">Request</th>
                  <th className="py-2.5 px-3">Missing</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Last Reminder</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outstandingRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      No outstanding documents pending! All clients are up to date.
                    </td>
                  </tr>
                ) : (
                  outstandingRequests.map(r => {
                    const isOverdue = r.status === 'Overdue';
                    return (
                      <tr
                        key={r.id}
                        onClick={() => onOpenRequest(r.id)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <div>{r.companyName}</div>
                          <div className="text-[11px] font-normal text-slate-400">{r.clientName}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-medium text-slate-800">{r.name}</span>
                          <div className="text-[11px] text-slate-400">{r.period}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono tabular-nums font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px] border border-amber-200/60">
                            {r.stats?.missingCount || 0} documents
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {r.dueDate}
                        </td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {r.lastReminderSentAt ? (
                            <span className="text-[11px]">
                              {new Date(r.lastReminderSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Not sent yet</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {isOverdue ? (
                            <span className="text-[11px] font-semibold text-rose-600">Overdue</span>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-600">Waiting</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={e => handleSendQuickReminder(e, r)}
                            disabled={sendingReminderId === r.id}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors inline-flex items-center gap-1"
                            title="Send chasing reminder email now"
                          >
                            <Send className="w-3 h-3 text-slate-500" />
                            <span>Remind</span>
                          </button>
                          <button
                            onClick={() => onOpenRequest(r.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                          >
                            View
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

        {/* Right Col: Clients Needing Attention & Recent Activity */}
        <div className="space-y-6">
          {/* Section: Clients needing attention */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
              <span>Clients Needing Attention</span>
              <span className="font-mono text-slate-400 font-normal">{clientsNeedingAttention.length} clients</span>
            </h3>

            <div className="space-y-2.5">
              {clientsNeedingAttention.map(c => (
                <div
                  key={c.id}
                  onClick={() => onOpenClient(c.id)}
                  className="p-3 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50/70 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-slate-900 truncate">{c.companyName}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span>{c.name}</span>
                      <span aria-hidden="true">&middot;</span>
                      <span className="text-rose-600 font-medium font-mono tabular-nums">
                        {c.missingDocumentsCount || 0} missing
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Section: Recent Activity */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Recent Activity Stream
            </h3>

            <div className="space-y-3">
              {activities.slice(0, 6).map(act => (
                <div key={act.id} className="text-xs pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="text-slate-800 font-medium leading-snug">{act.description}</div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>{act.actorName}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span className="font-mono tabular-nums">
                      {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
