// DatabricksClient.ts
// import {
//   DatabaseSchemaResult,
//   DatabaseTablesBySchemaResult,
//   DatabaseFieldsAndRelationshipsResult,
// } from "../types";

import { DBSQLClient } from "@databricks/sql";
import {
  DatabaseFieldsAndRelationshipsResult,
  DatabaseSchemaResult,
} from "../types";

export interface DatabricksCredentials {
  token: string;
  host: string;
  path: string;
}
export interface TableResponse {
  tables: { table_name: string }[];
}

export interface TableListProps {
  catalogName?: string;
  databaseName?: string;
}

export class DatabricksClient {
  private client: DBSQLClient;
  private credentials: DatabricksCredentials;
  private isConnected: boolean = false;

  constructor(connectionString: DatabricksCredentials) {
    console.log(connectionString, "connectionString");

    this.client = new DBSQLClient();
    this.credentials = connectionString;
  }

  private async ensureConnected() {
    console.log(this.credentials, "this.credentials");

    if (!this.isConnected) {
      try {
        await this.client.connect({
          token: this.credentials.token,
          host: this.credentials.host,
          path: this.credentials.path,
        });
        this.isConnected = true;
        console.log("✅ Connected to Databricks");
      } catch (error: any) {
        throw new Error(
          "Database connection failed. Please check your credentials or network."
        );
      }
    }
  }

  async getCatalogs(): Promise<{ catalogsName: string }[]> {
    // await this.ensureConnected();
    let session: any;
    let op: any;

    try {
      // session = await this.client.openSession();
      // op = await session.executeStatement("SHOW CATALOGS");
      let results = await this.executeQuery("SHOW CATALOGS");
      // console.log(data, "dataaaaaaa");
      // const results = await op.fetchAll();

      return results.map((row: any) => ({
        catalogsName: row.catalog,
      }));
    } catch (error: any) {
      throw new Error(`Error in getCatalogs: ${error.message || error}`);
    } finally {
      if (op) {
        try {
          await op.close();
        } catch (err) {
          console.warn("⚠️ Failed to close operation:", err);
        }
      }
      if (session) {
        try {
          await session.close();
        } catch (err) {
          console.warn("⚠️ Failed to close session:", err);
        }
      }
    }
  }

  async getDatabaseTablesBySchema(props: string): Promise<TableResponse> {
    const schema = JSON.parse(props);

    const TableList = await this.getTablesList({
      catalogName: schema.catalogName,
      databaseName: schema.databaseName,
    });
    return {
      tables: TableList.map((row: any) => ({
        table_name: row,
      })),
    };
  }

  async getTablesList(props: TableListProps): Promise<string[]> {
    const { catalogName, databaseName } = props;
    await this.ensureConnected();
    const session = await this.client.openSession();
    const op = await session.executeStatement(
      `SHOW TABLES IN ${catalogName}.${databaseName}`
    );
    const results = await op.fetchAll();
    await op.close();
    await session.close();
    console.log(results, "results");

    return results.map((row: any) => row.tableName);
  }

  async getDatabaseSchema(catalogName?: string): Promise<DatabaseSchemaResult> {
    await this.ensureConnected();
    const session = await this.client.openSession();
    const op = await session.executeStatement(
      `
  SELECT 
    catalog_name,
    schema_name,
    schema_owner
  FROM ${catalogName}.information_schema.schemata
`
    );
    const results = await op.fetchAll();
    await op.close();
    await session.close();
    console.log(results, "databricksssssssss");

    let data: any = results.map((row: any) => ({
      catalog_name: row?.catalog_name,
      schema_name: row.schema_name,
      schema_owner: row?.schema_owner,
      default_character_set_catalog: null,
      default_character_set_schema: null,
      default_character_set_name: null,
      sql_path: null,
    }));
    return {
      schema: data,
    };
  }

  async getDatabaseFieldsAndRelationshipsByTable(
    catalogName: string,
    tables: string[],
    databaseName?: string
  ): Promise<DatabaseFieldsAndRelationshipsResult> {
    console.log(catalogName, tables, databaseName, "catalogNamedatabaseName");

    let data = await this.getSchemaTables(catalogName, tables, databaseName);

    return {
      tables: tables,
      columns: data?.table || [],
      relationships: data?.relationships || [],
    };
  }

  async getSchemaTables(
    catalogName: string,
    tables: string[],
    databaseName?: string
  ): Promise<any> {
    await this.ensureConnected();
    const session = await this.client.openSession();

    const schemaName = databaseName;
    const tableList = tables.map((t) => `'${t}'`).join(", "); // for IN clause

    // 1️⃣ Fetch columns with primary key info
    const columnsOp = await session.executeStatement(`
    SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END AS is_primary_key
    FROM ${catalogName}.information_schema.columns AS c
    LEFT JOIN ${catalogName}.information_schema.key_column_usage AS kcu
        ON c.table_schema = kcu.table_schema
        AND c.table_name = kcu.table_name
        AND c.column_name = kcu.column_name
    LEFT JOIN ${catalogName}.information_schema.table_constraints AS tc
        ON kcu.table_schema = tc.table_schema
        AND kcu.table_name = tc.table_name
        AND kcu.constraint_name = tc.constraint_name
        AND tc.constraint_type = 'PRIMARY KEY'
    WHERE c.table_schema = '${schemaName}'
      AND c.table_name IN (${tableList})
    ORDER BY c.table_schema, c.table_name, c.ordinal_position;
  `);

    const allTablesColumns = await columnsOp.fetchAll();
    await columnsOp.close();

    // 2️⃣ Fetch foreign key relationships (just for logging)
    const fkOp = await session.executeStatement(`
    SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
    FROM ${catalogName}.information_schema.table_constraints AS tc
    JOIN ${catalogName}.information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN ${catalogName}.information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = '${schemaName}'
      AND tc.table_name IN (${tableList});
  `);

    const allRelationships = await fkOp.fetchAll();
    console.log(allRelationships, "foreign key relationships");
    await fkOp.close();

    await session.close();

    return {
      table: allTablesColumns,
      relationships: allRelationships,
    };
  }

  async getSampleData(
    table: string,
    field: string,
    data_type: string,
    limit: number = 1,
    databaseName?: string,
    catalogName?: string
  ): Promise<any> {
    await this.ensureConnected();
    const session = await this.client.openSession();

    // Build query: DISTINCT unless data_type is json
    const sampleDataQuery = `SELECT  ${field} FROM ${catalogName}.${databaseName}.${table} LIMIT ${limit}`;
    console.log(sampleDataQuery, "sampleDataQuery");

    try {
      const op = await session.executeStatement(sampleDataQuery);
      const rows: any = await op.fetchAll();
      await op.close();
      await session.close();

      return rows;
    } catch (error) {
      console.error("error :", error);
      return `get sample data for table ${table} and field ${field} with query ${sampleDataQuery}`;
    }
  }

  async executeQuery(query: string, params?: any[]): Promise<any> {
    await this.ensureConnected();
    const session = await this.client.openSession();

    try {
      // For now, Databricks SQL does not support parametrized queries like Postgres
      // So we’ll just interpolate params manually if needed (⚠️ watch for SQL injection!)
      let finalQuery = query;
      if (params && params.length > 0) {
        params.forEach((p, i) => {
          const value =
            typeof p === "string" ? `'${p.replace(/'/g, "''")}'` : p;
          finalQuery = finalQuery.replace(`$${i + 1}`, value);
        });
      }

      console.log("Executing query:", finalQuery);

      const op = await session.executeStatement(finalQuery);
      const rows: any = await op.fetchAll();

      await op.close();
      await session.close();

      return rows;
    } catch (error) {
      console.error("executeQuery error:", error);
      throw new Error(
        `Failed to execute query: ${error instanceof Error ? error.message : String(error)}`
      );
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
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      console.log("Disconnected from Databricks");
    }
  }
}
