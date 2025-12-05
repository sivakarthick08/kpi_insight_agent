import { createStep } from "@mastra/core";
import { generateObject } from "ai";
import { z } from "zod";
import { summaryGenerationPrompt } from "../../prompts/summary-generation";
import { openai } from "@ai-sdk/openai";

export const summaryStep = createStep({
  id: "summary-step",
  inputSchema: z.object({
    success: z.boolean(),
    data: z.array(z.any()),
    rowCount: z.number(),
    totalCount: z.number().optional(),
    executedQuery: z.string(),
    error: z.string().optional(),
    title: z.string().optional(),
    chartResult: z
      .object({
        type: z.string().optional(),
        x_axis: z.string().optional(),
        y_axis: z.array(z.string()).optional(),
      })
      .optional(),
    artifactResult: z
      .object({
        tenant_id: z.string().optional(),
        user_query: z.string().optional(),
        sql_query: z.string().optional(),
        application_id: z.string().optional(),
        thread_id: z.string().optional(),
        message_id: z.string().optional(),
        artifact_title: z.string().optional(),
        headers: z.array(z.string()).optional(),
        artifact_type: z.string().optional(),
        chart_type: z.string().optional(),
        chart_x_axis: z.string().optional(),
        chart_y_axis: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  outputSchema: z.object({
    sqlQuery: z.string().optional().describe("Generated SQL query"),
    resultData: z.array(z.any()).optional().describe("Result data"),
    artifactResult: z.any().optional().describe("Artifact result"),
    chartResult: z.any().optional().describe("Chart result"),
    summary: z.string().describe("Summary of the query"),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const {
      success,
      data,
      rowCount,
      totalCount,
      executedQuery,
      error,
      title,
      chartResult,
      artifactResult,
    } = inputData;

    const userPrompt = `
    Generate a summary of the query execution.
    ${success ? `## CAN ANSWER` : `## CANNOT ANSWER`}
    ## 
    ${title}
    # Data
    ${data && data.length > 0 ? `## Data` : `## No Data`}
    ${data}
    # Row Count
    ${rowCount > 0 ? `## Row Count` : `## No Row Count`}
    ${rowCount}
    # Total Count
    ${totalCount ? `## Total Count` : `## No Total Count`}
    ${totalCount}
    # Executed Query
    ${executedQuery}
    # Error
    ${error ? `## Error` : `## No Error`}
    ${error}
    `;
    try {
      const { object } = await generateObject({
        model: openai("gpt-4.1-mini"),
        messages: [
          { role: "system", content: summaryGenerationPrompt() },
          { role: "user", content: userPrompt },
        ],
        schema: z.object({
          summary: z.string().describe("Summary of the query"),
        }),
      });

      let payload = {
        sqlQuery: executedQuery,
        resultData: data,
        artifactResult: artifactResult ? artifactResult : undefined,
        chartResult:
          chartResult !== undefined
            ? chartResult
            : artifactResult
            ? {
                type: artifactResult?.chart_type,
                x_axis: artifactResult?.chart_x_axis,
                y_axis: artifactResult?.chart_y_axis,
              }
            : undefined,
        summary: object.summary,
      };

      return payload;
    } catch (error) {
      console.error("Error generating summary:", error);
      return {
        summary: "Error generating summary",
      };
    }
  },
});
