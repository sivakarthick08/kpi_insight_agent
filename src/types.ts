export interface SchemaField {
  name: string;
  type: string;
  description: string;
  example: string;
}

// New interface to support the column format from nvpl_meta_data.json
export interface SchemaColumn {
  name: string;
  type: string;
  description: string;
  column_name?: string;
  data_type?: string;
  example?: string;
}

export interface TableMetadata {
  table_name: string;
  description: string;
  schema: string;
  table_id: string;
  is_considered: boolean;
  fields: SchemaField[];
  relationships: any[];
  metrics: any[];
  categories: any[];
}

// New interface to support the nvpl format
export interface NvplTableMetadata {
  table_name: string;
  description: string;
  fields: SchemaColumn[];
  relationships: any[];
  metrics: any[];
}

export interface SemanticLayerEntry {
  id: string;
  tenant_id: string;
  content_type: "table" | "field" | "relationship" | "metric" | "category";
  content: any;
  embedding: number[][];
  usage: number | null;
  metadata: {
    table_name?: string;
    field_name?: string;
    description?: string;
    tags: string[];
    relevance_score?: number;
  };
  created_at: Date;
  updated_at: Date;
}

export interface SchemaData {
  tables: TableMetadata[];
}

// ===== DATABASE RESULT INTERFACES =====

// Common database schema information
export interface DatabaseSchema {
  catalog_name?: string;
  schema_name: string;
  schema_owner?: string;
  default_character_set_catalog?: string;
  default_character_set_schema?: string;
  default_character_set_name?: string;
  sql_path?: string;
  [key: string]: any; // Allow additional properties from different databases
}

// Database schema result
export interface DatabaseSchemaResult {
  schema: DatabaseSchema[];
}

// Common table information
export interface DatabaseTable {
  table_name: string;
  table_schema?: string;
  table_type?: string;
  table_catalog?: string;
  [key: string]: any; // Allow additional properties from different databases
}

// Database tables by schema result
export interface DatabaseTablesBySchemaResult {
  tables: DatabaseTable[];
}

// Common column information
export interface DatabaseColumn {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  character_maximum_length?: number | null;
  numeric_precision?: number | null;
  numeric_scale?: number | null;
  is_nullable: string | boolean;
  column_default?: string | null;
  is_primary_key?: boolean;
  ordinal_position?: number;
  is_generated?: string | boolean;
  generation_expression?: string | null;
  is_stored?: string | boolean;
  is_updatable?: string | boolean;
  is_hidden?: string | boolean;
  is_system_defined?: string | boolean;
  is_partitioning_column?: string | boolean;
  clustering_ordinal_position?: number | null;
  collation_name?: string | null;
  datetime_precision?: number | null;
  [key: string]: any; // Allow additional properties from different databases
}

// Common relationship information
export interface DatabaseRelationship {
  table_schema: string;
  table_name: string;
  column_name: string;
  foreign_table_schema: string;
  foreign_table_name: string;
  foreign_column_name: string;
  constraint_name: string;
  [key: string]: any; // Allow additional properties from different databases
}

// Common index information
export interface DatabaseIndex {
  schema_name?: string;
  table_name: string;
  index_name: string;
  index_definition?: string;
  [key: string]: any; // Allow additional properties from different databases
}

// Common primary key information
export interface DatabasePrimaryKey {
  table_schema: string;
  table_name: string;
  column_name: string;
  constraint_name: string;
  ordinal_position?: number;
  [key: string]: any; // Allow additional properties from different databases
}

// Common table metadata information
export interface DatabaseTableMetadata {
  table_schema: string;
  table_name: string;
  table_type?: string;
  creation_time?: string | Date;
  last_modified_time?: string | Date;
  table_size?: number | string;
  row_count?: number | string;
  is_partitioned?: string | boolean;
  partition_expression?: string | null;
  clustering_fields?: string | null;
  [key: string]: any; // Allow additional properties from different databases
}

// Database fields and relationships result
export interface DatabaseFieldsAndRelationshipsResult {
  tables: string[];
  columns: DatabaseColumn[];
  relationships?: DatabaseRelationship[];
  indexes?: DatabaseIndex[];
  primaryKeys?: DatabasePrimaryKey[];
  tableMetadata?: DatabaseTableMetadata[];
}

// Base interface for all database clients
export interface DatabaseClient {
  executeQuery(query: string, params?: any[]): Promise<any[]>;
  getDatabaseSchema(): Promise<DatabaseSchemaResult>;
  getDatabaseTablesBySchema(schema: string): Promise<DatabaseTablesBySchemaResult>;
  getDatabaseFieldsAndRelationshipsByTable(
    schema: string,
    tables: string[]
  ): Promise<DatabaseFieldsAndRelationshipsResult>;
  close(): Promise<void>;
}
