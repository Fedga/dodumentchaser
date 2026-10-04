import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Send,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  FileCheck2,
  AlertTriangle,
  Clock,
  Download,
  Eye,
  CheckCircle2,
  XCircle,
  BellRing,
  Pause,
  Play,
  FileText,
  KeyRound,
  RefreshCw,
  Ban,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { DocumentRequest, DocumentRequirement, Reminder } from '../types';
import { api, getAuthToken } from '../api';
import { useToast } from '../components/Toast';
import { RejectDocumentModal } from '../components/RejectDocumentModal';

interface RequestDetailViewProps {
  requestId: string;
  onBack: () => void;
  onOpenPortal: (token: string) => void;
}

export const RequestDetailView: React.FC<RequestDetailViewProps> = ({
  requestId,
  onBack,
  onOpenPortal,
}) => {
  const { showToast } = useToast();
  const [request, setRequest] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocRequired, setNewDocRequired] = useState(true);
  const [rejectingItem, setRejectingItem] = useState<{ id: string; name: string } | null>(null);

  const loadRequest = async () => {
    setIsLoading(true);
    try {
      const data = await api.getRequest(requestId);
      setRequest(data);
    } catch (err: any) {
      showToast('Failed to load request: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequest();
  }, [requestId]);

  const handleCopyLink = () => {
    if (!request) return;
    const url = `${window.location.origin}/portal/${request.portalToken}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    showToast('Client portal link copied');
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleSendReminder = async () => {
    setIsSendingReminder(true);
    try {
      await api.sendReminder(requestId);
      showToast(`Reminder sent to ${request.client?.name || 'client'}`);
      loadRequest();
    } catch (err: any) {
      showToast('Failed to send reminder: ' + err.message, 'error');
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleToggleReminders = async () => {
    try {
      const res = await api.toggleReminders(requestId);
      showToast(`Automated chasing ${res.remindersPaused ? 'paused' : 'resumed'}`);
      loadRequest();
    } catch (err: any) {
      showToast('Could not toggle reminders: ' + err.message, 'error');
    }
  };

  const handleRotateLink = async () => {
    if (!confirm('Rotate portal link? This immediately invalidates the previous link and issues a fresh 256-bit cryptographically secure link.')) return;
    try {
      await api.rotatePortalToken(requestId, 30);
      showToast('Portal link successfully rotated. Previous link is now invalid.');
      loadRequest();
    } catch (err: any) {
      showToast('Failed to rotate link: ' + err.message, 'error');
    }
  };

  const handleRevokeLink = async () => {
    if (!confirm('Revoke portal link? Client access will be immediately blocked.')) return;
    try {
      await api.revokePortalToken(requestId);
      showToast('Portal link has been revoked. Client access blocked.');
      loadRequest();
    } catch (err: any) {
      showToast('Failed to revoke link: ' + err.message, 'error');
    }
  };

  const handleCloseRequest = async () => {
    try {
      await api.closeRequest(requestId);
      showToast('Request marked as complete & closed');
      loadRequest();
    } catch (err: any) {
      showToast('Could not close request: ' + err.message, 'error');
    }
  };

  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim()) return;

    try {
      await api.addRequirement(requestId, {
        name: newDocName.trim(),
        required: newDocRequired,
      });
      showToast(`Added "${newDocName}" to checklist`);
      setNewDocName('');
      setNewDocRequired(true);
      loadRequest();
    } catch (err: any) {
      showToast('Failed to add document: ' + err.message, 'error');
    }
  };

  const handleDeleteRequirement = async (reqId: string) => {
    try {
      await api.deleteRequirement(reqId);
      showToast('Document requirement removed');
      loadRequest();
    } catch (err: any) {
      showToast('Failed to remove: ' + err.message, 'error');
    }
  };

  const handleApprove = async (reqId: string, itemName: string) => {
    try {
      await api.approveRequirement(reqId);
      showToast(`Approved "${itemName}"`);
      loadRequest();
    } catch (err: any) {
      showToast('Approval failed: ' + err.message, 'error');
    }
  };

  if (isLoading || !request) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-xs text-slate-500 font-mono animate-pulse">Loading document request details...</div>
      </div>
    );
  }

  const client = request.client;
  const requirements: DocumentRequirement[] = request.requirements || [];
  const reminders: Reminder[] = request.reminders || [];
  const stats = request.stats || { totalCount: 0, receivedCount: 0, missingCount: 0, percentage: 0 };
  const pct = stats.percentage;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to all requests</span>
      </button>

      {/* Header Card: Client name, Request name, Period, Due date, Percentage */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {client?.companyName} ({client?.name})
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
              {request.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2">
              <span>Period: <strong className="text-slate-800 font-medium">{request.period}</strong></span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Due:{' '}
                <strong className="text-slate-800 font-mono tabular-nums">{request.dueDate}</strong>
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Chaser Interval:{' '}
                <strong className="text-slate-800">Every {request.reminderFrequencyDays} days</strong>
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onOpenPortal(request.portalToken)}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors inline-flex items-center gap-1.5"
              title="Open the client-facing view for this request"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Simulate Client Portal</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md transition-colors inline-flex items-center gap-1.5"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{isCopied ? 'Link Copied!' : 'Copy Portal Link'}</span>
            </button>

            <button
              onClick={handleSendReminder}
              disabled={isSendingReminder}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5 text-slate-500" />
              <span>{isSendingReminder ? 'Sending...' : 'Send Reminder'}</span>
            </button>

            <button
              onClick={handleToggleReminders}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors inline-flex items-center gap-1.5"
            >
              {request.remindersPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Resume Chasing</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pause Chasing</span>
                </>
              )}
            </button>

            {request.status !== 'Completed' && (
              <button
                onClick={handleCloseRequest}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
              >
                Close Request
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar & Status Counter */}
        <div className="p-4 bg-slate-50/80 rounded-lg border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="font-semibold text-slate-800">
              <span className="font-mono tabular-nums text-sm text-slate-900 font-bold">{stats.receivedCount}</span> of{' '}
              <span className="font-mono tabular-nums text-sm text-slate-900 font-bold">{stats.totalCount}</span> documents received
            </div>
            <div className="font-mono tabular-nums font-bold text-slate-900 text-sm">{pct}% complete</div>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-600' : 'bg-amber-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Portal Link Security & Token Management Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white rounded-lg border border-slate-200 text-xs">
          <div className="flex items-center gap-2.5">
            {request.portalTokenRevoked ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <Ban className="w-3 h-3 text-rose-600" /> Revoked Link
              </span>
            ) : request.portalTokenExpiresAt && new Date(request.portalTokenExpiresAt) < new Date() ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-3 h-3 text-amber-600" /> Link Expired
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Secure Token Active
              </span>
            )}

            <span className="text-slate-500 hidden md:inline">
              {request.portalTokenRevoked
                ? 'Client portal access is blocked. Rotate link to issue fresh access.'
                : request.portalTokenExpiresAt
                ? `Expires: ${new Date(request.portalTokenExpiresAt).toLocaleDateString('en-GB')}`
                : 'Cryptographic 256-bit token active'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRotateLink}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors inline-flex items-center gap-1.5"
              title="Invalidates previous link and creates a new cryptographic 256-bit token"
            >
              <RefreshCw className="w-3 h-3 text-slate-500" />
              <span>Rotate Link</span>
            </button>

            {!request.portalTokenRevoked && (
              <button
                onClick={handleRevokeLink}
                className="px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 transition-colors inline-flex items-center gap-1.5"
                title="Immediately prevent any client access to this portal"
              >
                <Ban className="w-3 h-3 text-rose-600" />
                <span>Revoke Link</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Document Checklist Table & Reminder History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Document Checklist Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
              <span>Document Requirements ({requirements.length})</span>
            </h2>
            <div className="text-xs text-slate-500">
              {stats.missingCount > 0 ? (
                <span className="text-amber-700 font-semibold font-mono tabular-nums">
                  {stats.missingCount} still missing
                </span>
              ) : (
                <span className="text-emerald-700 font-semibold">All documents received</span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 font-medium">
                <tr>
                  <th className="py-2.5 px-3">Document</th>
                  <th className="py-2.5 px-3">Required</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requirements.map((item, index) => {
                  const doc = item.document;
                  const isMissing = item.status === 'Missing' || item.status === 'Requested';
                  const isUploaded = item.status === 'Uploaded';
                  const isApproved = item.status === 'Approved';
                  const isRejected = item.status === 'Rejected';
                  const isNA = item.status === 'Not applicable';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        {item.description && (
                          <div className="text-[11px] text-slate-500 mt-0.5">{item.description}</div>
                        )}
                        {doc && (
                          <div className="text-[11px] text-blue-600 mt-1 flex items-center gap-1.5 font-mono">
                            <FileText className="w-3 h-3" />
                            <span>{doc.filename}</span>
                            <span>({Math.round(doc.sizeBytes / 1024)} KB)</span>
                          </div>
                        )}
                        {isRejected && (
                          <div className="text-[11px] text-rose-600 bg-rose-50 p-1.5 rounded mt-1.5 border border-rose-200/60">
                            <strong>Rejected reason:</strong> {item.rejectionReason}
                          </div>
                        )}
                        {item.clientNote && (
                          <div className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded mt-1.5 border border-slate-200/60">
                            <strong>Client note:</strong> {item.clientNote}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`text-[11px] ${item.required ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                          {item.required ? 'Yes' : 'No'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`text-[11px] font-medium ${
                            isApproved
                              ? 'text-emerald-700'
                              : isUploaded
                              ? 'text-blue-700'
                              : isRejected
                              ? 'text-rose-700 font-semibold'
                              : isNA
                              ? 'text-slate-500'
                              : 'text-amber-700'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {doc ? (
                          <span className="font-mono tabular-nums text-[11px]">
                            {new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                        {/* If uploaded or approved, allow view / download */}
                        {doc && (
                          <a
                            href={`/api/documents/${doc.id}/download?token=${getAuthToken()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded inline-flex items-center gap-1"
                            title="Download/preview document"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {/* Review actions: Approve & Reject */}
                        {(isUploaded || isRejected) && (
                          <>
                            <button
                              onClick={() => handleApprove(item.id, item.name)}
                              className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded transition-colors inline-flex items-center gap-1"
                              title="Approve this document"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => setRejectingItem({ id: item.id, name: item.name })}
                              className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 rounded transition-colors inline-flex items-center gap-1"
                              title="Reject document with reason"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}

                        {/* If missing or rejected, allow targeted reminder */}
                        {(isMissing || isRejected) && (
                          <button
                            onClick={handleSendReminder}
                            className="px-2 py-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors inline-flex items-center gap-1"
                            title="Send reminder to client"
                          >
                            <Send className="w-3 h-3 text-slate-400" />
                            <span>Remind</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteRequirement(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Remove requirement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Quick add custom requirement */}
          <form onSubmit={handleAddRequirement} className="pt-3 border-t border-slate-100 flex items-center gap-2">
            <input
              type="text"
              value={newDocName}
              onChange={e => setNewDocName(e.target.value)}
              placeholder="Add another required document (e.g. Dividend Voucher)..."
              className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={newDocRequired}
                onChange={e => setNewDocRequired(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>Required</span>
            </label>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
            >
              Add Document
            </button>
          </form>
        </div>

        {/* Right Col: Reminder Schedule & Sent Reminders History */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <BellRing className="w-4 h-4 text-slate-400" />
              <span>Reminder History ({reminders.length})</span>
            </h3>

            {reminders.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No reminders sent yet for this request.
              </div>
            ) : (
              <div className="space-y-3">
                {reminders.map((rem, idx) => (
                  <div key={rem.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 text-xs">
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>Reminder #{reminders.length - idx}</span>
                      <span className="text-[11px] font-normal text-slate-400 font-mono">
                        {new Date(rem.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 truncate">
                      To: {rem.recipientEmail}
                    </div>
                    <div className="text-[11px] text-slate-700 mt-2 bg-white p-2 rounded border border-slate-200/60 font-mono whitespace-pre-wrap line-clamp-3">
                      {rem.body}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectingItem && (
        <RejectDocumentModal
          isOpen={true}
          onClose={() => setRejectingItem(null)}
          requirementId={rejectingItem.id}
          requirementName={rejectingItem.name}
          onSuccess={loadRequest}
        />
      )}
    </div>
  );
};
