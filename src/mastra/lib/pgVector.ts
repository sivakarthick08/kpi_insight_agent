import { PgVector } from "@mastra/pg";

/**
 * ===========================================
 * PGVECTOR SINGLETON PATTERN
 * ===========================================
 *
 * This module provides centralized PgVector instance management with caching.
 * It ensures that only one PgVector instance is created per unique connection string,
 * preventing unnecessary database connections and improving performance.
 *
 * Features:
 * - Singleton pattern with connection string-based caching
 * - Support for separate agent and default connection strings
 * - Error handling and connection validation
 * - Consistent pattern across the codebase
 */

// Cache to store PgVector instances per connection string
const pgVectorCache = new Map<string, PgVector>();

/**
 * Factory function for creating PgVector instances with connection pooling
 * Implements caching to reuse database connections and improve performance
 * @param connectionString - PostgreSQL connection string
 * @returns PgVector instance (cached if already exists) or null if connection fails
 */
const getPgVector = (connectionString: string): PgVector | null => {
  // Validate connection string
  if (!connectionString) {
    console.warn("Connection string is empty - cannot initialize PgVector");
    return null;
  }

  // Check if PgVector already exists for this connection string
  if (pgVectorCache.has(connectionString)) {
    return pgVectorCache.get(connectionString)!;
  }

  try {
    // Create new PgVector instance
    const vector = new PgVector({
      connectionString,
    });

    // Cache the vector instance for future reuse
    pgVectorCache.set(connectionString, vector);
    
    console.log(`🔌 Initialized PgVector for connection string`);
    return vector;
  } catch (error) {
    console.error("Failed to initialize PgVector:", error);
    
    // Handle specific connection errors
    if (error instanceof Error) {
      if (error.message.includes('EPIPE') || error.message.includes('ECONNRESET')) {
        console.error("Database connection error - check if PostgreSQL is running and accessible");
      } else if (error.message.includes('ENOTFOUND')) {
        console.error("Database host not found - check connection string");
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error("Database connection refused - check if PostgreSQL is running");
      }
    }
    
    return null;
  }
};

/**
 * Get PgVector instance for agent operations
 * Uses AGENT_POSTGRES_CONNECTION_STRING environment variable
 * @returns PgVector instance for agent memory operations
 */
const getAgentPgVector = (): PgVector | null => {
  const connectionString = process.env.AGENT_POSTGRES_CONNECTION_STRING || "";
  
  if (!connectionString) {
    console.warn("AGENT_POSTGRES_CONNECTION_STRING environment variable is not set");
    return null;
  }
  
  return getPgVector(connectionString);
};

/**
 * Get PgVector instance for default/general operations
 * Uses POSTGRES_CONNECTION_STRING environment variable
 * @returns PgVector instance for general database operations
 */
const getDefaultPgVector = (): PgVector | null => {
  const connectionString = process.env.POSTGRES_CONNECTION_STRING || "";
  
  if (!connectionString) {
    console.warn("POSTGRES_CONNECTION_STRING environment variable is not set");
    return null;
  }
  
  return getPgVector(connectionString);
};

export { getPgVector, getAgentPgVector, getDefaultPgVector };
