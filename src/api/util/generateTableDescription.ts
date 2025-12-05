import { generateObject } from "ai";
import z from "zod";
import { openai } from "@ai-sdk/openai";

export const generateTableDescription = async (
  schemaPayloads: any,
  context: string,
  categories: string[],
  existingEntries: any
): Promise<{
  object: any;
  usage: any;
}> => {
  try {
    const systemPrompt = `You are a helpful assistant that generates clear, concise descriptions for table, fields, relationships, and metrics in a database. Always generate the descriptions in English, regardless of the schema language.
  The descriptions should be clear, concise, and based on the schema metadata, regardless of the original language of the schema.
  
  Generate description for provided schema payloads. Nothing extra.

  # INPUT SCHEMA
  {
    "table_name": <table_name>,
    "fields": [
        { "name": <field_name>, "type": <field_type> }
    ],
    "relationships": [
        { "from_table": <from_table>, "to_table": <to_table>, "from_column": <from_column>, "to_column": <to_column> }
    ],
    "metrics": [
        { "name": <metric_name>, "definition": <metric_definition>, "description": <metric_description> }
    ]
  }
  ${
    context
      ? `
    # CONTEXT
    Use the context to enhance the description.
    context will have brief description of the table and fields. You can use it to enhance the description.
    ${context}`
      : ""
  }

  # EXISTING ENTRIES
  Use the existing entries to maintain the description consistency.
  existingEntries will have the existing entries of the table. You can use it to generate the new description.
  ${existingEntries}
  
  # CATEGORIES
  Use the categories to generate the description.
  categories will have the categories of the table. You can use it to generate the description.
  ${categories.join(", ")}

  # CATEGORIES

  # OUTPUT SCHEMA (Only one table is allowed at once)
    {
        "schema_name": <schema_name>,
        "table_name": <table_name>,
        "description": <description>,
        "fields": [
            { "name": <field_name>, "type": <field_type>, "description": <description> }
        ],
        "relationships": [
            { "from_table": <from_table>, "to_table": <to_table>, "from_column": <from_column>, "to_column": <to_column>, "description": <description> }
        ],
        "metrics": [
            { "name": <metric_name>, "definition": <metric_definition>, "description": <metric_description> }
        ]
    }
  
  Do not add any other text or comments.
  Do not translate the schema names or labels; just describe their meaning in English.
  The descriptions should be in the following format:
  - Table: <table_name> - <description>
  - Field: <field_name> - <description>
  - Relationship: <from_table> - <to_table> - <description>
  - Metric: <metric_name> - <description>
  `;

    const userPrompt = `Generate **English** descriptions for the following schemas: ${JSON.stringify(schemaPayloads)}. 
The descriptions should be clear, concise, and based on the schema metadata, regardless of the original language of the schema.
Do not translate the schema names or labels; just describe their meaning in English.`;

    const result = await generateObject({
      model: openai("gpt-4.1-mini"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: z.object({
        schema_name: z.string(),
        table_name: z.string(),
        description: z.string(),
        fields: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            description: z.string(),
          })
        ),
        relationships: z.array(
          z.object({
            from_table: z.string(),
            to_table: z.string(),
            from_column: z.string(),
            to_column: z.string(),
          })
        ),
        metrics: z.array(
          z.object({
            name: z.string(),
            definition: z.string(),
            description: z.string(),
          })
        ),
      }),
      temperature: 0.1,
    });

    return {
      object: result.object,
      usage: result.usage,
    };
  } catch (error) {
    console.error("Error generating semantic layer descriptions:", error);
    throw error;
  }
};
