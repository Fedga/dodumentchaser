// server/db/postgresRepository.ts
// Production PostgreSQL Repository Implementation

import pg from 'pg';
const { Pool } = pg;
import {
  IDatabaseRepository,
  ITransactionContext,
  ClientFilterOptions,
  RequestFilterOptions,
  DocumentFilterOptions,
  ReminderFilterOptions,
  ActivityFilterOptions
} from './repository.interface.js';
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

export class PostgresDatabaseRepository implements IDatabaseRepository {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: connectionString.includes('sslmode=require') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    });

    this.pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]', err);
    });
  }

  getEngineType(): 'postgresql' {
    return 'postgresql';
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1 as healthy');
      return res.rows?.[0]?.healthy === 1;
    } catch {
      return false;
    }
  }

  async withTransaction<T>(work: (tx: ITransactionContext) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txContext: ITransactionContext = {
        query: async (sql, params) => {
          const res = await client.query(sql, params);
          return res.rows;
        },
      };
      const result = await work(txContext);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ----------------------------------------------------
  // FIRMS
  // ----------------------------------------------------
  async getFirms(): Promise<Firm[]> {
    const res = await this.pool.query('SELECT * FROM firms ORDER BY name ASC');
    return res.rows.map(this.mapFirm);
  }

  async getFirmById(id: string): Promise<Firm | null> {
    const res = await this.pool.query('SELECT * FROM firms WHERE id = $1', [id]);
    return res.rows[0] ? this.mapFirm(res.rows[0]) : null;
  }

  async upsertFirm(firm: Partial<Firm> & { id: string }): Promise<Firm> {
    const existing = await this.getFirmById(firm.id);
    if (existing) {
      const res = await this.pool.query(
        `UPDATE firms SET
          name = COALESCE($2, name),
          logo_url = COALESCE($3, logo_url),
          default_reminder_days = COALESCE($4, default_reminder_days),
          default_max_reminders = COALESCE($5, default_max_reminders),
          default_reminder_subject = COALESCE($6, default_reminder_subject),
          default_reminder_body = COALESCE($7, default_reminder_body),
          plan = COALESCE($8, plan),
          manual_chasing_minutes_per_doc = COALESCE($9, manual_chasing_minutes_per_doc)
         WHERE id = $1 RETURNING *`,
        [
          firm.id,
          firm.name,
          firm.logoUrl,
          firm.defaultReminderDays,
          firm.defaultMaxReminders,
          firm.defaultReminderSubject,
          firm.defaultReminderBody,
          firm.plan,
          firm.manualChasingMinutesPerDoc
        ]
      );
      return this.mapFirm(res.rows[0]);
    } else {
      const res = await this.pool.query(
        `INSERT INTO firms (id, name, logo_url, default_reminder_days, default_max_reminders, default_reminder_subject, default_reminder_body, plan, manual_chasing_minutes_per_doc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          firm.id,
          firm.name || 'Practice Firm',
          firm.logoUrl || '',
          firm.defaultReminderDays || 3,
          firm.defaultMaxReminders || 5,
          firm.defaultReminderSubject || 'Documents still needed for {{request_name}}',
          firm.defaultReminderBody || 'Please submit: {{missing_documents}}',
          firm.plan || 'Professional',
          firm.manualChasingMinutesPerDoc || 5
        ]
      );
      return this.mapFirm(res.rows[0]);
    }
  }

  // ----------------------------------------------------
  // USERS
  // ----------------------------------------------------
  async getUsers(firmId: string): Promise<User[]> {
    const res = await this.pool.query('SELECT * FROM users WHERE firm_id = $1 ORDER BY name ASC', [firmId]);
    return res.rows.map(this.mapUser);
  }

  async getUserById(id: string): Promise<User | null> {
    const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] ? this.mapUser(res.rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const res = await this.pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return res.rows[0] ? this.mapUser(res.rows[0]) : null;
  }

  // ----------------------------------------------------
  // SESSIONS
  // ----------------------------------------------------
  async getSessionByToken(token: string): Promise<Session | null> {
    const res = await this.pool.query('SELECT * FROM sessions WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP', [token]);
    return res.rows[0] ? this.mapSession(res.rows[0]) : null;
  }

  async createSession(session: Session): Promise<Session> {
    await this.pool.query(
      `INSERT INTO sessions (id, token, user_id, firm_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [session.id, session.token, session.userId, session.firmId, session.createdAt, session.expiresAt]
    );
    return session;
  }

  async revokeSession(token: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  }

  // ----------------------------------------------------
  // CLIENTS
  // ----------------------------------------------------
  async getClients(firmId: string, filters?: ClientFilterOptions): Promise<Client[]> {
    let sql = 'SELECT * FROM clients WHERE firm_id = $1';
    const params: any[] = [firmId];

    if (filters?.status && filters.status !== 'All') {
      params.push(filters.status);
      sql += ` AND status = $${params.length}`;
    }

    if (filters?.assignedStaffId) {
      params.push(filters.assignedStaffId);
      sql += ` AND assigned_staff_id = $${params.length}`;
    }

    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      sql += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(company_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }

    sql += ' ORDER BY company_name ASC';
    const res = await this.pool.query(sql, params);
    return res.rows.map(this.mapClient);
  }

  async getClientById(id: string, firmId: string): Promise<Client | null> {
    const res = await this.pool.query('SELECT * FROM clients WHERE id = $1 AND firm_id = $2', [id, firmId]);
    return res.rows[0] ? this.mapClient(res.rows[0]) : null;
  }

  async createClient(client: Client): Promise<Client> {
    const res = await this.pool.query(
      `INSERT INTO clients (id, firm_id, name, company_name, email, phone, status, assigned_staff_id, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        client.id,
        client.firmId,
        client.name,
        client.companyName,
        client.email,
        client.phone || '',
        client.status || 'Active',
        client.assignedStaffId || null,
        client.notes || '',
        client.createdAt || new Date().toISOString(),
        client.updatedAt || new Date().toISOString()
      ]
    );
    return this.mapClient(res.rows[0]);
  }

  async updateClient(id: string, firmId: string, updates: Partial<Client>): Promise<Client | null> {
    const fields: string[] = [];
    const params: any[] = [id, firmId];

    if (updates.name !== undefined) { params.push(updates.name); fields.push(`name = $${params.length}`); }
    if (updates.companyName !== undefined) { params.push(updates.companyName); fields.push(`company_name = $${params.length}`); }
    if (updates.email !== undefined) { params.push(updates.email); fields.push(`email = $${params.length}`); }
    if (updates.phone !== undefined) { params.push(updates.phone); fields.push(`phone = $${params.length}`); }
    if (updates.status !== undefined) { params.push(updates.status); fields.push(`status = $${params.length}`); }
    if (updates.assignedStaffId !== undefined) { params.push(updates.assignedStaffId); fields.push(`assigned_staff_id = $${params.length}`); }
    if (updates.notes !== undefined) { params.push(updates.notes); fields.push(`notes = $${params.length}`); }

    if (fields.length === 0) return this.getClientById(id, firmId);

    const sql = `UPDATE clients SET ${fields.join(', ')} WHERE id = $1 AND firm_id = $2 RETURNING *`;
    const res = await this.pool.query(sql, params);
    return res.rows[0] ? this.mapClient(res.rows[0]) : null;
  }

  // ----------------------------------------------------
  // DOCUMENT REQUESTS
  // ----------------------------------------------------
  async getRequests(firmId: string, filters?: RequestFilterOptions): Promise<DocumentRequest[]> {
    let sql = 'SELECT * FROM document_requests WHERE firm_id = $1';
    const params: any[] = [firmId];

    if (filters?.clientId) {
      params.push(filters.clientId);
      sql += ` AND client_id = $${params.length}`;
    }

    if (filters?.recurringScheduleId) {
      params.push(filters.recurringScheduleId);
      sql += ` AND recurring_schedule_id = $${params.length}`;
    }

    if (filters?.status && filters.status !== 'All') {
      params.push(filters.status);
      sql += ` AND status = $${params.length}`;
    }

    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      sql += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(period) LIKE $${params.length})`;
    }

    sql += ' ORDER BY due_date ASC';
    const res = await this.pool.query(sql, params);
    return res.rows.map(this.mapRequest);
  }

  async getRequestById(id: string, firmId?: string): Promise<DocumentRequest | null> {
    const sql = firmId
      ? 'SELECT * FROM document_requests WHERE id = $1 AND firm_id = $2'
      : 'SELECT * FROM document_requests WHERE id = $1';
    const params = firmId ? [id, firmId] : [id];
    const res = await this.pool.query(sql, params);
    return res.rows[0] ? this.mapRequest(res.rows[0]) : null;
  }

  async getRequestByPortalTokenHash(tokenHash: string): Promise<DocumentRequest | null> {
    const res = await this.pool.query(
      'SELECT * FROM document_requests WHERE portal_token_hash = $1 AND portal_token_revoked = false',
      [tokenHash]
    );
    return res.rows[0] ? this.mapRequest(res.rows[0]) : null;
  }

  async createRequest(request: DocumentRequest): Promise<DocumentRequest> {
    const res = await this.pool.query(
      `INSERT INTO document_requests (
        id, firm_id, client_id, recurring_schedule_id, name, description, period,
        due_date, reminder_frequency_days, max_reminders, reminders_paused, status,
        portal_token, portal_token_hash, portal_token_expires_at, portal_token_revoked,
        reminder_count, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      ) RETURNING *`,
      [
        request.id,
        request.firmId,
        request.clientId,
        request.recurringScheduleId || null,
        request.name,
        request.description || '',
        request.period,
        request.dueDate,
        request.reminderFrequencyDays || 3,
        request.maxReminders || 5,
        request.remindersPaused || false,
        request.status || 'Active',
        request.portalToken || null,
        request.portalTokenHash || null,
        request.portalTokenExpiresAt || null,
        request.portalTokenRevoked || false,
        request.reminderCount || 0,
        request.createdAt || new Date().toISOString(),
        request.updatedAt || new Date().toISOString()
      ]
    );
    return this.mapRequest(res.rows[0]);
  }

  async updateRequest(id: string, firmId: string, updates: Partial<DocumentRequest>): Promise<DocumentRequest | null> {
    const fields: string[] = [];
    const params: any[] = [id, firmId];

    if (updates.name !== undefined) { params.push(updates.name); fields.push(`name = $${params.length}`); }
    if (updates.description !== undefined) { params.push(updates.description); fields.push(`description = $${params.length}`); }
    if (updates.period !== undefined) { params.push(updates.period); fields.push(`period = $${params.length}`); }
    if (updates.dueDate !== undefined) { params.push(updates.dueDate); fields.push(`due_date = $${params.length}`); }
    if (updates.reminderFrequencyDays !== undefined) { params.push(updates.reminderFrequencyDays); fields.push(`reminder_frequency_days = $${params.length}`); }
    if (updates.maxReminders !== undefined) { params.push(updates.maxReminders); fields.push(`max_reminders = $${params.length}`); }
    if (updates.remindersPaused !== undefined) { params.push(updates.remindersPaused); fields.push(`reminders_paused = $${params.length}`); }
    if (updates.status !== undefined) { params.push(updates.status); fields.push(`status = $${params.length}`); }
    if (updates.portalToken !== undefined) { params.push(updates.portalToken); fields.push(`portal_token = $${params.length}`); }
    if (updates.portalTokenHash !== undefined) { params.push(updates.portalTokenHash); fields.push(`portal_token_hash = $${params.length}`); }
    if (updates.portalTokenExpiresAt !== undefined) { params.push(updates.portalTokenExpiresAt); fields.push(`portal_token_expires_at = $${params.length}`); }
    if (updates.portalTokenRevoked !== undefined) { params.push(updates.portalTokenRevoked); fields.push(`portal_token_revoked = $${params.length}`); }
    if (updates.portalTokenLastRotatedAt !== undefined) { params.push(updates.portalTokenLastRotatedAt); fields.push(`portal_token_last_rotated_at = $${params.length}`); }
    if (updates.lastReminderSentAt !== undefined) { params.push(updates.lastReminderSentAt); fields.push(`last_reminder_sent_at = $${params.length}`); }
    if (updates.reminderCount !== undefined) { params.push(updates.reminderCount); fields.push(`reminder_count = $${params.length}`); }
    if (updates.completedAt !== undefined) { params.push(updates.completedAt); fields.push(`completed_at = $${params.length}`); }
    if (updates.clientNotifiedAt !== undefined) { params.push(updates.clientNotifiedAt); fields.push(`client_notified_at = $${params.length}`); }

    if (fields.length === 0) return this.getRequestById(id, firmId);

    const sql = `UPDATE document_requests SET ${fields.join(', ')} WHERE id = $1 AND firm_id = $2 RETURNING *`;
    const res = await this.pool.query(sql, params);
    return res.rows[0] ? this.mapRequest(res.rows[0]) : null;
  }

  // ----------------------------------------------------
  // DOCUMENT REQUIREMENTS
  // ----------------------------------------------------
  async getRequirements(requestId: string): Promise<DocumentRequirement[]> {
    const res = await this.pool.query(
      'SELECT * FROM document_requirements WHERE request_id = $1 ORDER BY sort_order ASC, name ASC',
      [requestId]
    );
    return res.rows.map(this.mapRequirement);
  }

  async getRequirementById(id: string): Promise<DocumentRequirement | null> {
    const res = await this.pool.query('SELECT * FROM document_requirements WHERE id = $1', [id]);
    return res.rows[0] ? this.mapRequirement(res.rows[0]) : null;
  }

  async createRequirements(requirements: DocumentRequirement[]): Promise<DocumentRequirement[]> {
    if (requirements.length === 0) return [];
    const inserted: DocumentRequirement[] = [];
    for (let i = 0; i < requirements.length; i++) {
      const r = requirements[i];
      const res = await this.pool.query(
        `INSERT INTO document_requirements (
          id, request_id, name, description, required, status, rejection_reason, client_note, uploaded_document_id, sort_order, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          r.id,
          r.requestId,
          r.name,
          r.description || '',
          r.required !== false,
          r.status || 'Missing',
          r.rejectionReason || null,
          r.clientNote || null,
          r.uploadedDocumentId || null,
          i,
          new Date().toISOString(),
          r.updatedAt || new Date().toISOString()
        ]
      );
      inserted.push(this.mapRequirement(res.rows[0]));
    }
    return inserted;
  }

  async updateRequirement(id: string, updates: Partial<DocumentRequirement>): Promise<DocumentRequirement | null> {
    const fields: string[] = [];
    const params: any[] = [id];

    if (updates.name !== undefined) { params.push(updates.name); fields.push(`name = $${params.length}`); }
    if (updates.description !== undefined) { params.push(updates.description); fields.push(`description = $${params.length}`); }
    if (updates.required !== undefined) { params.push(updates.required); fields.push(`required = $${params.length}`); }
    if (updates.status !== undefined) { params.push(updates.status); fields.push(`status = $${params.length}`); }
    if (updates.rejectionReason !== undefined) { params.push(updates.rejectionReason); fields.push(`rejection_reason = $${params.length}`); }
    if (updates.clientNote !== undefined) { params.push(updates.clientNote); fields.push(`client_note = $${params.length}`); }
    if (updates.uploadedDocumentId !== undefined) { params.push(updates.uploadedDocumentId); fields.push(`uploaded_document_id = $${params.length}`); }

    if (fields.length === 0) return this.getRequirementById(id);

    const sql = `UPDATE document_requirements SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    const res = await this.pool.query(sql, params);
    return res.rows[0] ? this.mapRequirement(res.rows[0]) : null;
  }

  // ----------------------------------------------------
  // DOCUMENTS
  // ----------------------------------------------------
  async getDocuments(firmId: string, filters?: DocumentFilterOptions): Promise<DocumentFile[]> {
    let sql = 'SELECT * FROM documents WHERE firm_id = $1';
    const params: any[] = [firmId];

    if (filters?.requestId) {
      params.push(filters.requestId);
      sql += ` AND request_id = $${params.length}`;
    }

    if (filters?.status && filters.status !== 'All') {
      params.push(filters.status);
      sql += ` AND status = $${params.length}`;
    }

    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      sql += ` AND (LOWER(filename) LIKE $${params.length} OR LOWER(original_name) LIKE $${params.length})`;
    }

    sql += ' ORDER BY uploaded_at DESC';
    const res = await this.pool.query(sql, params);
    return res.rows.map(this.mapDocument);
  }

  async getDocumentById(id: string, firmId?: string): Promise<DocumentFile | null> {
    const sql = firmId
      ? 'SELECT * FROM documents WHERE id = $1 AND firm_id = $2'
      : 'SELECT * FROM documents WHERE id = $1';
    const params = firmId ? [id, firmId] : [id];
    const res = await this.pool.query(sql, params);
    return res.rows[0] ? this.mapDocument(res.rows[0]) : null;
  }

  async createDocument(doc: DocumentFile): Promise<DocumentFile> {
    const res = await this.pool.query(
      `INSERT INTO documents (
        id, firm_id, request_id, requirement_id, filename, original_name, mime_type,
        size_bytes, storage_path, status, rejection_reason, uploaded_at, reviewed_at, reviewed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        doc.id,
        doc.firmId,
        doc.requestId,
        doc.requirementId || null,
        doc.filename,
        doc.originalName,
        doc.mimeType,
        doc.sizeBytes,
        (doc as any).storagePath || doc.filename,
        doc.status || 'Uploaded',
        doc.rejectionReason || null,
        doc.uploadedAt || new Date().toISOString(),
        doc.reviewedAt || null,
        doc.reviewedBy || null
      ]
    );
    return this.mapDocument(res.rows[0]);
  }

  async updateDocument(id: string, firmId: string, updates: Partial<DocumentFile>): Promise<DocumentFile | null> {
    const fields: string[] = [];
    const params: any[] = [id, firmId];

    if (updates.status !== undefined) { params.push(updates.status); fields.push(`status = $${params.length}`); }
    if (updates.rejectionReason !== undefined) { params.push(updates.rejectionReason); fields.push(`rejection_reason = $${params.length}`); }
    if (updates.reviewedAt !== undefined) { params.push(updates.reviewedAt); fields.push(`reviewed_at = $${params.length}`); }
    if (updates.reviewedBy !== undefined) { params.push(updates.reviewedBy); fields.push(`reviewed_by = $${params.length}`); }

    if (fields.length === 0) return this.getDocumentById(id, firmId);

    const sql = `UPDATE documents SET ${fields.join(', ')} WHERE id = $1 AND firm_id = $2 RETURNING *`;
    const res = await this.pool.query(sql, params);
    return res.rows[0] ? this.mapDocument(res.rows[0]) : null;
  }

  async deleteDocument(id: string, firmId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM documents WHERE id = $1 AND firm_id = $2', [id, firmId]);
    return (res.rowCount || 0) > 0;
  }

  // ----------------------------------------------------
  // REMINDERS
  // ----------------------------------------------------
  async getReminders(firmId: string, filters?: ReminderFilterOptions): Promise<Reminder[]> {
    let sql = 'SELECT * FROM reminders WHERE firm_id = $1';
    const params: any[] = [firmId];

    if (filters?.requestId) {
      params.push(filters.requestId);
      sql += ` AND request_id = $${params.length}`;
    }

    if (filters?.clientId) {
      params.push(filters.clientId);
      sql += ` AND client_id = $${params.length}`;
    }

    if (filters?.triggerType) {
      params.push(filters.triggerType);
      sql += ` AND trigger_type = $${params.length}`;
    }

    sql += ' ORDER BY sent_at DESC';
    const res = await this.pool.query(sql, params);
    return res.rows.map(this.mapReminder);
  }

  async createReminder(rem: Reminder): Promise<Reminder> {
    const res = await this.pool.query(
      `INSERT INTO reminders (
        id, firm_id, request_id, client_id, reminder_number, recipient_email, recipient_name,
        subject, body, missing_documents, trigger_type, delivery_status, status, idempotency_key, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        rem.id,
        rem.firmId,
        rem.requestId,
        rem.clientId,
        rem.reminderNumber || 1,
        rem.recipientEmail,
        rem.recipientName,
        rem.subject,
        rem.body,
        JSON.stringify(rem.missingDocuments || []),
        rem.triggerType || 'automated',
        rem.deliveryStatus || 'sent',
        rem.status || 'sent',
        rem.idempotencyKey || null,
        rem.sentAt || new Date().toISOString()
      ]
    );
    return this.mapReminder(res.rows[0]);
  }

  async findReminderByIdempotencyKey(key: string): Promise<Reminder | null> {
    const res = await this.pool.query('SELECT * FROM reminders WHERE idempotency_key = $1', [key]);
    return res.rows[0] ? this.mapReminder(res.rows[0]) : null;
  }

  // ----------------------------------------------------
  // TEMPLATES
  // ----------------------------------------------------
  async getTemplates(firmId: string): Promise<Template[]> {
    const res = await this.pool.query('SELECT * FROM templates WHERE firm_id = $1 ORDER BY name ASC', [firmId]);
    const templates: Template[] = [];
    for (const row of res.rows) {
      const tmpl = this.mapTemplate(row);
      const reqRes = await this.pool.query('SELECT * FROM template_requirements WHERE template_id = $1 ORDER BY sort_order ASC', [tmpl.id]);
      tmpl.requirements = reqRes.rows.map(r => ({
        id: r.id,
        templateId: r.template_id,
        name: r.name,
        description: r.description,
        required: r.required
      }));
      templates.push(tmpl);
    }
    return templates;
  }

  async getTemplateById(id: string, firmId: string): Promise<Template | null> {
    const res = await this.pool.query('SELECT * FROM templates WHERE id = $1 AND firm_id = $2', [id, firmId]);
    if (!res.rows[0]) return null;
    const tmpl = this.mapTemplate(res.rows[0]);
    const reqRes = await this.pool.query('SELECT * FROM template_requirements WHERE template_id = $1 ORDER BY sort_order ASC', [id]);
    tmpl.requirements = reqRes.rows.map(r => ({
      id: r.id,
      templateId: r.template_id,
      name: r.name,
      description: r.description,
      required: r.required
    }));
    return tmpl;
  }

  async createTemplate(template: Template): Promise<Template> {
    return this.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO templates (id, firm_id, name, description, category, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          template.id,
          template.firmId,
          template.name,
          template.description || '',
          template.category || 'General',
          template.createdAt || new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      if (template.requirements && template.requirements.length > 0) {
        for (let i = 0; i < template.requirements.length; i++) {
          const req = template.requirements[i];
          await tx.query(
            `INSERT INTO template_requirements (id, template_id, name, description, required, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              req.id || `tr_${Date.now()}_${i}`,
              template.id,
              req.name,
              req.description || '',
              req.required !== false,
              i
            ]
          );
        }
      }
      return template;
    });
  }

  async updateTemplate(id: string, firmId: string, updates: Partial<Template>): Promise<Template | null> {
    return this.withTransaction(async (tx) => {
      const fields: string[] = [];
      const params: any[] = [id, firmId];

      if (updates.name !== undefined) { params.push(updates.name); fields.push(`name = $${params.length}`); }
      if (updates.description !== undefined) { params.push(updates.description); fields.push(`description = $${params.length}`); }
      if (updates.category !== undefined) { params.push(updates.category); fields.push(`category = $${params.length}`); }

      if (fields.length > 0) {
        await tx.query(`UPDATE templates SET ${fields.join(', ')} WHERE id = $1 AND firm_id = $2`, params);
      }

      if (updates.requirements) {
        await tx.query('DELETE FROM template_requirements WHERE template_id = $1', [id]);
        for (let i = 0; i < updates.requirements.length; i++) {
          const req = updates.requirements[i];
          await tx.query(
            `INSERT INTO template_requirements (id, template_id, name, description, required, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              req.id || `tr_${Date.now()}_${i}`,
              id,
              req.name,
              req.description || '',
              req.required !== false,
              i
            ]
          );
        }
      }
      return this.getTemplateById(id, firmId);
    });
  }

  async deleteTemplate(id: string, firmId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM templates WHERE id = $1 AND firm_id = $2', [id, firmId]);
    return (res.rowCount || 0) > 0;
  }

  // ----------------------------------------------------
  // RECURRING SCHEDULES
  // ----------------------------------------------------
  async getRecurringSchedules(firmId: string): Promise<RecurringSchedule[]> {
    const res = await this.pool.query('SELECT * FROM recurring_requests WHERE firm_id = $1 ORDER BY next_occurrence ASC', [firmId]);
    return res.rows.map(this.mapRecurringSchedule);
  }

  async getRecurringScheduleById(id: string, firmId: string): Promise<RecurringSchedule | null> {
    const res = await this.pool.query('SELECT * FROM recurring_requests WHERE id = $1 AND firm_id = $2', [id, firmId]);
    return res.rows[0] ? this.mapRecurringSchedule(res.rows[0]) : null;
  }

  async createRecurringSchedule(sched: RecurringSchedule): Promise<RecurringSchedule> {
    const res = await this.pool.query(
      `INSERT INTO recurring_requests (
        id, firm_id, client_id, template_id, name, description, frequency, next_occurrence,
        due_date_rule_type, due_date_days_offset, reminder_frequency_days, max_reminders,
        status, last_generated_period, last_generated_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [
        sched.id,
        sched.firmId,
        sched.clientId,
        sched.templateId || null,
        sched.name,
        sched.description || '',
        sched.frequency,
        sched.nextOccurrence,
        sched.dueDateRule?.type || 'days_after_start',
        sched.dueDateRule?.daysOffset || 14,
        sched.reminderFrequencyDays || 3,
        sched.maxReminders || 5,
        sched.status || 'Active',
        sched.lastGeneratedPeriod || null,
        sched.lastGeneratedAt || null,
        sched.createdAt || new Date().toISOString(),
        sched.updatedAt || new Date().toISOString()
      ]
    );
    return this.mapRecurringSchedule(res.rows[0]);
  }

  async updateRecurringSchedule(id: string, firmId: string, updates: Partial<RecurringSchedule>): Promise<RecurringSchedule | null> {
    const fields: string[] = [];
    const params: any[] = [id, firmId];

    if (updates.name !== undefined) { params.push(updates.name); fields.push(`name = $${params.length}`); }
    if (updates.description !== undefined) { params.push(updates.description); fields.push(`description = $${params.length}`); }
    if (updates.frequency !== undefined) { params.push(updates.frequency); fields.push(`frequency = $${params.length}`); }
    if (updates.nextOccurrence !== undefined) { params.push(updates.nextOccurrence); fields.push(`next_occurrence = $${params.length}`); }
    if (updates.dueDateRule !== undefined) {
      params.push(updates.dueDateRule.type); fields.push(`due_date_rule_type = $${params.length}`);
      params.push(updates.dueDateRule.daysOffset); fields.push(`due_date_days_offset = $${params.length}`);
    }
    if (updates.reminderFrequencyDays !== undefined) { params.push(updates.reminderFrequencyDays); fields.push(`reminder_frequency_days = $${params.length}`); }
    if (updates.maxReminders !== undefined) { params.push(updates.maxReminders); fields.push(`max_reminders = $${params.length}`); }
    if (updates.status !== undefined) { params.push(updates.status); fields.push(`status = $${params.length}`); }
    if (updates.lastGeneratedPeriod !== undefined) { params.push(updates.lastGeneratedPeriod); fields.push(`last_generated_period = $${params.length}`); }
    if (updates.lastGeneratedAt !== undefined) { params.push(updates.lastGeneratedAt); fields.push(`last_generated_at = $${params.length}`); }

    if (fields.length === 0) return this.getRecurringScheduleById(id, firmId);

    const sql = `UPDATE recurring_requests SET ${fields.join(', ')} WHERE id = $1 AND firm_id = $2 RETURNING *`;
    const res = await this.pool.query(sql, params);
    return res.rows[0] ? this.mapRecurringSchedule(res.rows[0]) : null;
  }

  // ----------------------------------------------------
  // ACTIVITY LOGS
  // ----------------------------------------------------
  async getActivityLogs(firmId: string, filters?: ActivityFilterOptions): Promise<ActivityLog[]> {
    let sql = 'SELECT * FROM activity_logs WHERE firm_id = $1';
    const params: any[] = [firmId];

    if (filters?.clientId) {
      params.push(filters.clientId);
      sql += ` AND client_id = $${params.length}`;
    }

    if (filters?.requestId) {
      params.push(filters.requestId);
      sql += ` AND request_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    if (filters?.limit) {
      params.push(filters.limit);
      sql += ` LIMIT $${params.length}`;
    }

    const res = await this.pool.query(sql, params);
    return res.rows.map(this.mapActivityLog);
  }

  async createActivityLog(log: ActivityLog): Promise<ActivityLog> {
    const res = await this.pool.query(
      `INSERT INTO activity_logs (id, firm_id, request_id, client_id, action, description, actor_type, actor_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        log.id,
        log.firmId,
        log.requestId || null,
        log.clientId || null,
        log.action,
        log.description,
        log.actorType || 'accountant',
        log.actorName || 'System',
        log.createdAt || new Date().toISOString()
      ]
    );
    return this.mapActivityLog(res.rows[0]);
  }

  // ----------------------------------------------------
  // DATA MAPPING HELPERS
  // ----------------------------------------------------
  private mapFirm(r: any): Firm {
    return {
      id: r.id,
      name: r.name,
      logoUrl: r.logo_url || '',
      defaultReminderDays: Number(r.default_reminder_days),
      defaultMaxReminders: Number(r.default_max_reminders),
      defaultReminderSubject: r.default_reminder_subject,
      defaultReminderBody: r.default_reminder_body,
      plan: r.plan,
      manualChasingMinutesPerDoc: Number(r.manual_chasing_minutes_per_doc || 5),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
    };
  }

  private mapUser(r: any): User {
    return {
      id: r.id,
      firmId: r.firm_id,
      name: r.name,
      email: r.email,
      role: r.role,
      avatarUrl: r.avatar_url || '',
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
    };
  }

  private mapSession(r: any): Session {
    return {
      id: r.id,
      token: r.token,
      userId: r.user_id,
      firmId: r.firm_id,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : new Date().toISOString()
    };
  }

  private mapClient(r: any): Client {
    return {
      id: r.id,
      firmId: r.firm_id,
      name: r.name,
      companyName: r.company_name,
      email: r.email,
      phone: r.phone || '',
      status: r.status,
      assignedStaffId: r.assigned_staff_id || '',
      notes: r.notes || '',
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
    };
  }

  private mapRequest(r: any): DocumentRequest {
    return {
      id: r.id,
      firmId: r.firm_id,
      clientId: r.client_id,
      recurringScheduleId: r.recurring_schedule_id || undefined,
      name: r.name,
      description: r.description || '',
      period: r.period,
      dueDate: r.due_date instanceof Date ? r.due_date.toISOString().split('T')[0] : String(r.due_date),
      reminderFrequencyDays: Number(r.reminder_frequency_days),
      maxReminders: Number(r.max_reminders),
      remindersPaused: Boolean(r.reminders_paused),
      status: r.status,
      portalToken: r.portal_token || undefined,
      portalTokenHash: r.portal_token_hash || undefined,
      portalTokenExpiresAt: r.portal_token_expires_at ? new Date(r.portal_token_expires_at).toISOString() : undefined,
      portalTokenRevoked: Boolean(r.portal_token_revoked),
      portalTokenLastRotatedAt: r.portal_token_last_rotated_at ? new Date(r.portal_token_last_rotated_at).toISOString() : undefined,
      lastReminderSentAt: r.last_reminder_sent_at ? new Date(r.last_reminder_sent_at).toISOString() : undefined,
      reminderCount: Number(r.reminder_count || 0),
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : undefined,
      clientNotifiedAt: r.client_notified_at ? new Date(r.client_notified_at).toISOString() : undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
    };
  }

  private mapRequirement(r: any): DocumentRequirement {
    return {
      id: r.id,
      requestId: r.request_id,
      name: r.name,
      description: r.description || '',
      required: Boolean(r.required),
      status: r.status,
      rejectionReason: r.rejection_reason || undefined,
      clientNote: r.client_note || undefined,
      uploadedDocumentId: r.uploaded_document_id || undefined,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
    };
  }

  private mapDocument(r: any): DocumentFile {
    return {
      id: r.id,
      firmId: r.firm_id,
      requestId: r.request_id,
      requirementId: r.requirement_id || '',
      filename: r.filename,
      originalName: r.original_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
      status: r.status,
      rejectionReason: r.rejection_reason || undefined,
      uploadedAt: r.uploaded_at ? new Date(r.uploaded_at).toISOString() : new Date().toISOString(),
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : undefined,
      reviewedBy: r.reviewed_by || undefined
    };
  }

  private mapReminder(r: any): Reminder {
    return {
      id: r.id,
      firmId: r.firm_id,
      requestId: r.request_id,
      clientId: r.client_id,
      reminderNumber: Number(r.reminder_number || 1),
      recipientEmail: r.recipient_email,
      recipientName: r.recipient_name,
      subject: r.subject,
      body: r.body,
      missingDocuments: Array.isArray(r.missing_documents)
        ? r.missing_documents
        : typeof r.missing_documents === 'string'
        ? JSON.parse(r.missing_documents)
        : [],
      triggerType: r.trigger_type,
      deliveryStatus: r.delivery_status,
      status: r.status,
      idempotencyKey: r.idempotency_key || undefined,
      sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : new Date().toISOString()
    };
  }

  private mapTemplate(r: any): Template {
    return {
      id: r.id,
      firmId: r.firm_id,
      name: r.name,
      description: r.description || '',
      category: r.category || 'General',
      requirements: [],
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
    };
  }

  private mapRecurringSchedule(r: any): RecurringSchedule {
    return {
      id: r.id,
      firmId: r.firm_id,
      clientId: r.client_id,
      templateId: r.template_id || '',
      name: r.name,
      description: r.description || '',
      frequency: r.frequency,
      nextOccurrence: r.next_occurrence instanceof Date ? r.next_occurrence.toISOString().split('T')[0] : String(r.next_occurrence),
      dueDateRule: {
        type: r.due_date_rule_type || 'days_after_start',
        daysOffset: Number(r.due_date_days_offset || 14)
      },
      reminderFrequencyDays: Number(r.reminder_frequency_days || 3),
      maxReminders: Number(r.max_reminders || 5),
      status: r.status,
      lastGeneratedPeriod: r.last_generated_period || undefined,
      lastGeneratedAt: r.last_generated_at ? new Date(r.last_generated_at).toISOString() : undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
    };
  }

  private mapActivityLog(r: any): ActivityLog {
    return {
      id: r.id,
      firmId: r.firm_id,
      requestId: r.request_id || undefined,
      clientId: r.client_id || undefined,
      action: r.action,
      description: r.description,
      actorType: r.actor_type,
      actorName: r.actor_name,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
    };
  }
}
