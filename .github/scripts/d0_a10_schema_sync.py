from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n")


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    target = ROOT / path
    text = target.read_text()
    observed = text.count(old)
    if observed != count:
        raise SystemExit(f"{path}: expected {count} occurrences of {old!r}, found {observed}")
    target.write_text(text.replace(old, new, count))


write(
    "packages/types/schemas/boss.schema.graphql",
    r'''"""
Filecoin Boss GraphQL client contract. Entity fields are a strict subset of
snissn/filecoin-boss main commit 43786a88c726e85a24988d90c234eae220e58686.
"""
scalar BigInt
scalar Bytes

enum OrderDirection {
  asc
  desc
}

enum SubscriptionState {
  PENDING_ACTIVATION
  ACTIVE
  PAUSED
  TERMINATING
  ENDED
  EXHAUSTED
}

type BossAccount {
  id: ID!
  chainId: BigInt!
  factory: Bytes!
  address: Bytes!
  owner: Bytes!
  filecoinPay: Bytes!
  serviceRegistry: Bytes!
  adapterRegistry: Bytes!
  accountVersion: BigInt!
  accountKey: Bytes!
  createdBlock: BigInt!
  createdTransaction: Bytes!
}

type BossService {
  id: ID!
  chainId: BigInt!
  serviceRegistry: Bytes!
  providerAddress: Bytes!
  serviceId: Bytes!
  serviceType: Bytes!
  version: BigInt!
  providerRevision: BigInt!
  metadataURI: String!
  published: Boolean!
  updatedBlock: BigInt!
  updatedTransaction: Bytes!
}

type ResourceSubscription {
  id: ID!
  chainId: BigInt!
  bossAccount: Bytes!
  subscriptionId: Bytes!
  resourceKey: Bytes!
  active: Boolean!
  createdBlock: BigInt!
  createdTransaction: Bytes!
}

type Subscription {
  id: ID!
  chainId: BigInt!
  accountAddress: Bytes!
  subscriptionId: Bytes!
  offerHash: Bytes!
  resourceKey: Bytes!
  railId: BigInt!
  beneficiary: Bytes!
  token: Bytes!
  provider: Bytes!
  reporter: Bytes!
  resourceAdapter: Bytes!
  pricingAdapter: Bytes!
  resourceDataHash: Bytes!
  pricingDataHash: Bytes!
  accessGrantHash: Bytes!
  policyWord: BigInt!
  billingKind: Int!
  assuranceKind: Int!
  dependencyKind: Int!
  activationKind: Int!
  terminationBillingKind: Int!
  pauseAllowed: Boolean!
  maxRatePerEpoch: BigInt!
  maxFixedLockup: BigInt!
  maxSingleCharge: BigInt!
  maxChargePerWindow: BigInt!
  lifetimeCapGross: BigInt!
  chargeWindowEpochs: BigInt!
  notAfterEpoch: BigInt!
  maxLockupPeriod: BigInt!
  acceptedRatePerEpoch: BigInt!
  acceptedEpoch: BigInt!
  quoteEpoch: BigInt
  quoteValidThroughEpoch: BigInt!
  quoteTtlEpochs: BigInt!
  currentFixedBudget: BigInt!
  totalRawGross: BigInt!
  totalChargedGross: BigInt!
  claimCount: BigInt!
  provisioningHash: Bytes
  resourceStatusHash: Bytes
  activatedEpoch: BigInt
  pausedEpoch: BigInt
  resumedEpoch: BigInt
  terminationRequestedEpoch: BigInt
  payEndEpoch: BigInt
  finalSettledEpoch: BigInt
  pauseRateUpdateDeferred: Boolean!
  state: SubscriptionState!
  requiresAccountRead: Boolean!
  createdBlock: BigInt!
  createdTransaction: Bytes!
}

type UsageClaim {
  id: ID!
  chainId: BigInt!
  bossAccount: Bytes!
  subscriptionId: Bytes!
  claimId: Bytes!
  claimHash: Bytes!
  units: BigInt!
  rawGross: BigInt!
  chargedGross: BigInt!
  evidenceHash: Bytes!
  transactionHash: Bytes!
  blockNumber: BigInt!
  logIndex: BigInt!
}

type RailSubscription {
  id: ID!
  chainId: BigInt!
  filecoinPay: Bytes!
  bossAccount: Bytes!
  subscriptionId: Bytes!
  railId: BigInt!
  payer: Bytes!
  payee: Bytes!
  operator: Bytes!
  token: Bytes!
  active: Boolean!
  createdBlock: BigInt!
  createdTransaction: Bytes!
}

type _Block_ {
  hash: Bytes
  number: Int!
  timestamp: BigInt
}

type _Meta_ {
  block: _Block_!
  deployment: String!
  hasIndexingErrors: Boolean!
}

input Block_height {
  hash: Bytes
  number: Int
  number_gte: Int
}

input BossAccount_filter {
  id: ID
  address: Bytes
  owner: Bytes
}

input BossService_filter {
  id: ID
  providerAddress: Bytes
  serviceId: Bytes
  serviceType: Bytes
  published: Boolean
}

input ResourceSubscription_filter {
  id: ID
  bossAccount: Bytes
  resourceKey: Bytes
  subscriptionId: Bytes
  active: Boolean
}

input Subscription_filter {
  id: ID
  accountAddress: Bytes
  subscriptionId: Bytes
  railId: BigInt
  resourceKey: Bytes
  provider: Bytes
  state: SubscriptionState
}

input UsageClaim_filter {
  id: ID
  bossAccount: Bytes
  subscriptionId: Bytes
  claimId: Bytes
}

input RailSubscription_filter {
  id: ID
  chainId: BigInt
  filecoinPay: Bytes
  bossAccount: Bytes
  subscriptionId: Bytes
  railId: BigInt
  active: Boolean
}

enum BossAccount_orderBy {
  id
  address
  owner
  createdBlock
}

enum BossService_orderBy {
  id
  providerAddress
  serviceId
  version
  updatedBlock
}

enum ResourceSubscription_orderBy {
  id
  resourceKey
  subscriptionId
  createdBlock
}

enum Subscription_orderBy {
  id
  subscriptionId
  railId
  state
  acceptedEpoch
  activatedEpoch
  finalSettledEpoch
}

enum UsageClaim_orderBy {
  id
  subscriptionId
  claimId
  blockNumber
}

enum RailSubscription_orderBy {
  id
  subscriptionId
  railId
  createdBlock
}

type Query {
  _meta(block: Block_height): _Meta_
  bossAccount(id: ID!, block: Block_height): BossAccount
  bossAccounts(
    first: Int = 100
    skip: Int = 0
    where: BossAccount_filter
    orderBy: BossAccount_orderBy
    orderDirection: OrderDirection
    block: Block_height
  ): [BossAccount!]!
  bossService(id: ID!, block: Block_height): BossService
  bossServices(
    first: Int = 100
    skip: Int = 0
    where: BossService_filter
    orderBy: BossService_orderBy
    orderDirection: OrderDirection
    block: Block_height
  ): [BossService!]!
  resourceSubscription(id: ID!, block: Block_height): ResourceSubscription
  resourceSubscriptions(
    first: Int = 100
    skip: Int = 0
    where: ResourceSubscription_filter
    orderBy: ResourceSubscription_orderBy
    orderDirection: OrderDirection
    block: Block_height
  ): [ResourceSubscription!]!
  subscription(id: ID!, block: Block_height): Subscription
  subscriptions(
    first: Int = 100
    skip: Int = 0
    where: Subscription_filter
    orderBy: Subscription_orderBy
    orderDirection: OrderDirection
    block: Block_height
  ): [Subscription!]!
  usageClaims(
    first: Int = 100
    skip: Int = 0
    where: UsageClaim_filter
    orderBy: UsageClaim_orderBy
    orderDirection: OrderDirection
    block: Block_height
  ): [UsageClaim!]!
  railSubscriptions(
    first: Int = 100
    skip: Int = 0
    where: RailSubscription_filter
    orderBy: RailSubscription_orderBy
    orderDirection: OrderDirection
    block: Block_height
  ): [RailSubscription!]!
}
''',
)

write(
    "packages/types/scripts/validate-boss-client-schema.mjs",
    r'''import { readFileSync } from "node:fs";
import { Kind, parse, print } from "graphql";

const authorityPath = process.argv[2];
if (!authorityPath) throw new Error("usage: validate-boss-client-schema.mjs <authoritative-schema>");

const client = definitions(readFileSync(new URL("../schemas/boss.schema.graphql", import.meta.url), "utf8"));
const authority = definitions(readFileSync(authorityPath, "utf8"));
const entities = ["BossAccount", "BossService", "ResourceSubscription", "Subscription", "UsageClaim", "RailSubscription"];

for (const name of entities) {
  const expected = authority.get(name);
  const selected = client.get(name);
  if (!expected || expected.kind !== Kind.OBJECT_TYPE_DEFINITION) throw new Error(`authority lacks object ${name}`);
  if (!selected || selected.kind !== Kind.OBJECT_TYPE_DEFINITION) throw new Error(`client lacks object ${name}`);
  const expectedFields = new Map(expected.fields.map((field) => [field.name.value, print(field.type)]));
  for (const field of selected.fields) {
    const observed = expectedFields.get(field.name.value);
    const requested = print(field.type);
    if (observed !== requested) {
      throw new Error(`${name}.${field.name.value}: client=${requested}, authority=${observed ?? "missing"}`);
    }
  }
}

const expectedStates = enumValues(authority, "SubscriptionState");
const selectedStates = enumValues(client, "SubscriptionState");
if (JSON.stringify(selectedStates) !== JSON.stringify(expectedStates)) {
  throw new Error(`SubscriptionState drift: client=${selectedStates.join(",")}, authority=${expectedStates.join(",")}`);
}
console.log(`Boss client schema is a strict field/type subset of ${authorityPath}`);

function definitions(source) {
  return new Map(
    parse(source).definitions
      .filter((definition) => "name" in definition && definition.name)
      .map((definition) => [definition.name.value, definition]),
  );
}

function enumValues(map, name) {
  const definition = map.get(name);
  if (!definition || definition.kind !== Kind.ENUM_TYPE_DEFINITION) throw new Error(`missing enum ${name}`);
  return definition.values.map((value) => value.name.value);
}
''',
)

write(
    "apps/explorer/src/services/boss/queries.ts",
    r'''import { gql } from "graphql-request";

const SUBSCRIPTION_FIELDS = gql`
  fragment BossSubscriptionFields on Subscription {
    __typename
    id
    chainId
    accountAddress
    subscriptionId
    offerHash
    resourceKey
    railId
    beneficiary
    token
    provider
    reporter
    resourceAdapter
    pricingAdapter
    resourceDataHash
    pricingDataHash
    accessGrantHash
    policyWord
    billingKind
    assuranceKind
    dependencyKind
    activationKind
    terminationBillingKind
    pauseAllowed
    maxRatePerEpoch
    maxFixedLockup
    maxSingleCharge
    maxChargePerWindow
    lifetimeCapGross
    chargeWindowEpochs
    notAfterEpoch
    maxLockupPeriod
    acceptedRatePerEpoch
    acceptedEpoch
    quoteEpoch
    quoteValidThroughEpoch
    quoteTtlEpochs
    currentFixedBudget
    totalRawGross
    totalChargedGross
    claimCount
    provisioningHash
    resourceStatusHash
    activatedEpoch
    pausedEpoch
    resumedEpoch
    terminationRequestedEpoch
    payEndEpoch
    finalSettledEpoch
    pauseRateUpdateDeferred
    state
    requiresAccountRead
    createdBlock
    createdTransaction
  }
`;

export const GET_BOSS_INDEX_STATUS = gql`
  query GetBossIndexStatus {
    _meta {
      block {
        number
        hash
        timestamp
      }
      deployment
      hasIndexingErrors
    }
  }
`;

export const GET_BOSS_ACCOUNT = gql`
  query GetBossAccount($id: ID!) {
    bossAccount(id: $id) {
      __typename
      id
      chainId
      factory
      address
      owner
      filecoinPay
      serviceRegistry
      adapterRegistry
      accountVersion
      accountKey
      createdBlock
      createdTransaction
    }
  }
`;

export const GET_BOSS_SERVICE = gql`
  query GetBossService($id: ID!) {
    bossService(id: $id) {
      __typename
      id
      chainId
      serviceRegistry
      providerAddress
      serviceId
      serviceType
      version
      providerRevision
      metadataURI
      published
      updatedBlock
      updatedTransaction
    }
  }
`;

export const GET_BOSS_RESOURCE = gql`
  query GetBossResource($id: ID!) {
    resourceSubscription(id: $id) {
      __typename
      id
      chainId
      bossAccount
      resourceKey
      subscriptionId
      active
      createdBlock
      createdTransaction
    }
  }
`;

export const GET_BOSS_RESOURCE_FOR_SUBSCRIPTION = gql`
  query GetBossResourceForSubscription($subscriptionId: Bytes!) {
    resourceSubscriptions(where: { subscriptionId: $subscriptionId }, first: 2) {
      __typename
      id
      chainId
      bossAccount
      resourceKey
      subscriptionId
      active
      createdBlock
      createdTransaction
    }
  }
`;

export const GET_BOSS_SUBSCRIPTION = gql`
  query GetBossSubscription($id: ID!) {
    subscription(id: $id) {
      ...BossSubscriptionFields
    }
  }
  ${SUBSCRIPTION_FIELDS}
`;

export const GET_BOSS_SUBSCRIPTION_FOR_ASSOCIATION = gql`
  query GetBossSubscriptionForAssociation($subscriptionId: Bytes!) {
    subscriptions(where: { subscriptionId: $subscriptionId }, first: 2) {
      ...BossSubscriptionFields
    }
  }
  ${SUBSCRIPTION_FIELDS}
`;

export const LIST_BOSS_SUBSCRIPTIONS = gql`
  query ListBossSubscriptions($first: Int!, $skip: Int!) {
    subscriptions(first: $first, skip: $skip, orderBy: acceptedEpoch, orderDirection: desc) {
      ...BossSubscriptionFields
    }
  }
  ${SUBSCRIPTION_FIELDS}
`;

export const GET_BOSS_USAGE_CLAIMS = gql`
  query GetBossUsageClaims($subscriptionId: Bytes!, $first: Int!, $skip: Int!) {
    usageClaims(
      where: { subscriptionId: $subscriptionId }
      first: $first
      skip: $skip
      orderBy: blockNumber
      orderDirection: desc
    ) {
      __typename
      id
      chainId
      bossAccount
      subscriptionId
      claimId
      claimHash
      units
      rawGross
      chargedGross
      evidenceHash
      transactionHash
      blockNumber
      logIndex
    }
  }
`;

const RAIL_ASSOCIATION_FIELDS = gql`
  fragment BossRailAssociationFields on RailSubscription {
    __typename
    id
    chainId
    filecoinPay
    bossAccount
    subscriptionId
    railId
    payer
    payee
    operator
    token
    active
    createdBlock
    createdTransaction
  }
`;

export const GET_BOSS_RAIL_ASSOCIATION = gql`
  query GetBossRailAssociation($subscriptionId: Bytes!, $railId: BigInt!) {
    railSubscriptions(where: { subscriptionId: $subscriptionId, railId: $railId }, first: 2) {
      ...BossRailAssociationFields
    }
  }
  ${RAIL_ASSOCIATION_FIELDS}
`;

export const GET_BOSS_RAIL_ASSOCIATION_BY_RAIL = gql`
  query GetBossRailAssociationByRail($railId: BigInt!) {
    railSubscriptions(where: { railId: $railId }, first: 2) {
      ...BossRailAssociationFields
    }
  }
  ${RAIL_ASSOCIATION_FIELDS}
`;
''',
)

write(
    "apps/explorer/src/services/boss/association.ts",
    r'''import type { RailSubscription, Subscription } from "@filecoin-pay/types/boss";
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
  compare("filecoinPay", "trusted Filecoin Pay", trustedFilecoinPay, "manifest Filecoin Pay", manifestFilecoinPay, mismatches);
  compare("filecoinPay", "manifest Filecoin Pay", manifestFilecoinPay, "Boss association Filecoin Pay", associationFilecoinPay, mismatches);
  compare("bossAccount", "Boss association account", associationBossAccount, "Boss subscription account", subscriptionBossAccount, mismatches);
  compare("subscriptionId", "Boss association subscription ID", associationSubscriptionId, "Boss subscription protocol ID", subscriptionSubscriptionId, mismatches);
  compare("railId", "Boss association rail ID", associationRailId, "Boss subscription rail ID", subscriptionRailId, mismatches);
  compare("railId", "Boss association rail ID", associationRailId, "Filecoin Pay rail ID", payRailId, mismatches);
  compare("payer", "Boss association payer", associationPayer, "Filecoin Pay payer", payPayer, mismatches);
  compare("payee", "Boss association payee", associationPayee, "Boss subscription beneficiary", subscriptionBeneficiary, mismatches);
  compare("payee", "Boss association payee", associationPayee, "Filecoin Pay payee", payPayee, mismatches);
  compare("operator", "Boss association account", associationBossAccount, "Boss association operator", associationOperator, mismatches);
  compare("operator", "Boss association operator", associationOperator, "Filecoin Pay operator", payOperator, mismatches);
  compare("validator", "Boss account", associationBossAccount, "Filecoin Pay validator", payValidator, mismatches);
  compare("token", "manifest payment token", manifestToken, "Boss association payment token", associationToken, mismatches);
  compare("token", "Boss association payment token", associationToken, "Boss subscription payment token", subscriptionToken, mismatches);
  compare("token", "Boss association payment token", associationToken, "Filecoin Pay payment token", payToken, mismatches);

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
''',
)

write(
    "apps/explorer/src/services/boss/presentation.ts",
    r'''import type { Subscription } from "@filecoin-pay/types/boss";

const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const ASSURANCE = [
  ["Cancellable only", "Cancellation is the only protocol-level assurance; no stronger service-performance proof is implied."],
  ["On-chain deterministic", "The accepted service uses deterministic on-chain enforcement within the selected adapter boundary."],
  ["Trusted metering", "Usage depends on a trusted reporter. Review reporter identity and caps before treating charges as authoritative."],
  ["Attested", "The accepted service requires an attestation boundary; the commitment does not independently prove service quality."],
  ["Disputable", "The accepted service relies on a dispute path. Availability of that path is not the same as a successful outcome."],
] as const;
const DEPENDENCY = [
  ["None", "No additional accepted dependency class is recorded."],
  ["Soft", "The service records a soft dependency; failure may degrade behavior without making the subscription invalid."],
  ["Hard", "The service records a hard dependency that is required by the accepted terms."],
] as const;

export type BossStatusTone = "success" | "warning" | "error" | "neutral";

export interface BossStatusDescription {
  label: string;
  detail: string;
  tone: BossStatusTone;
}

export interface BossAuthorityDisclosure {
  label: string;
  value: string;
  detail: string;
}

export function describeBossAuthorities(subscription: Subscription): readonly BossAuthorityDisclosure[] {
  const assurance = ASSURANCE[subscription.assuranceKind];
  const dependency = DEPENDENCY[subscription.dependencyKind];
  return [
    {
      label: "Assurance",
      value: assurance?.[0] ?? `Unknown class ${subscription.assuranceKind}`,
      detail: assurance?.[1] ?? "The index returned an assurance class outside the supported Boss v1 range.",
    },
    {
      label: "Dependency class",
      value: dependency?.[0] ?? `Unknown class ${subscription.dependencyKind}`,
      detail: dependency?.[1] ?? "The index returned a dependency class outside the supported Boss v1 range.",
    },
    {
      label: "Data-access commitment",
      value: subscription.accessGrantHash.toLowerCase() === ZERO_BYTES32 ? "None committed" : formatBossIdentifier(subscription.accessGrantHash),
      detail:
        subscription.accessGrantHash.toLowerCase() === ZERO_BYTES32
          ? "No access-grant commitment was accepted for this subscription."
          : `Exact accepted access-grant commitment: ${subscription.accessGrantHash}. This is a commitment, not a credential or a proof of current access.`,
    },
  ];
}

export function describeBossStateAuthority(subscription: Pick<Subscription, "requiresAccountRead">): BossStatusDescription {
  return subscription.requiresAccountRead
    ? {
        label: "Direct account read required",
        detail:
          "Finite-cap streaming settlement can advance without another Boss event. Treat the indexed state as historical until BossAccount.getSubscription is reconciled.",
        tone: "warning",
      }
    : {
        label: "Event stream is current-state authoritative",
        detail: "The indexed lifecycle state can be reconstructed from the authenticated Boss event stream.",
        tone: "success",
      };
}

export function formatBossInteger(value: string | bigint | null | undefined): string {
  const parsed = parseBossInteger(value);
  return parsed === null ? (value == null ? "Not indexed" : "Invalid indexed value") : parsed.toLocaleString("en-US");
}

export function formatBossIdentifier(value: string | null | undefined): string {
  if (!value) return "Not indexed";
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function formatBossState(state: Subscription["state"]): string {
  return state
    .toLowerCase()
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function getBossStateTone(state: Subscription["state"]): BossStatusTone {
  switch (state) {
    case "ACTIVE":
      return "success";
    case "PENDING_ACTIVATION":
    case "PAUSED":
    case "TERMINATING":
      return "warning";
    case "EXHAUSTED":
      return "error";
    case "ENDED":
      return "neutral";
  }
  return "neutral";
}

export function formatLifetimeCap(value: string | bigint): string {
  const parsed = parseBossInteger(value);
  if (parsed === null) return "Invalid indexed value";
  return parsed === MAX_UINT256 ? "Unlimited" : parsed.toLocaleString("en-US");
}

export function formatRemainingLifetimeCap(
  subscription: Pick<Subscription, "lifetimeCapGross" | "totalChargedGross">,
): string {
  const cap = parseBossInteger(subscription.lifetimeCapGross);
  const charged = parseBossInteger(subscription.totalChargedGross);
  if (cap === null || charged === null) return "Invalid indexed value";
  if (cap === MAX_UINT256) return "Unlimited";
  return (cap > charged ? cap - charged : 0n).toLocaleString("en-US");
}

export function describeQuoteFreshness(
  subscription: Pick<Subscription, "quoteEpoch" | "quoteValidThroughEpoch">,
  observedEpoch?: bigint,
): BossStatusDescription {
  const validThrough = parseBossInteger(subscription.quoteValidThroughEpoch);
  const quoteEpoch = parseBossInteger(subscription.quoteEpoch);
  if (validThrough === null || (subscription.quoteEpoch != null && quoteEpoch === null)) {
    return { label: "Invalid quote metadata", detail: "The Boss index returned a non-decimal quote epoch value.", tone: "error" };
  }
  const quoteDetail = quoteEpoch === null ? "Quote creation epoch is not indexed." : `Quoted at epoch ${quoteEpoch}.`;
  if (observedEpoch === undefined) {
    return { label: `Valid through epoch ${validThrough}`, detail: `${quoteDetail} Live chain height is unavailable, so freshness cannot be confirmed.`, tone: "neutral" };
  }
  if (observedEpoch > validThrough) {
    return { label: `Expired at epoch ${validThrough}`, detail: `${quoteDetail} Observed chain epoch is ${observedEpoch}.`, tone: "warning" };
  }
  return { label: `Current through epoch ${validThrough}`, detail: `${quoteDetail} Observed chain epoch is ${observedEpoch}.`, tone: "success" };
}

export function describeBossIndexHealth(
  indexedBlock?: bigint,
  observedChainBlock?: bigint,
  maximumLag: bigint = 20n,
): BossStatusDescription {
  if (indexedBlock === undefined) return { label: "Index status unavailable", detail: "No authenticated Boss index metadata is available.", tone: "neutral" };
  if (observedChainBlock === undefined) return { label: `Indexed through block ${indexedBlock}`, detail: "Live chain height is unavailable, so index lag cannot be calculated.", tone: "neutral" };
  if (indexedBlock < 0n || observedChainBlock < 0n || maximumLag < 0n || indexedBlock > observedChainBlock) {
    return { label: "Index metadata mismatch", detail: `Indexed block ${indexedBlock} is inconsistent with observed chain block ${observedChainBlock}.`, tone: "error" };
  }
  const lag = observedChainBlock - indexedBlock;
  if (lag > maximumLag) return { label: `Index lagging by ${lag} blocks`, detail: `Maximum accepted lag for this view is ${maximumLag} blocks.`, tone: "warning" };
  return { label: `Index current within ${lag} blocks`, detail: `Indexed block ${indexedBlock}; observed chain block ${observedChainBlock}.`, tone: "success" };
}

function parseBossInteger(value: string | bigint | null | undefined): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
''',
)

replace(
    "apps/explorer/src/services/boss/client.ts",
    'export type BossResourceIdentity = Pick<Subscription, "bossAccount" | "resourceKey" | "subscriptionId">;',
    'export type BossResourceIdentity = Pick<Subscription, "accountAddress" | "resourceKey" | "subscriptionId">;',
)
replace(
    "apps/explorer/src/services/boss/client.ts",
    'assertIndexedIdentity(resource.bossAccount, identity.bossAccount, "Boss resource account");',
    'assertIndexedIdentity(resource.bossAccount, identity.accountAddress, "Boss resource account");',
)
replace(
    "apps/explorer/src/services/boss/client.ts",
    'assertIndexedIdentity(subscription.bossAccount, association.bossAccount, "Boss subscription account");',
    'assertIndexedIdentity(subscription.accountAddress, association.bossAccount, "Boss subscription account");',
)

replace(
    "apps/explorer/src/components/BossService/index.tsx",
    '  BOSS_AUTHORITY_DISCLOSURES,\n',
    '  describeBossAuthorities,\n  describeBossStateAuthority,\n',
)
replace(
    "apps/explorer/src/components/BossService/index.tsx",
    "          <BossStatusPanel title='Quote freshness' status={quoteStatus} />\n",
    "          <BossStatusPanel title='Quote freshness' status={quoteStatus} />\n          <BossStatusPanel title='Current-state authority' status={describeBossStateAuthority(subscription)} />\n",
)
replace("apps/explorer/src/components/BossService/index.tsx", "subscription.bossAccount", "subscription.accountAddress", 1)
replace("apps/explorer/src/components/BossService/index.tsx", "subscription.ratePerEpoch", "subscription.acceptedRatePerEpoch", 1)
replace("apps/explorer/src/components/BossService/index.tsx", "subscription.fixedBudget", "subscription.currentFixedBudget", 1)
replace(
    "apps/explorer/src/components/BossService/index.tsx",
    "              {BOSS_AUTHORITY_DISCLOSURES.map((disclosure) => (",
    "              {describeBossAuthorities(subscription).map((disclosure) => (",
)
replace("apps/explorer/src/components/BossService/index.tsx", "Observed usage", "Units")
replace("apps/explorer/src/components/BossService/index.tsx", "claim.observedUsage", "claim.units")
replace(
    "apps/explorer/src/components/BossService/index.tsx",
    "description='Unavailable facts remain unavailable; this page does not convert identifiers into assurances.'",
    "description='Accepted assurance, dependency, and access commitments are shown exactly, without promoting them into service-quality claims.'",
)

replace(
    "apps/explorer/src/components/BossServices/index.tsx",
    "            This view never infers assurance, dependency, data-access, or Boss-to-Pay association authority from\n            provider labels, adapter addresses, or rail IDs. Those fields remain explicitly unavailable until their\n            authoritative indexed facts exist.",
    "            Accepted assurance, dependency, and access commitments come only from authenticated Boss facts. A\n            generic Filecoin Pay rail still receives a Boss label only through the separate reciprocal proof.",
)
replace("apps/explorer/src/components/BossServices/index.tsx", "subscription.ratePerEpoch", "subscription.acceptedRatePerEpoch", 1)
replace("apps/explorer/src/components/BossServices/index.tsx", "subscription.fixedBudget", "subscription.currentFixedBudget", 1)
replace(
    "apps/explorer/src/components/BossServices/index.tsx",
    "                          <BossStateBadge state={subscription.state} />",
    "                          <BossStateBadge state={subscription.state} />\n                          {subscription.requiresAccountRead && (\n                            <p className='mt-1 text-xs text-amber-700 dark:text-amber-300'>Direct account read required</p>\n                          )}",
)

replace(
    "apps/explorer/src/components/BossPayAssociation/index.tsx",
    "            Chain, Filecoin Pay authority, Boss account/operator, subscription ID, rail ID, payer, payee, token, and\n            validator all match. The association is{\" \"}",
    "            Chain, Filecoin Pay authority, Boss account/operator, subscription ID, rail ID, payer, payee, and token\n            all match; the Filecoin Pay validator is the authenticated Boss account. The association is{\" \"}",
)

replace(
    "apps/explorer/src/services/boss/client-request.test.ts",
    "    bossAccount: BOSS_ACCOUNT,\n    subscriptionId: SUBSCRIPTION_ID,\n    resourceKey: RESOURCE_KEY,\n    token: ADDRESS(\"5\"),",
    "    accountAddress: BOSS_ACCOUNT,\n    subscriptionId: SUBSCRIPTION_ID,\n    resourceKey: RESOURCE_KEY,\n    token: ADDRESS(\"5\"),",
)
replace(
    "apps/explorer/src/services/boss/client-request.test.ts",
    "        bossAccount: BOSS_ACCOUNT,\n        resourceKey: RESOURCE_KEY,",
    "        accountAddress: BOSS_ACCOUNT,\n        resourceKey: RESOURCE_KEY,",
    2,
)

replace(
    "apps/explorer/src/services/boss/association-client.test.ts",
    '    validator: ADDRESS("e"),\n    token: ADDRESS("5"),\n    active: true,\n    transactionHash: HASH("f"),\n    blockNumber: "120",',
    '    token: ADDRESS("5"),\n    active: true,\n    createdTransaction: HASH("f"),\n    createdBlock: "120",',
)
replace(
    "apps/explorer/src/services/boss/association-client.test.ts",
    '    bossAccount: ADDRESS("a"),\n    subscriptionId: HASH("b"),',
    '    accountAddress: ADDRESS("a"),\n    subscriptionId: HASH("b"),',
)

write(
    "apps/explorer/src/services/boss/presentation.test.ts",
    r'''import type { Subscription } from "@filecoin-pay/types/boss";
import { describe, expect, it } from "vitest";
import {
  describeBossAuthorities,
  describeBossIndexHealth,
  describeBossStateAuthority,
  describeQuoteFreshness,
  formatBossInteger,
  formatLifetimeCap,
  formatRemainingLifetimeCap,
} from "./presentation";

const MAX_UINT256 = ((1n << 256n) - 1n).toString();
const ADDRESS = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const HASH = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    __typename: "Subscription",
    id: "subscription-entity",
    chainId: "314159",
    accountAddress: ADDRESS("1"),
    subscriptionId: HASH("2"),
    offerHash: HASH("3"),
    resourceKey: HASH("4"),
    railId: "7",
    beneficiary: ADDRESS("5"),
    token: ADDRESS("6"),
    provider: ADDRESS("7"),
    reporter: ADDRESS("8"),
    resourceAdapter: ADDRESS("9"),
    pricingAdapter: ADDRESS("a"),
    resourceDataHash: HASH("b"),
    pricingDataHash: HASH("c"),
    accessGrantHash: HASH("d"),
    policyWord: "0",
    billingKind: 2,
    assuranceKind: 2,
    dependencyKind: 1,
    activationKind: 0,
    terminationBillingKind: 0,
    pauseAllowed: true,
    maxRatePerEpoch: "100",
    maxFixedLockup: "1000",
    maxSingleCharge: "100",
    maxChargePerWindow: "1000",
    lifetimeCapGross: "1000",
    chargeWindowEpochs: "10",
    notAfterEpoch: "10000",
    maxLockupPeriod: "100",
    acceptedRatePerEpoch: "10",
    acceptedEpoch: "120",
    quoteEpoch: "120",
    quoteValidThroughEpoch: "160",
    quoteTtlEpochs: "40",
    currentFixedBudget: "100",
    totalRawGross: "300",
    totalChargedGross: "250",
    claimCount: "3",
    provisioningHash: null,
    resourceStatusHash: HASH("e"),
    activatedEpoch: "121",
    pausedEpoch: null,
    resumedEpoch: null,
    terminationRequestedEpoch: null,
    payEndEpoch: null,
    finalSettledEpoch: null,
    pauseRateUpdateDeferred: false,
    state: "ACTIVE",
    requiresAccountRead: false,
    createdBlock: "120",
    createdTransaction: HASH("f"),
    ...overrides,
  };
}

describe("Boss read presentation", () => {
  it("renders exact integers without Number precision loss", () => {
    expect(formatBossInteger("9007199254740993123456789")).toBe("9,007,199,254,740,993,123,456,789");
    expect(formatBossInteger("1e18")).toBe("Invalid indexed value");
  });

  it("preserves the unlimited cap sentinel and clamps exhausted remaining capacity", () => {
    expect(formatLifetimeCap(MAX_UINT256)).toBe("Unlimited");
    expect(formatRemainingLifetimeCap(subscription({ lifetimeCapGross: MAX_UINT256 }))).toBe("Unlimited");
    expect(formatRemainingLifetimeCap(subscription({ lifetimeCapGross: "100", totalChargedGross: "125" }))).toBe("0");
  });

  it("distinguishes current, expired, unavailable-height, and invalid quote authority", () => {
    expect(describeQuoteFreshness(subscription(), 150n)).toMatchObject({ tone: "success" });
    expect(describeQuoteFreshness(subscription(), 161n)).toMatchObject({ tone: "warning" });
    expect(describeQuoteFreshness(subscription(), undefined)).toMatchObject({ tone: "neutral" });
    expect(describeQuoteFreshness(subscription({ quoteValidThroughEpoch: "not-an-epoch" }), 150n)).toMatchObject({
      label: "Invalid quote metadata",
      tone: "error",
    });
  });

  it("renders accepted assurance/dependency/access authority without overstating it", () => {
    const disclosures = describeBossAuthorities(subscription());
    expect(disclosures.map((item) => item.value)).toEqual(["Trusted metering", "Soft", expect.stringContaining("…")]);
    expect(disclosures.map((item) => item.detail).join(" ").toLowerCase()).toContain("trusted reporter");
    expect(disclosures.map((item) => item.detail).join(" ").toLowerCase()).not.toContain("verified service");
  });

  it("flags event-stream state that needs a direct account read", () => {
    expect(describeBossStateAuthority(subscription())).toMatchObject({ tone: "success" });
    expect(describeBossStateAuthority(subscription({ requiresAccountRead: true }))).toMatchObject({ tone: "warning" });
  });

  it("reports bounded index health without hiding impossible metadata", () => {
    expect(describeBossIndexHealth(100n, 110n, 20n)).toMatchObject({ tone: "success" });
    expect(describeBossIndexHealth(100n, 125n, 20n)).toMatchObject({ tone: "warning" });
    expect(describeBossIndexHealth(126n, 125n, 20n)).toMatchObject({ tone: "error" });
    expect(describeBossIndexHealth(100n)).toMatchObject({ tone: "neutral" });
  });
});
''',
)

write(
    "apps/explorer/src/services/boss/association.test.ts",
    r'''import type { RailSubscription, Subscription } from "@filecoin-pay/types/boss";
import { describe, expect, it } from "vitest";
import {
  type PayRailAssociationFacts,
  type VerifyBossPayRailAssociationInput,
  verifyBossPayRailAssociation,
} from "./association";
import type { BossDeploymentManifest } from "./config";

const ADDRESS = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const HASH = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;

function manifest(): BossDeploymentManifest {
  const deployment = (digit: string, block: number) => ({
    address: ADDRESS(digit), runtimeCodeHash: HASH(digit), deploymentTxHash: HASH("f"), deploymentBlock: block,
  });
  return {
    schemaVersion: 1,
    network: "filecoin-testnet",
    chainId: 314159,
    protocolCommit: "a".repeat(40),
    accountCreationCodeHash: HASH("a"),
    deploymentBlock: 100,
    dependencies: { filecoinPay: ADDRESS("1"), pdpVerifier: ADDRESS("2"), fwssService: ADDRESS("3"), fwssStateView: ADDRESS("4"), token: ADDRESS("5") },
    contracts: {
      BossFactory: deployment("6", 100), BossServiceRegistry: deployment("7", 101), BossAdapterRegistry: deployment("8", 102), BossStateView: deployment("9", 103), BossBundles: deployment("a", 104),
    },
  };
}

function bossAssociation(overrides: Partial<RailSubscription> = {}): RailSubscription {
  return {
    __typename: "RailSubscription",
    id: "association-1",
    chainId: "314159",
    filecoinPay: ADDRESS("1"),
    bossAccount: ADDRESS("a"),
    subscriptionId: HASH("b"),
    railId: "42",
    payer: ADDRESS("c"),
    payee: ADDRESS("d"),
    operator: ADDRESS("a"),
    token: ADDRESS("5"),
    active: true,
    createdBlock: "120",
    createdTransaction: HASH("f"),
    ...overrides,
  };
}

function bossSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    __typename: "Subscription",
    id: "subscription-entity",
    chainId: "314159",
    accountAddress: ADDRESS("a"),
    subscriptionId: HASH("b"),
    offerHash: HASH("1"),
    resourceKey: HASH("c"),
    railId: "42",
    beneficiary: ADDRESS("d"),
    token: ADDRESS("5"),
    provider: ADDRESS("f"),
    reporter: ADDRESS("e"),
    resourceAdapter: ADDRESS("7"),
    pricingAdapter: ADDRESS("8"),
    resourceDataHash: HASH("2"),
    pricingDataHash: HASH("3"),
    accessGrantHash: HASH("4"),
    policyWord: "0",
    billingKind: 1,
    assuranceKind: 1,
    dependencyKind: 0,
    activationKind: 0,
    terminationBillingKind: 0,
    pauseAllowed: true,
    maxRatePerEpoch: "100",
    maxFixedLockup: "1000",
    maxSingleCharge: "100",
    maxChargePerWindow: "1000",
    lifetimeCapGross: "1000",
    chargeWindowEpochs: "10",
    notAfterEpoch: "10000",
    maxLockupPeriod: "100",
    acceptedRatePerEpoch: "10",
    acceptedEpoch: "110",
    quoteEpoch: "110",
    quoteValidThroughEpoch: "140",
    quoteTtlEpochs: "30",
    currentFixedBudget: "100",
    totalRawGross: "20",
    totalChargedGross: "15",
    claimCount: "1",
    provisioningHash: null,
    resourceStatusHash: HASH("9"),
    activatedEpoch: "111",
    pausedEpoch: null,
    resumedEpoch: null,
    terminationRequestedEpoch: null,
    payEndEpoch: null,
    finalSettledEpoch: null,
    pauseRateUpdateDeferred: false,
    state: "ACTIVE",
    requiresAccountRead: false,
    createdBlock: "110",
    createdTransaction: HASH("a"),
    ...overrides,
  };
}

function payRail(overrides: Partial<PayRailAssociationFacts> = {}): PayRailAssociationFacts {
  return {
    railId: "42",
    payer: { address: ADDRESS("c") },
    payee: { address: ADDRESS("d") },
    operator: { address: ADDRESS("a") },
    validator: ADDRESS("a"),
    token: { address: ADDRESS("5") },
    ...overrides,
  };
}

function input(overrides: Partial<VerifyBossPayRailAssociationInput> = {}): VerifyBossPayRailAssociationInput {
  return {
    routeChainId: 314159,
    trustedFilecoinPay: ADDRESS("1"),
    manifest: manifest(),
    bossAssociation: bossAssociation(),
    bossSubscription: bossSubscription(),
    payRail: payRail(),
    ...overrides,
  };
}

describe("Boss to Filecoin Pay rail association", () => {
  it("accepts only the complete exact tuple", () => {
    expect(verifyBossPayRailAssociation(input())).toEqual({
      status: "matched",
      association: {
        chainId: 314159,
        filecoinPay: ADDRESS("1"),
        bossAccount: ADDRESS("a"),
        subscriptionEntityId: "subscription-entity",
        subscriptionId: HASH("b"),
        railId: "42",
        payer: ADDRESS("c"),
        payee: ADDRESS("d"),
        operator: ADDRESS("a"),
        validator: ADDRESS("a"),
        token: ADDRESS("5"),
        active: true,
      },
    });
  });

  it.each([
    ["chainId", { routeChainId: 314 }],
    ["filecoinPay", { trustedFilecoinPay: ADDRESS("f") }],
    ["bossAccount", { bossSubscription: bossSubscription({ accountAddress: ADDRESS("f") }) }],
    ["subscriptionId", { bossSubscription: bossSubscription({ subscriptionId: HASH("f") }) }],
    ["railId", { payRail: payRail({ railId: "43" }) }],
    ["payer", { payRail: payRail({ payer: { address: ADDRESS("f") } }) }],
    ["payee", { payRail: payRail({ payee: { address: ADDRESS("f") } }) }],
    ["operator", { payRail: payRail({ operator: { address: ADDRESS("f") } }) }],
    ["token", { payRail: payRail({ token: { address: ADDRESS("f") } }) }],
    ["validator", { payRail: payRail({ validator: ADDRESS("f") }) }],
  ] as const)("rejects a %s mismatch", (field, overrides) => {
    const result = verifyBossPayRailAssociation(input(overrides));
    expect(result.status).toBe("mismatched");
    if (result.status === "mismatched") expect(result.mismatches.map((mismatch) => mismatch.field)).toContain(field);
  });

  it("rejects a lookalike rail even when its payee and operator match", () => {
    const result = verifyBossPayRailAssociation(
      input({ payRail: payRail({ railId: "999", payer: { address: ADDRESS("f") }, token: { address: ADDRESS("6") } }) }),
    );
    expect(result.status).toBe("mismatched");
    if (result.status === "mismatched") {
      expect(new Set(result.mismatches.map((mismatch) => mismatch.field))).toEqual(new Set(["railId", "payer", "token"]));
    }
  });

  it("normalizes hexadecimal case but rejects malformed validator authority", () => {
    const caseNormalized = verifyBossPayRailAssociation(
      input({ payRail: payRail({ validator: ADDRESS("a").toUpperCase().replace("0X", "0x") }) }),
    );
    expect(caseNormalized.status).toBe("matched");

    const malformed = verifyBossPayRailAssociation(input({ payRail: payRail({ validator: "not-an-address" }) }));
    expect(malformed.status).toBe("unverifiable");
    if (malformed.status === "unverifiable") {
      expect(malformed.reasons).toContain("Filecoin Pay validator is not a valid EVM address");
    }
  });
});
''',
)

replace(
    "packages/types/README.md",
    "Boss GraphQL types are generated from the distinct Boss schema",
    "Boss GraphQL types are generated from the distinct Boss client schema, whose entity fields are validated as an exact subset of filecoin-boss main@43786a88c726e85a24988d90c234eae220e58686",
    1,
)
