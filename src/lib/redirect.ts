export function safeRedirectPath(candidate: unknown): string {
  if (typeof candidate !== "string") return "/";
  const trimmed = candidate.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/";
  }
  return trimmed;
}
