import { BaseMigration } from './index';
import { BaseDatabaseClient } from '../base-database';

/**
 * Migration: change artifact chart y axis to json
 */
export class ChangeArtifactChartYAxisToJsonMigration extends BaseMigration {
  id = 'migration_1759216493864_w3dvtjr7s';
  name = 'change artifact chart y axis to json';
  description = 'change artifact chart y axis to json';
  version = '20250930_124453';
  timestamp = new Date('2025-09-30T07:14:53.865Z');

  async up(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement migration logic
    const query = `ALTER TABLE artifact_entries ALTER COLUMN chart_y_axis TYPE JSONB;`;
    await client.executeQuery(query);
  }

  async down(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement rollback logic
    const query = `ALTER TABLE artifact_entries ALTER COLUMN chart_y_axis TYPE TEXT;`;
    await client.executeQuery(query);
  }
}
