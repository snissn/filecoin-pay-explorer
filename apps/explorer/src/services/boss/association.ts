import type { RailSubscription, Subscription } from "@filecoin-pay/types/boss";
import type { BossDeploymentManifest } from "./config";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9]\d*)$/;

export type BossPayAssociationField =
  | "chainId"
  | "filecoinPay"
  | "bossAccount"
  | "subscriptionId"
  | "railId"
  | "payer"
  | "payee"
  | "operator"
  | "token"
  | "validator";

export interface PayRailAssociationFacts {
  railId: string;
  payer: { address: string } | null | undefined;
  payee: { address: string } | null | undefined;
  operator: { address: string } | null | undefined;
  validator: string | null | undefined;
  token: { address: string } | null | undefined;
}

export interface BossPayAssociationMismatch {
  field: BossPayAssociationField;
  leftLabel: string;
  left: string;
  rightLabel: string;
  right: string;
}

export interface VerifiedBossPayRailAssociation {
  chainId: number;
  filecoinPay: string;
  bossAccount: string;
  subscriptionEntityId: string;
  subscriptionId: string;
  railId: string;
  payer: string;
  payee: string;
  operator: string;
  validator: string;
  token: string;
  active: boolean;
}

export type BossPayAssociationResult =
  | { status: "matched"; association: VerifiedBossPayRailAssociation }
  | { status: "mismatched"; mismatches: BossPayAssociationMismatch[] }
  | { status: "unverifiable"; reasons: string[] };

export interface VerifyBossPayRailAssociationInput {
  routeChainId: number;
  trustedFilecoinPay: string;
  manifest: BossDeploymentManifest;
  bossAssociation: RailSubscription;
  bossSubscription: Subscription;
  payRail: PayRailAssociationFacts;
}

export function verifyBossPayRailAssociation(input: VerifyBossPayRailAssociationInput): BossPayAssociationResult {
  const reasons: string[] = [];
  const routeChainId = normalizeDecimal(input.routeChainId.toString(), "route chain ID", reasons);
  const manifestChainId = normalizeDecimal(input.manifest.chainId.toString(), "manifest chain ID", reasons);
  const associationChainId = normalizeDecimal(input.bossAssociation.chainId, "Boss association chain ID", reasons);
  const subscriptionChainId = normalizeDecimal(input.bossSubscription.chainId, "Boss subscription chain ID", reasons);
  const trustedFilecoinPay = normalizeAddress(input.trustedFilecoinPay, "trusted Filecoin Pay address", reasons);
  const manifestFilecoinPay = normalizeAddress(
    input.manifest.dependencies.filecoinPay,
    "manifest Filecoin Pay address",
    reasons,
  );
  const associationFilecoinPay = normalizeAddress(
    input.bossAssociation.filecoinPay,
    "Boss association Filecoin Pay address",
    reasons,
  );
  const associationBossAccount = normalizeAddress(
    input.bossAssociation.bossAccount,
    "Boss association account",
    reasons,
  );
  const subscriptionBossAccount = normalizeAddress(
    input.bossSubscription.accountAddress,
    "Boss subscription account",
    reasons,
  );
  const associationSubscriptionId = normalizeBytes32(
    input.bossAssociation.subscriptionId,
    "Boss association subscription ID",
    reasons,
  );
  const subscriptionSubscriptionId = normalizeBytes32(
    input.bossSubscription.subscriptionId,
    "Boss subscription protocol ID",
    reasons,
  );
  const associationRailId = normalizeDecimal(input.bossAssociation.railId, "Boss association rail ID", reasons);
  const subscriptionRailId = normalizeDecimal(input.bossSubscription.railId, "Boss subscription rail ID", reasons);
  const payRailId = normalizeDecimal(input.payRail.railId, "Filecoin Pay rail ID", reasons);
  const associationPayer = normalizeAddress(input.bossAssociation.payer, "Boss association payer", reasons);
  const payPayer = normalizeAddress(input.payRail.payer?.address, "Filecoin Pay payer", reasons);
  const associationPayee = normalizeAddress(input.bossAssociation.payee, "Boss association payee", reasons);
  const subscriptionBeneficiary = normalizeAddress(
    input.bossSubscription.beneficiary,
    "Boss subscription beneficiary",
    reasons,
  );
  const payPayee = normalizeAddress(input.payRail.payee?.address, "Filecoin Pay payee", reasons);
  const associationOperator = normalizeAddress(input.bossAssociation.operator, "Boss association operator", reasons);
  const payOperator = normalizeAddress(input.payRail.operator?.address, "Filecoin Pay operator", reasons);
  const manifestToken = normalizeAddress(input.manifest.dependencies.token, "manifest payment token", reasons);
  const associationToken = normalizeAddress(input.bossAssociation.token, "Boss association payment token", reasons);
  const subscriptionToken = normalizeAddress(input.bossSubscription.token, "Boss subscription payment token", reasons);
  const payToken = normalizeAddress(input.payRail.token?.address, "Filecoin Pay payment token", reasons);
  const payValidator = normalizeAddress(input.payRail.validator, "Filecoin Pay validator", reasons);

  if (reasons.length > 0) return { status: "unverifiable", reasons };

  const mismatches: BossPayAssociationMismatch[] = [];
  compare("chainId", "route chain ID", routeChainId, "manifest chain ID", manifestChainId, mismatches);
  compare("chainId", "route chain ID", routeChainId, "Boss association chain ID", associationChainId, mismatches);
  compare("chainId", "route chain ID", routeChainId, "Boss subscription chain ID", subscriptionChainId, mismatches);
  compare(
    "filecoinPay",
    "trusted Filecoin Pay",
    trustedFilecoinPay,
    "manifest Filecoin Pay",
    manifestFilecoinPay,
    mismatches,
  );
  compare(
    "filecoinPay",
    "manifest Filecoin Pay",
    manifestFilecoinPay,
    "Boss association Filecoin Pay",
    associationFilecoinPay,
    mismatches,
  );
  compare(
    "bossAccount",
    "Boss association account",
    associationBossAccount,
    "Boss subscription account",
    subscriptionBossAccount,
    mismatches,
  );
  compare(
    "subscriptionId",
    "Boss association subscription ID",
    associationSubscriptionId,
    "Boss subscription protocol ID",
    subscriptionSubscriptionId,
    mismatches,
  );
  compare(
    "railId",
    "Boss association rail ID",
    associationRailId,
    "Boss subscription rail ID",
    subscriptionRailId,
    mismatches,
  );
  compare("railId", "Boss association rail ID", associationRailId, "Filecoin Pay rail ID", payRailId, mismatches);
  compare("payer", "Boss association payer", associationPayer, "Filecoin Pay payer", payPayer, mismatches);
  compare(
    "payee",
    "Boss association payee",
    associationPayee,
    "Boss subscription beneficiary",
    subscriptionBeneficiary,
    mismatches,
  );
  compare("payee", "Boss association payee", associationPayee, "Filecoin Pay payee", payPayee, mismatches);
  compare(
    "operator",
    "Boss association account",
    associationBossAccount,
    "Boss association operator",
    associationOperator,
    mismatches,
  );
  compare(
    "operator",
    "Boss association operator",
    associationOperator,
    "Filecoin Pay operator",
    payOperator,
    mismatches,
  );
  compare("validator", "Boss account", associationBossAccount, "Filecoin Pay validator", payValidator, mismatches);
  compare(
    "token",
    "manifest payment token",
    manifestToken,
    "Boss association payment token",
    associationToken,
    mismatches,
  );
  compare(
    "token",
    "Boss association payment token",
    associationToken,
    "Boss subscription payment token",
    subscriptionToken,
    mismatches,
  );
  compare(
    "token",
    "Boss association payment token",
    associationToken,
    "Filecoin Pay payment token",
    payToken,
    mismatches,
  );

  if (mismatches.length > 0) return { status: "mismatched", mismatches };

  return {
    status: "matched",
    association: {
      chainId: Number(routeChainId),
      filecoinPay: manifestFilecoinPay,
      bossAccount: associationBossAccount,
      subscriptionEntityId: input.bossSubscription.id,
      subscriptionId: associationSubscriptionId,
      railId: associationRailId,
      payer: associationPayer,
      payee: associationPayee,
      operator: associationOperator,
      validator: payValidator,
      token: associationToken,
      active: input.bossAssociation.active,
    },
  };
}

function compare(
  field: BossPayAssociationField,
  leftLabel: string,
  left: string,
  rightLabel: string,
  right: string,
  mismatches: BossPayAssociationMismatch[],
): void {
  if (left !== right) mismatches.push({ field, leftLabel, left, rightLabel, right });
}

function normalizeAddress(value: unknown, label: string, reasons: string[]): string {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    reasons.push(`${label} is not a valid EVM address`);
    return "";
  }
  return value.toLowerCase();
}

function normalizeBytes32(value: unknown, label: string, reasons: string[]): string {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    reasons.push(`${label} is not a valid bytes32 value`);
    return "";
  }
  return value.toLowerCase();
}

function normalizeDecimal(value: unknown, label: string, reasons: string[]): string {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    reasons.push(`${label} is not a canonical non-negative decimal integer`);
    return "";
  }
  return value;
}
