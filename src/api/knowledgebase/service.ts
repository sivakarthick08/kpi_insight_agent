import { RuntimeContext } from "@mastra/core/runtime-context";
import { getLatestKnowledgeBase, storeKnowledgeBase } from "../../mastra/tools/knowledgebase";

export interface KnowledgeBaseEntry {
  id: number;
  content: string;
  metadata: any;
  version: number;
  tenantId: string;
  applicationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeBaseVersionHistory {
  id: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  changeSummary?: string;
}

export class KnowledgeBaseService {
  /**
   * Get knowledge base entry by tenant (single entry per client)
   */
  static async getKnowledgeBaseByTenant(
    tenantId: string,
    applicationId: string
  ): Promise<KnowledgeBaseEntry | null> {
    try {
      const result = await getLatestKnowledgeBase({
        tenantId,
        applicationId,
      });

      if (!result.result?.id) {
        return null;
      }

      const entry = result.result;
      return {
        id: entry?.id,
        content: entry.content,
        metadata: entry?.metadata,
        version: entry?.version,
        tenantId: tenantId,
        applicationId: applicationId || "default",
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      };
    } catch (error) {
      console.error("Error getting knowledge base by tenant:", error);
      throw new Error("Failed to retrieve knowledge base entry");
    }
  }

  /**
   * Get version history for a specific knowledge base entry
   */
  static async getVersionHistory(
    tenantId: string,
    applicationId: string
  ): Promise<KnowledgeBaseVersionHistory[]> {
    try {
      // For now, we'll get the latest entry and return it as version history
      // In the future, we can extend the tool to support version history
      const runtimeContext = new RuntimeContext();
      runtimeContext.set("tenantId", tenantId);
      runtimeContext.set("applicationId", applicationId);

      const result = await getLatestKnowledgeBase({
        tenantId,
        applicationId,
      });

      if (!result.result?.id) {
        return [];
      }

      const entry = result.result;

      if (!result.result) {
        return [];
      }

      return [
        {
          id: entry?.id,
          version: entry?.version,
          createdAt: new Date(entry?.createdAt),
          updatedAt: new Date(entry?.updatedAt),
        },
      ];
    } catch (error) {
      console.error("Error getting version history:", error);
      throw new Error("Failed to retrieve version history");
    }
  }

  /**
   * Get knowledge base entry by ID
   */
  static async getKnowledgeBaseById(
    id: number,
    tenantId: string,
    applicationId: string
  ): Promise<KnowledgeBaseEntry | null> {
    try {
      const runtimeContext = new RuntimeContext();
      runtimeContext.set("tenantId", tenantId);
      runtimeContext.set("applicationId", applicationId);

      const result = await this.getKnowledgeBaseById(id, tenantId, applicationId);

      if (!result) {
        return null;
      }

      const entry = result;
      return {
        id: entry?.id,
        content: entry?.content,
        metadata: entry?.metadata,
        version: entry?.version,
        tenantId: tenantId,
        applicationId: applicationId,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      };
    } catch (error) {
      console.error("Error getting knowledge base by ID:", error);
      throw new Error("Failed to retrieve knowledge base entry");
    }
  }


  /**
   * Update knowledge base entry content
   */
  static async updateKnowledgeBase(
    id: number,
    content: string,
    metadata: any[],
    tenantId: string,
    applicationId: string
  ): Promise<KnowledgeBaseEntry | null> {
    try {
      const runtimeContext = new RuntimeContext();
      runtimeContext.set("tenantId", tenantId);
      runtimeContext.set("applicationId", applicationId);

      const result = await storeKnowledgeBase({
        tenantId,
        applicationId,
        content,
        metadata,
      });

      if (!result.result?.stored) {
        return null;
      }

      const updatedEntryId = result.result?.knowledgeBaseEntry.id;
      return updatedEntryId;
    } catch (error) {
      console.error("Error updating knowledge base:", error);
      throw new Error("Failed to update knowledge base entry");
    }
  }
}
