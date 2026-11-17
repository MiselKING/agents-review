/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/** `value` is a country code of 3 uppercase letters, like DEU. */
export type AttributeConditionInput = {
  field: AttributeField;
  operator: ConditionOperator;
  value: string;
};

export type AttributeField =
  | 'COUNTRY';

/** 1 to 20 conditions. */
export type AudienceFilterInput = {
  conditions: Array<FilterConditionInput>;
  match: FilterMatch;
  version?: number;
};

/**
 * One enum for every condition, so a query can read `operator` on all condition types at once.
 * Attribute: IS, IS_NOT. Signed up: WITHIN_LAST, MORE_THAN_AGO. Event: PERFORMED, NOT_PERFORMED,
 * which also matches customers with no events at all. Other combinations are rejected.
 */
export type ConditionOperator =
  | 'IS'
  | 'IS_NOT'
  | 'MORE_THAN_AGO'
  | 'NOT_PERFORMED'
  | 'PERFORMED'
  | 'WITHIN_LAST';

/** `name` is trimmed and must be 1 to 100 characters. */
export type CreateAudienceInput = {
  definition: AudienceFilterInput;
  name: string;
};

export type EventConditionInput = {
  eventType: string;
  operator: ConditionOperator;
  window: TimeWindowInput;
};

/** Exactly one field is set. */
export type FilterConditionInput =
  {   attribute: AttributeConditionInput; event?: never; signedUp?: never; }
  |  { attribute?: never;   event: EventConditionInput; signedUp?: never; }
  |  { attribute?: never; event?: never;   signedUp: SignedUpConditionInput; };

/** Customers match when ALL conditions are true, or when ANY one is. */
export type FilterMatch =
  | 'ALL'
  | 'ANY';

export type SignedUpConditionInput = {
  operator: ConditionOperator;
  window: TimeWindowInput;
};

export type SyncRunStatus =
  | 'FAILED'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED';

/** `amount` is a whole number from 1 to 1000. */
export type TimeWindowInput = {
  amount: number;
  unit: WindowUnit;
};

/** Fields left out keep their current value. */
export type UpdateAudienceInput = {
  definition?: AudienceFilterInput | null | undefined;
  name?: string | null | undefined;
};

export type WindowUnit =
  | 'DAY'
  | 'MONTH'
  | 'WEEK';

export type AudiencesQueryVariables = Exact<{ [key: string]: never; }>;


export type AudiencesQuery = { audiences: Array<{ id: string, name: string, memberCount: number, createdAt: string }> };

export type AudienceQueryVariables = Exact<{
  id: string | number;
}>;


export type AudienceQuery = { audience: { id: string, name: string, definition: { version: number, match: FilterMatch, conditions: Array<
        | { __typename: 'AttributeCondition', field: AttributeField, operator: ConditionOperator, value: string }
        | { __typename: 'EventCondition', eventType: string, operator: ConditionOperator, window: { amount: number, unit: WindowUnit } }
        | { __typename: 'SignedUpCondition', operator: ConditionOperator, window: { amount: number, unit: WindowUnit } }
      > } } | null };

export type AudienceSummaryQueryVariables = Exact<{
  id: string | number;
}>;


export type AudienceSummaryQuery = { audience: { id: string, name: string, memberCount: number } | null };

export type AudienceMembersQueryVariables = Exact<{
  id: string | number;
  first: number;
  after?: string | null | undefined;
}>;


export type AudienceMembersQuery = { audience: { id: string, members: { nodes: Array<{ id: string, email: string, firstName: string, lastName: string, country: string }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } } | null };

export type CountriesQueryVariables = Exact<{ [key: string]: never; }>;


export type CountriesQuery = { countries: Array<{ code: string, name: string }> };

export type AudiencePreviewCountQueryVariables = Exact<{
  definition: AudienceFilterInput;
}>;


export type AudiencePreviewCountQuery = { previewAudience: { memberCount: number } };

export type CreateAudienceMutationVariables = Exact<{
  input: CreateAudienceInput;
}>;


export type CreateAudienceMutation = { createAudience: { id: string } };

export type UpdateAudienceMutationVariables = Exact<{
  id: string | number;
  input: UpdateAudienceInput;
}>;


export type UpdateAudienceMutation = { updateAudience: { id: string } };

export type ArchiveAudienceMutationVariables = Exact<{
  id: string | number;
}>;


export type ArchiveAudienceMutation = { archiveAudience: { id: string } };

export type SyncRunsQueryVariables = Exact<{
  first: number;
  after?: string | null | undefined;
}>;


export type SyncRunsQuery = { syncRuns: { nodes: Array<{ id: string, status: SyncRunStatus, memberCount: number, syncedCount: number, failedCount: number, error: string | null, createdAt: string, startedAt: string | null, finishedAt: string | null, audience: { id: string, name: string } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type StartSyncMutationVariables = Exact<{
  audienceId: string | number;
}>;


export type StartSyncMutation = { startSync: { id: string } };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const AudiencesDocument = new TypedDocumentString(`
    query Audiences {
  audiences {
    id
    name
    memberCount
    createdAt
  }
}
    `) as unknown as TypedDocumentString<AudiencesQuery, AudiencesQueryVariables>;
export const AudienceDocument = new TypedDocumentString(`
    query Audience($id: ID!) {
  audience(id: $id) {
    id
    name
    definition {
      version
      match
      conditions {
        __typename
        ... on AttributeCondition {
          field
          operator
          value
        }
        ... on SignedUpCondition {
          operator
          window {
            amount
            unit
          }
        }
        ... on EventCondition {
          eventType
          operator
          window {
            amount
            unit
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<AudienceQuery, AudienceQueryVariables>;
export const AudienceSummaryDocument = new TypedDocumentString(`
    query AudienceSummary($id: ID!) {
  audience(id: $id) {
    id
    name
    memberCount
  }
}
    `) as unknown as TypedDocumentString<AudienceSummaryQuery, AudienceSummaryQueryVariables>;
export const AudienceMembersDocument = new TypedDocumentString(`
    query AudienceMembers($id: ID!, $first: Int!, $after: String) {
  audience(id: $id) {
    id
    members(first: $first, after: $after) {
      nodes {
        id
        email
        firstName
        lastName
        country
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
    `) as unknown as TypedDocumentString<AudienceMembersQuery, AudienceMembersQueryVariables>;
export const CountriesDocument = new TypedDocumentString(`
    query Countries {
  countries {
    code
    name
  }
}
    `) as unknown as TypedDocumentString<CountriesQuery, CountriesQueryVariables>;
export const AudiencePreviewCountDocument = new TypedDocumentString(`
    query AudiencePreviewCount($definition: AudienceFilterInput!) {
  previewAudience(definition: $definition, first: 1) {
    memberCount
  }
}
    `) as unknown as TypedDocumentString<AudiencePreviewCountQuery, AudiencePreviewCountQueryVariables>;
export const CreateAudienceDocument = new TypedDocumentString(`
    mutation CreateAudience($input: CreateAudienceInput!) {
  createAudience(input: $input) {
    id
  }
}
    `) as unknown as TypedDocumentString<CreateAudienceMutation, CreateAudienceMutationVariables>;
export const UpdateAudienceDocument = new TypedDocumentString(`
    mutation UpdateAudience($id: ID!, $input: UpdateAudienceInput!) {
  updateAudience(id: $id, input: $input) {
    id
  }
}
    `) as unknown as TypedDocumentString<UpdateAudienceMutation, UpdateAudienceMutationVariables>;
export const ArchiveAudienceDocument = new TypedDocumentString(`
    mutation ArchiveAudience($id: ID!) {
  archiveAudience(id: $id) {
    id
  }
}
    `) as unknown as TypedDocumentString<ArchiveAudienceMutation, ArchiveAudienceMutationVariables>;
export const SyncRunsDocument = new TypedDocumentString(`
    query SyncRuns($first: Int!, $after: String) {
  syncRuns(first: $first, after: $after) {
    nodes {
      id
      status
      memberCount
      syncedCount
      failedCount
      error
      createdAt
      startedAt
      finishedAt
      audience {
        id
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    `) as unknown as TypedDocumentString<SyncRunsQuery, SyncRunsQueryVariables>;
export const StartSyncDocument = new TypedDocumentString(`
    mutation StartSync($audienceId: ID!) {
  startSync(audienceId: $audienceId) {
    id
  }
}
    `) as unknown as TypedDocumentString<StartSyncMutation, StartSyncMutationVariables>;