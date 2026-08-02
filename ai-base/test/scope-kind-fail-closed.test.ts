import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isManageableCreationScope,
  isSharedScope,
  parseScopeId,
  type ScopeId,
  type ScopeKind,
} from "../src/types.ts";
import {
  createCanManageScope,
  createCanReadScope,
  createCanWriteScope,
  createCurrentScopeMembers,
  createIsCurrentSharedScopeMember,
  createManagesArtifactHome,
  createMembershipControlsScope,
  type ScopeMembershipDeps,
} from "../src/resolution/scope-membership.ts";
import { runTrigger, type TriggerDeps } from "../src/triggers/run-trigger.ts";
import { resolveShareTarget } from "../src/api/artifact-share.ts";
import { createDeliveryStore } from "../src/delivery/delivery-store.ts";
import { createIdempotencyStore } from "../src/idempotency/idempotency-store.ts";
import { createIdentityService } from "../src/identity/identity-service.ts";
import { createMemoryMap } from "../src/persistence/durable-map.ts";
import type { TurnRequest, TurnResult } from "../src/types.ts";

const ACTOR = "U1";
const REF = "X1";

const RECOGNISED: readonly ScopeKind[] = ["personal", "channel", "team", "org", "group"];

const UNRECOGNISED = ["flow", "system", "workspace", "tenant", "", "PERSONAL"] as const;

const probe = (kind: string): ScopeId => `${kind}:${REF}`;

function permissiveDeps(): ScopeMembershipDeps {
  return {
    managedGroups: {
      recognizes: () => true,
      membership: async () => true,
      members: async () => [ACTOR],
    },
    directory: {
      channelMember: async () => true,
      groupMember: async () => true,
      channelMembership: async () => true,
      groupMembership: async () => true,
      channelPrivacy: async () => true,
      list: async () => [{ principalId: ACTOR, displayName: "One" }],
    },
    identity: { classify: () => ({ type: "internal", teamIds: [REF] }) },
    sessions: { listByParticipant: async () => RECOGNISED.map((k) => ({ scopeId: probe(k) })) },
  };
}

describe("scope kinds: the union census", () => {
  it("parseScopeId recognises exactly the five upstream kinds", () => {
    for (const kind of RECOGNISED) {
      assert.equal(parseScopeId(probe(kind)).kind, kind, `${kind} is a recognised scope kind`);
    }
    for (const kind of UNRECOGNISED) {
      assert.equal(
        parseScopeId(probe(kind)).kind,
        null,
        `${kind} is not a scope kind — if this failed because the union was widened, ` +
          `add the new kind to RECOGNISED and give it an explicit row in every table below ` +
          `rather than deleting this assertion`,
      );
    }
  });

  it("a widened union cannot reach the ACL through the ref of another kind", () => {
    assert.equal(parseScopeId("team:flow:F1").kind, "team", "parseScopeId splits on the first colon");
    assert.equal(parseScopeId("team:flow:F1").ref, "flow:F1", "so a nested kind is only ever a ref");
  });
});

describe("scope kinds: a kind no ACL function handles is denied, not allowed", () => {
  const deps = permissiveDeps();
  const canRead = createCanReadScope(deps);
  const canWrite = createCanWriteScope(deps);
  const canManage = createCanManageScope(deps);
  const isMember = createIsCurrentSharedScopeMember(deps);
  const members = createCurrentScopeMembers(deps);
  const membershipControls = createMembershipControlsScope(deps);
  const managesHome = createManagesArtifactHome(deps, canManage);

  it("the deps say yes to everything, so a recognised kind is allowed", async () => {
    assert.equal(await canRead(ACTOR, probe("group")), true, "read: group");
    assert.equal(await canRead(ACTOR, probe("channel")), true, "read: channel");
    assert.equal(await canRead(ACTOR, probe("team")), true, "read: team");
    assert.equal(await canRead(ACTOR, probe("org")), true, "read: org");
    assert.equal(await canWrite(ACTOR, probe("group")), true, "write: group");
    assert.equal(await canManage(ACTOR, probe("group")), true, "manage: group");
  });

  for (const kind of UNRECOGNISED) {
    it(`denies every decision for "${kind}:"`, async () => {
      const scope = probe(kind);
      assert.equal(await canRead(ACTOR, scope), false, "canReadScope must deny an unhandled kind");
      assert.equal(await canWrite(ACTOR, scope), false, "canWriteScope must deny an unhandled kind");
      assert.equal(await canManage(ACTOR, scope), false, "canManageScope must deny an unhandled kind");
      assert.equal(await isMember(ACTOR, scope), false, "isCurrentSharedScopeMember must deny an unhandled kind");
      assert.equal(await membershipControls(scope), false, "membershipControlsScope must not claim an unhandled kind");
      assert.equal(
        await managesHome(scope, ACTOR, ACTOR),
        false,
        "managesArtifactHome must deny an unhandled kind even to the creator",
      );
      assert.equal(isSharedScope(scope), false, "isSharedScope must not widen to an unhandled kind");
      assert.equal(
        isManageableCreationScope(scope),
        false,
        "isManageableCreationScope must not widen to an unhandled kind",
      );
    });
  }

  it("currentScopeMembers answers undefined for an unhandled kind, which callers must read as unknown", async () => {
    for (const kind of UNRECOGNISED) {
      assert.equal(
        await members(probe(kind)),
        undefined,
        `currentScopeMembers has no roster for ${kind}: — a caller that treats undefined as "no restriction" fails open`,
      );
    }
  });
});

describe("scope kinds: a trigger whose home scope is an unhandled kind does not run", () => {
  function triggerDeps(run: (req: TurnRequest) => Promise<TurnResult>): TriggerDeps {
    return {
      deliveries: createDeliveryStore(),
      idempotency: createIdempotencyStore(createMemoryMap()),
      identity: createIdentityService(),
      run,
      currentScopeMembers: createCurrentScopeMembers(permissiveDeps()),
      directory: {
        channelMember: async () => false,
        groupMember: async () => false,
        listChannelsFor: async () => [],
        channelPrivacy: async () => undefined,
        get: async () => null,
      },
    };
  }

  for (const kind of UNRECOGNISED) {
    it(`skips the run for a "${kind}:" home scope with no membership evidence anywhere`, async () => {
      let ran = false;
      const deps = triggerDeps(async () => {
        ran = true;
        return { status: "ok", reply: "done" };
      });
      const out = await runTrigger(deps, {
        owner: ACTOR,
        ownerScopeId: probe(kind),
        input: "do the thing",
        fireKey: `cron:fail-closed:${kind}`,
        surface: "cron",
      });
      assert.equal(ran, false, "the turn must not run: nothing established that the actor may read this scope");
      assert.match(
        out.note ?? "",
        /member of this trigger's home scope/,
        "and the skip must be reported as a membership failure, not silence",
      );
    });
  }

  it("still runs for a channel the actor belongs to", async () => {
    let ran = false;
    const deps = triggerDeps(async () => {
      ran = true;
      return { status: "ok", reply: "done" };
    });
    deps.directory!.channelMember = async () => true;
    await runTrigger(deps, {
      owner: ACTOR,
      ownerScopeId: probe("channel"),
      input: "do the thing",
      fireKey: "cron:fail-closed:channel-member",
      surface: "cron",
    });
    assert.equal(ran, true, "the deny above is about the kind, not about the harness");
  });
});

describe("scope kinds: an unhandled kind is not a share target", () => {
  const app = { resolveRecipient: async () => ({ kind: "none" }) as never };
  const hints = { invalidScope: (scope: string) => `not a scope: ${scope}`, targetRequired: "pass one" };

  for (const kind of UNRECOGNISED) {
    it(`rejects "${kind}:" as a share destination`, async () => {
      const resolved = await resolveShareTarget(app, { scope: probe(kind) }, hints);
      assert.equal(resolved.kind, "invalid", "an artifact cannot be shared into a scope the ACL cannot evaluate");
    });
  }
});
