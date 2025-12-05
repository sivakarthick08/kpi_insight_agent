// Example helper functions (implement according to your stack):

import { RuntimeContext } from "@mastra/core/runtime-context";
import { dbClient } from "../../databases/db";
import { FEEDBACK_EVENTS_TABLE_NAME } from "../../mastra/lib/conts";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  getLatestKnowledgeBase,
  storeKnowledgeBase,
} from "../../mastra/tools/knowledgebase";

async function getRecentFeedback(
  tenantId: string,
  applicationId: string,
  daysBack: number
) {
  // Query your feedback DB for recent feedback records for a specific tenant/application
  return dbClient.executeQuery(`
      SELECT * FROM ${FEEDBACK_EVENTS_TABLE_NAME}
      WHERE tenant_id = '${tenantId}' 
      AND application_id = '${applicationId}'
      AND analysis_ran = FALSE 
      AND timestamp >= NOW() - INTERVAL '${daysBack} days'
      ORDER BY timestamp DESC
    `);
}

function aggregateStrategyPerformance(feedbackRecords: any[]) {
  const stats: Record<string, any> = {};

  for (const record of feedbackRecords) {
    const strategyName = record.strategy_used || "unnamed_strategy";
    if (!stats[strategyName]) {
      stats[strategyName] = { count: 0, totalReward: 0, positive: 0 };
    }
    stats[strategyName].count++;
    stats[strategyName].totalReward += record.reward_signal || 0;
    if ((record.reward_signal || 0) > 0) stats[strategyName].positive++;
  }
  for (const strategy in stats) {
    stats[strategy].avgReward =
      stats[strategy].totalReward / stats[strategy].count;
    stats[strategy].successRate =
      stats[strategy].positive / stats[strategy].count;
  }
  return stats;
}

// Main function to update agent behavior for a specific tenant/application
export async function improveAgentFromRL(
  tenantId: string,
  applicationId: string,
  daysBack: number
) {
  try {
    // Step 1: Fetch recent feedback for this tenant/application
    let feedbackRecords;
    try {
      feedbackRecords = await getRecentFeedback(
        tenantId,
        applicationId,
        daysBack
      );
    } catch (err) {
      console.error("Error fetching recent feedback:", err);
      return {
        success: false,
        error: "Failed to fetch recent feedback records.",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    if (!Array.isArray(feedbackRecords) || feedbackRecords.length === 0) {
      console.log(
        `No feedback records found for tenant: ${tenantId}, application: ${applicationId}`
      );
      return {
        success: false,
        error: "No feedback records found for behavior update.",
      };
    }

    console.log(
      `Processing ${feedbackRecords.length} feedback records for tenant: ${tenantId}, application: ${applicationId}`
    );

    // Step 2: Aggregate performance stats
    let strategyStats;
    try {
      strategyStats = aggregateStrategyPerformance(feedbackRecords);
    } catch (err) {
      console.error("Error aggregating strategy performance:", err);
      return {
        success: false,
        error: "Failed to aggregate strategy performance.",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    // Step 3: Identify best strategies to reinforce
    let bestStrategy;
    try {
      bestStrategy = Object.entries(strategyStats).sort(
        ([, a]: any, [, b]: any) => b.avgReward - a.avgReward
      )[0];
    } catch (err) {
      console.error("Error identifying best strategy:", err);
      return {
        success: false,
        error: "Failed to identify best strategy.",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    if (!bestStrategy) {
      console.log("No clear best strategy identified.");
      return {
        success: false,
        error: "No clear best strategy identified.",
      };
    }

    const [bestStrategyName, bestStrategyMetrics] = bestStrategy;

    // Step 4: Compose updated prompt incorporating best strategies and business context

    // Fetch existing tribal knowledge from KB
    let currentKnowledge;
    try {
      currentKnowledge = await getLatestKnowledgeBase({
        tenantId,
        applicationId,
      });
    } catch (err) {
      console.error("Error fetching current knowledge from KB:", err);
      return {
        success: false,
        error: "Failed to fetch current knowledge from knowledgebase.",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    let currentKnowledgeContent = currentKnowledge.result;
    if (!currentKnowledge?.result) {
      currentKnowledgeContent = {
        id: "",
        version: 0,
        createdAt: "",
        updatedAt: "",
        isLatest: false,
        content: "",
        metadata: [],
      };
      currentKnowledgeContent = currentKnowledgeContent;
    }

    const prompt = `
  ## Role
  You are a learning agent that analyzes feedback from the main agent and users to improve system performance over time.

  ## Core Function
  Analyze feedback records to identify patterns, extract insights, and generate improved prompts/guidance for the main agent.

  ## Input Data
  Feedback records: ${JSON.stringify(
    feedbackRecords.map((record) => {
      return {
        query_text: record.query_text,
        explanation: record.explanation,
        schema_context: record.schema_context,
        generated_sql: record.generated_sql,
        executed_success: record.executed_success,
        user_feedback_score: record.user_feedback_score,
        user_feedback_reason: record.user_feedback_reason,
        business_context: record.business_context,
      };
    }),
    null,
    2
  )}
  Current knowledge: ${currentKnowledgeContent?.content || ""}

  ## Analysis Tasks
1. **Pattern Recognition**: Identify successful query patterns and structures
2. **Error Analysis**: Find common failure points and improvement areas
3. **Context Learning**: Extract business domain knowledge and terminology
4. **User Preference Mapping**: Understand user expectations and satisfaction drivers

## Learning Outputs
1. **Analyst instructions**: Enhance existing instructions with new insights only
2. **Incremental Business Context**: Add new domain knowledge without duplicating existing
3. **Expanded Query Patterns**: Build upon existing pattern library with fresh examples
4. **Refined Best Practices**: Update guidelines based on latest feedback while preserving proven methods

## Output Requirements
- **Preserve existing knowledge**: Never lose or override validated previous learning
- **Avoid duplication**: Don't repeat patterns or insights already established
- **Highlight new additions**: Clearly mark what's new vs existing knowledge
- **Maintain consistency**: Ensure all updates align with established successful patterns
- **Output Format**: Provide all learning outputs in structured YAML format

## Feedback Processing
- **High scores (4-5)**: Reinforce successful patterns
- **Low scores (1-2)**: Analyze failures and suggest improvements
- **Repeated patterns**: Build confidence in approaches
- **Edge cases**: Identify special handling requirements

## Knowledge Accumulation
- Business terminology and domain concepts
- Successful SQL patterns and structures
- Schema relationships and field mappings
- User communication preferences
  
  # OUTPUT FORMAT 
  {
    "new_knowledge_base": <prompt> in YAML format,
    "metadata": <metadata> in array of strings
    }`;

    let object;
    try {
      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        prompt: prompt,
        schema: z.object({
          new_knowledge_base: z.string(),
          metadata: z.array(z.string()),
        }),
      });
      object = result.object;
    } catch (err) {
      console.error("Error generating new knowledge object:", err);
      return {
        success: false,
        error: "Failed to generate new knowledge object.",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    const formatKnowledge = (knowledge: string) => {
      return knowledge
        .replace(/```json/g, "```")
        .replace(/```/g, "")
        .replace(/['"]/g, "");
    };

    const newKnowledgePayload = {
      content: formatKnowledge(object.new_knowledge_base),
      metadata: object.metadata,
    };

    // Store new knowledge in KB
    let learningContent;
    try {
      learningContent = await storeKnowledgeBase({
        content: newKnowledgePayload.content,
        metadata: newKnowledgePayload.metadata,
        tenantId,
        applicationId,
      });
    } catch (err) {
      console.error("Error storing learning content:", err);
      return {
        success: false,
        error: "Failed to store learning content in knowledgebase.",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    if (learningContent && learningContent.error) {
      console.error("Error storing learning content:", learningContent.error);
      return {
        success: false,
        error: "Error storing learning content.",
        details: learningContent.error,
      };
    }

    // Bulk update feedback records to analysis_ran = TRUE for this tenant/application
    try {
      await dbClient.executeQuery(
        `UPDATE ${FEEDBACK_EVENTS_TABLE_NAME} 
        SET analysis_ran = TRUE 
        WHERE tenant_id = '${tenantId}' 
        AND application_id = '${applicationId}'
        AND analysis_ran = FALSE 
        AND timestamp >= NOW() - INTERVAL '${daysBack} days'`
      );
    } catch (err) {
      console.error("Error updating feedback records:", err);
      return {
        success: false,
        error: "Failed to update feedback records.",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    console.log(
      `Agent behavior updated for tenant: ${tenantId}, application: ${applicationId} with ${feedbackRecords.length} feedback records`
    );
    return {
      success: true,
      result: `Updated agent behavior for tenant: ${tenantId}, application: ${applicationId} with ${feedbackRecords.length} feedback records`,
      processedCount: feedbackRecords.length,
    };
  } catch (err) {
    console.error("Unexpected error in improveAgentFromRL:", err);
    return {
      success: false,
      error: "Unexpected error in improveAgentFromRL.",
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Main function to process all tenants and applications from feedback records in batches
 * @param daysBack - Number of days to look back
 * @returns Processing results for all tenants and applications
 */
export async function improveAllAgentsFromRL(daysBack: number = 7) {
  try {
    console.log(
      `Starting improvement process for all tenants and applications (last ${daysBack} days)`
    );

    // First, get all unique tenant/application combinations that have unanalyzed feedback
    const tenantAppCombinations = await dbClient.executeQuery(`
      SELECT DISTINCT tenant_id, application_id, COUNT(*) as feedback_count
      FROM ${FEEDBACK_EVENTS_TABLE_NAME}
      WHERE analysis_ran = FALSE 
      AND timestamp >= NOW() - INTERVAL '${daysBack} days'
      AND tenant_id IS NOT NULL 
      AND application_id IS NOT NULL
      GROUP BY tenant_id, application_id
      ORDER BY feedback_count DESC
    `);

    if (
      !Array.isArray(tenantAppCombinations) ||
      tenantAppCombinations.length === 0
    ) {
      console.log(
        "No tenant/application combinations found with unanalyzed feedback"
      );
      return {
        success: true,
        result:
          "No tenant/application combinations found with unanalyzed feedback",
        processed: 0,
      };
    }

    console.log(
      `Found ${tenantAppCombinations.length} tenant/application combinations to process`
    );

    const results = [];
    let successCount = 0;
    let errorCount = 0;
    let totalProcessed = 0;

    // Process each tenant/application combination in batch
    for (const combination of tenantAppCombinations) {
      const { tenant_id, application_id, feedback_count } = combination;

      try {
        console.log(
          `Processing batch for tenant: ${tenant_id}, application: ${application_id} (${feedback_count} feedback records)`
        );

        // Process all feedback for this tenant/application combination
        const result = await improveAgentFromRL(
          tenant_id,
          application_id,
          daysBack
        );

        if (result.success) {
          successCount++;
          totalProcessed += result.processedCount || 0;
          console.log(
            `Successfully processed tenant: ${tenant_id}, application: ${application_id}`
          );
        } else {
          errorCount++;
          console.error(
            `Failed to process tenant: ${tenant_id}, application: ${application_id}:`,
            result.error
          );
        }

        results.push({
          tenant_id,
          application_id,
          expected_count: feedback_count,
          ...result,
        });
      } catch (err) {
        errorCount++;
        console.error(
          `Error processing tenant: ${tenant_id}, application: ${application_id}:`,
          err
        );
        results.push({
          tenant_id,
          application_id,
          expected_count: feedback_count,
          success: false,
          error: "Unexpected error during processing",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log(
      `Improvement process completed. Success: ${successCount}, Errors: ${errorCount}, Total feedback processed: ${totalProcessed}`
    );

    return {
      success: true,
      result: `Processed ${tenantAppCombinations.length} tenant/application combinations`,
      processed: tenantAppCombinations.length,
      successCount,
      errorCount,
      totalFeedbackProcessed: totalProcessed,
      details: results,
    };
  } catch (err) {
    console.error("Unexpected error in improveAllAgentsFromRL:", err);
    return {
      success: false,
      error: "Unexpected error in improveAllAgentsFromRL",
      details: err instanceof Error ? err.message : String(err),
    };
  }
}
