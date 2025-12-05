import {
  generateChunksAndEmbeddingFromDocument,
  generateEmbedding,
} from "../lib/generateEmbedding";
import { getDefaultPgVector } from "../lib/pgVector";
import { CONTENTS_ENTRIES_TABLE_NAME } from "../lib/conts";
import crypto from "crypto";

export interface ContextEntryMetadata {
  title: string;
  tags: string[];
  markdown: string;
  isFolder: boolean;
  tenantId: string;
  applicationId: string;
}

export const storeContext = async ({
  title,
  tags,
  markdown,
  isFolder,
  tenantId,
  applicationId,
}: {
  title: string;
  tags: string[];
  markdown: string;
  isFolder: boolean;
  tenantId: string;
  applicationId: string;
}) => {
  const store = getDefaultPgVector();
  const {
    chunks,
    embeddings: embeddingResult,
    error,
    usage,
  } = await generateChunksAndEmbeddingFromDocument(markdown);
  if (error) {
    return {
      result: undefined,
      usage: undefined,
      error: error,
    };
  }

  if (!embeddingResult || embeddingResult.length === 0) {
    return {
      result: undefined,
      usage: undefined,
      error: "No embeddings generated",
    };
  }

  const batchSize = 100;
  const batches = [];
  for (let i = 0; i < embeddingResult.length; i += batchSize) {
    batches.push(embeddingResult.slice(i, i + batchSize));
  }

  const results = await store?.upsert({
    indexName: CONTENTS_ENTRIES_TABLE_NAME,
    vectors: embeddingResult,
    ids: chunks.map(() => crypto.randomUUID()),
    metadata: chunks.map((chunk: any) => ({
      title: `${title}`,
      tags: tags,
      markdown: markdown,
      isFolder,
      tenantId,
      applicationId,
      chunk_text: chunk.text,
      search_keywords: chunk?.metadata.excerptKeywords.split(":")[1].split(","),
      searchable_text: chunk?.metadata.sectionSummary,
    })),
  });

  if (!results || results.length === 0) {
    return {
      result: undefined,
      usage: undefined,
      error: "Failed to store context",
    };
  }

  return {
    result: {
      stored: true,
      count: embeddingResult.length,
      vector_ids: results,
    },
    usage: usage || undefined,
    error: undefined,
  };
};

export const searchContext = async ({
  query,
  tags,
  tenantId,
  applicationId,
}: {
  query: string;
  tags: string[];
  tenantId: string;
  applicationId: string;
}) => {
  const store = getDefaultPgVector();
  const { embedding, usage, error } = await generateEmbedding(query);
  if (error) {
    return {
      result: undefined,
      usage: undefined,
      error: error,
    };
  }

  let filterConditions: any = {
    tenantId: tenantId,
    applicationId: applicationId,
  };

  if (tags && tags.length > 0) {
    filterConditions.tags = { $in: tags };
  }
  let results = await store?.query({
    indexName: CONTENTS_ENTRIES_TABLE_NAME,
    queryVector: embedding || [],
    topK: 2,
    filter: filterConditions,
  });
  if (error) {
    return {
      result: undefined,
      usage: undefined,
      error: error,
    };
  }
  return {
    result: results,
    usage: usage || undefined,
    error: undefined,
  };
};

export const deleteContext = async ({
  id,
  tenantId,
  applicationId,
}: {
  id: string;
  tenantId: string;
  applicationId: string;
}) => {
  const store = getDefaultPgVector();
  await store?.deleteVector({
    indexName: CONTENTS_ENTRIES_TABLE_NAME,
    id: id,
  });
  return {
    result: undefined,
    usage: undefined,
    error: undefined,
  };
};

export const updateContext = async ({
  tenantId,
  id,
  markdown,
  isFolder,
  title,
  tags,
  applicationId,
}: {
  tenantId: string;
  id: string;
  markdown: string;
  isFolder: boolean;
  title: string;
  tags: string[];
  applicationId: string;
}) => {
  const store = getDefaultPgVector();
  const { embedding, usage, error } = await generateEmbedding(markdown);
  if (error) {
    return {
      result: undefined,
      usage: undefined,
      error: error,
    };
  }
  await deleteContext({ id, tenantId, applicationId });
  await store?.upsert({
    indexName: CONTENTS_ENTRIES_TABLE_NAME,
    vectors: [embedding || []],
    metadata: [
      {
        title: title || "Untitled",
        tags: tags || [],
        markdown: markdown,
        isFolder,
        tenantId,
        applicationId,
      },
    ],
  });
  return {
    result: undefined,
    usage: usage || undefined,
    error: undefined,
  };
};
