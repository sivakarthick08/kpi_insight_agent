import { createStep } from "@mastra/core";
import { z } from "zod";
import { getQueryAndSearchVector } from "../tools/get-query-and-search";

export const getQueryAndSearchVectorStep = createStep({
  id: "get-query-and-search-vector-step",
  inputSchema: z.object({
    expandedQuery: z.string(),
    whatToImprove: z.string().optional(),
  }),
  outputSchema: z.object({
    expandedQuery: z.string(),
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
  execute: async ({ inputData, runtimeContext }) => {
    console.log("Inside Get Query And Search Vector Step");
    const { expandedQuery, whatToImprove } = inputData;

    if (!getQueryAndSearchVector.execute) {
      console.log("getQueryAndSearchVector.execute is not available");
      return {
        expandedQuery: expandedQuery,
        tables: [],
      };
    }

    try {
      const result = await getQueryAndSearchVector.execute({
        context: {
          expandedQuery: expandedQuery,
          whatToImprove: whatToImprove,
        },
        runtimeContext,
        tracingContext: {},
        suspend: async (suspendPayload) => {
          return {
            expandedQuery: expandedQuery,
            tables: [],
          };
        },
      });

      return {
        expandedQuery: expandedQuery,
        tables: result.tables,
      };
    } catch (error) {
      console.error("Error getting query and search vector:", error);
      return {
        expandedQuery: expandedQuery,
        tables: [],
      };
    }
  },
});
