import React, { useState, useEffect } from 'react';
import { Search, Download, CheckCircle2, XCircle, FileText, Filter, RefreshCw, Eye } from 'lucide-react';
import { DocumentFile } from '../types';
import { api, getAuthToken } from '../api';
import { useToast } from '../components/Toast';
import { RejectDocumentModal } from '../components/RejectDocumentModal';

interface DocumentsViewProps {
  initialStatusFilter?: string;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  initialStatusFilter = 'All',
}) => {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectingItem, setRejectingItem] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const data = await api.getDocuments({ search, status: statusFilter });
      setDocuments(data);
    } catch (err: any) {
      showToast('Failed to load documents: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [search, statusFilter]);

  const handleApprove = async (doc: DocumentFile) => {
    try {
      await api.approveRequirement(doc.requirementId);
      showToast(`Approved "${doc.filename}"`);
      loadDocuments();
    } catch (err: any) {
      showToast('Approval failed: ' + err.message, 'error');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Central Documents Archive</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Every file uploaded across all clients, categorized and verified.
          </p>
        </div>

        <button
          onClick={loadDocuments}
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors self-start sm:self-auto"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
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
            placeholder="Search filename, client, or request..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto overflow-x-auto">
          {['All', 'Uploaded', 'Approved', 'Rejected'].map(status => (
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 font-medium">
              <tr>
                <th className="py-2.5 px-4">Filename</th>
                <th className="py-2.5 px-3">Client</th>
                <th className="py-2.5 px-3">Request</th>
                <th className="py-2.5 px-3">Requirement Item</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Uploaded</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No documents found matching current filter.
                  </td>
                </tr>
              ) : (
                documents.map(doc => {
                  const isUploaded = doc.status === 'Uploaded';
                  const isApproved = doc.status === 'Approved';
                  const isRejected = doc.status === 'Rejected';

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="font-mono text-xs">{doc.filename}</span>
                        </div>
                        <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                          {Math.round(doc.sizeBytes / 1024)} KB &middot; {doc.mimeType}
                        </div>
                        {isRejected && doc.rejectionReason && (
                          <div className="text-[11px] text-rose-600 mt-1">
                            Reason: {doc.rejectionReason}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900">{doc.companyName || 'Client'}</div>
                        <div className="text-[11px] text-slate-400">{doc.clientName}</div>
                      </td>

                      <td className="py-3 px-3 text-slate-700">{doc.requestName}</td>

                      <td className="py-3 px-3 text-slate-600">{doc.requirementName}</td>

                      <td className="py-3 px-3">
                        <span
                          className={`text-[11px] font-medium ${
                            isApproved
                              ? 'text-emerald-700'
                              : isUploaded
                              ? 'text-blue-700'
                              : 'text-rose-700 font-semibold'
                          }`}
                        >
                          {doc.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>

                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <a
                          href={`/api/documents/${doc.id}/download?token=${getAuthToken()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded inline-flex items-center gap-1"
                          title="Download document"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        {isUploaded && (
                          <>
                            <button
                              onClick={() => handleApprove(doc)}
                              className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectingItem({ id: doc.requirementId, name: doc.requirementName || doc.filename })}
                              className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 rounded transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rejectingItem && (
        <RejectDocumentModal
          isOpen={true}
          onClose={() => setRejectingItem(null)}
          requirementId={rejectingItem.id}
          requirementName={rejectingItem.name}
          onSuccess={loadDocuments}
        />
      )}
    </div>
  );
};
