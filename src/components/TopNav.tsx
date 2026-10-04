import React, { useState, useEffect } from 'react';
import { Menu, Plus, ExternalLink, ShieldCheck, ChevronDown, User, LogOut, Building2 } from 'lucide-react';
import { NavView } from './Sidebar';
import { User as UserType, Firm as FirmType } from '../types';
import { api } from '../api';
import { useToast } from './Toast';

interface TopNavProps {
  currentView: NavView;
  onOpenMobileMenu: () => void;
  onOpenNewRequestModal: () => void;
  onOpenPortalDemo: () => void;
  totalMissingCount?: number;
  user: UserType | null;
  firm: FirmType | null;
  onAccountSwitched: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentView,
  onOpenMobileMenu,
  onOpenNewRequestModal,
  onOpenPortalDemo,
  totalMissingCount = 0,
  user,
  firm,
  onAccountSwitched,
}) => {
  const { showToast } = useToast();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<Array<{ userId: string; name: string; email: string; role: string; firmId: string; firmName: string }>>([]);

  useEffect(() => {
    api.getAvailableAccounts().then(setAvailableAccounts).catch(() => {});
  }, []);

  const handleSwitch = async (targetUserId: string) => {
    try {
      const data = await api.switchAccount(targetUserId);
      showToast(`Switched active session to ${data.user.name} (${data.firm.name})`);
      setIsSwitcherOpen(false);
      onAccountSwitched();
    } catch (err: any) {
      showToast('Account switch failed: ' + err.message, 'error');
    }
  };

  const getBreadcrumbTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return 'Dashboard Overview';
      case 'clients':
        return 'Client Management';
      case 'requests':
        return 'Document Requests';
      case 'documents':
        return 'Central Document Archive';
      case 'reminders':
        return 'Automated Chaser Queue';
      case 'templates':
        return 'Request Templates';
      case 'settings':
        return 'Practice Settings';
      default:
        return 'DocumentChaser';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left zone: Mobile toggle & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
          <span className="text-slate-600">{firm?.name || 'Practice'}</span>
          <span className="text-slate-400" aria-hidden="true">/</span>
          <span className="text-slate-900 font-semibold">{getBreadcrumbTitle()}</span>
        </div>
      </div>

      {/* Right zone: Missing count indicator, Tenant Switcher & Primary Action */}
      <div className="flex items-center gap-2 sm:gap-3">
        {totalMissingCount > 0 && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-amber-50/80 border border-amber-200/80 rounded-md text-xs text-amber-800">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>
              <strong className="font-mono tabular-nums font-semibold">{totalMissingCount}</strong> documents missing
            </span>
          </div>
        )}

        {/* Tenant & User Switcher Dropdown (for Multi-Tenant and RBAC verification) */}
        <div className="relative">
          <button
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
            className="flex items-center gap-2 px-2.5 py-1 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors text-slate-800"
            title="Switch User Role or Practice Tenant to test isolation"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div className="text-left hidden sm:block">
              <div className="font-bold text-[11px] leading-tight truncate max-w-[130px]">{user?.name}</div>
              <div className="text-[10px] text-slate-500 truncate max-w-[130px]">{firm?.name}</div>
            </div>
            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${user?.role === 'admin' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {user?.role?.toUpperCase()}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
          </button>

          {isSwitcherOpen && (
            <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-lg border border-slate-200 shadow-xl py-2 z-50 text-xs animate-in fade-in duration-100">
              <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Switch Practice Account (RBAC / Tenant Test)
              </div>
              <div className="divide-y divide-slate-50">
                {availableAccounts.map(acc => {
                  const isCurrent = acc.userId === user?.id;
                  return (
                    <button
                      key={acc.userId}
                      onClick={() => handleSwitch(acc.userId)}
                      className={`w-full text-left px-3 py-2 flex items-start justify-between transition-colors ${
                        isCurrent ? 'bg-slate-50 font-bold' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-slate-900 truncate">{acc.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{acc.firmName}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${acc.role === 'admin' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {acc.role.toUpperCase()}
                        </span>
                        {isCurrent && (
                          <div className="text-[9px] text-emerald-600 font-semibold mt-0.5">Active</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onOpenPortalDemo}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
          title="Open sample Client Portal token"
        >
          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          <span>Client Portal</span>
        </button>

        <button
          onClick={onOpenNewRequestModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-xs transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>New Request</span>
        </button>
      </div>
    </header>
  );
};
