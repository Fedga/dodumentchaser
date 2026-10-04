export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  firmId: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

export interface Firm {
  id: string;
  name: string;
  logoUrl?: string;
  defaultReminderDays: number;
  defaultMaxReminders: number;
  defaultReminderSubject: string;
  defaultReminderBody: string;
  plan: 'Starter' | 'Professional' | 'Practice';
  manualChasingMinutesPerDoc?: number;
  createdAt: string;
}

export type ClientStatus = 'Active' | 'Onboarding' | 'Paused' | 'Archived';

export interface Client {
  id: string;
  firmId: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  status: ClientStatus;
  assignedStaffId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type RequestStatus = 'Active' | 'Completed' | 'Overdue' | 'Archived';

export interface DocumentRequest {
  id: string;
  firmId: string;
  clientId: string;
  name: string;
  description: string;
  period: string;
  dueDate: string;
  reminderFrequencyDays: number;
  maxReminders: number;
  remindersPaused: boolean;
  status: RequestStatus;
  portalToken?: string;
  portalTokenHash?: string;
  portalTokenExpiresAt?: string;
  portalTokenRevoked?: boolean;
  portalTokenLastRotatedAt?: string;
  recurringScheduleId?: string;
  lastReminderSentAt?: string;
  reminderCount: number;
  completedAt?: string;
  clientNotifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type RecurringFrequency = 'One-off' | 'Monthly' | 'Quarterly' | 'Annual';
export type RecurringScheduleStatus = 'Active' | 'Paused' | 'Stopped';

export interface DueDateRule {
  type: 'days_after_start' | 'day_of_month' | 'end_of_month';
  daysOffset: number; // e.g. 14 days after creation, or 15th of the month
}

export interface PeriodHistoryEntry {
  period: string;
  requestId?: string;
  status: 'Complete' | 'Waiting' | 'Not started' | 'Overdue';
  dueDate?: string;
  generatedAt?: string;
  percentage?: number;
}

export interface RecurringSchedule {
  id: string;
  firmId: string;
  clientId: string;
  templateId: string;
  name: string;
  description?: string;
  frequency: RecurringFrequency;
  nextOccurrence: string; // ISO date string (YYYY-MM-DD)
  dueDateRule: DueDateRule;
  reminderFrequencyDays: number;
  maxReminders: number;
  status: RecurringScheduleStatus;
  lastGeneratedPeriod?: string;
  lastGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type RequirementStatus = 'Missing' | 'Requested' | 'Uploaded' | 'Approved' | 'Rejected' | 'Not applicable';

export interface DocumentRequirement {
  id: string;
  requestId: string;
  name: string;
  description: string;
  required: boolean;
  status: RequirementStatus;
  rejectionReason?: string;
  clientNote?: string;
  uploadedDocumentId?: string;
  updatedAt: string;
}

export type DocumentStatus = 'Uploaded' | 'Approved' | 'Rejected';

export interface DocumentFile {
  id: string;
  firmId: string;
  requestId: string;
  requirementId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason?: string;
  storageProvider?: string;
  storageKey?: string;
  fileDataUri?: string; // Optional: legacy or fallback
  uploadedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface Reminder {
  id: string;
  firmId: string;
  requestId: string;
  clientId: string;
  reminderNumber: number;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  missingDocuments: string[];
  sentAt: string;
  triggerType: 'automated' | 'manual';
  deliveryStatus: 'sent' | 'delivered' | 'failed' | 'simulated';
  status: 'sent' | 'scheduled' | 'failed';
  idempotencyKey?: string;
}

export interface TemplateRequirement {
  id: string;
  templateId: string;
  name: string;
  description: string;
  required: boolean;
}

export interface Template {
  id: string;
  firmId: string;
  name: string;
  description: string;
  category: string;
  requirements: TemplateRequirement[];
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  firmId: string;
  requestId?: string;
  clientId?: string;
  action: string;
  description: string;
  actorType: 'accountant' | 'client' | 'system';
  actorName: string;
  createdAt: string;
}

export interface Session {
  id: string;
  token: string;
  userId: string;
  firmId: string;
  createdAt: string;
  expiresAt: string;
}

export interface DatabaseSchema {
  firms: Firm[];
  users: User[];
  clients: Client[];
  requests: DocumentRequest[];
  requirements: DocumentRequirement[];
  documents: DocumentFile[];
  reminders: Reminder[];
  templates: Template[];
  recurringSchedules: RecurringSchedule[];
  activityLogs: ActivityLog[];
  sessions: Session[];
}
