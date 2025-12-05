import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { generateObject } from "ai";
import { storeArtifact } from "../core/artifact";
import { suggestChart } from "./chart-suggestion";
import { openai } from "@ai-sdk/openai";
import {
  isFixableSyntaxError,
  categorizeError,
  ErrorCategory,
} from "../lib/sql-execution-errors";
import { getDBClient } from "../lib/getDBClient";
import { DatabaseType } from "../../databases";
import { log } from "../lib/log";
import { redisCache, generateCacheKey, createHash } from "../lib/redis";

/**
 * ===========================================
 * SQL EXECUTION TOOL
 * ===========================================
 *
 * This tool is the third step in the DeepSpot query processing pipeline.
 * It executes the generated SQL queries against the target database and
 * processes the results for visualization and storage.
 *
 * Key Functions:
 * 1. Database Execution: Safely executes SQL queries against PostgreSQL or BigQuery
 * 2. Security Validation: Ensures only SELECT queries are executed for safety
 * 3. Result Processing: Formats and stores query results as artifacts
 * 4. Chart Generation: Suggests appropriate visualizations for the data
 * 5. Performance Monitoring: Tracks execution time and result metrics
 *
 * Process Flow:
 * 1. Validate query type (SELECT only for security)
 * 2. Execute query against appropriate database client
 * 3. Process and format results
 * 4. Generate artifact title and headers using AI
 * 5. Store results as artifacts for persistence
 * 6. Suggest chart visualizations
 * 7. Return execution results with metadata
 */

/**
 * Configuration constants for query execution limits and timeouts
 */
const QUERY_CONFIG = {
  MAX_QUERY_LENGTH: 10000, // Maximum query length in characters
  MAX_RESULT_ROWS: 10000, // Maximum number of rows to return
  QUERY_TIMEOUT_MS: 1000000, // Query execution timeout in milliseconds
  AI_GENERATION_TIMEOUT_MS: 60000, // AI generation timeout in milliseconds
  MAX_RETRY_ATTEMPTS: 2, // Maximum retry attempts for failed queries
};

/**
 * Tool for executing SQL queries against database connections
 * Supports PostgreSQL, BigQuery, MySQL, MSSQL, Databricks with comprehensive safety validations
 */
export const sqlExecutionTool = createTool({
  id: "sql-execution",
  inputSchema: z.object({
    userQuery: z.string().describe("The user query that was generated"),
    query: z
      .string()
      .min(1, "Query cannot be empty")
      .max(
        QUERY_CONFIG.MAX_QUERY_LENGTH,
        `Query exceeds maximum length of ${QUERY_CONFIG.MAX_QUERY_LENGTH} characters`
      )
      .describe("The SQL query to execute against the database"),
    generateArtifact: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to generate an artifact for the query result"),
    generateChart: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to generate a chart for the query result"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the query execution was successful"),
    data: z
      .array(z.any())
      .describe("Array of result rows from the query execution"),
    rowCount: z.number().describe("Number of rows returned by the query"),
    totalCount: z
      .number()
      .optional()
      .describe("Total count of rows when LIMIT is used"),
    executedQuery: z
      .string()
      .describe("The actual SQL query that was executed"),
    executionTime: z.number().describe("Query execution time in milliseconds"),
    error: z.string().optional().describe("Error message if execution failed"),
    artifactResult: z.any().optional().describe("Artifact result"),
    chartResult: z.any().optional().describe("Chart result"),
    title: z.string().optional().describe("Title of the query result"),
  }),
  description:
    "Executes SQL queries against PostgreSQL or BigQuery databases with safety validations and result processing",
  execute: async ({
    context: { userQuery, query, generateArtifact, generateChart },
    runtimeContext,
  }) => {
    // Start timing the execution
    const startTime = Date.now();

    // Validate runtime context parameters
    const connectionString = runtimeContext.get("connectionString") as any;
    const databaseType = runtimeContext.get("databaseType") as string;
    const tenantId = runtimeContext.get("tenantId") as string;
    const applicationId = runtimeContext.get("applicationId") as string;
    const threadId = runtimeContext.get("threadId") as string;
    const messageId = runtimeContext.get("messageId") as string;

    let executingQuery = query; // The query that will be executed against the database

    // Generate cache key for SQL results
    const sqlHash = createHash(executingQuery);
    const connectionHash = createHash(connectionString || "");
    const cacheKey = generateCacheKey("sql", tenantId, sqlHash, connectionHash);

    // Try to get cached results first (only for SELECT queries)
    if (executingQuery.trim().toLowerCase().startsWith('select')) {
      const cachedResult = await redisCache.get(cacheKey);
      if (cachedResult) {
        console.log("🎯 Cache hit for SQL execution results");
        return {
          ...cachedResult,
          executedQuery: executingQuery,
        };
      }
    }

    // Validate required runtime context parameters
    if (!connectionString) {
      return createErrorResponse(
        executingQuery,
        0,
        "Missing connection string in runtime context",
        startTime
      );
    }

    if (!databaseType) {
      return createErrorResponse(
        executingQuery,
        0,
        "Missing database type in runtime context",
        startTime
      );
    }

    if (
      generateArtifact &&
      (!tenantId || !applicationId || !threadId || !messageId)
    ) {
      return createErrorResponse(
        executingQuery,
        0,
        "Missing required context parameters for artifact generation (tenantId, applicationId, threadId, messageId)",
        startTime
      );
    }

    // Initialize the appropriate database client based on database type
    let client;
    try {
      client = getDBClient(databaseType as DatabaseType, connectionString);
    } catch (error) {
      log({
        message: `❌ Failed to create database client: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
        data: error,
      })
      return createErrorResponse(
        executingQuery,
        0,
        `Failed to create database client: ${error instanceof Error ? error.message : String(error)}`,
        startTime
      );
    }

    // Validate client creation
    if (!client) {
      log({
        message: "Failed to create database client - check connection configuration",
        type: "error",
        data: {
          executingQuery,
        },
      })
      return createErrorResponse(
        executingQuery,
        0,
        "Failed to create database client - check connection configuration",
        startTime
      );
    }

    try {
      // Comprehensive query validation
      const validationResult = validateQuery(executingQuery);
      if (!validationResult.isValid) {
        return createErrorResponse(
          executingQuery,
          0,
          validationResult.error || "Query validation failed",
          startTime
        );
      }

      // Check if query has LIMIT clause for total count calculation
      const hasLimit = /\blimit\s+\d+/i.test(executingQuery);
      let totalCount: number | undefined = undefined;

      console.log(`🔍 Query analysis - Has LIMIT: ${hasLimit}`);

      // Execute the query with timeout and retry logic
      console.log(`⚡ Executing query: ${executingQuery}`);

      let result = null;
      let executionTime = 0;

      try {
        // Execute query with timeout
        result = await executeWithTimeout(
          () => client.executeQuery(executingQuery),
          QUERY_CONFIG.QUERY_TIMEOUT_MS
        );
        executionTime = Date.now() - startTime;
      } catch (error) {
        console.error(`❌ Query execution attempt failed:`, error);
        // Only attempt auto-fix if error appears to be a fixable SQL syntax error
        // and we haven't already attempted a fix
        if (isFixableSyntaxError(error, databaseType) && !executingQuery.includes('-- auto-fixed')) {
          try {
            console.log("🔧 Attempting to auto-fix SQL syntax error...");
            const fixedQuery = await generateFixedQuery(
              executingQuery,
              error,
              databaseType
            );

            if (fixedQuery && fixedQuery !== executingQuery) {
              // Add marker to prevent infinite retry loops
              executingQuery = fixedQuery + ' -- auto-fixed';
              result = await executeWithTimeout(
                () => client.executeQuery(executingQuery),
                QUERY_CONFIG.QUERY_TIMEOUT_MS
              );
              executionTime = Date.now() - startTime;
              console.log("✅ Auto-fix successful");
            }
          } catch (fixError) {
            console.error("❌ Failed to auto-fix query:", fixError);
          }
        }
      }

      // If query has LIMIT, get total count by executing a separate COUNT query
      if (hasLimit) {
        try {
          const countQuery = generateCountQuery(executingQuery, databaseType);
          if (countQuery) {
            console.log("countQuery :", countQuery);

            try {
              // Execute count query with timeout
              const countResult = await executeWithTimeout(
                () => client.executeQuery(countQuery),
                5000 // 5 second timeout for count queries
              );

              if (countResult && countResult.length > 0) {
                // Handle different result formats from different databases
                const firstRow = countResult[0];
                let countValue = 0;

                if (typeof firstRow === "object" && firstRow !== null) {
                  // Try different possible column names
                  countValue =
                    firstRow.total_count ||
                    firstRow.count ||
                    firstRow["COUNT(*)"] ||
                    firstRow["count(*)"] ||
                    0;
                } else if (Array.isArray(firstRow)) {
                  // Handle array format
                  countValue = firstRow[0] || 0;
                } else {
                  // Handle direct value
                  countValue = firstRow || 0;
                }

                totalCount = parseInt(String(countValue)) || 0;
                console.log(`📊 Total count extracted: ${totalCount}`);
              }
            } catch (countQueryError) {
              console.warn(`⚠️ Count query failed:`, countQueryError);
              // Return undefined for total_count on timeout instead of failing
              totalCount = undefined;
            }
          }
        } catch (countError) {
          console.warn(`⚠️ Failed to get total count:`, countError);
          // Continue without total count if it fails
          totalCount = undefined;
        }
      }

      // Validate and limit result size
      if (!Array.isArray(result)) {
        return createErrorResponse(
          executingQuery,
          executionTime,
          "Query returned invalid result format - expected array",
          startTime
        );
      }

      // Limit result size to prevent memory issues
      if (result.length > QUERY_CONFIG.MAX_RESULT_ROWS) {
        console.warn(
          `⚠️ Result set truncated from ${result.length} to ${QUERY_CONFIG.MAX_RESULT_ROWS} rows`
        );
        result = result.slice(0, QUERY_CONFIG.MAX_RESULT_ROWS);
      }

      // Handle empty result sets
      if (result.length === 0) {
        return {
          success: true,
          data: [],
          rowCount: 0,
          totalCount: totalCount,
          executedQuery: executingQuery,
          executionTime,
          artifactResult: null,
          chartResult: null,
          title: undefined,
        };
      }

      console.log(
        `✅ Query executed successfully in ${executionTime}ms, returned ${result.length} rows`
      );

      // Cache successful results (limit to first 1000 rows to prevent memory issues)
      const cacheableResult = {
        success: true,
        data: result.slice(0, 1000), // Limit cached data
        rowCount: result.length,
        totalCount: totalCount,
        executionTime: executionTime,
        error: undefined,
      };
      
      if (executingQuery.trim().toLowerCase().startsWith('select')) {
        await redisCache.set(cacheKey, cacheableResult, 120); // Cache for 2 minutes
      }

      let artifactResult = null;
      let chartResult = null;

      // Prepare artifact metadata structure
      let artifactTitleAndHeaders: {
        artifactTitle: string;
        headers: string[];
      } = {
        artifactTitle: "",
        headers: [],
      };
      let artifactTitleError: string | null = null;

      if (generateArtifact) {
        // Generate meaningful title and headers for the artifact using AI
        try {
          const { object } = await executeWithTimeout(
            () =>
              generateObject({
                model: openai("gpt-4o-mini"),
                prompt: `Generate a title and headers for the artifact based on the query and result
            Use Query to generate the title and headers.
            Query: ${executingQuery}
            OUTPUT FORMAT:
            {
              "artifactTitle": "<title of the artifact>",
              "headers": ["<header 1>", "<header 2>", "<header 3>", ...]
            }
            `,
                schema: z.object({
                  artifactTitle: z
                    .string()
                    .describe(
                      "Descriptive title for the query result artifact"
                    ),
                  headers: z
                    .array(z.string())
                    .describe("Array of column headers for the result data"),
                }),
                temperature: 0.1,
              }),
            QUERY_CONFIG.AI_GENERATION_TIMEOUT_MS
          );
          artifactTitleAndHeaders = object;
        } catch (err) {
          // Handle AI generation failure with fallback logic
          artifactTitleError = err instanceof Error ? err.message : String(err);
          console.error(
            "❌ Failed to generate artifact title and headers:",
            artifactTitleError
          );

          // Fallback: use default headers from result if available
          if (result.length > 0 && typeof result[0] === "object") {
            artifactTitleAndHeaders = {
              artifactTitle: "Query Result",
              headers: Object.keys(result[0]),
            };
          } else {
            artifactTitleAndHeaders = {
              artifactTitle: "Query Result",
              headers: [],
            };
          }
        }
        console.log("result.length :", result.length);

        // Store results as artifacts and generate chart suggestions if we have data
        if (result.length > 0) {
          console.log("🔌 Creating artifact...");
          try {
            // Generate chart suggestions based on the result data
            chartResult = await executeWithTimeout(
              () => suggestChart({ SQLResult: result }),
              QUERY_CONFIG.AI_GENERATION_TIMEOUT_MS
            );

            // Convert result data to string format for storage
            const stringData = result.map((row) => {
              if (typeof row === "object" && row !== null) {
                return Object.values(row).map((value) =>
                  value === null || value === undefined ? "" : String(value)
                );
              }
              return [String(row)];
            });

            // Store the query results as a persistent artifact
            artifactResult = await storeArtifact({
              tenantId,
              applicationId,
              threadId,
              messageId,
              headers: artifactTitleAndHeaders.headers,
              data: stringData,
              artifactType: "table",
              artifactTitle: artifactTitleAndHeaders.artifactTitle,
              chartType: chartResult.type,
              chartXAxis: chartResult.x_axis,
              chartYAxis: chartResult.y_axis,
              userQuery: userQuery,
              sqlQuery: executingQuery,
            });

            console.log("✅ Artifact created...");
          } catch (error) {
            console.error("❌ Failed to create artifact:", error);
            // Continue execution even if artifact creation fails
          }
        }
      }

      // Return successful execution results with all metadata
      return {
        success: true,
        data: result,
        rowCount: result.length,
        totalCount: totalCount,
        executedQuery: executingQuery,
        executionTime,
        artifactResult: artifactResult ? artifactResult.result : null,
        chartResult: chartResult ? chartResult : null,
        title: artifactTitleAndHeaders.artifactTitle
          ? artifactTitleAndHeaders.artifactTitle
          : undefined,
      };
    } catch (error) {
      // Handle execution errors and return failure response
      const executionTime = Date.now() - startTime;
      console.error(`❌ Query failed after ${executionTime}ms:`, error);

      const errorCategory = categorizeError(error, databaseType);
      const errorMessage = getDetailedErrorMessage(
        error,
        errorCategory,
        databaseType
      );

      return createErrorResponse(
        executingQuery,
        executionTime,
        errorMessage,
        startTime
      );
    } finally {
      // Ensure proper connection cleanup for all database types
      try {
        if (client && typeof client.close === "function") {
          await client.close();
          console.log(`🔌 Database connection closed for ${databaseType}`);
        }
      } catch (closeError) {
        console.warn(`⚠️ Failed to close database connection:`, closeError);
        // Don't throw here as the main operation may have succeeded
      }
    }
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a standardized error response object
 */
function createErrorResponse(
  executingQuery: string,
  executionTime: number,
  error: string,
  startTime: number
) {
  return {
    success: false,
    data: [],
    rowCount: 0,
    totalCount: undefined,
    error,
    executedQuery: executingQuery,
    executionTime: executionTime || Date.now() - startTime,
    artifactResult: null,
    chartResult: null,
    title: undefined,
  };
}

/**
 * Comprehensive query validation including security checks
 */
function validateQuery(executingQuery: string): {
  isValid: boolean;
  error?: string;
} {
  // Check query length
  if (executingQuery.length > QUERY_CONFIG.MAX_QUERY_LENGTH) {
    return {
      isValid: false,
      error: `Query exceeds maximum length of ${QUERY_CONFIG.MAX_QUERY_LENGTH} characters`,
    };
  }

  // Check for empty query
  if (!executingQuery.trim()) {
    return {
      isValid: false,
      error: "Query cannot be empty",
    };
  }

  const trimmedQuery = executingQuery.trim().toLowerCase();

  // Check if query starts with allowed keywords
  const allowedStartKeywords = ["select", "with"];
  const startsWithAllowed = allowedStartKeywords.some((keyword) =>
    trimmedQuery.startsWith(keyword)
  );

  if (!startsWithAllowed) {
    return {
      isValid: false,
      error:
        "Only SELECT queries and WITH clauses (CTEs) are allowed for security reasons - no DDL, DML, or DCL operations permitted",
    };
  }

  // Enhanced security check: Ensure no dangerous operations are present
  // Only check for actual dangerous operations, not legitimate SQL constructs
  const dangerousOperations = [
    // DDL operations
    "drop table",
    "drop database",
    "drop schema",
    "drop index",
    "drop view",
    "create table",
    "create database",
    "create schema",
    "create index",
    "create view",
    "alter table",
    "alter database",
    "alter schema",
    "truncate table",

    // DML operations
    "insert into",
    "update set",
    "delete from",

    // DCL operations
    "grant ",
    "revoke ",

    // System procedures and dangerous functions
    "xp_cmdshell",
    "sp_executesql",
    "openrowset",
    "opendatasource",
    "bulk insert",
    "backup database",
    "restore database",
    "shutdown",
    "kill process",

    // System table access (only when used suspiciously)
    "from information_schema.tables",
    "from sys.tables",
    "from master..sysdatabases",

    // Additional dangerous patterns
    "update ",
    "insert ",
    "delete ",
    "create ",
    "alter ",
    "drop ",
    "truncate ",
  ];

  const containsDangerousOperation = dangerousOperations.some((operation) =>
    new RegExp(
      `\\b${operation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    ).test(executingQuery)
  );

  if (containsDangerousOperation) {
    return {
      isValid: false,
      error:
        "Query contains dangerous operations - only SELECT queries and WITH clauses are permitted",
    };
  }

  // Check for potential SQL injection patterns (more precise detection)
  const injectionPatterns = [
    // Only flag suspicious union patterns (not legitimate UNION ALL)
    /union\s+select\s+.*from\s+information_schema/i,
    /union\s+select\s+.*from\s+sys\./i,
    /union\s+select\s+.*from\s+master\.\./i,

    // Boolean-based injection patterns (more specific)
    /or\s+1\s*=\s*1\s*--/i,
    /or\s+'1'\s*=\s*'1'\s*--/i,
    /or\s+1\s*=\s*1\s*\/\*/i,
    /or\s+1\s*=\s*1\s*$/i,
    /or\s+'1'\s*=\s*'1'\s*$/i,

    // String-based injection patterns (more specific)
    /'\s*or\s*'.*?'\s*=\s*'.*?'\s*--/i,
    /'\s*or\s*'.*?'\s*=\s*'.*?'\s*\/\*/i,
    /'\s*or\s*'.*?'\s*=\s*'.*?'\s*$/i,
    /\"\s*or\s*\".*?\"\s*=\s*\".*?\"\s*--/i,
    /\"\s*or\s*\".*?\"\s*=\s*\".*?\"\s*$/i,

    // Command injection patterns
    /;\s*drop\s+table/i,
    /;\s*delete\s+from/i,
    /;\s*insert\s+into/i,
    /;\s*update\s+.*set/i,
    /;\s*exec\s*\(/i,
    /;\s*execute\s*\(/i,

    // System procedure calls
    /xp_cmdshell/i,
    /sp_executesql/i,
    /openrowset/i,
    /opendatasource/i,
  ];

  const containsInjectionPattern = injectionPatterns.some((pattern) =>
    pattern.test(executingQuery)
  );

  if (containsInjectionPattern) {
    return {
      isValid: false,
      error:
        "Query contains potentially malicious patterns - security validation failed",
    };
  }

  return { isValid: true };
}

/**
 * Executes a function with a timeout
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Generates a fixed query using AI when syntax errors are detected
 * Only attempts fix if original query had reasonable confidence
 */
async function generateFixedQuery(
  originalQuery: string,
  error: unknown,
  databaseType: string
): Promise<string | null> {
  try {
    // Check if this is a simple syntax error that can be fixed
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Only attempt to fix common, simple syntax errors
    const fixablePatterns = [
      /syntax error/i,
      /unexpected token/i,
      /missing/i,
      /invalid/i,
      /near/i
    ];
    
    const isFixable = fixablePatterns.some(pattern => pattern.test(errorMessage));
    if (!isFixable) {
      console.log("🔍 Error doesn't appear fixable, skipping auto-fix");
      return null;
    }

    const prompt = `
    The previous SQL failed with a syntax error. Generate a corrected SQL query.
    Original query: ${originalQuery}
    Error: ${errorMessage}
    Database type: ${databaseType}
    
    Focus on fixing the specific syntax error mentioned. Return ONLY the corrected SQL query.
    Keep the same logic and intent as the original query.
    
    `;
    const { object } = await executeWithTimeout(
      () =>
        generateObject({
          model: openai("gpt-4o-mini"),
          prompt: prompt,
          schema: z.object({
            query: z
              .string()
              .describe("New query to execute against the database"),
          }),
          temperature: 0.1,
        }),
      QUERY_CONFIG.AI_GENERATION_TIMEOUT_MS
    );

    // Validate the generated query
    const validation = validateQuery(object.query);
    if (!validation.isValid) {
      console.warn("⚠️ Generated query failed validation:", validation.error);
      return null;
    }

    return object.query;
  } catch (error) {
    console.error("❌ Failed to generate fixed query:", error);
    return null;
  }
}

/**
 * Generates a count query optimized for different database types
 */
function generateCountQuery(query: string, databaseType: string): string | null {
  try {
    const trimmedQuery = query.trim();
    
    // For CTE queries, use database-specific optimizations
    if (trimmedQuery.toLowerCase().startsWith('with')) {
      return generateCTECountQuery(trimmedQuery, databaseType);
    } else {
      // For regular queries, use the subquery approach
      let baseQuery = trimmedQuery
        .replace(/\s+limit\s+\d+(\s+offset\s+\d+)?/gi, '') // Remove LIMIT and OFFSET
        .replace(/\s+order\s+by\s+[^;]+(?:asc|desc)?/gi, '') // Remove ORDER BY clause
        .replace(/;+$/, '') // Remove trailing semicolons
        .trim();
      
      return `SELECT COUNT(*) as total_count FROM (${baseQuery}) as count_subquery`;
    }
  } catch (error) {
    console.error('❌ Failed to generate count query:', error);
    return null;
  }
}

/**
 * Generates count queries for CTEs with database-specific optimizations
 */
function generateCTECountQuery(query: string, databaseType: string): string | null {
  try {
    // For PostgreSQL, BigQuery, and Snowflake, CTE count queries work well
    if (['postgresql', 'bigquery', 'snowflake'].includes(databaseType.toLowerCase())) {
      let baseQuery = query
        .replace(/\s+limit\s+\d+(\s+offset\s+\d+)?/gi, '') // Remove LIMIT and OFFSET
        .replace(/\s+order\s+by\s+[^;]+(?:asc|desc)?/gi, '') // Remove ORDER BY clause
        .replace(/;+$/, '') // Remove trailing semicolons
        .trim();
      
      return `SELECT COUNT(*) as total_count FROM (${baseQuery}) as count_subquery`;
    }
    
    // For other databases, skip CTE count queries to avoid complexity
    return null;
  } catch (error) {
    console.error('❌ Failed to generate CTE count query:', error);
    return null;
  }
}

/**
 * Provides detailed error messages based on error category
 */
function getDetailedErrorMessage(
  error: unknown,
  category: ErrorCategory,
  databaseType: string
): string {
  const baseMessage = error instanceof Error ? error.message : String(error);

  switch (category) {
    case ErrorCategory.SYNTAX:
      return `SQL syntax error: ${baseMessage}`;
    case ErrorCategory.FUNCTION:
      return `Function error: ${baseMessage}`;
    case ErrorCategory.COLUMN:
      return `Column reference error: ${baseMessage}`;
    case ErrorCategory.TABLE:
      return `Table reference error: ${baseMessage}`;
    case ErrorCategory.TYPE:
      return `Data type error: ${baseMessage}`;
    case ErrorCategory.AGGREGATE:
      return `Aggregate function error: ${baseMessage}`;
    case ErrorCategory.PERMISSION:
      return `Permission denied: ${baseMessage}`;
    default:
      return `Database error (${databaseType}): ${baseMessage}`;
  }
}
