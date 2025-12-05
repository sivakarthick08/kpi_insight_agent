import mariadb, { Pool, PoolConnection, Connection } from "mariadb";
import {
    DatabaseSchemaResult,
    DatabaseTablesBySchemaResult,
    DatabaseFieldsAndRelationshipsResult,
} from "../types";
import { BaseDatabaseClient } from "./base-database";

export class MariaDbClient extends BaseDatabaseClient {
    private client: Connection | null = null;
    private pool: Pool | null = null;
    private isPoolMode: boolean = false;

    constructor(connectionString: string, usePool: boolean = true) {
        super();
        console.log(`🔌 Connecting to MariaDB with connection string: ${connectionString}`);

        if (usePool) {
            this.pool = mariadb.createPool(connectionString);
            this.isPoolMode = true;
            console.log("✅ Connected to MariaDB with connection pool");
        } else {
            mariadb.createConnection(connectionString).then(conn => {
                this.client = conn;
                console.log("✅ Connected to MariaDB with single client");
            });
        }
    }

    async executeQuery(query: string, params?: any[]): Promise<any[]> {
        try {
            let result: any;

            if (this.isPoolMode && this.pool) {
                const conn = await this.pool.getConnection();
                result = await conn.query(query, params);
                conn.release();
            } else if (this.client) {
                result = await this.client.query(query, params);
            } else {
                throw new Error("No database client available");
            }

            // mariadb driver always returns an array of rows (objects)
            return Array.isArray(result) ? result : [result];
        } catch (error) {
            throw new Error(
                `Failed to execute query: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async getDatabaseSchema(): Promise<DatabaseSchemaResult> {
        try {
            const result = await this.executeQuery("SHOW DATABASES");
            return { schema: result };
        } catch (error) {
            throw new Error(this.createErrorMessage("get database schema", error));
        }
    }

    async getDatabaseTablesBySchema(schema: string): Promise<DatabaseTablesBySchemaResult> {
        try {
            const result = await this.executeQuery(`SHOW FULL TABLES FROM \`${schema}\``);

            const tables = result.map((row: any) => {
                const tableKey = Object.keys(row).find((key) => key.startsWith("Tables_in_"));
                return {
                    table_name: row[tableKey!],
                };
            });

            console.log(tables, schema, "✅ Normalized tables");
            return { tables };
        } catch (error) {
            throw new Error(this.createErrorMessage("get database tables by schema", error));
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
                this.createErrorMessage("get database fields and relationships by table", error)
            );
        }
    }

    async getSampleData(
        table: string,
        field: string,
        data_type: string,
        limit: number = 3
    ): Promise<any> {
        const sampleDataQuery = `SELECT ${
            data_type === "json" ? "" : "DISTINCT"
        } \`${field}\` FROM \`${table}\` LIMIT ${limit}`;

        console.log(sampleDataQuery, "✅ Sample data query");

        try {
            return await this.executeQuery(sampleDataQuery);
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
