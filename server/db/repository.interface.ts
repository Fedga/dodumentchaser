// server/db/repository.interface.ts
// Abstract Repository Interface decoupling business logic from storage implementation

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

export interface ITransactionContext {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
}

export interface ClientFilterOptions {
  search?: string;
  status?: string;
  assignedStaffId?: string;
}

export interface RequestFilterOptions {
  search?: string;
  status?: string;
  clientId?: string;
  recurringScheduleId?: string;
}

export interface DocumentFilterOptions {
  search?: string;
  status?: string;
  clientId?: string;
  requestId?: string;
}

export interface ReminderFilterOptions {
  requestId?: string;
  clientId?: string;
  triggerType?: 'automated' | 'manual';
}

export interface ActivityFilterOptions {
  clientId?: string;
  requestId?: string;
  limit?: number;
}

export interface IDatabaseRepository {
  /** Database Engine identity */
  getEngineType(): 'postgresql' | 'file-json';

  /** Health check / connection verification */
  ping(): Promise<boolean>;

  /** Execute work inside an ACID transaction */
  withTransaction<T>(work: (tx: ITransactionContext) => Promise<T>): Promise<T>;

  // ----------------------------------------------------
  // FIRMS
  // ----------------------------------------------------
  getFirms(): Promise<Firm[]>;
  getFirmById(id: string): Promise<Firm | null>;
  upsertFirm(firm: Partial<Firm> & { id: string }): Promise<Firm>;

  // ----------------------------------------------------
  // USERS
  // ----------------------------------------------------
  getUsers(firmId: string): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;

  // ----------------------------------------------------
  // SESSIONS
  // ----------------------------------------------------
  getSessionByToken(token: string): Promise<Session | null>;
  createSession(session: Session): Promise<Session>;
  revokeSession(token: string): Promise<void>;

  // ----------------------------------------------------
  // CLIENTS (Tenant-isolated by firmId)
  // ----------------------------------------------------
  getClients(firmId: string, filters?: ClientFilterOptions): Promise<Client[]>;
  getClientById(id: string, firmId: string): Promise<Client | null>;
  createClient(client: Client): Promise<Client>;
  updateClient(id: string, firmId: string, updates: Partial<Client>): Promise<Client | null>;

  // ----------------------------------------------------
  // DOCUMENT REQUESTS (Tenant-isolated by firmId)
  // ----------------------------------------------------
  getRequests(firmId: string, filters?: RequestFilterOptions): Promise<DocumentRequest[]>;
  getRequestById(id: string, firmId?: string): Promise<DocumentRequest | null>;
  getRequestByPortalTokenHash(tokenHash: string): Promise<DocumentRequest | null>;
  createRequest(request: DocumentRequest): Promise<DocumentRequest>;
  updateRequest(id: string, firmId: string, updates: Partial<DocumentRequest>): Promise<DocumentRequest | null>;

  // ----------------------------------------------------
  // DOCUMENT REQUIREMENTS
  // ----------------------------------------------------
  getRequirements(requestId: string): Promise<DocumentRequirement[]>;
  getRequirementById(id: string): Promise<DocumentRequirement | null>;
  createRequirements(requirements: DocumentRequirement[]): Promise<DocumentRequirement[]>;
  updateRequirement(id: string, updates: Partial<DocumentRequirement>): Promise<DocumentRequirement | null>;

  // ----------------------------------------------------
  // DOCUMENTS (Central Repository)
  // ----------------------------------------------------
  getDocuments(firmId: string, filters?: DocumentFilterOptions): Promise<DocumentFile[]>;
  getDocumentById(id: string, firmId?: string): Promise<DocumentFile | null>;
  createDocument(document: DocumentFile): Promise<DocumentFile>;
  updateDocument(id: string, firmId: string, updates: Partial<DocumentFile>): Promise<DocumentFile | null>;
  deleteDocument(id: string, firmId: string): Promise<boolean>;

  // ----------------------------------------------------
  // REMINDERS
  // ----------------------------------------------------
  getReminders(firmId: string, filters?: ReminderFilterOptions): Promise<Reminder[]>;
  createReminder(reminder: Reminder): Promise<Reminder>;
  findReminderByIdempotencyKey(key: string): Promise<Reminder | null>;

  // ----------------------------------------------------
  // TEMPLATES
  // ----------------------------------------------------
  getTemplates(firmId: string): Promise<Template[]>;
  getTemplateById(id: string, firmId: string): Promise<Template | null>;
  createTemplate(template: Template): Promise<Template>;
  updateTemplate(id: string, firmId: string, updates: Partial<Template>): Promise<Template | null>;
  deleteTemplate(id: string, firmId: string): Promise<boolean>;

  // ----------------------------------------------------
  // RECURRING SCHEDULES (recurring_requests)
  // ----------------------------------------------------
  getRecurringSchedules(firmId: string): Promise<RecurringSchedule[]>;
  getRecurringScheduleById(id: string, firmId: string): Promise<RecurringSchedule | null>;
  createRecurringSchedule(schedule: RecurringSchedule): Promise<RecurringSchedule>;
  updateRecurringSchedule(id: string, firmId: string, updates: Partial<RecurringSchedule>): Promise<RecurringSchedule | null>;

  // ----------------------------------------------------
  // ACTIVITY LOGS (Audit Trail)
  // ----------------------------------------------------
  getActivityLogs(firmId: string, filters?: ActivityFilterOptions): Promise<ActivityLog[]>;
  createActivityLog(log: ActivityLog): Promise<ActivityLog>;
}
