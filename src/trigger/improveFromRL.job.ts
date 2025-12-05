// import { logger, schedules } from "@trigger.dev/sdk";
// import {
//   improveAllAgentsFromRL,
// } from "../api/util/improveFromRL";

// interface ImproveFromRLPayload {
//   tenantId: string;
//   applicationId: string;
//   daysBack: number;
// }
// export const improveFromRLJob = schedules.task({
//   id: "improve-from-rl-daily",
//   // Run every night at 2 PM Asia/Kolkata time (UTC+5:30)
//   // This translates to 8:30 AM UTC (2 PM - 5:30 hours = 8:30 AM UTC)
//   cron: "",
//   // Set maxDuration to prevent tasks from running indefinitely
//   maxDuration: 1800, // Stop executing after 30 minutes
//   run: async (payload, { ctx }) => {
//     logger.log("Starting daily improveFromRL job", {
//       timestamp: payload.timestamp,
//       timezone: payload.timezone,
//     });

//     try {
//       const result = await improveAllAgentsFromRL(7);

//       if (!result.success) {
//         throw new Error(`Failed to improve agent: ${(result as any).error || "Unknown error"}`);
//       }

//       logger.log("Daily improveFromRL completed successfully", { result });
//       return result;
//     } catch (error) {
//       logger.error("Daily improveFromRL job failed", { error });
//       throw error; // Re-throw to mark the job as failed
//     }
//   },
// });
