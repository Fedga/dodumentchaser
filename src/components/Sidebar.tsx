import React from 'react';
import {
  LayoutDashboard,
  Users,
  FileCheck2,
  Files,
  BellRing,
  BookmarkCheck,
  Settings,
  ExternalLink,
  ShieldCheck,
  FileText,
  Sparkles,
  ArrowUpRight,
  Menu,
  X,
  Repeat
} from 'lucide-react';
import { User, Firm } from '../types';

export type NavView = 'dashboard' | 'clients' | 'requests' | 'recurring' | 'documents' | 'reminders' | 'templates' | 'settings' | 'landing' | 'portal';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  user: User | null;
  firm: Firm | null;
  missingTotalCount?: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  user,
  firm,
  missingTotalCount = 0,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navItems = [
    { id: 'dashboard' as NavView, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients' as NavView, label: 'Clients', icon: Users },
    {
      id: 'requests' as NavView,
      label: 'Requests',
      icon: FileCheck2,
      badge: missingTotalCount > 0 ? `${missingTotalCount} missing` : undefined,
    },
    { id: 'recurring' as NavView, label: 'Recurring', icon: Repeat },
    { id: 'documents' as NavView, label: 'Documents', icon: Files },
    { id: 'reminders' as NavView, label: 'Reminders', icon: BellRing },
    { id: 'templates' as NavView, label: 'Templates', icon: BookmarkCheck },
    { id: 'settings' as NavView, label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white text-base tracking-tight leading-none">
                DocumentChaser
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-medium">
                {firm?.name || 'Example Accounting Ltd'}
              </div>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden text-slate-400 hover:text-white p-1 rounded"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Navigation */}
        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Practice Workspace
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[11px] font-mono tabular-nums text-amber-400 font-normal">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-5 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Quick Portals
          </div>

          <button
            onClick={() => {
              onNavigate('portal');
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              currentView === 'portal'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <ExternalLink className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Client Portal View</span>
            </div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Test link</span>
          </button>

          <button
            onClick={() => {
              onNavigate('landing');
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              currentView === 'landing'
                ? 'bg-slate-800 text-white'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="truncate">Public Landing Page</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {/* User profile footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-slate-800/50 transition-colors">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover border border-slate-700"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs border border-slate-700">
                {user?.name?.substring(0, 2).toUpperCase() || 'SJ'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{user?.name || 'Sarah Jenkins FCA'}</div>
              <div className="text-[11px] text-slate-400 truncate">Practice Administrator</div>
            </div>
            <div className="text-[10px] text-emerald-400 font-mono font-medium">UK VAT</div>
          </div>
        </div>
      </aside>
    </>
  );
};
