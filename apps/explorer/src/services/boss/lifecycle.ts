import type { Subscription } from "@filecoin-pay/types/boss";
import type { VerifiedBossPayRailAssociation } from "./association";

export const SYNAPSE_BOSS_SERVICES_PROVENANCE = {
  repository: "snissn/synapse-sdk",
  branch: "gpt56/tracker-filecoin-boss-sdk",
  commit: "f35aeeb822bb9f95d03a66a51e85ed5f1fdcca02",
} as const;

export const BOSS_LIFECYCLE_REVIEW_TTL_MS = 5 * 60 * 1_000;
export const BOSS_LIFECYCLE_MAX_INDEX_LAG = 20n;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9]\d*)$/;
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const ASSOCIATION_PROOF_KEY = /^boss-pay-association-v1:\S+:active$/;

export type BossLifecycleAction = "sync" | "top-up" | "pause" | "resume" | "stop";
export type BossLifecycleSubscriptionState = Subscription["state"];
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

const ACTIONS = new Set<BossLifecycleAction>(["sync", "top-up", "pause", "resume", "stop"]);
const SUBSCRIPTION_STATE_BY_CODE: Readonly<Record<number, BossLifecycleSubscriptionState>> = {
  1: "PENDING_ACTIVATION",
  2: "ACTIVE",
  3: "PAUSED",
  4: "TERMINATING",
  5: "ENDED",
  6: "EXHAUSTED",
};

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

export type BossLifecycleErrorCode = "INVALID_REVIEW" | "STALE_REVIEW" | "SDK_UNAVAILABLE" | "ACTION_IN_PROGRESS";

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

export interface BossLifecycleTransactionEvidence {
  stage: BossServicesStage;
  txHash: string;
  receipt: unknown;
  receiptStatus?: string;
  blockNumber?: string;
}

export interface BossLifecycleManagerResult {
  transactions: readonly BossLifecycleTransactionEvidence[];
  failedStage?: BossServicesStage;
  raw: unknown;
}

export interface BossServicesManagerLike {
  get(input: BossLifecycleReference): Promise<unknown>;
  reconcile(input: BossLifecycleReference): Promise<unknown>;
  sync(input: BossLifecycleReference): Promise<unknown>;
  topUp(input: BossLifecycleReference & { newFixedBudget: bigint }): Promise<unknown>;
  pause(input: BossLifecycleReference): Promise<unknown>;
  resume(input: BossLifecycleReference): Promise<unknown>;
  stop(input: BossLifecycleReference): Promise<unknown>;
}

export type BossServicesResolution =
  | { status: "available"; manager: BossServicesManagerLike }
  | { status: "unavailable"; reason: string };

const REQUIRED_MANAGER_METHODS = ["get", "reconcile", "sync", "topUp", "pause", "resume", "stop"] as const;
type RequiredManagerMethod = (typeof REQUIRED_MANAGER_METHODS)[number];

export function resolveBossServicesManager(synapse: unknown): BossServicesResolution {
  if (!isRecord(synapse) || !isRecord(synapse.services)) {
    return {
      status: "unavailable",
      reason:
        "The connected @filoz/synapse-sdk package does not expose Synapse.services. The Boss tracker API is not yet present in the published Explorer dependency.",
    };
  }

  const services = synapse.services;
  const missing = REQUIRED_MANAGER_METHODS.filter(
    (method: RequiredManagerMethod) => typeof services[method] !== "function",
  );
  if (missing.length > 0) {
    return {
      status: "unavailable",
      reason: `Synapse.services is missing required maintained lifecycle methods: ${missing.join(", ")}.`,
    };
  }

  return { status: "available", manager: services as unknown as BossServicesManagerLike };
}

export function createBossAssociationProofKey(association: VerifiedBossPayRailAssociation): string {
  if (!Number.isSafeInteger(association.chainId) || association.chainId <= 0) {
    throw new BossLifecycleError("INVALID_REVIEW", "Verified association chain ID must be a positive safe integer");
  }

  return [
    "boss-pay-association-v1",
    association.chainId.toString(),
    normalizeAddress(association.filecoinPay, "Verified Filecoin Pay authority"),
    normalizeAddress(association.bossAccount, "Verified Boss account"),
    normalizeOpaqueIdentifier(association.subscriptionEntityId, "Verified subscription entity ID"),
    normalizeBytes32(association.subscriptionId, "Verified subscription ID"),
    normalizeDecimal(association.railId, "Verified rail ID"),
    normalizeAddress(association.payer, "Verified payer"),
    normalizeAddress(association.payee, "Verified payee"),
    normalizeAddress(association.operator, "Verified operator"),
    normalizeAddress(association.validator, "Verified validator"),
    normalizeAddress(association.token, "Verified token"),
    association.active ? "active" : "inactive",
  ].join(":");
}

export interface BossLifecycleDirectAuthorityExpectation {
  subscriptionId: string;
  railId: string;
  billingKind: number;
  pauseAllowed: boolean;
  token: string;
  beneficiary: string;
  resourceKey: string;
}

export interface BossLifecycleDirectAuthority {
  subscriptionId: string;
  railId: string;
  subscriptionState: BossLifecycleSubscriptionState;
  billingKind: number;
  pauseAllowed: boolean;
  token: string;
  beneficiary: string;
  resourceKey: string;
  currentFixedBudget: string;
  railAssociationValid: true;
}

/**
 * Normalize one current BossStateView subscription snapshot from Synapse.services.get.
 * The read is authoritative for settlement-driven state and budget, while invariant
 * identity and accepted-term fields must still equal the authenticated A10 index.
 */
export function resolveBossLifecycleDirectAuthority(
  value: unknown,
  expected: BossLifecycleDirectAuthorityExpectation,
): BossLifecycleDirectAuthority {
  if (!isRecord(value) || value.exists !== true || !isRecord(value.subscription)) {
    throw new BossLifecycleError(
      "INVALID_REVIEW",
      "The direct Boss subscription read did not return an existing subscription",
    );
  }
  if (value.railRead !== true || value.railAssociationValid !== true) {
    throw new BossLifecycleError(
      "INVALID_REVIEW",
      "The direct Boss subscription read did not prove the current Filecoin Pay rail association",
    );
  }

  const subscriptionId = normalizeBytes32(
    asString(value.subscriptionId, "Direct subscription ID"),
    "Direct subscription ID",
  );
  const expectedSubscriptionId = normalizeBytes32(expected.subscriptionId, "Indexed subscription ID");
  requireDirectMatch("subscription ID", subscriptionId, expectedSubscriptionId);

  const subscription = value.subscription;
  const railId = normalizeUnknownDecimal(subscription.railId, "Direct rail ID");
  const expectedRailId = normalizeDecimal(expected.railId, "Indexed rail ID");
  requireDirectMatch("rail ID", railId, expectedRailId);

  const stateCode = normalizeUnknownSafeInteger(subscription.state, "Direct subscription state");
  const subscriptionState = SUBSCRIPTION_STATE_BY_CODE[stateCode];
  if (subscriptionState === undefined) {
    throw new BossLifecycleError(
      "INVALID_REVIEW",
      `The direct Boss subscription state code ${stateCode} is unsupported`,
    );
  }

  const billingKind = normalizeUnknownSafeInteger(subscription.billingKind, "Direct billing kind");
  if (!Number.isSafeInteger(expected.billingKind) || expected.billingKind < 0) {
    throw new BossLifecycleError("INVALID_REVIEW", "Indexed billing kind is invalid");
  }
  requireDirectMatch("billing kind", billingKind.toString(), expected.billingKind.toString());

  if (typeof subscription.pauseAllowed !== "boolean" || typeof expected.pauseAllowed !== "boolean") {
    throw new BossLifecycleError("INVALID_REVIEW", "Direct or indexed pause authority is invalid");
  }
  requireDirectMatch("pause authority", String(subscription.pauseAllowed), String(expected.pauseAllowed));

  const token = normalizeAddress(asString(subscription.token, "Direct payment token"), "Direct payment token");
  const beneficiary = normalizeAddress(asString(subscription.beneficiary, "Direct beneficiary"), "Direct beneficiary");
  const resourceKey = normalizeBytes32(
    asString(subscription.resourceKey, "Direct resource key"),
    "Direct resource key",
  );
  requireDirectMatch("payment token", token, normalizeAddress(expected.token, "Indexed payment token"));
  requireDirectMatch("beneficiary", beneficiary, normalizeAddress(expected.beneficiary, "Indexed beneficiary"));
  requireDirectMatch("resource key", resourceKey, normalizeBytes32(expected.resourceKey, "Indexed resource key"));

  return {
    subscriptionId,
    railId,
    subscriptionState,
    billingKind,
    pauseAllowed: subscription.pauseAllowed,
    token,
    beneficiary,
    resourceKey,
    currentFixedBudget: normalizeUnknownDecimal(subscription.currentFixedBudget, "Direct current fixed budget"),
    railAssociationValid: true,
  };
}

export interface PrepareBossLifecycleReviewInput {
  action: BossLifecycleAction;
  chainId: number;
  wallet: string;
  account: string;
  subscriptionId: string;
  railId: string;
  subscriptionState: BossLifecycleSubscriptionState;
  billingKind: number;
  pauseAllowed: boolean;
  requiresAccountRead: boolean;
  directReadVerified: boolean;
  token: string;
  beneficiary: string;
  resourceKey: string;
  associationProofKey: string;
  indexDeployment: string;
  indexedBlock: bigint;
  observedBlock: bigint;
  currentFixedBudget: string;
  newFixedBudget?: bigint;
  createdAtMs: number;
}

export interface BossLifecycleReview {
  readonly schemaVersion: 4;
  readonly action: BossLifecycleAction;
  readonly chainId: number;
  readonly wallet: string;
  readonly account: string;
  readonly subscriptionId: string;
  readonly railId: string;
  readonly subscriptionState: BossLifecycleSubscriptionState;
  readonly billingKind: number;
  readonly pauseAllowed: boolean;
  readonly requiresAccountRead: boolean;
  readonly directReadVerified: true;
  readonly token: string;
  readonly beneficiary: string;
  readonly resourceKey: string;
  readonly associationProofKey: string;
  readonly indexDeployment: string;
  readonly indexedBlock: bigint;
  readonly observedBlock: bigint;
  readonly maximumIndexLag: bigint;
  readonly currentFixedBudget: bigint;
  readonly newFixedBudget?: bigint;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly reviewKey: string;
}

export interface BossLifecycleCurrentContext {
  chainId: number | undefined;
  wallet: string | undefined;
  account: string;
  subscriptionId: string;
  railId: string;
  subscriptionState: BossLifecycleSubscriptionState;
  billingKind: number;
  pauseAllowed: boolean;
  requiresAccountRead: boolean;
  directReadVerified: boolean;
  token: string;
  beneficiary: string;
  resourceKey: string;
  associationProofKey: string;
  indexDeployment: string | undefined;
  indexedBlock: bigint | undefined;
  observedBlock: bigint | undefined;
  currentFixedBudget: string;
  nowMs: number;
}

export type BossLifecycleReviewMismatchField =
  | "chainId"
  | "wallet"
  | "account"
  | "subscriptionId"
  | "railId"
  | "subscriptionState"
  | "billingKind"
  | "pauseAllowed"
  | "requiresAccountRead"
  | "directRead"
  | "token"
  | "beneficiary"
  | "resourceKey"
  | "associationProof"
  | "indexDeployment"
  | "indexRegression"
  | "indexLag"
  | "fixedBudget"
  | "age";

export interface BossLifecycleReviewMismatch {
  field: BossLifecycleReviewMismatchField;
  reviewed: string;
  current: string;
}

export function isBossLifecycleActionAvailable(
  action: BossLifecycleAction,
  state: BossLifecycleSubscriptionState,
  billingKind: number,
  pauseAllowed: boolean,
): boolean {
  switch (action) {
    case "sync":
      return billingKind === 1 && ["PENDING_ACTIVATION", "ACTIVE", "PAUSED"].includes(state);
    case "top-up":
      return billingKind === 2 && ["PENDING_ACTIVATION", "ACTIVE", "PAUSED", "EXHAUSTED"].includes(state);
    case "pause":
      return pauseAllowed && state === "ACTIVE";
    case "resume":
      return pauseAllowed && state === "PAUSED";
    case "stop":
      return ["PENDING_ACTIVATION", "ACTIVE", "PAUSED", "EXHAUSTED"].includes(state);
  }
}

export function isBossLifecycleIndexFresh(
  indexDeployment: string | undefined,
  indexedBlock: bigint | undefined,
  observedBlock: bigint | undefined,
  maximumLag: bigint = BOSS_LIFECYCLE_MAX_INDEX_LAG,
): boolean {
  return (
    indexDeployment !== undefined &&
    indexDeployment.trim().length > 0 &&
    indexedBlock !== undefined &&
    observedBlock !== undefined &&
    indexedBlock >= 0n &&
    observedBlock >= indexedBlock &&
    maximumLag >= 0n &&
    observedBlock - indexedBlock <= maximumLag
  );
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
  compare("subscriptionState", review.subscriptionState, current.subscriptionState, mismatches);
  compare("billingKind", review.billingKind.toString(), normalizeOptionalSafeInteger(current.billingKind), mismatches);
  compare("pauseAllowed", String(review.pauseAllowed), String(current.pauseAllowed), mismatches);
  compare("requiresAccountRead", String(review.requiresAccountRead), String(current.requiresAccountRead), mismatches);
  compare("directRead", "verified", current.directReadVerified ? "verified" : "unverified", mismatches);
  compare("token", review.token, normalizeOptionalAddress(current.token), mismatches);
  compare("beneficiary", review.beneficiary, normalizeOptionalAddress(current.beneficiary), mismatches);
  compare("resourceKey", review.resourceKey, normalizeOptionalBytes32(current.resourceKey), mismatches);
  compare("associationProof", review.associationProofKey, current.associationProofKey, mismatches);
  compare("indexDeployment", review.indexDeployment, current.indexDeployment ?? "unavailable", mismatches);
  compare(
    "fixedBudget",
    review.currentFixedBudget.toString(),
    normalizeOptionalBigIntDecimal(current.currentFixedBudget),
    mismatches,
  );

  if (current.indexedBlock === undefined || current.observedBlock === undefined) {
    mismatches.push({
      field: "indexLag",
      reviewed: `indexed=${review.indexedBlock}, observed=${review.observedBlock}`,
      current: "unavailable",
    });
  } else {
    if (current.indexedBlock < review.indexedBlock || current.observedBlock < review.observedBlock) {
      mismatches.push({
        field: "indexRegression",
        reviewed: `indexed>=${review.indexedBlock}, observed>=${review.observedBlock}`,
        current: `indexed=${current.indexedBlock}, observed=${current.observedBlock}`,
      });
    }
    if (
      !isBossLifecycleIndexFresh(
        current.indexDeployment,
        current.indexedBlock,
        current.observedBlock,
        review.maximumIndexLag,
      )
    ) {
      mismatches.push({
        field: "indexLag",
        reviewed: `maximum lag ${review.maximumIndexLag}`,
        current: `indexed=${current.indexedBlock}, observed=${current.observedBlock}`,
      });
    }
  }

  const age = current.nowMs - review.createdAtMs;
  if (!Number.isSafeInteger(current.nowMs) || age < 0 || current.nowMs > review.expiresAtMs) {
    mismatches.push({
      field: "age",
      reviewed: `expires=${review.expiresAtMs}`,
      current: `now=${current.nowMs}`,
    });
  }

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
  validateReviewIntegrity(review, current.nowMs);

  const mismatches = compareBossLifecycleReview(review, current);
  if (mismatches.length > 0) {
    throw new BossLifecycleError(
      "STALE_REVIEW",
      "Wallet, chain, subscription authority, association proof, or index state changed after review",
      mismatches.map((mismatch) => `${mismatch.field}: reviewed=${mismatch.reviewed}, current=${mismatch.current}`),
    );
  }

  const reference = { account: review.account, subscriptionId: review.subscriptionId };
  let directAuthority: BossLifecycleDirectAuthority;
  try {
    directAuthority = resolveBossLifecycleDirectAuthority(await manager.get(reference), {
      subscriptionId: review.subscriptionId,
      railId: review.railId,
      billingKind: review.billingKind,
      pauseAllowed: review.pauseAllowed,
      token: review.token,
      beneficiary: review.beneficiary,
      resourceKey: review.resourceKey,
    });
  } catch (error) {
    throw new BossLifecycleError(
      "STALE_REVIEW",
      "Current BossAccount authority could not be revalidated before execution",
      [errorMessage(error)],
    );
  }
  const directMismatches: string[] = [];
  if (directAuthority.subscriptionState !== review.subscriptionState) {
    directMismatches.push(
      `subscriptionState: reviewed=${review.subscriptionState}, current=${directAuthority.subscriptionState}`,
    );
  }
  if (directAuthority.currentFixedBudget !== review.currentFixedBudget.toString()) {
    directMismatches.push(
      `fixedBudget: reviewed=${review.currentFixedBudget}, current=${directAuthority.currentFixedBudget}`,
    );
  }
  if (directMismatches.length > 0) {
    throw new BossLifecycleError(
      "STALE_REVIEW",
      "Current BossAccount state or budget changed after review",
      directMismatches,
    );
  }

  let rawResult: unknown;
  let executionError: string | undefined;
  let partialCompletion: BossLifecyclePartialCompletion | undefined;

  try {
    switch (review.action) {
      case "sync":
        rawResult = await manager.sync(reference);
        break;
      case "top-up":
        rawResult = await manager.topUp({ ...reference, newFixedBudget: review.newFixedBudget as bigint });
        break;
      case "pause":
        rawResult = await manager.pause(reference);
        break;
      case "resume":
        rawResult = await manager.resume(reference);
        break;
      case "stop":
        rawResult = await manager.stop(reference);
        break;
    }
  } catch (error) {
    try {
      partialCompletion = normalizePartialCompletion(error);
      if (partialCompletion === undefined) {
        executionError = errorMessage(error);
      }
    } catch (evidenceError) {
      executionError = `${errorMessage(error)} Invalid partial-completion evidence: ${errorMessage(evidenceError)}`;
    }
  }

  const reconciliation = await reconcileAfterExecution(manager, reference);
  if (partialCompletion !== undefined) {
    return {
      review,
      status: partialCompletion.completed.length > 0 ? "partial" : "failed",
      result: {
        failedStage: partialCompletion.failedStage,
        transactions: partialCompletion.completed,
        raw: partialCompletion.raw,
      },
      error: partialCompletion.message,
      reconciliation,
    };
  }
  if (executionError !== undefined) {
    return { review, status: "failed", error: executionError, reconciliation };
  }

  try {
    const result = normalizeManagerResult(rawResult);
    return {
      review,
      status: isRecord(rawResult) && rawResult.success === false ? "partial" : "succeeded",
      result,
      reconciliation,
    };
  } catch (evidenceError) {
    return {
      review,
      status: "failed",
      error: `Synapse.services returned invalid transaction evidence: ${errorMessage(evidenceError)}`,
      reconciliation,
    };
  }
}

export class BossLifecycleExecutionGate {
  private activeReviewKey: string | null = null;

  async execute(
    manager: BossServicesManagerLike,
    review: BossLifecycleReview,
    current: BossLifecycleCurrentContext,
  ): Promise<BossLifecycleExecutionReceipt> {
    if (this.activeReviewKey !== null) {
      throw new BossLifecycleError(
        "ACTION_IN_PROGRESS",
        `Boss lifecycle action ${this.activeReviewKey} is already in progress`,
      );
    }

    this.activeReviewKey = review.reviewKey;
    try {
      return await executeBossLifecycleReview(manager, review, current);
    } finally {
      this.activeReviewKey = null;
    }
  }
}

export function serializeBossLifecycleEvidence(value: unknown): string {
  return (
    JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested), 2) ?? "null"
  );
}

interface BossLifecyclePartialCompletion {
  failedStage: BossServicesStage;
  completed: readonly BossLifecycleTransactionEvidence[];
  message: string;
  raw: Record<string, unknown>;
}

function buildReview(input: PrepareBossLifecycleReviewInput): BossLifecycleReview {
  if (!ACTIONS.has(input.action)) {
    throw new BossLifecycleError("INVALID_REVIEW", "Unsupported Boss lifecycle action");
  }
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new BossLifecycleError("INVALID_REVIEW", "Chain ID must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.billingKind) || input.billingKind < 0) {
    throw new BossLifecycleError("INVALID_REVIEW", "Billing kind must be a non-negative safe integer");
  }
  if (typeof input.pauseAllowed !== "boolean") {
    throw new BossLifecycleError("INVALID_REVIEW", "Pause authority must be boolean");
  }
  if (typeof input.requiresAccountRead !== "boolean") {
    throw new BossLifecycleError("INVALID_REVIEW", "Indexed current-state authority flag must be boolean");
  }
  if (input.directReadVerified !== true) {
    throw new BossLifecycleError(
      "INVALID_REVIEW",
      "A current direct BossAccount subscription read is required before lifecycle review",
    );
  }
  if (!Number.isSafeInteger(input.createdAtMs) || input.createdAtMs < 0) {
    throw new BossLifecycleError("INVALID_REVIEW", "Review timestamp must be a non-negative safe integer");
  }
  if (!isBossLifecycleActionAvailable(input.action, input.subscriptionState, input.billingKind, input.pauseAllowed)) {
    throw new BossLifecycleError(
      "INVALID_REVIEW",
      `${input.action} is not available for billing kind ${input.billingKind} from state ${input.subscriptionState}`,
    );
  }
  if (
    !isBossLifecycleIndexFresh(
      input.indexDeployment,
      input.indexedBlock,
      input.observedBlock,
      BOSS_LIFECYCLE_MAX_INDEX_LAG,
    )
  ) {
    throw new BossLifecycleError(
      "INVALID_REVIEW",
      `Boss index must be authenticated and within ${BOSS_LIFECYCLE_MAX_INDEX_LAG} blocks before review`,
    );
  }

  const wallet = normalizeAddress(input.wallet, "Wallet");
  const account = normalizeAddress(input.account, "Boss account");
  const subscriptionId = normalizeBytes32(input.subscriptionId, "Subscription ID");
  const railId = normalizeDecimal(input.railId, "Rail ID");
  const token = normalizeAddress(input.token, "Payment token");
  const beneficiary = normalizeAddress(input.beneficiary, "Beneficiary");
  const resourceKey = normalizeBytes32(input.resourceKey, "Resource key");
  const associationProofKey = normalizeAssociationProofKey(input.associationProofKey);
  const indexDeployment = normalizeOpaqueIdentifier(input.indexDeployment, "Boss index deployment");
  const currentFixedBudget = normalizeBigIntDecimal(input.currentFixedBudget, "Current fixed budget");

  if (input.action === "top-up") {
    if (input.newFixedBudget === undefined || input.newFixedBudget <= currentFixedBudget) {
      throw new BossLifecycleError(
        "INVALID_REVIEW",
        "Top-up requires an explicit new fixed-budget target greater than the current fixed budget",
      );
    }
  } else if (input.newFixedBudget !== undefined) {
    throw new BossLifecycleError("INVALID_REVIEW", `${input.action} must not carry a fixed-budget target`);
  }

  const expiresAtMs = input.createdAtMs + BOSS_LIFECYCLE_REVIEW_TTL_MS;
  if (!Number.isSafeInteger(expiresAtMs)) {
    throw new BossLifecycleError("INVALID_REVIEW", "Review expiry exceeds the safe timestamp range");
  }

  const reviewKey = [
    "boss-lifecycle-review-v4",
    input.action,
    input.chainId.toString(),
    wallet,
    account,
    subscriptionId,
    railId,
    input.subscriptionState,
    input.billingKind.toString(),
    input.pauseAllowed ? "pause-allowed" : "pause-disallowed",
    input.requiresAccountRead ? "account-read-required" : "event-stream-current",
    "direct-read-verified",
    token,
    beneficiary,
    resourceKey,
    associationProofKey,
    indexDeployment,
    input.indexedBlock.toString(),
    input.observedBlock.toString(),
    currentFixedBudget.toString(),
    input.newFixedBudget?.toString() ?? "none",
    input.createdAtMs.toString(),
  ].join(":");

  return {
    schemaVersion: 4,
    action: input.action,
    chainId: input.chainId,
    wallet,
    account,
    subscriptionId,
    railId,
    subscriptionState: input.subscriptionState,
    billingKind: input.billingKind,
    pauseAllowed: input.pauseAllowed,
    requiresAccountRead: input.requiresAccountRead,
    directReadVerified: true,
    token,
    beneficiary,
    resourceKey,
    associationProofKey,
    indexDeployment,
    indexedBlock: input.indexedBlock,
    observedBlock: input.observedBlock,
    maximumIndexLag: BOSS_LIFECYCLE_MAX_INDEX_LAG,
    currentFixedBudget,
    newFixedBudget: input.newFixedBudget,
    createdAtMs: input.createdAtMs,
    expiresAtMs,
    reviewKey,
  };
}

function validateReviewIntegrity(review: BossLifecycleReview, nowMs: number): void {
  if (!isRecord(review) || review.schemaVersion !== 4) {
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
    subscriptionState: review.subscriptionState,
    billingKind: review.billingKind,
    pauseAllowed: review.pauseAllowed,
    requiresAccountRead: review.requiresAccountRead,
    directReadVerified: review.directReadVerified,
    token: review.token,
    beneficiary: review.beneficiary,
    resourceKey: review.resourceKey,
    associationProofKey: review.associationProofKey,
    indexDeployment: review.indexDeployment,
    indexedBlock: review.indexedBlock,
    observedBlock: review.observedBlock,
    currentFixedBudget: review.currentFixedBudget.toString(),
    newFixedBudget: review.newFixedBudget,
    createdAtMs: review.createdAtMs,
  });

  const changed =
    review.reviewKey !== rebuilt.reviewKey ||
    review.expiresAtMs !== rebuilt.expiresAtMs ||
    review.maximumIndexLag !== rebuilt.maximumIndexLag ||
    review.wallet !== rebuilt.wallet ||
    review.account !== rebuilt.account ||
    review.subscriptionId !== rebuilt.subscriptionId ||
    review.requiresAccountRead !== rebuilt.requiresAccountRead ||
    review.directReadVerified !== rebuilt.directReadVerified ||
    review.token !== rebuilt.token ||
    review.beneficiary !== rebuilt.beneficiary ||
    review.resourceKey !== rebuilt.resourceKey ||
    review.associationProofKey !== rebuilt.associationProofKey ||
    review.indexDeployment !== rebuilt.indexDeployment ||
    review.currentFixedBudget !== rebuilt.currentFixedBudget;
  if (changed) {
    throw new BossLifecycleError("INVALID_REVIEW", "The lifecycle review payload changed after confirmation", [
      `expected=${rebuilt.reviewKey}`,
      `received=${review.reviewKey}`,
    ]);
  }

  const age = nowMs - review.createdAtMs;
  if (age < 0 || nowMs > review.expiresAtMs) {
    throw new BossLifecycleError(
      "STALE_REVIEW",
      "The lifecycle review expired; prepare a fresh review before submitting",
      [`ageMs=${age}`, `expiresAtMs=${review.expiresAtMs}`],
    );
  }
}

function normalizeManagerResult(value: unknown): BossLifecycleManagerResult {
  const source = isRecord(value)
    ? Array.isArray(value.transactions)
      ? value.transactions
      : Array.isArray(value.completed)
        ? value.completed
        : [value]
    : [value];
  const transactions = source.map((entry) => normalizeTransaction(entry));
  if (transactions.length === 0) {
    throw new Error("No transaction evidence was returned");
  }
  const failedStage =
    isRecord(value) && value.failedStage !== undefined ? normalizeStage(value.failedStage, "failed stage") : undefined;
  return { transactions, failedStage, raw: value };
}

function normalizePartialCompletion(error: unknown): BossLifecyclePartialCompletion | undefined {
  if (!isRecord(error) || error.name !== "BossServicesPartialCompletionError" || !Array.isArray(error.completed)) {
    return undefined;
  }

  const failedStage = normalizeStage(error.failedStage, "failed stage");
  const completed = error.completed.map((entry) => normalizeTransaction(entry));
  const baseMessage = error instanceof Error ? error.message : "Filecoin Boss operation partially completed";
  const cause = "cause" in error && error.cause !== undefined ? errorMessage(error.cause) : undefined;
  const message = cause !== undefined && cause !== baseMessage ? `${baseMessage}: ${cause}` : baseMessage;
  return {
    failedStage,
    completed,
    message,
    raw: {
      name: error.name,
      failedStage,
      message: baseMessage,
      cause,
    },
  };
}

function normalizeTransaction(value: unknown): BossLifecycleTransactionEvidence {
  if (!isRecord(value)) {
    throw new Error("Transaction evidence must be an object");
  }
  const stage = normalizeStage(value.stage, "transaction stage");
  const rawHash =
    typeof value.hash === "string" ? value.hash : typeof value.txHash === "string" ? value.txHash : undefined;
  if (rawHash === undefined || !TRANSACTION_HASH.test(rawHash)) {
    throw new Error("Transaction evidence contains an invalid transaction hash");
  }
  if (!("receipt" in value)) {
    throw new Error("Transaction evidence is missing its receipt field");
  }

  const evidence: BossLifecycleTransactionEvidence = {
    stage,
    txHash: rawHash.toLowerCase(),
    receipt: value.receipt,
  };
  if (isRecord(value.receipt)) {
    const receiptStatus = scalarString(value.receipt.status);
    const blockNumber = scalarString(value.receipt.blockNumber);
    if (receiptStatus !== undefined) evidence.receiptStatus = receiptStatus;
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
  field: BossLifecycleReviewMismatchField,
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

function normalizeBigIntDecimal(value: string, label: string): bigint {
  return BigInt(normalizeDecimal(value, label));
}

function normalizeAssociationProofKey(value: string): string {
  if (!ASSOCIATION_PROOF_KEY.test(value)) {
    throw new BossLifecycleError("INVALID_REVIEW", "An exact active D2 association proof key is required");
  }
  return value;
}

function normalizeOpaqueIdentifier(value: string, label: string): string {
  if (value.trim().length === 0 || /\s/.test(value)) {
    throw new BossLifecycleError("INVALID_REVIEW", `${label} must be a non-empty identifier without whitespace`);
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

function normalizeOptionalBigIntDecimal(value: string): string {
  return DECIMAL.test(value) ? BigInt(value).toString() : value;
}

function normalizeOptionalSafeInteger(value: number): string {
  return Number.isSafeInteger(value) && value >= 0 ? value.toString() : String(value);
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value)) return value.toString();
  if (typeof value === "string") return value;
  return undefined;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new BossLifecycleError("INVALID_REVIEW", `${label} must be a string`);
  }
  return value;
}

function normalizeUnknownSafeInteger(value: unknown, label: string): number {
  const normalized = typeof value === "bigint" ? Number(value) : value;
  if (typeof normalized !== "number" || !Number.isSafeInteger(normalized) || normalized < 0) {
    throw new BossLifecycleError("INVALID_REVIEW", `${label} must be a non-negative safe integer`);
  }
  return normalized;
}

function normalizeUnknownDecimal(value: unknown, label: string): string {
  if (typeof value === "bigint") {
    if (value < 0n) throw new BossLifecycleError("INVALID_REVIEW", `${label} cannot be negative`);
    return value.toString();
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new BossLifecycleError("INVALID_REVIEW", `${label} must be a non-negative safe integer`);
    }
    return value.toString();
  }
  if (typeof value === "string") return normalizeDecimal(value, label);
  throw new BossLifecycleError("INVALID_REVIEW", `${label} must be a canonical non-negative integer`);
}

function requireDirectMatch(label: string, direct: string, indexed: string): void {
  if (direct !== indexed) {
    throw new BossLifecycleError("STALE_REVIEW", `Direct BossAccount ${label} does not match the authenticated index`, [
      `direct=${direct}`,
      `indexed=${indexed}`,
    ]);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
