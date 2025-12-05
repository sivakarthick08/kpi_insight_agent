import { UpsertVectorParams } from "@mastra/core";
import { generateChunksAndEmbed } from "../../mastra/lib/generateEmbedding";
import { SEMANTIC_LAYER_ENTRIES_TABLE_NAME } from "../../mastra/lib/conts";

/**
 * Semantic Layer Embedding Management Utilities
 *
 * This module provides utilities for managing semantic layer embeddings with robust
 * retry logic and delete-then-upsert functionality to handle duplicate entries.
 *
 * Key Features:
 * - Delete-then-upsert strategy for handling existing embeddings
 * - Batch processing for large datasets
 * - Comprehensive error handling and retry logic
 * - Detailed logging for monitoring and debugging
 *
 * Retry Logic:
 * When generating semantic layer embeddings for a table that already has existing
 * embeddings, the system will:
 * 1. Check for existing embeddings for the table
 * 2. Delete all existing embeddings for that table (batch mode for efficiency)
 * 3. Generate new embeddings with retry logic
 * 4. Store the new embeddings with retry logic
 *
 * This ensures fresh, up-to-date embeddings while maintaining data consistency.
 */
export async function prepareEmbeddingPayloads(
  schema: string,
  table: any,
  tenantId: string,
  applicationId: string,
  client: any,
  categories: string[],
  databaseType: string,
  connectionString: string,
  catalogName?: string,
  // databaseName?: string
) {
  const jsonPayloads: Array<{
    payload: any;
    type: "table" | "field" | "relationship" | "metric";
  }> = [];

  let yamlPayload = `
  ${catalogName ? `catalog:` + catalogName : null}
  schema: ${schema}
  name: ${table.table_name}
  database_type: ${databaseType}
  connection_string: ${connectionString}
  type: table
  description: ${table.description}
  categories: ${categories.join(",")}
  columns:
  `;

  // Table payload
  jsonPayloads.push({
    payload: {
      content_type: "table",
      tenant_id: tenantId,
      application_id: applicationId,
      schema_name: schema,
      table_name: table.table_name,
      table_description: table.description,
      categories: categories,
      database_type: databaseType,
      connection_string: connectionString,
      ...(catalogName && { catalog_name: catalogName })
    },
    type: "table",
  });

  // Field payloads
  if (table.fields?.length) {
    // Batch fetch sample data for non-JSON fields to reduce per-field awaits
    const nonJsonFields = table.fields.filter((f: any) => f.type !== "json");
    const sampleDataByFieldName: Record<string, any[]> = {};

    if (nonJsonFields.length > 0 && client?.getSampleData) {
      const BATCH_SIZE = 10;
      for (let i = 0; i < nonJsonFields.length; i += BATCH_SIZE) {
        const batch = nonJsonFields.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map((field: any) =>
            client.getSampleData(
              table.table_name,
              field.name,
              field.type,
              3,
              schema,
              catalogName
            )
          )
        );

        batch.forEach((field: any, idx: number) => {
          const raw = batchResults[idx] || [];
          sampleDataByFieldName[field.name] = Array.isArray(raw)
            ? raw.map((obj: any) => Object.values(obj)[0])
            : [];
        });
      }
    }

    for (const field of table.fields) {
      const sampleData =
        field.type === "json"
          ? []
          : sampleDataByFieldName[field.name] || [];

      yamlPayload += `
      - name: ${field.name}
        description: ${field.description}
        type: ${field.type}
        sample_data: ${sampleData}
        `;

      jsonPayloads.push({
        payload: {
          content_type: "field",
          application_id: applicationId,
          tenant_id: tenantId,
          schema_name: schema,
          table_name: table.table_name,
          field_name: field.name,
          field_description: field.description,
          field_type: field.type,
          sample_data: sampleData,
          categories: categories,
          ...(catalogName && { catalog_name: catalogName })
        },
        type: "field",
      });
    }
  }

  yamlPayload += `
  relationships:
  `;

  // Relationship payloads
  if (table.relationships?.length) {
    for (const relationship of table.relationships) {
      yamlPayload += `
      - from_table: ${relationship.from_table}
        to_table: ${relationship.to_table}
        from_column: ${relationship.from_column}
        to_column: ${relationship.to_column}
        description: ${relationship.description}
      `;

      jsonPayloads.push({
        payload: {
          content_type: "relationship",
          application_id: applicationId,
          tenant_id: tenantId,
          from_table: relationship.from_table,
          to_table: relationship.to_table,
          from_column: relationship.from_column,
          to_column: relationship.to_column,
          relationship_description: relationship.description,
        },
        type: "relationship",
      });
    }
  }

  yamlPayload += `
  metrics:
  `;

  // Metric payloads
  if (table.metrics?.length) {
    for (const metric of table.metrics) {
      yamlPayload += `
      - name: ${metric.name}
        definition: ${metric.definition}
        description: ${metric.description}
      `;

      jsonPayloads.push({
        payload: {
          content_type: "metric",
          application_id: applicationId,
          tenant_id: tenantId,
          metric_name: metric.name,
          metric_definition: metric.definition,
          metric_description: metric.description,
        },
        type: "metric",
      });
    }
  }

  return { jsonPayloads, yamlPayload };
}

// New function to delete existing embeddings for a table and its fields
export async function deleteExistingEmbeddings(
  store: any,
  tableName: string,
  tenantId: string,
  applicationId: string
) {
  try {
    console.log(`🗑️ Checking for existing embeddings for table: ${tableName}`);

    // Query to find existing entries for this table
    const existingEntries = await store?.query({
      indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
      queryVector: new Array(1536).fill(0), // Dummy vector for metadata-only query
      topK: 1000, // Large number to get all entries
      filter: {
        tenant_id: { $eq: tenantId },
        application_id: { $eq: applicationId },
        table_name: { $eq: tableName },
      },
    });

    if (!existingEntries || existingEntries.length === 0) {
      console.log(`✅ No existing embeddings found for table: ${tableName}`);
      return { deletedCount: 0 };
    }

    console.log(
      `🗑️ Found ${existingEntries.length} existing entries for table: ${tableName}, deleting...`
    );

    // Delete each existing entry
    let deletedCount = 0;
    for (const entry of existingEntries) {
      try {
        await store?.deleteVector({
          indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
          id: entry.id,
        });
        deletedCount++;
      } catch (error) {
        console.error(`❌ Failed to delete entry ${entry.id}:`, error);
      }
    }

    console.log(
      `✅ Successfully deleted ${deletedCount} existing entries for table: ${tableName}`
    );
    return { deletedCount };
  } catch (error) {
    console.error(
      `❌ Error deleting existing embeddings for table ${tableName}:`,
      error
    );
    return { deletedCount: 0, error };
  }
}

// Helper function to check if embeddings exist for a table
export async function checkExistingEmbeddings(
  store: any,
  tableName: string,
  tenantId: string,
  applicationId: string
) {
  try {
    const existingEntries = await store?.query({
      indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
      queryVector: new Array(1536).fill(0), // Dummy vector for metadata-only query
      topK: 10, // Just check if any exist
      filter: {
        tenant_id: { $eq: tenantId },
        application_id: { $eq: applicationId },
        table_name: { $eq: tableName },
      },
    });

    const exists = existingEntries && existingEntries.length > 0;
    console.log(
      `🔍 Table '${tableName}' has existing embeddings: ${exists ? "Yes" : "No"} (${existingEntries?.length || 0} entries)`
    );

    return {
      exists,
      count: existingEntries?.length || 0,
      entries: existingEntries || [],
    };
  } catch (error) {
    console.error(
      `❌ Error checking existing embeddings for table ${tableName}:`,
      error
    );
    return { exists: false, count: 0, entries: [], error };
  }
}

// More efficient batch deletion function for large datasets
export async function deleteExistingEmbeddingsBatch(
  store: any,
  tableName: string,
  tenantId: string,
  applicationId: string,
  batchSize: number = 100
) {
  try {
    console.log(
      `🗑️ Checking for existing embeddings for table: ${tableName} (batch mode)`
    );

    let totalDeleted = 0;
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      // Query in batches to avoid memory issues
      const existingEntries = await store?.query({
        indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
        queryVector: new Array(1536).fill(0), // Dummy vector for metadata-only query
        topK: batchSize,
        filter: {
          tenant_id: { $eq: tenantId },
          application_id: { $eq: applicationId },
          table_name: { $eq: tableName },
        },
      });

      if (!existingEntries || existingEntries.length === 0) {
        hasMore = false;
        break;
      }

      console.log(
        `🗑️ Deleting batch of ${existingEntries.length} entries for table: ${tableName} (offset: ${offset})`
      );

      // Delete batch of entries
      const deletePromises = existingEntries.map(async (entry: any) => {
        try {
          await store?.deleteVector({
            indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
            id: entry.id,
          });
          return true;
        } catch (error) {
          console.error(`❌ Failed to delete entry ${entry.id}:`, error);
          return false;
        }
      });

      const deleteResults = await Promise.allSettled(deletePromises);
      const successfulDeletes = deleteResults.filter(
        (result) => result.status === "fulfilled" && result.value === true
      ).length;

      totalDeleted += successfulDeletes;
      offset += existingEntries.length;

      // If we got fewer results than batchSize, we've reached the end
      if (existingEntries.length < batchSize) {
        hasMore = false;
      }

      // Small delay to prevent overwhelming the database
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(
      `✅ Successfully deleted ${totalDeleted} existing entries for table: ${tableName} (batch mode)`
    );
    return { deletedCount: totalDeleted };
  } catch (error) {
    console.error(
      `❌ Error deleting existing embeddings for table ${tableName} (batch mode):`,
      error
    );
    return { deletedCount: 0, error };
  }
}

export async function generateEmbeddingsWithRetry(
  yamlPayload: string,
  jsonPayloads: any,
  databaseType: string,
  connectionString: string
): Promise<UpsertVectorParams> {
  let embeddingEntries: UpsertVectorParams;

  const retryEmbeddingGeneration = async (
    payload: string,
    databaseType: string,
    connectionString: string,
    maxRetries = 3
  ): Promise<UpsertVectorParams | null> => {
    let result: UpsertVectorParams | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { embedding, error } = await generateChunksAndEmbed(payload);

        if (error || !embedding?.length) {
          throw new Error(error || "No embeddings or chunks generated");
        }

        const tablePayload = jsonPayloads.find(
          (p: any) => p.type === "table"
        )?.payload;

        const fieldsPayload = jsonPayloads.filter(
          (p: any) => p.type === "field"
        );

        result = {
          indexName: SEMANTIC_LAYER_ENTRIES_TABLE_NAME,
          vectors: [embedding],
          ids: [crypto.randomUUID()],
          metadata: [
            {
              content_type: "table",
              tenant_id: tablePayload.tenant_id,
              application_id: tablePayload.application_id,
              schema_name: tablePayload.schema_name,
              ...(tablePayload.catalog_name && { catalog_name: tablePayload.catalog_name }),
              table_name: tablePayload.table_name,
              database_type: databaseType,
              connection_string: connectionString,
              fields: fieldsPayload.map(({ payload }: any) => ({
                field_name: payload.field_name,
                field_description: payload.field_description,
                field_type: payload.field_type,
                sample_data: payload.sample_data,
              })),
              table_description: tablePayload.table_description,
              categories: tablePayload.categories,
              searchable_text: payload,
              chunk_text: payload,
              search_keywords: extractKeywordsFromYaml(yamlPayload),
            },
          ],
        };
      } catch (error) {
        result = null;
        console.error(`❌ Attempt ${attempt}/${maxRetries}:`, error);
        if (attempt === maxRetries) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
    return result;
  };

  embeddingEntries = (await retryEmbeddingGeneration(
    yamlPayload,
    databaseType,
    connectionString
  )) as UpsertVectorParams;

  return embeddingEntries;
}

export function extractKeywordsFromYaml(yaml: string): string[] {
  // Extract field names, types, and descriptions as keywords
  const keywords = [];
  const lines = yaml.split("\n");

  for (const line of lines) {
    if (
      line.includes("name:") ||
      line.includes("type:") ||
      line.includes("description:")
    ) {
      const value = line.split(":")[1]?.trim();
      if (value) keywords.push(value);
    }
  }

  return keywords;
}

export async function storeEmbeddingsWithRetry(
  store: any,
  embeddingEntries: UpsertVectorParams,
  tableName?: string,
  tenantId?: string,
  applicationId?: string,
  databaseType?: string,
  connectionString?: string
) {
  let deletedEntries = 0;

  // If tableName, tenantId, and applicationId are provided, delete existing entries first
  if (tableName && tenantId && applicationId) {
    console.log(
      `🔄 Deleting existing embeddings before upserting new ones for table: ${tableName}`
    );
    try {
      // Use batch deletion for better performance with large datasets
      const deleteResult = await deleteExistingEmbeddingsBatch(
        store,
        tableName,
        tenantId,
        applicationId,
        100
      );
      deletedEntries = deleteResult.deletedCount || 0;
      if (deleteResult.error) {
        console.warn(
          `⚠️ Warning: Failed to delete existing entries: ${deleteResult.error}`
        );
      }
    } catch (error) {
      console.error(
        `❌ Error during delete phase for table ${tableName}:`,
        error
      );
      // Continue with upsert even if delete fails - this ensures we don't lose new data
      console.log(
        `🔄 Continuing with upsert despite delete errors for table: ${tableName}`
      );
    }
  }

  const retryStorageOperation = async (
    entry: UpsertVectorParams,
    maxRetries = 3
  ) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await store?.upsert(entry);
        return true;
      } catch (error) {
        console.error(
          `❌ Storage attempt ${attempt}/${maxRetries} failed:`,
          error
        );
        if (attempt === maxRetries) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
    return false;
  };

  const success = await retryStorageOperation(embeddingEntries);
  if (success) {
    return { success: true };
  } else {
    return { success: false, error: "Max retries exceeded" };
  }
}
