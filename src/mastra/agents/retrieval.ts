import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import retrievalInstructions from "../../prompts/retrieval-instructions";
import { semanticSearchTool } from "../tools/semantic-search-tool";

export default new Agent({
  name: "Retrieval",
  id: "retrieval-agent",
  description:
    "The Retrieval agent retrieves information from the database using semantic layer context.",
  instructions: retrievalInstructions,
  model: openai("gpt-4.1-mini"),
  tools: {
    semanticSearchTool,
  },

});
