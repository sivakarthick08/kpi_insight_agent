import { createTool } from "@mastra/core";
import { z } from "zod";
import { searchArtifact } from "../core/artifact";

export const artifactTool = createTool({
  id: "artifact-tool",
  inputSchema: z.object({
    tenantId: z.string(),
    applicationId: z.string(),
    userQuery: z.string(),
    maxResults: z.number().optional(),
  }),
  outputSchema: z.object({
    artifact: z.any(),
  }),
  description: "Tool for getting an artifact",
  execute: async ({
    context: { tenantId, applicationId, userQuery, maxResults },
  }) => {
    const artifact = await searchArtifact({
      tenantId,
      userQuery,
      applicationId,
      maxResults: maxResults,
    });
    return {
      artifact: artifact,
    };
  },
});
