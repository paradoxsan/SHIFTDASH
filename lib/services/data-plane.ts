// ── Data-plane service seam (BotOps Phase 1) ──────────────────────────────────
// The single chokepoint for all client-database access. Today it is a thin
// pass-through to the Supabase Management SQL path; later phases land here
// WITHOUT touching call sites:
//   • Phase 3 wraps mutations with RBAC + audit (lib/services/audited.ts).
//   • Phase 4 swaps in least-privilege per-tenant credentials + an allowlisted,
//     PK-scoped query builder, and narrows the management PAT.
// Route handlers and lib code should import data access from HERE, not from
// lib/supabase-management directly.
export {
  runSql,
  introspect,
  hasTable,
  hasColumn,
  listProjects,
  getProject,
} from "../supabase-management";
export type { ProjectSchema } from "../supabase-management";
