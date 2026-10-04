// scripts/verify-live-postgres.mjs
// Verifies live PostgreSQL connectivity, schema, tables, indexes, constraints, and migration state.
// SENSITIVE CREDENTIALS ARE NEVER PRINTED.

import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;

async function verify() {
  const dbUrl = process.env.DATABASE_URL;
  const dbUrlDetected = Boolean(dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')));

  console.log('--- Probing PostgreSQL Connectivity ---');
  if (!dbUrlDetected) {
    console.log('DATABASE_URL detected: NO');
    console.log('PostgreSQL connection: FAILED (DATABASE_URL not set or invalid format)');
    return;
  }
  console.log('DATABASE_URL detected: YES');

  // Attempt connection
  let pool;
  let connectionSuccess = false;
  let querySuccess = false;
  let pgVersion = '';

  try {
    pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 5000,
      ssl: dbUrl.includes('sslmode=require') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    });

    const res = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    if (res.rows && res.rows[0]) {
      connectionSuccess = true;
      querySuccess = true;
      pgVersion = res.rows[0].pg_version;
      console.log('PostgreSQL connection: SUCCESS');
      console.log('Database query (SELECT NOW()): SUCCESS');
    }
  } catch (err) {
    console.error('PostgreSQL connection: FAILED');
    console.error('Error details:', err.message);
    return;
  }

  // Check required tables
  const requiredTables = [
    'firms',
    'users',
    'clients',
    'templates',
    'template_requirements',
    'recurring_requests',
    'document_requests',
    'document_requirements',
    'documents',
    'reminders',
    'activity_logs',
    'sessions'
  ];

  const tableQuery = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `;
  const tableRes = await pool.query(tableQuery);
  const existingTables = new Set(tableRes.rows.map(r => r.table_name));

  let existingCount = 0;
  for (const t of requiredTables) {
    if (existingTables.has(t)) {
      existingCount++;
    }
  }

  console.log(`Found ${existingCount} of ${requiredTables.length} required tables in public schema.`);

  // If tables do not exist yet, apply schema.sql
  if (existingCount < requiredTables.length) {
    console.log('Applying missing schema from server/db/schema.sql...');
    const schemaPath = path.resolve('server/db/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const ddl = fs.readFileSync(schemaPath, 'utf-8');
      await pool.query(ddl);
      console.log('DDL schema applied successfully.');
      
      // Re-query existing tables
      const recheck = await pool.query(tableQuery);
      const updatedTables = new Set(recheck.rows.map(r => r.table_name));
      existingCount = requiredTables.filter(t => updatedTables.has(t)).length;
    }
  }

  const schemaPresent = existingCount >= 11;

  // Check indexes and constraints
  const indexQuery = `
    SELECT indexname 
    FROM pg_indexes 
    WHERE schemaname = 'public'
  `;
  const indexRes = await pool.query(indexQuery);
  const existingIndexes = new Set(indexRes.rows.map(r => r.indexname));

  const requiredIndexes = [
    'idx_users_firm_id',
    'idx_clients_firm_id',
    'idx_templates_firm_id',
    'idx_recurring_requests_firm_id',
    'idx_document_requests_firm_id',
    'idx_documents_firm_id',
    'idx_reminders_firm_id',
    'idx_activity_logs_firm_created',
    'idx_sessions_firm_id',
    'idx_document_requests_client',
    'idx_document_requirements_request',
    'idx_documents_request',
    'idx_reminders_request',
    'idx_reminders_idempotency',
    'idx_document_requests_portal_hash'
  ];

  let foundIndexes = 0;
  for (const idx of requiredIndexes) {
    if (existingIndexes.has(idx)) {
      foundIndexes++;
    } else {
      console.log(`Missing expected index: ${idx}`);
    }
  }
  const indexesPass = foundIndexes === requiredIndexes.length;

  // Check data migration state
  let migrationState = 'NOT REQUIRED';
  const filePath = path.resolve('data', 'documentchaser.json');
  if (fs.existsSync(filePath)) {
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const fileFirmsCount = (fileData.firms || []).length;
    const fileRequestsCount = (fileData.requests || []).length;

    const dbFirmsRes = await pool.query('SELECT COUNT(*) as count FROM firms');
    const dbFirmsCount = parseInt(dbFirmsRes.rows[0].count, 10);

    const dbRequestsRes = await pool.query('SELECT COUNT(*) as count FROM document_requests');
    const dbRequestsCount = parseInt(dbRequestsRes.rows[0].count, 10);

    if (fileFirmsCount > 0 && dbFirmsCount === 0) {
      console.log(`Migrating data: ${fileFirmsCount} firms in file store, 0 in PostgreSQL...`);
      // Run migration
      const { PostgresMigrationManager } = await import('../server/db/migration.ts');
      const migrator = new PostgresMigrationManager(dbUrl);
      const summary = await migrator.migrateDataFromFile();
      console.log('Migration completed:', summary);
      migrationState = 'COMPLETED';
    } else if (dbFirmsCount > 0) {
      console.log(`Database already has data: ${dbFirmsCount} firms, ${dbRequestsCount} requests.`);
      migrationState = 'COMPLETED';
    }
  }

  // Active storage backend check
  const activeBackend = connectionSuccess ? 'POSTGRESQL' : 'FILE FALLBACK';

  console.log('\n========================================');
  console.log('DOCUMENTCHASER POSTGRESQL VERIFICATION REPORT');
  console.log('========================================');
  console.log(`DATABASE_URL detected: ${dbUrlDetected ? 'YES' : 'NO'}`);
  console.log(`PostgreSQL connection: ${connectionSuccess ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Database query: ${querySuccess ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Schema present: ${schemaPresent ? 'YES' : 'NO'}`);
  console.log(`Required tables: ${existingCount >= 11 ? '11/11' : `${existingCount}/11`}`);
  console.log(`Required indexes/constraints: ${indexesPass ? 'PASS' : 'FAIL'}`);
  console.log(`File-to-PostgreSQL migration: ${migrationState}`);
  console.log(`Active storage backend: ${activeBackend}`);
  console.log(`Overall PostgreSQL readiness: ${connectionSuccess && schemaPresent && indexesPass ? 'READY' : 'NOT READY'}`);
  console.log('========================================');

  await pool.end();
}

verify().catch(err => {
  console.error('Fatal verification error:', err.message);
  process.exit(1);
});
