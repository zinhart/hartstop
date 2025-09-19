// src/auth/scopes.ts (optional granular API scopes)
export function requireScope(scope: string) {
  return (req: any, _res: any, next: any) => {
    const scopes = req.auth?.scopes ?? [];
    if (scopes.includes(scope) || (req.auth?.roles ?? []).includes("Admin")) return next();
    next(Object.assign(new Error("insufficient_scope"), { status: 403 }));
  };
}
