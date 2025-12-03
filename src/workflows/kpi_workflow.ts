// Mastra workflows overview: https://mastra.ai/docs/workflows/overview
// Project workflow: Automated KPI creation (kpi-creation-workflow)
// Accepts single-line prompt: "table_name: description of what to calculate"
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  listTablesToolTool,
  listColumnsTool,
  runQueryTool,
  saveKPITool,
  generateSQLTool,
} from '../tools';

// Step 1: Parse user prompt and fetch table columns
const parsePromptAndFetchColumnsStep = createStep({
  id: 'parse-prompt-fetch-columns',
  description: 'Parse user prompt to extract table name and intent, then fetch columns',
  inputSchema: z.object({
    prompt: z.string().describe('Single line prompt: "table_name: what to calculate"'),
    kpiName: z.string().optional().describe('Optional KPI name, auto-generated if not provided'),
  }),
  outputSchema: z.object({
    tableName: z.string(),
    intent: z.string(),
    kpiName: z.string(),
    columns: z.array(z.object({
      column_name: z.string(),
      data_type: z.string(),
    })),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { prompt, kpiName } = inputData;
    
    // Parse prompt: expect format "table_name: description"
    const parts = prompt.split(':').map(p => p.trim());
    if (parts.length < 2) {
      throw new Error('Invalid prompt format. Expected: "table_name: description"');
    }
    
    const tableName = parts[0];
    const intent = parts.slice(1).join(':').trim();
    
    // Generate KPI name if not provided
    const generatedKpiName = kpiName || `kpi_${tableName.replace(/[^a-z0-9_]/gi, '_')}_${Date.now()}`;
    
    // Fetch columns for the table
    const columnsResult = await listColumnsTool.execute({
      context: { table: tableName },
      mastra,
      runtimeContext,
    });
    
    return {
      tableName,
      intent,
      kpiName: generatedKpiName,
      columns: columnsResult.columns,
    };
  },
});

// Step 2: Auto-select relevant columns and generate SQL
const autoGenerateSQLStep = createStep({
  id: 'auto-generate-sql',
  description: 'Automatically select relevant columns and generate SQL based on intent',
  inputSchema: z.object({
    tableName: z.string(),
    intent: z.string(),
    kpiName: z.string(),
    columns: z.array(z.object({
      column_name: z.string(),
      data_type: z.string(),
    })),
  }),
  outputSchema: z.object({
    sqlQuery: z.string(),
    kpiName: z.string(),
    kpiDescription: z.string(),
    selectedColumns: z.array(z.string()),
    tableName: z.string(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { tableName, intent, kpiName, columns } = inputData;
    
    // Auto-select relevant columns based on intent and data types
    const numericColumns = columns
      .filter(c => ['integer', 'numeric', 'bigint', 'real', 'double precision', 'decimal'].includes(c.data_type.toLowerCase()))
      .map(c => `${tableName}.${c.column_name}`);
    
    const selectedColumns = numericColumns.length > 0 
      ? numericColumns 
      : columns.slice(0, 3).map(c => `${tableName}.${c.column_name}`);
    
    // Generate SQL using AI
    const result = await generateSQLTool.execute({
      context: {
        intent,
        tables: [tableName],
        columns: selectedColumns,
        limit: 100,
      },
      mastra,
      runtimeContext,
    });
    
    return {
      sqlQuery: result.sql,
      kpiName,
      kpiDescription: intent,
      selectedColumns,
      tableName,
    };
  },
});

// Step 3: Execute SQL to preview results and prepare for confirmation
const previewResultsStep = createStep({
  id: 'preview-results',
  description: 'Execute SQL query to show preview with full KPI details',
  inputSchema: z.object({
    sqlQuery: z.string(),
    kpiName: z.string(),
    kpiDescription: z.string(),
    selectedColumns: z.array(z.string()),
    tableName: z.string(),
  }),
  outputSchema: z.object({
    sqlQuery: z.string(),
    kpiName: z.string(),
    kpiDescription: z.string(),
    previewResults: z.array(z.record(z.string(), z.any())),
    selectedColumns: z.array(z.string()),
    tableName: z.string(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { sqlQuery, kpiName, kpiDescription, selectedColumns, tableName } = inputData;

    const result = await runQueryTool.execute({
      context: { sql: sqlQuery, limit: 5 },
      mastra,
      runtimeContext,
    });

    return {
      sqlQuery,
      kpiName,
      kpiDescription,
      previewResults: result.rows,
      selectedColumns,
      tableName,
    };
  },
});

// Step 4: Confirm and save KPI (single confirmation with all details)
const confirmAndSaveStep = createStep({
  id: 'confirm-save',
  description: 'Show all KPI details and ask for save confirmation',
  inputSchema: z.object({
    sqlQuery: z.string(),
    kpiName: z.string(),
    kpiDescription: z.string(),
    previewResults: z.array(z.record(z.string(), z.any())),
    selectedColumns: z.array(z.string()),
    tableName: z.string(),
  }),
  resumeSchema: z.object({
    confirmed: z.boolean().describe('Set to true to save the KPI'),
    editedSQL: z.string().optional().describe('Optional: provide edited SQL if you want to modify the query'),
    editedName: z.string().optional().describe('Optional: provide edited KPI name'),
  }),
  suspendSchema: z.object({
    kpiDetails: z.object({
      name: z.string(),
      description: z.string(),
      table: z.string(),
      columns: z.array(z.string()),
      sqlQuery: z.string(),
      previewResults: z.array(z.record(z.string(), z.any())),
    }),
    message: z.string(),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, mastra, runtimeContext }) => {
    const { sqlQuery, kpiName, kpiDescription, previewResults, selectedColumns, tableName } = inputData;
    const { confirmed, editedSQL, editedName } = resumeData ?? {};

    if (!confirmed) {
      return await suspend({
        kpiDetails: {
          name: kpiName,
          description: kpiDescription,
          table: tableName,
          columns: selectedColumns,
          sqlQuery,
          previewResults,
        },
        message: 'Review the KPI details above. Set confirmed=true to save, or provide editedSQL/editedName to modify.',
      });
    }

    const finalSQL = editedSQL || sqlQuery;
    const finalName = editedName || kpiName;

    const result = await saveKPITool.execute({
      context: {
        name: finalName,
        description: kpiDescription,
        formula: finalSQL,
        table: tableName,
        columns: selectedColumns,
      },
      mastra,
      runtimeContext,
    });

    return {
      kpiName: finalName,
      success: result.success,
      message: `KPI '${finalName}' saved successfully! Table: ${tableName}, Columns: ${selectedColumns.join(', ')}`,
    };
  },
});

// Create the automated KPI workflow
export const kpiWorkflow = createWorkflow({
  id: 'kpi-creation-workflow',
  inputSchema: z.object({
    prompt: z.string().describe('Single line: "table_name: what to calculate"'),
    kpiName: z.string().optional().describe('Optional KPI name'),
  }),
  outputSchema: z.object({
    kpiName: z.string(),
    success: z.boolean(),
    message: z.string(),
  }),
})
  .then(parsePromptAndFetchColumnsStep)
  .then(autoGenerateSQLStep)
  .then(previewResultsStep)
  .then(confirmAndSaveStep)
  .commit();
