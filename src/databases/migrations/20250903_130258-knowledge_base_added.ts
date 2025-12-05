import { BaseMigration } from './index';
import { BaseDatabaseClient } from '../base-database';
import { KNOWLEDGE_BASE_TABLE_NAME } from '../../mastra/lib/conts';

/**
 * Migration: knowledge_base_added
 */
export class KnowledgeBaseAddedMigration extends BaseMigration {
  id = 'migration_1756884778994_j4ixjq6s8';
  name = 'knowledge_base_added';
  description = 'knowledge_base_added';
  version = '20250903_130258';
  timestamp = new Date('2025-09-03T07:32:58.994Z');

  async up(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement migration logic
    const query = `
    CREATE TABLE IF NOT EXISTS ${KNOWLEDGE_BASE_TABLE_NAME} (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255) NOT NULL,
      application_id VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB NOT NULL,
      version INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    await client.executeQuery(query);

    const IndexQuery = `
    CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant_id ON ${KNOWLEDGE_BASE_TABLE_NAME} (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_base_application_id ON ${KNOWLEDGE_BASE_TABLE_NAME} (application_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_base_version ON ${KNOWLEDGE_BASE_TABLE_NAME} (version);
    CREATE INDEX IF NOT EXISTS idx_knowledge_base_title ON ${KNOWLEDGE_BASE_TABLE_NAME} (title);
    `;
    await client.executeQuery(IndexQuery);
  }

  async down(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement rollback logic
    const query = `DROP TABLE IF EXISTS ${KNOWLEDGE_BASE_TABLE_NAME}`;
    await client.executeQuery(query);

    const IndexQuery = `
    DROP INDEX IF EXISTS idx_knowledge_base_tenant_id;
    DROP INDEX IF EXISTS idx_knowledge_base_application_id;
    DROP INDEX IF EXISTS idx_knowledge_base_version;
    DROP INDEX IF EXISTS idx_knowledge_base_title;
    `;
    await client.executeQuery(IndexQuery);
  }
}
