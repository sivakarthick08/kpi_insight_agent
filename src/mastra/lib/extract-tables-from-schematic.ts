export const extractTablesFromSchematic = async (
  schemaContext: any,
): Promise<
  {
    name: string;
    fields: { field_name: string; field_type: string; field_description: string; sample_data: any[] }[];
    description: string;
    schema_name: string;
    catalog_name?: string; // <-- optional
  }[]
> => {
  let tablesMap: Set<{
    name: string;
    fields: { field_name: string; field_type: string; field_description: string; sample_data: any[] }[];
    description: string;
    schema_name: string;
    catalog_name?: string;
  }> = new Set();

  for (const result of schemaContext) {
    const row = result.content;
    tablesMap.add({
      name: row.table_name,
      fields: row.fields,
      schema_name: row.schema_name,
      description: row.table_description,
      ...(row.catalog_name ? { catalog_name: row.catalog_name } : {}),
    });
  }

  return Array.from(tablesMap);
};
