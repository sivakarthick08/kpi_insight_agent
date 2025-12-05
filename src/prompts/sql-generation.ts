import { DatabaseType } from "../databases/databaseTypes";

export function createRestrictiveSQLPrompt(
  instructions: string,
  availableTables: any,
  databaseType: DatabaseType
): string {
  const schemaDescription = availableTables
    .map((table: any) => {
      // Build the fully qualified table name
      let fullTableName: string;

      if (databaseType === "databricks" && table.catalog_name) {
        fullTableName = `${table.catalog_name}.${table.schema_name}.${table.name}`;
      }  else if (databaseType === "bigquery" && table.schema_name) {
        fullTableName = `${table.schema_name}.${table.name}`;
      } else {
        fullTableName = `${table.name}`;
      }

      return `
      Table Name: ${fullTableName}
      Table Description: ${table.description}
      Table Fields: ${table.fields
        .map(
          (field: any) => `
          Field Name: ${field.field_name}
          Field Type: ${field.field_type}
          Field Description: ${field.field_description}
          Sample Data: ${field.sample_data.length > 0 ? field.sample_data.map((data: any) => JSON.stringify(data)).join(", ") : "No sample data available"}
          `
        )
        .join("\n")}
        `;
    })
    .join("\n");

  // Database-specific configurations
  const dbConfig = getDatabaseSpecificConfig(databaseType);

  // Handle NoSQL databases differently
  if (dbConfig.isNoSQL) {
    return `
    Developer: # ROLE
  You are a business-aware ${databaseType} query generator. Generate queries compatible with ${databaseType}'s query language.
  
  # PRINCIPLES
  - Every step is reasoned and linked.
  - Minimize output to essentials
  - Generate queries that are 100% compatible with ${databaseType}
  
  # AVAILABLE COLLECTIONS/TABLES
  ${schemaDescription}
  
  # DATE: ${new Date().toISOString()}
  
  # ${databaseType.toUpperCase()}-SPECIFIC RULES
  ${dbConfig.rules}
  
  # OUTPUT FORMAT
  {
    can_answer: boolean
    reason: string
    query: string
    explanation: string
    confidence: number
    assumptions: string[]
    collections_used: string[]
  }
  `;
  }

  return `
# ROLE
You are a ${databaseType} SQL generator. Generate accurate SQL queries using the provided schema.

# AVAILABLE TABLES AND FIELDS
${schemaDescription}

# DATE: ${new Date().toISOString()}

# DATABASE-SPECIFIC RULES FOR ${databaseType.toUpperCase()}
${dbConfig.rules}

# CRITICAL RULES
1. **Sample Data Adherence**: ONLY use values from the provided sample data. DO NOT hallucinate or assume other possible values (e.g., if sample shows "CANCEL", don't assume "Y", "YES", "CANCELLED", "1", "TRUE" exist)
2. **Field Names**: Use exact field names from schema with proper quoting: ${dbConfig.identifierQuoteRule}
3. **Flexible Field Matching**: Match fields by semantic meaning (e.g., "revenue" matches "sales_amount")
4. **Default Limit**: Add ${dbConfig.limitClause} unless user specifies otherwise
5. **SQL Compatibility**: Use only ${databaseType}-compatible syntax and functions

# WHEN TO ANSWER
- Set can_answer: true if relevant fields/tables exist
- Set can_answer: false only if no relevant fields are available

# OUTPUT FORMAT
{
  can_answer: boolean
  reason: string
  sql: string
  explanation: string
  confidence: number
  assumptions: string[]
  tables_used: string[]
}

# EXAMPLE
{
  can_answer: true
  reason: "Found category and amount fields in invoices table"
  sql: "SELECT category, SUM(amount) as total FROM invoices WHERE status = 'paid' GROUP BY category ORDER BY total DESC LIMIT 10"
  explanation: "Aggregates paid invoice amounts by category"
  confidence: 0.9
  assumptions: ["Using 'paid' from sample data"],
  tables_used: ["invoices"]
}
  `;
}

function getDatabaseSpecificConfig(databaseType: DatabaseType) {
  const configs: Record<string, any> = {
    postgresql: {
      isNoSQL: false,
      identifierQuoteRule:
        '- ALWAYS wrap identifiers with double-quotes ("field").',
      identifierExample:
        'Example: SELECT "field" FROM "schema"."table" WHERE "col" ILIKE \'%abc%\'',
      caseInsensitiveOp: "ILIKE or LOWER()",
      dateCastRule: "Cast date fields using ::TEXT or CAST(field AS TEXT).",
      limitClause: "LIMIT 10",
      functionWarning: "Ensure functions are PostgreSQL-compatible.",
      rules: `
  ## PostgreSQL-Specific Syntax
  - **Identifiers**: Use double-quotes ("column_name", "table_name")
  - **Rounding**: Use ROUND(column::numeric, decimals) or ROUND(CAST(column AS numeric), decimals)
    Example: ROUND(price::numeric, 2) or ROUND(CAST(price AS numeric), 2)
  - **Type Casting**: Use CAST(column AS type) or column::type
    Example: CAST(value AS INTEGER) or value::INTEGER
  - **String Matching**: Use ILIKE for case-insensitive matching (PostgreSQL-specific)
    Example: "name" ILIKE '%john%'
  - **Date Functions**: 
    - CURRENT_DATE, CURRENT_TIMESTAMP, NOW()
    - DATE_TRUNC('day', timestamp_column)
    - EXTRACT(YEAR FROM date_column)
    - AGE(timestamp1, timestamp2)
    - date_column + INTERVAL '1 day'
  - **String Functions**: 
    - CONCAT(str1, str2) or str1 || str2
    - LOWER(), UPPER(), TRIM(), LTRIM(), RTRIM()
    - POSITION('substring' IN string)
    - SUBSTRING(string FROM start FOR length)
  - **Aggregation**: COUNT(), SUM(), AVG(), MIN(), MAX()
  - **Array Support**: ARRAY_AGG(), UNNEST()
  - **JSON Functions**: ->, ->>, #>, #>>, jsonb_* functions
  - **Window Functions**: ROW_NUMBER(), RANK(), LAG(), LEAD() OVER (PARTITION BY ... ORDER BY ...)
  - **CTEs**: WITH clause is fully supported
  - **Boolean**: TRUE/FALSE (not 1/0)
      `,
    },
    mysql: {
      isNoSQL: false,
      identifierQuoteRule:
        "- ALWAYS wrap identifiers with backticks (`field`).",
      identifierExample:
        "Example: SELECT `field` FROM `schema`.`table` WHERE `col` LIKE '%abc%'",
      caseInsensitiveOp: "LIKE (case-insensitive by default) or LOWER()",
      dateCastRule:
        "Cast date fields using CAST(field AS CHAR) or DATE_FORMAT().",
      limitClause: "LIMIT 10",
      functionWarning:
        "MySQL has limited window function support in versions < 8.0.",
      rules: `
  ## MySQL-Specific Syntax
  - **Identifiers**: Use backticks (\`column_name\`, \`table_name\`)
  - **Rounding**: Use ROUND(column, decimals) directly
    Example: ROUND(price, 2)
  - **Type Casting**: Use CAST(column AS type)
    Example: CAST(value AS SIGNED), CAST(value AS UNSIGNED), CAST(date AS CHAR)
  - **String Matching**: LIKE is case-insensitive by default in MySQL
    Example: \`name\` LIKE '%john%'
  - **Date Functions**:
    - CURDATE(), NOW(), CURRENT_TIMESTAMP()
    - DATE_FORMAT(date, '%Y-%m-%d')
    - YEAR(date), MONTH(date), DAY(date)
    - DATEDIFF(date1, date2)
    - DATE_ADD(date, INTERVAL 1 DAY)
  - **String Functions**:
    - CONCAT(str1, str2, ...)
    - LOWER(), UPPER(), TRIM(), LTRIM(), RTRIM()
    - LOCATE(substring, string) or INSTR(string, substring)
    - SUBSTRING(string, start, length)
  - **Aggregation**: COUNT(), SUM(), AVG(), MIN(), MAX()
  - **Window Functions** (MySQL 8.0+): ROW_NUMBER(), RANK() OVER (PARTITION BY ... ORDER BY ...)
  - **CTEs** (MySQL 8.0+): WITH clause
  - **LIMIT**: LIMIT 10 or LIMIT 10 OFFSET 5
  - **Boolean**: TRUE/FALSE or 1/0
      `,
    },
    mariadb: {
      isNoSQL: false,
      identifierQuoteRule:
        "- ALWAYS wrap identifiers with backticks (`field`).",
      identifierExample:
        "Example: SELECT `field` FROM `schema`.`table` WHERE `col` LIKE '%abc%'",
      caseInsensitiveOp: "LIKE (case-insensitive by default) or LOWER()",
      dateCastRule:
        "Cast date fields using CAST(field AS CHAR) or DATE_FORMAT().",
      limitClause: "LIMIT 10",
      functionWarning:
        "MariaDB syntax is similar to MySQL with some extensions.",
      rules: `
  ## MariaDB-Specific Syntax
  - **Identifiers**: Use backticks (\`column_name\`, \`table_name\`)
  - **Rounding**: Use ROUND(column, decimals)
    Example: ROUND(price, 2)
  - **Type Casting**: Use CAST(column AS type)
    Example: CAST(value AS SIGNED), CAST(date AS CHAR)
  - **String Matching**: LIKE is case-insensitive by default
  - **Date Functions**:
    - CURDATE(), NOW(), CURRENT_TIMESTAMP()
    - DATE_FORMAT(date, '%Y-%m-%d')
    - YEAR(date), MONTH(date), DAY(date)
    - DATEDIFF(date1, date2)
  - **String Functions**: CONCAT(), LOWER(), UPPER(), TRIM(), SUBSTRING()
  - **Window Functions** (MariaDB 10.2+): ROW_NUMBER(), RANK() OVER ()
  - **CTEs**: WITH clause supported
  - **JSON Functions**: JSON_EXTRACT(), JSON_VALUE() (MariaDB 10.2+)
      `,
    },
    databricks: {
      isNoSQL: false,
      identifierQuoteRule:
        "- ALWAYS wrap identifiers with backticks (`field`).",
      identifierExample:
        "Example: SELECT `field` FROM `catalog`.`schema`.`table` WHERE `col` LIKE '%abc%'",
      caseInsensitiveOp:
        "LIKE with LOWER() or built-in case-insensitive collation",
      dateCastRule:
        "Cast date fields using CAST(field AS STRING) or DATE_FORMAT().",
      limitClause: "LIMIT 10",
      functionWarning: "Use Spark SQL functions only.",
      rules: `
  ## Databricks/Spark SQL-Specific Syntax
  - **Three-level Namespace**: Use \`catalog\`.\`schema\`.\`table\` format when catalog is available
  - **Identifiers**: Use backticks for all identifiers
  - **Rounding**: Use ROUND(column, decimals) directly on numeric types
    Example: ROUND(price, 2)
  - **Type Casting**: Use CAST(column AS type)
    Example: CAST(value AS INT), CAST(value AS BIGINT), CAST(date AS STRING)
  - **String Matching**: Use LIKE with LOWER() for case-insensitive
    Example: LOWER(\`column\`) LIKE LOWER('%abc%')
  - **Date Functions**:
    - CURRENT_DATE(), CURRENT_TIMESTAMP()
    - DATE_TRUNC('day', timestamp_column)
    - YEAR(date), MONTH(date), DAY(date), DAYOFWEEK(date)
    - DATEDIFF(date1, date2), DATE_ADD(date, days)
    - DATE_FORMAT(date, 'yyyy-MM-dd')
    - TO_DATE(string), TO_TIMESTAMP(string)
  - **String Functions**:
    - CONCAT(str1, str2, ...)
    - LOWER(), UPPER(), TRIM(), LTRIM(), RTRIM()
    - INSTR(string, substring) or LOCATE(substring, string)
    - SUBSTRING(string, start, length) or SUBSTR()
  - **Aggregation**: COUNT(), SUM(), AVG(), MIN(), MAX(), COLLECT_LIST(), COLLECT_SET()
  - **Array Functions**: ARRAY_CONTAINS(), EXPLODE(), SIZE(), ARRAY()
  - **Window Functions**: ROW_NUMBER(), RANK(), DENSE_RANK(), LAG(), LEAD() OVER ()
  - **CTEs**: WITH clause fully supported
  - **Delta Lake**: MERGE, TIME TRAVEL with VERSION AS OF or TIMESTAMP AS OF
  - **Boolean**: TRUE/FALSE
      `,
    },
    bigquery: {
      isNoSQL: false,
      identifierQuoteRule:
        "- ALWAYS wrap identifiers with backticks (`field`).",
      identifierExample:
        "Example: SELECT `field` FROM `project.dataset.table` WHERE `col` LIKE '%abc%'",
      caseInsensitiveOp: "LOWER() with LIKE",
      dateCastRule:
        "Cast date fields using CAST(field AS STRING) or FORMAT_DATE().",
      limitClause: "LIMIT 10",
      functionWarning: "Use BigQuery Standard SQL functions only.",
      rules: `
  ## BigQuery-Specific Syntax
  - **Three-level Namespace**: Use \`project.dataset.table\` format (backticks required for full path)
  - **Identifiers**: Use backticks for identifiers with special chars or reserved words
  - **Rounding**: Use ROUND(column, decimals)
    Example: ROUND(price, 2)
  - **Type Casting**: Use CAST(column AS type) or SAFE_CAST()
    Example: CAST(value AS INT64), CAST(value AS FLOAT64), SAFE_CAST(value AS INT64)
  - **String Matching**: Use LOWER() with LIKE for case-insensitive
    Example: LOWER(\`name\`) LIKE '%john%'
  - **Date Functions**:
    - CURRENT_DATE(), CURRENT_TIMESTAMP()
    - DATE_TRUNC(date, DAY/MONTH/YEAR)
    - EXTRACT(YEAR FROM date)
    - DATE_DIFF(date1, date2, DAY)
    - DATE_ADD(date, INTERVAL 1 DAY)
    - FORMAT_DATE('%Y-%m-%d', date)
    - PARSE_DATE('%Y-%m-%d', string)
  - **String Functions**:
    - CONCAT(str1, str2, ...)
    - LOWER(), UPPER(), TRIM(), LTRIM(), RTRIM()
    - STRPOS(string, substring) for position
    - SUBSTR(string, start, length)
  - **Aggregation**: COUNT(), SUM(), AVG(), MIN(), MAX(), ARRAY_AGG(), STRING_AGG()
  - **Array Functions**: ARRAY_LENGTH(), UNNEST(), ARRAY()
  - **Struct Functions**: STRUCT(), dot notation for nested fields
  - **Window Functions**: ROW_NUMBER(), RANK(), LAG(), LEAD() OVER ()
  - **CTEs**: WITH clause fully supported
  - **QUALIFY**: Use QUALIFY clause for window function filtering
  - **Boolean**: TRUE/FALSE
  - **Data Types**: INT64, FLOAT64, STRING, BYTES, DATE, DATETIME, TIMESTAMP
      `,
    },
    snowflake: {
      isNoSQL: false,
      identifierQuoteRule:
        '- ALWAYS wrap identifiers with double-quotes ("field").',
      identifierExample:
        'Example: SELECT "field" FROM "database"."schema"."table" WHERE "col" ILIKE \'%abc%\'',
      caseInsensitiveOp: "ILIKE",
      dateCastRule:
        "Cast date fields using CAST(field AS STRING) or TO_CHAR().",
      limitClause: "LIMIT 10",
      functionWarning: "Use Snowflake SQL functions only.",
      rules: `
  ## Snowflake-Specific Syntax
  - **Three-level Namespace**: Use "database"."schema"."table" format
  - **Identifiers**: Use double-quotes (case-sensitive) or unquoted (case-insensitive)
  - **Rounding**: Use ROUND(column, decimals)
    Example: ROUND(price, 2)
  - **Type Casting**: Use CAST(column AS type) or column::type
    Example: CAST(value AS NUMBER), value::VARCHAR
  - **String Matching**: Use ILIKE for case-insensitive (Snowflake-specific)
    Example: "name" ILIKE '%john%'
  - **Date Functions**:
    - CURRENT_DATE(), CURRENT_TIMESTAMP()
    - DATE_TRUNC('day', timestamp_column)
    - EXTRACT(YEAR FROM date) or YEAR(date)
    - DATEDIFF('day', date1, date2)
    - DATEADD('day', 1, date)
    - TO_CHAR(date, 'YYYY-MM-DD')
    - TO_DATE(string, 'YYYY-MM-DD')
  - **String Functions**:
    - CONCAT(str1, str2) or str1 || str2
    - LOWER(), UPPER(), TRIM(), LTRIM(), RTRIM()
    - POSITION('substring' IN string) or CHARINDEX()
    - SUBSTRING(string, start, length) or SUBSTR()
  - **Aggregation**: COUNT(), SUM(), AVG(), MIN(), MAX(), LISTAGG(), ARRAY_AGG()
  - **Semi-structured**: PARSE_JSON(), ARRAY_CONSTRUCT(), OBJECT_CONSTRUCT()
  - **Window Functions**: ROW_NUMBER(), RANK(), LAG(), LEAD() OVER ()
  - **CTEs**: WITH clause fully supported
  - **QUALIFY**: Use QUALIFY clause for window function filtering
  - **Boolean**: TRUE/FALSE
  - **Sequences**: NEXTVAL, CURRVAL for sequence objects
      `,
    },
    redshift: {
      isNoSQL: false,
      identifierQuoteRule:
        '- ALWAYS wrap identifiers with double-quotes ("field").',
      identifierExample:
        'Example: SELECT "field" FROM "schema"."table" WHERE "col" ILIKE \'%abc%\'',
      caseInsensitiveOp: "ILIKE or LOWER()",
      dateCastRule:
        "Cast date fields using CAST(field AS VARCHAR) or TO_CHAR().",
      limitClause: "LIMIT 10",
      functionWarning:
        "Redshift has limited function support compared to PostgreSQL.",
      rules: `
  ## Amazon Redshift-Specific Syntax
  - **Based on PostgreSQL 8.0.2**: Similar to PostgreSQL but with limitations
  - **Identifiers**: Use double-quotes ("column_name", "table_name")
  - **Rounding**: Use ROUND(column::numeric, decimals)
    Example: ROUND(price::numeric, 2)
  - **Type Casting**: Use CAST(column AS type) or column::type
    Example: CAST(value AS INTEGER), value::VARCHAR
  - **String Matching**: Use ILIKE for case-insensitive
    Example: "name" ILIKE '%john%'
  - **Date Functions**:
    - CURRENT_DATE, GETDATE(), SYSDATE
    - DATE_TRUNC('day', timestamp_column)
    - EXTRACT(YEAR FROM date)
    - DATEDIFF(day, date1, date2)
    - DATEADD(day, 1, date)
    - TO_CHAR(date, 'YYYY-MM-DD')
    - TO_DATE(string, 'YYYY-MM-DD')
  - **String Functions**:
    - CONCAT(str1, str2) or str1 || str2
    - LOWER(), UPPER(), TRIM(), LTRIM(), RTRIM()
    - POSITION('substring' IN string) or CHARINDEX()
    - SUBSTRING(string, start, length)
  - **Aggregation**: COUNT(), SUM(), AVG(), MIN(), MAX(), LISTAGG()
  - **Window Functions**: ROW_NUMBER(), RANK(), LAG(), LEAD() OVER ()
  - **CTEs**: WITH clause supported
  - **Boolean**: TRUE/FALSE
  - **No ARRAY type**: Limited array support
  - **Distribution Keys**: Consider DISTKEY and SORTKEY for performance (not in queries)
      `,
    },
    mssql: {
      isNoSQL: false,
      identifierQuoteRule:
        "- ALWAYS wrap identifiers with square brackets ([field]).",
      identifierExample:
        "Example: SELECT [field] FROM [schema].[table] WHERE [col] LIKE '%abc%'",
      caseInsensitiveOp: "LIKE (case-insensitive by default) or LOWER()",
      dateCastRule:
        "Cast date fields using CAST(field AS VARCHAR) or CONVERT().",
      limitClause: "TOP 10",
      functionWarning: "Use T-SQL functions only.",
      rules: `
  ## Microsoft SQL Server (T-SQL)-Specific Syntax
  - **Identifiers**: Use square brackets [column_name], [table_name]
  - **Rounding**: Use ROUND(column, decimals)
    Example: ROUND(price, 2)
  - **Type Casting**: Use CAST(column AS type) or CONVERT(type, column)
    Example: CAST(value AS INT), CONVERT(VARCHAR, date, 23)
  - **String Matching**: LIKE is case-insensitive by default (depends on collation)
    Example: [name] LIKE '%john%'
  - **LIMIT**: Use TOP instead of LIMIT
    Example: SELECT TOP 10 * FROM table
  - **Pagination**: Use OFFSET-FETCH (SQL Server 2012+)
    Example: ORDER BY id OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY
  - **Date Functions**:
    - GETDATE(), CURRENT_TIMESTAMP, SYSDATETIME()
    - DATEPART(YEAR, date) or YEAR(date)
    - DATEDIFF(day, date1, date2)
    - DATEADD(day, 1, date)
    - FORMAT(date, 'yyyy-MM-dd')
    - CONVERT(VARCHAR, date, 23)
  - **String Functions**:
    - CONCAT(str1, str2, ...) or str1 + str2
    - LOWER(), UPPER(), TRIM(), LTRIM(), RTRIM()
    - CHARINDEX(substring, string)
    - SUBSTRING(string, start, length)
    - LEN(string) for length
  - **Aggregation**: COUNT(), SUM(), AVG(), MIN(), MAX(), STRING_AGG() (2017+)
  - **Window Functions**: ROW_NUMBER(), RANK(), LAG(), LEAD() OVER ()
  - **CTEs**: WITH clause fully supported
  - **Boolean**: Use BIT type with 1/0 (no TRUE/FALSE keywords)
  - **Variables**: Declare with @variable_name
  - **String Concatenation**: Use + operator or CONCAT()
      `,
    },
    mongodb: {
      isNoSQL: true,
      rules: `
  ## MongoDB-Specific Query Language
  - **Query Language**: Use MongoDB Query Language (MQL), not SQL
  - **Basic Find**: db.collection.find({ field: value })
  - **Operators**: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
  - **Logical**: $and, $or, $not, $nor
  - **Element**: $exists, $type
  - **String Matching**: Use $regex for pattern matching
    Example: { name: { $regex: /john/i } }
  - **Aggregation Pipeline**:
    - $match: Filter documents
    - $project: Select/transform fields
    - $group: Group by fields
    - $sort: Sort results
    - $limit: Limit results
    - $lookup: Join collections
    - $unwind: Deconstruct arrays
  - **Date Operations**: Use $dateToString, $year, $month, $dayOfMonth
  - **Array Operations**: $push, $addToSet, $size, $arrayElemAt
  - **Output Format**: Return MongoDB aggregation pipeline as JSON array
  - **Example**:
    [
      { "$match": { "status": "active" } },
      { "$group": { "_id": "$category", "total": { "$sum": "$amount" } } },
      { "$sort": { "total": -1 } },
      { "$limit": 10 }
    ]
      `,
    },
    dynamodb: {
      isNoSQL: true,
      rules: `
  ## DynamoDB-Specific Query Language
  - **Query Language**: Use DynamoDB Query/Scan operations, not SQL
  - **Key Conditions**: Must use partition key (and optionally sort key)
  - **Query**: Use Query operation for key-based lookups
    - KeyConditionExpression: Partition key equality + optional sort key condition
    - FilterExpression: Additional filtering after query
  - **Scan**: Use Scan operation for full table scans (avoid if possible)
  - **Operators**: 
    - Comparison: =, <>, <, <=, >, >=, BETWEEN, IN
    - Functions: begins_with(), contains(), attribute_exists(), attribute_not_exists()
  - **Projection**: Use ProjectionExpression to select specific attributes
  - **Pagination**: Use Limit and ExclusiveStartKey
  - **Example Query Structure**:
    {
      "TableName": "Users",
      "KeyConditionExpression": "user_id = :uid",
      "FilterExpression": "age > :age",
      "ExpressionAttributeValues": {
        ":uid": "123",
        ":age": 25
      },
      "Limit": 10
    }
  - **No Joins**: DynamoDB doesn't support joins - denormalize data
  - **No Aggregations**: Must aggregate in application code
  - **Output Format**: Return DynamoDB query parameters as JSON
      `,
    },
  };

  return configs[databaseType] || configs.postgresql;
}
