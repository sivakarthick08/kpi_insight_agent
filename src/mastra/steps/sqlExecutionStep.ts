import { createStep } from "@mastra/core";
import { z } from "zod";
import { sqlExecutionTool } from "../tools/sql-execution-tool";

export const sqlExecutionStep = createStep({
  id: "sql-execution-step",
  inputSchema: z.object({
    userQuery: z.string().describe("The user query that was generated"),  
    query: z.string().describe("The SQL query to execute against the database"),
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
  execute: async ({ inputData, runtimeContext }) => {
    console.log("Inside SQL Execution Step");
    const { userQuery, query, generateArtifact, generateChart } = inputData;

    if (!sqlExecutionTool.execute) {
      throw new Error("sqlExecutionTool is not available");
    }

    const result = await sqlExecutionTool.execute({
      context: { userQuery, query, generateArtifact, generateChart },
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

    return result;
  },
});