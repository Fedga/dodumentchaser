// server/db/fileRepository.ts
// File-Backed JSON Storage implementation of IDatabaseRepository (Preserves existing behavior)

import {
  IDatabaseRepository,
  ITransactionContext,
  ClientFilterOptions,
  RequestFilterOptions,
  DocumentFilterOptions,
  ReminderFilterOptions,
  ActivityFilterOptions
} from './repository.interface.js';
import { db } from '../storage.js';
import {
  Firm,
  User,
  Client,
  DocumentRequest,
  DocumentRequirement,
  DocumentFile,
  Reminder,
  Template,
  ActivityLog,
  Session,
  RecurringSchedule
} from '../types.js';

export class FileDatabaseRepository implements IDatabaseRepository {
  getEngineType(): 'file-json' {
    return 'file-json';
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async withTransaction<T>(work: (tx: ITransactionContext) => Promise<T>): Promise<T> {
    const txContext: ITransactionContext = {
      query: async () => [],
      commit: async () => db.commit(),
      rollback: async () => {}
    };
    const result = await work(txContext);
    db.commit();
    return result;
  }

  // ----------------------------------------------------
  // FIRMS
  // ----------------------------------------------------
  async getFirms(): Promise<Firm[]> {
    return db.getData().firms;
  }

  async getFirmById(id: string): Promise<Firm | null> {
    return db.getData().firms.find(f => f.id === id) || null;
  }

  async upsertFirm(firm: Partial<Firm> & { id: string }): Promise<Firm> {
    const data = db.getData();
    let existing = data.firms.find(f => f.id === firm.id);
    if (existing) {
      Object.assign(existing, firm);
    } else {
      existing = {
        id: firm.id,
        name: firm.name || 'Practice Firm',
        logoUrl: firm.logoUrl || '',
        defaultReminderDays: firm.defaultReminderDays || 3,
        defaultMaxReminders: firm.defaultMaxReminders || 5,
        defaultReminderSubject: firm.defaultReminderSubject || 'Documents still needed for {{request_name}}',
        defaultReminderBody: firm.defaultReminderBody || 'Please submit: {{missing_documents}}',
        plan: firm.plan || 'Professional',
        manualChasingMinutesPerDoc: firm.manualChasingMinutesPerDoc || 5,
        createdAt: new Date().toISOString()
      };
      data.firms.push(existing);
    }
    db.commit();
    return existing;
  }

  // ----------------------------------------------------
  // USERS
  // ----------------------------------------------------
  async getUsers(firmId: string): Promise<User[]> {
    return db.getData().users.filter(u => u.firmId === firmId);
  }

  async getUserById(id: string): Promise<User | null> {
    return db.getData().users.find(u => u.id === id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return db.getData().users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  // ----------------------------------------------------
  // SESSIONS
  // ----------------------------------------------------
  async getSessionByToken(token: string): Promise<Session | null> {
    return db.getData().sessions.find(s => s.token === token && new Date(s.expiresAt) > new Date()) || null;
  }

  async createSession(session: Session): Promise<Session> {
    const data = db.getData();
    data.sessions = data.sessions || [];
    const idx = data.sessions.findIndex(s => s.token === session.token);
    if (idx >= 0) {
      data.sessions[idx] = session;
    } else {
      data.sessions.push(session);
    }
    db.commit();
    return session;
  }

  async revokeSession(token: string): Promise<void> {
    const data = db.getData();
    if (data.sessions) {
      data.sessions = data.sessions.filter(s => s.token !== token);
      db.commit();
    }
  }

  // ----------------------------------------------------
  // CLIENTS
  // ----------------------------------------------------
  async getClients(firmId: string, filters?: ClientFilterOptions): Promise<Client[]> {
    let clients = db.getData().clients.filter(c => c.firmId === firmId);
    if (filters?.status && filters.status !== 'All') {
      clients = clients.filter(c => c.status === filters.status);
    }
    if (filters?.assignedStaffId) {
      clients = clients.filter(c => c.assignedStaffId === filters.assignedStaffId);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      clients = clients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }
    return clients;
  }

  async getClientById(id: string, firmId: string): Promise<Client | null> {
    return db.getData().clients.find(c => c.id === id && c.firmId === firmId) || null;
  }

  async createClient(client: Client): Promise<Client> {
    db.getData().clients.unshift(client);
    db.commit();
    return client;
  }

  async updateClient(id: string, firmId: string, updates: Partial<Client>): Promise<Client | null> {
    const client = await this.getClientById(id, firmId);
    if (!client) return null;
    Object.assign(client, updates, { updatedAt: new Date().toISOString() });
    db.commit();
    return client;
  }

  // ----------------------------------------------------
  // DOCUMENT REQUESTS
  // ----------------------------------------------------
  async getRequests(firmId: string, filters?: RequestFilterOptions): Promise<DocumentRequest[]> {
    let requests = db.getData().requests.filter(r => r.firmId === firmId);
    if (filters?.clientId) {
      requests = requests.filter(r => r.clientId === filters.clientId);
    }
    if (filters?.recurringScheduleId) {
      requests = requests.filter(r => r.recurringScheduleId === filters.recurringScheduleId);
    }
    if (filters?.status && filters.status !== 'All') {
      requests = requests.filter(r => r.status === filters.status);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      requests = requests.filter(r => r.name.toLowerCase().includes(q) || r.period.toLowerCase().includes(q));
    }
    return requests;
  }

  async getRequestById(id: string, firmId?: string): Promise<DocumentRequest | null> {
    if (firmId) {
      return db.getData().requests.find(r => r.id === id && r.firmId === firmId) || null;
    }
    return db.getData().requests.find(r => r.id === id) || null;
  }

  async getRequestByPortalTokenHash(tokenHash: string): Promise<DocumentRequest | null> {
    return db.getData().requests.find(r => r.portalTokenHash === tokenHash && !r.portalTokenRevoked) || null;
  }

  async createRequest(request: DocumentRequest): Promise<DocumentRequest> {
    db.getData().requests.unshift(request);
    db.commit();
    return request;
  }

  async updateRequest(id: string, firmId: string, updates: Partial<DocumentRequest>): Promise<DocumentRequest | null> {
    const request = await this.getRequestById(id, firmId);
    if (!request) return null;
    Object.assign(request, updates, { updatedAt: new Date().toISOString() });
    db.commit();
    return request;
  }

  // ----------------------------------------------------
  // DOCUMENT REQUIREMENTS
  // ----------------------------------------------------
  async getRequirements(requestId: string): Promise<DocumentRequirement[]> {
    return db.getData().requirements.filter(r => r.requestId === requestId);
  }

  async getRequirementById(id: string): Promise<DocumentRequirement | null> {
    return db.getData().requirements.find(r => r.id === id) || null;
  }

  async createRequirements(requirements: DocumentRequirement[]): Promise<DocumentRequirement[]> {
    db.getData().requirements.push(...requirements);
    db.commit();
    return requirements;
  }

  async updateRequirement(id: string, updates: Partial<DocumentRequirement>): Promise<DocumentRequirement | null> {
    const item = await this.getRequirementById(id);
    if (!item) return null;
    Object.assign(item, updates, { updatedAt: new Date().toISOString() });
    db.commit();
    return item;
  }

  // ----------------------------------------------------
  // DOCUMENTS
  // ----------------------------------------------------
  async getDocuments(firmId: string, filters?: DocumentFilterOptions): Promise<DocumentFile[]> {
    let docs = db.getData().documents.filter(d => d.firmId === firmId);
    if (filters?.requestId) docs = docs.filter(d => d.requestId === filters.requestId);
    if (filters?.status && filters.status !== 'All') docs = docs.filter(d => d.status === filters.status);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      docs = docs.filter(d => d.filename.toLowerCase().includes(q) || d.originalName.toLowerCase().includes(q));
    }
    return docs;
  }

  async getDocumentById(id: string, firmId?: string): Promise<DocumentFile | null> {
    if (firmId) {
      return db.getData().documents.find(d => d.id === id && d.firmId === firmId) || null;
    }
    return db.getData().documents.find(d => d.id === id) || null;
  }

  async createDocument(doc: DocumentFile): Promise<DocumentFile> {
    db.getData().documents.unshift(doc);
    db.commit();
    return doc;
  }

  async updateDocument(id: string, firmId: string, updates: Partial<DocumentFile>): Promise<DocumentFile | null> {
    const doc = await this.getDocumentById(id, firmId);
    if (!doc) return null;
    Object.assign(doc, updates);
    db.commit();
    return doc;
  }

  async deleteDocument(id: string, firmId: string): Promise<boolean> {
    const data = db.getData();
    const idx = data.documents.findIndex(d => d.id === id && d.firmId === firmId);
    if (idx >= 0) {
      data.documents.splice(idx, 1);
      db.commit();
      return true;
    }
    return false;
  }

  // ----------------------------------------------------
  // REMINDERS
  // ----------------------------------------------------
  async getReminders(firmId: string, filters?: ReminderFilterOptions): Promise<Reminder[]> {
    let reminders = db.getData().reminders.filter(r => r.firmId === firmId);
    if (filters?.requestId) reminders = reminders.filter(r => r.requestId === filters.requestId);
    if (filters?.clientId) reminders = reminders.filter(r => r.clientId === filters.clientId);
    if (filters?.triggerType) reminders = reminders.filter(r => r.triggerType === filters.triggerType);
    return reminders;
  }

  async createReminder(rem: Reminder): Promise<Reminder> {
    db.getData().reminders.unshift(rem);
    db.commit();
    return rem;
  }

  async findReminderByIdempotencyKey(key: string): Promise<Reminder | null> {
    return db.getData().reminders.find(r => r.idempotencyKey === key) || null;
  }

  // ----------------------------------------------------
  // TEMPLATES
  // ----------------------------------------------------
  async getTemplates(firmId: string): Promise<Template[]> {
    return db.getData().templates.filter(t => t.firmId === firmId);
  }

  async getTemplateById(id: string, firmId: string): Promise<Template | null> {
    return db.getData().templates.find(t => t.id === id && t.firmId === firmId) || null;
  }

  async createTemplate(template: Template): Promise<Template> {
    db.getData().templates.push(template);
    db.commit();
    return template;
  }

  async updateTemplate(id: string, firmId: string, updates: Partial<Template>): Promise<Template | null> {
    const tmpl = await this.getTemplateById(id, firmId);
    if (!tmpl) return null;
    Object.assign(tmpl, updates);
    db.commit();
    return tmpl;
  }

  async deleteTemplate(id: string, firmId: string): Promise<boolean> {
    const data = db.getData();
    const idx = data.templates.findIndex(t => t.id === id && t.firmId === firmId);
    if (idx >= 0) {
      data.templates.splice(idx, 1);
      db.commit();
      return true;
    }
    return false;
  }

  // ----------------------------------------------------
  // RECURRING SCHEDULES
  // ----------------------------------------------------
  async getRecurringSchedules(firmId: string): Promise<RecurringSchedule[]> {
    return db.getData().recurringSchedules.filter(s => s.firmId === firmId);
  }

  async getRecurringScheduleById(id: string, firmId: string): Promise<RecurringSchedule | null> {
    return db.getData().recurringSchedules.find(s => s.id === id && s.firmId === firmId) || null;
  }

  async createRecurringSchedule(sched: RecurringSchedule): Promise<RecurringSchedule> {
    db.getData().recurringSchedules.unshift(sched);
    db.commit();
    return sched;
  }

  async updateRecurringSchedule(id: string, firmId: string, updates: Partial<RecurringSchedule>): Promise<RecurringSchedule | null> {
    const sched = await this.getRecurringScheduleById(id, firmId);
    if (!sched) return null;
    Object.assign(sched, updates, { updatedAt: new Date().toISOString() });
    db.commit();
    return sched;
  }

  // ----------------------------------------------------
  // ACTIVITY LOGS
  // ----------------------------------------------------
  async getActivityLogs(firmId: string, filters?: ActivityFilterOptions): Promise<ActivityLog[]> {
    let logs = db.getData().activityLogs.filter(a => a.firmId === firmId);
    if (filters?.clientId) logs = logs.filter(a => a.clientId === filters.clientId);
    if (filters?.requestId) logs = logs.filter(a => a.requestId === filters.requestId);
    if (filters?.limit) logs = logs.slice(0, filters.limit);
    return logs;
  }

  async createActivityLog(log: ActivityLog): Promise<ActivityLog> {
    db.getData().activityLogs.unshift(log);
    db.commit();
    return log;
  }
}
