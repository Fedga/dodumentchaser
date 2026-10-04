import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useToast } from './Toast';
import { api } from '../api';

interface RejectDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  requirementId: string;
  requirementName: string;
  onSuccess: () => void;
}

export const RejectDocumentModal: React.FC<RejectDocumentModalProps> = ({
  isOpen,
  onClose,
  requirementId,
  requirementName,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [reason, setReason] = useState('Bank statement is missing pages 3–4. Please upload a complete statement.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      showToast('Please provide a reason so your client knows what to fix', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.rejectRequirement(requirementId, reason.trim());
      showToast(`Document marked as rejected`);
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast('Failed to reject document: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cannedReasons = [
    'Missing pages 3–4. Please upload a full statement.',
    'Document is blurry / unreadable. Please upload a clear scan or PDF.',
    'Incorrect accounting period. Please provide statement for the requested month.',
    'Password protected file. Please upload an unlocked PDF.',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-rose-50/50">
          <div className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h2 className="text-sm font-bold">Reject Document & Request Resubmission</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">Item to reject:</div>
            <div className="text-xs font-semibold text-slate-900 bg-slate-100 p-2 rounded-md">
              {requirementName}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Feedback for Client <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain clearly why this document is unacceptable..."
              className="w-full text-xs bg-white border border-slate-300 rounded-md p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            />
          </div>

          {/* Quick reason suggestions */}
          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-1.5">Quick reasons:</div>
            <div className="flex flex-col gap-1">
              {cannedReasons.map((cr, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReason(cr)}
                  className="text-left text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-50 p-1.5 rounded transition-colors"
                >
                  &bull; {cr}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors shadow-xs"
            >
              {isSubmitting ? 'Rejecting...' : 'Reject Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
