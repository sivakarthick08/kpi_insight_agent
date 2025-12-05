import {
  DatabaseType,
  DatabricksClient,
  MssqlClient,
  MySqlClient,
  PostgresClient,
  BigQueryClient,
} from "../../databases";
import { BigQueryCredentials } from "../../databases/bigquery";

export const getDBClient = (
  databaseType: DatabaseType,
  connectionString: any
) => {
  // Validate input parameters
  if (!databaseType) {
    throw new Error("Database type is required");
  }

  if (!connectionString) {
    throw new Error("Connection string is required");
  }

  let client:
    | PostgresClient
    | BigQueryClient
    | DatabricksClient
    | MySqlClient
    | MssqlClient
    | undefined;

  try {
    switch (databaseType) {
      case DatabaseType.POSTGRESQL:
        client = new PostgresClient(connectionString);
        break;
      case DatabaseType.BIGQUERY:
        client = new BigQueryClient(
          connectionString as unknown as BigQueryCredentials
        );
        break;
      case DatabaseType.MSSQL:
        client = new MssqlClient(connectionString);
        break;
      case DatabaseType.MYSQL:
        client = new MySqlClient(connectionString);
        break;
      case DatabaseType.MARIADB:
        // Import MariaDbClient dynamically to avoid circular dependencies
        const { MariaDbClient } = require("../../databases/mariyadb");
        client = new MariaDbClient(connectionString);
        break;
      case DatabaseType.DATABRICKS:
        try {
          const ConnectionsData = JSON.parse(connectionString);
          client = new DatabricksClient(ConnectionsData);
        } catch (parseError) {
          throw new Error(`Invalid JSON in Databricks connection string: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
        break;
      case DatabaseType.SNOWFLAKE:
      case DatabaseType.REDSHIFT:
      case DatabaseType.MONGODB:
      case DatabaseType.DYNAMODB:
        throw new Error(`Database type ${databaseType} is not yet supported`);
      default:
        throw new Error(`Unsupported database type: ${databaseType}`);
    }

    if (!client) {
      throw new Error(`Failed to create client for database type: ${databaseType}`);
    }

    return client;
  } catch (error) {
    console.error(`❌ Failed to create database client for ${databaseType}:`, error);
    throw error;
  }
};
