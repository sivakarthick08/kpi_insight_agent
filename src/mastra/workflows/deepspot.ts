import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { queryExpanderStep } from "../steps/queryExpander";
import { artifactSearchStep } from "../steps/artifactSearch";
import { kpiSearchStep } from "../steps/kpiSearchStep";
import { summaryStep } from "../steps/summaryStep";
import { searchAndExecuteQueryWorkflow } from "./searchAndExecuteQuery";
import { validateArtifactWorkflow } from "./validateArtifact";

// Deepspot: entry workflow converting a natural-language query → execution
export const deepspotWorkflow = createWorkflow({
  id: "deepspot-workflow",
  inputSchema: z.object({
    naturalLanguageQuery: z
      .string()
      .describe(
        "The user's natural language query that needs to be converted to SQL and executed"
      ),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Whether the workflow completed successfully"),
    result: z
      .any()
      .describe(
        "The execution result containing data, metadata, and any generated artifacts"
      ),
  }),
});

// Build the workflow pipeline with step-by-step processing
deepspotWorkflow
  .map(async ({ inputData }) => {
    // Early validation
    if (!inputData.naturalLanguageQuery?.trim()) {
      throw new Error("Natural language query is required");
    }
    return {
      naturalLanguageQuery: inputData.naturalLanguageQuery.trim(),
    };
  })
  .then(queryExpanderStep)
  .then(artifactSearchStep)
  // .then(kpiSearchStep)
  .map(async ({ inputData, getStepResult }) => {
    const artifactResult = getStepResult(artifactSearchStep);
    const artifactExists = artifactResult?.artifactExists;
    const artifactResultData = artifactResult?.artifactResult;
    return {
      artifactExists: artifactExists,
      expandedQuery: inputData.expandedQuery,
      artifactResult: artifactResultData[0],
      // relevantKpis: inputData.relevantKpis,
      // kpiContext: inputData.kpiContext,
      // hasRelevantKpis: inputData.hasRelevantKpis,
    };
  })
  .branch([
    [
      async ({ inputData: { artifactExists } }) => artifactExists,
      validateArtifactWorkflow,
    ],
    [
      async ({ inputData: { artifactExists } }) => !artifactExists,
      searchAndExecuteQueryWorkflow,
    ],
  ])
  .map(async ({ getStepResult }) => {
    // Get result from whichever branch was executed
    const validateResult = getStepResult(validateArtifactWorkflow);
    const searchResult = getStepResult(searchAndExecuteQueryWorkflow);
    let result = validateResult || searchResult || {};

    return {
      success: Boolean(result.success),
      data: Array.isArray(result.data) ? result.data : [],
      rowCount: Number.isFinite(result.rowCount) ? result.rowCount : 0,
      totalCount: Number.isFinite(result.totalCount)
        ? result.totalCount
        : undefined,
      executedQuery:
        typeof result.executedQuery === "string" ? result.executedQuery : "",
      executionTime: Number.isFinite(result.executionTime)
        ? result.executionTime
        : 0,
      error: typeof result.error === "string" ? result.error : undefined,
      title: typeof result.title === "string" ? result.title : undefined,
      artifactResult:
        result.artifactResult !== null && result.artifactResult !== undefined
          ? result.artifactResult
          : undefined,
      chartResult:
        result.chartResult !== null && result.chartResult !== undefined
          ? result.chartResult
          : undefined,
    };
  })
  .then(summaryStep)
  .commit();
