import { describe, expect, it, vi } from "vitest";
import {
  BOSS_LIFECYCLE_REVIEW_TTL_MS,
  type BossLifecycleAction,
  type BossLifecycleCurrentContext,
  BossLifecycleError,
  BossLifecycleExecutionGate,
  type BossLifecycleReference,
  type BossLifecycleReview,
  type BossServicesManagerLike,
  compareBossLifecycleReview,
  createBossAssociationProofKey,
  executeBossLifecycleReview,
  isBossLifecycleActionAvailable,
  prepareBossLifecycleReview,
  resolveBossLifecycleDirectAuthority,
  resolveBossServicesManager,
  serializeBossLifecycleEvidence,
} from "./lifecycle";

const ADDRESS = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const HASH = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;
const CREATED_AT = 1_786_950_000_000;
const ASSOCIATION_PROOF = "boss-pay-association-v1:exact-proof:active";

function evidence(stage: string, digit = "f", receipt: unknown = null) {
  return { stage, hash: HASH(digit), receipt };
}

function directSnapshot(overrides: Record<string, unknown> = {}) {
  const { subscription: subscriptionOverrides, ...outerOverrides } = overrides;
  return {
    exists: true,
    subscriptionId: HASH("3"),
    subscription: {
      resourceKey: HASH("6"),
      beneficiary: ADDRESS("5"),
      token: ADDRESS("4"),
      railId: 42n,
      billingKind: 1,
      pauseAllowed: false,
      currentFixedBudget: 100n,
      state: 2,
      ...((subscriptionOverrides as Record<string, unknown> | undefined) ?? {}),
    },
    railRead: true,
    railAssociationValid: true,
    ...outerOverrides,
  };
}

function manager(overrides: Partial<BossServicesManagerLike> = {}): BossServicesManagerLike {
  return {
    get: vi.fn(async (_input: BossLifecycleReference) => directSnapshot()),
    reconcile: vi.fn(async (_input: BossLifecycleReference) => ({ boss: { state: "ACTIVE" }, pay: { railId: 42n } })),
    sync: vi.fn(async (_input: BossLifecycleReference) => evidence("sync")),
    topUp: vi.fn(async (_input: BossLifecycleReference & { newFixedBudget: bigint }) => evidence("top-up")),
    pause: vi.fn(async (_input: BossLifecycleReference) => evidence("pause")),
    resume: vi.fn(async (_input: BossLifecycleReference) => evidence("resume")),
    stop: vi.fn(async (_input: BossLifecycleReference) => evidence("stop")),
    ...overrides,
  };
}

function actionDefaults(action: BossLifecycleAction) {
  return {
    subscriptionState: action === "resume" ? ("PAUSED" as const) : ("ACTIVE" as const),
    billingKind: action === "sync" ? 1 : action === "top-up" ? 2 : 0,
    pauseAllowed: action === "pause" || action === "resume",
  };
}

function review(
  action: BossLifecycleAction = "sync",
  overrides: Partial<Parameters<typeof prepareBossLifecycleReview>[0]> = {},
): BossLifecycleReview {
  const defaults = actionDefaults(action);
  return prepareBossLifecycleReview({
    action,
    chainId: 314159,
    wallet: ADDRESS("1"),
    account: ADDRESS("2"),
    subscriptionId: HASH("3"),
    railId: "42",
    subscriptionState: defaults.subscriptionState,
    billingKind: defaults.billingKind,
    pauseAllowed: defaults.pauseAllowed,
    requiresAccountRead: false,
    directReadVerified: true,
    token: ADDRESS("4"),
    beneficiary: ADDRESS("5"),
    resourceKey: HASH("6"),
    associationProofKey: ASSOCIATION_PROOF,
    indexDeployment: "boss-calibration-v1",
    indexedBlock: 100n,
    observedBlock: 110n,
    currentFixedBudget: "100",
    newFixedBudget: action === "top-up" ? 200n : undefined,
    createdAtMs: CREATED_AT,
    ...overrides,
  });
}

function current(
  prepared: BossLifecycleReview = review(),
  overrides: Partial<BossLifecycleCurrentContext> = {},
): BossLifecycleCurrentContext {
  return {
    chainId: prepared.chainId,
    wallet: prepared.wallet,
    account: prepared.account,
    subscriptionId: prepared.subscriptionId,
    railId: prepared.railId,
    subscriptionState: prepared.subscriptionState,
    billingKind: prepared.billingKind,
    pauseAllowed: prepared.pauseAllowed,
    requiresAccountRead: prepared.requiresAccountRead,
    directReadVerified: prepared.directReadVerified,
    token: prepared.token,
    beneficiary: prepared.beneficiary,
    resourceKey: prepared.resourceKey,
    associationProofKey: prepared.associationProofKey,
    indexDeployment: prepared.indexDeployment,
    indexedBlock: prepared.indexedBlock + 1n,
    observedBlock: prepared.observedBlock + 1n,
    currentFixedBudget: prepared.currentFixedBudget.toString(),
    nowMs: prepared.createdAtMs + 1_000,
    ...overrides,
  };
}

function directSnapshotForReview(prepared: BossLifecycleReview, overrides: Record<string, unknown> = {}) {
  let stateCode: number;
  switch (prepared.subscriptionState) {
    case "PENDING_ACTIVATION":
      stateCode = 1;
      break;
    case "ACTIVE":
      stateCode = 2;
      break;
    case "PAUSED":
      stateCode = 3;
      break;
    case "TERMINATING":
      stateCode = 4;
      break;
    case "ENDED":
      stateCode = 5;
      break;
    case "EXHAUSTED":
      stateCode = 6;
      break;
    default:
      throw new Error(`Unsupported future Boss subscription state ${prepared.subscriptionState}`);
  }
  return directSnapshot({
    subscriptionId: prepared.subscriptionId,
    subscription: {
      resourceKey: prepared.resourceKey,
      beneficiary: prepared.beneficiary,
      token: prepared.token,
      railId: BigInt(prepared.railId),
      billingKind: prepared.billingKind,
      pauseAllowed: prepared.pauseAllowed,
      currentFixedBudget: prepared.currentFixedBudget,
      state: stateCode,
      ...((overrides.subscription as Record<string, unknown> | undefined) ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "subscription")),
  });
}

function managerForReview(
  prepared: BossLifecycleReview,
  overrides: Partial<BossServicesManagerLike> = {},
): BossServicesManagerLike {
  return manager({
    get: vi.fn(async (_input: BossLifecycleReference) => directSnapshotForReview(prepared)),
    ...overrides,
  });
}

describe("Boss lifecycle review and execution", () => {
  it("fails closed when the installed Synapse package lacks the maintained services API", () => {
    expect(resolveBossServicesManager({})).toMatchObject({ status: "unavailable" });
    expect(resolveBossServicesManager({ services: { sync: () => undefined } })).toMatchObject({
      status: "unavailable",
    });
    expect(resolveBossServicesManager({ services: manager() })).toMatchObject({ status: "available" });
  });

  it("constructs an exact active association proof key", () => {
    const key = createBossAssociationProofKey({
      chainId: 314159,
      filecoinPay: ADDRESS("1"),
      bossAccount: ADDRESS("2"),
      subscriptionEntityId: "314159:boss:subscription",
      subscriptionId: HASH("3"),
      railId: "42",
      payer: ADDRESS("4"),
      payee: ADDRESS("5"),
      operator: ADDRESS("2"),
      validator: ADDRESS("2"),
      token: ADDRESS("6"),
      active: true,
    });
    expect(key).toContain(`:${HASH("3")}:42:`);
    expect(key.endsWith(":active")).toBe(true);
  });

  it("normalizes one current direct Boss snapshot and rejects invariant drift", () => {
    const authority = resolveBossLifecycleDirectAuthority(directSnapshot(), {
      subscriptionId: HASH("3"),
      railId: "42",
      billingKind: 1,
      pauseAllowed: false,
      token: ADDRESS("4"),
      beneficiary: ADDRESS("5"),
      resourceKey: HASH("6"),
    });
    expect(authority).toEqual({
      subscriptionId: HASH("3"),
      railId: "42",
      subscriptionState: "ACTIVE",
      billingKind: 1,
      pauseAllowed: false,
      token: ADDRESS("4"),
      beneficiary: ADDRESS("5"),
      resourceKey: HASH("6"),
      currentFixedBudget: "100",
      railAssociationValid: true,
    });

    expect(() =>
      resolveBossLifecycleDirectAuthority(directSnapshot({ railAssociationValid: false }), {
        subscriptionId: HASH("3"),
        railId: "42",
        billingKind: 1,
        pauseAllowed: false,
        token: ADDRESS("4"),
        beneficiary: ADDRESS("5"),
        resourceKey: HASH("6"),
      }),
    ).toThrow(BossLifecycleError);
    expect(() =>
      resolveBossLifecycleDirectAuthority(directSnapshot({ subscription: { railId: 43n } }), {
        subscriptionId: HASH("3"),
        railId: "42",
        billingKind: 1,
        pauseAllowed: false,
        token: ADDRESS("4"),
        beneficiary: ADDRESS("5"),
        resourceKey: HASH("6"),
      }),
    ).toThrow(BossLifecycleError);
  });

  it("requires an active association proof and a completed direct read", () => {
    expect(() => review("sync", { associationProofKey: "boss-pay-association-v1:proof:inactive" })).toThrow(
      BossLifecycleError,
    );
    expect(() => review("sync", { directReadVerified: false })).toThrow(BossLifecycleError);
  });

  it("creates a frozen exact review and requires a larger fixed-budget target", () => {
    const prepared = review("top-up");
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(prepared).toMatchObject({
      schemaVersion: 4,
      action: "top-up",
      chainId: 314159,
      wallet: ADDRESS("1"),
      account: ADDRESS("2"),
      subscriptionId: HASH("3"),
      railId: "42",
      subscriptionState: "ACTIVE",
      billingKind: 2,
      pauseAllowed: false,
      requiresAccountRead: false,
      directReadVerified: true,
      token: ADDRESS("4"),
      beneficiary: ADDRESS("5"),
      resourceKey: HASH("6"),
      associationProofKey: ASSOCIATION_PROOF,
      currentFixedBudget: 100n,
      newFixedBudget: 200n,
    });
    expect(prepared.reviewKey).toContain(":top-up:314159:");
    expect(() => review("top-up", { newFixedBudget: 100n })).toThrow(BossLifecycleError);
  });

  it("enforces state, billing-kind, and pause-authority action availability", () => {
    expect(isBossLifecycleActionAvailable("sync", "PENDING_ACTIVATION", 1, false)).toBe(true);
    expect(isBossLifecycleActionAvailable("sync", "ACTIVE", 2, false)).toBe(false);
    expect(isBossLifecycleActionAvailable("top-up", "EXHAUSTED", 2, false)).toBe(true);
    expect(isBossLifecycleActionAvailable("top-up", "ACTIVE", 1, false)).toBe(false);
    expect(isBossLifecycleActionAvailable("pause", "ACTIVE", 0, true)).toBe(true);
    expect(isBossLifecycleActionAvailable("pause", "ACTIVE", 0, false)).toBe(false);
    expect(isBossLifecycleActionAvailable("resume", "PAUSED", 0, true)).toBe(true);
    expect(isBossLifecycleActionAvailable("stop", "TERMINATING", 0, false)).toBe(false);
  });

  it.each([
    ["chainId", { chainId: 314 }],
    ["wallet", { wallet: ADDRESS("f") }],
    ["account", { account: ADDRESS("f") }],
    ["subscriptionId", { subscriptionId: HASH("f") }],
    ["railId", { railId: "43" }],
    ["subscriptionState", { subscriptionState: "PAUSED" as const }],
    ["billingKind", { billingKind: 2 }],
    ["pauseAllowed", { pauseAllowed: true }],
    ["requiresAccountRead", { requiresAccountRead: true }],
    ["directRead", { directReadVerified: false }],
    ["token", { token: ADDRESS("f") }],
    ["beneficiary", { beneficiary: ADDRESS("f") }],
    ["resourceKey", { resourceKey: HASH("f") }],
    ["associationProof", { associationProofKey: "boss-pay-association-v1:changed" }],
    ["fixedBudget", { currentFixedBudget: "101" }],
  ] as const)("invalidates a reviewed action when %s changes", (field, overrides) => {
    const prepared = review();
    const mismatches = compareBossLifecycleReview(prepared, current(prepared, overrides));
    expect(mismatches.map((mismatch) => mismatch.field)).toContain(field);
  });

  it("invalidates regressed, lagging, changed-deployment, and expired index authority", () => {
    const prepared = review();
    expect(
      compareBossLifecycleReview(prepared, current(prepared, { indexedBlock: 99n })).map((mismatch) => mismatch.field),
    ).toContain("indexRegression");
    expect(
      compareBossLifecycleReview(prepared, current(prepared, { indexedBlock: 100n, observedBlock: 121n })).map(
        (mismatch) => mismatch.field,
      ),
    ).toContain("indexLag");
    expect(
      compareBossLifecycleReview(prepared, current(prepared, { indexDeployment: "other-deployment" })).map(
        (mismatch) => mismatch.field,
      ),
    ).toContain("indexDeployment");
    expect(
      compareBossLifecycleReview(
        prepared,
        current(prepared, {
          nowMs: CREATED_AT + BOSS_LIFECYCLE_REVIEW_TTL_MS + 1,
        }),
      ).map((mismatch) => mismatch.field),
    ).toContain("age");
  });

  it("rejects a cloned review whose approved budget target changed", async () => {
    const prepared = review("top-up");
    const tampered = { ...prepared, newFixedBudget: 900n } as BossLifecycleReview;
    const services = manager();

    await expect(executeBossLifecycleReview(services, tampered, current(prepared))).rejects.toMatchObject({
      code: "INVALID_REVIEW",
    });
    expect(services.topUp).not.toHaveBeenCalled();
    expect(services.reconcile).not.toHaveBeenCalled();
  });

  it("executes exactly one reviewed SDK write and normalizes exact transaction evidence", async () => {
    const prepared = review("sync");
    const services = managerForReview(prepared);
    const receipt = await executeBossLifecycleReview(services, prepared, current(prepared));

    expect(receipt.status).toBe("succeeded");
    expect(services.get).toHaveBeenCalledTimes(1);
    expect(receipt.result?.transactions).toEqual([{ stage: "sync", txHash: HASH("f"), receipt: null }]);
    expect(services.sync).toHaveBeenCalledWith({ account: ADDRESS("2"), subscriptionId: HASH("3") });
    expect(services.sync).toHaveBeenCalledTimes(1);
    expect(services.reconcile).toHaveBeenCalledTimes(1);
    expect(services.topUp).not.toHaveBeenCalled();
  });

  it("passes the reviewed absolute fixed-budget target", async () => {
    const prepared = review("top-up");
    const services = managerForReview(prepared);
    await executeBossLifecycleReview(services, prepared, current(prepared));
    expect(services.topUp).toHaveBeenCalledWith({
      account: ADDRESS("2"),
      subscriptionId: HASH("3"),
      newFixedBudget: 200n,
    });
  });

  it("does not execute or reconcile a stale review", async () => {
    const prepared = review("stop");
    const services = managerForReview(prepared);
    await expect(
      executeBossLifecycleReview(services, prepared, current(prepared, { wallet: ADDRESS("f") })),
    ).rejects.toMatchObject({ code: "STALE_REVIEW" });
    expect(services.stop).not.toHaveBeenCalled();
    expect(services.reconcile).not.toHaveBeenCalled();
  });

  it("rechecks direct BossAccount state before a write and rejects drift without reconciliation", async () => {
    const prepared = review("sync");
    const services = managerForReview(prepared, {
      get: vi.fn(async () => directSnapshotForReview(prepared, { subscription: { state: 3 } })),
    });

    await expect(executeBossLifecycleReview(services, prepared, current(prepared))).rejects.toMatchObject({
      code: "STALE_REVIEW",
    });
    expect(services.get).toHaveBeenCalledTimes(1);
    expect(services.sync).not.toHaveBeenCalled();
    expect(services.reconcile).not.toHaveBeenCalled();
  });

  it("fails closed on malformed transaction evidence and still reconciles once", async () => {
    const prepared = review("sync");
    const services = managerForReview(prepared, {
      sync: vi.fn(async () => ({ stage: "sync", receipt: null })),
    });
    const receipt = await executeBossLifecycleReview(services, prepared, current(prepared));
    expect(receipt.status).toBe("failed");
    expect(receipt.error).toMatch(/invalid transaction evidence/i);
    expect(services.sync).toHaveBeenCalledTimes(1);
    expect(services.reconcile).toHaveBeenCalledTimes(1);
  });

  it("retains exact SDK partial-completion evidence and still reconciles once", async () => {
    const partial = Object.assign(new Error('Filecoin Boss operation failed at stage "pause".'), {
      name: "BossServicesPartialCompletionError",
      failedStage: "pause",
      completed: [evidence("approve-operator", "a")],
      cause: new Error("pause reverted"),
    });
    const prepared = review("pause");
    const services = managerForReview(prepared, { pause: vi.fn(async () => Promise.reject(partial)) });
    const receipt = await executeBossLifecycleReview(services, prepared, current(prepared));
    expect(receipt.status).toBe("partial");
    expect(receipt.error).toContain("pause reverted");
    expect(receipt.result?.failedStage).toBe("pause");
    expect(receipt.result?.transactions).toEqual([{ stage: "approve-operator", txHash: HASH("a"), receipt: null }]);
    expect(services.pause).toHaveBeenCalledTimes(1);
    expect(services.reconcile).toHaveBeenCalledTimes(1);
  });

  it("captures thrown wallet errors without retrying and still attempts reconciliation", async () => {
    const prepared = review("stop");
    const services = managerForReview(prepared, {
      stop: vi.fn(async (_input: BossLifecycleReference) => Promise.reject(new Error("user rejected"))),
    });
    const receipt = await executeBossLifecycleReview(services, prepared, current(prepared));
    expect(receipt).toMatchObject({ status: "failed", error: "user rejected" });
    expect(services.stop).toHaveBeenCalledTimes(1);
    expect(services.reconcile).toHaveBeenCalledTimes(1);
  });

  it("synchronously rejects a duplicate concurrent submission", async () => {
    let release: (result: unknown) => void = () => undefined;
    const sync = vi.fn(
      async (_input: BossLifecycleReference) =>
        new Promise<unknown>((resolve) => {
          release = resolve;
        }),
    );
    const prepared = review("sync");
    const services = managerForReview(prepared, { sync });
    const gate = new BossLifecycleExecutionGate();
    const first = gate.execute(services, prepared, current(prepared));

    await expect(gate.execute(services, prepared, current(prepared))).rejects.toMatchObject({
      code: "ACTION_IN_PROGRESS",
    });
    expect(sync).toHaveBeenCalledTimes(1);

    release(evidence("sync"));
    await first;
  });

  it("serializes BigInt evidence for durable display", () => {
    expect(serializeBossLifecycleEvidence({ railId: 42n, newFixedBudget: 200n })).toContain('"railId": "42"');
  });
});
