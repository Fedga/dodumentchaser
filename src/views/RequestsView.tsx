import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  FileCheck2,
  Clock,
  Send,
  Link2,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check
} from 'lucide-react';
import { DocumentRequest } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface RequestsViewProps {
  onOpenRequest: (requestId: string) => void;
  onOpenNewRequestModal: () => void;
  onOpenClientPortal: (token: string) => void;
  initialStatusFilter?: string;
}

export const RequestsView: React.FC<RequestsViewProps> = ({
  onOpenRequest,
  onOpenNewRequestModal,
  onOpenClientPortal,
  initialStatusFilter = 'All',
}) => {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await api.getRequests({ search, status: statusFilter });
      setRequests(data);
    } catch (err: any) {
      showToast('Failed to load requests: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [search, statusFilter]);

  const handleCopyLink = (e: React.MouseEvent, token?: string) => {
    e.stopPropagation();
    if (!token) return;
    const portalUrl = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(portalUrl);
    setCopiedToken(token);
    showToast('Secure client portal link copied to clipboard');
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleSendReminder = async (e: React.MouseEvent, req: DocumentRequest) => {
    e.stopPropagation();
    try {
      await api.sendReminder(req.id);
      showToast(`Reminder sent to ${req.companyName}`);
      loadRequests();
    } catch (err: any) {
      showToast('Could not send reminder: ' + err.message, 'error');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Document Requests</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Active and archived requests across all client accounts.
          </p>
        </div>

        <button
          onClick={onOpenNewRequestModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Create Document Request</span>
        </button>
      </div>

      {/* Filters and search */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search request name, client, period..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto overflow-x-auto">
          {['All', 'Active', 'Missing', 'Overdue', 'Completed', 'Archived'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 font-medium">
              <tr>
                <th className="py-2.5 px-4">Client Company</th>
                <th className="py-2.5 px-3">Request Name</th>
                <th className="py-2.5 px-3">Period</th>
                <th className="py-2.5 px-3">Due Date</th>
                <th className="py-2.5 px-3 min-w-[140px]">Progress</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No requests found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                requests.map(req => {
                  const stats = req.stats;
                  const pct = stats?.percentage || 0;
                  const isComplete = req.status === 'Completed' || pct === 100;
                  const isOverdue = req.status === 'Overdue';

                  return (
                    <tr
                      key={req.id}
                      onClick={() => onOpenRequest(req.id)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="group-hover:text-blue-600 transition-colors">{req.companyName}</div>
                        <div className="text-[11px] font-normal text-slate-400">{req.clientName}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900">{req.name}</div>
                        <div className="text-[11px] text-slate-400">Chased {req.reminderCount} times</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{req.period}</td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {req.dueDate}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-mono tabular-nums font-semibold text-slate-700">
                            {stats?.receivedCount || 0}/{stats?.totalCount || 0} received
                          </span>
                          <span className="font-mono tabular-nums text-slate-500">{pct}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[11px] font-medium ${
                            isComplete
                              ? 'text-emerald-700'
                              : isOverdue
                              ? 'text-rose-700 font-semibold'
                              : 'text-amber-700'
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => handleCopyLink(e, req.portalToken)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors inline-flex items-center gap-1"
                          title="Copy client portal upload link"
                        >
                          {copiedToken === req.portalToken ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {!isComplete && (
                          <button
                            onClick={e => handleSendReminder(e, req)}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors inline-flex items-center gap-1"
                            title="Send reminder email now"
                          >
                            <Send className="w-3 h-3 text-slate-500" />
                            <span>Remind</span>
                          </button>
                        )}

                        <button
                          onClick={() => onOpenRequest(req.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
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
    </div>
  );
};
