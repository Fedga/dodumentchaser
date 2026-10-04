import React, { useState } from 'react';
import { X, Building2, User, Mail, Phone, FileText, Check } from 'lucide-react';
import { Client, ClientStatus } from '../types';
import { api } from '../api';
import { useToast } from './Toast';

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated: (client: Client) => void;
  clientToEdit?: Client | null;
}

export const NewClientModal: React.FC<NewClientModalProps> = ({
  isOpen,
  onClose,
  onClientCreated,
  clientToEdit,
}) => {
  const { showToast } = useToast();
  const [name, setName] = useState(clientToEdit ? clientToEdit.name : '');
  const [companyName, setCompanyName] = useState(clientToEdit ? clientToEdit.companyName : '');
  const [email, setEmail] = useState(clientToEdit ? clientToEdit.email : '');
  const [phone, setPhone] = useState(clientToEdit ? clientToEdit.phone : '');
  const [status, setStatus] = useState<ClientStatus>(clientToEdit ? clientToEdit.status : 'Active');
  const [notes, setNotes] = useState(clientToEdit ? clientToEdit.notes : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !name.trim() || !email.trim()) {
      showToast('Company name, contact name, and email are required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (clientToEdit) {
        const updated = await api.updateClient(clientToEdit.id, {
          name: name.trim(),
          companyName: companyName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          status,
          notes: notes.trim(),
        });
        showToast(`Client "${updated.companyName}" updated`);
        onClientCreated(updated);
      } else {
        const created = await api.createClient({
          name: name.trim(),
          companyName: companyName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          status,
          notes: notes.trim(),
        });
        showToast(`Client "${created.companyName}" added successfully`);
        onClientCreated(created);
      }
      onClose();
    } catch (err: any) {
      showToast('Failed to save client: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {clientToEdit ? 'Edit Client Details' : 'Add New Client'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Client records are isolated to your firm and linked to document requests.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Company / Entity Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Apex Industrial Ltd"
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Contact Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. John Taylor"
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ClientStatus)}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="Active">Active</option>
                <option value="Onboarding">Onboarding</option>
                <option value="Paused">Paused</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="client@company.co.uk"
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+44 20 7946 0000"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Internal Notes & Bookkeeping Context
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. VAT registered quarterly, primary bank Barclays, direct debit enabled."
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
            >
              {isSubmitting ? 'Saving...' : clientToEdit ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
