/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query Audiences {\n    audiences {\n      id\n      name\n      memberCount\n      createdAt\n    }\n  }\n": typeof types.AudiencesDocument,
    "\n  query Audience($id: ID!) {\n    audience(id: $id) {\n      id\n      name\n      definition {\n        version\n        match\n        conditions {\n          __typename\n          ... on AttributeCondition {\n            field\n            operator\n            value\n          }\n          ... on SignedUpCondition {\n            operator\n            window {\n              amount\n              unit\n            }\n          }\n          ... on EventCondition {\n            eventType\n            operator\n            window {\n              amount\n              unit\n            }\n          }\n        }\n      }\n    }\n  }\n": typeof types.AudienceDocument,
    "\n  query AudienceSummary($id: ID!) {\n    audience(id: $id) {\n      id\n      name\n      memberCount\n    }\n  }\n": typeof types.AudienceSummaryDocument,
    "\n  query AudienceMembers($id: ID!, $first: Int!, $after: String) {\n    audience(id: $id) {\n      id\n      members(first: $first, after: $after) {\n        nodes {\n          id\n          email\n          firstName\n          lastName\n          country\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": typeof types.AudienceMembersDocument,
    "\n  query Countries {\n    countries {\n      code\n      name\n    }\n  }\n": typeof types.CountriesDocument,
    "\n  query AudiencePreviewCount($definition: AudienceFilterInput!) {\n    previewAudience(definition: $definition, first: 1) {\n      memberCount\n    }\n  }\n": typeof types.AudiencePreviewCountDocument,
    "\n  mutation CreateAudience($input: CreateAudienceInput!) {\n    createAudience(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateAudienceDocument,
    "\n  mutation UpdateAudience($id: ID!, $input: UpdateAudienceInput!) {\n    updateAudience(id: $id, input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateAudienceDocument,
    "\n  mutation ArchiveAudience($id: ID!) {\n    archiveAudience(id: $id) {\n      id\n    }\n  }\n": typeof types.ArchiveAudienceDocument,
};
const documents: Documents = {
    "\n  query Audiences {\n    audiences {\n      id\n      name\n      memberCount\n      createdAt\n    }\n  }\n": types.AudiencesDocument,
    "\n  query Audience($id: ID!) {\n    audience(id: $id) {\n      id\n      name\n      definition {\n        version\n        match\n        conditions {\n          __typename\n          ... on AttributeCondition {\n            field\n            operator\n            value\n          }\n          ... on SignedUpCondition {\n            operator\n            window {\n              amount\n              unit\n            }\n          }\n          ... on EventCondition {\n            eventType\n            operator\n            window {\n              amount\n              unit\n            }\n          }\n        }\n      }\n    }\n  }\n": types.AudienceDocument,
    "\n  query AudienceSummary($id: ID!) {\n    audience(id: $id) {\n      id\n      name\n      memberCount\n    }\n  }\n": types.AudienceSummaryDocument,
    "\n  query AudienceMembers($id: ID!, $first: Int!, $after: String) {\n    audience(id: $id) {\n      id\n      members(first: $first, after: $after) {\n        nodes {\n          id\n          email\n          firstName\n          lastName\n          country\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n": types.AudienceMembersDocument,
    "\n  query Countries {\n    countries {\n      code\n      name\n    }\n  }\n": types.CountriesDocument,
    "\n  query AudiencePreviewCount($definition: AudienceFilterInput!) {\n    previewAudience(definition: $definition, first: 1) {\n      memberCount\n    }\n  }\n": types.AudiencePreviewCountDocument,
    "\n  mutation CreateAudience($input: CreateAudienceInput!) {\n    createAudience(input: $input) {\n      id\n    }\n  }\n": types.CreateAudienceDocument,
    "\n  mutation UpdateAudience($id: ID!, $input: UpdateAudienceInput!) {\n    updateAudience(id: $id, input: $input) {\n      id\n    }\n  }\n": types.UpdateAudienceDocument,
    "\n  mutation ArchiveAudience($id: ID!) {\n    archiveAudience(id: $id) {\n      id\n    }\n  }\n": types.ArchiveAudienceDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Audiences {\n    audiences {\n      id\n      name\n      memberCount\n      createdAt\n    }\n  }\n"): typeof import('./graphql').AudiencesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Audience($id: ID!) {\n    audience(id: $id) {\n      id\n      name\n      definition {\n        version\n        match\n        conditions {\n          __typename\n          ... on AttributeCondition {\n            field\n            operator\n            value\n          }\n          ... on SignedUpCondition {\n            operator\n            window {\n              amount\n              unit\n            }\n          }\n          ... on EventCondition {\n            eventType\n            operator\n            window {\n              amount\n              unit\n            }\n          }\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').AudienceDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AudienceSummary($id: ID!) {\n    audience(id: $id) {\n      id\n      name\n      memberCount\n    }\n  }\n"): typeof import('./graphql').AudienceSummaryDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AudienceMembers($id: ID!, $first: Int!, $after: String) {\n    audience(id: $id) {\n      id\n      members(first: $first, after: $after) {\n        nodes {\n          id\n          email\n          firstName\n          lastName\n          country\n        }\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').AudienceMembersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Countries {\n    countries {\n      code\n      name\n    }\n  }\n"): typeof import('./graphql').CountriesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AudiencePreviewCount($definition: AudienceFilterInput!) {\n    previewAudience(definition: $definition, first: 1) {\n      memberCount\n    }\n  }\n"): typeof import('./graphql').AudiencePreviewCountDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateAudience($input: CreateAudienceInput!) {\n    createAudience(input: $input) {\n      id\n    }\n  }\n"): typeof import('./graphql').CreateAudienceDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateAudience($id: ID!, $input: UpdateAudienceInput!) {\n    updateAudience(id: $id, input: $input) {\n      id\n    }\n  }\n"): typeof import('./graphql').UpdateAudienceDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ArchiveAudience($id: ID!) {\n    archiveAudience(id: $id) {\n      id\n    }\n  }\n"): typeof import('./graphql').ArchiveAudienceDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
