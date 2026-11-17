import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { graphql } from '../gql';
import type { AudienceFilterInput, CountriesQuery } from '../gql/graphql';
import { execute } from '../graphql/execute';

const AudiencesQuery = graphql(`
  query Audiences {
    audiences {
      id
      name
      memberCount
      createdAt
    }
  }
`);

const AudienceQuery = graphql(`
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
`);

const AudienceSummaryQuery = graphql(`
  query AudienceSummary($id: ID!) {
    audience(id: $id) {
      id
      name
      memberCount
    }
  }
`);

export const MEMBERS_PAGE_SIZE = 25;

const AudienceMembersQuery = graphql(`
  query AudienceMembers($id: ID!, $after: String) {
    audience(id: $id) {
      id
      members(first: 25, after: $after) {
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
`);

const CountriesQuery = graphql(`
  query Countries {
    countries {
      code
      name
    }
  }
`);

const AudiencePreviewCountQuery = graphql(`
  query AudiencePreviewCount($definition: AudienceFilterInput!) {
    previewAudience(definition: $definition, first: 1) {
      memberCount
    }
  }
`);

const CreateAudienceMutation = graphql(`
  mutation CreateAudience($input: CreateAudienceInput!) {
    createAudience(input: $input) {
      id
    }
  }
`);

const UpdateAudienceMutation = graphql(`
  mutation UpdateAudience($id: ID!, $input: UpdateAudienceInput!) {
    updateAudience(id: $id, input: $input) {
      id
    }
  }
`);

const ArchiveAudienceMutation = graphql(`
  mutation ArchiveAudience($id: ID!) {
    archiveAudience(id: $id) {
      id
    }
  }
`);

const keys = {
  audiences: ['audiences'] as const,
  audience: (id: string) => ['audience', id] as const,
  audienceSummary: (id: string) => ['audience', id, 'summary'] as const,
  audienceMembers: (id: string, after: string | null) =>
    ['audience', id, 'members', after] as const,
  countries: ['countries'] as const,
  preview: (definition: AudienceFilterInput | null) => ['audience-preview', definition] as const,
};

export interface AudienceValues {
  name: string;
  definition: AudienceFilterInput;
}

export function useAudiences() {
  return useQuery({
    queryKey: keys.audiences,
    queryFn: async () => (await execute(AudiencesQuery)).audiences,
  });
}

export function useAudience(id: string) {
  return useQuery({
    queryKey: keys.audience(id),
    queryFn: async () => (await execute(AudienceQuery, { id })).audience,
  });
}

/** Name and member count, fetched apart from the members so turning a page doesn't recount. */
export function useAudienceSummary(id: string) {
  return useQuery({
    queryKey: keys.audienceSummary(id),
    queryFn: async () => (await execute(AudienceSummaryQuery, { id })).audience,
  });
}

/** One page of members; `after` is the previous page's endCursor, null for the first. */
export function useAudienceMembers(id: string, after: string | null) {
  return useQuery({
    queryKey: keys.audienceMembers(id, after),
    queryFn: async () => (await execute(AudienceMembersQuery, { id, after })).audience,
    // Keep the current rows on screen while the next page loads.
    placeholderData: (previous) => previous,
  });
}

export const countryLabel = (country: CountriesQuery['countries'][number]) =>
  `${country.name} (${country.code})`;

export function useCountries() {
  return useQuery({
    queryKey: keys.countries,
    queryFn: async () => (await execute(CountriesQuery)).countries,
    // Customers' countries change rarely; one fetch per page load is enough.
    staleTime: Infinity,
  });
}

/** Member count for an unsaved filter; idle while the filter is incomplete (null). */
export function usePreviewCount(definition: AudienceFilterInput | null) {
  return useQuery({
    queryKey: keys.preview(definition),
    queryFn: async () => {
      if (!definition) throw new Error('No filter to preview.');
      return (await execute(AudiencePreviewCountQuery, { definition })).previewAudience.memberCount;
    },
    enabled: definition !== null,
    // Keep the last count on screen while the next one loads.
    placeholderData: (previous) => previous,
  });
}

export function useCreateAudience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AudienceValues) =>
      (await execute(CreateAudienceMutation, { input })).createAudience,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.audiences }),
  });
}

export function useUpdateAudience(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AudienceValues) =>
      (await execute(UpdateAudienceMutation, { id, input })).updateAudience,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.audiences }),
        queryClient.invalidateQueries({ queryKey: keys.audience(id) }),
      ]),
  });
}

export function useArchiveAudience() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await execute(ArchiveAudienceMutation, { id })).archiveAudience,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.audiences }),
  });
}
