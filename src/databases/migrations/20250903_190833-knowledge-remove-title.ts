import { BaseMigration } from "./index";
import { BaseDatabaseClient } from "../base-database";
import { KNOWLEDGE_BASE_TABLE_NAME } from "../../mastra/lib/conts";

/**
 * Migration: knowledge remove title
 */
export class KnowledgeRemoveTitleMigration extends BaseMigration {
  id = "migration_1756906713396_9bluddhxt";
  name = "knowledge remove title";
  description = "knowledge remove title";
  version = "20250903_190833";
  timestamp = new Date("2025-09-03T13:38:33.397Z");

  async up(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement migration logic
    const query = `ALTER TABLE ${KNOWLEDGE_BASE_TABLE_NAME} DROP COLUMN IF EXISTS title`;
    await client.executeQuery(query);
  }

  async down(client: BaseDatabaseClient): Promise<void> {
    // TODO: Implement rollback logic
    const query = `ALTER TABLE ${KNOWLEDGE_BASE_TABLE_NAME} ADD COLUMN title VARCHAR(255)`;
    await client.executeQuery(query);
  }
}
