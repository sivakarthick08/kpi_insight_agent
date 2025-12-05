import { registerApiRoute } from "@mastra/core/server";
import { TenantService } from "./service";

export const createTenantSchema = registerApiRoute("/custom/tenant", {
  method: "POST",
  handler: async (c) => {
    const body = await c.req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return c.json({ error: "Tenant ID is required" }, 400);
    }

    try {
      await TenantService.createTenantSchema({ tenantId });

      return c.json({ message: "Tenant schema created" });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create tenant schema",
        },
        500
      );
    }
  },
});

export const deleteTenantSchema = registerApiRoute("/custom/tenant", {
  method: "DELETE",
  handler: async (c) => {
    const body = await c.req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return c.json({ error: "Tenant ID is required" }, 400);
    }

    try {
      await TenantService.deleteTenantSchema({ tenantId });

      return c.json({ message: "Tenant schema deleted" });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to delete tenant schema",
        },
        500
      );
    }
  },
});
