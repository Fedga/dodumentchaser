# DocumentChaser Production PostgreSQL Database Architecture & Migration Plan

This guide outlines the production PostgreSQL database architecture, schema definitions, indexes, repository abstractions, and migration procedures for **DocumentChaser**.

---

## 1. Overview & Architectural Goals

The DocumentChaser application has been architecturally prepared for production PostgreSQL without modifying business logic:
- **Repository Abstraction:** Application business logic depends exclusively on the `IDatabaseRepository` interface (`server/db/repository.interface.ts`).
- **Storage Independence:** Business logic in `server.ts`, `chasingEngine.ts`, `recurringService.ts`, and `portalSecurity.ts` operates independently of whether data is stored in PostgreSQL or the file-backed JSON store.
- **Dual-Engine Operation:**
  - When `DATABASE_URL` is set in the environment, the application connects to PostgreSQL via a connection pool (`PostgresDatabaseRepository`).
  - When `DATABASE_URL` is omitted, the application runs on `FileDatabaseRepository`, ensuring 100% development compatibility and seamless prototyping.
- **Credential Protection:** `DATABASE_URL` is parsed and accessed strictly on the Node.js server. No connection details, passwords, or raw SQL queries are exposed to the frontend.

---

## 2. Relational Schema & Entity Specifications

The relational schema is defined in `server/db/schema.sql`.

### Entities & Relationships

| Entity / Table | Primary Key | Foreign Keys | Key Constraints & Tenant Isolation |
| :--- | :--- | :--- | :--- |
| `firms` | `id` (VARCHAR) | — | Multi-tenant root. Contains firm-wide defaults (`default_reminder_days`, `manual_chasing_minutes_per_doc`). |
| `users` | `id` (VARCHAR) | `firm_id` &rarr; `firms(id)` ON DELETE CASCADE | Unique constraint on `(firm_id, email)`. Roles: `'admin'`, `'staff'`. |
| `clients` | `id` (VARCHAR) | `firm_id` &rarr; `firms(id)` ON DELETE CASCADE<br>`assigned_staff_id` &rarr; `users(id)` ON DELETE SET NULL | Status: `'Active'`, `'Onboarding'`, `'Paused'`, `'Archived'`. |
| `templates` | `id` (VARCHAR) | `firm_id` &rarr; `firms(id)` ON DELETE CASCADE | Reusable checklist templates. |
| `template_requirements` | `id` (VARCHAR) | `template_id` &rarr; `templates(id)` ON DELETE CASCADE | Ordered requirement items. |
| `recurring_requests` | `id` (VARCHAR) | `firm_id` &rarr; `firms(id)` ON DELETE CASCADE<br>`client_id` &rarr; `clients(id)` ON DELETE CASCADE<br>`template_id` &rarr; `templates(id)` ON DELETE SET NULL | Frequencies: `'One-off'`, `'Monthly'`, `'Quarterly'`, `'Annual'`. |
| `document_requests` | `id` (VARCHAR) | `firm_id` &rarr; `firms(id)` ON DELETE CASCADE<br>`client_id` &rarr; `clients(id)` ON DELETE CASCADE<br>`recurring_schedule_id` &rarr; `recurring_requests(id)` ON DELETE SET NULL | Portal token hash with UNIQUE constraint (`portal_token_hash`). |
| `document_requirements` | `id` (VARCHAR) | `request_id` &rarr; `document_requests(id)` ON DELETE CASCADE | Statuses: `'Missing'`, `'Requested'`, `'Uploaded'`, `'Approved'`, `'Rejected'`, `'Not applicable'`. |
| `documents` | `id` (VARCHAR) | `firm_id` &rarr; `firms(id)` ON DELETE CASCADE<br>`request_id` &rarr; `document_requests(id)` ON DELETE CASCADE<br>`requirement_id` &rarr; `document_requirements(id)` ON DELETE SET NULL | Metadata for encrypted/stored artifacts. |
| `reminders` | `id` (VARCHAR) | `firm_id` &rarr; `firms(id)` ON DELETE CASCADE<br>`request_id` &rarr; `document_requests(id)` ON DELETE CASCADE<br>`client_id` &rarr; `clients(id)` ON DELETE CASCADE | UNIQUE constraint on `idempotency_key` prevents double-dispatch. |
| `activity_logs` | `id` (VARCHAR) | `firm_id` &rarr; `firms(id)` ON DELETE CASCADE<br>`request_id` &rarr; `document_requests(id)` ON DELETE SET NULL<br>`client_id` &rarr; `clients(id)` ON DELETE SET NULL | Immutable practice audit trail. |
| `sessions` | `id` (VARCHAR) | `user_id` &rarr; `users(id)` ON DELETE CASCADE<br>`firm_id` &rarr; `firms(id)` ON DELETE CASCADE | Unique session `token` with `expires_at` index. |

---

## 3. Indexing Strategy

### A. Tenant Isolation Indexes (`firm_id`)
Every tenant-scoped table features a primary index on `firm_id` to guarantee fast query filtering and strict multi-tenant boundary enforcement:
- `idx_users_firm_id` (`firm_id`)
- `idx_clients_firm_id` (`firm_id`)
- `idx_templates_firm_id` (`firm_id`)
- `idx_recurring_requests_firm_id` (`firm_id`)
- `idx_document_requests_firm_id` (`firm_id`)
- `idx_documents_firm_id` (`firm_id`)
- `idx_reminders_firm_id` (`firm_id`)
- `idx_activity_logs_firm_created` (`firm_id`, `created_at` DESC)
- `idx_sessions_firm_id` (`firm_id`)

### B. Client & Request Composite Indexes
- `idx_document_requests_client` (`client_id`, `status`)
- `idx_document_requests_firm_status` (`firm_id`, `status`)
- `idx_document_requirements_request` (`request_id`, `status`)
- `idx_documents_request` (`request_id`, `status`)
- `idx_documents_requirement` (`requirement_id`)

### C. Automated Chaser Scheduling Indexes
- `idx_document_requests_scheduling` (`status`, `reminders_paused`, `last_reminder_sent_at`, `due_date`)
- `idx_recurring_requests_due` (`status`, `next_occurrence`)
- `idx_reminders_request` (`request_id`, `sent_at`)
- `idx_reminders_idempotency` (`idempotency_key`) UNIQUE WHERE `idempotency_key IS NOT NULL`

### D. Security & Portal Token Hash Lookup
- `idx_document_requests_portal_hash` (`portal_token_hash`) UNIQUE WHERE `portal_token_hash IS NOT NULL`

---

## 4. Transactional Operations & ACID Compliance

The abstraction provides transactional isolation via `withTransaction`:

```typescript
import { repository } from './server/db/index.js';

await repository.withTransaction(async (tx) => {
  // 1. Create document request
  // 2. Insert line requirements
  // 3. Log audit activity
  // If any operation throws, the transaction rolls back cleanly.
});
```

---

## 5. Migration Execution Plan

### Step 1: Provisioning & Environment Configuration
1. Provision a PostgreSQL 14+ instance (Cloud SQL, RDS, Supabase, Neon, or self-hosted).
2. Set the `DATABASE_URL` environment variable in the production runtime:
   ```bash
   DATABASE_URL="postgresql://documentchaser_admin:YOUR_PASSWORD@your-postgres-host:5432/documentchaser?sslmode=require"
   ```

### Step 2: Running DDL Migrations
Execute the DDL schema file:
```bash
psql "$DATABASE_URL" -f server/db/schema.sql
```
Or execute via the programmatic runner in `server/db/migration.ts`.

### Step 3: Data Migration from File Store
Run the data importer:
```bash
node -e "
import('./server/db/migration.js').then(async m => {
  const migrator = new m.PostgresMigrationManager(process.env.DATABASE_URL);
  await migrator.applySchema();
  const summary = await migrator.migrateDataFromFile();
  console.log('Migration complete:', summary);
  await migrator.close();
});
"
```

### Step 4: Verification Checklist
- [x] All 11 tables populated with expected row counts.
- [x] Referential integrity: Foreign keys validated across firms, users, clients, requests, and documents.
- [x] Zero duplicate records: Idempotency keys and portal token hashes verified unique.
- [x] Verification test suites passed against PostgreSQL.
