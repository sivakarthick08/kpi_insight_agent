import { registerApiRoute } from "@mastra/core/server";
import { ArtifactService } from "./service";

export const getArtifacts = registerApiRoute("/custom/artifact", {
  method: "GET",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { limit, offset, search } = c.req.query();

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
      const result = await ArtifactService.getArtifacts(
        tenantId,
        applicationId,
        { limit, offset, search }
      );

      return c.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.log("error :", error);
      return c.json(
        {
          success: false,
          error: "Failed to get artifact",
        },
        500
      );
    }
  },
});

export const getArtifactByThreadId = registerApiRoute(
  "/custom/artifact/thread/:threadId",
  {
    method: "GET",
    handler: async (c) => {
      const tenantId = c.req.header("x-tenant-id");
      const applicationId = c.req.header("x-application-id");
      const { threadId } = c.req.param();
      const { limit, offset } = c.req.query();

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
        const result = await ArtifactService.getArtifactsByThreadId(
          tenantId,
          applicationId,
          threadId,
          { limit, offset }
        );

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.log("error :", error);
        return c.json(
          {
            success: false,
            error: "Failed to get artifact",
          },
          500
        );
      }
    },
  }
);

export const getArtifactById = registerApiRoute("/custom/artifact/:id", {
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
      const result = await ArtifactService.getArtifactById(
        tenantId,
        applicationId,
        id
      );

      if (!result) {
        return c.json(
          {
            success: false,
            error: "Artifact not found",
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
          error: "Failed to get artifact",
        },
        500
      );
    }
  },
});
