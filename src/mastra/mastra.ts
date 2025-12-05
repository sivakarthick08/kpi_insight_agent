import 'dotenv/config';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { kpi_insight_agent } from './agents/kpi_insight_agent';
import { kpiWorkflow } from './workflows/kpi_workflow';
import { insightWorkflow } from './workflows/insight_workflow';
import { ensureTables } from './tools';

// Initialize database tables
ensureTables().catch((err) => {
  console.error('Failed to initialize database tables:', err);
});

export const mastra = new Mastra({
  agents: {
    kpi_insight_agent,
  },
  workflows: {
    kpiWorkflow,
    insightWorkflow,
  },
  // Add storage provider to enable agent memory
  storage: new LibSQLStore({
    url: 'file:./mastra-memory.db', // Persistent storage for conversation history
  }),
});

// CLI helper: allow running `node src/mastra.ts init-db` to initialize DB and exit.
if (process.argv.includes('init-db')) {
  (async () => {
    try {
      console.log('Initializing database tables (via mastra CLI)...');
      await ensureTables();
      console.log('Database initialized successfully.');
      process.exit(0);
    } catch (err) {
      console.error('Database initialization failed:', err);
      process.exit(1);
    }
  })();
}
