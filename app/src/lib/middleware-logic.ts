export const PUBLIC_PATHS = ["/sign-in", "/access-denied", "/auth-error"];

export function knownGroups(): string[] {
  return [
    process.env.ROLE_GROUP_OWNER ?? "cup-owner",
    process.env.ROLE_GROUP_COLLABORATOR ?? "cup-collaborator",
    process.env.ROLE_GROUP_VIEWER ?? "cup-viewer",
  ];
}

export function resolveMiddlewareAction(
  pathname: string,
  authenticated: boolean,
  groups: string[]
): "allow" | "/sign-in" | "/access-denied" {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return "allow";
  if (!authenticated) return "/sign-in";
  if (!groups.some((g) => knownGroups().includes(g))) return "/access-denied";
  return "allow";
}
