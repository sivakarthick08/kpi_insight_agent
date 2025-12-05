import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { searchKPI } from "./kpi-tool";

/**
 * ===========================================
 * KPI SEARCH TOOL
 * ===========================================
 *
 * This Mastra tool enables the AI analyst agent to explicitly search for
 * relevant Key Performance Indicators (KPIs) based on natural language queries.
 * It provides semantic search capabilities to find KPIs that match the user's
 * intent and business context.
 *
 * Key Features:
 * 1. Semantic Search: Uses vector embeddings to find relevant KPIs
 * 2. Category Filtering: Optional filtering by business category
 * 3. Multi-tenant Support: Isolates results by tenant and application
 * 4. Similarity Scoring: Returns results with relevance scores
 * 5. Business Context: Provides full KPI definitions for SQL generation
 *
 * Usage Examples:
 * - "Find revenue KPIs" → Returns all revenue-related metrics
 * - "Show customer metrics" → Returns customer-focused KPIs
 * - "What KPIs track sales performance?" → Returns sales-related KPIs
 */

export const kpiSearchTool = createTool({
  id: "kpi-search",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Natural language query to search for relevant KPIs"),
    category: z
      .string()
      .optional()
      .describe("Optional category filter (e.g., 'revenue', 'operational', 'customer')"),
    maxResults: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of KPIs to return (default: 5)"),
  }),
  outputSchema: z.object({
    kpis: z
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
          created_at: z.string().describe("Creation timestamp"),
          updated_at: z.string().describe("Last update timestamp"),
        })
      )
      .describe("Array of relevant KPIs found"),
    total_found: z.number().describe("Total number of KPIs found"),
    search_query: z.string().describe("The search query that was executed"),
  }),
  description:
    "Searches for relevant Key Performance Indicators (KPIs) using semantic search. Returns KPIs that match the query intent with their SQL formulas, business context, and similarity scores.",
  execute: async ({ context, runtimeContext }) => {
    const { query, category, maxResults } = context;

    // Validate required runtime context
    const tenantId = runtimeContext.get("tenantId") as string;
    const applicationId = runtimeContext.get("applicationId") as string;

    if (!tenantId || !applicationId) {
      throw new Error("Missing required runtime context: tenantId or applicationId");
    }

    try {
      console.log(`🔍 Searching KPIs for query: "${query}"`);
      if (category) {
        console.log(`📂 Category filter: "${category}"`);
      }

      // Perform semantic search for relevant KPIs
      const searchResult = await searchKPI({
        query,
        tenant_id: tenantId,
        application_id: applicationId,
        category,
        maxResults,
      });

      if (searchResult.error) {
        throw new Error(`KPI search failed: ${searchResult.error}`);
      }

      const kpis = searchResult.result || [];
      const totalFound = kpis.length;

      console.log(`✅ Found ${totalFound} relevant KPIs`);

      // Format results for the agent
      const formattedKpis = kpis.map((kpi) => ({
        id: kpi.id,
        title: kpi.title,
        description: kpi.description,
        sql_query: kpi.sql_query,
        formula: kpi.formula,
        tables_used: kpi.tables_used,
        columns_used: kpi.columns_used,
        category: kpi.category,
        similarity_score: kpi.similarity_score,
        created_at: kpi.created_at,
        updated_at: kpi.updated_at,
      }));

      return {
        kpis: formattedKpis,
        total_found: totalFound,
        search_query: query,
      };
    } catch (error) {
      console.error("❌ KPI search tool failed:", error);
      throw new Error(
        `Failed to search KPIs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

/**
 * Helper function to format KPIs for display in prompts
 * @param kpis - Array of KPI search results
 * @returns Formatted string for use in AI prompts
 */
export const formatKPIsForPrompt = (kpis: any[]): string => {
  if (!kpis || kpis.length === 0) {
    return "No relevant KPIs found.";
  }

  return kpis
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
};

/**
 * Helper function to extract SQL queries from KPIs for SQL generation
 * @param kpis - Array of KPI search results
 * @returns Array of SQL queries that can be used as reference
 */
export const extractSQLQueriesFromKPIs = (kpis: any[]): string[] => {
  return kpis.map((kpi) => kpi.sql_query).filter(Boolean);
};

/**
 * Helper function to get table dependencies from KPIs
 * @param kpis - Array of KPI search results
 * @returns Object mapping table names to their usage count
 */
export const getTableDependenciesFromKPIs = (kpis: any[]): Record<string, number> => {
  const tableCounts: Record<string, number> = {};
  
  kpis.forEach((kpi) => {
    kpi.tables_used.forEach((table: string) => {
      tableCounts[table] = (tableCounts[table] || 0) + 1;
    });
  });
  
  return tableCounts;
};
