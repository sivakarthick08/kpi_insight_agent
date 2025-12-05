import { dbClient } from "../../databases/db";
import { KPI_ENTRIES_TABLE_NAME } from "../../mastra/lib/conts";
import {
  storeKPI,
  searchKPI,
  getKPIById,
  updateKPI,
  deleteKPI,
  listKPIs,
  KpiEntry,
  KpiCreateParams,
  KpiUpdateParams,
  KpiSearchResult,
} from "../../mastra/tools/kpi-tool";

export interface KpiQueryParams {
  limit: string | number;
  offset: string | number;
  category?: string;
}

export interface KpiSearchParams {
  query: string;
  category?: string;
  maxResults?: number;
}

export interface KpiResult {
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

export interface KpiSearchResultResponse {
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

export class KpiService {
  /**
   * Get KPIs with pagination and optional category filtering
   */
  static async getKpis(
    tenantId: string,
    applicationId: string,
    params: KpiQueryParams
  ): Promise<KpiResult[]> {
    const { limit, offset, category } = params;
    const limitNum =
      typeof limit === "string" ? parseInt(limit || "10", 10) : limit || 10;
    const offsetNum =
      typeof offset === "string" ? parseInt(offset || "0", 10) : offset || 0;

    const result = await listKPIs({
      tenant_id: tenantId,
      application_id: applicationId,
      category,
      limit: limitNum,
      offset: offsetNum,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.result || [];
  }

  /**
   * Get a single KPI by ID
   */
  static async getKpi(
    tenantId: string,
    applicationId: string,
    id: string
  ): Promise<KpiResult | null> {
    const result = await getKPIById({
      kpi_id: id,
      tenant_id: tenantId,
      application_id: applicationId,
    });

    if (result.error) {
      if (result.error.includes("not found")) {
        return null;
      }
      throw new Error(result.error);
    }

    return result.result || null;
  }

  /**
   * Create a new KPI
   */
  static async createKpi(
    tenantId: string,
    applicationId: string,
    params: KpiCreateParams
  ): Promise<string> {
    const result = await storeKPI({
      ...params,
      tenant_id: tenantId,
      application_id: applicationId,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.result?.kpi?.id) {
      throw new Error("Failed to create KPI - no ID returned");
    }

    return result.result.kpi.id;
  }

  /**
   * Update an existing KPI
   */
  static async updateKpi(
    tenantId: string,
    applicationId: string,
    id: string,
    params: KpiUpdateParams
  ): Promise<KpiResult> {
    const result = await updateKPI({
      kpi_id: id,
      tenant_id: tenantId,
      application_id: applicationId,
      ...params,
    });

    if (result.error) {
      if (result.error.includes("not found")) {
        throw new Error("KPI not found");
      }
      throw new Error(result.error);
    }

    if (!result.result?.kpi) {
      throw new Error("Failed to update KPI - no result returned");
    }

    return result.result.kpi;
  }

  /**
   * Delete a KPI by ID
   */
  static async deleteKpi(
    tenantId: string,
    applicationId: string,
    id: string
  ): Promise<boolean> {
    const result = await deleteKPI({
      kpi_id: id,
      tenant_id: tenantId,
      application_id: applicationId,
    });

    if (result.error) {
      if (result.error.includes("not found")) {
        return false;
      }
      throw new Error(result.error);
    }

    return result.result?.deleted || false;
  }

  /**
   * Search KPIs using semantic search
   */
  static async searchKpis(
    tenantId: string,
    applicationId: string,
    params: KpiSearchParams
  ): Promise<KpiSearchResultResponse[]> {
    const { query, category, maxResults = 10 } = params;

    const result = await searchKPI({
      query,
      tenant_id: tenantId,
      application_id: applicationId,
      category,
      maxResults,
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return result.result || [];
  }

  /**
   * Get KPI statistics for a tenant/application
   */
  static async getKpiStats(
    tenantId: string,
    applicationId: string
  ): Promise<{
    total: number;
    by_category: Record<string, number>;
    recent_count: number;
  }> {
    try {
      // Get total count
      const totalResult = await dbClient.executeQuery(
        `SELECT COUNT(*) as total FROM ${KPI_ENTRIES_TABLE_NAME}
         WHERE tenant_id = $1 AND application_id = $2`,
        [tenantId, applicationId]
      );

      const total = parseInt(totalResult[0]?.total || "0", 10);

      // Get count by category
      const categoryResult = await dbClient.executeQuery(
        `SELECT category, COUNT(*) as count FROM ${KPI_ENTRIES_TABLE_NAME}
         WHERE tenant_id = $1 AND application_id = $2 AND category IS NOT NULL
         GROUP BY category`,
        [tenantId, applicationId]
      );

      const by_category: Record<string, number> = {};
      categoryResult.forEach((row: any) => {
        by_category[row.category] = parseInt(row.count, 10);
      });

      // Get recent count (last 30 days)
      const recentResult = await dbClient.executeQuery(
        `SELECT COUNT(*) as recent_count FROM ${KPI_ENTRIES_TABLE_NAME}
         WHERE tenant_id = $1 AND application_id = $2 
         AND created_at >= NOW() - INTERVAL '30 days'`,
        [tenantId, applicationId]
      );

      const recent_count = parseInt(recentResult[0]?.recent_count || "0", 10);

      return {
        total,
        by_category,
        recent_count,
      };
    } catch (error) {
      console.error("❌ Failed to get KPI stats:", error);
      throw new Error("Failed to get KPI statistics");
    }
  }

  /**
   * Get KPIs by category
   */
  static async getKpisByCategory(
    tenantId: string,
    applicationId: string,
    category: string,
    params: { limit: number; offset: number }
  ): Promise<KpiResult[]> {
    return this.getKpis(tenantId, applicationId, {
      ...params,
      category,
    });
  }

  /**
   * Get all categories for a tenant/application
   */
  static async getCategories(
    tenantId: string,
    applicationId: string
  ): Promise<string[]> {
    try {
      const result = await dbClient.executeQuery(
        `SELECT DISTINCT category FROM ${KPI_ENTRIES_TABLE_NAME}
         WHERE tenant_id = $1 AND application_id = $2 AND category IS NOT NULL
         ORDER BY category`,
        [tenantId, applicationId]
      );

      return result.map((row: any) => row.category);
    } catch (error) {
      console.error("❌ Failed to get categories:", error);
      throw new Error("Failed to get KPI categories");
    }
  }

  /**
   * Validate KPI data before storage
   */
  static validateKpiData(data: KpiCreateParams): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data.title || data.title.trim().length === 0) {
      errors.push("Title is required");
    }

    if (!data.description || data.description.trim().length === 0) {
      errors.push("Description is required");
    }

    if (!data.sql_query || data.sql_query.trim().length === 0) {
      errors.push("SQL query is required");
    }

    if (!data.formula || data.formula.trim().length === 0) {
      errors.push("Formula is required");
    }

    if (!Array.isArray(data.tables_used)) {
      errors.push("Tables used must be an array");
    }

    if (!Array.isArray(data.columns_used)) {
      errors.push("Columns used must be an array");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
