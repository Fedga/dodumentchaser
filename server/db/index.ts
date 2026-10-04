// server/db/index.ts
// Database Service Factory decoupling storage and business logic

import { IDatabaseRepository } from './repository.interface.js';
import { PostgresDatabaseRepository } from './postgresRepository.js';
import { FileDatabaseRepository } from './fileRepository.js';

class DatabaseService {
  private repository: IDatabaseRepository;
  private isPostgresActive: boolean = false;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    // Detect PostgreSQL connection string
    // Format: postgresql://user:password@host:port/dbname
    if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
      try {
        console.log('[DatabaseService] Initializing Production PostgreSQL Repository...');
        this.repository = new PostgresDatabaseRepository(databaseUrl);
        this.isPostgresActive = true;
      } catch (err) {
        console.error('[DatabaseService] Failed to initialize PostgreSQL repository, falling back to file persistence:', err);
        this.repository = new FileDatabaseRepository();
        this.isPostgresActive = false;
      }
    } else {
      console.log('[DatabaseService] Using File-Backed JSON Repository (Set DATABASE_URL to enable PostgreSQL)...');
      this.repository = new FileDatabaseRepository();
      this.isPostgresActive = false;
    }
  }

  public getRepository(): IDatabaseRepository {
    return this.repository;
  }

  public getEngine(): 'postgresql' | 'file-json' {
    return this.repository.getEngineType();
  }

  public isPostgres(): boolean {
    return this.isPostgresActive;
  }

  public async checkHealth(): Promise<{ healthy: boolean; engine: string }> {
    const healthy = await this.repository.ping();
    return {
      healthy,
      engine: this.repository.getEngineType(),
    };
  }
}

export const dbService = new DatabaseService();
export const repository: IDatabaseRepository = dbService.getRepository();
export * from './repository.interface.js';
export { PostgresDatabaseRepository } from './postgresRepository.js';
export { FileDatabaseRepository } from './fileRepository.js';
