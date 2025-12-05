import { MigrationManager, Migration, MigrationStatus, MigrationResult } from '../../databases/migrations';
import { getDb } from '../../databases/db';
import { KnowledgeBaseAddedMigration } from '../../databases/migrations/20250903_130258-knowledge_base_added';
import { KnowledgeRemoveTitleMigration } from '../../databases/migrations/20250903_190833-knowledge-remove-title';
import { AddedUserQueryInArtifactMigration } from '../../databases/migrations/20250911_224718-added_user_query_in_artifact';
import { AddedChartConfigToArtifactMigration } from '../../databases/migrations/20250925_230331-added-chart-config-to-artifact';
import { ChangeArtifactChartYAxisToJsonMigration } from '../../databases/migrations/20250930_124453-change-artifact-chart-y-axis-to-json';
import { CreateKpiTablesMigration } from '../../databases/migrations/20251013_092239-create-kpi-tables';

export class MigrationService {
  private static migrationManager: MigrationManager | null = null;

  /**
   * Get or create the migration manager instance
   */
  private static getMigrationManager(): MigrationManager {
    if (!this.migrationManager) {
      const dbClient = getDb();
      this.migrationManager = new MigrationManager(dbClient);
      
      // Register all available migrations
      this.registerMigrations();
    }
    return this.migrationManager;
  }

  /**
   * Register all available migrations
   */
  private static async registerMigrations(): Promise<void> {
    // Import and register migrations here
    try {
      // Example migration - you can add more migrations here
      this.migrationManager?.register(new KnowledgeBaseAddedMigration());
      this.migrationManager?.register(new KnowledgeRemoveTitleMigration());
      this.migrationManager?.register(new AddedUserQueryInArtifactMigration());
      this.migrationManager?.register(new AddedChartConfigToArtifactMigration());
      this.migrationManager?.register(new ChangeArtifactChartYAxisToJsonMigration());
      this.migrationManager?.register(new CreateKpiTablesMigration());
      
    } catch (error) {
      console.warn('Could not register example migration:', error);
    }
    
  }

  /**
   * Get migration status summary
   */
  static async getStatus(): Promise<{
    total: number;
    applied: number;
    pending: number;
    appliedMigrations: MigrationStatus[];
    pendingMigrations: Migration[];
  }> {
    const manager = this.getMigrationManager();
    return await manager.getStatus();
  }

  /**
   * Get all applied migrations
   */
  static async getAppliedMigrations(): Promise<MigrationStatus[]> {
    const manager = this.getMigrationManager();
    return await manager.getAppliedMigrations();
  }

  /**
   * Get all pending migrations
   */
  static async getPendingMigrations(): Promise<Migration[]> {
    const manager = this.getMigrationManager();
    return await manager.getPendingMigrations();
  }

  /**
   * Apply all pending migrations
   */
  static async migrateUp(): Promise<MigrationResult[]> {
    const manager = this.getMigrationManager();
    return await manager.migrate();
  }

  /**
   * Rollback the last N migrations
   */
  static async migrateDown(count: number = 1): Promise<MigrationResult[]> {
    const manager = this.getMigrationManager();
    return await manager.rollback(count);
  }

  /**
   * Apply a specific migration by ID
   */
  static async applyMigration(migrationId: string): Promise<MigrationResult> {
    const manager = this.getMigrationManager();
    const migrations = manager.getMigrations();
    const migration = migrations.find(m => m.id === migrationId);
    
    if (!migration) {
      throw new Error(`Migration with ID ${migrationId} not found`);
    }

    return await manager.applyMigration(migration);
  }

  /**
   * Rollback a specific migration by ID
   */
  static async rollbackMigration(migrationId: string): Promise<MigrationResult> {
    const manager = this.getMigrationManager();
    const appliedMigrations = await manager.getAppliedMigrations();
    const migrationStatus = appliedMigrations.find(m => m.id === migrationId);
    
    if (!migrationStatus) {
      throw new Error(`Migration with ID ${migrationId} is not applied`);
    }

    const migrations = manager.getMigrations();
    const migration = migrations.find(m => m.id === migrationId);
    
    if (!migration) {
      throw new Error(`Migration with ID ${migrationId} not found in registered migrations`);
    }

    return await manager.rollbackMigration(migration);
  }

  /**
   * Get a specific migration by ID
   */
  static async getMigration(migrationId: string): Promise<Migration | null> {
    const manager = this.getMigrationManager();
    const migrations = manager.getMigrations();
    return migrations.find(m => m.id === migrationId) || null;
  }

  /**
   * Get migration status by ID
   */
  static async getMigrationStatus(migrationId: string): Promise<MigrationStatus | null> {
    const manager = this.getMigrationManager();
    const appliedMigrations = await manager.getAppliedMigrations();
    return appliedMigrations.find(m => m.id === migrationId) || null;
  }

  /**
   * Validate migration structure
   */
  static validateMigration(migration: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!migration.id) errors.push('Migration must have an id');
    if (!migration.name) errors.push('Migration must have a name');
    if (!migration.version) errors.push('Migration must have a version');
    if (typeof migration.up !== 'function') errors.push('Migration must have an up function');
    if (typeof migration.down !== 'function') errors.push('Migration must have a down function');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
