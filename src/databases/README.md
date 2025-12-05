# Database Type Interfaces

This directory contains database clients with consistent type interfaces to ensure uniform data structures across different database systems.

## Overview

All database clients implement the same interface and return standardized data structures for:
- `getDatabaseSchema()`
- `getDatabaseTablesBySchema(schema: string)`
- `getDatabaseFieldsAndRelationshipsByTable(schema: string, tables: string[])`

## Type Interfaces

### DatabaseSchemaResult
```typescript
interface DatabaseSchemaResult {
  schema: DatabaseSchema[];
}

interface DatabaseSchema {
  catalog_name?: string;
  schema_name: string;
  schema_owner?: string;
  default_character_set_catalog?: string;
  default_character_set_schema?: string;
  default_character_set_name?: string;
  sql_path?: string;
  [key: string]: any; // Allow additional properties from different databases
}
```

### DatabaseTablesBySchemaResult
```typescript
interface DatabaseTablesBySchemaResult {
  tables: DatabaseTable[];
}

interface DatabaseTable {
  table_name: string;
  table_schema?: string;
  table_type?: string;
  table_catalog?: string;
  [key: string]: any; // Allow additional properties from different databases
}
```

### DatabaseFieldsAndRelationshipsResult
```typescript
interface DatabaseFieldsAndRelationshipsResult {
  tables: string[];
  columns: DatabaseColumn[];
  relationships: DatabaseRelationship[];
  indexes?: DatabaseIndex[];
  primaryKeys?: DatabasePrimaryKey[];
  tableMetadata?: DatabaseTableMetadata[];
}
```

## Database Clients

### PostgreSQL Client
```typescript
import { PostgresClient } from './postgres';

const client = new PostgresClient('postgresql://user:password@localhost:5432/dbname');

// Returns DatabaseSchemaResult
const schemaResult = await client.getDatabaseSchema();

// Returns DatabaseTablesBySchemaResult
const tablesResult = await client.getDatabaseTablesBySchema('public');

// Returns DatabaseFieldsAndRelationshipsResult
const fieldsResult = await client.getDatabaseFieldsAndRelationshipsByTable('public', ['users', 'orders']);
```

### BigQuery Client
```typescript
import { BigQueryClient } from './bigquery';

const credentials = {
  type: 'service_account',
  project_id: 'your-project-id',
  private_key: 'your-private-key',
  client_email: 'your-service-account@your-project.iam.gserviceaccount.com',
  // ... other credentials
};

const client = new BigQueryClient(credentials);

// Returns DatabaseSchemaResult
const schemaResult = await client.getDatabaseSchema();

// Returns DatabaseTablesBySchemaResult
const tablesResult = await client.getDatabaseTablesBySchema('your_dataset');

// Returns DatabaseFieldsAndRelationshipsResult
const fieldsResult = await client.getDatabaseFieldsAndRelationshipsByTable('your_dataset', ['users', 'orders']);
```

## Base Database Client

All database clients extend `BaseDatabaseClient` which provides:
- Common interface implementation
- Helper methods for validation and error handling
- Standardized error message formatting

```typescript
import { BaseDatabaseClient } from './base-database';

class CustomDatabaseClient extends BaseDatabaseClient {
  // Implement required abstract methods
  async executeQuery(query: string, params?: any[]): Promise<any[]> {
    // Your implementation
  }
  
  async getDatabaseSchema(): Promise<DatabaseSchemaResult> {
    // Your implementation
  }
  
  async getDatabaseTablesBySchema(schema: string): Promise<DatabaseTablesBySchemaResult> {
    // Your implementation
  }
  
  async getDatabaseFieldsAndRelationshipsByTable(
    schema: string,
    tables: string[]
  ): Promise<DatabaseFieldsAndRelationshipsResult> {
    // Your implementation
  }
  
  async close(): Promise<void> {
    // Your implementation
  }
}
```

## Polymorphic Usage

The consistent interfaces allow you to write code that works with any database client:

```typescript
import { DatabaseClient } from '../../../types';

async function processDatabase(client: DatabaseClient) {
  const schemaResult = await client.getDatabaseSchema();
  const tablesResult = await client.getDatabaseTablesBySchema('schema_name');
  const fieldsResult = await client.getDatabaseFieldsAndRelationshipsByTable('schema_name', ['table1', 'table2']);
  
  // Process results consistently regardless of database type
  console.log(`Found ${schemaResult.schema.length} schemas`);
  console.log(`Found ${tablesResult.tables.length} tables`);
  console.log(`Found ${fieldsResult.columns.length} columns`);
}
```

## Data Structure Differences

While the interfaces are consistent, different databases may return additional properties:

### PostgreSQL
- Returns `indexes` in `DatabaseFieldsAndRelationshipsResult`
- Uses `information_schema` for metadata queries
- Includes PostgreSQL-specific column properties

### BigQuery
- Returns `primaryKeys` and `tableMetadata` in `DatabaseFieldsAndRelationshipsResult`
- Uses BigQuery-specific metadata tables
- Includes BigQuery-specific column properties like `clustering_ordinal_position`

## Error Handling

All database clients use standardized error handling through the base class:

```typescript
// Validation helper
this.validateSchemaAndTables(schema, tables);

// Error message helper
throw new Error(this.createErrorMessage("get database schema", error));
```

## Example Usage

See `example-usage.ts` for comprehensive examples of how to use the database clients with the type interfaces.

## Adding New Database Clients

To add a new database client:

1. Extend `BaseDatabaseClient`
2. Implement all required abstract methods
3. Return data in the standardized format
4. Add to the exports in `index.ts`

```typescript
export class NewDatabaseClient extends BaseDatabaseClient {
  constructor(connectionString: string) {
    super();
    // Initialize your database connection
  }
  
  // Implement all abstract methods...
}
```
