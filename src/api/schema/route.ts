/**
 * This file defines API routes for semantic layer operations in the deepspot-query-executor.
 *
 * Main functionalities:
 * - /custom/semantic/schema: Retrieve the schema of a database (Postgres or BigQuery).
 * - /custom/semantic/tables-by-schema: List tables for a given schema in the database.
 * - /custom/semantic/tables-details: Get fields and relationships for specified tables.
 * - /custom/semantic/generate: Generate semantic layer descriptions (tables, fields, relationships, metrics)
 *   using LLMs, create embeddings for them, and store the embeddings in a PgVector store.
 *
 * Dependencies:
 * - Uses Mastra client/server for API route registration and vector storage.
 * - Integrates with OpenAI for LLM-based description generation.
 * - Supports both Postgres and BigQuery as data sources.
 */

import { registerApiRoute } from "@mastra/core/server";
import { DatabaseType } from "../../databases";
import { SchemaService } from "./service";
import { getDBClient } from "../../mastra/lib/getDBClient";

export const getDatabaseSchema = registerApiRoute("/custom/semantic/schema", {
  method: "POST",
  handler: async (c) => {
    const body = await c.req.json();
    const { databaseType, connectionString, catalogName } = body;

    if (!databaseType || !Object.values(DatabaseType).includes(databaseType)) {
      return c.json({ error: "Database type is required" }, 400);
    }

    if (!connectionString) {
      return c.json({ error: "Connection string is required" }, 400);
    }

    if (databaseType === DatabaseType.DATABRICKS && !catalogName) {
      return c.json({ error: "Catalog name is required for Databricks" }, 400);
    }

    try {
      const schema = await SchemaService.getDatabaseSchema({
        databaseType,
        connectionString,
        catalogName,
      });

      return c.json(schema);
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to get database schema",
        },
        500
      );
    }
  },
});

export const tablesBySchema = registerApiRoute(
  "/custom/semantic/tables-by-schema",
  {
    method: "POST",
    handler: async (c) => {
      const body = await c.req.json();
      const { databaseType, connectionString, schema, catalogName } = body;

      if (
        !databaseType ||
        !Object.values(DatabaseType).includes(databaseType)
      ) {
        return c.json({ error: "Database type is required" }, 400);
      }

      if (!connectionString) {
        return c.json({ error: "Connection string is required" }, 400);
      }

      if (!schema) {
        return c.json({ error: "Schema is required" }, 400);
      }

      if (databaseType === DatabaseType.DATABRICKS && !catalogName) {
        return c.json(
          { error: "Catalog name is required for Databricks" },
          400
        );
      }

      try {
        const tables = await SchemaService.getTablesBySchema({
          databaseType,
          connectionString,
          schema,
          // databaseName,
          catalogName,
        });

        return c.json(tables);
      } catch (error) {
        return c.json(
          {
            success: false,
            error: "Failed to get tables by schema",
          },
          500
        );
      }
    },
  }
);

export const tablesDetails = registerApiRoute(
  "/custom/semantic/tables-details",
  {
    method: "POST",
    handler: async (c) => {
      const body = await c.req.json();
      const { databaseType, connectionString, schema, tables, catalogName } =
        body;

      if (
        !databaseType ||
        !Object.values(DatabaseType).includes(databaseType)
      ) {
        return c.json({ error: "Database type is required" }, 400);
      }

      if (!connectionString) {
        return c.json({ error: "Connection string is required" }, 400);
      }

      if (!schema) {
        return c.json({ error: "Schema is required" }, 400);
      }

      if (!tables) {
        return c.json({ error: "Tables are required" }, 400);
      }
      if (databaseType === DatabaseType.DATABRICKS && !catalogName) {
        return c.json(
          { error: "Catalog name is required for Databricks" },
          400
        );
      }

      try {
        const result = await SchemaService.getTablesDetails({
          databaseType,
          connectionString,
          schema,
          tables,
          catalogName,
        });

        return c.json(result);
      } catch (error) {
        console.log("error :", error);
        return c.json(
          {
            success: false,
            error:
              error instanceof Error
                ? JSON.stringify(error)
                : "Failed to get table details",
          },
          500
        );
      }
    },
  }
);

export const generateSemanticLayer = registerApiRoute(
  "/custom/semantic/generate",
  {
    method: "POST",
    handler: async (c) => {
      const body = await c.req.json();
      const tenantContext = (c.req as any).tenantContext;

      // Extract required parameters
      const tenantId = tenantContext?.tenantId || body.tenantId;
      const applicationId = tenantContext?.applicationId || body.applicationId;
      const databaseType = tenantContext?.databaseType || body.databaseType;
      const connectionString =
        tenantContext?.connectionString || body.connectionString;
      const {
        table,
        columns,
        relationships,
        metrics,
        context,
        categories,
        schema,
        catalogName,
        // databaseName,
      } = body;

      // Validation
      if (!tenantId || !applicationId || !table) {
        return c.json(
          {
            success: false,
            error: !tenantId
              ? "Tenant ID is required"
              : !applicationId
                ? "Application ID is required"
                : "Table is required",
          },
          400
        );
      }

      try {
        const result = await SchemaService.generateSemanticLayer({
          tenantId,
          applicationId,
          databaseType,
          connectionString,
          table,
          columns,
          relationships,
          metrics,
          context,
          categories,
          schema,
          catalogName,
          // databaseName,
        });

        return c.json({
          success: true,
          data: result.data,
          summary: result.summary,
        });
      } catch (error) {
        return c.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to generate semantic layer",
          },
          500
        );
      }
    },
  }
);

export const getCatalog = registerApiRoute("/custom/semantic/catalogs", {
  method: "POST",
  handler: async (c) => {
    try {
      const body = await c.req.json();
      const data = await SchemaService.getCatalog(body);

      return c.json(data, 200);
    } catch (err: any) {
      return c.json(
        {
          error: true,
          message:
            err?.message || "Something went wrong while fetching catalogs",
        },
        500
      );
    }
  },
});

export const healthCheck = registerApiRoute("/custom/semantic/health-check", {
  method: "POST",
  handler: async (c) => {
    const body = await c.req.json();
    console.log("body :", body);
    const { databaseType, connectionString } = body;

    try {
      const client = getDBClient(
        databaseType as DatabaseType,
        connectionString
      );
      if (!client) {
        return c.json(
          {
            success: false,
            error: "Failed to create database client",
          },
          400
        );
      }
      const result = await client.healthCheck();
      console.log("result :", result);

      if (result) {
        return c.json({
          success: true,
        });
      } else {
        return c.json(
          {
            success: false,
            error: "Database connection is not healthy",
          },
          500
        );
      }
    } catch (error) {
      return c.json(
        {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to health check",
        },
        500
      );
    }
  },
});
