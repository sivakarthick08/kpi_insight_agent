/**
 * This file defines API routes for knowledge base operations in the deepspot-query-executor.
 *
 * Main functionalities:
 * - /custom/knowledgebase/tenant: Retrieve knowledge base entries by tenant
 * - /custom/knowledgebase/version-history: Get version history for knowledge base entries
 * - /custom/knowledgebase/entry: Get specific knowledge base entry by ID
 * - /custom/knowledgebase/search: Search knowledge base entries
 * - /custom/knowledgebase/update: Update knowledge base entry content
 */

import { registerApiRoute } from "@mastra/core/server";
import { KnowledgeBaseService } from "./service";

export const getKnowledgeBaseByTenant = registerApiRoute(
  "/custom/knowledgebase/tenant",
  {
    method: "POST",
    handler: async (c) => {
      const tenantId = c.req.header("x-tenant-id");
      const applicationId = c.req.header("x-application-id");

      if (!tenantId || !applicationId) {
        return c.json({ error: "Tenant ID is required" }, 400);
      }

      try {
        const entries = await KnowledgeBaseService.getKnowledgeBaseByTenant(
          tenantId,
          applicationId
        );

        return c.json({
          success: true,
          data: entries,
        });
      } catch (error) {
        return c.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to retrieve knowledge base entries",
          },
          500
        );
      }
    },
  }
);

export const getVersionHistory = registerApiRoute(
  "/custom/knowledgebase/version-history",
  {
    method: "POST",
    handler: async (c) => {
      const tenantId = c.req.header("x-tenant-id");
      const applicationId = c.req.header("x-application-id");

      if (!tenantId || !applicationId) {
        return c.json(
          {
            error: "Tenant ID and Application ID are required",
          },
          400
        );
      }

      try {
        const versionHistory = await KnowledgeBaseService.getVersionHistory(
          tenantId,
          applicationId
        );

        return c.json({
          success: true,
          data: versionHistory,
        });
      } catch (error) {
        return c.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to retrieve version history",
          },
          500
        );
      }
    },
  }
);

export const getKnowledgeBaseEntry = registerApiRoute(
  "/custom/knowledgebase/entry/:id",
  {
    method: "GET",
    handler: async (c) => {
      const tenantId = c.req.header("x-tenant-id");
      const applicationId = c.req.header("x-application-id");
      const { id } = c.req.param();

      if (!id || !tenantId || !applicationId) {
        return c.json(
          {
            error: "ID, Tenant ID, and Application ID are required",
          },
          400
        );
      }

      try {
        const entry = await KnowledgeBaseService.getKnowledgeBaseById(
          Number(id),
          tenantId,
          applicationId
        );

        if (!entry) {
          return c.json(
            {
              success: false,
              error: "Knowledge base entry not found",
            },
            404
          );
        }

        return c.json({
          success: true,
          data: entry,
        });
      } catch (error) {
        return c.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to retrieve knowledge base entry",
          },
          500
        );
      }
    },
  }
);


export const updateKnowledgeBase = registerApiRoute(
  "/custom/knowledgebase/update/:id",
  {
    method: "PUT",
    handler: async (c) => {
      const tenantId = c.req.header("x-tenant-id");
      const applicationId = c.req.header("x-application-id");
      const { id } = c.req.param();
      const { content, metadata } = await c.req.json();

      if (!id || !content || !tenantId || !applicationId) {
        return c.json(
          {
            error: "ID, content, Tenant ID, and Application ID are required",
          },
          400
        );
      }

      try {
        const result = await KnowledgeBaseService.updateKnowledgeBase(
          Number(id),
          content,
          metadata || [], // Provide default empty array if metadata is not provided
          tenantId,
          applicationId
        );

        if (!result) {
          return c.json(
            {
              success: false,
              error: "Knowledge base entry not found or update failed",
            },
            404
          );
        }

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        return c.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to update knowledge base entry",
          },
          500
        );
      }
    },
  }
);
