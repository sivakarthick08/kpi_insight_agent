import {
  createContext,
  deleteContext,
  getContext,
  getContexts,
} from "./context/route";
import {
  generateSemanticLayer,
  getCatalog,
  getDatabaseSchema,
  tablesBySchema,
  healthCheck,
} from "./schema";
import { tablesDetails } from "./schema";
import { createTenantSchema } from "./tenant";
import {
  getArtifactByThreadId,
  getArtifactById,
  getArtifacts,
} from "./artifact";
import {
  getFeedbacks,
  getFeedback,
  deleteFeedback,
  createFeedback,
  updateFeedback,
  runImproveAgentFromRL,
} from "./feedback";

import {
  getMigrationStatus,
  getAppliedMigrations,
  getPendingMigrations,
  migrateUp,
  migrateDown,
  applyMigration,
  rollbackMigration,
  getMigration,
} from "./migration";

import {
  getKnowledgeBaseByTenant,
  getVersionHistory,
  getKnowledgeBaseEntry,
  updateKnowledgeBase,
} from "./knowledgebase";

import {
  getKpis,
  getKpi,
  createKpi,
  updateKpi,
  deleteKpi,
  searchKpis,
  getKpiStats,
  getKpiCategories,
  getKpisByCategory,
} from "./kpi";

export const schemaApiRoutes = [
  getDatabaseSchema,
  tablesBySchema,
  tablesDetails,
  generateSemanticLayer,
  getCatalog,
  healthCheck,
];

export const contextApiRoutes = [
  getContexts,
  getContext,
  deleteContext,
  createContext,
];

export const artifactApiRoutes = [
  getArtifacts,
  getArtifactByThreadId,
  getArtifactById,
];

export const tenantApiRoutes = [createTenantSchema];

export const feedbackApiRoutes = [
  getFeedbacks,
  getFeedback,
  deleteFeedback,
  createFeedback,
  updateFeedback,
  runImproveAgentFromRL,
];

export const migrationApiRoutes = [
  getMigrationStatus,
  getAppliedMigrations,
  getPendingMigrations,
  migrateUp,
  migrateDown,
  applyMigration,
  rollbackMigration,
  getMigration,
];

export const knowledgebaseApiRoutes = [
  getKnowledgeBaseByTenant,
  getVersionHistory,
  getKnowledgeBaseEntry,
  updateKnowledgeBase,
];

export const kpiApiRoutes = [
  getKpis,
  getKpi,
  createKpi,
  updateKpi,
  deleteKpi,
  searchKpis,
  getKpiStats,
  getKpiCategories,
  getKpisByCategory,
];

export const allApiRoutes = [
  ...schemaApiRoutes,
  ...tenantApiRoutes,
  ...contextApiRoutes,
  ...artifactApiRoutes,
  ...feedbackApiRoutes,
  ...migrationApiRoutes,
  ...knowledgebaseApiRoutes,
  ...kpiApiRoutes,
];
