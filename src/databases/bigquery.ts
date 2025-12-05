import { BigQuery, BigQueryOptions, Job, Query } from "@google-cloud/bigquery";
import { JWT } from "google-auth-library"; // Import GoogleAuth from the library
import {
  DatabaseSchemaResult,
  DatabaseTablesBySchemaResult,
  DatabaseFieldsAndRelationshipsResult,
} from "../types";
import { BaseDatabaseClient } from "./base-database";

export interface BigQueryCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

export class BigQueryClient extends BaseDatabaseClient {
  private client: BigQuery | null = null;
  private projectId: string = "";

  constructor(credentials?: BigQueryCredentials, options?: BigQueryOptions) {
    super();
    console.log("🔌 Connecting to BigQuery...");

    // Create a JWT client
    const client = new JWT({
      email: credentials?.client_email,
      key: credentials?.private_key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    // Optional: authorize the client manually (not always required)
    // await client.authorize();

    // Now create BigQuery client using auth
    this.client = new BigQuery({
      authClient: client,
      projectId: credentials?.project_id,
    });

    this.projectId = credentials?.project_id || "";

    console.log(`✅ Connected to BigQuery project: ${this.projectId}`);
  }

  async executeQuery(query: string, params?: any[]) {
    try {
      if (!this.client) {
        throw new Error("BigQuery client not initialized");
      }

      const queryOptions: Query = {
        query,
        params,
        useLegacySql: false, // Use standard SQL
        maximumBytesBilled: "1000000000", // 1GB limit
      };

      const [job] = await this.client.createQueryJob(queryOptions);
      const [rows] = await job.getQueryResults();

      console.log(
        `✅ Query executed successfully, returned ${rows.length} rows`
      );

      return rows;
    } catch (error) {
      throw new Error(
        `Failed to execute BigQuery: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getDatabaseSchema(): Promise<DatabaseSchemaResult> {
    try {
      console.log("Fetching BigQuery schema...");
      const datasets: any = await this.client?.getDatasets();
      const schemaNames = datasets[2].datasets?.map(
        (dataset: any) => dataset.id
      ) as string[];

      // Convert string array to DatabaseSchema array format
      const schema = schemaNames.map((schemaName) => ({
        schema_name: `${schemaName?.replace(":", ".")}`,
        catalog_name: this.projectId,
      }));

      return { schema };
    } catch (error) {
      throw new Error(this.createErrorMessage("get BigQuery schema", error));
    }
  }

  async getDatabaseTablesBySchema(
    schema: string
  ): Promise<DatabaseTablesBySchemaResult> {
    try {
      const query = `
        SELECT
          table_name
        FROM
          \`${schema}.INFORMATION_SCHEMA.TABLES\`
        WHERE
          table_type IN ('BASE TABLE', 'VIEW');
      `;

      const result = await this.executeQuery(query);

      return {
        tables: result,
      };
    } catch (error) {
      throw new Error(
        this.createErrorMessage("get BigQuery tables by schema", error)
      );
    }
  }

  async getDatabaseFieldsAndRelationshipsByTable(
    schema: string,
    tables: string[]
  ): Promise<DatabaseFieldsAndRelationshipsResult> {
    this.validateSchemaAndTables(schema, tables);

    try {
      // Get columns information
      const tableList = tables.map(t => `'${t}'`).join(", ");

      const columnsQuery = `
  SELECT
    table_catalog,
    table_schema,
    table_name,
    column_name,
    ordinal_position,
    data_type,
    is_nullable,
    column_default,
    FALSE AS is_primary_key  -- BigQuery doesn't store PK info
  FROM
    \`${schema}.INFORMATION_SCHEMA.COLUMNS\`
  WHERE
    table_name IN (${tableList})
  ORDER BY
    table_schema,
    table_name,
    ordinal_position;
`;
      // console.log(columnsQuery, "columnsQuery");


      // const relationtableList = tables.map(t => `'${t}'`).join(", ");

      // const relationshipsQuery = `
      //   SELECT
      //     tc.table_schema,
      //     tc.table_name,
      //     kcu.column_name,
      //     ccu.table_schema AS foreign_table_schema,
      //     ccu.table_name AS foreign_table_name,
      //     ccu.column_name AS foreign_column_name,
      //     tc.constraint_name
      //   FROM
      //     \`${schema}.INFORMATION_SCHEMA.TABLE_CONSTRAINTS\` AS tc
      //   JOIN
      //     \`${schema}.INFORMATION_SCHEMA.KEY_COLUMN_USAGE\` AS kcu
      //     ON tc.constraint_name = kcu.constraint_name
      //     AND tc.table_name = kcu.table_name
      //   JOIN
      //     \`${schema}.INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS\` AS rc
      //     ON tc.constraint_name = rc.constraint_name
      //   JOIN
      //     \`${schema}.INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE\` AS ccu
      //     ON rc.unique_constraint_name = ccu.constraint_name
      //   WHERE
      //     tc.constraint_type = 'FOREIGN KEY'
      //     AND tc.table_name IN (${relationtableList})
      //   ORDER BY
      //     tc.table_schema, tc.table_name, kcu.column_name;
      // `;
      // console.log(relationshipsQuery, "relationshipsQuery");

      const columns = await this.executeQuery(columnsQuery, tables);
      // const relationships = await this.executeQuery(relationshipsQuery, tables);
      // console.log(relationships, "columns");

      return {
        tables,
        columns,
      };
    } catch (error) {
      throw new Error(
        this.createErrorMessage(
          "get BigQuery fields and relationships by table",
          error
        )
      );
    }
  }

  async getSampleData(table: string, field: string, data_type: string, limit: number = 3, schema?: string): Promise<any[]> {
    try {
      const sampleDataQuery = `SELECT DISTINCT \`${field}\` FROM \`${schema}.${table}\` LIMIT ${limit};`;
      return await this.executeQuery(sampleDataQuery);
    } catch (error) {
      throw new Error(this.createErrorMessage("get sample data", error));
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.executeQuery("SELECT 1");
      return result.length > 0;
    } catch (error) {
      return false;
    }
  }

  async close() {
    // BigQuery client doesn't need explicit closing
    // The client will be garbage collected when no longer referenced
    console.log("✅ BigQuery client connection closed");
  }

  // Method to get client instance for advanced operations
  getClient(): BigQuery {
    if (!this.client) {
      throw new Error("BigQuery client not initialized");
    }
    return this.client;
  }

  // Method to get project and dataset info
  getConnectionInfo() {
    return {
      projectId: this.projectId,
    };
  }
}
