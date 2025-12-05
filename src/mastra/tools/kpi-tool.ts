import {
  KPI_ENTRIES_TABLE_NAME,
  KPI_ENTRIES_VECTORS_TABLE_NAME,
} from "../lib/conts";
import { dbClient } from "../../databases/db";
import { getDefaultPgVector } from "../lib/pgVector";
import { generateEmbedding } from "../lib/generateEmbedding";
import crypto from "crypto";

/**
 * ===========================================
 * KPI STORAGE TOOL
 * ===========================================
 *
 * This tool manages the storage and retrieval of Key Performance Indicators (KPIs)
 * in the DeepSpot system. It provides persistent storage for business metrics,
 * their SQL formulas, and semantic search capabilities.
 *
 * Key Functions:
 * 1. KPI Storage: Persists KPI definitions with vector embeddings
 * 2. KPI Retrieval: Retrieves stored KPIs for analysis and SQL generation
 * 3. KPI Management: Supports CRUD operations for KPIs
 * 4. Semantic Search: Vector-based search for relevant KPIs
 * 5. Multi-tenant Support: Isolates KPIs by tenant and application
 *
 * KPI Structure:
 * - title: Human-readable KPI name
 * - description: Business context and meaning
 * - sql_query: SQL formula to calculate the KPI
 * - formula: Mathematical formula if applicable
 * - tables_used: Array of table names
 * - columns_used: Array of column references
 * - category: Business category (revenue, operational, customer, etc.)
 *
 * Process Flow:
 * 1. Store KPIs with metadata and vector embeddings
 * 2. Retrieve KPIs by ID, tenant, or application
 * 3. Search KPIs semantically using vector similarity
 * 4. Update existing KPIs with new data
 * 5. Delete KPIs when no longer needed
 */

/**
 * Interface defining the structure for KPI entries
 */
export interface KpiEntry {
  id: string;
  title: string;
  description: string;
  sql_query: string;
  formula?: string;
  tables_used: string[];
  columns_used: string[];
  category?: string;
  tenant_id: string;
  application_id: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Interface for creating new KPIs
 */
export interface KpiCreateParams {
  title: string;
  description: string;
  sql_query: string;
  formula?: string;
  tables_used: string[];
  columns_used: string[];
  category?: string;
  created_by?: string;
}

/**
 * Interface for updating existing KPIs
 */
export interface KpiUpdateParams extends Partial<KpiCreateParams> {}

/**
 * Interface for KPI search results
 */
export interface KpiSearchResult {
  id: string;
  title: string;
  description: string;
  sql_query: string;
  formula?: string;
  tables_used: string[];
  columns_used: string[];
  category?: string;
  similarity_score?: number;
  tenant_id: string;
  application_id: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// =========================
// KPI CRUD Operations
// =========================

/**
 * Stores a new KPI in the database with metadata and vector embedding
 * @param params - Object containing KPI data and metadata
 * @returns Promise with storage result or error information
 */
export const storeKPI = async ({
  title,
  description,
  sql_query,
  formula,
  tables_used,
  columns_used,
  category,
  tenant_id,
  application_id,
  created_by,
}: KpiCreateParams & {
  tenant_id: string;
  application_id: string;
}): Promise<{
  result?: { stored: boolean; kpi: KpiEntry };
  error?: string;
}> => {
  try {
    // Insert KPI into the database
    const queryResult = await dbClient.executeQuery(
      `INSERT INTO ${KPI_ENTRIES_TABLE_NAME}
       (title, description, sql_query, formula, tables_used, columns_used, category, tenant_id, application_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        title,
        description,
        sql_query,
        formula || null,
        JSON.stringify(tables_used),
        JSON.stringify(columns_used),
        category || null,
        tenant_id,
        application_id,
        created_by || null,
      ]
    );

    if (!queryResult || queryResult.length === 0) {
      return {
        error: "Failed to store KPI - database insertion returned no results",
      };
    }

    const kpi = queryResult[0];

    // Generate vector embedding for semantic search
    const embeddingText = `
      title: "${title}"
      description: "${description}"
      sql_query: "${sql_query}"
      formula: "${formula || ""}"
      category: "${category || ""}"
      tables_used: ${JSON.stringify(tables_used)}
      columns_used: ${JSON.stringify(columns_used)}
    `;

    const { embedding, error: embeddingError } =
      await generateEmbedding(embeddingText);
    if (embeddingError) {
      console.warn("Failed to generate embedding for KPI:", embeddingError);
      // Continue without embedding - KPI is still stored
    } else {
      // Store vector embedding
      const store = getDefaultPgVector();
      await store?.upsert({
        indexName: KPI_ENTRIES_VECTORS_TABLE_NAME,
        vectors: [embedding || []],
        ids: [crypto.randomUUID()],
        metadata: [
          {
            kpi_id: kpi.id,
            tenant_id,
            application_id,
            title,
            description,
            sql_query,
            formula: formula || "",
            category: category || "",
            tables_used: JSON.stringify(tables_used),
            columns_used: JSON.stringify(columns_used),
            created_by: created_by || "",
          },
        ],
      });
    }

    return {
      result: {
        stored: true,
        kpi,
      },
    };
  } catch (error) {
    console.error("❌ Failed to store KPI:", error);
    return {
      error: "Failed to store KPI",
    };
  }
};

/**
 * Searches for KPIs using vector similarity
 * @param params - Object containing search parameters
 * @returns Promise with search results or error information
 */
export const searchKPI = async ({
  query,
  tenant_id,
  application_id,
  category,
  maxResults = 10,
}: {
  query: string;
  tenant_id: string;
  application_id: string;
  category?: string;
  maxResults?: number;
}): Promise<{
  result?: KpiSearchResult[];
  error?: string;
}> => {
  try {
    const store = getDefaultPgVector();

    const { embedding, error: embeddingError } = await generateEmbedding(query);
    if (embeddingError) {
      return {
        error: embeddingError,
      };
    }

    // Build filter conditions
    let filterConditions: any = {
      tenant_id,
      application_id,
    };

    if (category) {
      filterConditions.category = category;
    }

    const results = await store?.query({
      indexName: KPI_ENTRIES_VECTORS_TABLE_NAME,
      queryVector: embedding || [],
      topK: maxResults,
      filter: filterConditions,
    });

    if (!results || results.length === 0) {
      return {
        result: [],
      };
    }

    // Get full KPI details from the main table
    const kpiIds = results.map((r: any) => r.metadata.kpi_id);
    const kpiDetails = await dbClient.executeQuery(
      `SELECT * FROM ${KPI_ENTRIES_TABLE_NAME} WHERE id = ANY($1)`,
      [kpiIds]
    );

    // Combine vector search results with KPI details
    const searchResults: KpiSearchResult[] = results.map((result: any) => {
      const kpiDetail = kpiDetails.find(
        (k: any) => k.id === result.metadata.kpi_id
      );
      return {
        id: result.metadata.kpi_id,
        title: result.metadata.title,
        description: result.metadata.description,
        sql_query: result.metadata.sql_query,
        formula: result.metadata.formula || undefined,
        tables_used: JSON.parse(result.metadata.tables_used),
        columns_used: JSON.parse(result.metadata.columns_used),
        category: result.metadata.category || undefined,
        similarity_score: result.score,
        tenant_id: result.metadata.tenant_id,
        application_id: result.metadata.application_id,
        created_by: result.metadata.created_by || undefined,
        created_at: kpiDetail?.created_at || "",
        updated_at: kpiDetail?.updated_at || "",
      };
    });

    return {
      result: searchResults,
    };
  } catch (error) {
    console.error("❌ Failed to search KPIs:", error);
    return {
      error: "Failed to search KPIs",
    };
  }
};

/**
 * Retrieves a KPI by ID with tenant and application isolation
 * @param params - Object containing KPI ID and tenant/application identifiers
 * @returns Promise with KPI result or error information
 */
export const getKPIById = async ({
  kpi_id,
  tenant_id,
  application_id,
}: {
  kpi_id: string;
  tenant_id: string;
  application_id: string;
}): Promise<{
  result?: KpiEntry;
  error?: string;
}> => {
  try {
    const result = await dbClient.executeQuery(
      `SELECT * FROM ${KPI_ENTRIES_TABLE_NAME}
       WHERE id = $1 AND tenant_id = $2 AND application_id = $3`,
      [kpi_id, tenant_id, application_id]
    );

    if (!result || result.length === 0) {
      return {
        error: "KPI not found or access denied",
      };
    }

    const kpi = result[0];
    return {
      result: {
        ...kpi,
        tables_used: kpi.tables_used,
        columns_used: kpi.columns_used,
      },
    };
  } catch (error) {
    console.error("❌ Failed to get KPI:", error);
    return {
      error: "Failed to get KPI",
    };
  }
};

/**
 * Updates an existing KPI with new data and metadata
 * @param params - Object containing KPI ID, new data, and metadata
 * @returns Promise with update result or error information
 */
export const updateKPI = async ({
  kpi_id,
  tenant_id,
  application_id,
  ...updateData
}: {
  kpi_id: string;
  tenant_id: string;
  application_id: string;
} & KpiUpdateParams): Promise<{
  result?: { updated: boolean; kpi: KpiEntry };
  error?: string;
}> => {
  try {
    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (updateData.title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      updateValues.push(updateData.title);
    }
    if (updateData.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(updateData.description);
    }
    if (updateData.sql_query !== undefined) {
      updateFields.push(`sql_query = $${paramIndex++}`);
      updateValues.push(updateData.sql_query);
    }
    if (updateData.formula !== undefined) {
      updateFields.push(`formula = $${paramIndex++}`);
      updateValues.push(updateData.formula);
    }
    if (updateData.tables_used !== undefined) {
      updateFields.push(`tables_used = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updateData.tables_used));
    }
    if (updateData.columns_used !== undefined) {
      updateFields.push(`columns_used = $${paramIndex++}`);
      updateValues.push(JSON.stringify(updateData.columns_used));
    }
    if (updateData.category !== undefined) {
      updateFields.push(`category = $${paramIndex++}`);
      updateValues.push(updateData.category);
    }

    if (updateFields.length === 0) {
      return {
        error: "No fields to update",
      };
    }

    // Add WHERE clause parameters
    updateValues.push(kpi_id, tenant_id, application_id);

    const query = `
      UPDATE ${KPI_ENTRIES_TABLE_NAME}
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++} AND application_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await dbClient.executeQuery(query, updateValues);

    if (!result || result.length === 0) {
      return {
        error: "KPI not found or access denied",
      };
    }

    const kpi = result[0];

    // Update vector embedding if any text fields changed
    if (
      updateData.title ||
      updateData.description ||
      updateData.sql_query ||
      updateData.formula
    ) {
      const embeddingText = `
        title: "${kpi.title}"
        description: "${kpi.description}"
        sql_query: "${kpi.sql_query}"
        formula: "${kpi.formula || ""}"
        category: "${kpi.category || ""}"
        tables_used: ${kpi.tables_used}
        columns_used: ${kpi.columns_used}
      `;

      const { embedding, error: embeddingError } =
        await generateEmbedding(embeddingText);
      if (!embeddingError && embedding) {
        const store = getDefaultPgVector();
        await store?.upsert({
          indexName: KPI_ENTRIES_VECTORS_TABLE_NAME,
          vectors: [embedding],
          ids: [crypto.randomUUID()],
          metadata: [
            {
              kpi_id: kpi.id,
              tenant_id,
              application_id,
              title: kpi.title,
              description: kpi.description,
              sql_query: kpi.sql_query,
              formula: kpi.formula || "",
              category: kpi.category || "",
              tables_used: kpi.tables_used,
              columns_used: kpi.columns_used,
              created_by: kpi.created_by || "",
            },
          ],
        });
      }
    }

    return {
      result: {
        updated: true,
        kpi: {
          ...kpi,
          tables_used: kpi.tables_used,
          columns_used: kpi.columns_used,
        },
      },
    };
  } catch (error) {
    console.error("❌ Failed to update KPI:", error);
    return {
      error: "Failed to update KPI",
    };
  }
};

/**
 * Deletes a KPI from the database by ID with tenant and application isolation
 * @param params - Object containing KPI ID and tenant/application identifiers
 * @returns Promise with deletion result or error information
 */
export const deleteKPI = async ({
  kpi_id,
  tenant_id,
  application_id,
}: {
  kpi_id: string;
  tenant_id: string;
  application_id: string;
}): Promise<{
  result?: { deleted: boolean };
  error?: string;
}> => {
  try {
    // Delete KPI from main table
    const queryResult = await dbClient.executeQuery(
      `DELETE FROM ${KPI_ENTRIES_TABLE_NAME}
       WHERE id = $1 AND tenant_id = $2 AND application_id = $3
       RETURNING id`,
      [kpi_id, tenant_id, application_id]
    );

    if (!queryResult || queryResult.length === 0) {
      return {
        error: "KPI not found or access denied",
      };
    }

    // Note: Vector embeddings will be cleaned up by the vector store's garbage collection
    // or we could implement explicit cleanup if needed

    return {
      result: {
        deleted: true,
      },
    };
  } catch (error) {
    console.error("❌ Failed to delete KPI:", error);
    return {
      error: "Failed to delete KPI",
    };
  }
};

/**
 * Lists KPIs with pagination and optional filtering
 * @param params - Object containing query parameters
 * @returns Promise with KPI list or error information
 */
export const listKPIs = async ({
  tenant_id,
  application_id,
  category,
  limit = 10,
  offset = 0,
}: {
  tenant_id: string;
  application_id: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  result?: KpiEntry[];
  error?: string;
}> => {
  try {
    let query = `
      SELECT * FROM ${KPI_ENTRIES_TABLE_NAME}
      WHERE tenant_id = $1 AND application_id = $2
    `;
    const queryParams: any[] = [tenant_id, application_id];

    if (category) {
      query += ` AND category = $3`;
      queryParams.push(category);
    }

    query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const result = await dbClient.executeQuery(query, queryParams);

    const kpis = result.map((kpi: any) => ({
      ...kpi,
      tables_used: kpi.tables_used,
      columns_used: kpi.columns_used,
    }));

    return {
      result: kpis,
    };
  } catch (error) {
    console.error("❌ Failed to list KPIs:", error);
    return {
      error: "Failed to list KPIs",
    };
  }
};
