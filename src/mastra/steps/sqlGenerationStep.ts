import { createStep } from "@mastra/core";
import { z } from "zod";
import { sqlGenerationTool } from "../tools/sql-generation-tool";

export const sqlGenerationStep = createStep({
  id: "sql-generation-step",
  inputSchema: z.object({
    expandedQuery: z.string().describe("Expanded query from the user"),
    tables: z.array(
      z.object({
        name: z.string(),
        fields: z.array(
          z.object({
            field_name: z.string(),
            field_type: z.string(),
            field_description: z.string(),
            sample_data: z.array(z.any()),
          })
        ),
        description: z.string(),
        schema_name: z.string(),
      })
    ),
  }),
  outputSchema: z.object({
    userQuery: z.string().describe("The user query that was generated"),
    can_answer: z.boolean().describe("Whether the query can be answered"),
    reason: z.string().describe("Reason for the answer"),
    sql: z.string().describe("The generated SQL query"),
    explanation: z.string().describe("Explanation of what the query does"),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("Confidence level in the generated query (0-1)"),
    assumptions: z
      .array(z.string())
      .describe("Any assumptions made while generating the query"),
    tables_used: z
      .array(z.string())
      .describe("List of tables used in the query"),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    console.log("Inside SQL Generation Step");
    const { expandedQuery, tables } = inputData;

    if (!sqlGenerationTool.execute) {
      return {
        userQuery: expandedQuery,
        can_answer: false,
        reason: "sqlGenerationTool is not available",
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }

    try {
      const result = await sqlGenerationTool.execute({
        context: {
          expandedQuery,
          tables,
        },
        runtimeContext,
        suspend: async () => {}
      });
      return {
        userQuery: expandedQuery,
        ...result,
      };
    } catch (error) {
      console.error("Error generating SQL:", error);
      return {
        userQuery: expandedQuery,
        can_answer: false,
        reason: `Error generating SQL: ${error}`,
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }
  },
});
