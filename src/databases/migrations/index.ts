import { BaseDatabaseClient } from '../base-database';
import { DatabaseType } from '../databaseTypes';

/**
 * Migration interface that all migrations must implement
 */
export interface Migration {
  id: string;
  name: string;
  description: string;
  version: string;
  timestamp: Date;
  up: (client: BaseDatabaseClient) => Promise<void>;
  down: (client: BaseDatabaseClient) => Promise<void>;
}

/**
 * Migration status tracking
 */
export interface MigrationStatus {
  id: string;
  version: string;
  name: string;
  applied_at: Date;
  checksum: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  migration: Migration;
  error?: string;
  duration: number;
}

/**
 * Base migration class that provides common functionality
 */
export abstract class BaseMigration implements Migration {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract version: string;
  abstract timestamp: Date;

  /**
   * Execute the migration (up)
   */
  abstract up(client: BaseDatabaseClient): Promise<void>;

  /**
   * Rollback the migration (down)
   */
  abstract down(client: BaseDatabaseClient): Promise<void>;

  /**
   * Generate a checksum for the migration
   */
  getChecksum(): string {
    const content = `${this.id}-${this.version}-${this.name}-${this.description}`;
    return this.hashString(content);
  }

  /**
   * Simple hash function for checksum generation
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * Migration manager for handling database migrations
 */
export class MigrationManager {
  private migrations: Migration[] = [];
  private client: BaseDatabaseClient;

  constructor(client: BaseDatabaseClient) {
    this.client = client;
  }

  /**
   * Register a migration
   */
  register(migration: Migration): void {
    this.migrations.push(migration);
  }

  /**
   * Get all registered migrations sorted by version
   */
  getMigrations(): Migration[] {
    return this.migrations.sort((a, b) => a.version.localeCompare(b.version));
  }

  /**
   * Get applied migrations from the database
   */
  async getAppliedMigrations(): Promise<MigrationStatus[]> {
    try {
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();
      
      const result = await this.client.executeQuery(
        'SELECT id, version, name, applied_at, checksum FROM migrations ORDER BY applied_at ASC'
      );
      
      return result.map((row: any) => ({
        id: row.id,
        version: row.version,
        name: row.name,
        applied_at: new Date(row.applied_at),
        checksum: row.checksum
      }));
    } catch (error) {
      console.error('Failed to get applied migrations:', error);
      return [];
    }
  }

  /**
   * Get pending migrations (not yet applied)
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const applied = await this.getAppliedMigrations();
    const appliedIds = new Set(applied.map(m => m.id));
    
    return this.getMigrations().filter(migration => !appliedIds.has(migration.id));
  }

  /**
   * Apply a specific migration
   */
  async applyMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Applying migration: ${migration.name} (${migration.version})`);
      
      // Execute the migration
      await migration.up(this.client);
      
      // Record the migration
      await this.recordMigration(migration);
      
      const duration = Date.now() - startTime;
      console.log(`✓ Migration applied successfully in ${duration}ms`);
      
      return {
        success: true,
        migration,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`✗ Migration failed: ${errorMessage}`);
      
      return {
        success: false,
        migration,
        error: errorMessage,
        duration
      };
    }
  }

  /**
   * Rollback a specific migration
   */
  async rollbackMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Rolling back migration: ${migration.name} (${migration.version})`);
      
      // Execute the rollback
      await migration.down(this.client);
      
      // Remove the migration record
      await this.removeMigrationRecord(migration.id);
      
      const duration = Date.now() - startTime;
      console.log(`✓ Migration rolled back successfully in ${duration}ms`);
      
      return {
        success: true,
        migration,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`✗ Migration rollback failed: ${errorMessage}`);
      
      return {
        success: false,
        migration,
        error: errorMessage,
        duration
      };
    }
  }

  /**
   * Apply all pending migrations
   */
  async migrate(): Promise<MigrationResult[]> {
    const pending = await this.getPendingMigrations();
    const results: MigrationResult[] = [];
    
    console.log(`Found ${pending.length} pending migrations`);
    
    for (const migration of pending) {
      const result = await this.applyMigration(migration);
      results.push(result);
      
      if (!result.success) {
        console.error('Migration failed, stopping execution');
        break;
      }
    }
    
    return results;
  }

  /**
   * Rollback the last N migrations
   */
  async rollback(count: number = 1): Promise<MigrationResult[]> {
    const applied = await this.getAppliedMigrations();
    const toRollback = applied.slice(-count).reverse();
    const results: MigrationResult[] = [];
    
    console.log(`Rolling back ${toRollback.length} migrations`);
    
    for (const status of toRollback) {
      const migration = this.migrations.find(m => m.id === status.id);
      if (!migration) {
        console.warn(`Migration ${status.id} not found in registered migrations`);
        continue;
      }
      
      const result = await this.rollbackMigration(migration);
      results.push(result);
      
      if (!result.success) {
        console.error('Migration rollback failed, stopping execution');
        break;
      }
    }
    
    return results;
  }

  /**
   * Create the migrations table if it doesn't exist
   */
  private async createMigrationsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(255) PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(100) NOT NULL
      )
    `;
    
    await this.client.executeQuery(createTableQuery);
  }

  /**
   * Record a migration as applied
   */
  private async recordMigration(migration: Migration): Promise<void> {
    const query = `
      INSERT INTO migrations (id, version, name, description, checksum)
      VALUES ($1, $2, $3, $4, $5)
    `;
    
    // Generate checksum for the migration
    const checksum = this.generateChecksum(migration);
    
    await this.client.executeQuery(query, [
      migration.id,
      migration.version,
      migration.name,
      migration.description,
      checksum
    ]);
  }

  /**
   * Generate a checksum for the migration
   */
  private generateChecksum(migration: Migration): string {
    const content = `${migration.id}-${migration.version}-${migration.name}-${migration.description}`;
    return this.hashString(content);
  }

  /**
   * Simple hash function for checksum generation
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Remove a migration record
   */
  private async removeMigrationRecord(id: string): Promise<void> {
    const query = 'DELETE FROM migrations WHERE id = $1';
    await this.client.executeQuery(query, [id]);
  }

  /**
   * Get migration status summary
   */
  async getStatus(): Promise<{
    total: number;
    applied: number;
    pending: number;
    appliedMigrations: MigrationStatus[];
    pendingMigrations: Migration[];
  }> {
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();
    
    return {
      total: this.migrations.length,
      applied: applied.length,
      pending: pending.length,
      appliedMigrations: applied,
      pendingMigrations: pending
    };
  }
}

/**
 * Utility functions for migration management
 */
export class MigrationUtils {
  /**
   * Generate a unique migration ID
   */
  static generateId(): string {
    return `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a version string from date
   */
  static generateVersion(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  /**
   * Validate migration structure
   */
  static validateMigration(migration: Migration): void {
    if (!migration.id) throw new Error('Migration must have an id');
    if (!migration.name) throw new Error('Migration must have a name');
    if (!migration.version) throw new Error('Migration must have a version');
    if (typeof migration.up !== 'function') throw new Error('Migration must have an up function');
    if (typeof migration.down !== 'function') throw new Error('Migration must have a down function');
  }

  /**
   * Format migration for display
   */
  static formatMigration(migration: Migration): string {
    return `${migration.version} - ${migration.name} (${migration.id})`;
  }
}


