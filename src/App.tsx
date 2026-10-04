import React, { useState, useEffect } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import { Sidebar, NavView } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { DashboardView } from './views/DashboardView';
import { ClientsView } from './views/ClientsView';
import { ClientDetailView } from './views/ClientDetailView';
import { RequestsView } from './views/RequestsView';
import { RequestDetailView } from './views/RequestDetailView';
import { DocumentsView } from './views/DocumentsView';
import { RecurringView } from './views/RecurringView';
import { RemindersView } from './views/RemindersView';
import { TemplatesView } from './views/TemplatesView';
import { SettingsView } from './views/SettingsView';
import { ClientPortalView } from './views/ClientPortalView';
import { LandingPageView } from './views/LandingPageView';
import { NewRequestModal } from './components/NewRequestModal';
import { NewClientModal } from './components/NewClientModal';
import { User, Firm, Client, Template, DashboardStats } from './types';
import { api } from './api';

function MainAppContent() {
  const { showToast } = useToast();
  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [portalToken, setPortalToken] = useState<string>('portal_abc_march2027_sec9812');

  const [user, setUser] = useState<User | null>(null);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Modals
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [preselectedClientId, setPreselectedClientId] = useState<string | undefined>(undefined);

  // Mobile drawer
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check initial URL path (e.g. /portal/xyz)
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/portal/')) {
      const token = path.replace('/portal/', '');
      if (token) {
        setPortalToken(token);
        setCurrentView('portal');
      }
    }
  }, []);

  const loadInitialData = async () => {
    try {
      const [meData, clientsData, templatesData, statsData] = await Promise.all([
        api.getMe(),
        api.getClients(),
        api.getTemplates(),
        api.getStats(),
      ]);
      setUser(meData.user);
      setFirm(meData.firm);
      setClients(clientsData);
      setTemplates(templatesData);
      setStats(statsData);
    } catch (err: any) {
      console.error('Initialization error:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const [requestsFilter, setRequestsFilter] = useState<string>('All');
  const [clientsFilter, setClientsFilter] = useState<string>('All');
  const [documentsFilter, setDocumentsFilter] = useState<string>('All');
  const [remindersTab, setRemindersTab] = useState<'queue' | 'history'>('queue');

  // Handlers for navigation
  const handleNavigateToView = (
    view: 'clients' | 'requests' | 'reminders' | 'documents',
    filter?: { status?: string; tab?: 'queue' | 'history' }
  ) => {
    if (view === 'requests') {
      setSelectedRequestId(null);
      setRequestsFilter(filter?.status || 'All');
      setCurrentView('requests');
    } else if (view === 'reminders') {
      setRemindersTab(filter?.tab || 'queue');
      setCurrentView('reminders');
    } else if (view === 'clients') {
      setSelectedClientId(null);
      setClientsFilter(filter?.status || 'All');
      setCurrentView('clients');
    } else if (view === 'documents') {
      setDocumentsFilter(filter?.status || 'All');
      setCurrentView('documents');
    }
  };

  const handleOpenClient = (clientId: string) => {
    setSelectedClientId(clientId);
    setCurrentView('clients');
  };

  const handleOpenRequest = (requestId: string) => {
    setSelectedRequestId(requestId);
    setCurrentView('requests');
  };

  const handleOpenPortalFromRequest = (token: string) => {
    setPortalToken(token);
    setCurrentView('portal');
  };

  const handleOpenNewRequestModal = (forClientId?: string) => {
    setPreselectedClientId(forClientId);
    setIsNewRequestModalOpen(true);
  };

  const handleOpenNewClientModal = (client?: Client) => {
    setClientToEdit(client || null);
    setIsNewClientModalOpen(true);
  };

  // If viewing the client portal, render standalone portal (clients must not see accountant dashboard)
  if (currentView === 'portal') {
    return (
      <ClientPortalView
        initialToken={portalToken}
        onExitToDashboard={() => {
          setCurrentView('dashboard');
          loadInitialData();
        }}
      />
    );
  }

  // If viewing landing page
  if (currentView === 'landing') {
    return (
      <LandingPageView
        onLaunchApp={() => {
          setCurrentView('dashboard');
          loadInitialData();
        }}
        onOpenPortalDemo={() => {
          setPortalToken('portal_abc_march2027_sec9812');
          setCurrentView('portal');
        }}
      />
    );
  }

  // Main Accountant Application
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900">
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={view => {
          if (view === 'clients') setSelectedClientId(null);
          if (view === 'requests') setSelectedRequestId(null);
          setCurrentView(view);
        }}
        user={user}
        firm={firm}
        missingTotalCount={stats?.documentsAwaitingClient || 0}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main View Area (offset by 256px sidebar on desktop) */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <TopNav
          currentView={currentView}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenNewRequestModal={() => handleOpenNewRequestModal()}
          onOpenPortalDemo={() => {
            setPortalToken('portal_abc_march2027_sec9812');
            setCurrentView('portal');
          }}
          totalMissingCount={stats?.documentsAwaitingClient || 0}
          user={user}
          firm={firm}
          onAccountSwitched={loadInitialData}
        />

        <main className="flex-1 pb-16">
          {currentView === 'dashboard' && (
            <DashboardView
              onOpenRequest={handleOpenRequest}
              onOpenClient={handleOpenClient}
              onNewRequest={() => handleOpenNewRequestModal()}
              onViewAllRequests={() => {
                setSelectedRequestId(null);
                setRequestsFilter('All');
                setCurrentView('requests');
              }}
              onOpenPortalDemo={() => {
                setPortalToken('portal_abc_march2027_sec9812');
                setCurrentView('portal');
              }}
              onNavigateToView={handleNavigateToView}
            />
          )}

          {currentView === 'clients' && (
            selectedClientId ? (
              <ClientDetailView
                clientId={selectedClientId}
                onBack={() => setSelectedClientId(null)}
                onOpenRequest={handleOpenRequest}
                onCreateRequestForClient={cid => handleOpenNewRequestModal(cid)}
                onEditClient={client => handleOpenNewClientModal(client)}
              />
            ) : (
              <ClientsView
                onOpenClient={handleOpenClient}
                onOpenNewClientModal={() => handleOpenNewClientModal()}
                initialStatusFilter={clientsFilter}
              />
            )
          )}

          {currentView === 'requests' && (
            selectedRequestId ? (
              <RequestDetailView
                requestId={selectedRequestId}
                onBack={() => setSelectedRequestId(null)}
                onOpenPortal={handleOpenPortalFromRequest}
              />
            ) : (
              <RequestsView
                onOpenRequest={handleOpenRequest}
                onOpenNewRequestModal={() => handleOpenNewRequestModal()}
                onOpenClientPortal={handleOpenPortalFromRequest}
                initialStatusFilter={requestsFilter}
              />
            )
          )}

          {currentView === 'recurring' && (
            <RecurringView
              onOpenRequest={handleOpenRequest}
              onOpenClient={handleOpenClient}
            />
          )}

          {currentView === 'documents' && <DocumentsView initialStatusFilter={documentsFilter} />}

          {currentView === 'reminders' && <RemindersView initialTab={remindersTab} />}

          {currentView === 'templates' && <TemplatesView />}

          {currentView === 'settings' && (
            <SettingsView
              user={user}
              firm={firm}
              onFirmUpdated={updatedFirm => setFirm(updatedFirm)}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <NewRequestModal
        isOpen={isNewRequestModalOpen}
        onClose={() => setIsNewRequestModalOpen(false)}
        clients={clients}
        templates={templates}
        preselectedClientId={preselectedClientId}
        onRequestCreated={newRequestId => {
          setSelectedRequestId(newRequestId);
          setCurrentView('requests');
          loadInitialData();
        }}
      />

      <NewClientModal
        isOpen={isNewClientModalOpen}
        onClose={() => setIsNewClientModalOpen(false)}
        clientToEdit={clientToEdit}
        onClientCreated={() => {
          loadInitialData();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <MainAppContent />
    </ToastProvider>
  );
}
