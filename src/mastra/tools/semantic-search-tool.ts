import { createTool } from "@mastra/core";
import z from "zod";
import { searchSemanticLayerData } from "../core/semantic-layer-storage-tool";

export const semanticSearchTool = createTool({
  id: "semantic-search",
  inputSchema: z.object({
    expandedQuery: z.string(),
    maxResults: z.number().optional(),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
    })),
  }),
  description: "Tool for searching the semantic layer",
  execute: async ({ context, runtimeContext }) => {
    const { expandedQuery, maxResults = 10 } = context;
    const tenantId = runtimeContext.get("tenantId") as string;
    const applicationId = runtimeContext.get("applicationId") as string;

    if (!tenantId || !applicationId) {
      throw new Error("Missing required runtime context: tenantId or applicationId");
    }
    try {
    const results = await searchSemanticLayerData({
      tenantId: tenantId,
      applicationId: applicationId,
      query: expandedQuery,
      maxResults: maxResults,
    });
    return { results };
    } catch (error) {
      return {
        results: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});