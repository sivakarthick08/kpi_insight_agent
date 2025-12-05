import { FEEDBACK_EVENTS_TABLE_NAME } from "../../mastra/lib/conts";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { dbClient } from "../../databases/db";
import { rlFeedbackTool } from "../../mastra/tools/rl/feedback-tool";
import { improveAgentFromRL } from "../util/improveFromRL";

export interface FeedbackQueryParams {
  limit: string | number;
  offset: string | number;
  startDate?: string;
  endDate?: string;
}

export interface FeedbackCreateParams {
  threadId: string;
  messageId: string;
  query: string;
  explanation: string;
  schema_context: string;
  generated_sql: string;
  executed_success: boolean;
  user_feedback_score: number;
  business_context: string;
  user_feedback_reason: string;
  reward_signal: number;
}

export interface FeedbackUpdateParams extends FeedbackCreateParams {
  id: string;
}

export interface FeedbackResult {
  id: string;
  thread_id: string;
  message_id: string;
  query: string;
  explanation: string;
  schema_context: string;
  generated_sql: string;
  executed_success: boolean;
  user_feedback_score: number;
  business_context: string;
  user_feedback_reason: string;
  reward_signal: number;
  created_at: string;
  updated_at: string;
}

export class FeedbackService {
  /**
   * Get feedbacks with pagination and date filtering
   */
  static async getFeedbacks(
    tenantId: string,
    applicationId: string,
    params: FeedbackQueryParams
  ): Promise<FeedbackResult[]> {
    const { limit, offset, startDate, endDate } = params;
    const limitNum =
      typeof limit === "string" ? parseInt(limit || "10", 10) : limit || 10;
    const offsetNum =
      typeof offset === "string" ? parseInt(offset || "0", 10) : offset || 0;

    try {
      const results = await dbClient?.executeQuery(
        `SELECT * FROM ${FEEDBACK_EVENTS_TABLE_NAME}
       WHERE application_id = '${applicationId}'
       AND tenant_id = '${tenantId}'
       ${startDate ? `AND created_at >= '${startDate}'` : ""}
       ${endDate ? `AND created_at <= '${endDate}'` : ""}
       ORDER BY created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum} `
      );
      return results || [];
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    }
  }

  /**
   * Get feedback by ID
   */
  static async getFeedback(
    tenantId: string,
    applicationId: string,
    id: string
  ): Promise<FeedbackResult | null> {
    try {
      const result = await dbClient.executeQuery(
        `SELECT * FROM ${FEEDBACK_EVENTS_TABLE_NAME}
         WHERE id = '${id}' 
         AND tenant_id = '${tenantId}' 
         AND application_id = '${applicationId}'`
      );

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    }
  }

  /**
   * Delete feedback by ID
   */
  static async deleteFeedback(
    tenantId: string,
    applicationId: string,
    id: string
  ): Promise<boolean> {
    try {
      await dbClient?.executeQuery(
        `DELETE FROM ${FEEDBACK_EVENTS_TABLE_NAME}
         WHERE id = '${id}' 
         AND tenant_id = '${tenantId}' 
         AND application_id = '${applicationId}'`
      );

      return true;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    }
  }

  /**
   * Create new feedback
   */
  static async createFeedback(
    tenantId: string,
    applicationId: string,
    params: FeedbackCreateParams
  ): Promise<any> {
    const runtimeContext = new RuntimeContext();
    runtimeContext.set("tenantId", tenantId);
    runtimeContext.set("applicationId", applicationId);
    runtimeContext.set("threadId", params.threadId);
    runtimeContext.set("messageId", params.messageId);

    if (!rlFeedbackTool || !rlFeedbackTool.execute) {
      throw new Error("RL feedback tool is not set");
    }

    const result: any = await rlFeedbackTool.execute({
      context: {
        operation: "store",
        query: params.query,
        explanation: params.explanation,
        schema_context: params.schema_context,
        generated_sql: params.generated_sql,
        executed_success: params.executed_success,
        user_feedback_score: params.user_feedback_score,
        business_context: params.business_context,
        user_feedback_reason: params.user_feedback_reason,
        reward_signal: params.reward_signal,
      },
      runtimeContext,
      suspend: async (suspendPayload) => {
        return {
          success: false,
          data: [],
          rowCount: 0,
          error: "Failed to store feedback",
        };
      },
    });

    if (result && (result.error || result.stored === false)) {
      throw new Error(result.error || "Failed to store feedback");
    }

    return result.result;
  }

  /**
   * Update existing feedback
   */
  static async updateFeedback(
    tenantId: string,
    applicationId: string,
    params: FeedbackUpdateParams
  ): Promise<any> {
    const runtimeContext = new RuntimeContext();
    runtimeContext.set("tenantId", tenantId);
    runtimeContext.set("applicationId", applicationId);
    runtimeContext.set("threadId", params.threadId);
    runtimeContext.set("messageId", params.messageId);

    if (!rlFeedbackTool || !rlFeedbackTool.execute) {
      throw new Error("RL feedback tool is not set");
    }

    const result: any = await rlFeedbackTool.execute({
      context: {
        operation: "update",
        id: params.id,
        query: params.query,
        explanation: params.explanation,
        schema_context: params.schema_context,
        generated_sql: params.generated_sql,
        executed_success: params.executed_success,
        user_feedback_score: params.user_feedback_score,
        business_context: params.business_context,
        user_feedback_reason: params.user_feedback_reason,
        reward_signal: params.reward_signal,
      },
      runtimeContext,
      suspend: async (suspendPayload) => {
        return {
          success: false,
          data: [],
          rowCount: 0,
          error: "Failed to store feedback",
        };
      },
    });

    if (result && (result.error || result.updated === false)) {
      throw new Error(result.error || "Failed to update feedback");
    }

    return result.result;
  }

  /**
   * Run improve agent from RL
   */
  static async runImproveAgentFromRL(
    tenantId: string,
    applicationId: string,
    daysBack: number
  ): Promise<any> {
    try {
      const result = await improveAgentFromRL(
        tenantId,
        applicationId,
        daysBack
      );

      return result;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    }
  }
}
