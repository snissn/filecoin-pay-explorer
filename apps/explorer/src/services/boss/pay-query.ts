import { gql } from "graphql-request";

export const GET_PAY_RAIL_ASSOCIATION_FACTS = gql`
  query GetPayRailAssociationFacts($railId: BigInt!) {
    rails(where: { railId: $railId }, first: 2) {
      railId
      validator
      payer {
        address
      }
      payee {
        address
      }
      operator {
        address
      }
      token {
        address
      }
    }
  }
`;
