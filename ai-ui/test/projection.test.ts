/**
 * The projection cache, tested on the rule it exists to protect.
 *
 * Every assertion here is a way the "reading never spends a model call" rule
 * could be broken while the code still looked right.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProjectionCache, stateKey } from "../src/projection.ts";

describe("a read cannot spend a model call", () => {
  it("returns null on a miss instead of computing", () => {
    const cache = createProjectionCache<string>();
    let calls = 0;
    const compute = async () => {
      calls++;
      return "summary";
    };
    // The shape being guarded against is a lazy cache: `get` computing on a
    // miss makes a fresh tab spend, and ten tabs spend ten times.
    assert.equal(cache.get("f1", "k1"), null);
    assert.equal(calls, 0);
    void compute;
  });

  it("serves a hundred reads from one generation", async () => {
    const cache = createProjectionCache<string>();
    let calls = 0;
    await cache.refresh("f1", "k1", async () => {
      calls++;
      return "summary";
    });
    for (let i = 0; i < 100; i++)
      assert.equal(cache.get("f1", "k1")?.value, "summary");
    assert.equal(calls, 1);
  });

  it("does not regenerate while the state is unchanged", async () => {
    const cache = createProjectionCache<string>();
    let calls = 0;
    const compute = async () => {
      calls++;
      return `v${calls}`;
    };
    assert.equal(await cache.refresh("f1", "k1", compute), true);
    assert.equal(await cache.refresh("f1", "k1", compute), false);
    assert.equal(await cache.refresh("f1", "k1", compute), false);
    assert.equal(calls, 1);
  });

  it("regenerates when the state changes", async () => {
    const cache = createProjectionCache<string>();
    let calls = 0;
    const compute = async () => `v${++calls}`;
    await cache.refresh("f1", "k1", compute);
    await cache.refresh("f1", "k2", compute);
    assert.equal(calls, 2);
    assert.equal(cache.get("f1", "k2")?.value, "v2");
  });
});

describe("a projection is never shown against state it does not describe", () => {
  it("misses when the key moved on, rather than serving the stale one", async () => {
    const cache = createProjectionCache<string>();
    await cache.refresh("f1", "k1", async () => "describes k1");
    // The failure mode: returning "describes k1" next to k2's state is an
    // interface that is confidently wrong, which is worse than one that is blank.
    assert.equal(cache.get("f1", "k2"), null);
    assert.equal(cache.get("f1", "k1")?.value, "describes k1");
  });

  it("keeps the previous projection when generation throws", async () => {
    const cache = createProjectionCache<string>();
    await cache.refresh("f1", "k1", async () => "good");
    await assert.rejects(
      cache.refresh("f1", "k2", async () => {
        throw new Error("model said no");
      }),
    );
    // k1 is still true of k1's state. Blanking it would lose a correct
    // projection because a later, unrelated generation failed.
    assert.equal(cache.get("f1", "k1")?.value, "good");
  });
});

describe("what it refuses to grow into", () => {
  it("is bounded, evicting the least recently generated", async () => {
    const cache = createProjectionCache<number>({ max: 3 });
    for (let i = 0; i < 5; i++)
      await cache.refresh(`f${i}`, "k", async () => i);
    assert.equal(cache.size(), 3);
    assert.equal(cache.get("f0", "k"), null);
    assert.equal(cache.get("f4", "k")?.value, 4);
  });

  it("stamps when it was generated, so the desk can say how fresh it is", async () => {
    const cache = createProjectionCache<string>({ now: () => 1234 });
    await cache.refresh("f1", "k", async () => "x");
    assert.equal(cache.get("f1", "k")?.at, 1234);
  });
});

describe("the key is a fact about the state, not about the order it was written", () => {
  it("is stable across key order", () => {
    assert.equal(
      stateKey({ a: 1, b: [{ x: 1, y: 2 }] }),
      stateKey({ b: [{ y: 2, x: 1 }] as unknown[], a: 1 }),
    );
  });

  it("changes when anything in the state changes", () => {
    assert.notEqual(stateKey({ steps: 3 }), stateKey({ steps: 4 }));
    assert.notEqual(stateKey([1, 2]), stateKey([2, 1]));
  });

  it("survives null and undefined without throwing", () => {
    assert.equal(typeof stateKey(null), "string");
    assert.equal(typeof stateKey(undefined), "string");
    assert.notEqual(stateKey(null), stateKey(0));
  });
});
