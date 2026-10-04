import React, { useState, useEffect } from 'react';
import { Search, Plus, Archive, Edit2, ChevronRight, Mail, Phone, Building2, User, FileText } from 'lucide-react';
import { Client, ClientStatus } from '../types';
import { api } from '../api';
import { useToast } from '../components/Toast';

interface ClientsViewProps {
  onOpenClient: (clientId: string) => void;
  onOpenNewClientModal: () => void;
  initialStatusFilter?: string;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  onOpenClient,
  onOpenNewClientModal,
  initialStatusFilter = 'All',
}) => {
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const data = await api.getClients({ search, status: statusFilter });
      setClients(data);
    } catch (err: any) {
      showToast('Failed to load clients: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [search, statusFilter]);

  const handleArchive = async (e: React.MouseEvent, clientId: string, companyName: string) => {
    e.stopPropagation();
    try {
      await api.archiveClient(clientId);
      showToast(`Archived client ${companyName}`);
      loadClients();
    } catch (err: any) {
      showToast('Could not archive client: ' + err.message, 'error');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Clients</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage practice client companies, assigned accountants, and missing document loads.
          </p>
        </div>

        <button
          onClick={onOpenNewClientModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Client</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search company, director or email..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-colors"
          />
        </div>

        {/* Status segmented tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto overflow-x-auto">
          {['All', 'Active', 'Onboarding', 'Paused', 'Archived'].map(status => (
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

      {/* Clients Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80 font-medium">
              <tr>
                <th className="py-2.5 px-4">Company Name</th>
                <th className="py-2.5 px-3">Primary Contact</th>
                <th className="py-2.5 px-3">Assigned Staff</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Active Requests</th>
                <th className="py-2.5 px-3">Missing Docs</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No clients match current filters.
                  </td>
                </tr>
              ) : (
                clients.map(client => (
                  <tr
                    key={client.id}
                    onClick={() => onOpenClient(client.id)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="group-hover:text-blue-600 transition-colors">{client.companyName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-slate-900 font-medium">{client.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{client.email}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {client.assignedStaffName || 'Unassigned'}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[11px] font-medium ${
                          client.status === 'Active'
                            ? 'text-emerald-700'
                            : client.status === 'Onboarding'
                            ? 'text-blue-700'
                            : client.status === 'Paused'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-slate-700">
                      {client.activeRequestsCount ?? 0}
                    </td>
                    <td className="py-3 px-3">
                      {(client.missingDocumentsCount || 0) > 0 ? (
                        <span className="font-mono tabular-nums font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[11px]">
                          {client.missingDocumentsCount} missing
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-600 font-medium">All received</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5" onClick={e => e.stopPropagation()}>
                      {client.status !== 'Archived' && (
                        <button
                          onClick={e => handleArchive(e, client.id, client.companyName)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                          title="Archive client"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => onOpenClient(client.id)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
