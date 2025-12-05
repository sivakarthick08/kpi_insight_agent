import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { FEEDBACK_EVENTS_TABLE_NAME } from "../../lib/conts";
import { dbClient } from "../../../databases/db";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { Mastra } from "@mastra/core";
import { openai } from "@ai-sdk/openai";
import { log } from "../../lib/log";
import { generateText } from "ai";

// Feedback tool
export const rlFeedbackTool = createTool({
  id: "rl_feedback",
  inputSchema: z.object({
    operation: z.enum(["store", "delete", "update"]),
    id: z.string().optional(),
    query: z.string().optional(),
    explanation: z.string().optional(),
    schema_context: z.any().optional(),
    generated_sql: z.string().optional(),
    executed_success: z.boolean().optional(),
    user_feedback_score: z.number().optional(), // e.g. +1=-positive, 0=neutral, -1=negative
    user_feedback_reason: z.string().optional(),
    business_context: z.any().optional(),
    reward_signal: z.number().optional(), // Aggregate of above, assign your logic
  }),
  description:
    "Record agent feedback for RL training to improve query extraction, SQL generation, and context awareness.",
  execute: async ({ context, runtimeContext, mastra }) => {
    const {
      operation,
      id,
      query,
      explanation,
      schema_context,
      generated_sql,
      executed_success,
      user_feedback_score,
      business_context,
      user_feedback_reason,
      reward_signal,
    } = context;

    const tenantId = runtimeContext.get("tenantId") as string;
    const resourceId = runtimeContext.get("resourceId") as string;
    const applicationId = runtimeContext.get("applicationId") as string;
    const threadId = runtimeContext.get("threadId") as string;
    const messageId = runtimeContext.get("messageId") as string;

    try {
      switch (operation) {
        case "store":
          return await storeFeedback({
            tenantId,
            threadId,
            resourceId,
            applicationId,
            messageId,
            query: query || "",
            explanation: explanation || "",
            schema_context,
            generated_sql: generated_sql || "",
            executed_success: executed_success || false,
            user_feedback_score: user_feedback_score || 0,
            business_context: business_context || "",
            reward_signal: reward_signal || 0,
            user_feedback_reason: user_feedback_reason || "",
            mastra,
          });
        case "delete":
          return await deleteFeedback({
            tenantId,
            threadId,
            applicationId,
            messageId,
          });
        case "update":
          if (!id) {
            return { error: "ID is required" };
          }
          return await updateFeedback({
            tenantId,
            id: id,
            toUpdate: {
              query_text: query,
              explanation: explanation,
              schema_context: schema_context,
              generated_sql: generated_sql,
              executed_success: executed_success,
              user_feedback_score: user_feedback_score,
              business_context: business_context,
              reward_signal: reward_signal,
              user_feedback_reason: user_feedback_reason,
            },
          });
        default:
          return { error: "Invalid operation" };
      }
    } catch (error) {
      console.error("Error storing feedback in DB:", error);
    }
  },
});

/**
 * Analyzes feedback data and extracts key insights for memory integration
 */
const analyzeFeedbackInsights = async ({
  query,
  explanation,
  schema_context,
  generated_sql,
  executed_success,
  user_feedback_score,
  business_context,
  user_feedback_reason,
  existingMemory,
}: {
  query: string;
  explanation: string;
  schema_context: any;
  generated_sql: string;
  executed_success: boolean;
  user_feedback_score: number;
  business_context: any;
  user_feedback_reason: string;
  existingMemory: string;
}) => {
  try {
    const model = openai("gpt-4o-mini");

    const analysisPrompt = `
You are analyzing feedback for a SQL query generation system. Extract key insights that should be remembered for future improvements.

Current Working Memory:
${existingMemory || "No existing memory"}

Feedback Data:
- Query: ${query}
- Explanation: ${explanation}
- Generated SQL: ${generated_sql}
- Execution Success: ${executed_success}
- User Feedback Score: ${user_feedback_score}
- User Feedback Reason: ${user_feedback_reason}
- Business Context: ${business_context ? JSON.stringify(business_context) : "None"}
- Schema Context: ${schema_context ? JSON.stringify(schema_context) : "None"}

Please analyze this feedback and extract insights in the following format:

# Feedback Analysis

## Key Insights
- [Extract 2-3 key learnings from this feedback]

## Query Patterns
- [Note any patterns in the user's query that could be useful]

## SQL Improvements
- [Note any SQL generation improvements identified]

## Business Context Learnings
- [Extract any business-specific insights]

## User Preferences
- [Note any user preferences or expectations revealed]

## Technical Issues
- [Note any technical problems or solutions]

Focus on actionable insights that would help improve future query generation and user experience.
`;

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: analysisPrompt,
    });

    return result.text;
  } catch (error) {
    console.error("Error analyzing feedback insights:", error);
    return `# Feedback Analysis\n\n## Key Insights\n- Error analyzing feedback: ${error}\n- Query: ${query}\n- Success: ${executed_success}\n- Score: ${user_feedback_score}`;
  }
};

/**
 * Summarizes feedback with existing memory and creates updated memory content
 */
const summarizeFeedbackWithMemory = async ({
  feedbackInsights,
  existingMemory,
  query,
  user_feedback_score,
  executed_success,
}: {
  feedbackInsights: string;
  existingMemory: string;
  query: string;
  user_feedback_score: number;
  executed_success: boolean;
}) => {
  try {
    const model = openai("gpt-4o-mini");

    const summarizationPrompt = `
You are updating working memory for a SQL query generation system. Combine existing memory with new feedback insights to create an updated, comprehensive memory.

Existing Working Memory:
${existingMemory || "No existing memory"}

New Feedback Insights:
${feedbackInsights}

Current Query Context:
- Query: ${query}
- Success: ${executed_success}
- Score: ${user_feedback_score}

Please create an updated working memory that:
1. Preserves important existing information
2. Integrates new insights from the feedback
3. Maintains the tribal knowledge structure
4. Focuses on actionable learnings
5. Keeps the memory concise but comprehensive

Use this structure:
# Tribal Knowledge

## Query Patterns & User Preferences
[Consolidate query patterns and user preferences]

## SQL Generation Insights
[Key learnings about SQL generation]

## Business Context & Rules
[Business-specific rules and context]

## Technical Understanding
[Technical insights about data and systems]

## Recent Feedback Summary
[Summary of recent feedback patterns]

## Common Issues & Solutions
[Known issues and their solutions]

Make sure to:
- Remove outdated information
- Consolidate similar insights
- Keep the most recent and relevant information
- Maintain actionable insights for future queries
`;

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: summarizationPrompt,
    });

    return result.text;
  } catch (error) {
    log({
      message: `❌ Error summarizing feedback with memory: ${error instanceof Error ? error.message : String(error)}`,
      type: "error",
      data: error,
    });
    console.error("Error summarizing feedback with memory:", error);
    // Fallback: append insights to existing memory
    return `${existingMemory || "# Tribal Knowledge"}\n\n## Recent Feedback\n${feedbackInsights}`;
  }
};

const storeFeedback = async ({
  tenantId,
  threadId,
  resourceId,
  applicationId,
  messageId,
  query,
  explanation,
  schema_context,
  generated_sql,
  executed_success,
  user_feedback_score,
  business_context,
  reward_signal,
  user_feedback_reason,
  mastra,
}: {
  tenantId: string;
  threadId: string;
  resourceId: string;
  applicationId: string;
  messageId: string;
  query: string;
  explanation: string;
  schema_context: any;
  generated_sql: string;
  executed_success: boolean;
  user_feedback_score: number;
  business_context: any;
  reward_signal: number;
  user_feedback_reason: string;
  mastra: any | undefined;
}) => {
  try {
    const agent = mastra?.getAgentById("deepspotAgent");

    const runTimeContext = new RuntimeContext();
    runTimeContext.set("tenantId", tenantId);
    runTimeContext.set("threadId", threadId);
    runTimeContext.set("applicationId", applicationId);
    runTimeContext.set("messageId", messageId);

    const memory = await agent?.getMemory({
      runtimeContext: runTimeContext,
    });

    if (!memory) {
      return { error: "Memory not found" };
    }

    // Get existing working memory
    const existingWorkingMemory = await memory.getWorkingMemory({
      threadId,
      resourceId: `deepspotAgent-${tenantId}`,
    });
    console.log("Existing working memory:", existingWorkingMemory);

    // Analyze feedback to extract insights
    const feedbackInsights = await analyzeFeedbackInsights({
      query,
      explanation,
      schema_context,
      generated_sql,
      executed_success,
      user_feedback_score,
      business_context,
      user_feedback_reason,
      existingMemory: existingWorkingMemory ?? "",
    });

    console.log("Feedback insights:", feedbackInsights);

    // Summarize feedback with existing memory to create updated memory
    const updatedWorkingMemory = await summarizeFeedbackWithMemory({
      feedbackInsights: feedbackInsights ?? "",
      existingMemory: existingWorkingMemory ?? "",
      query: query ?? "",
      user_feedback_score,
      executed_success,
    });

    // Update working memory with the summarized insights
    await memory.updateWorkingMemory({
      threadId: threadId,
      resourceId: `deepspotAgent-${tenantId}`,
      workingMemory: updatedWorkingMemory,
    });

    // Store feedback in database
    const feedbackQuery = `
            INSERT INTO ${FEEDBACK_EVENTS_TABLE_NAME} (
                tenant_id,
                thread_id,
                application_id,
                message_id,
                query_text,
                explanation,
                schema_context,
                generated_sql,
                executed_success,
                user_feedback_score,
                business_context,
                reward_signal,
                user_feedback_reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id
        `;
    const result = await dbClient.executeQuery(feedbackQuery, [
      tenantId,
      threadId,
      applicationId,
      messageId,
      query,
      explanation,
      schema_context ? JSON.stringify(schema_context) : null,
      generated_sql,
      executed_success,
      user_feedback_score,
      business_context ? JSON.stringify(business_context) : null,
      reward_signal,
      user_feedback_reason,
    ]);

    if (result.length > 0) {
      return {
        stored: true,
        result: {
          id: result[0].id,
          feedbackInsights,
          memoryUpdated: true,
          updatedMemory: updatedWorkingMemory,
        },
      };
    } else {
      return { stored: false };
    }
  } catch (error) {
    console.error("Error storing feedback in DB:", error);
    return {
      stored: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const deleteFeedback = async ({
  tenantId,
  threadId,
  applicationId,
  messageId,
}: {
  tenantId: string;
  threadId: string;
  applicationId: string;
  messageId: string;
}) => {
  try {
    const feedbackQuery = `
            DELETE FROM ${FEEDBACK_EVENTS_TABLE_NAME}
            WHERE tenant_id = $1 AND thread_id = $2 AND applic  ation_id = $3 AND message_id = $4
        `;
    const result = await dbClient.executeQuery(feedbackQuery, [
      tenantId,
      threadId,
      applicationId,
      messageId,
    ]);
    if (result.length > 0) {
      return { deleted: true };
    } else {
      return { deleted: false };
    }
  } catch (error) {
    console.error("Error deleting feedback in DB:", error);
    return { deleted: false };
  }
};

const updateFeedback = async ({
  tenantId,
  id,
  toUpdate,
}: {
  id: string;
  tenantId: string;
  toUpdate: {
    query_text?: string;
    explanation?: string;
    schema_context?: any;
    generated_sql?: string;
    executed_success?: boolean;
    user_feedback_score?: number;
    business_context?: any;
    reward_signal?: number;
    user_feedback_reason?: string;
  };
}) => {
  try {
    let feedbackQuery = `
    UPDATE ${FEEDBACK_EVENTS_TABLE_NAME}
            SET 
    `;

    if (toUpdate.query_text) {
      feedbackQuery += `query_text = '${toUpdate.query_text}' , `;
    }
    if (toUpdate.explanation) {
      feedbackQuery += `explanation = '${toUpdate.explanation}' , `;
    }
    if (toUpdate.schema_context) {
      feedbackQuery += `schema_context = '${JSON.stringify(toUpdate.schema_context)}' , `;
    }
    if (toUpdate.generated_sql) {
      feedbackQuery += `generated_sql = '${toUpdate.generated_sql}' , `;
    }
    if (toUpdate.executed_success) {
      feedbackQuery += `executed_success = ${toUpdate.executed_success} , `;
    }
    if (toUpdate.user_feedback_score) {
      feedbackQuery += `user_feedback_score = ${toUpdate.user_feedback_score}, `;
    }
    if (toUpdate.business_context) {
      feedbackQuery += `business_context = '${JSON.stringify(toUpdate.business_context)}' , `;
    }
    if (toUpdate.reward_signal) {
      feedbackQuery += `reward_signal = ${toUpdate.reward_signal}, `;
    }
    if (toUpdate.user_feedback_reason) {
      feedbackQuery += `user_feedback_reason = '${toUpdate.user_feedback_reason}' , `;
    }

    // Remove trailing comma and whitespace before appending WHERE
    feedbackQuery = feedbackQuery.replace(/,\s*$/, " ");
    feedbackQuery += `WHERE id = '${id}' returning id`;
    console.log("feedbackQuery :", feedbackQuery);

    const result = await dbClient.executeQuery(feedbackQuery);
    if (result.length > 0) {
      return { updated: true };
    } else {
      return { updated: false };
    }
  } catch (error) {
    log({
      message: `❌ Error updating feedback in DB: ${error instanceof Error ? error.message : String(error)}`,
      type: "error",
      data: error,
    });
    return {
      updated: false,
      error:
        error instanceof Error
          ? error.message
          : String(error) || "Unknown error",
    };
  }
};
