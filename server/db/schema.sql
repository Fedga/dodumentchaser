-- ============================================================================
-- DocumentChaser Production PostgreSQL Schema
-- Migration: 001_initial_schema.sql
-- ============================================================================

-- Ensure standard extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Automatic timestamp update function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. FIRMS (Tenants)
-- ============================================================================
CREATE TABLE IF NOT EXISTS firms (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT DEFAULT '',
    default_reminder_days INT NOT NULL DEFAULT 3 CHECK (default_reminder_days > 0),
    default_max_reminders INT NOT NULL DEFAULT 5 CHECK (default_max_reminders >= 0),
    default_reminder_subject TEXT NOT NULL DEFAULT 'Documents still needed for {{request_name}}',
    default_reminder_body TEXT NOT NULL DEFAULT 'Dear {{client_name}}, please submit the following: {{missing_documents}}',
    plan VARCHAR(32) NOT NULL DEFAULT 'Professional' CHECK (plan IN ('Starter', 'Professional', 'Practice', 'Enterprise')),
    manual_chasing_minutes_per_doc INT NOT NULL DEFAULT 5 CHECK (manual_chasing_minutes_per_doc BETWEEN 1 AND 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_firms_updated_at
BEFORE UPDATE ON firms
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. USERS (Firm Accountants & Staff)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    avatar_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_firm_email UNIQUE (firm_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_firm_id ON users(firm_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. CLIENTS (Accounting Clients / Billing Entities)
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(64) PRIMARY KEY,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(64) DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Onboarding', 'Paused', 'Archived')),
    assigned_staff_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clients_firm_id ON clients(firm_id);
CREATE INDEX IF NOT EXISTS idx_clients_firm_status ON clients(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_staff ON clients(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_name ON clients(firm_id, company_name);

CREATE TRIGGER trg_clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. TEMPLATES & TEMPLATE_REQUIREMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS templates (
    id VARCHAR(64) PRIMARY KEY,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    category VARCHAR(128) NOT NULL DEFAULT 'General',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_templates_firm_id ON templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(firm_id, category);

CREATE TRIGGER trg_templates_updated_at
BEFORE UPDATE ON templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS template_requirements (
    id VARCHAR(64) PRIMARY KEY,
    template_id VARCHAR(64) NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    required BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_requirements_template ON template_requirements(template_id, sort_order);

-- ============================================================================
-- 5. RECURRING_REQUESTS (Recurring Schedules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS recurring_requests (
    id VARCHAR(64) PRIMARY KEY,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    template_id VARCHAR(64) REFERENCES templates(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    frequency VARCHAR(32) NOT NULL CHECK (frequency IN ('One-off', 'Monthly', 'Quarterly', 'Annual')),
    next_occurrence DATE NOT NULL,
    due_date_rule_type VARCHAR(32) NOT NULL DEFAULT 'days_after_start' CHECK (due_date_rule_type IN ('days_after_start', 'day_of_month', 'end_of_month')),
    due_date_days_offset INT NOT NULL DEFAULT 14,
    reminder_frequency_days INT NOT NULL DEFAULT 3 CHECK (reminder_frequency_days > 0),
    max_reminders INT NOT NULL DEFAULT 5 CHECK (max_reminders >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Paused', 'Stopped')),
    last_generated_period VARCHAR(64),
    last_generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recurring_requests_firm_id ON recurring_requests(firm_id);
CREATE INDEX IF NOT EXISTS idx_recurring_requests_client ON recurring_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_requests_due ON recurring_requests(status, next_occurrence);

CREATE TRIGGER trg_recurring_requests_updated_at
BEFORE UPDATE ON recurring_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. DOCUMENT_REQUESTS (Chasing Requests)
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_requests (
    id VARCHAR(64) PRIMARY KEY,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    recurring_schedule_id VARCHAR(64) REFERENCES recurring_requests(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    period VARCHAR(64) NOT NULL,
    due_date DATE NOT NULL,
    reminder_frequency_days INT NOT NULL DEFAULT 3 CHECK (reminder_frequency_days > 0),
    max_reminders INT NOT NULL DEFAULT 5 CHECK (max_reminders >= 0),
    reminders_paused BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(32) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'Overdue', 'Archived')),
    portal_token VARCHAR(128),
    portal_token_hash VARCHAR(128),
    portal_token_expires_at TIMESTAMPTZ,
    portal_token_revoked BOOLEAN NOT NULL DEFAULT false,
    portal_token_last_rotated_at TIMESTAMPTZ,
    last_reminder_sent_at TIMESTAMPTZ,
    reminder_count INT NOT NULL DEFAULT 0 CHECK (reminder_count >= 0),
    completed_at TIMESTAMPTZ,
    client_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_requests_firm_id ON document_requests(firm_id);
CREATE INDEX IF NOT EXISTS idx_document_requests_firm_status ON document_requests(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_document_requests_client ON document_requests(client_id, status);
CREATE INDEX IF NOT EXISTS idx_document_requests_due_date ON document_requests(due_date);
CREATE INDEX IF NOT EXISTS idx_document_requests_scheduling ON document_requests(status, reminders_paused, last_reminder_sent_at, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_requests_portal_hash ON document_requests(portal_token_hash) WHERE portal_token_hash IS NOT NULL;

CREATE TRIGGER trg_document_requests_updated_at
BEFORE UPDATE ON document_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. DOCUMENT_REQUIREMENTS (Requested Line Items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_requirements (
    id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL REFERENCES document_requests(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    required BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(32) NOT NULL DEFAULT 'Missing' CHECK (status IN ('Missing', 'Requested', 'Uploaded', 'Approved', 'Rejected', 'Not applicable')),
    rejection_reason TEXT,
    client_note TEXT,
    uploaded_document_id VARCHAR(64),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_requirements_request ON document_requirements(request_id, status);
CREATE INDEX IF NOT EXISTS idx_document_requirements_uploaded_doc ON document_requirements(uploaded_document_id);

CREATE TRIGGER trg_document_requirements_updated_at
BEFORE UPDATE ON document_requirements
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. DOCUMENTS (Uploaded File Artifacts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(64) PRIMARY KEY,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    request_id VARCHAR(64) NOT NULL REFERENCES document_requests(id) ON DELETE CASCADE,
    requirement_id VARCHAR(64) REFERENCES document_requirements(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    storage_path TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Uploaded' CHECK (status IN ('Uploaded', 'Approved', 'Rejected')),
    rejection_reason TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_firm_id ON documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_documents_firm_status ON documents(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_request ON documents(request_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_requirement ON documents(requirement_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);

CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. REMINDERS (Chaser Dispatch Log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminders (
    id VARCHAR(64) PRIMARY KEY,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    request_id VARCHAR(64) NOT NULL REFERENCES document_requests(id) ON DELETE CASCADE,
    client_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    reminder_number INT NOT NULL DEFAULT 1,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    missing_documents JSONB DEFAULT '[]'::jsonb,
    trigger_type VARCHAR(32) NOT NULL DEFAULT 'automated' CHECK (trigger_type IN ('automated', 'manual')),
    delivery_status VARCHAR(32) NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'failed', 'simulated')),
    status VARCHAR(32) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'scheduled', 'failed')),
    idempotency_key VARCHAR(128),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reminders_firm_id ON reminders(firm_id);
CREATE INDEX IF NOT EXISTS idx_reminders_request ON reminders(request_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_reminders_client ON reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_at ON reminders(sent_at);
CREATE INDEX IF NOT EXISTS idx_reminders_trigger_type ON reminders(firm_id, trigger_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_idempotency ON reminders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- 10. ACTIVITY_LOGS (Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id VARCHAR(64) PRIMARY KEY,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    request_id VARCHAR(64) REFERENCES document_requests(id) ON DELETE SET NULL,
    client_id VARCHAR(64) REFERENCES clients(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    actor_type VARCHAR(32) NOT NULL DEFAULT 'accountant' CHECK (actor_type IN ('accountant', 'client', 'system')),
    actor_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_firm_created ON activity_logs(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_client ON activity_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_request ON activity_logs(request_id, created_at DESC);

-- ============================================================================
-- 11. SESSIONS (Authentication Sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    token VARCHAR(128) NOT NULL UNIQUE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_firm_id ON sessions(firm_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR PRODUCTION MULTI-TENANCY
-- (Enforced when app connects with application tenant context)
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Sample policy template for session tenant context:
-- CREATE POLICY tenant_isolation_clients ON clients
--     FOR ALL
--     USING (firm_id = NULLIF(current_setting('app.current_firm_id', true), ''));
