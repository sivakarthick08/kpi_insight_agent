import { openai } from "@ai-sdk/openai";
import { ChunkType } from "@mastra/core";
import { MDocument } from "@mastra/rag";
import { embed, embedMany } from "ai";

const embeddingModel = "text-embedding-3-small";

export interface EmbeddingResultWithUsage {
  embedding: number[] | null;
  usage: number | null;
  error: string | null;
}
export interface EmbeddingChunksResultWithUsage {
  embeddings: number[][] | null;
  usage: number | null;
  error: string | null;
}

export async function generateChunksAndEmbed(text: string): Promise<{
  error: string | null;
  embedding: number[] | null;
  usage: number | null;
}> {
  try {
    const embeddingResult = await generateEmbedding(text);
    return {
      error: null,
      embedding: embeddingResult.embedding,
      usage: embeddingResult.usage,
    };
  } catch (error) {
    console.error("Error in generateChunksAndEmbed:", error);
    return {
      embedding: null,
      error: error instanceof Error ? error.message : String(error),
      usage: null,
    };
  }
}

async function generateEmbeddingFromChunks(
  chunks: any[]
): Promise<EmbeddingChunksResultWithUsage> {
  try {
    // Add timeout and retry logic for embedding generation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const { embeddings, usage } = await embedMany({
      model: openai.textEmbeddingModel('text-embedding-3-small'),
      values: chunks.map((chunk) => chunk.text),
      abortSignal: controller.signal,
    });

    clearTimeout(timeoutId);

    return {
      embeddings: embeddings,
      usage: usage.tokens,
      error: null,
    };
  } catch (error) {
    console.error("Error in generateEmbeddingFromChunks:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          embeddings: null,
          usage: null,
          error: "Embedding generation timed out",
        };
      }
      if (
        error.message.includes("EPIPE") ||
        error.message.includes("ECONNRESET")
      ) {
        return {
          embeddings: null,
          usage: null,
          error: "Connection error during embedding generation",
        };
      }
    }

    return {
      embeddings: null,
      usage: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function generateEmbedding(
  text?: string | string[]
): Promise<EmbeddingResultWithUsage> {
  try {
    const { embedding, usage } = await embed({
      model: openai.textEmbeddingModel(embeddingModel),
      value: text,
    });

    return {
      embedding,
      usage: usage.tokens,
      error: null,
    };
  } catch (error) {
    console.error("Error in generateEmbedding:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          embedding: null,
          usage: null,
          error: "Embedding generation timed out",
        };
      }
      if (
        error.message.includes("EPIPE") ||
        error.message.includes("ECONNRESET")
      ) {
        return {
          embedding: null,
          usage: null,
          error: "Connection error during embedding generation",
        };
      }
    }

    return {
      embedding: null,
      usage: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function generateChunksAndEmbeddingFromDocument(context: string) {
  try {
    const doc = MDocument.fromMarkdown(context);
    const chunks = await doc.chunk({
      strategy: "markdown",
      maxSize: 1024,
      extract: {
        keywords: true,
        summary: true,
      },
    });

    if (!chunks || chunks.length === 0) {
      return {
        embeddings: null,
        usage: null,
        error: "No chunks generated",
      };
    }

    const { embeddings, usage } = await generateEmbeddingFromChunks(chunks);
    return {
      chunks: chunks as unknown as ChunkType[],
      embeddings,
      usage: usage,
      error: null,
    };
  } catch (error) {
    console.error("Error in generateChunksAndEmbeddingFromDocument:", error);
    return {
      embeddings: null,
      usage: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
