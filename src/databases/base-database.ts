import {
  DatabaseClient,
  DatabaseSchemaResult,
  DatabaseTablesBySchemaResult,
  DatabaseFieldsAndRelationshipsResult,
} from "../types";

/**
 * Base abstract class for all database clients
 * Provides common interface and default implementations
 */
export abstract class BaseDatabaseClient implements DatabaseClient {
  /**
   * Execute a query against the database
   * @param query - The SQL query to execute
   * @param params - Optional parameters for the query
   * @returns Promise resolving to query results
   */
  abstract executeQuery(query: string, params?: any[]): Promise<any[]>;

  /**
   * Get database schema information
   * @returns Promise resolving to database schema result
   */
  abstract getDatabaseSchema(): Promise<DatabaseSchemaResult>;

  /**
   * Get tables for a specific schema
   * @param schema - The schema name
   * @returns Promise resolving to tables result
   */
  abstract getDatabaseTablesBySchema(schema: string): Promise<DatabaseTablesBySchemaResult>;

  /**
   * Get fields and relationships for specific tables
   * @param schema - The schema name
   * @param tables - Array of table names
   * @returns Promise resolving to fields and relationships result
   */
  abstract getDatabaseFieldsAndRelationshipsByTable(
    schema: string,
    tables: string[]
  ): Promise<DatabaseFieldsAndRelationshipsResult>;

  /**
   * Get sample data from a table
   * @param table - The table name
   * @param limit - The number of rows to return
   * @returns Promise resolving to sample data
   */
  abstract getSampleData(table: string, field: string, data_type: string, limit: number): Promise<any[]>;

  /**
   * Perform a health check on the database connection
   * @returns Promise resolving to true if connection is healthy, false otherwise
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Close the database connection
   * @returns Promise resolving when connection is closed
   */
  abstract close(): Promise<void>;

  /**
   * Validate that required parameters are provided
   * @param schema - Schema name to validate
   * @param tables - Tables array to validate
   * @throws Error if validation fails
   */
  protected validateSchemaAndTables(schema: string, tables: string[]): void {
    if (!schema || !tables || !tables.length) {
      throw new Error("Schema and tables are required");
    }
  }

  /**
   * Create a standardized error message
   * @param operation - The operation that failed
   * @param error - The original error
   * @returns Formatted error message
   */
  protected createErrorMessage(operation: string, error: unknown): string {
    return `Failed to ${operation}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
