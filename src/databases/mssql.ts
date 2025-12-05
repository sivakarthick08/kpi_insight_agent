import sql, { ConnectionPool, IResult } from "mssql";
import {
  DatabaseSchemaResult,
  DatabaseTablesBySchemaResult,
  DatabaseFieldsAndRelationshipsResult,
} from "../types";
import { BaseDatabaseClient } from "./base-database";

export class MssqlClient extends BaseDatabaseClient {
  private pool: ConnectionPool | null = null;

  constructor(private connectionString: string) {
    super();
    console.log(
      `🔌 Connecting to MSSQL with connection string: ${connectionString}`
    );
  }

  async connect(): Promise<void> {
    if (!this.pool) {
      this.pool = await sql.connect(this.connectionString);
      console.log("✅ Connected to MSSQL");
    }
  }

  async executeQuery(query: string, params?: any[]): Promise<any[]> {
    try {
      await this.connect();
      if (!this.pool) throw new Error("No MSSQL connection pool available");

      const request = this.pool.request();
      if (params && params.length > 0) {
        params.forEach((p, idx) => request.input(`param${idx}`, p));
      }

      const result: IResult<any> = await request.query(query);
      return result.recordset || [];
    } catch (error) {
      throw new Error(
        `Failed to execute query: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Databases in MSSQL = Catalogs
  async getDatabaseSchema(): Promise<DatabaseSchemaResult> {
    try {
      const result = await this.executeQuery("SELECT name FROM sys.databases");
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
        `SELECT TABLE_NAME 
         FROM ${schema}.INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_TYPE='BASE TABLE'`
      );

      const tables = result.map((row: any) => ({
        table_name: row.TABLE_NAME,
      }));

      console.log(tables, schema, "✅ Normalized tables");

      return { tables };
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
    try {
      if (!tables || tables.length === 0)
        return { tables: [], columns: [], relationships: [] };

      const columns: any[] = [];
      const relationships: any[] = [];

      for (const table of tables) {
        // Columns info
        const colResult = await this.executeQuery(
          `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
           FROM ${schema}.INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_NAME = '${table}'`
        );
        colResult.forEach((col: any) => {
          columns.push({
            table_schema: schema,
            table_name: table,
            column_name: col.COLUMN_NAME,
            data_type: col.DATA_TYPE,
            is_nullable: col.IS_NULLABLE === "YES",
            column_default: col.COLUMN_DEFAULT,
          });
        });

        // Relationships (foreign keys)
        const relResult = await this.executeQuery(
          `SELECT 
             fk.name AS constraint_name,
             tp.name AS table_name,
             cp.name AS column_name,
             tr.name AS referenced_table_name,
             cr.name AS referenced_column_name
           FROM sys.foreign_keys fk
           INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
           INNER JOIN sys.tables tp ON tp.object_id = fkc.parent_object_id
           INNER JOIN sys.columns cp ON cp.column_id = fkc.parent_column_id AND cp.object_id = tp.object_id
           INNER JOIN sys.tables tr ON tr.object_id = fkc.referenced_object_id
           INNER JOIN sys.columns cr ON cr.column_id = fkc.referenced_column_id AND cr.object_id = tr.object_id
           WHERE tp.name='${table}'`
        );
        relationships.push(...relResult);
      }

      return { tables, columns, relationships };
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
    limit = 3
  ): Promise<any> {
    try {
      const distinct = data_type === "json" ? "" : "DISTINCT";
      const query = `SELECT ${distinct} TOP (${limit}) [${field}] FROM [${table}]`;
      const result = await this.executeQuery(query);

      return result;
    } catch (error) {
      console.log("getSampleData error:", error);
      return [];
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

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
