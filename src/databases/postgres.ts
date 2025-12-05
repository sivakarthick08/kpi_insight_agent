import { Client, Pool, PoolClient } from "pg";
import {
  DatabaseSchemaResult,
  DatabaseTablesBySchemaResult,
  DatabaseFieldsAndRelationshipsResult,
} from "../types";
import { BaseDatabaseClient } from "./base-database";

export class PostgresClient extends BaseDatabaseClient {
  private client: Client | null = null;
  private pool: Pool | null = null;
  private isPoolMode: boolean = false;

  constructor(connectionString: string, usePool: boolean = true) {
    super();
    console.log(
      `🔌 Connecting to PostgreSQL with connection string: ${connectionString}`
    );

    if (usePool) {
      this.pool = new Pool({
        connectionString,
        connectionTimeoutMillis: 100000, // Reduced from 30s
        statement_timeout: 100000, // Reduced from 60s
        query_timeout: 100000, // Reduced from 60s
        max: 10, // Maximum number of clients in the pool
        min: 2, // Minimum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30s
        maxUses: 7500, // Close and replace a connection after it has been used 7500 times
      });
      this.isPoolMode = true;
      console.log("✅ Connected to PostgreSQL with connection pool");
    } else {
      this.client = new Client({
        connectionString,
        connectionTimeoutMillis: 10000, // Reduced from 30s
        statement_timeout: 30000, // Reduced from 60s
        query_timeout: 30000, // Reduced from 60s
      });
      console.log("✅ Connected to PostgreSQL with single client");
    }
  }

  async createTenantSchema(tenantId: string) {
    try {
      const createSchemaQuery = `CREATE SCHEMA IF NOT EXISTS tenant_${tenantId}`;
      await this.executeQuery(createSchemaQuery);
    } catch (error) {
      throw new Error(this.createErrorMessage("create tenant schema", error));
    }
  }

  async deleteTenantSchema(tenantId: string) {
    try {
      const deleteSchemaQuery = `DROP SCHEMA IF EXISTS tenant_${tenantId}`;
      await this.executeQuery(deleteSchemaQuery);
    } catch (error) {
      throw new Error(this.createErrorMessage("delete tenant schema", error));
    }
  }

  async executeQuery(query: string, params?: any[]) {
    try {
      let result;

      if (this.isPoolMode && this.pool) {
        const client = await this.pool.connect();
        try {
          result = await client.query(query, params);
        } finally {
          client.release(); // Return client to pool instead of closing
        }
      } else if (this.client) {
        result = await this.client.query(query, params);
      } else {
        throw new Error("No database client available");
      }

      return result.rows;
    } catch (error) {
      throw new Error(
        `Failed to execute query: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getDatabaseSchema(): Promise<DatabaseSchemaResult> {
    try {
      const retriveDatabaseSchema = "SELECT * FROM information_schema.schemata";

      const result = await this.executeQuery(retriveDatabaseSchema);

      return {
        schema: result,
      };
    } catch (error) {
      throw new Error(this.createErrorMessage("get database schema", error));
    }
  }

  async getDatabaseTablesBySchema(
    schema: string
  ): Promise<DatabaseTablesBySchemaResult> {
    try {
      const retriveDatabaseTables = `
      SELECT
          tablename as table_name
        FROM pg_tables
        WHERE schemaname = '${schema}'
        UNION ALL
        SELECT
          viewname as table_name
        FROM pg_views
        WHERE schemaname = '${schema}'
        ORDER BY table_name;`;

      const result = await this.executeQuery(retriveDatabaseTables);

      return {
        tables: result,
      };
    } catch (error) {
      throw new Error(
        this.createErrorMessage("get database tables by schema", error)
      );
    }
  }

  async getDatabaseFieldsAndRelationshipsByTable(
    schema: string,
    tables: string[]
  ): Promise<DatabaseFieldsAndRelationshipsResult> {
    this.validateSchemaAndTables(schema, tables);
    console.log("Fetching fields and relationships for tables");

    try {
      const columnsQuery = `
      SELECT
        t.table_schema,
        t.table_name,
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
        AND t.table_schema = c.table_schema
      LEFT JOIN (
        SELECT
          ku.table_schema,
          ku.table_name,
          ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.table_schema = pk.table_schema
        AND c.table_name = pk.table_name
        AND c.column_name = pk.column_name
      WHERE t.table_schema = $1
        AND t.table_name = ANY($2)
      ORDER BY t.table_schema, t.table_name, c.ordinal_position;
    `;

      const columns = await this.executeQuery(columnsQuery, [schema, tables]);

      // Get foreign key relationships
      const relationshipsQuery = `
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = ANY($2)
      ORDER BY tc.table_schema, tc.table_name, kcu.column_name;
    `;

      const relationships = await this.executeQuery(relationshipsQuery, [
        schema,
        tables,
      ]);

      return {
        tables,
        columns,
        relationships,
      };
    } catch (error) {
      throw new Error(
        this.createErrorMessage(
          "get database fields and relationships by table",
          error
        )
      );
    }
  }

  async getSampleData(
    table: string,
    field: string,
    data_type: string,
    limit: number = 3
  ): Promise<any> {
    // Use CTE to limit rows first for DISTINCT queries
    const sampleDataQuery =
      data_type === "json"
        ? `SELECT "${field}" FROM ${table} LIMIT ${limit}`
        : `
      WITH limited_rows AS (
        SELECT "${field}" FROM ${table} LIMIT 100000
      )
      SELECT DISTINCT "${field}" FROM limited_rows LIMIT ${limit};
    `;

    try {
      const result = await this.executeQuery(sampleDataQuery);
      return result;
    } catch (error) {
      console.log("error :", error);
      return `get sample data for table ${table} and field ${field} with query ${sampleDataQuery}`;
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
    if (this.isPoolMode && this.pool) {
      await this.pool.end();
    } else if (this.client) {
      await this.client.end();
    }
  }

  // Method to get a client from pool for transaction management
  async getClient(): Promise<PoolClient | Client> {
    if (this.isPoolMode && this.pool) {
      return await this.pool.connect();
    } else if (this.client) {
      return this.client;
    } else {
      throw new Error("No database client available");
    }
  }

  // Method to release a client back to pool
  releaseClient(client: PoolClient) {
    if (this.isPoolMode) {
      client.release();
    }
  }
}
