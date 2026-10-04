// server/db/migration.ts
// Production PostgreSQL Migration Runner & Data Importer

import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Pool } = pg;
import { db } from '../storage.js';

export interface MigrationSummary {
  firmsCount: number;
  usersCount: number;
  clientsCount: number;
  templatesCount: number;
  templateRequirementsCount: number;
  recurringRequestsCount: number;
  documentRequestsCount: number;
  documentRequirementsCount: number;
  documentsCount: number;
  remindersCount: number;
  activityLogsCount: number;
  sessionsCount: number;
}

export class PostgresMigrationManager {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    });
  }

  /**
   * Step 1: Apply DDL Schema
   */
  async applySchema(): Promise<void> {
    console.log('[Migration] Applying PostgreSQL Schema from schema.sql...');
    const schemaPath = path.resolve(process.cwd(), 'server', 'db', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`schema.sql not found at ${schemaPath}`);
    }
    const ddl = fs.readFileSync(schemaPath, 'utf-8');
    await this.pool.query(ddl);
    console.log('[Migration] DDL Schema applied successfully.');
  }

  /**
   * Step 2: Migrate data from file-backed store into PostgreSQL transactionally
   */
  async migrateDataFromFile(): Promise<MigrationSummary> {
    console.log('[Migration] Reading existing data from file store...');
    const data = db.getData();

    const summary: MigrationSummary = {
      firmsCount: 0,
      usersCount: 0,
      clientsCount: 0,
      templatesCount: 0,
      templateRequirementsCount: 0,
      recurringRequestsCount: 0,
      documentRequestsCount: 0,
      documentRequirementsCount: 0,
      documentsCount: 0,
      remindersCount: 0,
      activityLogsCount: 0,
      sessionsCount: 0,
    };

    const insertedFirmIds = new Set<string>();
    const insertedUserIds = new Set<string>();
    const insertedClientIds = new Set<string>();
    const insertedTemplateIds = new Set<string>();
    const insertedRecurringIds = new Set<string>();
    const insertedRequestIds = new Set<string>();
    const insertedRequirementIds = new Set<string>();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      console.log('[Migration] Transaction started...');

      // 1. Firms
      for (const f of data.firms || []) {
        await client.query(
          `INSERT INTO firms (id, name, logo_url, default_reminder_days, default_max_reminders, default_reminder_subject, default_reminder_body, plan, manual_chasing_minutes_per_doc, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             logo_url = EXCLUDED.logo_url,
             default_reminder_days = EXCLUDED.default_reminder_days,
             default_max_reminders = EXCLUDED.default_max_reminders,
             default_reminder_subject = EXCLUDED.default_reminder_subject,
             default_reminder_body = EXCLUDED.default_reminder_body,
             plan = EXCLUDED.plan,
             manual_chasing_minutes_per_doc = EXCLUDED.manual_chasing_minutes_per_doc,
             updated_at = CURRENT_TIMESTAMP`,
          [
            f.id,
            f.name,
            f.logoUrl || '',
            f.defaultReminderDays || 3,
            f.defaultMaxReminders || 5,
            f.defaultReminderSubject || 'Documents still needed',
            f.defaultReminderBody || 'Please submit your documents',
            f.plan || 'Professional',
            f.manualChasingMinutesPerDoc || 5,
            f.createdAt || new Date().toISOString(),
            new Date().toISOString()
          ]
        );
        insertedFirmIds.add(f.id);
        summary.firmsCount++;
      }

      // 2. Users
      const seenFirmEmails = new Set<string>();
      for (const u of data.users || []) {
        if (!insertedFirmIds.has(u.firmId)) continue;
        const emailKey = `${u.firmId}:${u.email.toLowerCase()}`;
        if (seenFirmEmails.has(emailKey)) continue;
        seenFirmEmails.add(emailKey);

        await client.query(
          `INSERT INTO users (id, firm_id, name, email, role, avatar_url, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             avatar_url = EXCLUDED.avatar_url,
             updated_at = CURRENT_TIMESTAMP`,
          [u.id, u.firmId, u.name, u.email, u.role, u.avatarUrl || '', u.createdAt || new Date().toISOString(), new Date().toISOString()]
        );
        insertedUserIds.add(u.id);
        summary.usersCount++;
      }

      // 3. Clients
      for (const c of data.clients || []) {
        if (!insertedFirmIds.has(c.firmId)) continue;
        const staffId = c.assignedStaffId && insertedUserIds.has(c.assignedStaffId) ? c.assignedStaffId : null;

        await client.query(
          `INSERT INTO clients (id, firm_id, name, company_name, email, phone, status, assigned_staff_id, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             company_name = EXCLUDED.company_name,
             email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             status = EXCLUDED.status,
             assigned_staff_id = EXCLUDED.assigned_staff_id,
             notes = EXCLUDED.notes,
             updated_at = CURRENT_TIMESTAMP`,
          [
            c.id,
            c.firmId,
            c.name,
            c.companyName,
            c.email,
            c.phone || '',
            c.status || 'Active',
            staffId,
            c.notes || '',
            c.createdAt || new Date().toISOString(),
            c.updatedAt || new Date().toISOString()
          ]
        );
        insertedClientIds.add(c.id);
        summary.clientsCount++;
      }

      // 4. Templates & Template Requirements
      for (const t of data.templates || []) {
        if (!insertedFirmIds.has(t.firmId)) continue;
        await client.query(
          `INSERT INTO templates (id, firm_id, name, description, category, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             updated_at = CURRENT_TIMESTAMP`,
          [t.id, t.firmId, t.name, t.description || '', t.category || 'General', t.createdAt || new Date().toISOString(), new Date().toISOString()]
        );
        insertedTemplateIds.add(t.id);
        summary.templatesCount++;

        if (t.requirements && t.requirements.length > 0) {
          for (let i = 0; i < t.requirements.length; i++) {
            const tr = t.requirements[i];
            await client.query(
              `INSERT INTO template_requirements (id, template_id, name, description, required, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 required = EXCLUDED.required,
                 sort_order = EXCLUDED.sort_order`,
              [tr.id || `tr_${Date.now()}_${i}`, t.id, tr.name, tr.description || '', tr.required !== false, i]
            );
            summary.templateRequirementsCount++;
          }
        }
      }

      // 5. Recurring Requests
      for (const s of data.recurringSchedules || []) {
        if (!insertedFirmIds.has(s.firmId) || !insertedClientIds.has(s.clientId)) continue;
        const templateId = s.templateId && insertedTemplateIds.has(s.templateId) ? s.templateId : null;

        await client.query(
          `INSERT INTO recurring_requests (
            id, firm_id, client_id, template_id, name, description, frequency, next_occurrence,
            due_date_rule_type, due_date_days_offset, reminder_frequency_days, max_reminders,
            status, last_generated_period, last_generated_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO NOTHING`,
          [
            s.id,
            s.firmId,
            s.clientId,
            templateId,
            s.name,
            s.description || '',
            s.frequency,
            s.nextOccurrence,
            s.dueDateRule?.type || 'days_after_start',
            s.dueDateRule?.daysOffset || 14,
            s.reminderFrequencyDays || 3,
            s.maxReminders || 5,
            s.status || 'Active',
            s.lastGeneratedPeriod || null,
            s.lastGeneratedAt || null,
            s.createdAt || new Date().toISOString(),
            s.updatedAt || new Date().toISOString()
          ]
        );
        insertedRecurringIds.add(s.id);
        summary.recurringRequestsCount++;
      }

      // 6. Document Requests
      const seenPortalHashes = new Set<string>();
      for (const r of data.requests || []) {
        if (!insertedFirmIds.has(r.firmId) || !insertedClientIds.has(r.clientId)) continue;
        const recurringId = r.recurringScheduleId && insertedRecurringIds.has(r.recurringScheduleId) ? r.recurringScheduleId : null;

        let portalTokenHash = r.portalTokenHash || null;
        if (portalTokenHash) {
          if (seenPortalHashes.has(portalTokenHash)) {
            portalTokenHash = null; // Prevent unique constraint violation
          } else {
            seenPortalHashes.add(portalTokenHash);
          }
        }

        await client.query(
          `INSERT INTO document_requests (
            id, firm_id, client_id, recurring_schedule_id, name, description, period,
            due_date, reminder_frequency_days, max_reminders, reminders_paused, status,
            portal_token, portal_token_hash, portal_token_expires_at, portal_token_revoked,
            last_reminder_sent_at, reminder_count, completed_at, client_notified_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.firmId,
            r.clientId,
            recurringId,
            r.name,
            r.description || '',
            r.period,
            r.dueDate,
            r.reminderFrequencyDays || 3,
            r.maxReminders || 5,
            Boolean(r.remindersPaused),
            r.status || 'Active',
            r.portalToken || null,
            portalTokenHash,
            r.portalTokenExpiresAt || null,
            Boolean(r.portalTokenRevoked),
            r.lastReminderSentAt || null,
            r.reminderCount || 0,
            r.completedAt || null,
            r.clientNotifiedAt || null,
            r.createdAt || new Date().toISOString(),
            r.updatedAt || new Date().toISOString()
          ]
        );
        insertedRequestIds.add(r.id);
        summary.documentRequestsCount++;
      }

      // 7. Document Requirements
      for (let i = 0; i < (data.requirements || []).length; i++) {
        const rq = data.requirements[i];
        if (!insertedRequestIds.has(rq.requestId)) continue;

        await client.query(
          `INSERT INTO document_requirements (
            id, request_id, name, description, required, status, rejection_reason,
            client_note, uploaded_document_id, sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO NOTHING`,
          [
            rq.id,
            rq.requestId,
            rq.name,
            rq.description || '',
            rq.required !== false,
            rq.status || 'Missing',
            rq.rejectionReason || null,
            rq.clientNote || null,
            rq.uploadedDocumentId || null,
            i,
            new Date().toISOString(),
            rq.updatedAt || new Date().toISOString()
          ]
        );
        insertedRequirementIds.add(rq.id);
        summary.documentRequirementsCount++;
      }

      // 8. Documents
      for (const d of data.documents || []) {
        if (!insertedFirmIds.has(d.firmId) || !insertedRequestIds.has(d.requestId)) continue;
        const requirementId = d.requirementId && insertedRequirementIds.has(d.requirementId) ? d.requirementId : null;

        await client.query(
          `INSERT INTO documents (
            id, firm_id, request_id, requirement_id, filename, original_name, mime_type,
            size_bytes, storage_path, status, rejection_reason, uploaded_at, reviewed_at, reviewed_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO NOTHING`,
          [
            d.id,
            d.firmId,
            d.requestId,
            requirementId,
            d.filename,
            d.originalName,
            d.mimeType,
            d.sizeBytes,
            (d as any).storagePath || d.filename,
            d.status || 'Uploaded',
            d.rejectionReason || null,
            d.uploadedAt || new Date().toISOString(),
            d.reviewedAt || null,
            d.reviewedBy || null
          ]
        );
        summary.documentsCount++;
      }

      // 9. Reminders (deduplicating by idempotencyKey to honor unique constraint)
      const seenIdempotencyKeys = new Set<string>();
      for (const rem of data.reminders || []) {
        if (!insertedFirmIds.has(rem.firmId) || !insertedRequestIds.has(rem.requestId) || !insertedClientIds.has(rem.clientId)) continue;

        let finalIdempotencyKey = rem.idempotencyKey || null;
        if (finalIdempotencyKey) {
          if (seenIdempotencyKeys.has(finalIdempotencyKey)) {
            finalIdempotencyKey = null; // Clear duplicate idempotency key to prevent constraint violation
          } else {
            seenIdempotencyKeys.add(finalIdempotencyKey);
          }
        }

        await client.query(
          `INSERT INTO reminders (
            id, firm_id, request_id, client_id, reminder_number, recipient_email, recipient_name,
            subject, body, missing_documents, trigger_type, delivery_status, status, idempotency_key, sent_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO NOTHING`,
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
            finalIdempotencyKey,
            rem.sentAt || new Date().toISOString()
          ]
        );
        summary.remindersCount++;
      }

      // 10. Activity Logs
      for (const a of data.activityLogs || []) {
        if (!insertedFirmIds.has(a.firmId)) continue;
        const reqId = a.requestId && insertedRequestIds.has(a.requestId) ? a.requestId : null;
        const clientId = a.clientId && insertedClientIds.has(a.clientId) ? a.clientId : null;

        await client.query(
          `INSERT INTO activity_logs (id, firm_id, request_id, client_id, action, description, actor_type, actor_name, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            a.id,
            a.firmId,
            reqId,
            clientId,
            a.action,
            a.description,
            a.actorType || 'accountant',
            a.actorName || 'System',
            a.createdAt || new Date().toISOString()
          ]
        );
        summary.activityLogsCount++;
      }

      // 11. Sessions
      const seenTokens = new Set<string>();
      for (const s of data.sessions || []) {
        if (!insertedFirmIds.has(s.firmId) || !insertedUserIds.has(s.userId)) continue;
        if (seenTokens.has(s.token)) continue;
        seenTokens.add(s.token);

        await client.query(
          `INSERT INTO sessions (id, token, user_id, firm_id, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
          [s.id, s.token, s.userId, s.firmId, s.createdAt || new Date().toISOString(), s.expiresAt]
        );
        summary.sessionsCount++;
      }

      await client.query('COMMIT');
      console.log('[Migration] All entities migrated into PostgreSQL successfully:', summary);
      return summary;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Migration] Failed to migrate data, transaction rolled back:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
