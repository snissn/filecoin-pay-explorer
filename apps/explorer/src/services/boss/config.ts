import type { Address, Hex } from "@filecoin-pay/types";
import type { Network } from "@/types";
import { BossDataSourceError } from "./errors";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

const REQUIRED_CONTRACTS = [
  "BossFactory",
  "BossServiceRegistry",
  "BossAdapterRegistry",
  "BossStateView",
  "BossBundles",
] as const;

const OPTIONAL_CONTRACTS = [
  "FlatRateAdapter",
  "PDPCapacityAdapter",
  "CappedMeteredAdapter",
  "FWSSPDPResourceAdapter",
] as const;

const CONTRACT_NAMES = new Set<string>([...REQUIRED_CONTRACTS, ...OPTIONAL_CONTRACTS]);

const NETWORK_AUTHORITY: Record<Network, { graphNetwork: string; chainId: number }> = {
  mainnet: { graphNetwork: "filecoin", chainId: 314 },
  calibration: { graphNetwork: "filecoin-testnet", chainId: 314159 },
};

export type BossContractName = (typeof REQUIRED_CONTRACTS)[number] | (typeof OPTIONAL_CONTRACTS)[number];

export interface BossContractDeployment {
  address: Address;
  runtimeCodeHash: Hex;
  deploymentTxHash: Hex;
  deploymentBlock: number;
}

export interface BossDeploymentManifest {
  schemaVersion: 1;
  network: string;
  chainId: number;
  protocolCommit: string;
  accountCreationCodeHash: Hex;
  deploymentBlock?: number;
  dependencies: {
    filecoinPay: Address;
    pdpVerifier: Address;
    fwssService: Address;
    fwssStateView: Address;
    token: Address;
  };
  contracts: Record<(typeof REQUIRED_CONTRACTS)[number], BossContractDeployment> &
    Partial<Record<(typeof OPTIONAL_CONTRACTS)[number], BossContractDeployment>>;
}

export interface BossPublicEnvironment {
  endpoint?: string;
  manifestJson?: string;
}

export interface BossDataSourceConfig {
  endpoint: string;
  manifest: BossDeploymentManifest;
}

export function getBossPublicEnvironment(network: Network): BossPublicEnvironment {
  const environments: Record<Network, BossPublicEnvironment> = {
    mainnet: {
      endpoint: process.env.NEXT_PUBLIC_BOSS_SUBGRAPH_URL_MAINNET,
      manifestJson: process.env.NEXT_PUBLIC_BOSS_DEPLOYMENT_MANIFEST_MAINNET,
    },
    calibration: {
      endpoint: process.env.NEXT_PUBLIC_BOSS_SUBGRAPH_URL_CALIBRATION,
      manifestJson: process.env.NEXT_PUBLIC_BOSS_DEPLOYMENT_MANIFEST_CALIBRATION,
    },
  };
  return environments[network];
}

export function getBossDataSourceConfig(
  network: Network,
  environment: BossPublicEnvironment = getBossPublicEnvironment(network),
): BossDataSourceConfig {
  const endpoint = parseEndpoint(environment.endpoint, network);
  const manifest = parseBossDeploymentManifest(environment.manifestJson, network);
  return { endpoint, manifest };
}

export function parseBossDeploymentManifest(
  manifestJson: string | undefined,
  network: Network,
): BossDeploymentManifest {
  if (!manifestJson) {
    throw new BossDataSourceError(
      "MISSING_MANIFEST",
      `Missing environment variable: NEXT_PUBLIC_BOSS_DEPLOYMENT_MANIFEST_${network.toUpperCase()}`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(manifestJson);
  } catch (error) {
    throw new BossDataSourceError("INVALID_MANIFEST", "Boss deployment manifest must be valid JSON", error);
  }

  const manifest = requireRecord(value, "manifest");
  requireExactKeys(
    manifest,
    [
      "schemaVersion",
      "network",
      "chainId",
      "protocolCommit",
      "accountCreationCodeHash",
      "dependencies",
      "contracts",
    ],
    ["deploymentBlock"],
    "manifest",
  );

  if (manifest.schemaVersion !== 1) {
    throw invalidManifest("manifest.schemaVersion must equal 1");
  }
  if (typeof manifest.network !== "string" || !manifest.network) {
    throw invalidManifest("manifest.network must be a nonempty string");
  }
  if (!Number.isSafeInteger(manifest.chainId) || Number(manifest.chainId) <= 0) {
    throw invalidManifest("manifest.chainId must be a positive safe integer");
  }
  if (typeof manifest.protocolCommit !== "string" || !COMMIT.test(manifest.protocolCommit)) {
    throw invalidManifest("manifest.protocolCommit must be a lowercase 40-character commit");
  }
  const accountCreationCodeHash = requireHash(manifest.accountCreationCodeHash, "manifest.accountCreationCodeHash");
  const authority = NETWORK_AUTHORITY[network];
  if (manifest.network !== authority.graphNetwork || manifest.chainId !== authority.chainId) {
    throw new BossDataSourceError(
      "NETWORK_MISMATCH",
      `${network} requires Graph network ${authority.graphNetwork} and chain ID ${authority.chainId}`,
    );
  }

  const dependenciesValue = requireRecord(manifest.dependencies, "manifest.dependencies");
  requireExactKeys(
    dependenciesValue,
    ["filecoinPay", "pdpVerifier", "fwssService", "fwssStateView", "token"],
    [],
    "manifest.dependencies",
  );
  const dependencies = {
    filecoinPay: requireAddress(dependenciesValue.filecoinPay, "manifest.dependencies.filecoinPay"),
    pdpVerifier: requireAddress(dependenciesValue.pdpVerifier, "manifest.dependencies.pdpVerifier"),
    fwssService: requireAddress(dependenciesValue.fwssService, "manifest.dependencies.fwssService"),
    fwssStateView: requireAddress(dependenciesValue.fwssStateView, "manifest.dependencies.fwssStateView"),
    token: requireAddress(dependenciesValue.token, "manifest.dependencies.token"),
  };

  const contractValues = requireRecord(manifest.contracts, "manifest.contracts");
  const unknownContracts = Object.keys(contractValues).filter((name) => !CONTRACT_NAMES.has(name));
  if (unknownContracts.length > 0) {
    throw invalidManifest(`manifest.contracts has unsupported entries: ${unknownContracts.sort().join(", ")}`);
  }

  const contracts: Partial<Record<BossContractName, BossContractDeployment>> = {};
  for (const name of REQUIRED_CONTRACTS) {
    contracts[name] = parseDeployment(contractValues[name], `manifest.contracts.${name}`);
  }
  for (const name of OPTIONAL_CONTRACTS) {
    if (contractValues[name] !== undefined) {
      contracts[name] = parseDeployment(contractValues[name], `manifest.contracts.${name}`);
    }
  }

  let deploymentBlock: number | undefined;
  if (manifest.deploymentBlock !== undefined) {
    deploymentBlock = requireBlock(manifest.deploymentBlock, "manifest.deploymentBlock");
  }

  return {
    schemaVersion: 1,
    network: manifest.network,
    chainId: manifest.chainId as number,
    protocolCommit: manifest.protocolCommit,
    accountCreationCodeHash,
    deploymentBlock,
    dependencies,
    contracts: contracts as BossDeploymentManifest["contracts"],
  };
}

function parseEndpoint(endpoint: string | undefined, network: Network): string {
  if (!endpoint) {
    throw new BossDataSourceError(
      "MISSING_ENDPOINT",
      `Missing environment variable: NEXT_PUBLIC_BOSS_SUBGRAPH_URL_${network.toUpperCase()}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch (error) {
    throw new BossDataSourceError("INVALID_ENDPOINT", "Boss GraphQL endpoint must be an absolute URL", error);
  }
  if (parsed.protocol !== "https:") {
    throw new BossDataSourceError("INVALID_ENDPOINT", "Public Boss GraphQL endpoints must use HTTPS");
  }
  return parsed.toString();
}

function parseDeployment(value: unknown, label: string): BossContractDeployment {
  const deployment = requireRecord(value, label);
  requireExactKeys(
    deployment,
    ["address", "runtimeCodeHash", "deploymentTxHash", "deploymentBlock"],
    [],
    label,
  );
  return {
    address: requireAddress(deployment.address, `${label}.address`),
    runtimeCodeHash: requireHash(deployment.runtimeCodeHash, `${label}.runtimeCodeHash`),
    deploymentTxHash: requireHash(deployment.deploymentTxHash, `${label}.deploymentTxHash`),
    deploymentBlock: requireBlock(deployment.deploymentBlock, `${label}.deploymentBlock`),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalidManifest(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !(key in value));
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unknown.length > 0) {
    const details = [
      missing.length > 0 ? `missing ${missing.sort().join(", ")}` : undefined,
      unknown.length > 0 ? `unexpected ${unknown.sort().join(", ")}` : undefined,
    ].filter(Boolean);
    throw invalidManifest(`${label}: ${details.join("; ")}`);
  }
}

function requireAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !ADDRESS.test(value) || value.toLowerCase() === ZERO_ADDRESS) {
    throw invalidManifest(`${label} must be a nonzero EVM address`);
  }
  if (value !== value.toLowerCase()) {
    throw invalidManifest(`${label} must use lowercase hexadecimal`);
  }
  return value as Address;
}

function requireHash(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw invalidManifest(`${label} must be a bytes32 value`);
  }
  if (value !== value.toLowerCase()) {
    throw invalidManifest(`${label} must use lowercase hexadecimal`);
  }
  return value as Hex;
}

function requireBlock(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw invalidManifest(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function invalidManifest(message: string): BossDataSourceError {
  return new BossDataSourceError("INVALID_MANIFEST", message);
}
