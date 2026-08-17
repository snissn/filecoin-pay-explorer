# @filecoin-pay/types

Shared TypeScript types for the Filecoin Pay Explorer monorepo, auto-generated from the subgraph GraphQL schema.

## Usage

```typescript
import { PaymentsMetric, Token, Rail } from "@filecoin-pay/types";
import type { Subscription } from "@filecoin-pay/types/boss";
```

## Generation

Pay and Boss types are generated from distinct schemas during build:

```bash
pnpm generate  # Generate types from GraphQL schema
pnpm build     # Generate types and compile TypeScript
```

## Dependencies

The Pay types depend on `packages/subgraph/schemas/schema.v1.graphql`. Boss types use the separate, pinned A10 client contract at `packages/types/schemas/boss.schema.graphql`; the two schemas are never merged. Types are regenerated whenever either schema changes.

Boss `BigInt` values are generated as decimal strings because GraphQL JSON transports them as strings; callers convert to native `bigint` only at explicit arithmetic boundaries.
