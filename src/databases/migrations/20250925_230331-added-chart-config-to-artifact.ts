import { BaseMigration } from "./index";
import { BaseDatabaseClient } from "../base-database";
import { ARTIFACT_ENTRIES_TABLE_NAME } from "../../mastra/lib/conts";

/**
 * Migration: added chart config to artifact
 */
export class AddedChartConfigToArtifactMigration extends BaseMigration {
  id = "migration_1758821611739_waympq9vi";
  name = "added chart config to artifact";
  description = "added chart config to artifact";
  version = "20250925_230331";
  timestamp = new Date("2025-09-25T17:33:31.740Z");

  async up(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement migration logic
    const query = `ALTER TABLE ${ARTIFACT_ENTRIES_TABLE_NAME} ADD COLUMN chart_type VARCHAR(255) NOT NULL DEFAULT 'table';`;
    const query2 = `ALTER TABLE ${ARTIFACT_ENTRIES_TABLE_NAME} ADD COLUMN chart_x_axis VARCHAR(255) NOT NULL DEFAULT '';`;
    const query3 = `ALTER TABLE ${ARTIFACT_ENTRIES_TABLE_NAME} ADD COLUMN chart_y_axis JSONB NOT NULL DEFAULT '{}';`;
    await client.executeQuery(query);
    await client.executeQuery(query2);
    await client.executeQuery(query3);
  }

  async down(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement rollback logic
    const query = `ALTER TABLE ${ARTIFACT_ENTRIES_TABLE_NAME} DROP COLUMN chart_type;`;
    const query2 = `ALTER TABLE ${ARTIFACT_ENTRIES_TABLE_NAME} DROP COLUMN chart_x_axis;`;
    const query3 = `ALTER TABLE ${ARTIFACT_ENTRIES_TABLE_NAME} DROP COLUMN chart_y_axis;`;
    await client.executeQuery(query);
    await client.executeQuery(query2);
    await client.executeQuery(query3);
  }
}
