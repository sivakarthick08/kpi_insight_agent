import {
  generateChunksAndEmbed,
  generateEmbedding,
} from "../lib/generateEmbedding";
import { UpsertVectorParams } from "@mastra/core";
import { getDefaultPgVector } from "../lib/pgVector";
import {
  ARTIFACT_ENTRIES_VECTORS_TABLE_NAME,
  CONTENTS_ENTRIES_TABLE_NAME,
  KPI_ENTRIES_VECTORS_TABLE_NAME,
  SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
} from "../lib/conts";
import crypto from "crypto";
import extractKeywords from "../lib/extract-keywords";
import { dbClient } from "../../databases/db";

/**
 * ===========================================
 * SEMANTIC LAYER STORAGE TOOL
 * ===========================================
 *
 * This tool manages the semantic layer storage system that enables intelligent
 * search and retrieval of database schema information using vector embeddings.
 * It provides the foundation for the DeepSpot query processing pipeline.
 *
 * Key Functions:
 * 1. Vector Storage: Stores database schema metadata as vector embeddings
 * 2. Semantic Search: Performs similarity search using vector embeddings
 * 3. Schema Indexing: Indexes tables, fields, relationships, and metrics
 * 4. Multi-tenant Support: Isolates data by tenant and application
 * 5. Keyword Search: Provides fallback text-based search capabilities
 *
 * Content Types:
 * - "table": Database table definitions and descriptions
 * - "field": Column definitions with types and descriptions
 * - "relationship": Foreign key relationships between tables
 * - "metric": Business metrics and calculated fields
 * - "category": Data categorization and classification
 *
 * Process Flow:
 * 1. Initialize vector storage and indexes
 * 2. Store schema metadata as vector embeddings
 * 3. Perform semantic search for relevant schema information
 * 4. Combine vector and keyword search results
 * 5. Return structured schema context for SQL generation
 */

// =========================
// Storage Initialization
// =========================

/**
 * Performs a health check on the database connection for a specific tenant
 * @param tenantId - The tenant identifier for the database connection
 * @returns Promise<boolean> - True if connection is healthy, false otherwise
 */
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const store = getDefaultPgVector();
    if (!store) {
      console.error("Failed to create PgVector store for health check");
      return false;
    }

    // Try a simple query to test the connection
    await store.query({
      indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
      queryVector: new Array(1536).fill(0), // Dummy vector for testing
      topK: 1,
    });

    return true;
  } catch (error) {
    console.error("Database connection health check failed:", error);
    return false;
  }
}

/**
 * Initializes the vector storage system for a specific tenant
 * Creates the necessary tables and indexes if they don't exist
 * @param tenantId - The tenant identifier for the storage system
 * @throws Error if initialization fails
 */
export async function initializeStorage() {
  try {
    // First check if the database connection is healthy
    const isHealthy = await checkDatabaseConnection();
    if (!isHealthy) {
      throw new Error("Database connection is not healthy");
    }

    const store = getDefaultPgVector();
    if (!store) {
      throw new Error("Failed to create PgVector store");
    }

    // Initialize the vector index with cosine similarity and 1536 dimensions (OpenAI embedding size)
    await store.createIndex({
      indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
      metric: "cosine",
      dimension: 1536,
    });

    await store.createIndex({
      indexName: ARTIFACT_ENTRIES_VECTORS_TABLE_NAME,
      metric: "cosine",
      dimension: 1536,
    });

    await store.createIndex({
      indexName: CONTENTS_ENTRIES_TABLE_NAME,
      metric: "cosine",
      dimension: 1536,
    });

    await store.createIndex({
      indexName: KPI_ENTRIES_VECTORS_TABLE_NAME,
      metric: "cosine",
      dimension: 1536,
    });

    console.log("✅ Semantic layer storage initialized successfully");
  } catch (error) {
    console.error("Storage initialization failed:", error);

    // Handle specific connection errors with descriptive messages
    if (error instanceof Error) {
      if (
        error.message.includes("EPIPE") ||
        error.message.includes("ECONNRESET")
      ) {
        throw new Error(
          "Database connection error - check if PostgreSQL is running and accessible"
        );
      } else if (error.message.includes("ENOTFOUND")) {
        throw new Error("Database host not found - check connection string");
      } else if (error.message.includes("ECONNREFUSED")) {
        throw new Error(
          "Database connection refused - check if PostgreSQL is running"
        );
      }
    }

    throw error;
  }
}

// =========================
// CRUD Operations
// =========================

/**
 * Stores semantic layer data (schema metadata) as vector embeddings
 * Processes tables, fields, relationships, and metrics into searchable vectors
 * @param tenantId - The tenant identifier for data isolation
 * @param applicationId - The application identifier for data isolation
 * @param schemaData - The schema data to store (table, fields, relationships, metrics)
 * @returns Promise with storage result including success status and entry count
 */
export async function storeSemanticLayerData(
  tenantId: string,
  applicationId: string,
  schemaData: any
): Promise<any> {
  console.log(`💾 Storing semantic layer data for tenant: ${tenantId}`);

  const store = getDefaultPgVector();
  const entries: UpsertVectorParams[] = [];

  // Process table-level metadata
  if (schemaData) {
    const tablePayload = {
      tenant_id: tenantId,
      content_type: "table",
      table_name: schemaData.table_name,
      table_description: schemaData.description,
      application_id: applicationId,
    };
    console.log(`Processing table: ${schemaData.table_name}`);

    // Generate vector embedding for table metadata
    const { embedding, error } = await generateChunksAndEmbed(
      JSON.stringify(tablePayload)
    );

    // Add table entry to the batch
    entries.push({
      indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
      vectors: [embedding || []],
      ids: [crypto.randomUUID()],
      metadata: [tablePayload],
    });

    // Process field-level metadata
    if (schemaData.fields && schemaData.fields.length > 0) {
      console.log(`Generating chunks for fields: ${schemaData.fields.length}`);
      for (const field of schemaData.fields) {
        const fieldPayload = {
          tenant_id: tenantId,
          content_type: "field",
          table_name: schemaData.table_name,
          field_name: field.name,
          field_description: field.description,
          field_type: field.type,
          application_id: applicationId,
        };

        // Generate vector embedding for field metadata
        const { embedding, error } = await generateChunksAndEmbed(
          JSON.stringify(fieldPayload)
        );
        if (error) {
          console.error("Error generating chunks:", error);
          continue;
        }

        // Add field entry to the batch
        entries.push({
          indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
          vectors: [embedding || []],
          ids: [crypto.randomUUID()],
          metadata: [fieldPayload],
        });
      }
    }

    // Process relationship metadata
    if (schemaData.relationships && schemaData.relationships.length > 0) {
      console.log(
        `Generating chunks for relationships: ${schemaData.relationships.length}`
      );
      for (const relationship of schemaData.relationships) {
        const relationshipPayload = {
          tenant_id: tenantId,
          content_type: "relationship",
          table_name: schemaData.table_name,
          to_table: relationship.to_table,
          from_column: relationship.from_column,
          to_column: relationship.to_column,
          type: relationship.type,
          application_id: applicationId,
        };

        // Generate vector embedding for relationship metadata
        const { embedding, error } = await generateChunksAndEmbed(
          JSON.stringify(relationshipPayload)
        );
        if (error) {
          console.error("Error generating chunks:", error);
          continue;
        }

        // Add relationship entry to the batch
        entries.push({
          indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
          vectors: [embedding || []],
          ids: [crypto.randomUUID()],
          metadata: [relationshipPayload],
        });
      }
    }

    // Process metric metadata
    if (schemaData.metrics && schemaData.metrics.length > 0) {
      console.log(
        `Generating chunks for metrics: ${schemaData.metrics.length}`
      );
      for (const metric of schemaData.metrics) {
        const metricPayload = {
          tenant_id: tenantId,
          content_type: "metric",
          table_name: schemaData.table_name,
          metric_name: metric.name,
          metric_definition: metric.definition,
          metric_description: metric.description,
          application_id: applicationId,
        };

        // Generate vector embedding for metric metadata
        const { embedding, error } = await generateChunksAndEmbed(
          JSON.stringify(metricPayload)
        );
        if (error) {
          console.error("Error generating chunks:", error);
          continue;
        }

        // Add metric entry to the batch
        entries.push({
          indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
          vectors: [embedding || []],
          ids: [crypto.randomUUID()],
          metadata: [metricPayload],
        });
      }
    }
  }

  // Process entries in batches to prevent overwhelming the database
  const batchSize = 50; // Reduced batch size for better performance
  const batches = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    batches.push(entries.slice(i, i + batchSize));
  }

  let storedCount = 0;
  let errorCount = 0;

  // Store entries in batches with error handling
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `💾 Storing batch ${i + 1}/${batches.length} (${batch.length} entries)`
    );

    for (const entry of batch) {
      try {
        await store?.upsert(entry);
        storedCount++;
      } catch (error) {
        console.error("Error storing entry:", error);
        errorCount++;

        // Handle specific connection errors
        if (error instanceof Error) {
          if (
            error.message.includes("EPIPE") ||
            error.message.includes("ECONNRESET")
          ) {
            console.error(
              "Database connection error during storage - entry skipped"
            );
          }
        }
      }
    }

    // Add a small delay between batches to prevent overwhelming the database
    if (i + 1 < batches.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(
    `📊 Storage completed: ${storedCount} stored, ${errorCount} failed`
  );

  console.log(`✅ Stored ${entries.length} semantic layer entries`);
  return {
    success: true,
    entries_stored: entries.length,
  };
}

/**
 * Performs keyword-based search on semantic layer data using PostgreSQL full-text search
 * Provides fallback search capability when vector search is not available
 * @param tenantId - The tenant identifier for data isolation
 * @param query - The search query string
 * @param applicationId - The application identifier for data isolation
 * @param maxResults - Maximum number of results to return (default: 10)
 * @returns Promise with search results including relevance scores
 */
export async function keywordSearchSemanticLayerData(
  tenantId: string,
  query: string,
  applicationId: string,
  maxResults: number = 10
): Promise<any> {
  console.log(
    `🔍 Keyword searching semantic layer data for query: "${tenantId}": applicationId: "${applicationId}"`
  );

  const keywords = await extractKeywords(query);
  const keywordsORSeparated = keywords.join(" OR ");

  const search_sql = `
       SELECT
        id,
        metadata,
        ts_rank_cd(
          to_tsvector('english', metadata ->> 'searchable_text'),
          query
        ) as score
      FROM
        semantic_layer_entries,
        websearch_to_tsquery('english', '${keywordsORSeparated}') query
      WHERE
        to_tsvector('english', metadata ->> 'searchable_text') @@ query 
        AND metadata ->> 'application_id' = '${applicationId}'
        AND metadata ->> 'tenant_id' = '${tenantId}'
      ORDER BY
        score DESC
      LIMIT
        ${maxResults}
        `;

  const results = await dbClient.executeQuery(search_sql);

  return results;
}

/**
 * Retrieves semantic layer data using vector similarity search
 * This is the primary search method for finding relevant schema information
 * @param tenantId - The tenant identifier for data isolation
 * @param query - The search query string
 * @param applicationId - The application identifier for data isolation
 * @param maxResults - Maximum number of results to return (default: 10)
 * @returns Promise with search results including similarity scores and metadata
 */
export async function retrieveSemanticLayerData(
  tenantId: string,
  query: string,
  applicationId: string,
  maxResults: number = 10
): Promise<any> {
  const store = getDefaultPgVector();

  if (!store) {
    console.error("Failed to create PgVector store for retrieval");
    return {
      query: query,
      results: [],
      summary: {
        total_results: 0,
        content_types: [],
        average_similarity: 0,
      },
      error: "Failed to initialize database connection",
    };
  }

  try {
    const queryEmbeddingResult = await generateEmbedding(`${query}`);

    if (queryEmbeddingResult.error) {
      throw new Error(
        `Embedding generation failed: ${queryEmbeddingResult.error}`
      );
    }

    // Ensure the embedding has the correct dimension
    if (
      !queryEmbeddingResult.embedding ||
      queryEmbeddingResult.embedding.length !== 1536
    ) {
      throw new Error(
        "Invalid embedding dimension. Expected 1536, got " +
          (queryEmbeddingResult.embedding?.length || 0)
      );
    }

    // Build filter conditions for pgvector
    let filterConditions: any = {
      application_id: { $eq: applicationId },
      tenant_id: { $eq: tenantId },
    };

    let semanticSearchResults = await store.query({
      indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
      queryVector: queryEmbeddingResult.embedding,
      topK: maxResults,
      filter: filterConditions,
    });

    if (!semanticSearchResults) {
      return {
        query: query,
        results: [],
        summary: {
          total_results: 0,
          content_types: [],
          average_similarity: 0,
        },
      };
    }

    // const keywordSearchResults = await keywordSearchSemanticLayerData(
    //   tenantId,
    //   query,
    //   applicationId,
    //   maxResults
    // );

    // Combine results and remove duplicates based on metadata.table_name
    const combinedResults = [...semanticSearchResults];
    const uniqueTableMap = new Map<string, any>();
    for (const row of combinedResults) {
      const tableName = row.metadata?.table_name;
      if (tableName && !uniqueTableMap.has(tableName)) {
        uniqueTableMap.set(tableName, row);
      }
    }
    const dedupedResults = Array.from(uniqueTableMap.values());

    const relevantData = {
      query: query,
      results: dedupedResults.map((row) => ({
        id: row.id,
        content_type: row.metadata?.content_type,
        content: row.metadata,
        similarity: row.score,
      })),
      summary: {
        total_results: dedupedResults.length,
        content_types: [
          ...new Set(
            dedupedResults.map((r) => r.metadata?.content_type).filter(Boolean)
          ),
        ],
        average_similarity:
          dedupedResults.length > 0
            ? dedupedResults.reduce((sum, row) => sum + row.score, 0) /
              dedupedResults.length
            : 0,
      },
    };

    console.log(`✅ Retrieved ${dedupedResults.length} relevant entries`);
    return relevantData;
  } catch (error) {
    console.error("Error retrieving semantic layer data:", error);

    // Handle specific connection errors
    if (error instanceof Error) {
      if (
        error.message.includes("EPIPE") ||
        error.message.includes("ECONNRESET")
      ) {
        return {
          query: query,
          results: [],
          summary: {
            total_results: 0,
            content_types: [],
            average_similarity: 0,
          },
          error:
            "Database connection error - check if PostgreSQL is running and accessible",
        };
      }
    }

    return {
      query: query,
      results: [],
      summary: {
        total_results: 0,
        content_types: [],
        average_similarity: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main search function that combines vector and keyword search for comprehensive results
 * Groups results by content type and provides context summaries
 * @param params - Object containing search parameters
 * @returns Promise with comprehensive search results including grouped data and context
 */
export async function searchSemanticLayerData({
  tenantId,
  query,
  maxResults = 10,
  applicationId,
}: {
  tenantId: string;
  query: string;
  maxResults: number;
  applicationId: string;
}): Promise<any> {
  // This is similar to retrieve but with more detailed analysis
  const retrievalResult = await retrieveSemanticLayerData(
    tenantId,
    query,
    applicationId,
    maxResults
  );
  // Group results by content type
  const groupedResults = {
    tables: retrievalResult.results.filter(
      (r: any) => r.content_type === "table"
    ),
    fields: retrievalResult.results.filter(
      (r: any) => r.content_type === "field"
    ),
    relationships: retrievalResult.results.filter(
      (r: any) => r.content_type === "relationship"
    ),
    metrics: retrievalResult.results.filter(
      (r: any) => r.content_type === "metric"
    ),
    categories: retrievalResult.results.filter(
      (r: any) => r.content_type === "category"
    ),
  };

  // Generate context summary
  const contextSummary = generateContextSummary(groupedResults, query);

  return {
    ...retrievalResult,
    grouped_results: groupedResults,
    context_summary: contextSummary,
  };
}

/**
 * Updates existing semantic layer data by deleting and recreating entries
 * @param tenantId - The tenant identifier for data isolation
 * @param rowId - The ID of the row to update
 * @param applicationId - The application identifier for data isolation
 * @param schemaData - The new schema data to store
 * @returns Promise with update result
 */
export async function updateSemanticLayerData(
  tenantId: string,
  rowId: string,
  applicationId: string,
  schemaData: any
): Promise<any> {
  console.log(`🔄 Updating semantic layer data for tenant: ${tenantId}`);

  if (!rowId) {
    console.warn("Row ID is required for update");
    return {
      success: false,
      error: "Row ID is required for update",
    };
  }
  // First delete existing data for this tenant
  await deleteSemanticLayerData(tenantId, applicationId || "", rowId);

  // Then store new data
  return await storeSemanticLayerData(
    tenantId,
    applicationId || "",
    schemaData
  );
}

/**
 * Deletes semantic layer data by ID with tenant and application isolation
 * @param tenantId - The tenant identifier for data isolation
 * @param applicationId - The application identifier for data isolation
 * @param rowId - The ID of the row to delete
 * @returns Promise with deletion result
 */
export async function deleteSemanticLayerData(
  tenantId: string,
  applicationId: string,
  rowId: string
): Promise<any> {
  console.log(`🗑️ Deleting semantic layer data for tenant: ${tenantId}`);

  try {
    const store = getDefaultPgVector();
    if (!rowId) {
      console.warn("Row ID is required for deletion");
      return {
        success: false,
        error: "Row ID is required for deletion",
      };
    }
    await store?.deleteVector({
      indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
      id: rowId,
    });
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error deleting semantic layer data:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      deleted_count: 0,
    };
  }
}

/**
 * Generates a context summary from grouped search results
 * Provides insights into relevant tables, fields, and relationships
 * @param groupedResults - Results grouped by content type
 * @param query - The original search query
 * @returns Object with context summary including relevant entities and suggestions
 */
function generateContextSummary(groupedResults: any, query: string): any {
  const relevantTables = groupedResults.tables
    .map((t: any) => t.content?.table_name || t.metadata?.table_name)
    .filter(Boolean);

  const relevantFields = groupedResults.fields
    .map(
      (f: any) =>
        `${f.metadata?.field_name || "unknown"} (${f.metadata?.table_name || "unknown"})`
    )
    .filter(Boolean);

  const relevantRelationships = groupedResults.relationships
    .map((r: any) => {
      const tableName = r.content?.table_name || r.metadata?.table_name;
      const foreignTableName = r.content?.foreign_table_name;
      return `${tableName} -> ${foreignTableName}`;
    })
    .filter(Boolean);

  return {
    relevant_tables: relevantTables,
    relevant_fields: relevantFields,
    relevant_relationships: relevantRelationships,
    query_intent: determineQueryIntent(query),
    suggested_queries: generateSuggestedQueries(groupedResults),
  };
}

/**
 * Determines the intent of a query based on keywords and patterns
 * Helps categorize queries for better context understanding
 * @param query - The search query string
 * @returns String representing the query intent category
 */
function determineQueryIntent(query: string): string {
  const queryLower = query.toLowerCase();

  if (queryLower.includes("count") || queryLower.includes("how many"))
    return "aggregation_count";
  if (queryLower.includes("sum") || queryLower.includes("total"))
    return "aggregation_sum";
  if (queryLower.includes("average") || queryLower.includes("avg"))
    return "aggregation_average";
  if (queryLower.includes("top") || queryLower.includes("highest"))
    return "ranking_top";
  if (queryLower.includes("join") || queryLower.includes("related"))
    return "join_multiple_tables";
  if (queryLower.includes("group") || queryLower.includes("by"))
    return "grouping_analysis";
  if (queryLower.includes("where") || queryLower.includes("filter"))
    return "filtering_data";

  return "simple_select";
}

/**
 * Generates suggested SQL queries based on the search results
 * Provides example queries for common operations on the found schema
 * @param groupedResults - Results grouped by content type
 * @returns Array of suggested SQL query strings
 */
function generateSuggestedQueries(groupedResults: any): string[] {
  const queries: string[] = [];

  // Generate basic SELECT queries for relevant tables
  groupedResults.tables.slice(0, 3).forEach((table: any) => {
    const tableName = table.content?.table_name || table.metadata?.table_name;
    if (tableName) {
      queries.push(`SELECT * FROM ${tableName} LIMIT 10`);
    }
  });

  // Generate JOIN queries for relationships
  groupedResults.relationships.slice(0, 2).forEach((rel: any) => {
    const tableName = rel.content?.table_name || rel.metadata?.table_name;
    const foreignTableName = rel.content?.foreign_table_name;
    const columnName = rel.content?.column_name;
    const foreignColumnName = rel.content?.foreign_column_name;

    if (tableName && foreignTableName && columnName && foreignColumnName) {
      queries.push(
        `SELECT * FROM ${tableName} JOIN ${foreignTableName} ON ${tableName}.${columnName} = ${foreignTableName}.${foreignColumnName} LIMIT 10`
      );
    }
  });

  return queries;
}
