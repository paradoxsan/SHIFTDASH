import { z } from "zod";

// Body for PATCH /api/bots/[ref]/tables/[table] — update one row by primary key.
// `pk` = primary-key column values; `set` = changed cell values. Both are
// open-valued records (cell values are arbitrary); only the SHAPE is validated
// here — column/PK correctness is enforced against live introspection in the route.
export const tablePatchSchema = z.object({
  pk: z.record(z.string(), z.unknown()).optional().default({}),
  set: z.record(z.string(), z.unknown()).optional().default({}),
});

export type TablePatchBody = z.infer<typeof tablePatchSchema>;
