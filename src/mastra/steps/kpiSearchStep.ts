import { createStep } from "@mastra/core";
import { z } from "zod";
import { searchKPI } from "../tools/kpi-tool";

/**
 * ===========================================
 * KPI SEARCH STEP
 * ===========================================
 *
 * This workflow step searches for relevant Key Performance Indicators (KPIs)
 * based on the expanded user query. It provides business context and pre-validated
 * SQL formulas that can be used in subsequent SQL generation steps.
 *
 * Key Features:
 * 1. Semantic Search: Uses vector embeddings to find relevant KPIs
 * 2. Business Context: Provides KPI definitions and business meaning
 * 3. SQL Formulas: Returns pre-validated SQL queries for calculations
 * 4. Multi-tenant Support: Isolates results by tenant and application
 * 5. Similarity Scoring: Ranks results by relevance to the query
 *
 * Integration:
 * - Used in the deepspot workflow before SQL generation
 * - Provides KPI context to enhance SQL generation accuracy
 * - Enables consistent business metric calculations
 */

export const kpiSearchStep = createStep({
  id: "kpi-search-step",
  inputSchema: z.object({
    expandedQuery: z.string(),
    artifactExists: z.boolean(),
    artifactResult: z.array(z.any()),
  }),
  outputSchema: z.object({
    expandedQuery: z.string().describe("The original expanded query"),
    relevantKpis: z
      .array(
        z.object({
          id: z.string().describe("Unique KPI identifier"),
          title: z.string().describe("KPI name"),
          description: z.string().describe("Business context and meaning"),
          sql_query: z.string().describe("SQL formula to calculate the KPI"),
          formula: z.string().optional().describe("Mathematical formula if applicable"),
          tables_used: z.array(z.string()).describe("Array of table names used"),
          columns_used: z.array(z.string()).describe("Array of column references"),
          category: z.string().optional().describe("Business category"),
          similarity_score: z.number().optional().describe("Relevance score (0-1)"),
          tenant_id: z.string().describe("Tenant identifier"),
          application_id: z.string().describe("Application identifier"),
          created_at: z.string().describe("Creation timestamp"),
          updated_at: z.string().describe("Last update timestamp"),
        })
      )
      .describe("Array of relevant KPIs found"),
    kpiContext: z
      .string()
      .describe("Formatted KPI context for use in prompts"),
    hasRelevantKpis: z
      .boolean()
      .describe("Whether any relevant KPIs were found"),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { expandedQuery, artifactExists, artifactResult } = inputData;

    // Validate required runtime context
    const tenantId = runtimeContext.get("tenantId") as string;
    const applicationId = runtimeContext.get("applicationId") as string;

    if (!tenantId || !applicationId) {
      throw new Error("Missing required runtime context: tenantId or applicationId");
    }

    try {
      console.log(`🔍 Searching KPIs for expanded query: "${expandedQuery}"`);

      // Perform semantic search for relevant KPIs
      const searchResult = await searchKPI({
        query: expandedQuery,
        tenant_id: tenantId,
        application_id: applicationId,
        maxResults: 5, // Limit to top 5 most relevant KPIs
      });

      if (searchResult.error) {
        console.warn(`KPI search failed: ${searchResult.error}`);
        return {
          expandedQuery,
          relevantKpis: [],
          kpiContext: "",
          hasRelevantKpis: false,
        };
      }

      const relevantKpis = searchResult.result || [];
      const hasRelevantKpis = relevantKpis.length > 0;

      console.log(`✅ Found ${relevantKpis.length} relevant KPIs`);

      // Format KPI context for use in prompts
      let kpiContext = "";
      if (hasRelevantKpis) {
        kpiContext = "\n\n## Relevant Business KPIs:\n";
        kpiContext += relevantKpis
          .map((kpi, index) => {
            const similarity = kpi.similarity_score
              ? ` (Relevance: ${(kpi.similarity_score * 100).toFixed(1)}%)`
              : "";
            return `${index + 1}. **${kpi.title}**${similarity}
   - Description: ${kpi.description}
   - Category: ${kpi.category || "Uncategorized"}
   - SQL Query: \`${kpi.sql_query}\`
   - Tables Used: ${kpi.tables_used.join(", ")}
   - Columns Used: ${kpi.columns_used.join(", ")}
   ${kpi.formula ? `- Formula: ${kpi.formula}` : ""}`;
          })
          .join("\n\n");
      }

      return {
        expandedQuery,
        relevantKpis,
        kpiContext,
        hasRelevantKpis,
        artifactExists,
        artifactResult,
      };
    } catch (error) {
      console.error("❌ KPI search step failed:", error);
      // Return empty results rather than failing the entire workflow
      return {
        expandedQuery,
        relevantKpis: [],
        kpiContext: "",
        hasRelevantKpis: false,
      };
    }
  },
});

/**
 * Helper function to extract SQL queries from KPI search results
 * @param kpiResults - Array of KPI search results
 * @returns Array of SQL queries that can be used as reference
 */
export const extractSQLQueriesFromKpiResults = (kpiResults: any[]): string[] => {
  return kpiResults.map((kpi) => kpi.sql_query).filter(Boolean);
};

/**
 * Helper function to get table dependencies from KPI search results
 * @param kpiResults - Array of KPI search results
 * @returns Object mapping table names to their usage count
 */
export const getTableDependenciesFromKpiResults = (kpiResults: any[]): Record<string, number> => {
  const tableCounts: Record<string, number> = {};
  
  kpiResults.forEach((kpi) => {
    kpi.tables_used.forEach((table: string) => {
      tableCounts[table] = (tableCounts[table] || 0) + 1;
    });
  });
  
  return tableCounts;
};

/**
 * Helper function to format KPIs for display in summaries
 * @param kpiResults - Array of KPI search results
 * @returns Formatted string for use in AI summaries
 */
export const formatKPIsForSummary = (kpiResults: any[]): string => {
  if (!kpiResults || kpiResults.length === 0) {
    return "";
  }

  const kpiNames = kpiResults.map((kpi) => kpi.title).join(", ");
  return `\n\n**Relevant KPIs found:** ${kpiNames}`;
};
