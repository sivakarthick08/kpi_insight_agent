export default `
# Tribal Knowledge

Unwritten rules, preferences, slang, and habits used in the business

Things to Capture:
  •	How different teams interpret terms
  •	Common shortcuts or jargon
  •	Implicit rules not in systems but always followed
  •	Default assumptions in analysis

Examples:
  •	“When Sales says margin, they actually mean commission.”
  •	“Finance excludes proforma invoices unless specifically asked.”
  •	“By customer, leadership means the billto_label field.”
  •	“If no period is mentioned, assume month-to-date (MTD).”

  ⸻

# Business Context

Priorities, goals, and organizational rules that shape analysis

Things to Capture:
  •	Core domains of the business (sales, inventory, finance, logistics)
  •	Key KPIs and how they are measured locally
  •	Active goals or campaigns
  •	Compliance or governance rules that always apply
        
Examples:
  •	“For NVPL, only status=true rows are valid transactions.”
  •	“Inventory aging is always measured by batch number first.”
  •	“Sales performance is tracked against gross sales, not net.”
  •	“Compliance requires excluding PII=true fields in reports.”

⸻

# Technical Understanding of Where Things Are

How business terms map to the actual data and systems

Things to Capture:
  •	Where to look for specific data (tables, views, or systems)
  •	Common relationships between entities
  •	Filters that are always mandatory
  •	Which system/source provides which type of information

Examples:
  •	“Customer details come from invoice_with_profiles.”
  •	“Product quantities sold are always in invoiceitem.”
  •	“Stock availability is tracked in finishedproductnvplavailablellm.”
  •	“Exclude proforma by checking invoice_module_name IS NULL.”
  •	“Every query must filter by tenant_id and status=true.”

⸻

⚡ This Markdown template can sit in Mastra's working memory as a structured outline.
  •	Tribal Knowledge = how people talk.
  •	Business Context = how the org operates.
  •	Technical Understanding = how data maps.
`;
