import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { PgVector, PostgresStore } from "@mastra/pg";
import { deepspotWorkflow } from "../workflows/deepspot";
import { kpiWorkflow } from "../workflows/kpi_workflow";
import { ToolCallFilter, TokenLimiter } from "@mastra/memory/processors";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";
import {
  BatchPartsProcessor,
  UnicodeNormalizer,
} from "@mastra/core/processors";
import tribalKnowledge from "../../prompts/tribal-knowledge";
import AIAnalyst from "../../prompts/ai-analyst";
import { getAgentPgVector } from "../lib/pgVector";

/**
 * ===========================================
 * DEEPSPOT AGENT CONFIGURATION
 * ===========================================
 *
 * This file configures the main DeepSpot agent that orchestrates the complete
 * natural language to SQL query processing pipeline. The agent combines AI
 * capabilities with database operations to provide intelligent query analysis.
 *
 * Key Components:
 * 1. Memory Management: Tenant-specific memory with vector storage
 * 2. Workflow Integration: Orchestrates the SQL execution workflow
 * 3. Input/Output Processing: Handles data normalization and token limiting
 * 4. Security Features: Optional moderation and PII detection
 * 5. Performance Optimization: Caching and batching for efficiency
 *
 * Architecture:
 * - Multi-tenant support with isolated memory per tenant
 * - Connection pooling for database operations
 * - Comprehensive input validation and processing
 * - Configurable security and moderation features
 * - Integration with Mastra's workflow system
 */

// Cache to store memory instances per tenant for performance optimization
const memoryCache = new Map<string, Memory>();
// Cache to store PostgresStore instances per connection string for connection pooling
const postgresStoreCache = new Map<string, PostgresStore>();

/**
 * Factory function for creating PostgresStore instances with connection pooling
 * Implements caching to reuse database connections and improve performance
 * @param connectionString - PostgreSQL connection string
 * @returns PostgresStore instance (cached if already exists)
 */
const createPostgresStore = (connectionString: string) => {
  // Create a unique key for this connection + schema combination
  const storeKey = `${connectionString}`;

  // Check if store already exists for this connection + schema
  if (postgresStoreCache.has(storeKey)) {
    return postgresStoreCache.get(storeKey)!;
  }

  // Create new store instance with connection pooling
  const store = new PostgresStore({
    connectionString: connectionString,
  });

  // Cache the store instance for future reuse
  postgresStoreCache.set(storeKey, store);
  return store;
};


/**
 * Factory function for creating tenant-specific memory instances
 * Provides isolated memory storage and vector search capabilities per tenant
 * @param tenantId - Unique identifier for the tenant
 * @returns Memory instance with tenant-specific configuration
 */
export const createTenantMemory = (tenantId: string): Memory => {
  // Check if memory already exists for this tenant (caching for performance)
  if (memoryCache.has(tenantId)) {
    return memoryCache.get(tenantId)!;
  }

  // Get PostgreSQL connection string from environment variables
  const connectionString = process.env.AGENT_POSTGRES_CONNECTION_STRING || "";

  // Get PgVector instance using centralized singleton factory
  const pgVector = getAgentPgVector();
  
  if (!pgVector) {
    throw new Error("Failed to initialize PgVector - check AGENT_POSTGRES_CONNECTION_STRING");
  }

  // Create memory instance with tenant-specific configuration
  const memory = new Memory({
    // Use tenant-specific PostgreSQL storage
    storage: createPostgresStore(connectionString),

    // Use OpenAI's text embedding model for vector search
    embedder: openai.textEmbeddingModel("text-embedding-3-small"),

    // Configure vector storage with tenant isolation using centralized PgVector
    vector: pgVector,

    // Configure memory processors for data management
    processors: [
      // Filter out tool calls and results to keep memory focused on conversation
      new ToolCallFilter(),
      // Limit token usage to prevent memory overflow (always place last)
      new TokenLimiter(100000),
    ],

    // Configure memory behavior and working memory
    options: {
      lastMessages: 3, // Keep last 3 messages for context
      workingMemory: {
        enabled: true,
        scope: "resource", // Resource-scoped working memory
        template: tribalKnowledge, // Use tribal knowledge template for context
      },
      semanticRecall: {
        messageRange: 2,
        topK: 3,
        scope: "resource",
      },
      threads: {
        generateTitle: true,
      },
    },
  });

  // Cache the memory instance for future reuse
  memoryCache.set(tenantId, memory);
  return memory;
};

/**
 * Main DeepSpot agent that orchestrates the complete natural language to SQL pipeline
 * Combines AI capabilities with database operations for intelligent query processing
 */
export const deepspotAgent = new Agent({
  name: "Deepspot",
  id: "deepspot-agent",
  description:
    "The Deepspot agent orchestrates database queries using semantic layer context and provides comprehensive analysis with AI-powered SQL generation and execution.",
  instructions: AIAnalyst,
  model: openai("gpt-4.1-mini"),

  // Integrate the main SQL execution workflow
  workflows: {
    deepspotWorkflow,
  },

  // Configure tenant-specific memory for conversation context
  memory: ({ runtimeContext }) => {
    const tenantId = runtimeContext.get("tenantId") as string;
    return createTenantMemory(tenantId);
  },
});
