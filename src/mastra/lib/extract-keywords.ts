import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import z from "zod";

export default async function extractKeywords(
  input: string
): Promise<string[]> {
  const result = await generateObject({
    model: openai("gpt-4o-mini"),
    prompt: `Extract keywords from the following text: 
    ${input}
    Do not include stopwords.
    Extract relevant keywords from the text.
    Extract possible aliases for the keywords from the text.
    
    Examples:
    Input: "Show the total quantity sold for Nano Urea last quarter"
    Output: ["sales", "invoice", "inventory", "quantity", "last quarter"]
    `,
    schema: z.object({
      keywords: z.array(z.string()),
    }),
  });

  return result.object.keywords;
}
