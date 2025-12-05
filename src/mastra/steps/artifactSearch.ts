import { createStep } from "@mastra/core";
import { z } from "zod";
import { initializeStorage } from "../core/semantic-layer-storage-tool";
import { searchArtifact } from "../core/artifact";
import { artifactTool } from "../tools/artifact-tool";

export const artifactSearchStep = createStep({
  id: "artifact-search-step",
  inputSchema: z.object({
    expandedQuery: z.string(),
    queryIntent: z.enum(["aggregation", "filtering", "comparison", "trend_analysis", "exploration", "reporting"]).optional(),
  }),
  outputSchema: z.object({
    expandedQuery: z.string(),
    artifactExists: z.boolean(),
    artifactResult: z.array(z.any()),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    console.log("Inside Artifact Search Step");
    const { expandedQuery } = inputData;
    try {
      if (!artifactTool.execute) {
        throw new Error("artifactTool is not available");
      }
      const artifactSearchResult = await artifactTool.execute({
        context: {
          tenantId: runtimeContext.get("tenantId") as string,
          applicationId: runtimeContext.get("applicationId") as string,
          userQuery: expandedQuery,
          maxResults: 1,
        },
        runtimeContext,
        tracingContext: {},
        suspend: async (suspendPayload) => {
          return {
            success: false,
            data: [],
            rowCount: 0,
          };
        },
      });

      if (
        !artifactSearchResult ||
        !artifactSearchResult?.artifact.result ||
        artifactSearchResult?.artifact.result?.length === 0 ||
        artifactSearchResult?.artifact.error
      ) {
        return {
          artifactExists: false,
          expandedQuery: expandedQuery,
          artifactResult: [],
        };
      }
      return {
        artifactExists: true,
        expandedQuery: expandedQuery,
        artifactResult: artifactSearchResult?.artifact.result,
      };
    } catch (error) {
      console.error("❌ Failed to search artifact:", error);
      return {
        artifactExists: false,
        expandedQuery: expandedQuery,
        artifactResult: [],
      };
    }
  },
});
