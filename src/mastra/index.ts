import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import dotenv from "dotenv";
import { deepspotAgent } from "./agents/deepspot";
import { allApiRoutes } from "../api";
import { deepspotWorkflow } from "./workflows";
import { initializeStorage } from "./core/semantic-layer-storage-tool";
import { LangfuseExporter } from "@mastra/langfuse";
import { searchAndExecuteQueryWorkflow } from "./workflows/searchAndExecuteQuery";
import { kpi_insight_agent } from "./agents/kpi_insight_agent";
import { kpiWorkflow } from "./workflows/kpi_workflow";
import { insightWorkflow } from "./workflows/insight_workflow";

// Load environment variables
dotenv.config();

// initializeStorage()

export const mastra = new Mastra({
  agents: {
    deepspotAgent,
    kpi_insight_agent
  },
  workflows: {
    deepspotWorkflow,
    searchAndExecuteQueryWorkflow,
    kpiWorkflow,
    insightWorkflow
  },
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),

  bundler: {
    externals: ["lz4", "@databricks/sql", "mssql", "mariadb", "mysql2", "redis", "@google-cloud/bigquery"],
  },
  observability: {
    configs: {
      langfuse: {
        serviceName: "deepspot-query-executor",
        exporters: [
          new LangfuseExporter({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
            secretKey: process.env.LANGFUSE_SECRET_KEY!,
            baseUrl: process.env.LANGFUSE_BASE_URL,
            options: {
              environment: process.env.NODE_ENV,
            },
            realtime: process.env.NODE_ENV === "development", // Dynamic mode selection
            logLevel: "info",
          }),
        ],
      },
    },
  },

  server: {
    // cors: {
    //   origin: "*",
    //   credentials: false,
    // },

    middleware: [
      async (c, next) => {
        // if (c.req.path.startsWith("/custom")) {
        const MASTRA_AUTH_TOKEN = process.env.MASTRA_AUTH_TOKEN;
        const authToken = c.req.header("x-deepspot-auth");
        // if (authToken !== MASTRA_AUTH_TOKEN) {
        //   return c.json({ error: "Unauthorized" }, 403);
        // }

        // // Check if tenant is set
        // if (!c.req.header("x-tenant-id")) {
        //   return c.json({ error: "Tenant ID is required" }, 403);
        // }

        // // Check if tenant database type is set
        // if (!c.req.header("x-tenant-database-type")) {
        //   return c.json({ error: "Tenant database type is required" }, 403);
        // }

        // // Check if tenant connection string is set
        // if (!c.req.header("x-tenant-connection-string")) {
        //   return c.json(
        //     { error: "Tenant connection string is required" },
        //     403
        //   );
        // }

        return await next();
        // }

        // return await next();
      },
    ],

    cors: {
      origin: "*",
      credentials: false,
      allowHeaders: ["x-tenant-id", "x-application-id", "x-deepspot-auth"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    },

    apiRoutes: [...allApiRoutes],
  },
});


