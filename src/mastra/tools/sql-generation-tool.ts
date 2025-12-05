import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { DatabaseType } from "../../databases/databaseTypes";
import { getLatestKnowledgeBase } from "./knowledgebase";
import { validateSQLQuery } from "../lib/validate-sql";
import { createRestrictiveSQLPrompt } from "../../prompts/sql-generation";
import { searchContext } from "./context-tool";
import { Tiktoken } from "js-tiktoken";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";

/**
 * Accurate token estimation function using js-tiktoken
 * Uses the same encoding as the AI model for precise token counting
 */
function estimateTokens(text: string): number {
  try {
    const encoding = new Tiktoken(cl100k_base);
    const tokens = encoding.encode(text);
    return tokens.length;
  } catch (error) {
    console.warn("Failed to use tiktoken, falling back to character estimation:", error);
    // Fallback to character-based estimation if tiktoken fails
    return Math.ceil(text.length / 4);
  }
}

/**
 * Estimate cost for GPT-4.1-mini based on token usage
 * Pricing as of 2024 (approximate)
 */
function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCostPer1K = 0.00015; // $0.15 per 1K input tokens
  const outputCostPer1K = 0.0006; // $0.60 per 1K output tokens
  
  const inputCost = (inputTokens / 1000) * inputCostPer1K;
  const outputCost = (outputTokens / 1000) * outputCostPer1K;
  
  return inputCost + outputCost;
}

/**
 * ===========================================
 * SQL GENERATION TOOL
 * ===========================================
 *
 * This tool is the second step in the DeepSpot query processing pipeline.
 * It takes the natural language query and relevant schema context to generate
 * valid SQL queries using AI-powered code generation.
 *
 * Key Functions:
 * 1. Schema-Aware Generation: Uses vector-searched schema context for accurate SQL
 * 2. Database Type Support: Generates SQL compatible with PostgreSQL and BigQuery
 * 3. Safety Validation: Ensures generated SQL follows security best practices
 * 4. Confidence Scoring: Provides confidence levels and assumptions for transparency
 * 5. Error Handling: Gracefully handles cases where queries cannot be answered
 *
 * Process Flow:
 * 1. Validate schema context availability
 * 2. Create restrictive system prompt with schema information
 * 3. Generate SQL using AI with structured output
 * 4. Clean and format the generated SQL
 * 5. Return structured response with metadata
 */

/**
 * Interface defining the structure of SQL generation results
 * Includes confidence scoring, assumptions, and metadata
 */
export interface SqlGenerationResult {
  can_answer: boolean;
  reason: string;
  sql: string;
  explanation: string;
  confidence: number;
  assumptions: string[];
  tables_used: string[];
}

/**
 * Zod schema for validating SQL generation output
 * Ensures structured and consistent responses from the AI model
 */
export const sqlGenerationSchema = z.object({
  can_answer: z
    .boolean()
    .describe("Whether the query can be answered with the available schema"),
  reason: z
    .string()
    .describe(
      "Detailed reason explaining why the query can or cannot be answered"
    ),
  sql: z
    .string()
    .describe("The generated SQL query (empty if can_answer is false)"),
  explanation: z
    .string()
    .describe("Human-readable explanation of what the SQL query does"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence level in the generated query accuracy (0-1 scale)"),
  assumptions: z
    .array(z.string())
    .describe("List of assumptions made while generating the query"),
  tables_used: z
    .array(z.string())
    .describe("List of database tables referenced in the query"),
});

/**
 * Main SQL generation tool that converts natural language queries to SQL
 * Uses AI-powered generation with schema context from vector search
 */
export const sqlGenerationTool = createTool({
  id: "sql-generation",
  inputSchema: z.object({
    expandedQuery: z
      .string()
      .describe(
        "The user's natural language query that needs to be converted to SQL"
      ),
    tables: z.array(
      z.object({
        name: z.string(),
        fields: z.array(
          z.object({
            field_name: z.string(),
            field_type: z.string(),
            field_description: z.string(),
            sample_data: z.array(z.any()),
          })
        ),
        description: z.string(),
        schema_name: z.string(),
      })
    ),
  }),
  outputSchema: z.object({
    can_answer: z
      .boolean()
      .describe("Whether the query can be answered with available schema"),
    reason: z
      .string()
      .describe(
        "Detailed explanation of why the query can or cannot be answered"
      ),
    sql: z
      .string()
      .describe("The generated SQL query (empty if can_answer is false)"),
    explanation: z
      .string()
      .describe(
        "Human-readable explanation of what the SQL query accomplishes"
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("Confidence level in the generated query accuracy (0-1 scale)"),
    assumptions: z
      .array(z.string())
      .describe("List of assumptions made during SQL generation"),
    tables_used: z
      .array(z.string())
      .describe("List of database tables referenced in the generated query"),
  }),
  description:
    "Generates SQL queries from natural language descriptions using AI and vector-enhanced schema context",
  execute: async ({ context, runtimeContext }) => {
    const { expandedQuery, tables } = context;

    // Comprehensive input validation
    if (!expandedQuery || typeof expandedQuery !== 'string' || expandedQuery.trim().length === 0) {
      return {
        can_answer: false,
        reason: "Invalid or empty query provided - cannot generate SQL without a valid natural language query",
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }

    if (!tables || !Array.isArray(tables)) {
      return {
        can_answer: false,
        reason: "Invalid tables schema provided - tables must be an array",
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }

    // Retrieve and validate runtime context
    const databaseType = runtimeContext.get("databaseType") as DatabaseType;
    const tenantId = runtimeContext.get("tenantId") as string;
    const applicationId = runtimeContext.get("applicationId") as string;

    if (!databaseType) {
      return {
        can_answer: false,
        reason: "Database type not specified in runtime context",
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }

    if (!tenantId || !applicationId) {
      return {
        can_answer: false,
        reason: "Missing tenant or application ID in runtime context",
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }

    // Early validation: Check if we have sufficient schema context (more permissive)
    if (tables.length === 0) {
      return {
        can_answer: false,
        reason:
          "No tables found in schema context - cannot generate SQL without database schema information",
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }

    // Check if we have at least one table with sufficient fields (minimum quality threshold)
    const tablesWithFields = tables.filter(table => 
      table.fields && Array.isArray(table.fields) && table.fields.length >= 1
    );
    
    if (tablesWithFields.length === 0) {
      return {
        can_answer: false,
        reason:
          "No tables with sufficient fields found in schema context - require at least 3 fields per table for quality SQL generation",
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }

    // Validate table structure
    const invalidTables = tables.filter(table => 
      !table.name || 
      !table.fields || 
      !Array.isArray(table.fields) ||
      !table.description ||
      !table.schema_name
    );

    if (invalidTables.length > 0) {
      return {
        can_answer: false,
        reason: `Invalid table structure detected - tables must have name, fields array, description, and schema_name`,
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [],
        tables_used: [],
      };
    }

    try {
      console.log("🔌 Generating SQL query for:", expandedQuery);

      // Create a restrictive system prompt with schema information and safety constraints
      // Add fallback for unknown database types
      const validDatabaseType = Object.values(DatabaseType).includes(databaseType) 
        ? databaseType 
        : DatabaseType.POSTGRESQL; // Default fallback

      let systemPrompt;
      try {
        systemPrompt = createRestrictiveSQLPrompt(
          "Generate a valid SQL statement to address the user's directive/question.",
          tables,
          validDatabaseType
        );
      } catch (promptError) {
        console.error("Failed to create system prompt:", promptError);
        return {
          can_answer: false,
          reason: "Failed to create system prompt for SQL generation",
          sql: "",
          explanation: "",
          confidence: 0,
          assumptions: [],
          tables_used: [],
        };
      }

      // Search for relevant context with proper error handling
      let contexts: string[] = [];
      try {
        const contextResult = await searchContext({
          query: expandedQuery,
          tags: [],
          tenantId,
          applicationId,
        });

        if (contextResult?.error) {
          console.warn("Context search failed:", contextResult.error);
          // Continue without context if search fails
        } else if (contextResult?.result && Array.isArray(contextResult.result)) {
          contexts = contextResult.result
            .map((result) => result?.metadata?.markdown)
            .filter((markdown): markdown is string => Boolean(markdown));
        }
      } catch (error) {
        console.warn("Context search error:", error);
        // Continue without context if search fails
      }

      // Search for relevant KPIs to enhance SQL generation
  //     let kpiContext = "";
  //     try {
  //       const { searchKPI } = await import("./kpi-tool");
  //       const kpiResults = await searchKPI({
  //         query: expandedQuery,
  //         tenant_id: runtimeContext.get("tenantId") as string,
  //         application_id: runtimeContext.get("applicationId") as string,
  //         maxResults: 2,
  //       });

  //       if (kpiResults.result && kpiResults.result.length > 0) {
  //         kpiContext = "\n\n## Relevant Business KPIs:\n";
  //         kpiContext += kpiResults.result
  //           .map((kpi, index) => {
  //             const similarity = kpi.similarity_score
  //               ? ` (Relevance: ${(kpi.similarity_score * 100).toFixed(1)}%)`
  //               : "";
  //             return `${index + 1}. **${kpi.title}**${similarity}
  //  - Description: ${kpi.description}
  //  - Category: ${kpi.category || "Uncategorized"}
  //  - SQL Query: \`${kpi.sql_query}\`
  //  - Tables Used: ${kpi.tables_used.join(", ")}
  //  - Columns Used: ${kpi.columns_used.join(", ")}
  //  ${kpi.formula ? `- Formula: ${kpi.formula}` : ""}`;
  //           })
  //           .join("\n\n");
  //       }
  //     } catch (error) {
  //       console.warn("Failed to search KPIs for SQL generation:", error);
  //       // Continue without KPI context if search fails
  //     }

      // Build the user prompt for SQL generation with enhanced context
      const contextSection = contexts.length > 0 ? `\n\n## Business Context:\n${contexts.join("\n\n")}` : "";
      
      // Add field relevance information
      const fieldRelevanceSection = tablesWithFields.length > 0 ? 
        `\n\n## Available Fields by Category:\n${tablesWithFields.map(table => 
          `**${table.name}**: ${table.fields.map(field => 
            `${field.field_name} (${field.field_type}) - ${field.field_description}`
          ).join(", ")}`
        ).join("\n")}` : "";

      // Add sample data insights
      const sampleDataSection = tablesWithFields.length > 0 ?
        `\n\n## Sample Data Insights:\n${tablesWithFields.map(table => 
          table.fields.filter(field => field.sample_data && field.sample_data.length > 0)
            .map(field => `**${field.field_name}**: ${field.sample_data.slice(0, 3).join(", ")}`)
            .join("\n")
        ).filter(Boolean).join("\n")}` : "";
      
      const userPrompt = `Generate SQL for: "${expandedQuery}"${contextSection}${fieldRelevanceSection}${sampleDataSection}

## Task:
Author a valid SQL statement to address the following directive/question.
USER: "${expandedQuery}"`;

      // Estimate token usage for cost tracking
      const inputTokens = estimateTokens(systemPrompt + userPrompt);
      
      // Generate SQL using AI with structured output
      let result;
      try {
        result = await generateObject({
          model: openai("gpt-4.1-mini"),
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          schema: sqlGenerationSchema,
          temperature: 0.1, // Lower temperature for more consistent results
        });
      } catch (aiError) {
        console.error("AI model error:", aiError);
        return {
          can_answer: false,
          reason: "Failed to generate SQL query due to AI model error",
          sql: "",
          explanation: "",
          confidence: 0,
          assumptions: [],
          tables_used: [],
        };
      }

      // Calculate token usage and cost
      const outputTokens = estimateTokens(JSON.stringify(result.object));
      const totalTokens = inputTokens + outputTokens;
      const estimatedCost = estimateCost(inputTokens, outputTokens);

      // Log token usage for monitoring
      console.log(`🔢 Token usage - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}, Estimated cost: $${estimatedCost.toFixed(6)}`);

      // Validate AI response structure
      if (!result?.object) {
        return {
          can_answer: false,
          reason: "AI model returned invalid response structure",
          sql: "",
          explanation: "",
          confidence: 0,
          assumptions: [],
          tables_used: [],
        };
      }

      // Handle case where AI determines the query cannot be answered
      if (!result.object.can_answer) {
        return {
          can_answer: false,
          reason: result.object.reason || "Query cannot be answered with available schema",
          sql: "",
          explanation: "",
          confidence: 0,
          assumptions: [],
          tables_used: [],
        };
      }

      // Implement confidence threshold: block queries with confidence < 0.4
      if (result.object.confidence < 0.4) {
        return {
          can_answer: false,
          reason: `Query confidence too low (${(result.object.confidence * 100).toFixed(1)}%) - requires at least 40% confidence for execution`,
          sql: "",
          explanation: "",
          confidence: result.object.confidence,
          assumptions: result.object.assumptions || [],
          tables_used: result.object.tables_used || [],
        };
      }

      // Clean up the SQL query by replacing escaped newlines with actual newlines
      const cleanedResult = {
        ...result.object,
        sql: result.object.sql?.replace(/\\n/g, "\n").trim() || "",
      };

      // Validate the generated SQL if it exists (with fallback)
      if (cleanedResult.sql && cleanedResult.tables_used && cleanedResult.tables_used.length > 0) {
        try {
          const validation = validateSQLQuery(cleanedResult.sql, tables, cleanedResult.tables_used);
          if (!validation.status) {
            // Check if we can still provide a useful response
            const hasBasicStructure = cleanedResult.sql.toLowerCase().includes('select') && 
                                     cleanedResult.sql.toLowerCase().includes('from');
            
            if (hasBasicStructure) {
              // Log warning but continue with the SQL
              console.warn("SQL validation failed but basic structure is present:", validation.message);
              cleanedResult.assumptions = [...(cleanedResult.assumptions || []), `SQL validation warning: ${validation.message}`];
              // Reduce confidence slightly but don't fail completely
              cleanedResult.confidence = Math.max(0.3, (cleanedResult.confidence || 0.5) - 0.2);
            } else {
              return {
                can_answer: false,
                reason: `Generated SQL validation failed: ${validation.message}`,
                sql: "",
                explanation: "",
                confidence: 0,
                assumptions: [...(cleanedResult.assumptions || []), `SQL validation failed: ${validation.message}`],
                tables_used: [],
              };
            }
          }
        } catch (validationError) {
          console.warn("SQL validation error:", validationError);
          // Continue with the generated SQL if validation fails
        }
      }

      // Log successful SQL generation
      console.log(`✅ SQL generated successfully - Confidence: ${cleanedResult?.confidence ?? 0}, Tables used: ${cleanedResult?.tables_used?.length ?? 0}`);

      // Return the processed SQL generation result
      return {
        can_answer: cleanedResult?.can_answer ?? false,
        reason: cleanedResult?.reason ?? "",
        sql: cleanedResult?.sql ?? "",
        explanation: cleanedResult?.explanation ?? "",
        confidence: Math.max(0, Math.min(1, cleanedResult?.confidence ?? 0)), // Ensure confidence is between 0 and 1
        assumptions: Array.isArray(cleanedResult?.assumptions) ? cleanedResult.assumptions : [],
        tables_used: Array.isArray(cleanedResult?.tables_used) ? cleanedResult.tables_used : [],
      };
    } catch (error) {
      console.error("SQL generation error:", error);
      
      // Provide more specific error information
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      const errorReason = `Failed to generate SQL query: ${errorMessage}`;
      
      return {
        can_answer: false,
        reason: errorReason,
        sql: "",
        explanation: "",
        confidence: 0,
        assumptions: [`Error during SQL generation: ${errorMessage}`],
        tables_used: [],
      };
    }
  },
});
