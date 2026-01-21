export interface UserInfo {
  userId: string;
  userName: string;
  userProfileId: string;
  userEmail: string;
  isBloggerUser: boolean;
  signupTimeSec: number;
  isMultiLoginEnabled: boolean;
}

export interface UnreadCount {
  id: string;
  count: number;
  newestItemTimestampUsec: string;
}

export interface UnreadCountsResponse {
  max: number;
  unreadcounts: UnreadCount[];
}

export interface SubscriptionCategory {
  id: string;
  label: string;
}

export interface Subscription {
  id: string;
  title: string;
  url: string;
  htmlUrl?: string;
  iconUrl?: string;
  firstitemmsec?: string;
  categories: SubscriptionCategory[];
  sortid?: string;
}

export interface SubscriptionsResponse {
  subscriptions: Subscription[];
}

export interface Tag {
  id: string;
  sortid?: string;
  type?: string;
}

export interface TagsResponse {
  tags: Tag[];
}

export interface ItemOrigin {
  streamId: string;
  title: string;
  htmlUrl?: string;
}

export interface ItemSummary {
  direction: string;
  content: string;
}

export interface ItemCanonical {
  href: string;
}

export interface StreamItem {
  id: string;
  crawlTimeMsec?: string;
  timestampUsec?: string;
  published?: number;
  updated?: number;
  title: string;
  canonical?: ItemCanonical[];
  alternate?: ItemCanonical[];
  categories: string[];
  origin?: ItemOrigin;
  summary?: ItemSummary;
  author?: string;
}

export interface StreamContentsResponse {
  direction: string;
  id: string;
  title: string;
  description?: string;
  updated?: number;
  continuation?: string;
  items: StreamItem[];
}

export interface Config {
  appId: string;
  appKey: string;
  accessToken: string;
  refreshToken?: string;
  apiBaseUrl: string;
  oauthBaseUrl: string;
}
