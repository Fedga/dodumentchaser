// scripts/verify-postgres.ts
import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
const { Pool } = pg;
import { PostgresDatabaseRepository } from '../server/db/postgresRepository.js';
import { PostgresMigrationManager } from '../server/db/migration.js';
import { dbService } from '../server/db/index.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('DATABASE_URL is not set.');
    process.exit(1);
  }

  console.log('DATABASE_URL detected: YES');

  const repo = new PostgresDatabaseRepository(url);
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    // Test connection via repository ping
    const pingOk = await repo.ping();
    console.log('PostgreSQL connection:', pingOk ? 'SUCCESS' : 'FAILED');

    // Run simple query SELECT NOW()
    const nowRes = await pool.query('SELECT NOW() as current_time');
    console.log('Database query (SELECT NOW()):', nowRes.rows?.[0]?.current_time ? 'SUCCESS' : 'FAILED');

    // Check tables in public schema
    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const existingTables = tablesRes.rows.map(r => r.table_name);
    console.log('Existing tables in database:', existingTables);

    const targetTables = [
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

    const presentTables = targetTables.filter(t => existingTables.includes(t));
    console.log(`Target tables found: ${presentTables.length}/${targetTables.length}`);

    // Check indexes
    const indexesRes = await pool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    console.log(`Total public indexes found: ${indexesRes.rows.length}`);

    // Check foreign keys and constraints
    const constraintsRes = await pool.query(`
      SELECT conname, contype, conrelid::regclass AS table_name
      FROM pg_constraint
      JOIN pg_namespace ON pg_namespace.oid = pg_constraint.connamespace
      WHERE pg_namespace.nspname = 'public'
      ORDER BY table_name, conname;
    `);
    console.log(`Total constraints found: ${constraintsRes.rows.length}`);

    // Check row counts if tables exist
    for (const t of presentTables) {
      const countRes = await pool.query(`SELECT count(*)::int as cnt FROM ${t}`);
      console.log(`Table ${t}: ${countRes.rows[0].cnt} rows`);
    }

  } catch (err: any) {
    console.error('Error during inspection:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
