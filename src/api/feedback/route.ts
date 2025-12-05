import { registerApiRoute } from "@mastra/core/server";
import { FeedbackService } from "./service";

export const getFeedbacks = registerApiRoute("/custom/feedback", {
  method: "GET",
  handler: async (c) => {
    const { limit, offset, startDate, endDate } = c.req.query();

    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");

    if (!tenantId || !applicationId) {
      return c.json(
        {
          success: false,
          error: "Missing required headers: x-tenant-id or x-application-id",
        },
        400
      );
    }

    if (!process.env.POSTGRES_CONNECTION_STRING) {
      return c.json({ error: "POSTGRES_CONNECTION_STRING is not set" }, 500);
    }

    try {
      const results = await FeedbackService.getFeedbacks(
        tenantId,
        applicationId,
        { limit, offset, startDate, endDate }
      );

      return c.json({
        success: true,
        results,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to get feedbacks",
        },
        500
      );
    }
  },
});

export const getFeedback = registerApiRoute("/custom/feedback/:id", {
  method: "GET",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { id } = c.req.param();

    if (!tenantId || !applicationId) {
      return c.json(
        {
          success: false,
          error: "Missing required header: x-tenant-id",
        },
        400
      );
    }

    try {
      const result = await FeedbackService.getFeedback(
        tenantId,
        applicationId,
        id
      );

      if (!result) {
        return c.json(
          {
            success: false,
            error: "Feedback not found",
          },
          404
        );
      }

      return c.json({
        success: true,
        result,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to get feedback",
        },
        500
      );
    }
  },
});

export const deleteFeedback = registerApiRoute("/custom/feedback/:id", {
  method: "DELETE",
  handler: async (c) => {
    const { id } = c.req.param();
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    if (!tenantId || !applicationId) {
      return c.json(
        {
          success: false,
          error: "Missing required header: x-tenant-id or x-application-id",
        },
        400
      );
    }

    try {
      await FeedbackService.deleteFeedback(tenantId, applicationId, id);

      return c.json({
        success: true,
        message: "Feedback deleted successfully",
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to delete feedback",
        },
        500
      );
    }
  },
});

export const createFeedback = registerApiRoute("/custom/feedback/create", {
  method: "POST",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const {
      threadId,
      messageId,
      query,
      explanation,
      schema_context,
      generated_sql,
      executed_success,
      user_feedback_score,
      business_context,
      user_feedback_reason,
      reward_signal,
    } = await c.req.json();

    if (!tenantId || !applicationId) {
      return c.json(
        {
          success: false,
          error: "Missing required headers: x-tenant-id or x-application-id",
        },
        400
      );
    }

    try {
      const result = await FeedbackService.createFeedback(
        tenantId,
        applicationId,
        {
          threadId,
          messageId,
          query,
          explanation,
          schema_context,
          generated_sql,
          executed_success,
          user_feedback_score,
          business_context,
          user_feedback_reason,
          reward_signal,
        }
      );

      return c.json({
        success: true,
        message: "Feedback stored successfully",
        result,
      });
    } catch (error) {
      console.log("error :", error);
      return c.json(
        {
          success: false,
          error: "Failed to store feedback",
        },
        500
      );
    }
  },
});

export const updateFeedback = registerApiRoute("/custom/feedback/update/:id", {
  method: "PUT",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { id } = c.req.param();
    const {
      threadId,
      messageId,
      query,
      explanation,
      schema_context,
      generated_sql,
      executed_success,
      user_feedback_score,
      business_context,
      user_feedback_reason,
      reward_signal,
    } = await c.req.json();

    if (!tenantId || !applicationId) {
      return c.json(
        {
          success: false,
          error: "Missing required headers: x-tenant-id or x-application-id",
        },
        400
      );
    }

    try {
      const result = await FeedbackService.updateFeedback(
        tenantId,
        applicationId,
        {
          id,
          threadId,
          messageId,
          query,
          explanation,
          schema_context,
          generated_sql,
          executed_success,
          user_feedback_score,
          business_context,
          user_feedback_reason,
          reward_signal,
        }
      );

      return c.json({
        success: true,
        message: "Feedback updated successfully",
        result,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to update feedback",
        },
        500
      );
    }
  },
});

export const runImproveAgentFromRL = registerApiRoute(
  "/custom/feedback/improve",
  {
    method: "POST",
    handler: async (c) => {
      const tenantId = c.req.header("x-tenant-id");
      const applicationId = c.req.header("x-application-id");
      const { daysBack } = await c.req.json();

      if (!tenantId || !applicationId) {
        return c.json(
          {
            success: false,
            error: "Missing required headers: x-tenant-id or x-application-id",
          },
          400
        );
      }

      try {
        const result = await FeedbackService.runImproveAgentFromRL(tenantId, applicationId, daysBack);

        return c.json({
          success: true,
          message: "Improve agent from RL run successfully",
          ...result,
        });
      } catch (error) {
        return c.json({ error: "Failed to run improve agent from RL" }, 500);
      }
    },
  }
);
