import type { Subscription } from "@filecoin-pay/types/boss";

const MAX_UINT256 = (1n << 256n) - 1n;

export type BossStatusTone = "success" | "warning" | "error" | "neutral";

export interface BossStatusDescription {
  label: string;
  detail: string;
  tone: BossStatusTone;
}

export interface BossAuthorityDisclosure {
  label: string;
  value: "Not indexed";
  detail: string;
}

export const BOSS_AUTHORITY_DISCLOSURES: readonly BossAuthorityDisclosure[] = [
  {
    label: "Assurance",
    value: "Not indexed",
    detail:
      "The current A10 client schema does not carry an assurance class. Do not infer verification from provider, adapter, rail, or payment state.",
  },
  {
    label: "Dependency class",
    value: "Not indexed",
    detail:
      "The current A10 client schema does not carry the accepted dependency class. Adapter addresses are identifiers, not dependency assurances.",
  },
  {
    label: "Data access",
    value: "Not indexed",
    detail:
      "The current Explorer data contract does not carry access-grant commitment or revocation state. No credential or access claim is implied.",
  },
] as const;

export function formatBossInteger(value: string | bigint | null | undefined): string {
  const parsed = parseBossInteger(value);
  return parsed === null ? (value == null ? "Not indexed" : "Invalid indexed value") : parsed.toLocaleString("en-US");
}

export function formatBossIdentifier(value: string | null | undefined): string {
  if (!value) {
    return "Not indexed";
  }
  if (value.length <= 22) {
    return value;
  }
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
    case "ACCEPTED":
    case "PAUSED":
    case "TERMINATING":
      return "warning";
    case "EXHAUSTED":
      return "error";
    case "ENDED":
      return "neutral";
  }
}

export function formatLifetimeCap(value: string | bigint): string {
  const parsed = parseBossInteger(value);
  if (parsed === null) {
    return "Invalid indexed value";
  }
  return parsed === MAX_UINT256 ? "Unlimited" : parsed.toLocaleString("en-US");
}

export function formatRemainingLifetimeCap(subscription: Pick<Subscription, "lifetimeCapGross" | "totalChargedGross">): string {
  const cap = parseBossInteger(subscription.lifetimeCapGross);
  const charged = parseBossInteger(subscription.totalChargedGross);
  if (cap === null || charged === null) {
    return "Invalid indexed value";
  }
  if (cap === MAX_UINT256) {
    return "Unlimited";
  }
  return (cap > charged ? cap - charged : 0n).toLocaleString("en-US");
}

export function describeQuoteFreshness(
  subscription: Pick<Subscription, "quoteEpoch" | "quoteValidThroughEpoch">,
  observedEpoch?: bigint,
): BossStatusDescription {
  if (subscription.quoteValidThroughEpoch == null) {
    return {
      label: "Quote authority not indexed",
      detail: "No quote-valid-through epoch is available from the current Boss index.",
      tone: "neutral",
    };
  }

  const validThrough = parseBossInteger(subscription.quoteValidThroughEpoch);
  const quoteEpoch = parseBossInteger(subscription.quoteEpoch);
  if (validThrough === null || (subscription.quoteEpoch != null && quoteEpoch === null)) {
    return {
      label: "Invalid quote metadata",
      detail: "The Boss index returned a non-decimal quote epoch value.",
      tone: "error",
    };
  }

  const quoteDetail = quoteEpoch === null ? "Quote creation epoch is not indexed." : `Quoted at epoch ${quoteEpoch}.`;
  if (observedEpoch === undefined) {
    return {
      label: `Valid through epoch ${validThrough}`,
      detail: `${quoteDetail} Live chain height is unavailable, so freshness cannot be confirmed.`,
      tone: "neutral",
    };
  }
  if (observedEpoch > validThrough) {
    return {
      label: `Expired at epoch ${validThrough}`,
      detail: `${quoteDetail} Observed chain epoch is ${observedEpoch}.`,
      tone: "warning",
    };
  }
  return {
    label: `Current through epoch ${validThrough}`,
    detail: `${quoteDetail} Observed chain epoch is ${observedEpoch}.`,
    tone: "success",
  };
}

export function describeBossIndexHealth(
  indexedBlock?: bigint,
  observedChainBlock?: bigint,
  maximumLag: bigint = 20n,
): BossStatusDescription {
  if (indexedBlock === undefined) {
    return {
      label: "Index status unavailable",
      detail: "No authenticated Boss index metadata is available.",
      tone: "neutral",
    };
  }
  if (observedChainBlock === undefined) {
    return {
      label: `Indexed through block ${indexedBlock}`,
      detail: "Live chain height is unavailable, so index lag cannot be calculated.",
      tone: "neutral",
    };
  }
  if (indexedBlock < 0n || observedChainBlock < 0n || maximumLag < 0n || indexedBlock > observedChainBlock) {
    return {
      label: "Index metadata mismatch",
      detail: `Indexed block ${indexedBlock} is inconsistent with observed chain block ${observedChainBlock}.`,
      tone: "error",
    };
  }

  const lag = observedChainBlock - indexedBlock;
  if (lag > maximumLag) {
    return {
      label: `Index lagging by ${lag} blocks`,
      detail: `Maximum accepted lag for this view is ${maximumLag} blocks.`,
      tone: "warning",
    };
  }
  return {
    label: `Index current within ${lag} blocks`,
    detail: `Indexed block ${indexedBlock}; observed chain block ${observedChainBlock}.`,
    tone: "success",
  };
}

function parseBossInteger(value: string | bigint | null | undefined): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
