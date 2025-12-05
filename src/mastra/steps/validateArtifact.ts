import { openai } from "@ai-sdk/openai";
import { createStep } from "@mastra/core";
import { generateObject } from "ai";
import { z } from "zod";
import { redisCache, generateCacheKey, createHash } from "../lib/redis";

export const validateArtifactStep = createStep({
  id: "validate-artifact-step",
  inputSchema: z.object({
    artifactExists: z.boolean(),
    expandedQuery: z.string(),
    artifactResult: z.any(),
  }),
  outputSchema: z.object({
    validArtifact: z.boolean(),
    expandedQuery: z.string(),
    artifactResult: z.any(),
    sql_query: z.string(),
    whatToImprove: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    console.log("Inside Validate Artifact Step");
    const { expandedQuery, artifactResult } = inputData;
    
    // Generate cache key for artifact validation
    const artifactId = artifactResult?.metadata?.artifact_id || 'none';
    const queryHash = createHash(expandedQuery);
    const cacheKey = generateCacheKey("artifact", "validation", artifactId, queryHash);

    // Try to get cached validation result
    const cachedResult = await redisCache.get(cacheKey);
    if (cachedResult) {
      console.log("🎯 Cache hit for artifact validation");
      return cachedResult;
    }

    try {
      const systemPrompt = `You are an artifact validation assistant. Your role is to evaluate whether a previously generated artifact can effectively answer the current user query.

TASK:
Perform a comprehensive analysis of the provided artifact metadata against the current query to determine compatibility and reusability.

EVALUATION CRITERIA:
1. Semantic Relevance: Does the artifact's original user_query align semantically with the current query? Consider:
   - Intent similarity (both seeking same type of information)
   - Scope compatibility (time ranges, filters, groupings)
   - Business context equivalence

2. Data Adequacy: Does the SQL query retrieve sufficient and relevant data?
   - Required columns are present in headers
   - Appropriate aggregations and calculations exist
   - Filtering logic matches query requirements
   - Join relationships are correctly established

3. Presentation Appropriateness: Is the artifact_type suitable?
   - Chart types match visualization intent (line/bar/pie/scatter)
   - Table format for detailed data inspection requests
   - Interactive components for exploration needs

4. Completeness: Are all necessary data dimensions captured?
   - Time periods align with query scope
   - Categorical breakdowns match requested granularity
   - Metrics cover all aspects of the question

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "validArtifact": boolean,
  "sql_query": string,
  "whatToImprove": string
}

FIELD SPECIFICATIONS:
- validArtifact: true if artifact satisfies ALL criteria above; false otherwise
- sql_query: When valid, extract the complete SQL query string; when invalid, set to empty string ""
- whatToImprove: When invalid, provide specific, actionable feedback on:
  * Missing or incorrect data fields
  * Semantic mismatches between queries
  * Inappropriate visualization type
  * Required modifications to SQL logic
  When valid, set to empty string ""

EDGE CASES TO CONSIDER:
- Queries with different time ranges but same metrics
- Similar metrics with different aggregation levels
- Requests for additional breakdowns of existing data
- Visualization preference changes without data changes`;

      const userPrompt = `Current user query: ${expandedQuery}

        ${
          artifactResult && Object.keys(artifactResult).length > 0
            ? `Previous artifact found:
        - Title: "${artifactResult.metadata.artifact_title}"
        - Original Query: "${artifactResult.metadata.user_query}"
        - SQL Query: "${artifactResult.metadata.sql_query}"
        - Artifact Type: "${artifactResult.metadata.artifact_type}"
        - Data Headers: ${JSON.stringify(artifactResult.metadata.headers)}

        Validate if this artifact can answer the current query.`
            : `No previous artifact found.

        Return: {"validArtifact": false, "sql_query": "", "whatToImprove": "No artifact exists for this query"}`
        }`;

      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        schema: z.object({
          validArtifact: z.boolean(),
          sql_query: z.string(),
          whatToImprove: z.string().optional(),
        }),
      });

      const validationResult = {
        validArtifact: result.object.validArtifact,
        expandedQuery: expandedQuery,
        artifactResult: artifactResult,
        sql_query: result.object.sql_query,
        whatToImprove: result.object.whatToImprove,
      };

      // Cache the validation result for 10 minutes (600 seconds)
      await redisCache.set(cacheKey, validationResult, 600);

      return validationResult;
    } catch (error) {
      console.error("❌ Failed to search artifact:", error);
      return {
        validArtifact: false,
        expandedQuery: expandedQuery,
        artifactResult: {},
        sql_query: "",
        whatToImprove: "",
      };
    }
  },
});
