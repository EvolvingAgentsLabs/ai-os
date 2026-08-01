import { sendJson } from "../http.ts";
import { isObj } from "./shared.ts";
import { type ApiCtx, type Route } from "./route.ts";

async function listProjects(ctx: ApiCtx): Promise<void> {
  const principalId = (ctx.url.searchParams.get("principalId") ?? "").trim();
  if (!principalId) return sendJson(ctx.res, 400, { error: "bad_request", message: "principalId required" });
  return sendJson(ctx.res, 200, { projects: await ctx.app.listProjects(principalId) });
}

async function createProject(ctx: ApiCtx): Promise<void> {
  const body = isObj(ctx.body) ? ctx.body : {};
  const principalId = typeof body.principalId === "string" ? body.principalId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!principalId || !name)
    return sendJson(ctx.res, 400, { error: "bad_request", message: "principalId and name required" });
  const project = await ctx.app.createProject(principalId, name);
  return project ? sendJson(ctx.res, 201, { project }) : sendJson(ctx.res, 403, { error: "forbidden" });
}

function mutationResponse(ctx: ApiCtx, result: Awaited<ReturnType<ApiCtx["app"]["addProjectMember"]>>): void {
  if (result.status === "ok") return sendJson(ctx.res, 200, { project: result.project });
  if (result.status === "not_found") return sendJson(ctx.res, 404, { error: "not_found" });
  if (result.status === "forbidden") return sendJson(ctx.res, 403, { error: "forbidden" });
  if (result.status === "invalid_name")
    return sendJson(ctx.res, 400, { error: "invalid_name", message: "project name required" });
  return sendJson(ctx.res, 400, {
    error: "invalid_member",
    message: "member must be an internal directory member and cannot be the project owner",
  });
}

async function addProjectMember(ctx: ApiCtx): Promise<void> {
  const body = isObj(ctx.body) ? ctx.body : {};
  const principalId = typeof body.principalId === "string" ? body.principalId.trim() : "";
  const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
  if (!principalId || !memberId)
    return sendJson(ctx.res, 400, { error: "bad_request", message: "principalId and memberId required" });
  return mutationResponse(ctx, await ctx.app.addProjectMember(ctx.params.id!, principalId, memberId));
}

async function renameProject(ctx: ApiCtx): Promise<void> {
  const body = isObj(ctx.body) ? ctx.body : {};
  const principalId = typeof body.principalId === "string" ? body.principalId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!principalId || !name)
    return sendJson(ctx.res, 400, { error: "bad_request", message: "principalId and name required" });
  return mutationResponse(ctx, await ctx.app.renameProject(ctx.params.id!, principalId, name));
}

async function removeProjectMember(ctx: ApiCtx): Promise<void> {
  const body = isObj(ctx.body) ? ctx.body : {};
  const principalId = typeof body.principalId === "string" ? body.principalId.trim() : "";
  const memberId = ctx.params.memberId?.trim() ?? "";
  if (!principalId || !memberId)
    return sendJson(ctx.res, 400, { error: "bad_request", message: "principalId and memberId required" });
  return mutationResponse(ctx, await ctx.app.removeProjectMember(ctx.params.id!, principalId, memberId));
}

export const projectRoutes: ReadonlyArray<Route<ApiCtx>> = [
  { method: "GET", path: "/v1/projects", auth: "source", handle: listProjects },
  { method: "POST", path: "/v1/projects", auth: "source", handle: createProject },
  { method: "PATCH", path: "/v1/projects/:id", auth: "source", handle: renameProject },
  { method: "POST", path: "/v1/projects/:id/members", auth: "source", handle: addProjectMember },
  { method: "DELETE", path: "/v1/projects/:id/members/:memberId", auth: "source", handle: removeProjectMember },
];
