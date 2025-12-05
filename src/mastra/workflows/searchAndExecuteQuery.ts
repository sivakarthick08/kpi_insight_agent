import { createWorkflow } from "@mastra/core";
import { z } from "zod";
import { getQueryAndSearchVectorStep, sqlGenerationStep } from "../steps";
import { executeSQLWorkflow } from "./executeSQL";

export const searchAndExecuteQueryWorkflow = createWorkflow({
  id: "search-and-execute-query-workflow",
  inputSchema: z.object({
    expandedQuery: z
      .string()
      .describe(
        "The expanded query that needs to be converted to SQL and executed"
      ),
    whatToImprove: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
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

searchAndExecuteQueryWorkflow
  .map(async ({ inputData }) => ({
    expandedQuery: inputData.expandedQuery,
    whatToImprove: inputData.whatToImprove,
  }))
  .then(getQueryAndSearchVectorStep)
  .then(sqlGenerationStep)
  .map(async ({ inputData }) => {
    return {
      userQuery: inputData.userQuery,
      can_answer: inputData.can_answer,
      query: inputData.sql,
      generateArtifact: true,
      generateChart: true,
    };
  })
  .branch([
    [async ({ inputData: { can_answer } }) => can_answer, executeSQLWorkflow],
  ])
  .map(async ({ inputData }) => {
    const {
      "execute-sql-workflow": sqlResult,
    } = inputData;

    // If no SQL result, return error response
    if (!sqlResult) {
      return {
        success: false,
        data: [],
        rowCount: 0,
        executedQuery: "",
        executionTime: 0,
        error: "Query cannot be answered with available data",
      };
    }

    const result = sqlResult || {};
    return {
      success: result.success || false,
      data: result.data || [],
      rowCount: result.rowCount || 0,
      executedQuery: result.executedQuery || "",
      executionTime: result.executionTime || 0,
      artifactResult: result.artifactResult,
      chartResult: result.chartResult,
      title: result.title,
      totalCount: result.totalCount,
      error: result.error,
    };
  })

  .commit();
