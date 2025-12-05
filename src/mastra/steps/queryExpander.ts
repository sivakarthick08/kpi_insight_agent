import { createStep } from "@mastra/core";
import { z } from "zod";
import { searchContext } from "../tools/context-tool";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { queryExpander } from "../../prompts/query-expander";

export const queryExpanderStep = createStep({
  id: "query-expander-step",
  inputSchema: z.object({
    naturalLanguageQuery: z.string(),
    whatToImprove: z.string().optional(),
  }),
  outputSchema: z.object({
    expandedQuery: z.string(),
    queryIntent: z.enum(["aggregation", "filtering", "comparison", "trend_analysis", "exploration", "reporting"]).optional(),
  }),
  execute: async ({ inputData, runtimeContext }): Promise<{
    expandedQuery: string;
    queryIntent?: "aggregation" | "filtering" | "comparison" | "trend_analysis" | "exploration" | "reporting";
  }> => {
    console.log("Inside Query Expander Step");
    const { naturalLanguageQuery, whatToImprove } = inputData;
    try {
      // Get categories from runtime context (used for filtering)
      const categories = runtimeContext.get("categories") || [];

      // Build the enhanced query prompt with business context only
      let userPrompt = `Expand this user query with business context: "${naturalLanguageQuery}"`;
      if (whatToImprove) {
        userPrompt += `\n\n From Previous generation: ${whatToImprove}`;
      }

      const contextResult = await searchContext({
        query: naturalLanguageQuery,
        tags: categories as string[],
        tenantId: runtimeContext.get("tenantId") as string,
        applicationId: runtimeContext.get("applicationId") as string,
      });
      let contexts =
        contextResult?.result?.map((result: any) => result?.metadata?.markdown) ||
        [];

      // Append only business context to the prompt (no previous questions or technical details)
      if (contexts.length > 0) {
        userPrompt += `\n\n BUSINESS CONTEXT: ${contexts.join("\n\n")}`;
      }

      // Use AI to expand the query with business context and synonyms
      const result = await generateObject({
        model: openai("gpt-4.1-mini"),
        messages: [
          { role: "system", content: queryExpander },
          { role: "user", content: userPrompt },
        ],
        schema: z.object({
          query: z.string().describe("Expanded business query with context and synonyms, no SQL or technical terms"),
          intent: z.enum(["aggregation", "filtering", "comparison", "trend_analysis", "exploration", "reporting"]).describe("Primary intent of the query"),
        }),
        temperature: 0.3, // Higher temperature for better semantic expansion
      });

      return {
        expandedQuery: result.object.query,
        queryIntent: result.object.intent,
      };
    } catch (error) {
      console.error("❌ Failed to expand query:", error);
      return {
        expandedQuery: naturalLanguageQuery,
        queryIntent: "exploration",
      };
    }
  },
});
