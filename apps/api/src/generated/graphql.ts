import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { AudienceRow } from '@agents-review/db/audiences';
import type { PreviewParent, ApiContext } from '../context.ts';
import type { MemberRow } from '@agents-review/db/audience-members';
import type { SyncRunWithAudience } from '@agents-review/db/sync-runs';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** An exact moment as an ISO 8601 string in UTC, like 2026-11-14T15:30:00.000Z. */
  DateTime: { input: Date; output: Date; }
};

export type AttributeCondition = {
  __typename?: 'AttributeCondition';
  field: AttributeField;
  operator: ConditionOperator;
  value: Scalars['String']['output'];
};

/** `value` is a country code of 3 uppercase letters, like DEU. */
export type AttributeConditionInput = {
  field: AttributeField;
  operator: ConditionOperator;
  value: Scalars['String']['input'];
};

export type AttributeField =
  | 'COUNTRY';

export type Audience = {
  __typename?: 'Audience';
  createdAt: Scalars['DateTime']['output'];
  definition: AudienceFilter;
  id: Scalars['ID']['output'];
  memberCount: Scalars['Int']['output'];
  /** Members ordered by customer id. `first` is 1 to 100; `after` is the previous page's endCursor. */
  members: MemberConnection;
  name: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};


export type AudienceMembersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type AudienceFilter = {
  __typename?: 'AudienceFilter';
  conditions: Array<FilterCondition>;
  match: FilterMatch;
  version: Scalars['Int']['output'];
};

/** 1 to 20 conditions. */
export type AudienceFilterInput = {
  conditions: Array<FilterConditionInput>;
  match: FilterMatch;
  version?: Scalars['Int']['input'];
};

export type AudiencePreview = {
  __typename?: 'AudiencePreview';
  memberCount: Scalars['Int']['output'];
  members: MemberConnection;
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

/** A country customers can be filtered by. */
export type Country = {
  __typename?: 'Country';
  /** ISO 3166-1 alpha-3, like DEU. This is what a filter stores. */
  code: Scalars['String']['output'];
  /** English name, like Germany. The code when the name is unknown. */
  name: Scalars['String']['output'];
};

/** `name` is trimmed and must be 1 to 100 characters. */
export type CreateAudienceInput = {
  definition: AudienceFilterInput;
  name: Scalars['String']['input'];
};

export type EventCondition = {
  __typename?: 'EventCondition';
  /** An event type, like purchase or page_view. */
  eventType: Scalars['String']['output'];
  operator: ConditionOperator;
  window: TimeWindow;
};

export type EventConditionInput = {
  eventType: Scalars['String']['input'];
  operator: ConditionOperator;
  window: TimeWindowInput;
};

export type FilterCondition = AttributeCondition | EventCondition | SignedUpCondition;

/** Exactly one field is set. */
export type FilterConditionInput =
  { attribute: AttributeConditionInput; event?: never; signedUp?: never; }
  |  { attribute?: never; event: EventConditionInput; signedUp?: never; }
  |  { attribute?: never; event?: never; signedUp: SignedUpConditionInput; };

/** Customers match when ALL conditions are true, or when ANY one is. */
export type FilterMatch =
  | 'ALL'
  | 'ANY';

export type Member = {
  __typename?: 'Member';
  /** ISO 3166-1 alpha-3, like DEU. */
  country: Scalars['String']['output'];
  email: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastName: Scalars['String']['output'];
};

export type MemberConnection = {
  __typename?: 'MemberConnection';
  nodes: Array<Member>;
  pageInfo: PageInfo;
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Hides the audience; its sync history is kept. Fails for an unknown or archived audience. */
  archiveAudience: Audience;
  createAudience: Audience;
  /** Queues a sync of the audience's current members. Fails for an unknown or archived audience, or when a sync of it is already queued or running. */
  startSync: SyncRun;
  /** Changes the name, the filter, or both. Fails for an unknown or archived audience. */
  updateAudience: Audience;
};


export type MutationArchiveAudienceArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCreateAudienceArgs = {
  input: CreateAudienceInput;
};


export type MutationStartSyncArgs = {
  audienceId: Scalars['ID']['input'];
};


export type MutationUpdateAudienceArgs = {
  id: Scalars['ID']['input'];
  input: UpdateAudienceInput;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  /** Pass as `after` to get the next page. Null when the page is empty. */
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** Null when the audience doesn't exist or is archived. */
  audience?: Maybe<Audience>;
  /** Audiences that aren't archived, newest first. */
  audiences: Array<Audience>;
  /** Countries at least one customer has, sorted by name. */
  countries: Array<Country>;
  hello: Scalars['String']['output'];
  /** Count and members for a filter without saving it. `first` is 1 to 100. */
  previewAudience: AudiencePreview;
  /** Null when the run doesn't exist. */
  syncRun?: Maybe<SyncRun>;
  /** Runs newest first, for one audience or all. `first` is 1 to 100; `after` is the previous page's endCursor. */
  syncRuns: SyncRunConnection;
};


export type QueryAudienceArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPreviewAudienceArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  definition: AudienceFilterInput;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QuerySyncRunArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySyncRunsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  audienceId?: InputMaybe<Scalars['ID']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type SignedUpCondition = {
  __typename?: 'SignedUpCondition';
  operator: ConditionOperator;
  window: TimeWindow;
};

export type SignedUpConditionInput = {
  operator: ConditionOperator;
  window: TimeWindowInput;
};

/** One sync of an audience's members to the ad platform. */
export type SyncRun = {
  __typename?: 'SyncRun';
  audience: Audience;
  createdAt: Scalars['DateTime']['output'];
  /** Why the run failed. Null unless the status is FAILED. */
  error?: Maybe<Scalars['String']['output']>;
  /** Members in batches that failed. */
  failedCount: Scalars['Int']['output'];
  finishedAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  /** Members in the snapshot taken when the run started. */
  memberCount: Scalars['Int']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  status: SyncRunStatus;
  /** Members in batches the ad platform accepted. */
  syncedCount: Scalars['Int']['output'];
};

export type SyncRunConnection = {
  __typename?: 'SyncRunConnection';
  nodes: Array<SyncRun>;
  pageInfo: PageInfo;
};

export type SyncRunStatus =
  | 'FAILED'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED';

/** A period ending now, like the last 30 days. */
export type TimeWindow = {
  __typename?: 'TimeWindow';
  amount: Scalars['Int']['output'];
  unit: WindowUnit;
};

/** `amount` is a whole number from 1 to 1000. */
export type TimeWindowInput = {
  amount: Scalars['Int']['input'];
  unit: WindowUnit;
};

/** Fields left out keep their current value. */
export type UpdateAudienceInput = {
  definition?: InputMaybe<AudienceFilterInput>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type WindowUnit =
  | 'DAY'
  | 'MONTH'
  | 'WEEK';



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping of union types */
export type ResolversUnionTypes<_RefType extends Record<string, unknown>> = {
  FilterCondition:
    | ( AttributeCondition )
    | ( EventCondition )
    | ( SignedUpCondition )
  ;
};


/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AttributeCondition: ResolverTypeWrapper<AttributeCondition>;
  AttributeConditionInput: AttributeConditionInput;
  AttributeField: AttributeField;
  Audience: ResolverTypeWrapper<AudienceRow>;
  AudienceFilter: ResolverTypeWrapper<Omit<AudienceFilter, 'conditions'> & { conditions: Array<ResolversTypes['FilterCondition']> }>;
  AudienceFilterInput: AudienceFilterInput;
  AudiencePreview: ResolverTypeWrapper<PreviewParent>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  ConditionOperator: ConditionOperator;
  Country: ResolverTypeWrapper<Country>;
  CreateAudienceInput: CreateAudienceInput;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  EventCondition: ResolverTypeWrapper<EventCondition>;
  EventConditionInput: EventConditionInput;
  FilterCondition: ResolverTypeWrapper<ResolversUnionTypes<ResolversTypes>['FilterCondition']>;
  FilterConditionInput: FilterConditionInput;
  FilterMatch: FilterMatch;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Member: ResolverTypeWrapper<MemberRow>;
  MemberConnection: ResolverTypeWrapper<Omit<MemberConnection, 'nodes'> & { nodes: Array<ResolversTypes['Member']> }>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  SignedUpCondition: ResolverTypeWrapper<SignedUpCondition>;
  SignedUpConditionInput: SignedUpConditionInput;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  SyncRun: ResolverTypeWrapper<SyncRunWithAudience>;
  SyncRunConnection: ResolverTypeWrapper<Omit<SyncRunConnection, 'nodes'> & { nodes: Array<ResolversTypes['SyncRun']> }>;
  SyncRunStatus: SyncRunStatus;
  TimeWindow: ResolverTypeWrapper<TimeWindow>;
  TimeWindowInput: TimeWindowInput;
  UpdateAudienceInput: UpdateAudienceInput;
  WindowUnit: WindowUnit;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AttributeCondition: AttributeCondition;
  AttributeConditionInput: AttributeConditionInput;
  Audience: AudienceRow;
  AudienceFilter: Omit<AudienceFilter, 'conditions'> & { conditions: Array<ResolversParentTypes['FilterCondition']> };
  AudienceFilterInput: AudienceFilterInput;
  AudiencePreview: PreviewParent;
  Boolean: Scalars['Boolean']['output'];
  Country: Country;
  CreateAudienceInput: CreateAudienceInput;
  DateTime: Scalars['DateTime']['output'];
  EventCondition: EventCondition;
  EventConditionInput: EventConditionInput;
  FilterCondition: ResolversUnionTypes<ResolversParentTypes>['FilterCondition'];
  FilterConditionInput: FilterConditionInput;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Member: MemberRow;
  MemberConnection: Omit<MemberConnection, 'nodes'> & { nodes: Array<ResolversParentTypes['Member']> };
  Mutation: Record<PropertyKey, never>;
  PageInfo: PageInfo;
  Query: Record<PropertyKey, never>;
  SignedUpCondition: SignedUpCondition;
  SignedUpConditionInput: SignedUpConditionInput;
  String: Scalars['String']['output'];
  SyncRun: SyncRunWithAudience;
  SyncRunConnection: Omit<SyncRunConnection, 'nodes'> & { nodes: Array<ResolversParentTypes['SyncRun']> };
  TimeWindow: TimeWindow;
  TimeWindowInput: TimeWindowInput;
  UpdateAudienceInput: UpdateAudienceInput;
};

export type AttributeConditionResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['AttributeCondition'] = ResolversParentTypes['AttributeCondition']> = {
  field?: Resolver<ResolversTypes['AttributeField'], ParentType, ContextType>;
  operator?: Resolver<ResolversTypes['ConditionOperator'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AudienceResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['Audience'] = ResolversParentTypes['Audience']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  definition?: Resolver<ResolversTypes['AudienceFilter'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  memberCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  members?: Resolver<ResolversTypes['MemberConnection'], ParentType, ContextType, RequireFields<AudienceMembersArgs, 'first'>>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type AudienceFilterResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['AudienceFilter'] = ResolversParentTypes['AudienceFilter']> = {
  conditions?: Resolver<Array<ResolversTypes['FilterCondition']>, ParentType, ContextType>;
  match?: Resolver<ResolversTypes['FilterMatch'], ParentType, ContextType>;
  version?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type AudiencePreviewResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['AudiencePreview'] = ResolversParentTypes['AudiencePreview']> = {
  memberCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  members?: Resolver<ResolversTypes['MemberConnection'], ParentType, ContextType>;
};

export type CountryResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['Country'] = ResolversParentTypes['Country']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type EventConditionResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['EventCondition'] = ResolversParentTypes['EventCondition']> = {
  eventType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  operator?: Resolver<ResolversTypes['ConditionOperator'], ParentType, ContextType>;
  window?: Resolver<ResolversTypes['TimeWindow'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FilterConditionResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['FilterCondition'] = ResolversParentTypes['FilterCondition']> = {
  __resolveType: TypeResolveFn<'AttributeCondition' | 'EventCondition' | 'SignedUpCondition', ParentType, ContextType>;
};

export type MemberResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['Member'] = ResolversParentTypes['Member']> = {
  country?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  firstName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type MemberConnectionResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['MemberConnection'] = ResolversParentTypes['MemberConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['Member']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  archiveAudience?: Resolver<ResolversTypes['Audience'], ParentType, ContextType, RequireFields<MutationArchiveAudienceArgs, 'id'>>;
  createAudience?: Resolver<ResolversTypes['Audience'], ParentType, ContextType, RequireFields<MutationCreateAudienceArgs, 'input'>>;
  startSync?: Resolver<ResolversTypes['SyncRun'], ParentType, ContextType, RequireFields<MutationStartSyncArgs, 'audienceId'>>;
  updateAudience?: Resolver<ResolversTypes['Audience'], ParentType, ContextType, RequireFields<MutationUpdateAudienceArgs, 'id' | 'input'>>;
};

export type PageInfoResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type QueryResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  audience?: Resolver<Maybe<ResolversTypes['Audience']>, ParentType, ContextType, RequireFields<QueryAudienceArgs, 'id'>>;
  audiences?: Resolver<Array<ResolversTypes['Audience']>, ParentType, ContextType>;
  countries?: Resolver<Array<ResolversTypes['Country']>, ParentType, ContextType>;
  hello?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  previewAudience?: Resolver<ResolversTypes['AudiencePreview'], ParentType, ContextType, RequireFields<QueryPreviewAudienceArgs, 'definition' | 'first'>>;
  syncRun?: Resolver<Maybe<ResolversTypes['SyncRun']>, ParentType, ContextType, RequireFields<QuerySyncRunArgs, 'id'>>;
  syncRuns?: Resolver<ResolversTypes['SyncRunConnection'], ParentType, ContextType, RequireFields<QuerySyncRunsArgs, 'first'>>;
};

export type SignedUpConditionResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['SignedUpCondition'] = ResolversParentTypes['SignedUpCondition']> = {
  operator?: Resolver<ResolversTypes['ConditionOperator'], ParentType, ContextType>;
  window?: Resolver<ResolversTypes['TimeWindow'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SyncRunResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['SyncRun'] = ResolversParentTypes['SyncRun']> = {
  audience?: Resolver<ResolversTypes['Audience'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  failedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  finishedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  memberCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  startedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['SyncRunStatus'], ParentType, ContextType>;
  syncedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type SyncRunConnectionResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['SyncRunConnection'] = ResolversParentTypes['SyncRunConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['SyncRun']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
};

export type TimeWindowResolvers<ContextType = ApiContext, ParentType extends ResolversParentTypes['TimeWindow'] = ResolversParentTypes['TimeWindow']> = {
  amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  unit?: Resolver<ResolversTypes['WindowUnit'], ParentType, ContextType>;
};

export type Resolvers<ContextType = ApiContext> = {
  AttributeCondition?: AttributeConditionResolvers<ContextType>;
  Audience?: AudienceResolvers<ContextType>;
  AudienceFilter?: AudienceFilterResolvers<ContextType>;
  AudiencePreview?: AudiencePreviewResolvers<ContextType>;
  Country?: CountryResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  EventCondition?: EventConditionResolvers<ContextType>;
  FilterCondition?: FilterConditionResolvers<ContextType>;
  Member?: MemberResolvers<ContextType>;
  MemberConnection?: MemberConnectionResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  SignedUpCondition?: SignedUpConditionResolvers<ContextType>;
  SyncRun?: SyncRunResolvers<ContextType>;
  SyncRunConnection?: SyncRunConnectionResolvers<ContextType>;
  TimeWindow?: TimeWindowResolvers<ContextType>;
};

