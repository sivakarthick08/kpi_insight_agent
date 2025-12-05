import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  listTables,
  listColumns,
  runQuery as sharedRunQuery,
  insertKPI,
  insertInsight,
  fetchKPIs,
} from './db_shared';

// ============ KPI Tools ============

export const listTablesToolTool = createTool({
  id: 'list-tables',
  description: 'Lists all tables in the PostgreSQL database',
  inputSchema: z.object({}),
  outputSchema: z.object({
    tables: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const tables = await listTables();
    return { tables };
  },
});

export const listColumnsTool = createTool({
  id: 'list-columns',
  description: 'Lists columns and their data types for a given table',
  inputSchema: z.object({
    table: z.string().describe('Table name in format schema.table or just table'),
  }),
  outputSchema: z.object({
    columns: z.array(
      z.object({
        column_name: z.string(),
        data_type: z.string(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const columns = await listColumns(context.table);
    return { columns };
  },
});

export const saveKPITool = createTool({
  id: 'save-kpi',
  description: 'Saves a KPI definition to the database',
  inputSchema: z.object({
    name: z.string(),
    description: z.string().optional(),
    formula: z.string(),
    table: z.string().optional(),
    columns: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    await insertKPI({
      name: context.name,
      description: context.description,
      formula: context.formula,
      table_name: context.table || null,
      columns: context.columns || null,
    });
    return { success: true, message: `KPI '${context.name}' saved successfully` };
  },
});

// ============ Insight Tools ============

export const saveInsightTool = createTool({
  id: 'save-insight',
  description: 'Saves an insight definition to the database',
  inputSchema: z.object({
    name: z.string(),
    description: z.string().optional(),
    kpi_name: z.string().optional(),
    formula: z.string(),
    schedule: z.string().optional(),
    exec_time: z.string().optional(),
    alert_high: z.number().optional(),
    alert_low: z.number().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    await insertInsight({
      name: context.name,
      description: context.description ?? undefined,
      kpi_name: context.kpi_name ?? undefined,
      formula: context.formula,
      schedule: context.schedule ?? undefined,
      exec_time: context.exec_time ?? undefined,
      alert_high: context.alert_high ?? undefined,
      alert_low: context.alert_low ?? undefined,
    });
    return { success: true, message: `Insight '${context.name}' saved successfully` };
  },
});

// ============ Shared Tools ============

export const runQueryTool = createTool({
  id: 'run-query',
  description: 'Executes a SQL query and returns sample results',
  inputSchema: z.object({
    sql: z.string().describe('SQL query to execute'),
    limit: z.number().optional().describe('Number of rows to return').default(5),
  }),
  outputSchema: z.object({
    rows: z.array(z.any()),
  }),
  execute: async ({ context }) => {
    const rows = await sharedRunQuery(context.sql, context.limit ?? 5);
    return { rows };
  },
});

export const fetchKPIsTool = createTool({
  id: 'fetch-kpis',
  description: 'Fetches all KPIs from the database',
  inputSchema: z.object({}),
  outputSchema: z.object({
    kpis: z.array(
      z.object({
        name: z.string(),
        formula: z.string(),
        table_name: z.string().optional(),
        columns: z.array(z.string()).optional(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const kpisRaw = await fetchKPIs();
    // normalize null table_name to undefined
    const kpis = kpisRaw.map((r) => ({
      ...r,
      table_name: r.table_name ?? undefined,
      columns: r.columns ?? undefined,
    }));
    return { kpis };
  },
});

// ============ Auto-Suggestion Tools ============

export const getKPISuggestionsTool = createTool({
  id: 'get-kpi-suggestions',
  description: 'Generates KPI suggestions by analyzing database schema (tables, columns, data types) and creating natural prompts based on the structure.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    suggestions: z.array(
      z.object({
        name: z.string(),
        prompt: z.string(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const tables = await listTables();
    const allSuggestions = [];

    // Helper to create readable names from column/table names
    const toReadableName = (str: string) => 
      str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Analyze schema for each table
    for (const table of tables.slice(0, 10)) {
      try {
        const columns = await listColumns(table);
        
        if (columns.length === 0) continue;

        // Categorize columns by data type
        const numericCols = columns.filter(c =>
          ['integer', 'numeric', 'bigint', 'real', 'double precision', 'decimal', 'money', 'smallint'].includes(
            c.data_type.toLowerCase()
          )
        );
        
        const dateCols = columns.filter(c =>
          ['date', 'timestamp', 'timestamp without time zone', 'timestamp with time zone'].includes(
            c.data_type.toLowerCase()
          )
        );
        
        const textCols = columns.filter(c =>
          ['character varying', 'varchar', 'text', 'char', 'character'].includes(
            c.data_type.toLowerCase()
          )
        );
        
        const booleanCols = columns.filter(c =>
          c.data_type.toLowerCase() === 'boolean'
        );

        const tableName = table.split('.').pop() || table;
        const readableTable = toReadableName(tableName);

        // 1. Count records
        allSuggestions.push({
          name: `Total ${readableTable}`,
          prompt: `${table}: count all records`,
        });

        // 2. Numeric column aggregations (exclude pure ID columns)
        const meaningfulNumeric = numericCols.filter(c => {
          const lower = c.column_name.toLowerCase();
          return lower !== 'id' && lower !== 'serial';
        });

        if (meaningfulNumeric.length > 0) {
          const col = meaningfulNumeric[0];
          allSuggestions.push({
            name: `Sum of ${toReadableName(col.column_name)}`,
            prompt: `${table}: sum of ${col.column_name}`,
          });
        }

        if (meaningfulNumeric.length > 0) {
          const col = meaningfulNumeric[0];
          allSuggestions.push({
            name: `Average ${toReadableName(col.column_name)}`,
            prompt: `${table}: average ${col.column_name}`,
          });
        }

        // 3. Distinct count on text columns
        if (textCols.length > 0) {
          const col = textCols[0];
          allSuggestions.push({
            name: `Unique ${toReadableName(col.column_name)}`,
            prompt: `${table}: count distinct ${col.column_name}`,
          });
        }

        // 4. Time-based trends
        if (dateCols.length > 0) {
          const dateCol = dateCols[0];
          allSuggestions.push({
            name: `${readableTable} Over Time`,
            prompt: `${table}: count grouped by ${dateCol.column_name}`,
          });
        }

        // 5. Boolean percentage
        if (booleanCols.length > 0) {
          const col = booleanCols[0];
          allSuggestions.push({
            name: `${toReadableName(col.column_name)} Rate`,
            prompt: `${table}: percentage where ${col.column_name} is true`,
          });
        }

        // 6. Group by text columns
        if (textCols.length >= 2) {
          const col = textCols[1];
          allSuggestions.push({
            name: `${readableTable} by ${toReadableName(col.column_name)}`,
            prompt: `${table}: count grouped by ${col.column_name}`,
          });
        }

        // 7. Top N by numeric column
        if (meaningfulNumeric.length > 0 && textCols.length > 0) {
          const numCol = meaningfulNumeric[0];
          const textCol = textCols[0];
          allSuggestions.push({
            name: `Top ${readableTable}`,
            prompt: `${table}: top 10 ${textCol.column_name} by highest ${numCol.column_name}`,
          });
        }

      } catch (error) {
        continue;
      }
    }

    // Return up to 4 diverse suggestions
    const uniqueSuggestions = allSuggestions
      .filter((s, i, arr) => arr.findIndex(t => t.name === s.name) === i)
      .slice(0, 4);

    return { suggestions: uniqueSuggestions };
  },
});

export const getInsightSuggestionsTool = createTool({
  id: 'get-insight-suggestions',
  description: 'Generates insight suggestions by analyzing available KPIs and their data structure to create natural analysis prompts.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    suggestions: z.array(
      z.object({
        name: z.string(),
        prompt: z.string(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const kpisRaw = await fetchKPIs();
    
    if (kpisRaw.length === 0) {
      return { suggestions: [] };
    }

    const suggestions = [];
    const usedKPIs = new Set<string>();

    // Simple insight types based on KPI data structure
    const insightTypes = [
      { name: 'Trend', suffix: 'trend analysis' },
      { name: 'Comparison', suffix: 'comparison analysis' },
      { name: 'Pattern', suffix: 'pattern detection' },
      { name: 'Distribution', suffix: 'distribution analysis' },
    ];

    // Generate insights from different KPIs
    for (const insightType of insightTypes) {
      if (suggestions.length >= 4) break;

      for (const kpi of kpisRaw) {
        if (usedKPIs.has(kpi.name)) continue;

        try {
          // Check if KPI has data
          const kpiData = await sharedRunQuery(kpi.formula, 5);
          
          if (kpiData.length > 0) {
            suggestions.push({
              name: `${kpi.name} - ${insightType.name}`,
              prompt: `${kpi.name}: ${insightType.suffix}`,
            });
            usedKPIs.add(kpi.name);
            break; // Move to next insight type
          }
        } catch (error) {
          continue;
        }
      }
    }

    // Fill remaining slots with simple analysis
    for (const kpi of kpisRaw) {
      if (suggestions.length >= 4) break;
      if (usedKPIs.has(kpi.name)) continue;

      try {
        const kpiData = await sharedRunQuery(kpi.formula, 5);
        if (kpiData.length > 0) {
          suggestions.push({
            name: `${kpi.name} - Analysis`,
            prompt: `${kpi.name}: detailed analysis`,
          });
          usedKPIs.add(kpi.name);
        }
      } catch (error) {
        continue;
      }
    }

    return { suggestions: suggestions.slice(0, 4) };
  },
});
