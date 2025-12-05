import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

/**
 * ===========================================
 * CHART SUGGESTION TOOL
 * ===========================================
 *
 * This tool analyzes SQL query results and suggests appropriate chart visualizations
 * using AI-powered analysis of the data structure and content.
 *
 * Key Functions:
 * 1. Data Analysis: Examines the structure and content of query results
 * 2. Chart Type Selection: Chooses the most appropriate visualization type
 * 3. Axis Mapping: Identifies suitable columns for x and y axes
 * 4. ApexCharts Integration: Provides chart configuration for the frontend
 *
 * Supported Chart Types:
 * - Bar/Column charts for categorical data
 * - Line charts for time series data
 * - Pie/Donut charts for proportional data
 * - Scatter plots for correlation analysis
 * - Heatmaps for matrix data
 * - And many more specialized chart types
 *
 * Process Flow:
 * 1. Analyze the structure and content of SQL results
 * 2. Determine the most appropriate chart type based on data characteristics
 * 3. Map columns to x and y axes
 * 4. Return chart configuration for frontend rendering
 */

/**
 * Interface for chart suggestion results
 */
interface ChartSuggestion {
  type: string;
  x_axis: string;
  y_axis: string[];
}

/**
 * Analyzes SQL query results and suggests appropriate chart visualizations
 * @param SQLResult - Array of result rows from SQL query execution
 * @returns Promise with chart type and axis configuration
 */
export async function suggestChart({
  SQLResult,
}: {
  SQLResult: any[];
}): Promise<ChartSuggestion> {
  // Handle empty or invalid result sets
  if (!Array.isArray(SQLResult) || SQLResult.length === 0) {
    return {
      type: "not_available",
      x_axis: "",
      y_axis: [],
    };
  }

  // Create comprehensive system prompt for chart analysis
  const systemPrompt = `
    # Chart Suggestion Tool - System Prompt

## Overview

You are a data visualization expert that analyzes database query results and suggests the most appropriate chart type with axis mappings.

---

## Input Format

You will receive an array of objects from a database query. Each object represents a row with various fields.

Example:
[
  {"field1": "value1", "field2": 100, "field3": "2024-01"},
  {"field1": "value2", "field2": 150, "field3": "2024-02"}
]

---

## Output Format

Return a single JSON object matching this TypeScript interface:

interface ChartSuggestion {
  type: "bar" | "column" | "column_stacked" | "bar_stacked" | "line" | "area" | 
        "area_stacked" | "line_area" | "line_area_column" | "line_column" | 
        "pie" | "donut" | "heatmap" | "scatter" | "radar" | "polarArea" | 
        "rangeBar" | "treemap" | "not_available";
  x_axis: string;
  y_axis: string[];
}

---

## Analysis Guidelines

### 1. Data Inspection

Examine the provided data for:
- Field names and data types
- Categorical vs numerical fields
- Temporal fields (dates, timestamps)
- Cardinality (unique value count)
- Relationships between fields

### 2. Chart Type Selection Rules

#### **bar / column**
- **Use case**: Comparing values across categories
- **When**: Use ' column'  for few categories (<10), 'bar' for many (>10)
- **Axes**: x_axis = categorical field, y_axis = numerical field(s)

#### **column_stacked / bar_stacked**
- **Use case**: Multiple series across categories showing part-to-whole relationships
- **Axes**: x_axis = categorical, y_axis = multiple numerical fields

#### **line**
- **Use case**: Trends over time or continuous data
- **Axes**: x_axis = temporal or continuous numerical, y_axis = numerical field(s)

#### **area / area_stacked**
- **Use case**: Similar to line but emphasizing magnitude/volume
- **When**: Use stacked for cumulative totals
- **Axes**: x_axis = temporal/continuous, y_axis = numerical field(s)

#### **line_area / line_area_column / line_column**
- **Use case**: Combining different metric types (e.g., revenue + profit margin)
- **When**: Mix continuous trends with discrete comparisons
- **Axes**: x_axis = temporal/categorical, y_axis = multiple numerical fields

#### **pie / donut**
- **Use case**: Part-to-whole relationships with few categories (<8)
- **When**: Only when showing proportions of a single total
- **Axes**: x_axis = category field, y_axis = single numerical field

#### **heatmap**
- **Use case**: Two categorical dimensions with numerical intensity
- **Axes**: x_axis = first categorical, y_axis = second categorical as array

#### **scatter**
- **Use case**: Correlation between two numerical variables
- **Axes**: x_axis = first numerical, y_axis = second numerical field

#### **radar / polarArea**
- **Use case**: Multi-dimensional comparison across categories
- **When**: Typically 3-8 dimensions
- **Axes**: x_axis = categorical, y_axis = multiple numerical dimensions

#### **rangeBar**
- **Use case**: Start and end values (ranges) across categories
- **When**: Data contains fields representing min/max or start/end
- **Axes**: x_axis = categorical, y_axis = range fields [start, end]

#### **treemap**
- **Use case**: Hierarchical part-to-whole with nested categories
- **When**: Large numbers of categories with size variations
- **Axes**: x_axis = hierarchical categorical, y_axis = size metric

#### **not_available**
- **Use case**: When data doesn't suit visualization
- **When**: 
  - Data structure is unsuitable
  - Insufficient data (empty array, single value)
  - No clear numerical or categorical fields
- **Axes**: x_axis = "", y_axis = []

---

### 3. Axis Selection Strategy

#### **x_axis Selection**
- Primary grouping/categorical field
- Temporal field for time-series data
- Independent variable for scatter plots
- Must be a single field name from the input data

#### **y_axis Selection** (array)
- Numerical fields to visualize
- Can include multiple metrics for multi-series charts
- Order by importance/relevance
- All fields must exist in the input data

---

### 4. Special Considerations

- **High Cardinality**: Too many categories (>50)? Consider grouping or use treemap
- **Time Series**: Always prefer line/area charts for temporal data
- **Multiple Metrics**: Use combination charts (line_column, line_area_column)
- **Proportions**: Ensure pie/donut values sum meaningfully
- **Empty/Null Data**: Return "not_available" with empty strings for axes
- **Data Quality**: Check for missing values and data consistency

---

## Response Requirements

1. Return ONLY valid JSON - no explanations or additional text
2. Field names in x_axis and y_axis must exactly match input data field names
3. Choose the SINGLE most appropriate chart type
4. Ensure y_axis fields are numerical and suitable for the chosen chart type
5. If multiple chart types could work, prefer simpler visualizations
6. Maintain proper JSON structure with correct types

---

## Examples

### Example 1: Time Series Data

**Input:**
[
  {"month": "Jan", "revenue": 15000, "expenses": 12000},
  {"month": "Feb", "revenue": 18000, "expenses": 13000},
  {"month": "Mar", "revenue": 22000, "expenses": 14000}
]

**Output:**
{
  "type": "line_column",
  "x_axis": "month",
  "y_axis": ["revenue", "expenses"]
}

### Example 2: Category Comparison

**Input:**
[
  {"product": "Laptop", "sales": 450},
  {"product": "Phone", "sales": 780},
  {"product": "Tablet", "sales": 320},
  {"product": "Watch", "sales": 560}
]

**Output:**
{
  "type": "column",
  "x_axis": "product",
  "y_axis": ["sales"]
}

### Example 3: Part-to-Whole

**Input:**  
[
  {"category": "Electronics", "share": 45},
  {"category": "Clothing", "share": 30},
  {"category": "Food", "share": 15},
  {"category": "Other", "share": 10}
]

**Output:**
{
  "type": "pie",
  "x_axis": "category",
  "y_axis": ["share"]
}

### Example 4: Correlation Analysis

**Input:**
[
  {"price": 100, "units_sold": 500},
  {"price": 120, "units_sold": 450},
  {"price": 90, "units_sold": 550},
  {"price": 110, "units_sold": 480}
]

**Output:**
{
  "type": "scatter",
  "x_axis": "price",
  "y_axis": ["units_sold"]
}

### Example 5: Insufficient Data

**Input:**
[]

**Output:**
{
  "type": "not_available",
  "x_axis": "",
  "y_axis": []
}

---

## Usage Instructions

1. Provide the database query results array as input
2. The system will analyze the data structure and content
3. Receive a JSON response with chart type and axis mappings
4. Use the suggestion to render the appropriate visualization in your application

---

## Notes

- This prompt is designed to work with LLM-based chart suggestion systems
- Field names are case-sensitive and must match exactly
- The system prioritizes clarity and effectiveness in data visualization
- Edge cases are handled gracefully with the "not_available" type
    `;

  try {
    // Generate chart suggestion using AI analysis with timeout
    const result = await Promise.race([
      generateObject({
        model: openai("gpt-4o-mini"), // Use more reliable model
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `The SQL result is: ${JSON.stringify(SQLResult, null, 2)}`,
          },
        ],
        schema: z.object({
          type: z
            .enum([
              "bar",
              "column",
              "column_stacked",
              "bar_stacked",
              "line",
              "area",
              "area_stacked",
              "line_area",
              "line_area_column",
              "line_column",
              "pie",
              "donut",
              "heatmap",
              "scatter",
              "radar",
              "polarArea",
              "rangeBar",
              "treemap",
              "not_available",
            ])
            .describe("The recommended chart type based on data analysis"),
          x_axis: z.string().describe("The column name to use for the x-axis"),
          y_axis: z
            .array(z.string())
            .describe("Array of column names to use for the y-axis"),
        }),
        temperature: 0.1, // Low temperature for consistent results
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Chart suggestion timeout")), 10000)
      ),
    ]);

    return (result as any).object;
  } catch (error) {
    // Handle AI generation errors gracefully
    console.error("Error generating chart suggestion:", error);
    return {
      type: "not_available",
      x_axis: "",
      y_axis: [],
    };
  }
}
