import mysql, { Pool, PoolConnection, Connection } from "mysql2/promise";
import {
  DatabaseSchemaResult,
  DatabaseTablesBySchemaResult,
  DatabaseFieldsAndRelationshipsResult,
} from "../types";
import { BaseDatabaseClient } from "./base-database";

export class MySqlClient extends BaseDatabaseClient {
  private client: Connection | null = null;
  private pool: Pool | null = null;
  private isPoolMode: boolean = false;

  constructor(connectionString: string, usePool: boolean = true) {
    super();
    console.log(
      `🔌 Connecting to MySQL with connection string: ${connectionString}`
    );

    if (usePool) {
      this.pool = mysql.createPool(connectionString);
      this.isPoolMode = true;
      console.log("✅ Connected to MySQL with connection pool");
    } else {
      // Single connection
      mysql.createConnection(connectionString).then((conn) => {
        this.client = conn;
        console.log("✅ Connected to MySQL with single client");
      });
    }
  }

  async executeQuery(query: string, params?: any[]): Promise<any[]> {
    try {
      let result: any;

      if (this.isPoolMode && this.pool) {
        const [rows] = await this.pool.query(query, params);
        result = rows;
      } else if (this.client) {
        const [rows] = await this.client.query(query, params);
        result = rows;
      } else {
        throw new Error("No database client available");
      }

      // Always return an array to satisfy BaseDatabaseClient
      if (Array.isArray(result)) {
        return result;
      } else {
        return [result]; // wrap OkPacket or other non-array results
      }
    } catch (error) {
      throw new Error(
        `Failed to execute query: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // MySQL: Schemas = Databases
  async getDatabaseSchema(): Promise<DatabaseSchemaResult> {
    try {
      const result = await this.executeQuery("SHOW DATABASES");
      return { schema: result };
    } catch (error) {
      throw new Error(this.createErrorMessage("get database schema", error));
    }
  }

  async getDatabaseTablesBySchema(
    schema: string
  ): Promise<DatabaseTablesBySchemaResult> {
    try {
      const result = await this.executeQuery(
        `SHOW FULL TABLES FROM \`${schema}\``
      );

      // result looks like: [{ Tables_in_db: 'masters_task', Table_type: 'BASE TABLE' }]
      const tables = result.map((row: any) => {
        // Pick the first key that starts with "Tables_in_"
        const tableKey = Object.keys(row).find((key) =>
          key.startsWith("Tables_in_")
        );
        return {
          table_name: row[tableKey!], // non-null assertion since key will exist
        };
      });

      console.log(tables, schema, "✅ Normalized tables");

      return { tables: tables };
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
    console.log("Fetching fields and relationships for tables", schema, tables);

    try {
      const columns: any[] = [];
      const relationships: any[] = [];

      for (const table of tables) {
        // Column info
        const colResult = await this.executeQuery(
          `SHOW COLUMNS FROM \`${schema}\`.\`${table}\``
        );
        colResult.forEach((col: any) => {
          columns.push({
            table_schema: schema,
            table_name: table,
            column_name: col.Field,
            data_type: col.Type,
            is_nullable: col.Null === "YES",
            column_default: col.Default,
            is_primary_key: col.Key === "PRI",
          });
        });
        const relQuery = `
          SELECT 
            k.CONSTRAINT_NAME,
            k.TABLE_SCHEMA,
            k.TABLE_NAME,
            k.COLUMN_NAME,
            k.REFERENCED_TABLE_SCHEMA,
            k.REFERENCED_TABLE_NAME,
            k.REFERENCED_COLUMN_NAME
          FROM information_schema.KEY_COLUMN_USAGE k
          WHERE k.TABLE_SCHEMA = ?
            AND k.TABLE_NAME = ?
            AND k.REFERENCED_TABLE_NAME IS NOT NULL
        `;
        const relResult = await this.executeQuery(relQuery, [schema, table]);
        relationships.push(...relResult);
      }

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
    // const sampleDataQuery = `SELECT DISTINCT \`${field}\` FROM \`${table}\` LIMIT ${limit}`;
    const sampleDataQuery = `SELECT ${data_type === "json" ? "" : "DISTINCT"} "${field}" FROM ${table} LIMIT ${limit}`;

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

  async getClient(): Promise<PoolConnection | Connection> {
    if (this.isPoolMode && this.pool) {
      return await this.pool.getConnection();
    } else if (this.client) {
      return this.client;
    } else {
      throw new Error("No database client available");
    }
  }

  releaseClient(client: PoolConnection) {
    if (this.isPoolMode) {
      client.release();
    }
  }
}
