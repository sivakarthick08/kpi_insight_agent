import { registerApiRoute } from "@mastra/core/server";
import { ContextService } from "./service";

export const getContexts = registerApiRoute("/custom/context", {
  method: "GET",
  handler: async (c) => {
    const { limit, offset } = c.req.query();

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

    try {
      const result = await ContextService.getContexts(tenantId, applicationId, {
        limit,
        offset,
      });

      return c.json({
        success: true,
        result,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to get contexts",
        },
        500
      );
    }
  },
});

export const getContext = registerApiRoute("/custom/context/:id", {
  method: "GET",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { id } = c.req.param();

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
      const result = await ContextService.getContext(
        tenantId,
        applicationId,
        id
      );

      if (!result) {
        return c.json(
          {
            success: false,
            error: "Context not found",
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
          error: "Failed to get context",
        },
        500
      );
    }
  },
});

export const deleteContext = registerApiRoute("/custom/context/:vector_id", {
  method: "DELETE",
  handler: async (c) => {
    const { vector_id } = c.req.param();
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
      const deleted = await ContextService.deleteContext(
        tenantId,
        applicationId,
        vector_id
      );

      if (!deleted) {
        return c.json(
          {
            success: false,
            error: "Context not found",
          },
          404
        );
      }

      return c.json({
        success: true,
        message: "Context deleted successfully",
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to delete context",
        },
        500
      );
    }
  },
});

export const createContext = registerApiRoute("/custom/context/create", {
  method: "POST",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { title, tags, markdown } = await c.req.json();

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
      const vectorId = await ContextService.createContext(
        tenantId,
        applicationId,
        { title, tags, markdown }
      );

      return c.json({
        success: true,
        message: "Context stored successfully",
        result: vectorId,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to store context",
        },
        500
      );
    }
  },
});
