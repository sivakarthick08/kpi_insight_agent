import 'dotenv/config';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { openai } from '@ai-sdk/openai';
import {
  listTablesToolTool,
  listColumnsTool,
  runQueryTool,
  saveKPITool,
  generateSQLTool,
} from '../tools';
// 1. Ask user for a single-line prompt in format: "table_name: what to calculate"
  // Example: "public.sales: sum of total revenue"
   // Example: "orders: average order value"
export const kpiAgentMastra = new Agent({
  name: 'KPI Agent',
  description: 'Interactive agent that helps users create and manage KPIs with a simple single-line prompt',
  instructions: `You are a KPI creation assistant that helps users define and store Key Performance Indicators.

Simplified workflow:
1. Ask user for a single-line prompt and choose table as your own based on user needs (or) i provide the formula.

2. The workflow will automatically:
   - Fetch table columns
   - Select relevant columns based on intent
   - Generate optimized SQL query
   - Execute query and show preview results

3. Show the user:
   - KPI Name (auto-generated or custom)
   - Description
   - Table and columns used
   - Generated SQL query
   - Sample results (5 rows)

4. Ask for confirmation to save
5. User can optionally edit the SQL or name before saving
6. Save the KPI to database

Be helpful and guide users to provide clear, single-line prompts. The system handles all complexity automatically, and give the as much possible optimal query without error.`,
  model: openai('gpt-4o'),
  tools: {
    listTablesToolTool,
    listColumnsTool,
    runQueryTool,
    generateSQLTool,
    saveKPITool,
  },
  // Enable memory to maintain conversation context
  memory: new Memory({
    options: {
      lastMessages: 20, // Keep last 20 messages in context
    },
  }),
});
