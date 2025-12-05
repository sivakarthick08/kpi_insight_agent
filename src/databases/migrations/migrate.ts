#!/usr/bin/env node

import { MigrationManager, MigrationUtils } from './index.js';
import { PostgresClient } from '../postgres.js';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { KnowledgeBaseAddedMigration } from './20250903_130258-knowledge_base_added.js';
import { KnowledgeRemoveTitleMigration } from './20250903_190833-knowledge-remove-title.js';
import { AddedUserQueryInArtifactMigration } from './20250911_224718-added_user_query_in_artifact.js';
import { AddedChartConfigToArtifactMigration } from './20250925_230331-added-chart-config-to-artifact.js';
import { ChangeArtifactChartYAxisToJsonMigration } from './20250930_124453-change-artifact-chart-y-axis-to-json.js';

// Load environment variables
dotenv.config();

/**
 * Migration script for manual migration execution
 * Usage: 
 *   npm run migrate:up    - Apply all pending migrations
 *   npm run migrate:down  - Rollback last migration
 *   npm run migrate:status - Show migration status
 *   npm run migrate:create <name> - Create a new migration
 */

class MigrationScript {
  private manager: MigrationManager;
  private client: PostgresClient;

  constructor() {
    // Initialize database client
    this.client = new PostgresClient(process.env.POSTGRES_CONNECTION_STRING || '');

    // Initialize migration manager
    this.manager = new MigrationManager(this.client);

    // Register all migrations
    this.registerMigrations();
  }

  /**
   * Register all available migrations
   */
  private registerMigrations(): void {
    // Register your migrations here
    this.manager.register(new KnowledgeBaseAddedMigration());
    this.manager.register(new KnowledgeRemoveTitleMigration());
    this.manager.register(new AddedUserQueryInArtifactMigration());
    this.manager.register(new AddedChartConfigToArtifactMigration());
    this.manager.register(new ChangeArtifactChartYAxisToJsonMigration());
    // Add more migrations as needed:
    // this.manager.register(new CreateProductsTableMigration());
    // this.manager.register(new AddUserRolesMigration());
  }

  /**
   * Apply all pending migrations
   */
  async migrateUp(): Promise<void> {
    try {
      console.log('🚀 Starting migration...');
      
      const results = await this.manager.migrate();
      
      console.log('\n📊 Migration Results:');
      let successCount = 0;
      let failureCount = 0;
      
      for (const result of results) {
        if (result.success) {
          console.log(`✅ ${result.migration.name} - ${result.duration}ms`);
          successCount++;
        } else {
          console.log(`❌ ${result.migration.name} - ${result.error}`);
          failureCount++;
        }
      }
      
      console.log(`\n🎯 Summary: ${successCount} successful, ${failureCount} failed`);
      
      if (failureCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    } finally {
      await this.client.close();
    }
  }

  /**
   * Rollback the last N migrations
   */
  async migrateDown(count: number = 1): Promise<void> {
    try {
      console.log(`🔄 Rolling back ${count} migration(s)...`);
      
      const results = await this.manager.rollback(count);
      
      console.log('\n📊 Rollback Results:');
      let successCount = 0;
      let failureCount = 0;
      
      for (const result of results) {
        if (result.success) {
          console.log(`✅ ${result.migration.name} - ${result.duration}ms`);
          successCount++;
        } else {
          console.log(`❌ ${result.migration.name} - ${result.error}`);
          failureCount++;
        }
      }
      
      console.log(`\n🎯 Summary: ${successCount} successful, ${failureCount} failed`);
      
      if (failureCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('💥 Rollback failed:', error);
      process.exit(1);
    } finally {
      await this.client.close();
    }
  }

  /**
   * Show migration status
   */
  async showStatus(): Promise<void> {
    try {
      const status = await this.manager.getStatus();
      
      console.log('📋 Migration Status:');
      console.log(`Total migrations: ${status.total}`);
      console.log(`Applied: ${status.applied}`);
      console.log(`Pending: ${status.pending}`);
      
      if (status.appliedMigrations.length > 0) {
        console.log('\n✅ Applied Migrations:');
        for (const migration of status.appliedMigrations) {
          console.log(`  ${migration.version} - ${migration.name} (${migration.applied_at.toISOString()})`);
        }
      }
      
      if (status.pendingMigrations.length > 0) {
        console.log('\n⏳ Pending Migrations:');
        for (const migration of status.pendingMigrations) {
          console.log(`  ${migration.version} - ${migration.name}`);
        }
      } else {
        console.log('\n✨ All migrations are up to date!');
      }
    } catch (error) {
      console.error('💥 Failed to get status:', error);
      process.exit(1);
    } finally {
      await this.client.close();
    }
  }

  /**
   * Create a new migration file
   */
  async createMigration(name: string): Promise<void> {
    try {
      const id = MigrationUtils.generateId();
      const version = MigrationUtils.generateVersion();
      const timestamp = new Date().toISOString();
      
      const template = `import { BaseMigration } from './index';
import { BaseDatabaseClient } from '../base-database';

/**
 * Migration: ${name}
 */
export class ${this.toPascalCase(name)}Migration extends BaseMigration {
  id = '${id}';
  name = '${name}';
  description = '${name}';
  version = '${version}';
  timestamp = new Date('${timestamp}');

  async up(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement migration logic
    const query = \`-- Your SQL here\`;
    await client.executeQuery(query);
  }

  async down(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement rollback logic
    const query = \`-- Your rollback SQL here\`;
    await client.executeQuery(query);
  }
}
`;

      const filename = `${version}-${name.toLowerCase().replace(/\s+/g, '-')}.ts`;
      const filepath = `./src/databases/migrations/${filename}`;
      fs.writeFileSync(filepath, template);
      
      console.log(`📝 Creating migration file: ${filepath}`);
      console.log('\nTemplate:');
      console.log(template);
      
      console.log('\n📋 Next steps:');
      console.log(`1. Implement the up() and down() methods`);
      console.log('2. Register the migration in migrate.ts');
      console.log('3. Run: npm run migrate:up');
      
    } catch (error) {
      console.error('💥 Failed to create migration:', error);
      process.exit(1);
    }
  }

  /**
   * Convert string to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[\s-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const script = new MigrationScript();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'up':
      await script.migrateUp();
      break;
    case 'down':
      const count = args[0] ? parseInt(args[0]) : 1;
      await script.migrateDown(count);
      break;
    case 'status':
      await script.showStatus();
      break;
    case 'create':
      if (!args[0]) {
        console.error('❌ Please provide a migration name');
        console.log('Usage: npm run migrate:create <migration-name>');
        process.exit(1);
      }
      await script.createMigration(args[0]);
      break;
    default:
      console.log('🚀 Migration Script');
      console.log('\nUsage:');
      console.log('  npm run migrate:up                    - Apply all pending migrations');
      console.log('  npm run migrate:down [count]          - Rollback last N migrations');
      console.log('  npm run migrate:status                - Show migration status');
      console.log('  npm run migrate:create <name>         - Create a new migration');
      console.log('\nExamples:');
      console.log('  npm run migrate:up');
      console.log('  npm run migrate:down 2');
      console.log('  npm run migrate:create "add user roles"');
      break;
  }
}

// Run the script
main().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});
