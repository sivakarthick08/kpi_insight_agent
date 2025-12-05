import { PostgresClient } from "./postgres";

// Singleton pattern implementation
let dbInstance: PostgresClient | null = null;

export const getDb = (): PostgresClient => {
  if (!dbInstance) {
    dbInstance = new PostgresClient(process.env.POSTGRES_CONNECTION_STRING || "");
  }
  return dbInstance;
};

// Export the singleton instance for backward compatibility
export const dbClient = getDb();