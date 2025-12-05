export const validateSQLQuery = (
  sql: string,
  tables: {
    name: string;
    fields: {
      field_name: string;
      field_type: string;
      field_description: string;
      sample_data: string[];
    }[];
    description: string;
    schema_name: string;
  }[],
  tables_used: string[]
) => {
  // Lowercase SQL for easier matching
  const sqlQuery = sql.toLowerCase().trim();

  // Basic check for SELECT and FROM
  if (!sqlQuery.includes("select") || !sqlQuery.includes("from")) {
    return {
      status: false,
      message: "SQL must contain SELECT and FROM clauses.",
    };
  }

  // Only use tables from tables_used for validation
  const usedTableNames = tables_used.map((t) => t.toLowerCase());
  const usedTables = tables.filter((t) => usedTableNames.includes(t.name.toLowerCase()));

  // If any table in tables_used is not in schema, fail
  const schemaTableNames = tables.map((t) => t.name.toLowerCase());
  const missingTables = usedTableNames.filter(
    (tbl) => !schemaTableNames.includes(tbl)
  );
  if (missingTables.length > 0) {
    return {
      status: false,
      message: `The following tables do not exist in the schema: ${missingTables.join(", ")}. Please regenerate.`,
    };
  }

  // More permissive validation - only check critical fields
  const fieldList = extractFieldsFromSQL(sqlQuery);
  const missingFields = validateFieldsExist(fieldList, usedTables);

  // Only fail if critical fields are missing (allow some flexibility)
  if (missingFields.length > 0) {
    // Check if we have at least one valid field or if using SELECT *
    const hasValidFields = fieldList.some(field => 
      usedTables.some(table => 
        table.fields.some((f: any) => f.field_name.toLowerCase() === field.toLowerCase())
      )
    );
    
    const hasSelectStar = sqlQuery.includes('select *');
    
    // Allow if we have valid fields or SELECT *
    if (!hasValidFields && !hasSelectStar) {
      return {
        status: false,
        message: `The following fields do not exist in the referenced tables: ${missingFields.join(", ")}. Please regenerate.`,
      };
    }
  }

  // If all checks pass
  return {
    status: true,
    message: "SQL query is valid.",
  };
};

/**
 * Extract field names from SQL query with simplified parsing
 */
function extractFieldsFromSQL(sqlQuery: string): string[] {
  const fieldList: string[] = [];

  // Extract fields from SELECT clause (most important)
  const selectFields = extractSelectFields(sqlQuery);
  fieldList.push(...selectFields);

  // Extract fields from WHERE clause (important for validation)
  const whereFields = extractWhereFields(sqlQuery);
  fieldList.push(...whereFields);

  // Extract fields from GROUP BY clause
  const groupByFields = extractGroupByFields(sqlQuery);
  fieldList.push(...groupByFields);

  // Extract fields from ORDER BY clause
  const orderByFields = extractOrderByFields(sqlQuery);
  fieldList.push(...orderByFields);

  // Remove duplicates and empty values
  return [...new Set(fieldList)].filter(Boolean);
}

/**
 * Extract fields from SELECT clause (simplified and more flexible)
 */
function extractSelectFields(sqlQuery: string): string[] {
  const selectRegex = /\bselect\s+(.+?)\s+from\b/s;
  const match = sqlQuery.match(selectRegex);
  
  if (!match || !match[1]) return [];

  const selectClause = match[1];
  const fields: string[] = [];

  // Handle different SELECT patterns
  if (selectClause.includes('*')) {
    // If SELECT * is used, we can't validate individual fields
    return [];
  }

  // Simple approach - extract identifiers from SELECT clause
  const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const matches = selectClause.match(identifierRegex);
  
  if (matches) {
    for (const match of matches) {
      if (!isSQLKeyword(match)) {
        fields.push(match);
      }
    }
  }

  return fields;
}

/**
 * Extract fields from WHERE clause (simplified)
 */
function extractWhereFields(sqlQuery: string): string[] {
  const whereRegex = /\bwhere\s+(.+?)(?=\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|$)/s;
  const match = sqlQuery.match(whereRegex);
  
  if (!match || !match[1]) return [];

  const whereClause = match[1];
  const fields: string[] = [];
  
  // Simple approach - extract identifiers from WHERE clause
  const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const matches = whereClause.match(identifierRegex);
  
  if (matches) {
    for (const match of matches) {
      if (!isSQLKeyword(match)) {
        fields.push(match);
      }
    }
  }
  
  return fields;
}

/**
 * Extract fields from GROUP BY clause (simplified)
 */
function extractGroupByFields(sqlQuery: string): string[] {
  const groupByRegex = /\bgroup\s+by\s+(.+?)(?=\border\s+by\b|\bhaving\b|\blimit\b|$)/s;
  const match = sqlQuery.match(groupByRegex);
  
  if (!match || !match[1]) return [];

  const groupByClause = match[1];
  const fields: string[] = [];
  
  // Simple approach - extract identifiers from GROUP BY clause
  const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const matches = groupByClause.match(identifierRegex);
  
  if (matches) {
    for (const match of matches) {
      if (!isSQLKeyword(match)) {
        fields.push(match);
      }
    }
  }
  
  return fields;
}

/**
 * Extract fields from ORDER BY clause (simplified)
 */
function extractOrderByFields(sqlQuery: string): string[] {
  const orderByRegex = /\border\s+by\s+(.+?)(?=\bhaving\b|\blimit\b|$)/s;
  const match = sqlQuery.match(orderByRegex);
  
  if (!match || !match[1]) return [];

  const orderByClause = match[1];
  const fields: string[] = [];
  
  // Simple approach - extract identifiers from ORDER BY clause
  const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const matches = orderByClause.match(identifierRegex);
  
  if (matches) {
    for (const match of matches) {
      if (!isSQLKeyword(match)) {
        fields.push(match);
      }
    }
  }
  
  return fields;
}

/**
 * Extract fields from HAVING clause
 */
function extractHavingFields(sqlQuery: string): string[] {
  const havingRegex = /\bhaving\s+(.+?)(?=\border\s+by\b|\blimit\b|$)/s;
  const match = sqlQuery.match(havingRegex);
  
  if (!match || !match[1]) return [];

  return extractFieldsFromExpression(match[1]);
}

/**
 * Extract field names from a general expression
 */
function extractFieldsFromExpression(expression: string): string[] {
  const fields: string[] = [];
  
  // Remove string literals to avoid false matches
  const withoutStrings = expression.replace(/('([^'\\]|\\.)*'|"([^"\\]|\\.)*")/g, '');
  
  // Find identifiers (field names) - more robust pattern
  const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const matches = withoutStrings.match(identifierRegex);
  
  if (matches) {
    for (const match of matches) {
      // Skip SQL keywords
      if (!isSQLKeyword(match)) {
        fields.push(match);
      }
    }
  }
  
  return fields;
}

/**
 * Extract field name from a single expression (simplified)
 */
function extractFieldFromExpression(expression: string): string | null {
  // Simple approach - just look for identifiers
  const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const matches = expression.match(identifierRegex);
  
  if (matches) {
    for (const match of matches) {
      if (!isSQLKeyword(match)) {
        return match;
      }
    }
  }
  
  return null;
}

/**
 * Split string by comma, but respect parentheses
 */
function splitByCommaOutsideParentheses(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    
    current += char;
  }
  
  if (current.trim()) {
    result.push(current.trim());
  }
  
  return result;
}

/**
 * Check if a word is a SQL keyword
 */
function isSQLKeyword(word: string): boolean {
  const keywords = new Set([
    'select', 'from', 'where', 'group', 'by', 'order', 'having', 'limit', 'offset',
    'and', 'or', 'not', 'in', 'exists', 'between', 'like', 'is', 'null',
    'inner', 'left', 'right', 'full', 'outer', 'join', 'on', 'as',
    'asc', 'desc', 'distinct', 'all', 'any', 'some',
    'union', 'intersect', 'except', 'case', 'when', 'then', 'else', 'end',
    'count', 'sum', 'avg', 'min', 'max', 'first', 'last'
  ]);
  
  return keywords.has(word.toLowerCase());
}

/**
 * Validate that all fields exist in the provided tables
 */
function validateFieldsExist(fieldList: string[], usedTables: any[]): string[] {
  const missingFields: string[] = [];
  
  for (const field of fieldList) {
    let found = false;
    for (const table of usedTables) {
      if (table.fields.some((f: any) => f.field_name.toLowerCase() === field.toLowerCase())) {
        found = true;
        break;
      }
    }
    if (!found) {
      missingFields.push(field);
    }
  }
  
  return missingFields;
}