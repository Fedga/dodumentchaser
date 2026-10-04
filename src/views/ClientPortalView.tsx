import React, { useState, useEffect, useMemo } from 'react';
import {
  FileCheck2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Calendar,
  X,
  Send,
  MessageSquare,
  Lock,
  ArrowRight,
  Sparkles,
  HelpCircle,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface ClientPortalViewProps {
  initialToken?: string;
  onExitToDashboard?: () => void;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({
  initialToken = 'portal_abc_march2027_sec9812',
  onExitToDashboard,
}) => {
  const { showToast } = useToast();
  const [token, setToken] = useState(initialToken);
  const [portalData, setPortalData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ code?: string; message: string } | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  // Active Category Filter: 'all' | 'missing' | 'rejected' | 'complete' | 'na'
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | 'missing' | 'rejected' | 'complete' | 'na'>('all');

  // Modals for NA or Note
  const [naModalItem, setNaModalItem] = useState<{ id: string; name: string } | null>(null);
  const [naReason, setNaReason] = useState('');
  const [noteModalItem, setNoteModalItem] = useState<{ id: string; name: string } | null>(null);
  const [clientNoteText, setClientNoteText] = useState('');

  const loadPortal = async (currentToken: string) => {
    setIsLoading(true);
    setErrorState(null);
    try {
      const data = await api.getPortal(currentToken);
      setPortalData(data);
    } catch (err: any) {
      const msg = err.message || '';
      const code = err.code || (
        msg.toLowerCase().includes('revoked') ? 'PORTAL_LINK_REVOKED' :
        msg.toLowerCase().includes('expired') ? 'PORTAL_LINK_EXPIRED' :
        msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('attempts') ? 'RATE_LIMITED' :
        'PORTAL_LINK_INVALID'
      );
      setErrorState({ code, message: msg || 'Unable to access document portal.' });
      showToast('Portal link error: ' + msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadPortal(token);
    }
  }, [token]);

  const handleFileUpload = async (requirementId: string, file: File) => {
    // Validate file size (max 25MB)
    if (file.size > 26214400) {
      showToast('File exceeds 25MB limit', 'error');
      return;
    }

    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.csv', '.xlsx', '.xls', '.doc', '.docx'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      showToast(`Unsupported format "${ext}". Allowed: PDF, PNG, JPG, CSV, XLSX, DOC, DOCX`, 'error');
      return;
    }

    setUploadingItemId(requirementId);

    // Read to base64
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const fileDataUri = reader.result as string;
        await api.uploadPortalDocument(token, {
          requirementId,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          fileDataUri,
        });

        showToast(`"${file.name}" uploaded successfully!`);
        loadPortal(token);
      } catch (err: any) {
        showToast('Upload failed: ' + err.message, 'error');
      } finally {
        setUploadingItemId(null);
      }
    };
    reader.onerror = () => {
      showToast('Error reading local file', 'error');
      setUploadingItemId(null);
    };
    reader.readAsDataURL(file);
  };

  const handleMarkNA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!naModalItem || !naReason.trim()) return;

    try {
      await api.markPortalNA(token, naModalItem.id, naReason.trim());
      showToast(`Marked "${naModalItem.name}" as Not Applicable`);
      setNaModalItem(null);
      setNaReason('');
      loadPortal(token);
    } catch (err: any) {
      showToast('Failed to mark item: ' + err.message, 'error');
    }
  };

  const handleSendNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteModalItem || !clientNoteText.trim()) return;

    try {
      await api.addPortalNote(token, noteModalItem.id, clientNoteText.trim());
      showToast('Note submitted to your accountant');
      setNoteModalItem(null);
      setClientNoteText('');
      loadPortal(token);
    } catch (err: any) {
      showToast('Failed to send note: ' + err.message, 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin mb-3" />
        <div className="text-xs text-slate-500 font-mono">Loading secure document portal...</div>
      </div>
    );
  }

  if (errorState || !portalData) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-16">
        <div className="bg-slate-900 text-slate-300 text-xs px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold text-white">Client Portal &middot; Access Verification</span>
          </div>
          {onExitToDashboard && (
            <button
              onClick={onExitToDashboard}
              className="text-[11px] font-semibold text-slate-300 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            >
              Practice Workspace &rarr;
            </button>
          )}
        </div>

        <main className="max-w-lg mx-auto px-4 pt-16 space-y-6 text-center">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-8 space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              {errorState?.code === 'RATE_LIMITED'
                ? 'Rate Limit Exceeded'
                : errorState?.code === 'PORTAL_LINK_REVOKED'
                ? 'Portal Link Revoked'
                : errorState?.code === 'PORTAL_LINK_EXPIRED'
                ? 'Portal Link Expired'
                : 'Invalid Document Link'}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {errorState?.message || 'The requested document portal link could not be verified.'}
            </p>
            <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500">
              Please contact your accountant to receive a fresh, verified upload link.
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { request, firm, client, requirements = [], stats } = portalData;
  const pct = stats?.percentage || 0;

  // Separate requirements strictly into four categories:
  // 1. Rejected: status === 'Rejected'
  // 2. Missing: status === 'Missing' || status === 'Requested'
  // 3. Complete: status === 'Approved' || status === 'Uploaded'
  // 4. Not applicable: status === 'Not applicable'
  const rejectedItems = requirements.filter((rq: any) => rq.status === 'Rejected');
  const missingItems = requirements.filter((rq: any) => rq.status === 'Missing' || rq.status === 'Requested');
  const completeItems = requirements.filter((rq: any) => rq.status === 'Approved' || rq.status === 'Uploaded');
  const naItems = requirements.filter((rq: any) => rq.status === 'Not applicable');

  // Compute what needs to happen next message
  const getNextActionMessage = () => {
    if (rejectedItems.length > 0) {
      return {
        type: 'warning',
        title: 'Action Required: Re-upload Rejected Documents',
        description: `${rejectedItems.length} document${
          rejectedItems.length > 1 ? 's were' : ' was'
        } rejected by your accountant and require${rejectedItems.length > 1 ? '' : 's'} a replacement upload.`,
      };
    }
    if (missingItems.length > 0) {
      return {
        type: 'action',
        title: 'Action Required: Outstanding Documents',
        description: `Please upload the remaining ${missingItems.length} missing document${
          missingItems.length > 1 ? 's' : ''
        } listed below to complete this accounting period.`,
      };
    }
    if (completeItems.some((rq: any) => rq.status === 'Uploaded')) {
      return {
        type: 'review',
        title: 'Under Review by Accountant',
        description: 'All documents have been uploaded! Your accounting team is currently reviewing your submissions.',
      };
    }
    return {
      type: 'complete',
      title: 'Request Complete',
      description: 'All required documents have been received and approved by your accounting practice. No further action needed.',
    };
  };

  const nextAction = getNextActionMessage();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-16">
      {/* Top Demo Bar & Practice Link */}
      <div className="bg-slate-900 text-slate-300 text-xs px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-white">Client Portal</span>
          <span className="text-slate-400 hidden sm:inline">&middot; End-to-end encrypted upload</span>
        </div>

        {onExitToDashboard && (
          <button
            onClick={onExitToDashboard}
            className="text-[11px] font-semibold text-slate-300 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
          >
            Practice Workspace &rarr;
          </button>
        )}
      </div>

      {/* Main Client Portal Container */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
        {/* Practice Branding Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-slate-900 font-bold text-base sm:text-lg leading-tight">{firm.name}</div>
              <div className="text-xs text-slate-500">
                Document portal for <strong className="text-slate-800">{client.companyName || client.name}</strong>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-1.5 self-start sm:self-auto">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Secure 256-bit token link</span>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* TOP SECTION: REQUEST, PERIOD, DUE DATE, PROGRESS */}
        {/* ---------------------------------------------------- */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. REQUEST */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                REQUEST
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={request.name}>
                {request.name}
              </div>
            </div>

            {/* 2. PERIOD */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                PERIOD
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-900 font-mono truncate" title={request.period}>
                {request.period || 'General'}
              </div>
            </div>

            {/* 3. DUE DATE */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                DUE DATE
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-900 font-mono">
                {request.dueDate}
              </div>
            </div>

            {/* 4. PROGRESS */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                PROGRESS
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-900 font-mono">
                {stats.receivedCount} of {stats.totalCount} received
              </div>
            </div>
          </div>

          {/* Progress Bar & Percentage Callout */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Overall Submission Status: <span className="font-mono text-slate-900">{stats.receivedCount} of {stats.totalCount} documents received</span>
              </span>
              <span className="font-mono font-bold text-slate-900 text-sm">{pct}% complete</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/60">
              <div
                className={`h-full transition-all duration-300 ${
                  pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-600' : 'bg-amber-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Next Steps Guidance Banner */}
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
              nextAction.type === 'warning'
                ? 'bg-rose-50 border-rose-200 text-rose-950'
                : nextAction.type === 'action'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : nextAction.type === 'review'
                ? 'bg-blue-50 border-blue-200 text-blue-950'
                : 'bg-emerald-50 border-emerald-200 text-emerald-950'
            }`}
          >
            {nextAction.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : nextAction.type === 'complete' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : nextAction.type === 'review' ? (
              <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="font-bold text-slate-900 text-xs">{nextAction.title}</div>
              <div className="text-[11px] leading-relaxed text-slate-600">{nextAction.description}</div>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* CLEARLY SEPARATED SECTIONS: Missing, Rejected, Complete, Not applicable */}
        {/* ---------------------------------------------------- */}

        {/* Category Navigation Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 ${
              activeCategoryFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Items ({requirements.length})
          </button>

          {missingItems.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('missing')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeCategoryFilter === 'missing'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              <span>Missing</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                {missingItems.length}
              </span>
            </button>
          )}

          {rejectedItems.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('rejected')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeCategoryFilter === 'rejected'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              <span>Rejected</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                {rejectedItems.length}
              </span>
            </button>
          )}

          {completeItems.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('complete')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeCategoryFilter === 'complete'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <span>Complete</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {completeItems.length}
              </span>
            </button>
          )}

          {naItems.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('na')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeCategoryFilter === 'na'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>Not Applicable</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                {naItems.length}
              </span>
            </button>
          )}
        </div>

        {/* ==================================================== */}
        {/* SECTION 1: REJECTED DOCUMENTS (Action Essential)     */}
        {/* ==================================================== */}
        {(activeCategoryFilter === 'all' || activeCategoryFilter === 'rejected') && rejectedItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Rejected Documents ({rejectedItems.length})</span>
              </h2>
              <span className="text-[11px] text-rose-600 font-medium">Action required: upload replacements</span>
            </div>

            <div className="space-y-3">
              {rejectedItems.map((item: any) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-rose-300 p-4 sm:p-5 shadow-xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 uppercase">
                          Rejected
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                        {item.required && (
                          <span className="text-[10px] font-semibold text-rose-600">Required</span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                      )}

                      {/* Explicit Rejection Reason callout */}
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-950 space-y-1">
                        <div className="font-bold text-rose-800 flex items-center gap-1.5">
                          <span>Reason:</span>
                        </div>
                        <div className="text-xs font-medium text-rose-900 italic">
                          "{item.rejectionReason || 'Please re-upload a clear and complete document.'}"
                        </div>
                      </div>

                      {item.clientNote && (
                        <div className="text-[11px] text-slate-500 italic">
                          Your note: "{item.clientNote}"
                        </div>
                      )}
                    </div>

                    {/* Upload Replacement Action Button */}
                    <div className="flex flex-col sm:items-end gap-2 shrink-0 pt-2 sm:pt-0">
                      <label
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 transition-colors shadow-xs cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingItemId === item.id ? 'Uploading replacement...' : 'Upload replacement'}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload(item.id, e.target.files[0]);
                            }
                          }}
                          accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.doc,.docx"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setNoteModalItem({ id: item.id, name: item.name });
                          setClientNoteText(item.clientNote || '');
                        }}
                        className="text-[11px] text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 p-1 hover:underline"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Add note</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* SECTION 2: MISSING DOCUMENTS                         */}
        {/* ==================================================== */}
        {(activeCategoryFilter === 'all' || activeCategoryFilter === 'missing') && missingItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Missing Documents ({missingItems.length})</span>
              </h2>
              <span className="text-[11px] text-slate-500">Accepted: PDF, PNG, JPG, CSV, XLSX, DOC (Max 25MB)</span>
            </div>

            <div className="space-y-3">
              {missingItems.map((item: any) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-3 hover:border-slate-300 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                          Missing
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                        {item.required ? (
                          <span className="text-[10px] font-semibold text-rose-600">Required</span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Optional</span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                      )}

                      {item.clientNote && (
                        <div className="text-[11px] text-slate-500 italic">
                          Your note: "{item.clientNote}"
                        </div>
                      )}
                    </div>

                    {/* Upload document Action Button */}
                    <div className="flex flex-col sm:items-end gap-2 shrink-0 pt-2 sm:pt-0">
                      <label
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 transition-colors shadow-xs cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingItemId === item.id ? 'Uploading...' : 'Upload document'}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload(item.id, e.target.files[0]);
                            }
                          }}
                          accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.doc,.docx"
                        />
                      </label>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <button
                          type="button"
                          onClick={() => {
                            setNaModalItem({ id: item.id, name: item.name });
                            setNaReason('');
                          }}
                          className="hover:text-slate-800 transition-colors underline underline-offset-2"
                        >
                          Mark not applicable
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteModalItem({ id: item.id, name: item.name });
                            setClientNoteText(item.clientNote || '');
                          }}
                          className="hover:text-slate-800 transition-colors inline-flex items-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Add note</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* SECTION 3: COMPLETE / RECEIVED DOCUMENTS             */}
        {/* ==================================================== */}
        {(activeCategoryFilter === 'all' || activeCategoryFilter === 'complete') && completeItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete ({completeItems.length})</span>
              </h2>
              <span className="text-[11px] text-emerald-600 font-medium">Received by accountant</span>
            </div>

            <div className="space-y-3">
              {completeItems.map((item: any) => {
                const isApproved = item.status === 'Approved';
                const doc = item.document;

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-emerald-200/90 p-4 sm:p-5 shadow-2xs space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${
                              isApproved
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{isApproved ? 'Approved' : 'Received (In Review)'}</span>
                          </span>
                          <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                          {item.required && (
                            <span className="text-[10px] font-semibold text-slate-500">Required</span>
                          )}
                        </div>

                        {item.description && (
                          <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                        )}

                        {/* File Details */}
                        {doc && (
                          <div className="flex items-center gap-2 text-xs text-slate-700 font-mono pt-1">
                            <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <a
                              href={`/api/documents/${doc.id}/download?portalToken=${token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-blue-700 hover:underline truncate"
                              title="Download uploaded file"
                            >
                              {doc.filename}
                            </a>
                            <span className="text-slate-400 font-normal">
                              ({Math.round(doc.sizeBytes / 1024)} KB)
                            </span>
                          </div>
                        )}

                        {item.clientNote && (
                          <div className="text-[11px] text-slate-500 italic">
                            Your note: "{item.clientNote}"
                          </div>
                        )}
                      </div>

                      {/* Replace File Option */}
                      <div className="flex flex-col sm:items-end gap-2 shrink-0 pt-2 sm:pt-0">
                        <label
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {uploadingItemId === item.id ? 'Replacing...' : 'Replace file'}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={e => {
                              if (e.target.files && e.target.files[0]) {
                                handleFileUpload(item.id, e.target.files[0]);
                              }
                            }}
                            accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.doc,.docx"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setNoteModalItem({ id: item.id, name: item.name });
                            setClientNoteText(item.clientNote || '');
                          }}
                          className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 p-1 hover:underline"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Add note</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* SECTION 4: NOT APPLICABLE DOCUMENTS                  */}
        {/* ==================================================== */}
        {(activeCategoryFilter === 'all' || activeCategoryFilter === 'na') && naItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Not Applicable ({naItems.length})</span>
              </h2>
              <span className="text-[11px] text-slate-400">Exempt from submission</span>
            </div>

            <div className="space-y-3">
              {naItems.map((item: any) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-2 opacity-90"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                          Not Applicable
                        </span>
                        <h3 className="text-sm font-bold text-slate-800 line-through text-slate-600">{item.name}</h3>
                      </div>

                      {item.description && (
                        <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                      )}

                      <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                        <strong>Reason provided:</strong> "{item.clientNote || 'Marked not applicable by client'}"
                      </div>
                    </div>

                    {/* Option to upload if situation changes */}
                    <div className="flex flex-col sm:items-end gap-2 shrink-0 pt-1 sm:pt-0">
                      <label
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload document anyway</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload(item.id, e.target.files[0]);
                            }
                          }}
                          accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.doc,.docx"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer Support Info */}
        <div className="text-center pt-8 text-xs text-slate-400 space-y-1">
          <p>Questions about this request? Contact your accountant directly at {firm.name}.</p>
          <p className="text-[11px]">Powered by DocumentChaser &middot; Secure Document Collection</p>
        </div>
      </main>

      {/* Modal: Mark Not Applicable */}
      {naModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Mark as Not Applicable</h3>
              <button onClick={() => setNaModalItem(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleMarkNA} className="space-y-4 text-xs">
              <div>
                <p className="text-slate-600 mb-2">
                  Document: <strong className="text-slate-900">{naModalItem.name}</strong>
                </p>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason why this document does not apply to your company: <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={naReason}
                  onChange={e => setNaReason(e.target.value)}
                  placeholder="e.g. This business does not hold any commercial credit cards, or this expense category was zero this month..."
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNaModalItem(null)}
                  className="px-3 py-2 min-h-[44px] text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[44px] bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800"
                >
                  Confirm Not Applicable
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Note */}
      {noteModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Add Note to Accountant</h3>
              <button onClick={() => setNoteModalItem(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSendNote} className="space-y-4 text-xs">
              <div>
                <p className="text-slate-600 mb-2">
                  Document: <strong className="text-slate-900">{noteModalItem.name}</strong>
                </p>
                <label className="block font-semibold text-slate-700 mb-1">
                  Your message or explanation: <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={clientNoteText}
                  onChange={e => setClientNoteText(e.target.value)}
                  placeholder="e.g. Bank statement will arrive in 2 days from head office, or please see attached ledger notes..."
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNoteModalItem(null)}
                  className="px-3 py-2 min-h-[44px] text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[44px] bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800"
                >
                  Send Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
