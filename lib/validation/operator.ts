import { z } from "zod";

// Boundary validation for the Phase 5 operator actions. PKs (inbox.id/orders.id)
// are positive bigserial — accept an integer number or a canonical digit-string
// only, so "1e1"/"0x10"/"12.9"/whitespace can never reach the SQL binder.
const idValue = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]);

export const requeueSchema = z.object({ id: idValue });
export type RequeueBody = z.infer<typeof requeueSchema>;

export const chaseSchema = z.object({
  orderId: idValue,
  message: z.string().max(2000).optional(),
});
export type ChaseBody = z.infer<typeof chaseSchema>;
