export const SYNAPSE_BOSS_SERVICES_PROVENANCE = {
  repository: "snissn/synapse-sdk",
  branch: "gpt56/tracker-filecoin-boss-sdk",
  commit: "f35aeeb822bb9f95d03a66a51e85ed5f1fdcca02",
} as const;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9]\d*)$/;

export type BossLifecycleAction = "sync" | "top-up" | "pause" | "resume" | "stop";

export type BossLifecycleErrorCode = "INVALID_REVIEW" | "STALE_REVIEW" | "SDK_UNAVAILABLE";

export class BossLifecycleError extends Error {
  constructor(
    readonly code: BossLifecycleErrorCode,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = "BossLifecycleError";
  }
}

export interface BossLifecycleReference {
  account: string;
  subscriptionId: string;
}

export interface BossLifecycleManagerResult {
  success?: boolean;
  stage?: string;
  transactions?: readonly {
    stage?: string;
    txHash?: string;
  }[];
  error?: {
    code?: string;
    message?: string;
    cause?: unknown;
  };
  reconciliation?: unknown;
  [key: string]: unknown;
}

export interface BossServicesManagerLike {
  get(input: BossLifecycleReference): Promise<unknown>;
  reconcile(input: BossLifecycleReference): Promise<unknown>;
  sync(input: BossLifecycleReference): Promise<BossLifecycleManagerResult>;
  topUp(input: BossLifecycleReference & { amount: bigint }): Promise<BossLifecycleManagerResult>;
  pause(input: BossLifecycleReference): Promise<BossLifecycleManagerResult>;
  resume(input: BossLifecycleReference): Promise<BossLifecycleManagerResult>;
  stop(input: BossLifecycleReference): Promise<BossLifecycleManagerResult>;
}

export type BossServicesResolution =
  | { status: "available"; manager: BossServicesManagerLike }
  | { status: "unavailable"; reason: string };

const REQUIRED_MANAGER_METHODS = ["get", "reconcile", "sync", "topUp", "pause", "resume", "stop"] as const;

export function resolveBossServicesManager(synapse: unknown): BossServicesResolution {
  if (!isRecord(synapse) || !isRecord(synapse.services)) {
    return {
      status: "unavailable",
      reason:
        "The connected @filoz/synapse-sdk package does not expose Synapse.services. The Boss tracker API is not yet present in the published Explorer dependency.",
    };
  }

  const services = synapse.services;
  const missing = REQUIRED_MANAGER_METHODS.filter((method) => typeof services[method] !== "function");
  if (missing.length > 0) {
    return {
      status: "unavailable",
      reason: `Synapse.services is missing required maintained lifecycle methods: ${missing.join(", ")}.`,
    };
  }

  return { status: "available", manager: services as unknown as BossServicesManagerLike };
}

export interface PrepareBossLifecycleReviewInput {
  action: BossLifecycleAction;
  chainId: number;
  wallet: string;
  account: string;
  subscriptionId: string;
  railId: string;
  amount?: bigint;
  createdAtMs: number;
}

export interface BossLifecycleReview {
  schemaVersion: 1;
  action: BossLifecycleAction;
  chainId: number;
  wallet: string;
  account: string;
  subscriptionId: string;
  railId: string;
  amount?: bigint;
  createdAtMs: number;
  reviewKey: string;
}

export interface BossLifecycleCurrentContext {
  chainId: number | undefined;
  wallet: string | undefined;
  account: string;
  subscriptionId: string;
  railId: string;
}

export interface BossLifecycleReviewMismatch {
  field: "chainId" | "wallet" | "account" | "subscriptionId" | "railId";
  reviewed: string;
  current: string;
}

export function prepareBossLifecycleReview(input: PrepareBossLifecycleReviewInput): BossLifecycleReview {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new BossLifecycleError("INVALID_REVIEW", "Chain ID must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.createdAtMs) || input.createdAtMs < 0) {
    throw new BossLifecycleError("INVALID_REVIEW", "Review timestamp must be a non-negative safe integer");
  }

  const wallet = normalizeAddress(input.wallet, "Wallet");
  const account = normalizeAddress(input.account, "Boss account");
  const subscriptionId = normalizeBytes32(input.subscriptionId, "Subscription ID");
  const railId = normalizeDecimal(input.railId, "Rail ID");

  if (input.action === "top-up") {
    if (input.amount === undefined || input.amount <= 0n) {
      throw new BossLifecycleError("INVALID_REVIEW", "Top-up requires an explicit positive token-base-unit amount");
    }
  } else if (input.amount !== undefined) {
    throw new BossLifecycleError("INVALID_REVIEW", `${input.action} must not carry a payment amount`);
  }

  const reviewKey = [
    "boss-lifecycle-review-v1",
    input.action,
    input.chainId.toString(),
    wallet,
    account,
    subscriptionId,
    railId,
    input.amount?.toString() ?? "none",
    input.createdAtMs.toString(),
  ].join(":");

  return {
    schemaVersion: 1,
    action: input.action,
    chainId: input.chainId,
    wallet,
    account,
    subscriptionId,
    railId,
    amount: input.amount,
    createdAtMs: input.createdAtMs,
    reviewKey,
  };
}

export function compareBossLifecycleReview(
  review: BossLifecycleReview,
  current: BossLifecycleCurrentContext,
): BossLifecycleReviewMismatch[] {
  const mismatches: BossLifecycleReviewMismatch[] = [];
  compare("chainId", review.chainId.toString(), current.chainId?.toString() ?? "disconnected", mismatches);
  compare("wallet", review.wallet, normalizeOptionalAddress(current.wallet), mismatches);
  compare("account", review.account, normalizeOptionalAddress(current.account), mismatches);
  compare("subscriptionId", review.subscriptionId, normalizeOptionalBytes32(current.subscriptionId), mismatches);
  compare("railId", review.railId, normalizeOptionalDecimal(current.railId), mismatches);
  return mismatches;
}

export interface BossLifecycleReconciliation {
  status: "succeeded" | "failed";
  value?: unknown;
  error?: string;
}

export interface BossLifecycleExecutionReceipt {
  review: BossLifecycleReview;
  status: "succeeded" | "partial" | "failed";
  result?: BossLifecycleManagerResult;
  error?: string;
  reconciliation: BossLifecycleReconciliation;
}

export async function executeBossLifecycleReview(
  manager: BossServicesManagerLike,
  review: BossLifecycleReview,
  current: BossLifecycleCurrentContext,
): Promise<BossLifecycleExecutionReceipt> {
  const mismatches = compareBossLifecycleReview(review, current);
  if (mismatches.length > 0) {
    throw new BossLifecycleError(
      "STALE_REVIEW",
      "Wallet, chain, account, subscription, or rail changed after review",
      mismatches.map((mismatch) => `${mismatch.field}: reviewed=${mismatch.reviewed}, current=${mismatch.current}`),
    );
  }

  const reference = { account: review.account, subscriptionId: review.subscriptionId };
  let result: BossLifecycleManagerResult | undefined;
  let executionError: string | undefined;

  try {
    switch (review.action) {
      case "sync":
        result = await manager.sync(reference);
        break;
      case "top-up":
        result = await manager.topUp({ ...reference, amount: review.amount as bigint });
        break;
      case "pause":
        result = await manager.pause(reference);
        break;
      case "resume":
        result = await manager.resume(reference);
        break;
      case "stop":
        result = await manager.stop(reference);
        break;
    }
  } catch (error) {
    executionError = errorMessage(error);
  }

  const reconciliation = await reconcileAfterExecution(manager, reference);
  if (executionError !== undefined) {
    return {
      review,
      status: "failed",
      error: executionError,
      reconciliation,
    };
  }

  return {
    review,
    status: result?.success === false ? "partial" : "succeeded",
    result,
    reconciliation,
  };
}

export function serializeBossLifecycleEvidence(value: unknown): string {
  return (
    JSON.stringify(
      value,
      (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested),
      2,
    ) ?? "null"
  );
}

async function reconcileAfterExecution(
  manager: BossServicesManagerLike,
  reference: BossLifecycleReference,
): Promise<BossLifecycleReconciliation> {
  try {
    return { status: "succeeded", value: await manager.reconcile(reference) };
  } catch (error) {
    return { status: "failed", error: errorMessage(error) };
  }
}

function compare(
  field: BossLifecycleReviewMismatch["field"],
  reviewed: string,
  current: string,
  mismatches: BossLifecycleReviewMismatch[],
): void {
  if (reviewed !== current) {
    mismatches.push({ field, reviewed, current });
  }
}

function normalizeAddress(value: string, label: string): string {
  if (!ADDRESS.test(value)) {
    throw new BossLifecycleError("INVALID_REVIEW", `${label} is not a valid EVM address`);
  }
  return value.toLowerCase();
}

function normalizeBytes32(value: string, label: string): string {
  if (!BYTES32.test(value)) {
    throw new BossLifecycleError("INVALID_REVIEW", `${label} is not a valid bytes32 value`);
  }
  return value.toLowerCase();
}

function normalizeDecimal(value: string, label: string): string {
  if (!DECIMAL.test(value)) {
    throw new BossLifecycleError("INVALID_REVIEW", `${label} is not a canonical non-negative decimal integer`);
  }
  return value;
}

function normalizeOptionalAddress(value: string | undefined): string {
  return value !== undefined && ADDRESS.test(value) ? value.toLowerCase() : value ?? "disconnected";
}

function normalizeOptionalBytes32(value: string): string {
  return BYTES32.test(value) ? value.toLowerCase() : value;
}

function normalizeOptionalDecimal(value: string): string {
  return DECIMAL.test(value) ? value : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
