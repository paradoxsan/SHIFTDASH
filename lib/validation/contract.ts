// Contract-form validation. Everything the client card can save passes through
// here first: the fee fields feed the MRR number and the Morning link decides
// which invoices get attributed to whom, so a typo is a wrong business figure,
// not just a bad row.
import { z } from "zod";

/** Money: non-negative, at most two decimals, and bounded well above any real
 *  retainer so a stray keystroke can't create a six-figure MRR. */
const fee = z
  .number()
  .nonnegative("סכום לא יכול להיות שלילי")
  .max(1_000_000, "סכום גבוה מדי")
  .refine((n) => Number.isFinite(n) && Math.round(n * 100) === n * 100, "עד שתי ספרות אחרי הנקודה");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s));

export const contractPatchSchema = z
  .object({
    contactName: optionalText(120).nullable().optional(),
    contactPhone: optionalText(40).nullable().optional(),
    contactEmail: z
      .union([z.literal(""), z.string().trim().email("אימייל לא תקין").max(160)])
      .transform((s) => (s === "" ? null : s))
      .nullable()
      .optional(),
    startedOn: z
      .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך בפורמט YYYY-MM-DD")])
      .transform((s) => (s === "" ? null : s))
      .nullable()
      .optional(),
    setupFee: fee.nullable().optional(),
    monthlyFee: fee.nullable().optional(),
    currency: z.enum(["ILS", "USD", "EUR"]).optional(),
    billingStatus: z.enum(["active", "paused", "churned"]).optional(),
    morningClientId: optionalText(64).nullable().optional(),
    notes: optionalText(2000).nullable().optional(),
  })
  // An empty body would silently "succeed" while saving nothing — reject it so
  // the UI can't report a save that never happened.
  .refine((o) => Object.keys(o).length > 0, "אין שדות לעדכון");

export type ContractPatchInput = z.infer<typeof contractPatchSchema>;
