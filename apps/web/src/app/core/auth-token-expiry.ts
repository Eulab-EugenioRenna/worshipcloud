const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 30_000;

export function shouldRefreshAccessToken(
  expiresAt: string,
  now = Date.now(),
): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  return (
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= now + ACCESS_TOKEN_REFRESH_LEEWAY_MS
  );
}
