import { createWorkflow } from "@mastra/core";
import { z } from "zod";
import { validateArtifactStep } from "../steps/validateArtifact";
import { improveAndExecuteWorkflow } from "./improveAndExecute";
import { executeSQLWorkflow } from "./executeSQL";

export const validateArtifactWorkflow = createWorkflow({
  id: "validate-artifact-workflow",
  inputSchema: z.object({
    expandedQuery: z.string(),
    artifactExists: z.boolean(),
    artifactResult: z.any(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.array(z.any()),
    rowCount: z.number(),
    executedQuery: z.string(),
    executionTime: z.number(),
    artifactResult: z.any(),
    chartResult: z.any().optional(),
    title: z.string().optional(),
    totalCount: z.number().optional(),
    error: z.string().optional(),
  }),
});

validateArtifactWorkflow
  .then(validateArtifactStep)
  .map(async ({ inputData }) => ({
    userQuery: inputData?.expandedQuery,
    query: inputData?.sql_query,
    validArtifact: inputData.validArtifact,
    expandedQuery: inputData.expandedQuery,
    artifactResult: inputData.artifactResult,
    generateArtifact: false,
    generateChart: false,
  }))
  .branch([
    [
      async ({ inputData: { validArtifact } }) => validArtifact,
      executeSQLWorkflow,
    ],
    [
      async ({ inputData: { validArtifact } }) => !validArtifact,
      improveAndExecuteWorkflow,
    ],
  ])
  .map(async ({ inputData, getStepResult }) => {
    const {
      "execute-sql-workflow": sqlResult,
      "improve-and-execute-workflow": improveResult,
    } = inputData;

    const validateResult = getStepResult(validateArtifactStep);

    const result = sqlResult || improveResult;

    let payload: any = {
      success: result?.success || false,
      data: result?.data || [],
      rowCount: result?.rowCount || 0,
      executedQuery: result?.executedQuery || "",
      executionTime: result?.executionTime || 0,
      totalCount: result?.totalCount,
      error: result?.error,
    };

    if (validateResult?.validArtifact) {
      payload.artifactResult = {
        id: validateResult?.artifactResult.metadata.artifact_id,
        title: validateResult?.artifactResult.metadata.artifact_title,
        user_query: validateResult?.artifactResult.metadata.user_query,
        sql_query: validateResult?.artifactResult.metadata.sql_query,
      };
      payload.chartResult = {
        type: validateResult?.artifactResult.metadata.chart_type,
        x_axis: validateResult?.artifactResult.metadata.chart_x_axis,
        y_axis: validateResult?.artifactResult.metadata.chart_y_axis,
      };
      payload.title = validateResult?.artifactResult.metadata.artifact_title;
    } else if (improveResult?.success && improveResult?.artifactResult) {
      payload.artifactResult = {
        id: improveResult?.artifactResult.artifact.id,
        title: improveResult?.artifactResult.title,
        user_query: improveResult?.artifactResult.user_query,
        sql_query: improveResult?.executedQuery,
      };
      payload.chartResult = improveResult?.chartResult;
      payload.title = improveResult?.title;
      payload.error = improveResult?.error;
    }
    // improveResult : {
    //   success: true,
    //   data: [ { total_amount: '36309489.50' } ],
    //   rowCount: 1,
    //   totalCount: undefined,
    //   executedQuery: `SELECT ROUND(SUM("invoiceitem"."amount"), 2) AS total_amount FROM "invoice_with_profiles" JOIN "invoiceitem" ON "invoice_with_profiles"."id" = "invoiceitem"."invoice_id" WHERE "invoice_with_profiles"."status" = TRUE AND "invoiceitem"."status" = TRUE AND "invoice_with_profiles"."invoice_module_name" = 'taxinvoice' AND "invoice_with_profiles"."invoice_date" >= '2025-08-01' AND "invoice_with_profiles"."invoice_date" < '2025-09-01'`,
    //   executionTime: 173,
    //   error: undefined,
    //   artifactResult: {
    //     stored: true,
    //     artifact: {
    //       id: 1077,
    //       title: 'Total Invoice Amount for Active Tax Invoices in August 2025'
    //     }
    //   },
    //   chartResult: { type: 'not_available', x_axis: '', y_axis: [] },
    //   title: 'Total Invoice Amount for Active Tax Invoices in August 2025'
    // }
    // sq

    return payload;
  })
  .commit();
