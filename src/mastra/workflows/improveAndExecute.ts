import { createWorkflow } from "@mastra/core";
import { z } from "zod";
import { searchAndExecuteQueryWorkflow } from "./searchAndExecuteQuery";

export const improveAndExecuteWorkflow = createWorkflow({
  id: "improve-and-execute-workflow",
  inputSchema: z.object({
    expandedQuery: z.string(),
    whatToImprove: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    expandedQuery: z.string(),
    data: z.array(z.any()),
    rowCount: z.number(),
    totalCount: z.number().optional(),
    executedQuery: z.string(),
    executionTime: z.number(),
    error: z.string().optional(),
    artifactResult: z.any().optional(),
    chartResult: z.any().optional(),
    title: z.string().optional(),
  }),
});

improveAndExecuteWorkflow
  .map(async ({ inputData }) => ({
    expandedQuery: inputData.expandedQuery,
    whatToImprove: inputData.whatToImprove,
  }))
  .then(searchAndExecuteQueryWorkflow)
  .map(async ({ inputData, getInitData }) => {
    const result = inputData || {};
    const { expandedQuery } = getInitData() as { expandedQuery: string; whatToImprove: string };
    return {
      success: result.success || false,
      expandedQuery: expandedQuery,
      data: result.data || [],
      rowCount: result.rowCount || 0,
      totalCount: result.totalCount,
      executedQuery: result.executedQuery || "",
      executionTime: result.executionTime || 0,
      error: result.error,
      artifactResult: result.artifactResult,
      chartResult: result.chartResult,
      title: result.title,
    };
  })
  .commit();
