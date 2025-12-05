# DeepSpot Query Executor - Complete Developer Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Semantic Layer Building API](#semantic-layer-building-api)
4. [Text-to-SQL Conversion](#text-to-sql-conversion)
5. [Context Management System](#context-management-system)
6. [Feedback API](#feedback-api)
7. [Artifact System](#artifact-system)
8. [Database Integration](#database-integration)
9. [API Endpoints](#api-endpoints)
10. [Getting Started](#getting-started)
11. [Development Guide](#development-guide)
12. [Troubleshooting](#troubleshooting)

## Project Overview

DeepSpot Query Executor is an AI-powered system that converts natural language queries into SQL and executes them against databases. Built on the Mastra framework, it provides a comprehensive solution for database interaction through natural language processing.

### Key Features
- **Natural Language to SQL**: Convert human queries to executable SQL
- **Semantic Layer**: Vector-based schema discovery and management
- **Multi-Database Support**: PostgreSQL and BigQuery integration
- **Context Management**: Store and retrieve business context
- **Feedback Loop**: Learn from user interactions and improve
- **Artifact Generation**: Create visualizations and reports
- **Multi-Tenant Architecture**: Isolated data and processing per tenant

### Technology Stack
- **Framework**: Mastra (AI workflow orchestration)
- **AI Models**: OpenAI GPT-4, OpenAI Embeddings
- **Vector Database**: PostgreSQL with pgvector extension
- **Databases**: PostgreSQL, BigQuery
- **Language**: TypeScript/Node.js
- **Deployment**: Docker, Trigger.dev

## Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   DeepSpot API   │    │   Database      │
│   (React)       │◄──►│   (Mastra)       │◄──►│   (PostgreSQL/  │
│                 │    │                  │    │    BigQuery)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Vector Store    │
                       │  (pgvector)      │
                       └──────────────────┘
```

### Core Components

1. **API Layer** (`src/api/`): RESTful endpoints for all operations
2. **Mastra Tools** (`src/mastra/tools/`): Reusable AI-powered tools
3. **Workflows** (`src/mastra/workflows/`): Orchestrated processing pipelines
4. **Database Layer** (`src/databases/`): Database abstraction and connections
5. **Vector Storage** (`src/mastra/lib/`): Embedding generation and storage

### Data Flow

```
User Query → Schema Search → SQL Generation → Execution → Results → Artifacts
     ↓              ↓              ↓            ↓          ↓         ↓
Natural Lang → Vector Search → AI Processing → Database → Response → Charts
```

## Semantic Layer Building API

The semantic layer is the foundation of DeepSpot's intelligence, providing vector-based schema discovery and management.

### Overview

The semantic layer transforms raw database schemas into searchable, AI-understandable representations using vector embeddings. This enables intelligent schema discovery and context-aware SQL generation.

### Key Components

#### 1. Schema Service (`src/api/schema/service.ts`)

The `SchemaService` class provides the core functionality for semantic layer operations:

```typescript
export class SchemaService {
  // Get database schema information
  static async getDatabaseSchema(params: DatabaseConnectionParams): Promise<any>
  
  // Get tables by schema
  static async getTablesBySchema(params: SchemaParams): Promise<any>
  
  // Get detailed table information with fields and relationships
  static async getTablesDetails(params: TablesDetailsParams): Promise<any>
  
  // Generate semantic layer with AI-powered descriptions
  static async generateSemanticLayer(params: GenerateSemanticLayerParams): Promise<any>
}
```

#### 2. Semantic Layer Storage Tool (`src/mastra/tools/semantic-layer-storage-tool.ts`)

Manages vector storage and retrieval of schema metadata:

**Key Functions:**
- `initializeStorage(tenantId)`: Sets up vector indexes
- `storeSemanticLayerData()`: Stores schema as vector embeddings
- `retrieveSemanticLayerData()`: Performs similarity search
- `searchSemanticLayerData()`: Combines vector and keyword search

**Content Types:**
- `table`: Database table definitions and descriptions
- `field`: Column definitions with types and descriptions
- `relationship`: Foreign key relationships between tables
- `metric`: Business metrics and calculated fields
- `category`: Data categorization and classification

#### 3. API Endpoints

**Schema Discovery:**
```http
POST /custom/semantic/schema
Content-Type: application/json

{
  "databaseType": "POSTGRESQL",
  "connectionString": "postgresql://user:pass@host:port/db"
}
```

**Table Details:**
```http
POST /custom/semantic/tables-details
Content-Type: application/json

{
  "databaseType": "POSTGRESQL",
  "connectionString": "postgresql://user:pass@host:port/db",
  "schema": "public",
  "tables": ["users", "orders"]
}
```

**Semantic Layer Generation:**
```http
POST /custom/semantic/generate
Content-Type: application/json
x-tenant-id: tenant-123
x-application-id: app-456

{
  "table": "users",
  "columns": [...],
  "relationships": [...],
  "metrics": [...],
  "context": "E-commerce platform",
  "categories": ["user_management", "authentication"]
}
```

### Process Flow

1. **Schema Extraction**: Connect to database and extract schema information
2. **AI Description Generation**: Use LLM to create human-readable descriptions
3. **Embedding Generation**: Convert descriptions to vector embeddings
4. **Vector Storage**: Store embeddings in PostgreSQL with pgvector
5. **Search & Retrieval**: Perform similarity search for relevant schema

### Vector Storage Schema

```sql
CREATE TABLE semantic_layer_entries (
  id UUID PRIMARY KEY,
  vector vector(1536),  -- OpenAI embedding dimension
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for similarity search
CREATE INDEX ON semantic_layer_entries USING ivfflat (vector vector_cosine_ops);
```

## Text-to-SQL Conversion

The text-to-SQL system converts natural language queries into executable SQL using AI and schema context.

### Overview

The conversion process involves multiple steps:
1. **Query Analysis**: Parse and understand the natural language query
2. **Schema Context Retrieval**: Find relevant database schema using vector search
3. **SQL Generation**: Use AI to generate SQL from natural language + schema
4. **Validation**: Ensure generated SQL is safe and valid
5. **Execution**: Run the SQL against the target database

### Key Components

#### 1. SQL Generation Tool (`src/mastra/tools/sql-generation-tool.ts`)

The core tool for converting natural language to SQL:

```typescript
export const sqlGenerationTool = createTool({
  id: "sql-generation",
  inputSchema: z.object({
    naturalLanguageQuery: z.string(),
    instructions: z.string().optional()
  }),
  outputSchema: z.object({
    can_answer: z.boolean(),
    reason: z.string(),
    sql: z.string(),
    explanation: z.string(),
    confidence: z.number().min(0).max(1),
    assumptions: z.array(z.string()),
    tables_used: z.array(z.string())
  })
});
```

**Key Features:**
- **Schema-Aware Generation**: Uses vector-searched schema context
- **Database Type Support**: Generates SQL for PostgreSQL and BigQuery
- **Safety Validation**: Ensures generated SQL follows security best practices
- **Confidence Scoring**: Provides confidence levels and assumptions
- **Error Handling**: Gracefully handles unanswerable queries

#### 2. SQL Execution Workflow (`src/mastra/workflows/sql-execution.ts`)

Orchestrates the complete query processing pipeline:

```typescript
export const deepspotWorkflow = createWorkflow({
  id: "deepspot-workflow",
  inputSchema: z.object({
    naturalLanguageQuery: z.string()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any()
  })
});
```

**Workflow Steps:**
1. **Input Processing**: Receives natural language query
2. **Schema Discovery**: Searches semantic layer for relevant schema
3. **SQL Generation**: Uses AI to generate SQL with schema context
4. **Conditional Execution**: Only executes if generation was successful
5. **Result Processing**: Returns execution results with metadata

#### 3. Query and Search Vector Step (`src/mastra/steps/getQueryAndSearchVectorStep.ts`)

Finds relevant schema information using vector search:

```typescript
export const getQueryAndSearchVector = createStep({
  id: "get-query-and-search-vector-step",
  inputSchema: z.object({
    naturalLanguageQuery: z.string()
  }),
  outputSchema: z.object({
    tables: z.array(z.object({
      name: z.string(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        description: z.string()
      })),
      description: z.string(),
      schema_name: z.string()
    }))
  })
});
```

### Process Flow

```
Natural Language Query
         ↓
   Query Analysis
         ↓
   Vector Search (Schema Context)
         ↓
   AI SQL Generation
         ↓
   SQL Validation
         ↓
   Database Execution
         ↓
   Results + Artifacts
```

### Example Usage

```typescript
// Input
const query = "Show me the top 10 customers by total order value";

// Processed through workflow
const result = await deepspotWorkflow.execute({
  naturalLanguageQuery: query
});

// Output
{
  success: true,
  result: {
    sql: "SELECT c.name, SUM(o.total) as total_value FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.id, c.name ORDER BY total_value DESC LIMIT 10",
    explanation: "This query finds the top 10 customers by summing their order totals",
    confidence: 0.95,
    data: [...], // Query results
    artifacts: [...] // Generated charts/visualizations
  }
}
```

## Context Management System

The context management system stores and retrieves business context, documentation, and domain knowledge to enhance query understanding.

### Overview

Context management enables DeepSpot to understand business-specific terminology, relationships, and requirements beyond just database schema.

### Key Components

#### 1. Context Tool (`src/mastra/tools/context-tool.ts`)

Provides CRUD operations for context storage:

```typescript
// Store context
export const storeContext = async ({
  title,
  tags,
  markdown,
  isFolder,
  tenantId,
  applicationId
}: ContextEntryMetadata) => Promise<ContextResult>

// Search context
export const searchContext = async ({
  query,
  tags,
  tenantId,
  applicationId
}: SearchParams) => Promise<SearchResult>

// Update context
export const updateContext = async ({
  tenantId,
  id,
  markdown,
  isFolder,
  title,
  tags,
  applicationId
}: UpdateParams) => Promise<UpdateResult>

// Delete context
export const deleteContext = async ({
  id,
  tenantId,
  applicationId
}: DeleteParams) => Promise<DeleteResult>
```

#### 2. Context Service (`src/api/context/service.ts`)

Business logic layer for context operations:

```typescript
export class ContextService {
  static async getContexts(tenantId: string, applicationId: string, params: QueryParams)
  static async getContext(tenantId: string, applicationId: string, id: string)
  static async createContext(tenantId: string, applicationId: string, data: CreateContextData)
  static async updateContext(tenantId: string, applicationId: string, id: string, data: UpdateContextData)
  static async deleteContext(tenantId: string, applicationId: string, id: string)
}
```

#### 3. API Endpoints

**Get All Contexts:**
```http
GET /custom/context?limit=10&offset=0
x-tenant-id: tenant-123
x-application-id: app-456
```

**Create Context:**
```http
POST /custom/context/create
Content-Type: application/json
x-tenant-id: tenant-123
x-application-id: app-456

{
  "title": "Customer Segmentation Rules",
  "tags": ["business_rules", "customer_analysis"],
  "markdown": "# Customer Segmentation\n\n## High Value Customers\n- Order value > $1000\n- Active in last 30 days\n\n## Medium Value Customers\n- Order value $100-$1000\n- Active in last 90 days"
}
```

**Search Context:**
```http
GET /custom/context/search?query=customer%20segmentation&tags=business_rules
x-tenant-id: tenant-123
x-application-id: app-456
```

### Vector Storage

Context is stored as vector embeddings for semantic search:

```sql
CREATE TABLE contents_entries (
  id UUID PRIMARY KEY,
  vector vector(1536),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Metadata Structure:**
```json
{
  "title": "Customer Segmentation Rules",
  "tags": ["business_rules", "customer_analysis"],
  "markdown": "# Customer Segmentation...",
  "isFolder": false,
  "tenantId": "tenant-123",
  "applicationId": "app-456",
  "chunk_text": "High Value Customers: Order value > $1000",
  "search_keywords": ["high", "value", "customers", "order"],
  "searchable_text": "Customer segmentation rules for identifying high value customers"
}
```

### Integration with SQL Generation

Context is automatically retrieved and included in SQL generation prompts:

```typescript
// During SQL generation, context is searched and included
const contextResults = await searchContext({
  query: naturalLanguageQuery,
  tags: ["business_rules", "definitions"],
  tenantId,
  applicationId
});

// Context is added to the system prompt
const systemPrompt = `
${basePrompt}

## Business Context:
${contextResults.map(c => c.searchable_text).join('\n')}
`;
```

## Feedback API

The feedback system collects user interactions and enables continuous improvement of the AI models and query generation.

### Overview

The feedback API tracks user satisfaction, query success rates, and provides data for model improvement through reinforcement learning.

### Key Components

#### 1. Feedback Service (`src/api/feedback/service.ts`)

Manages feedback data and analysis:

```typescript
export class FeedbackService {
  static async getFeedbacks(tenantId: string, applicationId: string, params: QueryParams)
  static async getFeedback(tenantId: string, applicationId: string, id: string)
  static async createFeedback(tenantId: string, applicationId: string, data: FeedbackData)
  static async updateFeedback(tenantId: string, applicationId: string, id: string, data: FeedbackData)
  static async deleteFeedback(tenantId: string, applicationId: string, id: string)
  static async runImproveAgentFromRL(tenantId: string, applicationId: string, daysBack: number)
}
```

#### 2. Feedback Tool (`src/mastra/tools/rl/feedback-tool.ts`)

Handles feedback collection and processing:

```typescript
export const feedbackTool = createTool({
  id: "feedback-collection",
  inputSchema: z.object({
    threadId: z.string(),
    messageId: z.string(),
    query: z.string(),
    explanation: z.string(),
    schema_context: z.any(),
    generated_sql: z.string(),
    executed_success: z.boolean(),
    user_feedback_score: z.number().min(1).max(5),
    business_context: z.string().optional(),
    user_feedback_reason: z.string().optional(),
    reward_signal: z.number().optional()
  })
});
```

#### 3. API Endpoints

**Create Feedback:**
```http
POST /custom/feedback/create
Content-Type: application/json
x-tenant-id: tenant-123
x-application-id: app-456

{
  "threadId": "thread-789",
  "messageId": "msg-101",
  "query": "Show me customer revenue by month",
  "explanation": "Generated SQL to calculate monthly customer revenue",
  "schema_context": {...},
  "generated_sql": "SELECT DATE_TRUNC('month', order_date) as month, SUM(total) as revenue FROM orders GROUP BY month",
  "executed_success": true,
  "user_feedback_score": 4,
  "business_context": "Monthly revenue analysis for executive dashboard",
  "user_feedback_reason": "Query worked well but could include customer count",
  "reward_signal": 0.8
}
```

**Get Feedback Analytics:**
```http
GET /custom/feedback?limit=50&offset=0&startDate=2024-01-01&endDate=2024-01-31
x-tenant-id: tenant-123
x-application-id: app-456
```

**Run Improvement Agent:**
```http
POST /custom/feedback/improve
Content-Type: application/json
x-tenant-id: tenant-123
x-application-id: app-456

{
  "daysBack": 30
}
```

### Feedback Data Model

```sql
CREATE TABLE feedback_entries (
  id UUID PRIMARY KEY,
  thread_id VARCHAR(255),
  message_id VARCHAR(255),
  query TEXT,
  explanation TEXT,
  schema_context JSONB,
  generated_sql TEXT,
  executed_success BOOLEAN,
  user_feedback_score INTEGER CHECK (user_feedback_score >= 1 AND user_feedback_score <= 5),
  business_context TEXT,
  user_feedback_reason TEXT,
  reward_signal DECIMAL(3,2),
  tenant_id VARCHAR(255),
  application_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Reinforcement Learning Integration

The feedback system integrates with reinforcement learning for model improvement:

```typescript
// Trigger improvement job
export const runImproveAgentFromRL = async (
  tenantId: string, 
  applicationId: string, 
  daysBack: number
) => {
  // Collect feedback data from specified time period
  const feedbackData = await collectFeedbackData(tenantId, applicationId, daysBack);
  
  // Process feedback for RL training
  const trainingData = await processFeedbackForRL(feedbackData);
  
  // Trigger model improvement job
  await triggerImprovementJob(trainingData);
  
  return {
    success: true,
    feedbackCount: feedbackData.length,
    improvementJobId: jobId
  };
};
```

## Artifact System

The artifact system generates and stores visualizations, reports, and other outputs from query results.

### Overview

Artifacts are generated outputs that enhance the user experience by providing visual representations of data and reusable query results.

### Key Components

#### 1. Artifact Service (`src/api/artifact/service.ts`)

Manages artifact storage and retrieval:

```typescript
export class ArtifactService {
  static async getArtifacts(tenantId: string, applicationId: string, params: ArtifactQueryParams)
  static async getArtifactsByThreadId(tenantId: string, applicationId: string, threadId: string, params: QueryParams)
  static async getArtifactById(tenantId: string, applicationId: string, id: string)
}
```

#### 2. Artifact Tool (`src/mastra/tools/artifact-tool.ts`)

Handles artifact generation and storage:

```typescript
export const artifactTool = createTool({
  id: "artifact-generation",
  inputSchema: z.object({
    threadId: z.string(),
    title: z.string(),
    content: z.string(),
    type: z.enum(["chart", "table", "report", "insight"]),
    metadata: z.any().optional()
  })
});
```

#### 3. Chart Suggestion Tool (`src/mastra/tools/chart-suggestion.ts`)

Suggests appropriate visualizations for query results:

```typescript
export const chartSuggestionTool = createTool({
  id: "chart-suggestion",
  inputSchema: z.object({
    query: z.string(),
    data: z.array(z.any()),
    columns: z.array(z.string())
  }),
  outputSchema: z.object({
    suggested_charts: z.array(z.object({
      type: z.string(),
      title: z.string(),
      description: z.string(),
      config: z.any()
    }))
  })
});
```

### API Endpoints

**Get Artifacts:**
```http
GET /custom/artifact?limit=10&offset=0&search=revenue
x-tenant-id: tenant-123
x-application-id: app-456
```

**Get Artifacts by Thread:**
```http
GET /custom/artifact/thread/thread-789?limit=5&offset=0
x-tenant-id: tenant-123
x-application-id: app-456
```

**Get Specific Artifact:**
```http
GET /custom/artifact/artifact-123
x-tenant-id: tenant-123
x-application-id: app-456
```

### Artifact Data Model

```sql
CREATE TABLE artifact_entries (
  id UUID PRIMARY KEY,
  title VARCHAR(255),
  content TEXT,
  thread_id VARCHAR(255),
  type VARCHAR(50),
  metadata JSONB,
  tenant_id VARCHAR(255),
  application_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Artifact Types

1. **Charts**: Visual representations of data (bar, line, pie, etc.)
2. **Tables**: Formatted tabular data
3. **Reports**: Comprehensive analysis documents
4. **Insights**: AI-generated insights and recommendations

### Integration with Workflow

Artifacts are automatically generated during query execution:

```typescript
// In the SQL execution workflow
.map(async ({ inputData }) => ({
  can_answer: inputData.can_answer,
  query: inputData.sql,
  generateArtifact: true,  // Enable artifact generation
  generateChart: true,     // Enable chart suggestions
}))
```

## Database Integration

DeepSpot supports multiple database types with a unified interface.

### Supported Databases

1. **PostgreSQL**: Full support with advanced features
2. **BigQuery**: Cloud data warehouse integration

### Database Abstraction

#### 1. Database Types (`src/databases/databaseTypes.ts`)

```typescript
export enum DatabaseType {
  POSTGRESQL = "POSTGRESQL",
  BIGQUERY = "BIGQUERY"
}
```

#### 2. Base Database Client (`src/databases/base-database.ts`)

Common interface for all database clients:

```typescript
export interface DatabaseClient {
  executeQuery(query: string, params?: any[]): Promise<any[]>
  getDatabaseSchema(): Promise<DatabaseSchemaResult>
  getDatabaseTablesBySchema(schema: string): Promise<DatabaseTablesBySchemaResult>
  getDatabaseFieldsAndRelationshipsByTable(schema: string, tables: string[]): Promise<DatabaseFieldsAndRelationshipsResult>
  close(): Promise<void>
}
```

#### 3. PostgreSQL Client (`src/databases/postgres.ts`)

PostgreSQL-specific implementation with pgvector support:

```typescript
export class PostgresClient implements DatabaseClient {
  constructor(connectionString: string)
  
  async executeQuery(query: string, params?: any[]): Promise<any[]>
  async getDatabaseSchema(): Promise<DatabaseSchemaResult>
  async getDatabaseTablesBySchema(schema: string): Promise<DatabaseTablesBySchemaResult>
  async getDatabaseFieldsAndRelationshipsByTable(schema: string, tables: string[]): Promise<DatabaseFieldsAndRelationshipsResult>
  async getSampleData(table: string, column: string, dataType: string, limit: number): Promise<any[]>
  async close(): Promise<void>
}
```

#### 4. BigQuery Client (`src/databases/bigquery.ts`)

BigQuery-specific implementation:

```typescript
export class BigQueryClient implements DatabaseClient {
  constructor(credentials: BigQueryCredentials)
  
  async executeQuery(query: string, params?: any[]): Promise<any[]>
  async getDatabaseSchema(): Promise<DatabaseSchemaResult>
  async getDatabaseTablesBySchema(schema: string): Promise<DatabaseTablesBySchemaResult>
  async getDatabaseFieldsAndRelationshipsByTable(schema: string, tables: string[]): Promise<DatabaseFieldsAndRelationshipsResult>
  async close(): Promise<void>
}
```

### Connection Management

#### Connection Manager (`src/databases/connection-manager.ts`)

Handles database connections and pooling:

```typescript
export class ConnectionManager {
  private static connections: Map<string, DatabaseClient> = new Map()
  
  static async getConnection(tenantId: string, databaseType: DatabaseType, connectionString: string): Promise<DatabaseClient>
  static async closeConnection(tenantId: string): Promise<void>
  static async closeAllConnections(): Promise<void>
}
```

### Database Migrations

Database schema management through migrations:

```bash
# Create a new migration
npm run migrate:create -- --name add_feedback_table

# Run migrations
npm run migrate:up

# Rollback migrations
npm run migrate:down

# Check migration status
npm run migrate:status
```

## API Endpoints

### Authentication

All API endpoints require tenant and application identification:

```http
x-tenant-id: your-tenant-id
x-application-id: your-application-id
```

### Schema Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/custom/semantic/schema` | Get database schema |
| POST | `/custom/semantic/tables-by-schema` | Get tables by schema |
| POST | `/custom/semantic/tables-details` | Get detailed table information |
| POST | `/custom/semantic/generate` | Generate semantic layer |

### Context Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/custom/context` | Get all contexts |
| GET | `/custom/context/:id` | Get specific context |
| POST | `/custom/context/create` | Create new context |
| PUT | `/custom/context/:id` | Update context |
| DELETE | `/custom/context/:vector_id` | Delete context |

### Feedback Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/custom/feedback` | Get feedback entries |
| GET | `/custom/feedback/:id` | Get specific feedback |
| POST | `/custom/feedback/create` | Create feedback |
| PUT | `/custom/feedback/update/:id` | Update feedback |
| DELETE | `/custom/feedback/:id` | Delete feedback |
| POST | `/custom/feedback/improve` | Run improvement agent |

### Artifact Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/custom/artifact` | Get all artifacts |
| GET | `/custom/artifact/thread/:threadId` | Get artifacts by thread |
| GET | `/custom/artifact/:id` | Get specific artifact |

### Tenant Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/custom/tenant` | Get tenant information |
| POST | `/custom/tenant/create` | Create new tenant |
| PUT | `/custom/tenant/:id` | Update tenant |

## Getting Started

### Prerequisites

- Node.js >= 20.9.0
- PostgreSQL with pgvector extension
- Redis (optional, for caching)
- OpenAI API key

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd deepspot-query-executor
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database Configuration
POSTGRES_CONNECTION_STRING=postgresql://user:password@localhost:5432/deepspot
REDIS_URL=redis://localhost:6379

# AI Configuration
OPENAI_API_KEY=your-openai-api-key

# Application Configuration
NODE_ENV=development
PORT=3000
```

4. **Set up the database:**
```bash
# Run migrations
npm run migrate:up

# Verify setup
npm run migrate:status
```

5. **Start the development server:**
```bash
npm run dev
```

### First Steps

1. **Create a tenant:**
```http
POST /custom/tenant/create
Content-Type: application/json

{
  "name": "My Company",
  "databaseType": "POSTGRESQL",
  "connectionString": "postgresql://user:pass@host:port/db"
}
```

2. **Generate semantic layer:**
```http
POST /custom/semantic/generate
Content-Type: application/json
x-tenant-id: your-tenant-id
x-application-id: your-app-id

{
  "table": "users",
  "columns": [...],
  "relationships": [...],
  "context": "E-commerce platform"
}
```

3. **Test a query:**
```typescript
import { mastra } from './src/mastra';

const result = await mastra.workflows.deepspotWorkflow.execute({
  naturalLanguageQuery: "Show me the top 10 customers by revenue"
});

console.log(result);
```

## Development Guide

### Project Structure

```
src/
├── api/                    # REST API endpoints
│   ├── artifact/          # Artifact management
│   ├── context/           # Context management
│   ├── feedback/          # Feedback system
│   ├── schema/            # Schema management
│   └── tenant/            # Tenant management
├── databases/             # Database abstraction
│   ├── migrations/        # Database migrations
│   ├── postgres.ts        # PostgreSQL client
│   ├── bigquery.ts        # BigQuery client
│   └── connection-manager.ts
├── mastra/                # Mastra framework integration
│   ├── agents/            # AI agents
│   ├── lib/               # Utility libraries
│   ├── steps/             # Workflow steps
│   ├── tools/             # Reusable tools
│   └── workflows/         # Workflow definitions
├── prompts/               # AI prompts
└── types.ts               # TypeScript definitions
```

### Adding New Tools

1. **Create the tool file:**
```typescript
// src/mastra/tools/my-new-tool.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const myNewTool = createTool({
  id: "my-new-tool",
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  }),
  description: "Description of what this tool does",
  execute: async ({ context }) => {
    // Tool implementation
    return { output: "result" };
  }
});
```

2. **Export from tools index:**
```typescript
// src/mastra/tools/index.ts
export { myNewTool } from "./my-new-tool";
```

3. **Use in workflows:**
```typescript
// src/mastra/workflows/my-workflow.ts
import { myNewTool } from "../tools";

export const myWorkflow = createWorkflow({
  // ... workflow definition
}).then(myNewTool);
```

### Adding New API Endpoints

1. **Create route file:**
```typescript
// src/api/my-endpoint/route.ts
import { registerApiRoute } from "@mastra/core/server";

export const myEndpoint = registerApiRoute("/custom/my-endpoint", {
  method: "POST",
  handler: async (c) => {
    // Handler implementation
    return c.json({ success: true });
  }
});
```

2. **Create service file:**
```typescript
// src/api/my-endpoint/service.ts
export class MyEndpointService {
  static async processData(data: any) {
    // Business logic
    return { result: "processed" };
  }
}
```

3. **Export from API index:**
```typescript
// src/api/index.ts
export { myEndpoint } from "./my-endpoint/route";
```

### Database Migrations

1. **Create migration:**
```bash
npm run migrate:create -- --name add_my_table
```

2. **Edit migration file:**
```typescript
// src/databases/migrations/YYYYMMDD_add_my_table.ts
export const up = async (db: any) => {
  await db.execute(`
    CREATE TABLE my_table (
      id UUID PRIMARY KEY,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
};

export const down = async (db: any) => {
  await db.execute(`DROP TABLE my_table;`);
};
```

3. **Run migration:**
```bash
npm run migrate:up
```

### Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --grep "specific test"
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type check
npm run type-check
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Issues

**Problem**: Cannot connect to PostgreSQL
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**:
- Verify PostgreSQL is running: `pg_ctl status`
- Check connection string format
- Ensure database exists
- Verify user permissions

#### 2. pgvector Extension Missing

**Problem**: Vector operations fail
```
Error: type "vector" does not exist
```

**Solution**:
```sql
-- Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

#### 3. OpenAI API Issues

**Problem**: Embedding generation fails
```
Error: Invalid API key
```

**Solution**:
- Verify API key is correct
- Check API key permissions
- Ensure sufficient credits
- Verify rate limits

#### 4. Memory Issues

**Problem**: Out of memory during large operations
```
Error: JavaScript heap out of memory
```

**Solution**:
- Increase Node.js memory: `node --max-old-space-size=4096`
- Process data in smaller batches
- Optimize vector operations
- Use streaming for large datasets

#### 5. Vector Search Performance

**Problem**: Slow vector similarity search

**Solution**:
- Ensure proper indexing: `CREATE INDEX ON table USING ivfflat (vector vector_cosine_ops)`
- Tune index parameters for your data size
- Consider using HNSW index for better performance
- Optimize query filters

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
NODE_ENV=development
```

### Performance Monitoring

Monitor key metrics:

```typescript
// Add to your application
import { performance } from 'perf_hooks';

const start = performance.now();
// ... operation
const end = performance.now();
console.log(`Operation took ${end - start} milliseconds`);
```

### Health Checks

Implement health check endpoints:

```typescript
// src/api/health/route.ts
export const healthCheck = registerApiRoute("/health", {
  method: "GET",
  handler: async (c) => {
    const checks = {
      database: await checkDatabaseConnection(),
      vector: await checkVectorStore(),
      openai: await checkOpenAI()
    };
    
    const healthy = Object.values(checks).every(check => check);
    
    return c.json({
      status: healthy ? "healthy" : "unhealthy",
      checks
    }, healthy ? 200 : 503);
  }
});
```

### Logging

Configure structured logging:

```typescript
import { createLogger } from '@mastra/loggers';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: 'json'
});

logger.info('Operation completed', {
  operation: 'sql_generation',
  duration: 1500,
  success: true
});
```

---

This documentation provides a comprehensive guide to understanding and working with the DeepSpot Query Executor system. For additional support or questions, please refer to the project's issue tracker or contact the development team.
