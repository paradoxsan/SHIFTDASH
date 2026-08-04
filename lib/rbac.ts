// ── Role-based access control (BotOps Phase 3) ────────────────────────────────
export type Role = "owner" | "operator" | "viewer";

// Privilege order: owner ⊃ operator ⊃ viewer.
const RANK: Record<Role, number> = { viewer: 0, operator: 1, owner: 2 };

/** Does `have` satisfy the `min` required role? */
export function permits(have: Role | undefined | null, min: Role): boolean {
  if (!have) return false;
  return RANK[have] >= RANK[min];
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throw ForbiddenError unless `have` meets `min`. */
export function requireRole(have: Role | undefined | null, min: Role): void {
  if (!permits(have, min)) throw new ForbiddenError(`requires role: ${min}`);
}
