import { DashboardStats, Client, DocumentRequest, DocumentFile, Template, Reminder, ReminderQueueItem, ActivityLog, Firm, User, RecurringSchedule } from './types';

// In-memory session token store initialized with default session or restored from session
let currentAuthToken: string = 'token_sarah_admin_firm_a';

export function setAuthToken(token: string) {
  currentAuthToken = token;
}

export function getAuthToken(): string {
  return currentAuthToken;
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (currentAuthToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentAuthToken}`);
  }
  return fetch(url, { ...options, headers });
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    const error = new Error(errorBody.error || `HTTP error ${res.status}`);
    (error as any).status = res.status;
    (error as any).code = errorBody.code;
    throw error;
  }
  return res.json();
}

export const api = {
  // Auth endpoints
  login: (credentials: { email?: string; userId?: string }) =>
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
      .then(res => handleResponse<{ success: boolean; token: string; user: User; firm: Firm }>(res))
      .then(data => {
        setAuthToken(data.token);
        return data;
      }),

  logout: () =>
    authFetch('/api/auth/logout', { method: 'POST' })
      .then(res => handleResponse<{ success: boolean }>(res))
      .finally(() => {
        setAuthToken('');
      }),

  switchAccount: (userId: string) =>
    fetch('/api/auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
      .then(res => handleResponse<{ success: boolean; token: string; user: User; firm: Firm }>(res))
      .then(data => {
        setAuthToken(data.token);
        return data;
      }),

  getAvailableAccounts: () =>
    fetch('/api/auth/accounts').then(res => handleResponse<Array<{ userId: string; name: string; email: string; role: string; firmId: string; firmName: string }>>(res)),

  getMe: () => authFetch('/api/me').then(res => handleResponse<{ user: User; firm: Firm }>(res)),

  updateFirm: (data: Partial<Firm>) =>
    authFetch('/api/firm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<{ success: boolean; firm: Firm }>(res)),

  updateChasingEstimate: (minutes: number) =>
    authFetch('/api/firm/chasing-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes }),
    }).then(res => handleResponse<{ success: boolean; manualChasingMinutesPerDoc: number }>(res)),

  // Dashboard Stats
  getStats: () => authFetch('/api/stats').then(res => handleResponse<DashboardStats>(res)),

  // Clients
  getClients: (params?: { search?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    return authFetch(`/api/clients?${query.toString()}`).then(res => handleResponse<Client[]>(res));
  },
  getClient: (id: string) => authFetch(`/api/clients/${id}`).then(res => handleResponse<any>(res)),
  createClient: (data: Partial<Client>) =>
    authFetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<Client>(res)),
  updateClient: (id: string, data: Partial<Client>) =>
    authFetch(`/api/clients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<Client>(res)),
  archiveClient: (id: string) =>
    authFetch(`/api/clients/${id}/archive`, { method: 'POST' }).then(res => handleResponse<{ success: boolean }>(res)),

  // Requests
  getRequests: (params?: { search?: string; status?: string; clientId?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.clientId) query.set('clientId', params.clientId);
    return authFetch(`/api/requests?${query.toString()}`).then(res => handleResponse<DocumentRequest[]>(res));
  },
  getRequest: (id: string) => authFetch(`/api/requests/${id}`).then(res => handleResponse<any>(res)),
  createRequest: (data: any) =>
    authFetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<DocumentRequest>(res)),
  updateRequest: (id: string, data: any) =>
    authFetch(`/api/requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<DocumentRequest>(res)),
  closeRequest: (id: string) =>
    authFetch(`/api/requests/${id}/close`, { method: 'POST' }).then(res => handleResponse<{ success: boolean }>(res)),
  sendReminder: (requestId: string) =>
    authFetch(`/api/requests/${requestId}/remind`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; reminder: Reminder }>(res)),
  sendChaser: (requestId: string) =>
    authFetch(`/api/requests/${requestId}/send-chaser`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; sent: boolean; reminder?: Reminder; missingDocuments: string[]; reason: string }>(res)),
  pauseReminders: (requestId: string) =>
    authFetch(`/api/requests/${requestId}/pause-reminders`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; remindersPaused: boolean }>(res)),
  resumeReminders: (requestId: string) =>
    authFetch(`/api/requests/${requestId}/resume-reminders`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; remindersPaused: boolean }>(res)),
  toggleReminders: (requestId: string) =>
    authFetch(`/api/requests/${requestId}/toggle-reminders`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; remindersPaused: boolean }>(res)),
  rotatePortalToken: (requestId: string, expiresInDays?: number) =>
    authFetch(`/api/requests/${requestId}/portal-token/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresInDays }),
    }).then(res => handleResponse<{ success: boolean; portalToken: string; portalUrl: string; expiresAt: string; message: string }>(res)),
  revokePortalToken: (requestId: string) =>
    authFetch(`/api/requests/${requestId}/portal-token/revoke`, {
      method: 'POST',
    }).then(res => handleResponse<{ success: boolean; message: string }>(res)),

  // Requirements & Approval
  addRequirement: (requestId: string, item: { name: string; description?: string; required?: boolean }) =>
    authFetch(`/api/requests/${requestId}/requirements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    }).then(res => handleResponse<any>(res)),
  deleteRequirement: (id: string) =>
    authFetch(`/api/requirements/${id}`, { method: 'DELETE' }).then(res => handleResponse<{ success: boolean }>(res)),
  approveRequirement: (id: string) =>
    authFetch(`/api/requirements/${id}/approve`, { method: 'POST' }).then(res => handleResponse<{ success: boolean }>(res)),
  rejectRequirement: (id: string, reason: string) =>
    authFetch(`/api/requirements/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).then(res => handleResponse<{ success: boolean }>(res)),

  // Central Documents
  getDocuments: (params?: { search?: string; status?: string; clientId?: string; requestId?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.requestId) query.set('requestId', params.requestId);
    return authFetch(`/api/documents?${query.toString()}`).then(res => handleResponse<DocumentFile[]>(res));
  },
  deleteDocument: (id: string) =>
    authFetch(`/api/documents/${id}`, { method: 'DELETE' }).then(res => handleResponse<{ success: boolean; message: string }>(res)),

  // Templates
  getTemplates: () => authFetch('/api/templates').then(res => handleResponse<Template[]>(res)),
  createTemplate: (data: Partial<Template>) =>
    authFetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<Template>(res)),
  updateTemplate: (id: string, data: Partial<Template>) =>
    authFetch(`/api/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<Template>(res)),
  duplicateTemplate: (id: string) =>
    authFetch(`/api/templates/${id}/duplicate`, { method: 'POST' }).then(res => handleResponse<Template>(res)),
  deleteTemplate: (id: string) =>
    authFetch(`/api/templates/${id}`, { method: 'DELETE' }).then(res => handleResponse<{ success: boolean }>(res)),

  // Recurring Schedules
  getRecurringSchedules: () =>
    authFetch('/api/recurring-schedules').then(res => handleResponse<RecurringSchedule[]>(res)),
  getRecurringSchedule: (id: string) =>
    authFetch(`/api/recurring-schedules/${id}`).then(res => handleResponse<RecurringSchedule>(res)),
  createRecurringSchedule: (data: Partial<RecurringSchedule> & { generateFirstImmediately?: boolean }) =>
    authFetch('/api/recurring-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<RecurringSchedule & { firstRequest?: DocumentRequest }>(res)),
  updateRecurringSchedule: (id: string, data: Partial<RecurringSchedule>) =>
    authFetch(`/api/recurring-schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => handleResponse<RecurringSchedule>(res)),
  pauseRecurringSchedule: (id: string) =>
    authFetch(`/api/recurring-schedules/${id}/pause`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; schedule: RecurringSchedule }>(res)),
  resumeRecurringSchedule: (id: string) =>
    authFetch(`/api/recurring-schedules/${id}/resume`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; schedule: RecurringSchedule }>(res)),
  stopRecurringSchedule: (id: string) =>
    authFetch(`/api/recurring-schedules/${id}/stop`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; schedule: RecurringSchedule }>(res)),
  generateNowRecurringSchedule: (id: string) =>
    authFetch(`/api/recurring-schedules/${id}/generate-now`, { method: 'POST' }).then(res => handleResponse<{ success: boolean; request: DocumentRequest; message: string }>(res)),
  deleteRecurringSchedule: (id: string) =>
    authFetch(`/api/recurring-schedules/${id}`, { method: 'DELETE' }).then(res => handleResponse<{ success: boolean }>(res)),
  runDueRecurringSchedules: () =>
    authFetch('/api/recurring-schedules/run-due', { method: 'POST' }).then(res => handleResponse<{ success: boolean; generatedCount: number; processedCount: number; requests: DocumentRequest[] }>(res)),

  // Reminders & Activities
  getReminders: () =>
    authFetch('/api/reminders').then(res => handleResponse<{ queue: ReminderQueueItem[]; history: Reminder[]; providerName: string }>(res)),
  runBatchChasing: () =>
    authFetch('/api/chasing/run', { method: 'POST' }).then(res => handleResponse<{ success: boolean; processedCount: number; sentCount: number; completedCount: number; skippedCount: number }>(res)),
  bulkSendReminders: (requestIds: string[], respectFrequency = true) =>
    authFetch('/api/reminders/bulk-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestIds, respectFrequency }),
    }).then(res => handleResponse<{
      success: boolean;
      processedCount: number;
      sentCount: number;
      skippedCount: number;
      results: Array<{
        requestId: string;
        sent: boolean;
        reason: string;
        clientName?: string;
        companyName?: string;
        missingDocuments?: string[];
      }>;
    }>(res)),
  getActivity: () => authFetch('/api/activity').then(res => handleResponse<ActivityLog[]>(res)),

  // Client Portal (Unauthenticated token access)
  getPortal: (token: string) => fetch(`/api/portal/${token}`).then(res => handleResponse<any>(res)),
  uploadPortalDocument: (token: string, payload: { requirementId: string; filename: string; mimeType: string; sizeBytes: number; fileDataUri: string }) =>
    fetch(`/api/portal/${token}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(res => handleResponse<any>(res)),
  markPortalNA: (token: string, requirementId: string, reason: string) =>
    fetch(`/api/portal/${token}/mark-na`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirementId, reason }),
    }).then(res => handleResponse<any>(res)),
  addPortalNote: (token: string, requirementId: string, note: string) =>
    fetch(`/api/portal/${token}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirementId, note }),
    }).then(res => handleResponse<any>(res)),

  // AI Assistant Suggestions
  suggestRequirements: (requestName: string, period?: string, existingItems?: string[]) =>
    authFetch('/api/ai/suggest-requirements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestName, period, existingItems }),
    }).then(res => handleResponse<{ suggestedRequirements: Array<{ name: string; description: string; required: boolean }>; tips: string[] }>(res)),
  draftReminder: (clientName: string, requestName: string, missingDocs: string[], tone: string) =>
    authFetch('/api/ai/draft-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, requestName, missingDocs, tone }),
    }).then(res => handleResponse<{ subject: string; body: string }>(res)),
};
