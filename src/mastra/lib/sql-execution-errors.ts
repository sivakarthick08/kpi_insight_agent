import { DatabaseType } from "../../databases";

/**
 * Determines if an error is a fixable syntax error that could be corrected
 * by regenerating the SQL query with better instructions.
 */
function isFixableSyntaxError(error: unknown, databaseType?: string): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  // Generic syntax-related indicators
  const genericSyntaxIndicators = [
    "syntax error",
    "parseexception",
    "mismatched input",
    "unexpected token",
    "unexpected keyword",
    "unterminated",
    "invalid syntax",
  ];

  // Quick allow-list based on generic indicators
  if (genericSyntaxIndicators.some((token) => message.includes(token))) {
    return true;
  }

  // Database-specific indicators
  switch (databaseType) {
    case DatabaseType.POSTGRESQL:
      return isPostgreSQLFixableError(message);
    
    case DatabaseType.MYSQL:
      return isMySQLFixableError(message);
    
    case DatabaseType.MARIADB:
      return isMariaDBFixableError(message);
    
    case DatabaseType.MSSQL:
      return isMSSQLFixableError(message);
    
    case DatabaseType.BIGQUERY:
      return isBigQueryFixableError(message);
    
    case DatabaseType.DATABRICKS:
      return isDatabricksFixableError(message);
    
    case DatabaseType.SNOWFLAKE:
      return isSnowflakeFixableError(message);
    
    case DatabaseType.REDSHIFT:
      return isRedshiftFixableError(message);
    
    case DatabaseType.MONGODB:
      return isMongoDBFixableError(message);
    
    case DatabaseType.DYNAMODB:
      return isDynamoDBFixableError(message);
    
    default:
      return false;
  }
}

// ============================================================================
// POSTGRESQL
// ============================================================================
function isPostgreSQLFixableError(message: string): boolean {
  const fixablePatterns = [
    // Syntax errors
    "sqlstate 42601",           // syntax_error
    'at or near "',
    "syntax error at or near",
    
    // Function/operator errors (often fixable by using correct syntax)
    "sqlstate 42883",           // undefined_function
    "function", "does not exist",
    "operator does not exist",
    "could not determine data type",
    
    // Column/table errors (fixable by correcting names or adding quotes)
    "sqlstate 42703",           // undefined_column
    "column", "does not exist",
    "sqlstate 42p01",           // undefined_table
    "relation", "does not exist",
    
    // Type casting errors
    "sqlstate 42804",           // datatype_mismatch
    "invalid input syntax for type",
    "cannot cast type",
    
    // Aggregate errors
    "sqlstate 42803",           // grouping_error
    "must appear in the group by clause",
    "is not an aggregate function",
    
    // Reserved keyword issues
    "sqlstate 42939",           // reserved_name
    
    // Division by zero (can add NULLIF)
    "sqlstate 22012",           // division_by_zero
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// MYSQL
// ============================================================================
function isMySQLFixableError(message: string): boolean {
  const fixablePatterns = [
    // Syntax errors
    "error code: 1064",         // ER_PARSE_ERROR
    "you have an error in your sql syntax",
    
    // Unknown column/table
    "error code: 1054",         // ER_BAD_FIELD_ERROR
    "unknown column",
    "error code: 1146",         // ER_NO_SUCH_TABLE
    "table", "doesn't exist",
    
    // Function errors
    "error code: 1305",         // ER_SP_DOES_NOT_EXIST
    "function", "does not exist",
    
    // Invalid use of group function
    "error code: 1111",         // ER_INVALID_GROUP_FUNC_USE
    "invalid use of group function",
    
    // Operand type clash
    "error code: 1267",         // ER_ILLEGAL_VALUE_FOR_TYPE
    "illegal mix of collations",
    
    // Aggregate errors
    "error code: 1140",         // ER_MIX_OF_GROUP_FUNC_AND_FIELDS
    "mixing of group columns",
    
    // Wrong parameter count
    "error code: 1582",         // ER_WRONG_PARAMCOUNT_TO_NATIVE_FCT
    "incorrect parameter count",
    
    // Data type mismatch
    "error code: 1366",         // ER_TRUNCATED_WRONG_VALUE
    "incorrect", "value",
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// MARIADB
// ============================================================================
function isMariaDBFixableError(message: string): boolean {
  // MariaDB uses similar error codes to MySQL
  return isMySQLFixableError(message);
}

// ============================================================================
// MS SQL SERVER
// ============================================================================
function isMSSQLFixableError(message: string): boolean {
  const fixablePatterns = [
    // Syntax errors
    "incorrect syntax near",
    "token line",
    
    // Invalid object name
    "invalid object name",
    "invalid column name",
    
    // Aggregate errors
    "is invalid in the select list because it is not contained in either an aggregate function or the group by clause",
    "column", "is invalid in the select list",
    
    // Function errors
    "is not a recognized built-in function name",
    "is not a recognized", "function",
    
    // Conversion errors
    "conversion failed",
    "error converting",
    
    // Type errors
    "operand type clash",
    "operand data type", "is invalid",
    
    // Arithmetic errors (can fix with NULLIF)
    "divide by zero error encountered",
    
    // Reserved keyword
    "incorrect syntax near the keyword",
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// BIGQUERY
// ============================================================================
function isBigQueryFixableError(message: string): boolean {
  const fixablePatterns = [
    // Syntax errors
    "syntax error:",
    "unexpected keyword",
    "expected", "but got",
    
    // Name resolution
    "unrecognized name",
    "name", "not found",
    "table", "not found",
    
    // Function errors
    "no matching signature for function",
    "function not found",
    
    // Type errors
    "no matching signature for operator",
    "cannot coerce",
    "cannot cast",
    
    // Aggregate errors
    "select list expression references column",
    "which is neither grouped nor aggregated",
    
    // Invalid reference
    "column", "in", "clause must be grouped or aggregated",
    
    // Alias issues
    "alias", "is ambiguous",
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// DATABRICKS (Spark SQL)
// ============================================================================
function isDatabricksFixableError(message: string): boolean {
  const fixablePatterns = [
    // Syntax errors
    "parseexception",
    "mismatched input",
    "extraneous input",
    "missing", "at",
    
    // Analysis errors
    "analysisexception",
    "cannot resolve",
    "column", "cannot be resolved",
    
    // Table/view errors
    "table or view not found",
    "path does not exist",
    
    // Function errors
    "undefined function",
    "cannot resolve", "function",
    
    // Type errors
    "cannot cast",
    "data type mismatch",
    
    // Aggregate errors
    "expression", "is neither present in the group by",
    "aggregate function",
    
    // Column reference errors
    "column", "is ambiguous",
    "reference", "is ambiguous",
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// SNOWFLAKE
// ============================================================================
function isSnowflakeFixableError(message: string): boolean {
  const fixablePatterns = [
    // Syntax errors
    "sql compilation error",
    "syntax error line",
    "unexpected",
    
    // Object errors
    "object", "does not exist",
    "invalid identifier",
    
    // Function errors
    "unknown function",
    "invalid number of arguments",
    
    // Type errors
    "numeric value", "is not recognized",
    "cannot cast",
    
    // Aggregate errors
    "is not a valid group by expression",
    
    // Column errors
    "invalid column",
    
    // Division by zero
    "division by zero",
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// REDSHIFT
// ============================================================================
function isRedshiftFixableError(message: string): boolean {
  const fixablePatterns = [
    // Syntax errors (similar to PostgreSQL)
    "syntax error at or near",
    'at or near "',
    
    // Function errors
    "function", "does not exist",
    
    // Column/table errors
    "column", "does not exist",
    "relation", "does not exist",
    
    // Type errors
    "invalid input syntax",
    
    // Aggregate errors
    "must appear in the group by clause",
    
    // Redshift-specific
    "amazon invalid operation",
    
    // Unsupported feature
    "feature is not supported",
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// MONGODB
// ============================================================================
function isMongoDBFixableError(message: string): boolean {
  const fixablePatterns = [
    // Query syntax errors
    "unknown operator",
    "failed to parse",
    "invalid operator",
    
    // Field errors
    "field path", "contains an empty element",
    "fieldpath field names may not start with '$'",
    
    // Aggregation errors
    "unrecognized pipeline stage name",
    "a pipeline stage specification object must contain exactly one field",
    
    // Expression errors
    "invalid expression",
    "unrecognized expression",
    
    // Type errors
    "expected", "but got",
    
    // Operator errors
    "unknown top level operator",
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// DYNAMODB
// ============================================================================
function isDynamoDBFixableError(message: string): boolean {
  const fixablePatterns = [
    // Expression errors
    "syntax error in expression",
    "invalid keyconditiionexpression",
    "invalid filterexpression",
    "invalid projectionexpression",
    
    // Attribute errors
    "attribute name is a reserved keyword",
    "invalid expressionattributenames",
    
    // Operator errors
    "invalid operator",
    
    // Value errors
    "expressionattributevalues must not be empty",
    "no value provided for placeholder",
    
    // Function errors
    "invalid function name",
    
    // Syntax errors
    "syntax error in conditional expression",
  ];

  return fixablePatterns.some(pattern => message.includes(pattern));
}

// ============================================================================
// HELPER: Get error category for better error messages
// ============================================================================
export enum ErrorCategory {
  SYNTAX = "syntax",
  FUNCTION = "function",
  COLUMN = "column",
  TABLE = "table",
  TYPE = "type",
  AGGREGATE = "aggregate",
  PERMISSION = "permission",
  UNKNOWN = "unknown",
}

export function categorizeError(error: unknown, databaseType?: string): ErrorCategory {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  // Function errors
  if (
    message.includes("function") ||
    message.includes("operator does not exist") ||
    message.includes("undefined function") ||
    message.includes("no matching signature")
  ) {
    return ErrorCategory.FUNCTION;
  }

  // Column errors
  if (
    message.includes("column") ||
    message.includes("field") ||
    message.includes("unrecognized name")
  ) {
    return ErrorCategory.COLUMN;
  }

  // Table errors
  if (
    message.includes("table") ||
    message.includes("relation") ||
    message.includes("view not found") ||
    message.includes("does not exist")
  ) {
    return ErrorCategory.TABLE;
  }

  // Type/casting errors
  if (
    message.includes("type") ||
    message.includes("cast") ||
    message.includes("conversion") ||
    message.includes("cannot coerce")
  ) {
    return ErrorCategory.TYPE;
  }

  // Aggregate/GROUP BY errors
  if (
    message.includes("group by") ||
    message.includes("aggregate") ||
    message.includes("grouped nor aggregated")
  ) {
    return ErrorCategory.AGGREGATE;
  }

  // Permission errors (usually not fixable by query modification)
  if (
    message.includes("permission") ||
    message.includes("access denied") ||
    message.includes("not authorized")
  ) {
    return ErrorCategory.PERMISSION;
  }

  // Syntax errors
  if (
    message.includes("syntax") ||
    message.includes("parse") ||
    message.includes("unexpected")
  ) {
    return ErrorCategory.SYNTAX;
  }

  return ErrorCategory.UNKNOWN;
}

export { isFixableSyntaxError };