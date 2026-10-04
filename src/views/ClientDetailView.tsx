import React, { useState, useEffect } from 'react';
import {
  Building2,
  Mail,
  Phone,
  ArrowLeft,
  Plus,
  Clock,
  CheckCircle2,
  FileCheck2,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Edit2
} from 'lucide-react';
import { Client, DocumentRequest, DocumentRequirement, ActivityLog } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface ClientDetailViewProps {
  clientId: string;
  onBack: () => void;
  onOpenRequest: (requestId: string) => void;
  onCreateRequestForClient: (clientId: string) => void;
  onEditClient: (client: Client) => void;
}

export const ClientDetailView: React.FC<ClientDetailViewProps> = ({
  clientId,
  onBack,
  onOpenRequest,
  onCreateRequestForClient,
  onEditClient,
}) => {
  const { showToast } = useToast();
  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadClient = async () => {
    setIsLoading(true);
    try {
      const data = await api.getClient(clientId);
      setClient(data);
    } catch (err: any) {
      showToast('Failed to load client details: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClient();
  }, [clientId]);

  if (isLoading || !client) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-xs text-slate-500 font-mono animate-pulse">Loading client profile...</div>
      </div>
    );
  }

  const activeRequests: DocumentRequest[] = client.activeRequests || [];
  const completedRequests: DocumentRequest[] = client.completedRequests || [];
  const outstandingRequirements: DocumentRequirement[] = client.outstandingRequirements || [];
  const activity: ActivityLog[] = client.activity || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Back button and breadcrumb */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to all clients</span>
      </button>

      {/* Client Overview Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{client.companyName}</h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded border ${
                client.status === 'Active'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {client.status}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{client.name}</span>
            <span aria-hidden="true">&middot;</span>
            <span className="flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>{client.email}</span>
            </span>
            {client.phone && (
              <>
                <span aria-hidden="true">&middot;</span>
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{client.phone}</span>
                </span>
              </>
            )}
            <span aria-hidden="true">&middot;</span>
            <span>Assigned: {client.assignedStaffName || 'Sarah Jenkins'}</span>
          </div>

          {client.notes && (
            <p className="mt-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-md border border-slate-200/60 max-w-3xl">
              {client.notes}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEditClient(client)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors inline-flex items-center gap-1"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            onClick={() => onCreateRequestForClient(client.id)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Document Request</span>
          </button>
        </div>
      </div>

      {/* Grid: Active Requests & Outstanding Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active & Completed Requests */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Requests */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Active Document Requests ({activeRequests.length})</span>
              </h2>
            </div>

            {activeRequests.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No active document requests for this client.
              </div>
            ) : (
              <div className="space-y-3">
                {activeRequests.map(req => {
                  const stats = req.stats;
                  const pct = stats?.percentage || 0;
                  return (
                    <div
                      key={req.id}
                      onClick={() => onOpenRequest(req.id)}
                      className="p-4 rounded-lg border border-slate-200 hover:border-slate-400 transition-all cursor-pointer group bg-slate-50/40 hover:bg-white"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {req.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Period: {req.period} &middot; Due:{' '}
                            <span className="font-mono tabular-nums text-slate-700">{req.dueDate}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-xs font-semibold font-mono tabular-nums ${
                              stats?.missingCount ? 'text-amber-600' : 'text-emerald-600'
                            }`}
                          >
                            {stats?.receivedCount} of {stats?.totalCount} received ({pct}%)
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outstanding Documents Table */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Outstanding Checklist Items ({outstandingRequirements.length})</span>
            </h2>

            {outstandingRequirements.length === 0 ? (
              <div className="text-center py-6 text-xs text-emerald-600 font-medium">
                No missing documents! All active items are uploaded or approved.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {outstandingRequirements.map(item => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {item.requestName} &middot;{' '}
                        {item.required ? (
                          <span className="text-rose-600">Required</span>
                        ) : (
                          <span>Optional</span>
                        )}
                      </div>
                      {item.status === 'Rejected' && (
                        <div className="text-[11px] text-rose-600 mt-0.5">
                          Rejected: {item.rejectionReason}
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-medium ${
                        item.status === 'Rejected' ? 'text-rose-600 font-semibold' : 'text-amber-600'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Completed Requests */}
          {completedRequests.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Completed Requests History ({completedRequests.length})</span>
              </h2>

              <div className="space-y-2">
                {completedRequests.map(req => (
                  <div
                    key={req.id}
                    onClick={() => onOpenRequest(req.id)}
                    className="p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{req.name}</div>
                      <div className="text-[11px] text-slate-400">{req.period}</div>
                    </div>
                    <span className="text-emerald-600 font-medium">100% Completed</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Client Activity History */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Client Audit Log
          </h3>

          <div className="space-y-3 text-xs">
            {activity.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">No recent activity</div>
            ) : (
              activity.map(act => (
                <div key={act.id} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="text-slate-800 font-medium leading-snug">{act.description}</div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>{act.actorName}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span className="font-mono tabular-nums">
                      {new Date(act.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
