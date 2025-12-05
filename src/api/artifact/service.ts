import { dbClient } from "../../databases/db";
import { ARTIFACT_ENTRIES_TABLE_NAME } from "../../mastra/lib/conts";

export interface ArtifactQueryParams {
  limit: string | number;
  offset: string | number;
  search?: string;
}

export interface ArtifactResult {
  id: string;
  title: string;
  content: string;
  thread_id: string;
  application_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export class ArtifactService {
  /**
   * Get artifacts with pagination and optional search
   */
  static async getArtifacts(
    tenantId: string,
    applicationId: string,
    params: ArtifactQueryParams
  ): Promise<ArtifactResult[]> {
    const { limit, offset, search } = params;
    const limitNum = typeof limit === "string" ? parseInt(limit, 10) : limit;
    const offsetNum =
      typeof offset === "string" ? parseInt(offset, 10) : offset;

    const result = await dbClient.executeQuery(
      `SELECT * FROM ${ARTIFACT_ENTRIES_TABLE_NAME}
          WHERE application_id = '${applicationId}' 
          AND tenant_id = '${tenantId}'
          ${search ? `AND title ILIKE '%${search}%'` : ""}
        ORDER BY created_at DESC
        LIMIT ${limitNum} OFFSET ${offsetNum}`
    );

    return result || [];
  }

  /**
   * Get artifacts by thread ID
   */
  static async getArtifactsByThreadId(
    tenantId: string,
    applicationId: string,
    threadId: string,
    params: { limit: string | number; offset: string | number }
  ): Promise<ArtifactResult[]> {
    const { limit, offset } = params;
    const limitNum =
      typeof limit === "string" ? parseInt(limit || "10", 10) : limit || 10;
    const offsetNum =
      typeof offset === "string" ? parseInt(offset || "0", 10) : offset || 0;

    const query = `SELECT * FROM ${ARTIFACT_ENTRIES_TABLE_NAME}
    WHERE application_id = '${applicationId}'
     AND tenant_id = '${tenantId}' 
     AND thread_id = '${threadId}' 
    ORDER BY created_at DESC
    LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const result = await dbClient.executeQuery(query);

    return result || [];
  }

  /**
   * Get artifact by ID
   */
  static async getArtifactById(
    tenantId: string,
    applicationId: string,
    id: string
  ): Promise<ArtifactResult | null> {
    const result = await dbClient.executeQuery(
      `SELECT * FROM ${ARTIFACT_ENTRIES_TABLE_NAME}
             WHERE application_id = '${applicationId}'
              AND tenant_id = '${tenantId}' 
              AND id = '${id}'`
    );

    return result.length > 0 ? result[0] : null;
  }
}
