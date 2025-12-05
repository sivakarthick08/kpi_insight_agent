import { registerApiRoute } from "@mastra/core/server";
import { MigrationService } from "./service";

/**
 * Get migration status summary
 * GET /custom/migrations/status
 */
export const getMigrationStatus = registerApiRoute("/custom/migrations/status", {
  method: "GET",
  handler: async (c) => {
    try {
      const status = await MigrationService.getStatus();
      
      return c.json({
        success: true,
        result: status,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: `Failed to get migration status: ${errorMessage}`,
        },
        500
      );
    }
  },
});

/**
 * Get all applied migrations
 * GET /custom/migrations/applied
 */
export const getAppliedMigrations = registerApiRoute("/custom/migrations/applied", {
  method: "GET",
  handler: async (c) => {
    try {
      const migrations = await MigrationService.getAppliedMigrations();
      
      return c.json({
        success: true,
        result: migrations,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: `Failed to get applied migrations: ${errorMessage}`,
        },
        500
      );
    }
  },
});

/**
 * Get all pending migrations
 * GET /custom/migrations/pending
 */
export const getPendingMigrations = registerApiRoute("/custom/migrations/pending", {
  method: "GET",
  handler: async (c) => {
    try {
      const migrations = await MigrationService.getPendingMigrations();
      
      return c.json({
        success: true,
        result: migrations,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: `Failed to get pending migrations: ${errorMessage}`,
        },
        500
      );
    }
  },
});

/**
 * Apply all pending migrations
 * POST /custom/migrations/up
 */
export const migrateUp = registerApiRoute("/custom/migrations/up", {
  method: "POST",
  handler: async (c) => {
    try {
      const results = await MigrationService.migrateUp();
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      return c.json({
        success: true,
        message: `Migration completed. ${successCount} successful, ${failureCount} failed.`,
        result: {
          total: results.length,
          successful: successCount,
          failed: failureCount,
          results
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: `Failed to apply migrations: ${errorMessage}`,
        },
        500
      );
    }
  },
});

/**
 * Rollback the last N migrations
 * POST /custom/migrations/down
 */
export const migrateDown = registerApiRoute("/custom/migrations/down", {
  method: "POST",
  handler: async (c) => {
    try {
      const { count = 1 } = await c.req.json();
      
      if (typeof count !== 'number' || count < 1) {
        return c.json(
          {
            success: false,
            error: "Count must be a positive number",
          },
          400
        );
      }
      
      const results = await MigrationService.migrateDown(count);
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      return c.json({
        success: true,
        message: `Rollback completed. ${successCount} successful, ${failureCount} failed.`,
        result: {
          total: results.length,
          successful: successCount,
          failed: failureCount,
          results
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: `Failed to rollback migrations: ${errorMessage}`,
        },
        500
      );
    }
  },
});

/**
 * Apply a specific migration by ID
 * POST /custom/migrations/apply/:id
 */
export const applyMigration = registerApiRoute("/custom/migrations/apply/:id", {
  method: "POST",
  handler: async (c) => {
    try {
      const { id } = c.req.param();
      
      if (!id) {
        return c.json(
          {
            success: false,
            error: "Migration ID is required",
          },
          400
        );
      }
      
      const result = await MigrationService.applyMigration(id);
      
      if (result.success) {
        return c.json({
          success: true,
          message: `Migration ${id} applied successfully`,
          result,
        });
      } else {
        return c.json(
          {
            success: false,
            error: `Failed to apply migration ${id}: ${result.error}`,
            result,
          },
          500
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: `Failed to apply migration: ${errorMessage}`,
        },
        500
      );
    }
  },
});

/**
 * Rollback a specific migration by ID
 * POST /custom/migrations/rollback/:id
 */
export const rollbackMigration = registerApiRoute("/custom/migrations/rollback/:id", {
  method: "POST",
  handler: async (c) => {
    try {
      const { id } = c.req.param();
      
      if (!id) {
        return c.json(
          {
            success: false,
            error: "Migration ID is required",
          },
          400
        );
      }
      
      const result = await MigrationService.rollbackMigration(id);
      
      if (result.success) {
        return c.json({
          success: true,
          message: `Migration ${id} rolled back successfully`,
          result,
        });
      } else {
        return c.json(
          {
            success: false,
            error: `Failed to rollback migration ${id}: ${result.error}`,
            result,
          },
          500
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: `Failed to rollback migration: ${errorMessage}`,
        },
        500
      );
    }
  },
});

/**
 * Get a specific migration by ID
 * GET /custom/migrations/:id
 */
export const getMigration = registerApiRoute("/custom/migrations/:id", {
  method: "GET",
  handler: async (c) => {
    try {
      const { id } = c.req.param();
      
      if (!id) {
        return c.json(
          {
            success: false,
            error: "Migration ID is required",
          },
          400
        );
      }
      
      const migration = await MigrationService.getMigration(id);
      
      if (!migration) {
        return c.json(
          {
            success: false,
            error: "Migration not found",
          },
          404
        );
      }
      
      const status = await MigrationService.getMigrationStatus(id);
      
      return c.json({
        success: true,
        result: {
          migration,
          status,
          isApplied: !!status
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: `Failed to get migration: ${errorMessage}`,
        },
        500
      );
    }
  },
});
