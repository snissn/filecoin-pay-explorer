import { describe, expect, it, vi } from "vitest";
import {
  BOSS_LIFECYCLE_REVIEW_MAX_AGE_MS,
  type BossLifecycleCurrentContext,
  BossLifecycleError,
  type BossLifecycleReview,
  type BossServicesManagerLike,
  type BossServicesStage,
  compareBossLifecycleReview,
  executeBossLifecycleReview,
  prepareBossLifecycleReview,
  resolveBossServicesManager,
  serializeBossLifecycleEvidence,
} from "./lifecycle";

const ADDRESS = (digit: string) => `0x${digit.repeat(40)}`;
const HASH = (digit: string) => `0x${digit.repeat(64)}`;
const CREATED_AT = 1_000_000;

function transaction(stage: BossServicesStage, digit: string) {
  return {
    stage,
    hash: HASH(digit),
    receipt: {
      status: 1n,
      blockNumber: 123n,
    },
  };
}

function manager(overrides: Partial<BossServicesManagerLike> = {}): BossServicesManagerLike {
  return {
    get: vi.fn(async () => ({ state: "ACTIVE" })),
    reconcile: vi.fn(async () => ({ boss: { state: "ACTIVE" }, pay: { railId: 42n } })),
    sync: vi.fn(async () => transaction("sync", "1")),
    topUp: vi.fn(async () => transaction("top-up", "2")),
    pause: vi.fn(async () => transaction("pause", "3")),
    resume: vi.fn(async () => transaction("resume", "4")),
    stop: vi.fn(async () => transaction("stop", "5")),
    ...overrides,
  };
}

function review(overrides: Partial<Parameters<typeof prepareBossLifecycleReview>[0]> = {}): BossLifecycleReview {
  return prepareBossLifecycleReview({
    action: "sync",
    chainId: 314159,
    wallet: ADDRESS("1"),
    account: ADDRESS("2"),
    subscriptionId: HASH("3"),
    railId: "42",
    createdAtMs: CREATED_AT,
    ...overrides,
  });
}

function context(overrides: Partial<BossLifecycleCurrentContext> = {}): BossLifecycleCurrentContext {
  return {
    chainId: 314159,
    wallet: ADDRESS("1"),
    account: ADDRESS("2"),
    subscriptionId: HASH("3"),
    railId: "42",
    nowMs: CREATED_AT + 1_000,
    ...overrides,
  };
}

describe("Boss lifecycle review", () => {
  it("creates one normalized immutable review", () => {
    const prepared = review({
      action: "top-up",
      wallet: ADDRESS("A"),
      account: ADDRESS("B"),
      subscriptionId: HASH("C"),
      newFixedBudget: 500n,
    });

    expect(Object.isFrozen(prepared)).toBe(true);
    expect(prepared).toMatchObject({
      action: "top-up",
      wallet: ADDRESS("a"),
      account: ADDRESS("b"),
      subscriptionId: HASH("c"),
      newFixedBudget: 500n,
    });
    expect(prepared.reviewKey).toContain(":500:");
  });

  it("requires an absolute positive fixed-budget target only for top-up", () => {
    expect(() => review({ action: "top-up" })).toThrow(/absolute fixed-budget target/i);
    expect(() => review({ action: "top-up", newFixedBudget: 0n })).toThrow(/absolute fixed-budget target/i);
    expect(() => review({ action: "pause", newFixedBudget: 1n })).toThrow(/must not carry/i);
  });

  it("reports every changed authority field", () => {
    const mismatches = compareBossLifecycleReview(
      review(),
      context({
        chainId: 314,
        wallet: ADDRESS("9"),
        account: ADDRESS("8"),
        subscriptionId: HASH("7"),
        railId: "43",
      }),
    );
    expect(mismatches.map((mismatch) => mismatch.field)).toEqual([
      "chainId",
      "wallet",
      "account",
      "subscriptionId",
      "railId",
    ]);
  });

  it("executes exactly one SDK call, retains exact transaction evidence, and reconciles once", async () => {
    const services = manager();
    const receipt = await executeBossLifecycleReview(services, review(), context());

    expect(services.sync).toHaveBeenCalledTimes(1);
    expect(services.sync).toHaveBeenCalledWith({
      account: ADDRESS("2"),
      subscriptionId: HASH("3"),
    });
    expect(services.reconcile).toHaveBeenCalledTimes(1);
    expect(receipt).toMatchObject({
      status: "succeeded",
      result: {
        transactions: [
          {
            stage: "sync",
            txHash: HASH("1"),
            receiptStatus: "1",
            blockNumber: "123",
          },
        ],
      },
      reconciliation: { status: "succeeded" },
    });
  });

  it("passes the exact absolute newFixedBudget shape to Synapse.services.topUp", async () => {
    const services = manager();
    const prepared = review({ action: "top-up", newFixedBudget: 700n });

    const receipt = await executeBossLifecycleReview(services, prepared, context());

    expect(services.topUp).toHaveBeenCalledTimes(1);
    expect(services.topUp).toHaveBeenCalledWith({
      account: ADDRESS("2"),
      subscriptionId: HASH("3"),
      newFixedBudget: 700n,
    });
    expect(receipt.result?.transactions[0]).toMatchObject({
      stage: "top-up",
      txHash: HASH("2"),
    });
  });

  it("retains completed transaction evidence from an exact partial-completion error", async () => {
    const partial = Object.assign(new Error("Filecoin Boss operation failed at stage pause."), {
      name: "BossServicesPartialCompletionError",
      failedStage: "pause",
      completed: [transaction("deposit", "6"), transaction("deploy-account", "7")],
    });
    const services = manager({
      pause: vi.fn(async () => {
        throw partial;
      }),
    });

    const receipt = await executeBossLifecycleReview(services, review({ action: "pause" }), context());

    expect(receipt.status).toBe("partial");
    expect(receipt.result).toEqual({
      failedStage: "pause",
      transactions: [
        {
          stage: "deposit",
          txHash: HASH("6"),
          receiptStatus: "1",
          blockNumber: "123",
        },
        {
          stage: "deploy-account",
          txHash: HASH("7"),
          receiptStatus: "1",
          blockNumber: "123",
        },
      ],
    });
    expect(receipt.error).toContain("failed at stage");
    expect(services.reconcile).toHaveBeenCalledTimes(1);
  });

  it("reconciles exactly once after a thrown SDK failure", async () => {
    const services = manager({
      stop: vi.fn(async () => {
        throw new Error("wallet rejected");
      }),
    });

    const receipt = await executeBossLifecycleReview(services, review({ action: "stop" }), context());

    expect(receipt).toMatchObject({
      status: "failed",
      error: "wallet rejected",
      reconciliation: { status: "succeeded" },
    });
    expect(services.reconcile).toHaveBeenCalledTimes(1);
  });

  it("rejects a cloned review whose action changed after confirmation", async () => {
    const services = manager();
    const prepared = review();
    const tampered = { ...prepared, action: "stop" } as BossLifecycleReview;

    await expect(executeBossLifecycleReview(services, tampered, context())).rejects.toMatchObject({
      code: "INVALID_REVIEW",
    });
    expect(services.sync).not.toHaveBeenCalled();
    expect(services.stop).not.toHaveBeenCalled();
    expect(services.reconcile).not.toHaveBeenCalled();
  });

  it("rejects a cloned top-up review whose fixed-budget target changed", async () => {
    const services = manager();
    const prepared = review({ action: "top-up", newFixedBudget: 500n });
    const tampered = { ...prepared, newFixedBudget: 900n } as BossLifecycleReview;

    await expect(executeBossLifecycleReview(services, tampered, context())).rejects.toMatchObject({
      code: "INVALID_REVIEW",
    });
    expect(services.topUp).not.toHaveBeenCalled();
    expect(services.reconcile).not.toHaveBeenCalled();
  });

  it("expires a review after five minutes before any SDK call", async () => {
    const services = manager();
    const prepared = review();

    await expect(
      executeBossLifecycleReview(
        services,
        prepared,
        context({ nowMs: CREATED_AT + BOSS_LIFECYCLE_REVIEW_MAX_AGE_MS + 1 }),
      ),
    ).rejects.toMatchObject({
      code: "STALE_REVIEW",
    });
    expect(services.sync).not.toHaveBeenCalled();
    expect(services.reconcile).not.toHaveBeenCalled();
  });

  it("rejects changed live context before any SDK call", async () => {
    const services = manager();

    await expect(
      executeBossLifecycleReview(services, review(), context({ wallet: ADDRESS("f") })),
    ).rejects.toBeInstanceOf(BossLifecycleError);
    expect(services.sync).not.toHaveBeenCalled();
    expect(services.reconcile).not.toHaveBeenCalled();
  });

  it("serializes bigint evidence without precision loss", () => {
    expect(serializeBossLifecycleEvidence({ amount: 9007199254740993123456789n })).toContain(
      '"9007199254740993123456789"',
    );
  });

  it("resolves only a complete maintained Synapse.services manager", () => {
    expect(resolveBossServicesManager({ services: manager() }).status).toBe("available");
    expect(resolveBossServicesManager({ services: { sync: () => undefined } })).toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("missing required"),
    });
    expect(resolveBossServicesManager(null)).toMatchObject({
      status: "unavailable",
    });
  });
});
