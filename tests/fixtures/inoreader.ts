import type { StreamContentsResponse, UserInfo } from "../../src/types.js";

export const userInfo: UserInfo = {
  userId: "user-1",
  userName: "Test User",
  userProfileId: "profile-1",
  userEmail: "test@example.invalid",
  isBloggerUser: false,
  signupTimeSec: 1700000000,
  isMultiLoginEnabled: false,
};

export const streamContents: StreamContentsResponse = {
  direction: "ltr",
  id: "user/-/state/com.google/reading-list",
  title: "Reading list",
  continuation: "next-page",
  items: [
    {
      id: "item-1",
      title: "Article one",
      canonical: [{ href: "https://example.invalid/canonical" }],
      alternate: [{ href: "https://example.invalid/alternate" }],
      author: "Test Author",
      published: 1700000000,
      categories: [
        "user/-/state/com.google/read",
        "user/-/state/com.google/starred",
      ],
      origin: { streamId: "feed/example", title: "Example feed" },
      summary: { direction: "ltr", content: "x".repeat(501) },
    },
    {
      id: "item-2",
      title: "Article two",
      alternate: [{ href: "https://example.invalid/fallback" }],
      categories: [],
    },
    { id: "item-3", title: "Article three", categories: [] },
  ],
};

export const expectedArticles = [
  {
    id: "item-1",
    title: "Article one",
    url: "https://example.invalid/canonical",
    author: "Test Author",
    published: 1700000000,
    isRead: true,
    isStarred: true,
    feedTitle: "Example feed",
    summary: `${"x".repeat(500)}...`,
  },
  {
    id: "item-2",
    title: "Article two",
    url: "https://example.invalid/fallback",
    author: "",
    published: 0,
    isRead: false,
    isStarred: false,
  },
  {
    id: "item-3",
    title: "Article three",
    url: "",
    author: "",
    published: 0,
    isRead: false,
    isStarred: false,
  },
];
