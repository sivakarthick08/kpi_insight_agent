import { BaseMigration } from './index';
import { BaseDatabaseClient } from '../base-database';

/**
 * Migration: added_user_query_in_artifact
 */
export class AddedUserQueryInArtifactMigration extends BaseMigration {
  id = 'migration_1757611038973_dwtwm395h';
  name = 'added_user_query_in_artifact';
  description = 'added_user_query_in_artifact';
  version = '20250911_224718';
  timestamp = new Date('2025-09-11T17:17:18.973Z');

  async up(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement migration logic
    const query = `
    ALTER TABLE artifact_entries ADD COLUMN sql_query TEXT;
    `;
    await client.executeQuery(query);
  }

  async down(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement rollback logic
    const query = `
    ALTER TABLE artifact_entries DROP COLUMN sql_query;
    `;
    await client.executeQuery(query);
  }
}
