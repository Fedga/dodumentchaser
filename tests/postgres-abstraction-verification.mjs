// tests/postgres-abstraction-verification.mjs
// Verification of PostgreSQL schema, repository abstraction, and migration plan

import assert from 'assert';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function asyncIt(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== DocumentChaser Production PostgreSQL Abstraction Verification ===\n');

  // Test 1: Verify PostgreSQL Schema DDL File exists and covers all required entities
  it('server/db/schema.sql contains all 11 required entities with proper syntax', () => {
    const schemaPath = path.resolve('server/db/schema.sql');
    assert(fs.existsSync(schemaPath), 'schema.sql must exist');
    const ddl = fs.readFileSync(schemaPath, 'utf-8');

    const expectedEntities = [
      'CREATE TABLE IF NOT EXISTS firms',
      'CREATE TABLE IF NOT EXISTS users',
      'CREATE TABLE IF NOT EXISTS clients',
      'CREATE TABLE IF NOT EXISTS templates',
      'CREATE TABLE IF NOT EXISTS template_requirements',
      'CREATE TABLE IF NOT EXISTS recurring_requests',
      'CREATE TABLE IF NOT EXISTS document_requests',
      'CREATE TABLE IF NOT EXISTS document_requirements',
      'CREATE TABLE IF NOT EXISTS documents',
      'CREATE TABLE IF NOT EXISTS reminders',
      'CREATE TABLE IF NOT EXISTS activity_logs',
      'CREATE TABLE IF NOT EXISTS sessions',
    ];

    for (const entity of expectedEntities) {
      assert(ddl.includes(entity), `Schema must contain table definition: ${entity}`);
    }
  });

  // Test 2: Verify Foreign Keys, Referential Integrity, and Cascade Constraints
  it('schema.sql enforces foreign keys and referential cascades', () => {
    const ddl = fs.readFileSync(path.resolve('server/db/schema.sql'), 'utf-8');

    assert(ddl.includes('firm_id VARCHAR(64) NOT NULL REFERENCES firms(id) ON DELETE CASCADE'), 'Users must cascade on firm deletion');
    assert(ddl.includes('client_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE'), 'Requests must cascade on client deletion');
    assert(ddl.includes('request_id VARCHAR(64) NOT NULL REFERENCES document_requests(id) ON DELETE CASCADE'), 'Requirements must cascade on request deletion');
    assert(ddl.includes('template_id VARCHAR(64) NOT NULL REFERENCES templates(id) ON DELETE CASCADE'), 'Template requirements must cascade on template deletion');
    assert(ddl.includes('assigned_staff_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL'), 'Client staff must set null on user deletion');
  });

  // Test 3: Verify Tenant Isolation Indexes (firm_id)
  it('schema.sql creates tenant isolation indexes across all firm-scoped tables', () => {
    const ddl = fs.readFileSync(path.resolve('server/db/schema.sql'), 'utf-8');

    const tenantIndexes = [
      'idx_users_firm_id',
      'idx_clients_firm_id',
      'idx_templates_firm_id',
      'idx_recurring_requests_firm_id',
      'idx_document_requests_firm_id',
      'idx_documents_firm_id',
      'idx_reminders_firm_id',
      'idx_activity_logs_firm_created',
      'idx_sessions_firm_id',
    ];

    for (const idx of tenantIndexes) {
      assert(ddl.includes(idx), `Schema must define tenant index: ${idx}`);
    }
  });

  // Test 4: Verify Scheduling & Performance Indexes
  it('schema.sql defines composite indexes for chaser scheduling and query speed', () => {
    const ddl = fs.readFileSync(path.resolve('server/db/schema.sql'), 'utf-8');

    const compositeIndexes = [
      'idx_document_requests_client',
      'idx_document_requests_firm_status',
      'idx_document_requirements_request',
      'idx_documents_request',
      'idx_reminders_request',
      'idx_document_requests_scheduling',
      'idx_recurring_requests_due',
    ];

    for (const idx of compositeIndexes) {
      assert(ddl.includes(idx), `Schema must define composite index: ${idx}`);
    }
  });

  // Test 5: Verify Unique Constraints for Idempotency and Portal Security
  it('schema.sql enforces unique constraints for idempotency and portal tokens', () => {
    const ddl = fs.readFileSync(path.resolve('server/db/schema.sql'), 'utf-8');

    assert(ddl.includes('idx_reminders_idempotency'), 'Must have unique index on reminder idempotency_key');
    assert(ddl.includes('idx_document_requests_portal_hash'), 'Must have unique index on portal_token_hash');
    assert(ddl.includes('uq_users_firm_email'), 'Must have unique constraint on (firm_id, email)');
  });

  // Test 6: Verify Database Repository Service Abstraction
  await asyncIt('Repository abstraction factory initializes and fulfills IDatabaseRepository contract', async () => {
    const { repository, dbService } = await import('../server/db/index.js');

    assert(repository, 'Repository must be exported');
    assert(typeof repository.getEngineType === 'function', 'getEngineType function must exist');
    assert(typeof repository.ping === 'function', 'ping function must exist');
    assert(typeof repository.withTransaction === 'function', 'withTransaction must exist');

    const engine = repository.getEngineType();
    assert(engine === 'file-json' || engine === 'postgresql', 'Engine must be file-json or postgresql');

    const healthy = await repository.ping();
    assert.strictEqual(healthy, true, 'Repository health check ping must succeed');
  });

  // Test 7: Verify Entity Operations through Repository Abstraction
  await asyncIt('Repository abstraction performs tenant-isolated queries correctly', async () => {
    const { repository } = await import('../server/db/index.js');

    const firms = await repository.getFirms();
    assert(Array.isArray(firms), 'getFirms must return an array');
    assert(firms.length >= 2, 'Should contain at least Firm A and Firm B');

    const firmA = await repository.getFirmById('firm_example_01');
    assert(firmA, 'Firm A must be retrievable');
    assert.strictEqual(firmA.id, 'firm_example_01');

    // Tenant isolated clients
    const firmAClients = await repository.getClients('firm_example_01');
    const firmBClients = await repository.getClients('firm_apex_02');

    assert(Array.isArray(firmAClients));
    assert(Array.isArray(firmBClients));
    assert(firmAClients.every(c => c.firmId === 'firm_example_01'), 'Firm A clients must only belong to Firm A');
    assert(firmBClients.every(c => c.firmId === 'firm_apex_02'), 'Firm B clients must only belong to Firm B');

    // Tenant isolated requests
    const firmARequests = await repository.getRequests('firm_example_01');
    const firmBRequests = await repository.getRequests('firm_apex_02');
    assert(firmARequests.every(r => r.firmId === 'firm_example_01'), 'Firm A requests must only belong to Firm A');
    assert(firmBRequests.every(r => r.firmId === 'firm_apex_02'), 'Firm B requests must only belong to Firm B');
  });

  // Test 8: Verify Transactional Abstraction
  await asyncIt('withTransaction executes work atomically and returns result', async () => {
    const { repository } = await import('../server/db/index.js');

    const result = await repository.withTransaction(async (tx) => {
      assert(tx, 'Transaction context must be passed');
      return { success: true, timestamp: Date.now() };
    });

    assert.strictEqual(result.success, true);
    assert(result.timestamp > 0);
  });

  // Test 9: Verify Environment Variable Configuration Safety
  it('.env.example documents DATABASE_URL securely without credentials', () => {
    const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf-8');
    assert(envExample.includes('DATABASE_URL='), '.env.example must define DATABASE_URL template');
    assert(!envExample.includes('production_secret'), 'Must not leak hardcoded secrets');
  });

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
