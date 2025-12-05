import { BaseMigration } from './index';
import { BaseDatabaseClient } from '../base-database';
import { KPI_ENTRIES_TABLE_NAME } from '../../mastra/lib/conts';

/**
 * Migration: create-kpi-tables
 */
export class CreateKpiTablesMigration extends BaseMigration {
  id = 'migration_1758821611739_kpi_tables';
  name = 'create-kpi-tables';
  description = 'Create KPI entries table with all required fields and indexes';
  version = '20251013_092239';
  timestamp = new Date('2025-10-13T09:22:39.000Z');

  async up(client: BaseDatabaseClient): Promise<void> {
    // Create kpi_entries table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${KPI_ENTRIES_TABLE_NAME} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        sql_query TEXT NOT NULL,
        formula TEXT,
        tables_used JSONB NOT NULL DEFAULT '[]',
        columns_used JSONB NOT NULL DEFAULT '[]',
        category VARCHAR(100),
        tenant_id VARCHAR(255) NOT NULL,
        application_id VARCHAR(255) NOT NULL,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await client.executeQuery(createTableQuery);

    // Create indexes for performance
    const createIndexesQuery = `
      CREATE INDEX IF NOT EXISTS idx_kpi_entries_tenant_id ON ${KPI_ENTRIES_TABLE_NAME} (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_kpi_entries_application_id ON ${KPI_ENTRIES_TABLE_NAME} (application_id);
      CREATE INDEX IF NOT EXISTS idx_kpi_entries_category ON ${KPI_ENTRIES_TABLE_NAME} (category);
      CREATE INDEX IF NOT EXISTS idx_kpi_entries_created_at ON ${KPI_ENTRIES_TABLE_NAME} (created_at);
      CREATE INDEX IF NOT EXISTS idx_kpi_entries_title ON ${KPI_ENTRIES_TABLE_NAME} (title);
    `;
    await client.executeQuery(createIndexesQuery);

    // Create trigger for updated_at
    const createTriggerQuery = `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_kpi_entries_updated_at ON ${KPI_ENTRIES_TABLE_NAME};
      CREATE TRIGGER update_kpi_entries_updated_at
        BEFORE UPDATE ON ${KPI_ENTRIES_TABLE_NAME}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `;
    await client.executeQuery(createTriggerQuery);
  }

  async down(client: BaseDatabaseClient): Promise<void> {
    // Drop trigger
    const dropTriggerQuery = `
      DROP TRIGGER IF EXISTS update_kpi_entries_updated_at ON ${KPI_ENTRIES_TABLE_NAME};
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `;
    await client.executeQuery(dropTriggerQuery);

    // Drop indexes
    const dropIndexesQuery = `
      DROP INDEX IF EXISTS idx_kpi_entries_tenant_id;
      DROP INDEX IF EXISTS idx_kpi_entries_application_id;
      DROP INDEX IF EXISTS idx_kpi_entries_category;
      DROP INDEX IF EXISTS idx_kpi_entries_created_at;
      DROP INDEX IF EXISTS idx_kpi_entries_title;
    `;
    await client.executeQuery(dropIndexesQuery);

    // Drop table
    const dropTableQuery = `DROP TABLE IF EXISTS ${KPI_ENTRIES_TABLE_NAME}`;
    await client.executeQuery(dropTableQuery);
  }
}
