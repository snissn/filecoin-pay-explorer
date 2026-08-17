import { gql } from "graphql-request";

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
      provider
      serviceId
      serviceType
      version
      metadataURI
      published
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
    }
  }
`;

export const GET_BOSS_SUBSCRIPTION = gql`
  query GetBossSubscription($id: ID!) {
    subscription(id: $id) {
      __typename
      id
      chainId
      bossAccount
      subscriptionId
      railId
      resourceKey
      provider
      beneficiary
      token
      resourceAdapter
      pricingAdapter
      state
      ratePerEpoch
      fixedBudget
      lifetimeCapGross
      totalRawGross
      totalChargedGross
      claimCount
      quoteEpoch
      quoteValidThroughEpoch
      resourceStatusHash
      activatedEpoch
      pausedEpoch
      terminationRequestedEpoch
      payEndEpoch
      finalSettledEpoch
    }
  }
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
      observedUsage
      rawGross
      chargedGross
      evidenceHash
      transactionHash
      blockNumber
    }
  }
`;

export const GET_BOSS_RAIL_ASSOCIATION = gql`
  query GetBossRailAssociation($subscriptionId: Bytes!, $railId: BigInt!) {
    railSubscriptions(where: { subscriptionId: $subscriptionId, railId: $railId }, first: 2) {
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
      validator
      token
      active
      transactionHash
      blockNumber
    }
  }
`;
