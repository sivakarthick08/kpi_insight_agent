import {
  ARTIFACT_ENTRIES_TABLE_NAME,
  ARTIFACT_ENTRIES_VECTORS_TABLE_NAME,
} from "../lib/conts";
import { dbClient } from "../../databases/db";
import { getDefaultPgVector } from "../lib/pgVector";
import { initializeStorage } from "./semantic-layer-storage-tool";
import { generateEmbedding } from "../lib/generateEmbedding";

/**
 * ===========================================
 * ARTIFACT STORAGE TOOL
 * ===========================================
 *
 * This tool manages the storage and retrieval of query results and other artifacts
 * in the DeepSpot system. It provides persistent storage for SQL query results,
 * charts, and other generated content.
 *
 * Key Functions:
 * 1. Artifact Storage: Persists query results and metadata to the database
 * 2. Artifact Retrieval: Retrieves stored artifacts for display and analysis
 * 3. Artifact Management: Supports CRUD operations for artifacts
 * 4. Metadata Tracking: Maintains comprehensive metadata for each artifact
 * 5. Multi-tenant Support: Isolates artifacts by tenant and application
 *
 * Artifact Types:
 * - "table": SQL query results in tabular format
 * - "chart": Chart configurations and data
 * - "document": Text-based documents and reports
 * - "image": Image files and visual content
 * - "audio": Audio files and recordings
 * - "video": Video files and recordings
 * - "other": Miscellaneous file types
 *
 * Process Flow:
 * 1. Store artifacts with metadata and structured data
 * 2. Retrieve artifacts by ID, tenant, or application
 * 3. Update existing artifacts with new data
 * 4. Delete artifacts when no longer needed
 */

/**
 * Interface defining the metadata structure for artifact entries
 */
export interface ArtifactEntryMetadata {
  userQuery: string;
  tenantId: string;
  applicationId: string;
  threadId: string;
  messageId: string;
  artifactId: string;
  artifactTitle: string;
  headers: string[];
  data: string[][];
  artifactType: string; // "query", "chart", "table", "document", "image", "audio", "video", "other"
  artifactCreatedAt: string;
  artifactUpdatedAt: string;
}

// =========================
// Artifact CRUD Operations
// =========================

export const searchArtifact = async ({
  tenantId,
  userQuery,
  maxResults = 1,
  applicationId,
}: {
  tenantId: string;
  userQuery: string;
  maxResults?: number;
  applicationId: string;
}) => {
  try {
    const store = getDefaultPgVector();

    const { embedding, error } = await generateEmbedding(userQuery);
    if (error) {
      return {
        result: undefined,
        error: error,
      };
    }
    const results = await store?.query({
      indexName: ARTIFACT_ENTRIES_VECTORS_TABLE_NAME,
      queryVector: embedding || [],
      topK: maxResults,
      filter: {
        tenant_id: tenantId,
        application_id: applicationId,
      },
    });
    if (results && results.length > 0) {
      return {
        result: results,
        error: undefined,
      };
    }
    return {
      result: undefined,
      error: "No results found",
    };
  } catch (error) {
    console.error("❌ Failed to search artifact:", error);
    return {
      result: undefined,
      error: error,
    };
  }
};

/**
 * Stores a new artifact in the database with metadata and structured data
 * @param params - Object containing artifact data and metadata
 * @returns Promise with storage result or error information
 */
export const storeArtifact = async ({
  artifactTitle,
  userQuery,
  sqlQuery,
  artifactType,
  headers,
  chartType,
  chartXAxis,
  chartYAxis,
  data,
  tenantId,
  applicationId,
  threadId,
  messageId,
}: {
  artifactTitle: string;
  userQuery: string;
  sqlQuery: string;
  artifactType: string;
  chartType: string;
  chartXAxis: string;
  chartYAxis: string[];
  headers: string[];
  data: string[][];
  tenantId: string;
  applicationId: string;
  threadId: string;
  messageId: string;
}) => {
  try {
    // Insert artifact into the database with all metadata
    const queryResult = await dbClient.executeQuery(
      `INSERT INTO 
      ${ARTIFACT_ENTRIES_TABLE_NAME}
      (title, user_query, sql_query, artifact_type, headers, data, tenant_id, application_id, thread_id, message_id, chart_type, chart_x_axis, chart_y_axis) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, title`,
      [
        artifactTitle,
        userQuery,
        sqlQuery,
        artifactType,
        JSON.stringify(headers),
        JSON.stringify(data),
        tenantId,
        applicationId,
        threadId,
        messageId,
        chartType,
        chartXAxis,
        JSON.stringify(chartYAxis),
      ]
    );
    

    const store = getDefaultPgVector();

    const { embedding, error } = await generateEmbedding(`
      title: "${artifactTitle}"
      user_query: "${userQuery}"
      sql_query: "${sqlQuery}"
      artifact_type: "${artifactType}"
      headers: ${JSON.stringify(headers, null, 2)}
      chart_type: "${chartType}"
      chart_x_axis: "${chartXAxis}"
      chart_y_axis: ${JSON.stringify(chartYAxis, null, 2)}
    `);
    if (error) {
      return {
        result: undefined,
        error: error,
      };
    }

    await store?.upsert({
      indexName: ARTIFACT_ENTRIES_VECTORS_TABLE_NAME,
      vectors: [embedding || []],
      ids: [crypto.randomUUID()],
      metadata: [
        {
          tenant_id: tenantId,
          user_query: userQuery,
          sql_query: sqlQuery,
          application_id: applicationId,
          thread_id: threadId,
          message_id: messageId,
          artifact_title: artifactTitle,
          headers: JSON.stringify(headers),
          artifact_type: artifactType,
          chart_type: chartType,
          chart_x_axis: chartXAxis,
          chart_y_axis: JSON.stringify(chartYAxis),
          artifact_id: queryResult[0].id,
        },
      ],
    });

    // Validate storage success
    if (!queryResult || queryResult.length === 0) {
      return {
        result: undefined,
        usage: undefined,
        error:
          "Failed to store artifact - database insertion returned no results",
      };
    }

    // Return successful storage result
    return {
      result: {
        stored: true,
        artifact: queryResult[0],
      },
      error: undefined,
    };
  } catch (error) {
    console.error("❌ Failed to store artifact:", error);
    return {
      result: undefined,
      usage: undefined,
      error: "Failed to store artifact",
      stored: false,
    };
  }
};

/**
 * Deletes an artifact from the database by ID with tenant and application isolation
 * @param params - Object containing artifact ID and tenant/application identifiers
 * @returns Promise with deletion result or error information
 */
export const deleteArtifact = async ({
  artifactId,
  tenantId,
  applicationId,
}: {
  artifactId: string;
  tenantId: string;
  applicationId: string;
}) => {
  // Delete artifact with tenant and application isolation for security
  const queryResult = await dbClient.executeQuery(
    `DELETE FROM ${ARTIFACT_ENTRIES_TABLE_NAME} WHERE id = $1 AND tenant_id = $2 AND application_id = $3 RETURNING id`,
    [artifactId, tenantId, applicationId]
  );

  // Validate deletion success
  if (!queryResult || queryResult.length === 0) {
    return {
      result: undefined,
      usage: undefined,
      error: "Failed to delete artifact - artifact not found or access denied",
    };
  }

  // Return successful deletion result
  return {
    result: {
      deleted: true,
    },
    error: undefined,
    usage: undefined,
  };
};

/**
 * Updates an existing artifact with new data and metadata
 * Note: This implementation deletes and recreates the artifact for simplicity
 * @param params - Object containing artifact ID, new data, and metadata
 * @returns Promise with update result or error information
 */
export const updateArtifact = async ({
  tenantId,
  artifactId,
  userQuery,
  sqlQuery,
  artifactType,
  headers,
  data,
  artifactTitle,
  applicationId,
}: {
  tenantId: string;
  artifactId: string;
  userQuery: string;
  sqlQuery: string;
  artifactType: string;
  headers: string[];
  data: string[][];
  artifactTitle: string;
  applicationId: string;
}) => {
  // Delete the existing artifact first
  await deleteArtifact({ artifactId, tenantId, applicationId });

  // Update the artifact with new data
  const queryResult = await dbClient.executeQuery(
    `UPDATE ${ARTIFACT_ENTRIES_TABLE_NAME} SET title = $1, user_query = $2, sql_query = $3, artifact_type = $4, headers = $5, data = $6 WHERE id = $7 AND tenant_id = $8 AND application_id = $9`,
    [
      artifactTitle,
      userQuery,
      sqlQuery,
      artifactType,
      JSON.stringify(headers),
      JSON.stringify(data),
      artifactId,
      tenantId,
      applicationId,
    ]
  );

  // Validate update success
  if (!queryResult || queryResult.length === 0) {
    return {
      result: undefined,
      usage: undefined,
      error: "Failed to update artifact - update operation returned no results",
    };
  }

  // Return successful update result
  return {
    result: {
      updated: true,
      artifact: queryResult,
    },
    error: undefined,
  };
};
