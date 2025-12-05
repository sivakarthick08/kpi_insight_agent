import {
  PostgresClient,
  BigQueryClient,
  DatabaseType,
  MySqlClient,
  MssqlClient,
} from "../../databases";
import { BigQueryCredentials } from "../../databases/bigquery";
import {
  DatabricksClient,
  DatabricksCredentials,
} from "../../databases/databricks";
import { getDBClient } from "../../mastra/lib/getDBClient";
import { getDefaultPgVector } from "../../mastra/lib/pgVector";
import { initializeStorage } from "../../mastra/core/semantic-layer-storage-tool";
import { generateTableDescription } from "../util/generateTableDescription";
import {
  prepareEmbeddingPayloads,
  generateEmbeddingsWithRetry,
  storeEmbeddingsWithRetry,
  checkExistingEmbeddings,
} from "../util/helpers";

export interface DatabaseConnectionParams {
  databaseType: DatabaseType;
  connectionString: any;
  catalogName?: string;
}

export interface SchemaParams extends DatabaseConnectionParams {
  schema: string;
  databaseName?: string;
  catalogName?: string;
}

export interface TablesDetailsParams extends SchemaParams {
  tables: string[];
}

export interface GenerateSemanticLayerParams {
  tenantId: string;
  applicationId: string;
  databaseType: DatabaseType;
  connectionString: string;
  table: string;
  columns: any[];
  relationships: any[];
  metrics: any[];
  context: string;
  categories: string[];
  schema: string;
  catalogName?: string;
  databaseName?: string;
}

export interface SemanticLayerResult {
  table_description: string;
  fields_description: Array<{ [key: string]: string }>;
  sample_questions: string[];
}

export interface GenerationSummary {
  total_entries_processed: number;
  total_tokens_usage?: number;
}

export class SchemaService {
  /**
   * Get database schema
   */
  static async getDatabaseSchema(
    params: DatabaseConnectionParams
  ): Promise<any> {
    const { databaseType, connectionString, catalogName } = params;

    let client = getDBClient(databaseType as DatabaseType, connectionString);

    let schema;

    if (databaseType === DatabaseType.DATABRICKS) {
      schema = await client?.getDatabaseSchema(catalogName);
    } else {
      schema = await client?.getDatabaseSchema();
    }

    client?.close();

    return schema;
  }

  /**
   * Get tables by schema
   */
  static async getTablesBySchema(params: SchemaParams): Promise<any> {
    const { databaseType, connectionString, schema, catalogName } = params;

    let client = getDBClient(databaseType as DatabaseType, connectionString);

    let props: any = { databaseName: schema, catalogName };
    let tables;
    if (databaseType === DatabaseType.DATABRICKS) {
      console.log(props, "props");

      tables = await client?.getDatabaseTablesBySchema(JSON.stringify(props));
    } else {
      tables = await client?.getDatabaseTablesBySchema(schema);
    }

    client?.close();

    return tables;
  }

  /**
   * Get table details with fields and relationships
   */
  static async getTablesDetails(params: TablesDetailsParams): Promise<any> {
    const { databaseType, connectionString, schema, tables, catalogName } =
      params;

    try {
      let client = getDBClient(databaseType as DatabaseType, connectionString);

      let result;
      if (databaseType === DatabaseType.DATABRICKS) {
        result = await client?.getDatabaseFieldsAndRelationshipsByTable(
          catalogName ?? "",
          tables ?? "",
          schema ?? ""
        );
      } else {
        result = await client?.getDatabaseFieldsAndRelationshipsByTable(
          schema,
          tables
        );
      }
      console.log("Fetching sample data for tables :", result);
      if (result) {
        // Collect all fields that need sample data (not JSON)
        const sampleDataRequests: {
          table: string;
          column_name: string;
          data_type: string;
          fieldRef: any;
        }[] = [];

        for (const table of result.tables) {
          for (const field of result.columns) {
            if (field.table_name === table) {
              sampleDataRequests.push({
                table,
                column_name: field.column_name,
                data_type: field.data_type,
                fieldRef: field,
              });
            }
          }
        }

        // Batch process sample data requests in batches of 10
        const BATCH_SIZE = 10;
        for (let i = 0; i < sampleDataRequests.length; i += BATCH_SIZE) {
          const batch = sampleDataRequests.slice(i, i + BATCH_SIZE);
          const sampleDataResults = await Promise.all(
            batch.map((req) =>
              client?.getSampleData(
                req.table,
                req.column_name,
                req.data_type,
                3,
                schema,
                catalogName
              )
            )
          );
          batch.forEach((req, idx) => {
            const sampleData = sampleDataResults[idx];
            req.fieldRef.sample_data = sampleData?.map(
              (obj: any) => Object.values(obj)[0]
            );
          });
        }
      }

      client?.close();

      return result;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? JSON.stringify(error)
            : "Failed to get tables details",
      };
    }
  }

  /**
   * Generate semantic layer
   */
  static async generateSemanticLayer(
    params: GenerateSemanticLayerParams
  ): Promise<{
    data: SemanticLayerResult;
    summary: GenerationSummary;
  }> {
    const {
      tenantId,
      applicationId,
      databaseType,
      connectionString,
      table,
      columns,
      relationships,
      metrics,
      context,
      categories,
      schema,
      catalogName,
      // databaseName,
    } = params;

    // Initialize store and client
    const store = getDefaultPgVector();
    if (!store) {
      throw new Error("PgVector store not initialized");
    }

    let client = getDBClient(databaseType as DatabaseType, connectionString);
    if (!client) {
      throw new Error("Failed to create database client");
    }

    try {
      initializeStorage();
    } catch (error) {
      console.error("Failed to initialize storage:", error);
      throw new Error("Failed to initialize storage");
    }

    // Prepare schema payload
    const fieldsResult =
      columns
        ?.filter((col: any) => col.table_name === table)
        .map((col: any) => ({
          name: col.column_name,
          type: col.data_type,
        })) || [];

    const relationshipsResult =
      relationships?.filter(
        (rel: any) => rel.from_table === table || rel.to_table === table
      ) || [];

    const metricsResult = metrics || [];

    const schemaPayloads = {
      schema_name: schema,
      table_name: table,
      fields: fieldsResult,
      relationships: relationshipsResult,
      metrics: metricsResult,
    };

    console.log(
      `🔧 Schema payloads prepared: Table ${table} - ${fieldsResult.length} fields, ${relationshipsResult.length} relationships, ${metricsResult.length} metrics`
    );

    // Check if this table already has embeddings and log the retry strategy
    console.log(`🔄 Using delete-then-upsert strategy for table: ${table}`);
    console.log(
      `📋 This will delete existing embeddings for table '${table}' and create new ones to ensure fresh data`
    );

    // Check for existing embeddings
    const existingCheck = await checkExistingEmbeddings(
      store,
      table,
      tenantId,
      applicationId
    );
    if (existingCheck.exists) {
      console.log(
        `📊 Found ${existingCheck.count} existing embeddings for table '${table}' - will be replaced`
      );
    } else {
      console.log(
        `📊 No existing embeddings found for table '${table}' - creating new ones`
      );
    }

    // Generate table descriptions
    const { object, usage } = await generateTableDescription(
      schemaPayloads,
      context,
      categories,
      existingCheck.entries?.[0]?.metadata
    );
    if (!object?.table_name) {
      throw new Error(
        "No semantic layer descriptions were generated. Please check your input and try again."
      );
    }

    // Prepare embedding payloads
    const { jsonPayloads, yamlPayload } = await prepareEmbeddingPayloads(
      schema,
      object,
      tenantId,
      applicationId,
      client,
      categories,
      databaseType,
      connectionString,
      catalogName
      // databaseName
    );
    console.log(`📦 Embedding payloads created: ${jsonPayloads.length} total`);

    // Generate embeddings with retry logic
    const embeddingEntries = await generateEmbeddingsWithRetry(
      yamlPayload,
      jsonPayloads,
      databaseType,
      connectionString
    );
    if (!embeddingEntries) {
      throw new Error(
        "Failed to generate embeddings for semantic layer. Please check your access and try again."
      );
    }

    // Store embeddings with delete-then-upsert logic for existing entries
    const storageResult = await storeEmbeddingsWithRetry(
      store,
      embeddingEntries,
      table,
      tenantId,
      applicationId
    );

    if (!storageResult.success) {
      throw new Error(storageResult.error);
    }

    // Prepare response
    const responsePayload: SemanticLayerResult = {
      table_description:
        jsonPayloads.find((p) => p.type === "table")?.payload
          .table_description || "",
      fields_description: jsonPayloads
        .filter((p) => p.type === "field")
        .map((p) => ({
          [p.payload.field_name]: p.payload.field_description,
        })),
      sample_questions: [],
    };

    // Log final summary
    console.log(`🎉 Semantic layer generation completed for table '${table}':`);
    console.log(`📊 Processed: ${jsonPayloads.length} entries`);

    return {
      data: responsePayload,
      summary: {
        total_entries_processed: jsonPayloads.length,
        total_tokens_usage: usage?.totalTokens,
      },
    };
  }

  static async getCatalog(params: DatabaseConnectionParams): Promise<any> {
    const { connectionString } = params;
    let connectionsData: DatabricksCredentials;

    // Parse connection string safely
    if (typeof connectionString === "string") {
      try {
        connectionsData = JSON.parse(connectionString);
      } catch {
        throw new Error("Invalid connectionString: must be valid JSON");
      }
    } else {
      connectionsData = connectionString;
    }

    const databricksClient = new DatabricksClient(connectionsData);

    try {
      const catalogs = await databricksClient.getCatalogs();
      return { catalogs };
    } catch (err: any) {
      throw new Error("Unable to fetch catalogs from Databricks");
    }
  }
}
