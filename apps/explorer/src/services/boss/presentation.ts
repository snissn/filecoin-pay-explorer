import type { Subscription } from "@filecoin-pay/types/boss";

const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const ASSURANCE = [
  [
    "Cancellable only",
    "Cancellation is the only protocol-level assurance; no stronger service-performance proof is implied.",
  ],
  [
    "On-chain deterministic",
    "The accepted service uses deterministic on-chain enforcement within the selected adapter boundary.",
  ],
  [
    "Trusted metering",
    "Usage depends on a trusted reporter. Review reporter identity and caps before treating charges as authoritative.",
  ],
  [
    "Attested",
    "The accepted service requires an attestation boundary; the commitment does not independently prove service quality.",
  ],
  [
    "Disputable",
    "The accepted service relies on a dispute path. Availability of that path is not the same as a successful outcome.",
  ],
] as const;
const DEPENDENCY = [
  ["None", "No additional accepted dependency class is recorded."],
  [
    "Soft",
    "The service records a soft dependency; failure may degrade behavior without making the subscription invalid.",
  ],
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
      value:
        subscription.accessGrantHash.toLowerCase() === ZERO_BYTES32
          ? "None committed"
          : formatBossIdentifier(subscription.accessGrantHash),
      detail:
        subscription.accessGrantHash.toLowerCase() === ZERO_BYTES32
          ? "No access-grant commitment was accepted for this subscription."
          : `Exact accepted access-grant commitment: ${subscription.accessGrantHash}. This is a commitment, not a credential or a proof of current access.`,
    },
  ];
}

export function describeBossStateAuthority(
  subscription: Pick<Subscription, "requiresAccountRead">,
): BossStatusDescription {
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
  if (indexedBlock === undefined)
    return {
      label: "Index status unavailable",
      detail: "No authenticated Boss index metadata is available.",
      tone: "neutral",
    };
  if (observedChainBlock === undefined)
    return {
      label: `Indexed through block ${indexedBlock}`,
      detail: "Live chain height is unavailable, so index lag cannot be calculated.",
      tone: "neutral",
    };
  if (indexedBlock < 0n || observedChainBlock < 0n || maximumLag < 0n || indexedBlock > observedChainBlock) {
    return {
      label: "Index metadata mismatch",
      detail: `Indexed block ${indexedBlock} is inconsistent with observed chain block ${observedChainBlock}.`,
      tone: "error",
    };
  }
  const lag = observedChainBlock - indexedBlock;
  if (lag > maximumLag)
    return {
      label: `Index lagging by ${lag} blocks`,
      detail: `Maximum accepted lag for this view is ${maximumLag} blocks.`,
      tone: "warning",
    };
  return {
    label: `Index current within ${lag} blocks`,
    detail: `Indexed block ${indexedBlock}; observed chain block ${observedChainBlock}.`,
    tone: "success",
  };
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
