import { createWorkflow } from "@mastra/core";
import { z } from "zod";
import { sqlExecutionStep } from "../steps";

export const executeSQLWorkflow = createWorkflow({
  id: "execute-sql-workflow",
  inputSchema: z.object({
    userQuery: z.string().describe("The user query that was generated"),
    query: z.string().describe("The SQL query that will be executed"),
    generateArtifact: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to generate an artifact for the query result"),
    generateChart: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to generate a chart for the query result"),
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

executeSQLWorkflow
  .then(sqlExecutionStep)
  .map(async ({ inputData }) => ({
    success: inputData?.success || false,
    data: inputData?.data || [],
    rowCount: inputData?.rowCount || 0,
    totalCount: inputData?.totalCount,
    executedQuery: inputData?.executedQuery || "",
    executionTime: inputData?.executionTime || 0,
    error: inputData?.error,
    artifactResult: inputData?.artifactResult,
    chartResult: inputData?.chartResult,
    title: inputData?.title,
  }))
  .commit();
