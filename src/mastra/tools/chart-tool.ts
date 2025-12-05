import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Executes a function with a timeout
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export const chartGenerationTool = createTool({
  id: "chart-suggestion",
  inputSchema: z.object({
    SQLResult: z.array(z.any()),
    chartTitle: z.string().optional(),
    chartDescription: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    type: z.string(),
    x_axis: z.string(),
    y_axis: z.array(z.string()),
    title: z.string(),
    description: z.string(),
    data: z.array(
      z.object({
        value: z.number(),
        time: z.string(),
        name: z.string(),
        frequency: z.string(),
      })
    ),
  }),
  description:
    "Generates a bar chart from SQL results, mapping 'value' on y-axis and 'time' on x-axis",
  execute: async ({ context: { SQLResult, chartTitle, chartDescription } }) => {
    if (!SQLResult || SQLResult.length === 0) {
      return {
        success: false,
        type: "bar",
        x_axis: "time",
        y_axis: ["value"],
        title: chartTitle || "Empty Chart",
        description: chartDescription || "No data available",
        data: [],
      };
    }

    // Map SQL result to chart data
    const chartData = SQLResult.map((row: any) => ({
      value: Number(row.kpi_value ?? row.value ?? 0),
      time: row.executedAt || row.time || new Date().toISOString(),
      name: row.kpi_name || row.name || "record",
      frequency: row.frequency || "weekly",
    }));

    // Fallback title/description based on KPI name and frequency
    let title = chartTitle || "SQL Chart";
    let description = chartDescription || "Chart generated from SQL results";

    const firstRow = SQLResult[0];
    if (firstRow && firstRow.kpi_name) {
      const kpiName = firstRow.kpi_name;
      const frequency = firstRow.frequency || "weekly";
    const executedDates = SQLResult
  .map((row: any) => row.executedAt || row.time)
  .filter(Boolean)
  .map((dateStr: string) => new Date(dateStr).getTime()); // convert to number

if (executedDates.length > 0) {
  const minDate = new Date(Math.min(...executedDates));
  const maxDate = new Date(Math.max(...executedDates));

  title = `${frequency[0].toUpperCase() + frequency.slice(1)} ${kpiName} Trends`;
  description = `This ${frequency} chart displays the values of "${kpiName}" from ${minDate.toDateString()} to ${maxDate.toDateString()}, highlighting trends over time.`;
}
    }
    // Use AI to enhance title/description (optional)
    try {
      const { object } = await executeWithTimeout(
        () =>
          generateObject({
            model: openai("gpt-4o-mini"),
            prompt: `Generate a descriptive title and description for a chart based on the following data sample: ${JSON.stringify(
              SQLResult.slice(0, 5)
            )}\nReturn JSON in this format: { "title": "<title>", "description": "<description>" }`,
            schema: z.object({
              title: z.string(),
              description: z.string(),
            }),
            temperature: 0.1,
          }),
        30000
      );

      title = object.title || title;
      description = object.description || description;
    } catch (err) {
      console.warn("AI chart title/description generation failed:", err);
    }

    return {
      success: true,
      type: "bar",
      x_axis: "time",
      y_axis: ["value"],
      title,
      description,
      data: chartData,
    };
  }
});
