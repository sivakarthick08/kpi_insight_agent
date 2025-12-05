import { z } from "zod";
import { createTool } from "@mastra/core";
import { extractTablesFromSchematic } from "../lib/extract-tables-from-schematic";
import { searchSemanticLayerData } from "../core/semantic-layer-storage-tool";
import { redisCache, generateCacheKey, createHash } from "../lib/redis";

/**
 * ===========================================
 * QUERY PROCESSING AND VECTOR SEARCH TOOL
 * ===========================================
 *
 * This tool is the first step in the DeepSpot query processing pipeline.
 * It takes a natural language query and performs intelligent search against
 * the semantic layer to find relevant database schema information.
 *
 * Key Functions:
 * 1. Query Enhancement: Uses AI to expand and optimize the user's natural language query
 * 2. Knowledge Base Integration: Incorporates business context from the knowledge base
 * 3. Vector Search: Performs semantic search against stored schema metadata
 * 4. Schema Extraction: Extracts relevant table and field information for SQL generation
 *
 * Process Flow:
 * 1. Parse and clean the input query
 * 2. Retrieve business knowledge base context
 * 3. Generate enhanced search query using AI
 * 4. Perform vector search against semantic layer
 * 5. Extract and format relevant schema information
 * 6. Return structured table metadata for downstream processing
 */

/**
 * Tool for processing natural language queries and searching the semantic layer
 * to find relevant database schema information for SQL generation.
 */
export const getQueryAndSearchVector = createTool({
  id: "get-query-and-search-vector",
  inputSchema: z.object({
    expandedQuery: z
      .string()
      .describe(
        "The user's natural language query that needs to be processed and converted to SQL"
      ),
    whatToImprove: z
      .string()
      .optional()
      .describe("The user's natural language query that needs to be improved"),
  }),
  outputSchema: z.object({
    tables: z
      .array(
        z.object({
          name: z.string().describe("Name of the database table"),
          fields: z
            .array(
              z.object({
                field_name: z
                  .string()
                  .describe("Name of the table field/column"),
                field_type: z
                  .string()
                  .describe(
                    "Data type of the field (e.g., varchar, integer, timestamp)"
                  ),
                field_description: z
                  .string()
                  .describe(
                    "Description of what the field contains or represents"
                  ),
                sample_data: z
                  .array(z.any())
                  .describe("Sample data of the field"),
              })
            )
            .describe("Array of fields/columns in the table"),
          description: z
            .string()
            .describe("Description of the table's purpose and contents"),
          schema_name: z
            .string()
            .describe("Name of the database schema containing this table"),
        })
      )
      .describe(
        "Array of relevant database tables found through vector search"
      ),
  }),
  description:
    "Processes natural language queries and searches the semantic layer to find relevant database schema information for SQL generation",
  execute: async (
    { context: { expandedQuery, whatToImprove }, runtimeContext },
    options
  ) => {
    console.log("Inside Get Query And Search Vector Tool", expandedQuery);
    // Validate required input
    if (!expandedQuery) {
      throw new Error("Natural language query is required");
    }

    const tenantId = runtimeContext.get("tenantId") as string;
    const applicationId = runtimeContext.get("applicationId") as string;

    // Generate cache key for vector search results
    const queryHash = createHash(expandedQuery);
    const cacheKey = generateCacheKey("vector", tenantId, applicationId, queryHash);

    // Try to get cached results first
    const cachedResult = await redisCache.get(cacheKey);
    if (cachedResult) {
      console.log("🎯 Cache hit for vector search results");
      return cachedResult;
    }

    console.log("🔍 Cache miss, performing vector search...");
    const vectorSearchResult = await searchSemanticLayerData({
      tenantId,
      applicationId,
      query: expandedQuery,
      maxResults: 10,
    });

    console.log(
      `✅ Found ${vectorSearchResult.results?.length || 0} relevant schema entries from vector search`
    );

    // Extract and process relevant schema information
    console.log("🧠 Extracting relevant schema parts for query...");

    const schemaContext = vectorSearchResult.results || [];

    // Extract table structures from the semantic search results
    const tables = await extractTablesFromSchematic(schemaContext);

    const result = { tables };

    // Cache the results for 5 minutes (300 seconds)
    await redisCache.set(cacheKey, result, 300);

    // Return the relevant tables for SQL generation
    return result;
  },
});
