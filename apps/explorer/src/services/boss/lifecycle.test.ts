import { describe, expect, it, vi } from "vitest";
import {
  type BossLifecycleCurrentContext,
  BossLifecycleError,
  type BossServicesManagerLike,
  compareBossLifecycleReview,
  executeBossLifecycleReview,
  prepareBossLifecycleReview,
  resolveBossServicesManager,
  serializeBossLifecycleEvidence,
} from "./lifecycle";

const ADDRESS = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const HASH = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;

function evidence(stage: string, digit = "f") {
  return { stage, hash: HASH(digit), receipt: null };
}

function manager(overrides: Partial<BossServicesManagerLike> = {}) {
  return {
    get: vi.fn(async () => ({ state: "ACTIVE" })),
    reconcile: vi.fn(async () => ({ boss: { state: "ACTIVE" }, pay: { railId: 42n } })),
    sync: vi.fn(async () => evidence("sync")),
    topUp: vi.fn(async () => evidence("top-up")),
    pause: vi.fn(async () => evidence("pause")),
    resume: vi.fn(async () => evidence("resume")),
    stop: vi.fn(async () => evidence("stop")),
    ...overrides,
  } satisfies BossServicesManagerLike;
}

function review(action: "sync" | "top-up" | "pause" | "resume" | "stop" = "sync") {
  return prepareBossLifecycleReview({
    action,
    chainId: 314159,
    wallet: ADDRESS("1"),
    account: ADDRESS("2"),
    subscriptionId: HASH("3"),
    railId: "42",
    amount: action === "top-up" ? 100n : undefined,
    createdAtMs: 1_786_950_000_000,
  });
}

function current(overrides: Partial<BossLifecycleCurrentContext> = {}): BossLifecycleCurrentContext {
  return {
    chainId: 314159,
    wallet: ADDRESS("1"),
    account: ADDRESS("2"),
    subscriptionId: HASH("3"),
    railId: "42",
    ...overrides,
  };
}

describe("Boss lifecycle review and execution", () => {
  it("fails closed when the installed Synapse package lacks the maintained services API", () => {
    expect(resolveBossServicesManager({})).toMatchObject({ status: "unavailable" });
    expect(resolveBossServicesManager({ services: { sync: () => undefined } })).toMatchObject({
      status: "unavailable",
    });
    expect(resolveBossServicesManager({ services: manager() })).toMatchObject({ status: "available" });
  });

  it("creates an immutable exact review and requires an explicit top-up amount", () => {
    const prepared = review("top-up");
    expect(prepared).toMatchObject({
      schemaVersion: 1,
      action: "top-up",
      chainId: 314159,
      wallet: ADDRESS("1"),
      account: ADDRESS("2"),
      subscriptionId: HASH("3"),
      railId: "42",
      amount: 100n,
    });
    expect(prepared.reviewKey).toContain(":top-up:314159:");
    expect(() =>
      prepareBossLifecycleReview({
        action: "top-up",
        chainId: 314159,
        wallet: ADDRESS("1"),
        account: ADDRESS("2"),
        subscriptionId: HASH("3"),
        railId: "42",
        createdAtMs: 1,
      }),
    ).toThrow(BossLifecycleError);
  });

  it.each([
    ["chainId", { chainId: 314 }],
    ["wallet", { wallet: ADDRESS("f") }],
    ["account", { account: ADDRESS("f") }],
    ["subscriptionId", { subscriptionId: HASH("f") }],
    ["railId", { railId: "43" }],
  ] as const)("invalidates a reviewed action when %s changes", (field, overrides) => {
    const mismatches = compareBossLifecycleReview(review(), current(overrides));
    expect(mismatches.map((mismatch) => mismatch.field)).toContain(field);
  });

  it("executes exactly one reviewed SDK write and reconciles afterward", async () => {
    const services = manager();
    const receipt = await executeBossLifecycleReview(services, review("sync"), current());

    expect(receipt.status).toBe("succeeded");
    expect(receipt.result?.transactions).toEqual([{ stage: "sync", txHash: HASH("f"), receipt: null }]);
    expect(services.sync).toHaveBeenCalledWith({ account: ADDRESS("2"), subscriptionId: HASH("3") });
    expect(services.sync).toHaveBeenCalledTimes(1);
    expect(services.reconcile).toHaveBeenCalledTimes(1);
    expect(services.topUp).not.toHaveBeenCalled();
    expect(services.pause).not.toHaveBeenCalled();
    expect(services.resume).not.toHaveBeenCalled();
    expect(services.stop).not.toHaveBeenCalled();
  });

  it("passes only the reviewed top-up amount", async () => {
    const services = manager();
    await executeBossLifecycleReview(services, review("top-up"), current());
    expect(services.topUp).toHaveBeenCalledWith({
      account: ADDRESS("2"),
      subscriptionId: HASH("3"),
      newFixedBudget: 100n,
    });
  });

  it("does not execute a stale review", async () => {
    const services = manager();
    await expect(
      executeBossLifecycleReview(services, review("stop"), current({ wallet: ADDRESS("f") })),
    ).rejects.toMatchObject({ code: "STALE_REVIEW" });
    expect(services.stop).not.toHaveBeenCalled();
    expect(services.reconcile).not.toHaveBeenCalled();
  });

  it("retains exact SDK partial-completion evidence and still reconciles once", async () => {
    const partial = Object.assign(new Error('Filecoin Boss operation failed at stage "pause".'), {
      name: "BossServicesPartialCompletionError",
      failedStage: "pause",
      completed: [evidence("approve-operator", "a")],
      cause: new Error("pause reverted"),
    });
    const services = manager({ pause: vi.fn(async () => Promise.reject(partial)) });
    const receipt = await executeBossLifecycleReview(services, review("pause"), current());
    expect(receipt.status).toBe("partial");
    expect(receipt.error).toContain("pause reverted");
    expect(receipt.result?.stage).toBe("pause");
    expect(receipt.result?.transactions).toEqual([{ stage: "approve-operator", txHash: HASH("a"), receipt: null }]);
    expect(services.pause).toHaveBeenCalledTimes(1);
    expect(services.reconcile).toHaveBeenCalledTimes(1);
  });

  it("captures thrown wallet errors without retrying and still attempts reconciliation", async () => {
    const services = manager({ stop: vi.fn(async () => Promise.reject(new Error("user rejected"))) });
    const receipt = await executeBossLifecycleReview(services, review("stop"), current());
    expect(receipt).toMatchObject({ status: "failed", error: "user rejected" });
    expect(services.stop).toHaveBeenCalledTimes(1);
    expect(services.reconcile).toHaveBeenCalledTimes(1);
  });

  it("serializes BigInt evidence for durable display", () => {
    expect(serializeBossLifecycleEvidence({ railId: 42n, amount: 100n })).toContain('"railId": "42"');
  });
});
