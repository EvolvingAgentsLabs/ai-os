export const UI_BASE = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/").replace(
  /\/$/,
  "",
);

export function deepLinkPath(
  base: string,
  view: string,
  sessionId: string | null,
  contextScope?: string | null,
): string {
  const b = base.replace(/\/$/, "");
  if (view === "contexts" && contextScope) return `${b}/contexts?scope=${encodeURIComponent(contextScope)}`;
  if (view !== "chats") return `${b}/${encodeURIComponent(view)}`;
  return `${b}/${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}`;
}

export function parseDeepLink(
  base: string,
  pathname: string,
  search: string,
): { view: string | null; session: string | null } {
  const params = new URLSearchParams(search);
  const b = base.replace(/\/$/, "");
  const rel = pathname.startsWith(b) ? pathname.slice(b.length) : pathname;
  const seg = rel.replace(/^\/+/, "").split("/")[0] ?? "";
  let fromPath: string | null = null;
  if (seg) {
    try {
      fromPath = decodeURIComponent(seg);
    } catch {
      fromPath = null;
    }
  }
  const requestedView = params.get("view") ?? fromPath;
  const view = requestedView === "connectors" ? "keychain" : requestedView;
  return { view, session: params.get("session") };
}

export function sessionLink(origin: string, base: string, sessionId: string): string {
  return `${origin}${deepLinkPath(base, "chats", sessionId)}`;
}
