import { z } from "zod";

// Boundary validation for the Phase 7 provisioning APIs.
export const startJobSchema = z.object({
  tenantName: z.string().min(1).max(120),
  templateId: z.string().min(1),
  mode: z.enum(["live", "simulate"]).optional(),
});
export type StartJobBody = z.infer<typeof startJobSchema>;

export const checkpointDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional(),
});
export type CheckpointDecisionBody = z.infer<typeof checkpointDecisionSchema>;
