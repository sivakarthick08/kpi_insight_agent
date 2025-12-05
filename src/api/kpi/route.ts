import { registerApiRoute } from "@mastra/core/server";
import { KpiService } from "./service";

export const getKpis = registerApiRoute("/custom/kpi", {
  method: "GET",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { limit, offset, category } = c.req.query();

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
      const result = await KpiService.getKpis(tenantId, applicationId, {
        limit,
        offset,
        category,
      });

      return c.json({
        success: true,
        data: result,
        pagination: {
          limit: parseInt(limit || "10", 10),
          offset: parseInt(offset || "0", 10),
          total: result.length,
        },
      });
    } catch (error) {
      console.error("Error getting KPIs:", error);
      return c.json(
        {
          success: false,
          error: "Failed to get KPIs",
        },
        500
      );
    }
  },
});

export const getKpi = registerApiRoute("/custom/kpi/:id", {
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
      const result = await KpiService.getKpi(tenantId, applicationId, id);

      if (!result) {
        return c.json(
          {
            success: false,
            error: "KPI not found",
          },
          404
        );
      }

      return c.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error getting KPI:", error);
      return c.json(
        {
          success: false,
          error: "Failed to get KPI",
        },
        500
      );
    }
  },
});

export const createKpi = registerApiRoute("/custom/kpi/create", {
  method: "POST",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const body = await c.req.json();

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
      // Validate KPI data
      const validation = KpiService.validateKpiData(body);
      if (!validation.isValid) {
        return c.json(
          {
            success: false,
            error: "Invalid KPI data",
            details: validation.errors,
          },
          400
        );
      }

      const kpiId = await KpiService.createKpi(tenantId, applicationId, body);

      return c.json({
        success: true,
        message: "KPI created successfully",
        data: { id: kpiId },
      });
    } catch (error) {
      console.error("Error creating KPI:", error);
      return c.json(
        {
          success: false,
          error: "Failed to create KPI",
        },
        500
      );
    }
  },
});

export const updateKpi = registerApiRoute("/custom/kpi/:id", {
  method: "PUT",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { id } = c.req.param();
    const body = await c.req.json();

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
      // Validate KPI data if provided
      if (Object.keys(body).length > 0) {
        const validation = KpiService.validateKpiData(body as any);
        if (!validation.isValid) {
          return c.json(
            {
              success: false,
              error: "Invalid KPI data",
              details: validation.errors,
            },
            400
          );
        }
      }

      const result = await KpiService.updateKpi(tenantId, applicationId, id, body);

      return c.json({
        success: true,
        message: "KPI updated successfully",
        data: result,
      });
    } catch (error) {
      console.error("Error updating KPI:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json(
          {
            success: false,
            error: "KPI not found",
          },
          404
        );
      }
      return c.json(
        {
          success: false,
          error: "Failed to update KPI",
        },
        500
      );
    }
  },
});

export const deleteKpi = registerApiRoute("/custom/kpi/:id", {
  method: "DELETE",
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
      const deleted = await KpiService.deleteKpi(tenantId, applicationId, id);

      if (!deleted) {
        return c.json(
          {
            success: false,
            error: "KPI not found",
          },
          404
        );
      }

      return c.json({
        success: true,
        message: "KPI deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting KPI:", error);
      return c.json(
        {
          success: false,
          error: "Failed to delete KPI",
        },
        500
      );
    }
  },
});

export const searchKpis = registerApiRoute("/custom/kpi/search", {
  method: "POST",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { query, category, maxResults } = await c.req.json();

    if (!tenantId || !applicationId) {
      return c.json(
        {
          success: false,
          error: "Missing required headers: x-tenant-id or x-application-id",
        },
        400
      );
    }

    if (!query || query.trim().length === 0) {
      return c.json(
        {
          success: false,
          error: "Search query is required",
        },
        400
      );
    }

    try {
      const result = await KpiService.searchKpis(tenantId, applicationId, {
        query: query.trim(),
        category,
        maxResults,
      });

      return c.json({
        success: true,
        data: result,
        search: {
          query: query.trim(),
          category,
          maxResults: maxResults || 10,
          total_found: result.length,
        },
      });
    } catch (error) {
      console.error("Error searching KPIs:", error);
      return c.json(
        {
          success: false,
          error: "Failed to search KPIs",
        },
        500
      );
    }
  },
});

export const getKpiStats = registerApiRoute("/custom/kpi/stats", {
  method: "GET",
  handler: async (c) => {
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
      const stats = await KpiService.getKpiStats(tenantId, applicationId);

      return c.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Error getting KPI stats:", error);
      return c.json(
        {
          success: false,
          error: "Failed to get KPI statistics",
        },
        500
      );
    }
  },
});

export const getKpiCategories = registerApiRoute("/custom/kpi/categories", {
  method: "GET",
  handler: async (c) => {
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
      const categories = await KpiService.getCategories(tenantId, applicationId);

      return c.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Error getting KPI categories:", error);
      return c.json(
        {
          success: false,
          error: "Failed to get KPI categories",
        },
        500
      );
    }
  },
});

export const getKpisByCategory = registerApiRoute("/custom/kpi/category/:category", {
  method: "GET",
  handler: async (c) => {
    const tenantId = c.req.header("x-tenant-id");
    const applicationId = c.req.header("x-application-id");
    const { category } = c.req.param();
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
      const result = await KpiService.getKpisByCategory(
        tenantId,
        applicationId,
        category,
        {
          limit: parseInt(limit || "10", 10),
          offset: parseInt(offset || "0", 10),
        }
      );

      return c.json({
        success: true,
        data: result,
        category,
        pagination: {
          limit: parseInt(limit || "10", 10),
          offset: parseInt(offset || "0", 10),
          total: result.length,
        },
      });
    } catch (error) {
      console.error("Error getting KPIs by category:", error);
      return c.json(
        {
          success: false,
          error: "Failed to get KPIs by category",
        },
        500
      );
    }
  },
});