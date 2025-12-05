# Text-to-SQL Workflow with Semantic Layer

A Mastra workflow system for database introspection and natural language to SQL conversion. This system now uses a semantic layer API instead of direct database connections, with Redis caching for improved performance.

## Features

- **Semantic Layer Integration**: Fetches database schema from a semantic layer API instead of connecting directly to databases
- **Redis Caching**: Caches schema data under tenant IDs for improved performance
- **AI-Powered Query Generation**: Converts natural language queries to SQL using AI
- **Safe SQL Execution**: Executes generated SQL queries with proper error handling
- **Interactive Workflows**: Step-by-step workflow for database operations

## Architecture

### Components

1. **Semantic Layer Tool** (`semantic-layer-tool.ts`): Fetches schema from API endpoints
2. **Redis Cache Tools** (`redis-cache-tool.ts`): Handles caching and retrieval of schema data
3. **SQL Generation Tool** (`sql-generation-tool.ts`): Converts natural language to SQL
4. **SQL Execution Tool** (`sql-execution-tool.ts`): Executes SQL queries safely
5. **Database Query Workflow** (`database-query-workflow.ts`): Main workflow orchestrating the process

### Workflow Steps

1. **Get Tenant and Connection**: Collects tenant ID, connection string, API endpoint, and Redis URL
2. **Get Schema from Semantic Layer**: Fetches schema from API with Redis caching
3. **Generate SQL**: Converts natural language query to SQL
4. **Review and Execute**: Reviews and executes the generated SQL

## Setup

### Prerequisites

- Node.js >= 20.9.0
- Redis server running
- Semantic layer API endpoint
- PostgreSQL database

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file with the following variables:

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Semantic Layer API
SEMANTIC_LAYER_API_ENDPOINT=https://api.semantic-layer.com
SEMANTIC_LAYER_API_KEY=your-api-key

# PostgreSQL (for execution)
DATABASE_URL=postgresql://user:password@localhost:5432/database
```

## Usage

### Running the Workflow

```bash
npm run dev
```

### Workflow Input

The workflow expects the following information:

1. **Tenant ID**: Unique identifier for the tenant (e.g., 'tenant-123')
2. **Connection String**: PostgreSQL connection string for query execution
3. **API Endpoint**: Semantic layer API endpoint (e.g., 'https://api.semantic-layer.com')
4. **Redis URL**: Redis connection URL (e.g., 'redis://localhost:6379')
5. **API Key**: Optional API key for semantic layer authentication

### Example Usage

```typescript
import { mastra } from './src/mastra';

// Start the workflow
const result = await mastra.workflows.databaseQueryWorkflow.execute({
  // The workflow will prompt for input
});
```

## Semantic Layer API

The semantic layer API should provide schema information in the following format:

```json
{
  "tables": [
    {
      "schema_name": "public",
      "table_name": "users",
      "table_owner": "postgres"
    }
  ],
  "fields": [
    {
      "table_schema": "public",
      "table_name": "users",
      "column_name": "id",
      "data_type": "integer",
      "is_nullable": "NO",
      "is_primary_key": true
    }
  ],
  "relationships": [
    {
      "table_name": "orders",
      "column_name": "user_id",
      "foreign_table_name": "users",
      "foreign_column_name": "id"
    }
  ],
  "indexes": [
    {
      "table_name": "users",
      "index_name": "users_pkey"
    }
  ],
  "summary": {
    "total_tables": 5,
    "total_columns": 25,
    "total_relationships": 3,
    "total_indexes": 8
  }
}
```

## Redis Caching

The system caches schema data in Redis using the following pattern:

- **Cache Key**: `schema:{tenantId}`
- **TTL**: 3600 seconds (1 hour) by default
- **Data Format**: JSON serialized schema data

### Cache Benefits

- **Performance**: Avoids repeated API calls for the same tenant
- **Reduced Load**: Reduces load on the semantic layer API
- **Offline Capability**: Can work with cached data when API is unavailable

## Development

### Adding New Tools

1. Create a new tool file in `src/mastra/tools/`
2. Export the tool from the tools directory
3. Import and use in workflows as needed

### Modifying the Workflow

The workflow is defined in `src/mastra/workflows/database-query-workflow.ts`. Each step can be modified or extended as needed.

## Error Handling

The system includes comprehensive error handling for:

- Network failures when fetching from semantic layer
- Redis connection issues
- Invalid schema data
- SQL generation failures
- Query execution errors

## Security Considerations

- API keys are handled securely
- Database connections use connection strings
- Redis connections are properly closed
- Input validation is performed at each step

## Performance Optimization

- Schema caching reduces API calls
- Connection pooling for database operations
- Efficient Redis operations
- Lazy loading of schema data

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**: Check Redis server is running and URL is correct
2. **API Endpoint Unreachable**: Verify semantic layer API is accessible
3. **Schema Data Invalid**: Ensure API returns data in expected format
4. **Database Connection Failed**: Check PostgreSQL connection string

### Debug Mode

Enable debug logging by setting the logger level to 'debug' in the Mastra configuration.
