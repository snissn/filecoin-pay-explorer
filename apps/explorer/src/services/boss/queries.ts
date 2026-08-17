import { gql } from "graphql-request";

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
