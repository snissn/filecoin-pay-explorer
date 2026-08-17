export const SYNAPSE_BOSS_SERVICES_PROVENANCE = {
  repository: "snissn/synapse-sdk",
  branch: "gpt56/tracker-filecoin-boss-sdk",
  commit: "f35aeeb822bb9f95d03a66a51e85ed5f1fdcca02",
} as const;

export const BOSS_LIFECYCLE_REVIEW_MAX_AGE_MS = 5 * 60 * 1_000;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9]\d*)$/;
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const ACTIONS = new Set<BossLifecycleAction>(["sync", "top-up", "pause", "resume", "stop"]);
const STAGES = new Set<BossServicesStage>([
  "deposit",
  "approve-operator",
  "deploy-account",
  "accept-offer",
  "top-up-fixed-budget",
  "acknowledge-activation",
  "activate",
  "sync",
  "claim",
  "top-up",
  "pause",
  "resume",
  "stop",
  "settle",
]);

export type BossLifecycleAction = "sync" | "top-up" | "pause" | "resume" | "stop";
export type BossServicesStage =
  | "deposit"
  | "approve-operator"
  | "deploy-account"
  | "accept-offer"
  | "top-up-fixed-budget"
  | "acknowledge-activation"
  | "activate"
  | "sync"
  | "claim"
  | "top-up"
  | "pause"
  | "resume"
  | "stop"
  | "settle";

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

export interface BossServicesTransactionEvidenceLike {
  stage: BossServicesStage;
  hash: string;
  receipt: unknown;
}

export interface BossServicesManagerLike {
  get(input: BossLifecycleReference): Promise<unknown>;
  reconcile(input: BossLifecycleReference): Promise<unknown>;
  sync(input: BossLifecycleReference): Promise<BossServicesTransactionEvidenceLike>;
  topUp(input: BossLifecycleReference & { newFixedBudget: bigint }): Promise<BossServicesTransactionEvidenceLike>;
  pause(input: BossLifecycleReference): Promise<BossServicesTransactionEvidenceLike>;
  resume(input: BossLifecycleReference): Promise<BossServicesTransactionEvidenceLike>;
  stop(input: BossLifecycleReference): Promise<BossServicesTransactionEvidenceLike>;
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
  newFixedBudget?: bigint;
  createdAtMs: number;
}

export interface BossLifecycleReview {
  readonly schemaVersion: 1;
  readonly action: BossLifecycleAction;
  readonly chainId: number;
  readonly wallet: string;
  readonly account: string;
  readonly subscriptionId: string;
  readonly railId: string;
  readonly newFixedBudget?: bigint;
  readonly createdAtMs: number;
  readonly reviewKey: string;
}

export interface BossLifecycleCurrentContext {
  chainId: number | undefined;
  wallet: string | undefined;
  account: string;
  subscriptionId: string;
  railId: string;
  nowMs?: number;
}

export interface BossLifecycleReviewMismatch {
  field: "chainId" | "wallet" | "account" | "subscriptionId" | "railId";
  reviewed: string;
  current: string;
}

export function prepareBossLifecycleReview(input: PrepareBossLifecycleReviewInput): BossLifecycleReview {
  return Object.freeze(buildReview(input));
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

export interface BossLifecycleTransactionEvidence {
  stage: BossServicesStage;
  txHash: string;
  receiptStatus?: string;
  blockNumber?: string;
}

export interface BossLifecycleManagerResult {
  transactions: readonly BossLifecycleTransactionEvidence[];
  failedStage?: BossServicesStage;
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
  validateReviewIntegrity(review, current.nowMs ?? Date.now());

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
  let status: BossLifecycleExecutionReceipt["status"] = "succeeded";
  let executionError: string | undefined;

  try {
    let transaction: BossServicesTransactionEvidenceLike;
    switch (review.action) {
      case "sync":
        transaction = await manager.sync(reference);
        break;
      case "top-up":
        transaction = await manager.topUp({
          ...reference,
          newFixedBudget: review.newFixedBudget as bigint,
        });
        break;
      case "pause":
        transaction = await manager.pause(reference);
        break;
      case "resume":
        transaction = await manager.resume(reference);
        break;
      case "stop":
        transaction = await manager.stop(reference);
        break;
    }
    result = { transactions: [normalizeTransaction(transaction)] };
  } catch (error) {
    if (isPartialCompletion(error)) {
      try {
        const transactions = error.completed.map(normalizeTransaction);
        status = transactions.length > 0 ? "partial" : "failed";
        result = {
          transactions,
          failedStage: normalizeStage(error.failedStage, "failed stage"),
        };
        executionError = errorMessage(error);
      } catch (evidenceError) {
        status = "failed";
        executionError = `${errorMessage(error)} Invalid completed transaction evidence: ${errorMessage(evidenceError)}`;
      }
    } else {
      status = "failed";
      executionError = errorMessage(error);
    }
  }

  const reconciliation = await reconcileAfterExecution(manager, reference);
  return {
    review,
    status,
    result,
    error: executionError,
    reconciliation,
  };
}

export function serializeBossLifecycleEvidence(value: unknown): string {
  return (
    JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested), 2) ?? "null"
  );
}

function buildReview(input: PrepareBossLifecycleReviewInput): BossLifecycleReview {
  if (!ACTIONS.has(input.action)) {
    throw new BossLifecycleError("INVALID_REVIEW", "Unsupported Boss lifecycle action");
  }
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
    if (input.newFixedBudget === undefined || input.newFixedBudget <= 0n) {
      throw new BossLifecycleError(
        "INVALID_REVIEW",
        "Top-up requires an explicit positive absolute fixed-budget target in token base units",
      );
    }
  } else if (input.newFixedBudget !== undefined) {
    throw new BossLifecycleError("INVALID_REVIEW", `${input.action} must not carry a fixed-budget target`);
  }

  const reviewKey = [
    "boss-lifecycle-review-v1",
    input.action,
    input.chainId.toString(),
    wallet,
    account,
    subscriptionId,
    railId,
    input.newFixedBudget?.toString() ?? "none",
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
    newFixedBudget: input.newFixedBudget,
    createdAtMs: input.createdAtMs,
    reviewKey,
  };
}

function validateReviewIntegrity(review: BossLifecycleReview, nowMs: number): void {
  if (!isRecord(review) || review.schemaVersion !== 1) {
    throw new BossLifecycleError("INVALID_REVIEW", "Unsupported Boss lifecycle review schema");
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new BossLifecycleError("INVALID_REVIEW", "Current review-validation timestamp is invalid");
  }

  const rebuilt = buildReview({
    action: review.action,
    chainId: review.chainId,
    wallet: review.wallet,
    account: review.account,
    subscriptionId: review.subscriptionId,
    railId: review.railId,
    newFixedBudget: review.newFixedBudget,
    createdAtMs: review.createdAtMs,
  });
  if (review.reviewKey !== rebuilt.reviewKey) {
    throw new BossLifecycleError("INVALID_REVIEW", "The review payload changed after confirmation", [
      `expected=${rebuilt.reviewKey}`,
      `received=${review.reviewKey}`,
    ]);
  }

  const age = nowMs - review.createdAtMs;
  if (age < 0 || age > BOSS_LIFECYCLE_REVIEW_MAX_AGE_MS) {
    throw new BossLifecycleError(
      "STALE_REVIEW",
      "The lifecycle review expired; prepare a fresh review before submitting",
      [`ageMs=${age}`, `maximumAgeMs=${BOSS_LIFECYCLE_REVIEW_MAX_AGE_MS}`],
    );
  }
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

function normalizeTransaction(value: BossServicesTransactionEvidenceLike): BossLifecycleTransactionEvidence {
  if (!isRecord(value)) {
    throw new Error("Synapse.services returned malformed transaction evidence");
  }
  const stage = normalizeStage(value.stage, "transaction stage");
  if (typeof value.hash !== "string" || !TRANSACTION_HASH.test(value.hash)) {
    throw new Error("Synapse.services returned an invalid transaction hash");
  }

  const evidence: BossLifecycleTransactionEvidence = {
    stage,
    txHash: value.hash.toLowerCase(),
  };
  if (isRecord(value.receipt)) {
    const status = scalarString(value.receipt.status);
    const blockNumber = scalarString(value.receipt.blockNumber);
    if (status !== undefined) evidence.receiptStatus = status;
    if (blockNumber !== undefined) evidence.blockNumber = blockNumber;
  }
  return evidence;
}

function normalizeStage(value: unknown, label: string): BossServicesStage {
  if (typeof value !== "string" || !STAGES.has(value as BossServicesStage)) {
    throw new Error(`Synapse.services returned an invalid ${label}`);
  }
  return value as BossServicesStage;
}

function isPartialCompletion(value: unknown): value is Error & {
  readonly failedStage: BossServicesStage;
  readonly completed: readonly BossServicesTransactionEvidenceLike[];
} {
  return (
    value instanceof Error &&
    value.name === "BossServicesPartialCompletionError" &&
    isRecord(value) &&
    Array.isArray(value.completed) &&
    typeof value.failedStage === "string"
  );
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value)) return value.toString();
  if (typeof value === "string" && DECIMAL.test(value)) return value;
  return undefined;
}

function compare(
  field: BossLifecycleReviewMismatch["field"],
  reviewed: string,
  current: string,
  mismatches: BossLifecycleReviewMismatch[],
): void {
  if (reviewed !== current) mismatches.push({ field, reviewed, current });
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
  return value !== undefined && ADDRESS.test(value) ? value.toLowerCase() : (value ?? "disconnected");
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
