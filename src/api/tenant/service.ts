import { PostgresClient } from "../../databases";
import { getDefaultPgVector } from "../../mastra/lib/pgVector";
import {
  ARTIFACT_ENTRIES_TABLE_NAME,
  CONTENTS_ENTRIES_TABLE_NAME,
  FEEDBACK_EVENTS_TABLE_NAME,
  SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
} from "../../mastra/lib/conts";

export interface TenantCreateParams {
  tenantId: string;
}

export interface TenantDeleteParams {
  tenantId: string;
}

export class TenantService {
  /**
   * Create tenant schema and initialize all required tables and indexes
   */
  static async createTenantSchema(params: TenantCreateParams): Promise<void> {
    const { tenantId } = params;

    if (!process.env.POSTGRES_CONNECTION_STRING) {
      throw new Error("POSTGRES_CONNECTION_STRING is not set");
    }

    if (!process.env.AGENT_POSTGRES_CONNECTION_STRING) {
      throw new Error("AGENT_POSTGRES_CONNECTION_STRING is not set");
    }

    console.log("Creating agent schema:", tenantId);
    const agentClient = new PostgresClient(
      process.env.AGENT_POSTGRES_CONNECTION_STRING || ""
    );
    await agentClient.createTenantSchema(tenantId);

    const store = getDefaultPgVector();

    console.log("Creating app schema:", tenantId);
    const appClient = new PostgresClient(
      process.env.POSTGRES_CONNECTION_STRING || ""
    );
    await appClient.createTenantSchema("public");

    try {
      // Initialize the vector index
      await store?.createIndex({
        indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
        metric: "cosine",
        dimension: 1536,
      });
      console.log("✅ Semantic layer storage initialized successfully");

      await store?.createIndex({
        indexName: CONTENTS_ENTRIES_TABLE_NAME,
        metric: "cosine",
        dimension: 1536,
      });

      // Create artifact table
      await appClient.executeQuery(
        `CREATE TABLE IF NOT EXISTS ${ARTIFACT_ENTRIES_TABLE_NAME} (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          thread_id VARCHAR(255) NOT NULL,
          application_id VARCHAR(255) NOT NULL,
          message_id VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          user_query TEXT NOT NULL,
          artifact_type VARCHAR(255) NOT NULL,
          headers JSONB NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      );

      // Create feedback table
      await appClient.executeQuery(`
        CREATE TABLE IF NOT EXISTS ${FEEDBACK_EVENTS_TABLE_NAME} (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          thread_id VARCHAR(255) NOT NULL,
          application_id VARCHAR(255) NOT NULL,
          message_id VARCHAR(255) NOT NULL,
          query_text TEXT,
          explanation TEXT,
          schema_context JSONB,
          generated_sql TEXT,
          executed_success BOOLEAN,
          user_feedback_score INT,         -- e.g. -1, 0, +1
          user_feedback_reason TEXT,
          business_context JSONB,          -- Notes on business logic, "tribal" workflows
          reward_signal FLOAT,
          timestamp TIMESTAMP DEFAULT NOW(),
          analysis_ran BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);

      // create indexes on the artifact table
      await appClient.executeQuery(`
          CREATE INDEX IF NOT EXISTS idx_artifact_tenant_id ON ${ARTIFACT_ENTRIES_TABLE_NAME} (tenant_id);
          CREATE INDEX IF NOT EXISTS idx_artifact_thread_id ON ${ARTIFACT_ENTRIES_TABLE_NAME} (thread_id);
          CREATE INDEX IF NOT EXISTS idx_artifact_application_id ON ${ARTIFACT_ENTRIES_TABLE_NAME} (application_id);
          CREATE INDEX IF NOT EXISTS idx_artifact_message_id ON ${ARTIFACT_ENTRIES_TABLE_NAME} (message_id);`);

      // create indexes on the feedback table
      await appClient.executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_feedback_tenant_id ON ${FEEDBACK_EVENTS_TABLE_NAME} (tenant_id);
        CREATE INDEX IF NOT EXISTS idx_feedback_thread_id ON ${FEEDBACK_EVENTS_TABLE_NAME} (thread_id);
        CREATE INDEX IF NOT EXISTS idx_feedback_application_id ON ${FEEDBACK_EVENTS_TABLE_NAME} (application_id);
        CREATE INDEX IF NOT EXISTS idx_feedback_message_id ON ${FEEDBACK_EVENTS_TABLE_NAME} (message_id);`);
    } catch (error) {
      console.log(
        "Storage initialization warning:",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      appClient.close();
      agentClient.close();
    }
  }

  /**
   * Delete tenant schema and clean up all related tables and indexes
   */
  static async deleteTenantSchema(params: TenantDeleteParams): Promise<void> {
    const { tenantId } = params;

    console.log("Deleting agent schema:", tenantId);
    const agentClient = new PostgresClient(
      process.env.AGENT_POSTGRES_CONNECTION_STRING || ""
    );
    await agentClient.deleteTenantSchema(tenantId);

    try {
    } catch (error) {
      console.log(
        "Storage deletion warning:",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      agentClient.close();
    }
  }
}
