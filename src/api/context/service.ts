import { CONTENTS_ENTRIES_TABLE_NAME } from "../../mastra/lib/conts";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { dbClient } from "../../databases/db";
import { storeContext } from "../../mastra/tools/context-tool";

export interface ContextQueryParams {
  limit: string | number;
  offset: string | number;
}

export interface ContextCreateParams {
  title: string;
  tags: string[];
  markdown: string;
}

export interface ContextDeleteParams {
  vector_id: string;
}

export interface ContextResult {
  id: string;
  vector_id?: string;
  result: {
    title: string;
    tenantId: string;
    applicationId: string;
    tags: string[];
    markdown: string;
  };
}

export class ContextService {
  /**
   * Get contexts with pagination
   */
  static async getContexts(
    tenantId: string,
    applicationId: string,
    params: ContextQueryParams
  ): Promise<ContextResult[]> {
    const { limit, offset } = params;
    const limitNum =
      typeof limit === "string" ? parseInt(limit || "10", 10) : limit || 10;
    const offsetNum =
      typeof offset === "string" ? parseInt(offset || "0", 10) : offset || 0;

    const result = await dbClient?.executeQuery(
      `SELECT id, vector_id, json_build_object(
          'title', metadata->>'title',
          'tenantId', metadata->>'tenantId',
          'applicationId', metadata->>'applicationId',
          'tags', metadata->'tags',
          'markdown', metadata->'markdown'
      ) AS result FROM ${CONTENTS_ENTRIES_TABLE_NAME}
       WHERE metadata->>'applicationId' = '${applicationId}'
       AND metadata->>'tenantId' = '${tenantId}'
       LIMIT ${limitNum} OFFSET ${offsetNum}`
    );

    return result || [];
  }

  /**
   * Get a single context by ID
   */
  static async getContext(
    tenantId: string,
    applicationId: string,
    id: string
  ): Promise<ContextResult | null> {
    const result = await dbClient.executeQuery(
      `SELECT id, json_build_object(
            'title', metadata->>'title',
            'tenantId', metadata->>'tenantId',
            'applicationId', metadata->>'applicationId',
            'tags', metadata->'tags',
            'markdown', metadata->'markdown'
        ) AS result FROM ${CONTENTS_ENTRIES_TABLE_NAME}
         WHERE vector_id = '${id}'
         AND metadata->>'tenantId' = '${tenantId}'
         AND metadata->>'applicationId' = '${applicationId}'`
    );

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Delete a context by vector_id
   */
  static async deleteContext(
    tenantId: string,
    applicationId: string,
    vector_id: string
  ): Promise<boolean> {
    const result = await dbClient.executeQuery(
      `SELECT id FROM ${CONTENTS_ENTRIES_TABLE_NAME}
         WHERE vector_id = '${vector_id}'
         AND metadata->>'tenantId' = '${tenantId}'
         AND metadata->>'applicationId' = '${applicationId}'`
    );

    if (result.length > 0) {
      await dbClient?.executeQuery(
        `DELETE FROM ${CONTENTS_ENTRIES_TABLE_NAME}
         WHERE id = '${result[0].id}'`
      );
      return true;
    }

    return false;
  }

  /**
   * Create a new context
   */
  static async createContext(
    tenantId: string,
    applicationId: string,
    params: ContextCreateParams
  ): Promise<string> {
    const result = await storeContext({
      title: params.title,
      tags: params.tags,
      markdown: params.markdown,
      isFolder: false,
      tenantId,
      applicationId,
    });

    if (!result?.result?.vector_ids[0]) {
      throw new Error("Failed to store context");
    }

    return result?.result?.vector_ids[0];
  }
}
