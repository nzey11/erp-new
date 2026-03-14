/**
 * Tests for build-party-list-query-string
 */

import { describe, it, expect } from "vitest";
import {
  buildPartyListQueryString,
  buildPaginationQueryString,
  buildFilterQueryString,
  buildResetQueryString,
} from "../../../app/(accounting)/crm/parties/_lib/build-party-list-query-string";
import type { PartyListParams } from "../../../app/(accounting)/crm/parties/_lib/types";

describe("buildPartyListQueryString", () => {
  const defaultParams: PartyListParams = {
    search: undefined,
    type: undefined,
    ownerId: undefined,
    page: 1,
    pageSize: 20,
  };

  describe("empty params", () => {
    it("returns empty string for empty params", () => {
      const result = buildPartyListQueryString(defaultParams);
      expect(result).toBe("");
    });
  });

  describe("search", () => {
    it("includes search param", () => {
      const result = buildPartyListQueryString({ ...defaultParams, search: "test" });
      expect(result).toBe("?search=test");
    });

    it("excludes empty search", () => {
      const result = buildPartyListQueryString({ ...defaultParams, search: "" });
      expect(result).toBe("");
    });
  });

  describe("type", () => {
    it("includes type param", () => {
      const result = buildPartyListQueryString({ ...defaultParams, type: "person" });
      expect(result).toBe("?type=person");
    });
  });

  describe("owner", () => {
    it("includes owner param (mapped from ownerId)", () => {
      const result = buildPartyListQueryString({ ...defaultParams, ownerId: "user_123" });
      expect(result).toBe("?owner=user_123");
    });
  });

  describe("page", () => {
    it("excludes page 1", () => {
      const result = buildPartyListQueryString({ ...defaultParams, page: 1 });
      expect(result).toBe("");
    });

    it("includes page > 1", () => {
      const result = buildPartyListQueryString({ ...defaultParams, page: 3 });
      expect(result).toBe("?page=3");
    });
  });

  describe("resetPage option", () => {
    it("resets page to 1 by default", () => {
      const result = buildPartyListQueryString({ ...defaultParams, search: "test", page: 5 });
      expect(result).toBe("?search=test");
    });

    it("preserves page when resetPage is false", () => {
      const result = buildPartyListQueryString(
        { ...defaultParams, search: "test", page: 5 },
        { resetPage: false }
      );
      expect(result).toBe("?search=test&page=5");
    });
  });

  describe("overrides", () => {
    it("applies overrides", () => {
      const result = buildPartyListQueryString(
        { ...defaultParams, search: "old" },
        { overrides: { search: "new" } }
      );
      expect(result).toBe("?search=new");
    });
  });

  describe("combined params", () => {
    it("builds query string with multiple params", () => {
      const result = buildPartyListQueryString({
        search: "test",
        type: "person",
        ownerId: "user_123",
        page: 2,
        pageSize: 20,
      }, { resetPage: false });
      expect(result).toBe("?search=test&type=person&owner=user_123&page=2");
    });
  });
});

describe("buildPaginationQueryString", () => {
  const defaultParams: PartyListParams = {
    search: "test",
    type: "person",
    ownerId: undefined,
    page: 2,
    pageSize: 20,
  };

  it("preserves filters and changes page", () => {
    const result = buildPaginationQueryString(defaultParams, 5);
    expect(result).toBe("?search=test&type=person&page=5");
  });

  it("excludes page 1", () => {
    const result = buildPaginationQueryString(defaultParams, 1);
    expect(result).toBe("?search=test&type=person");
  });
});

describe("buildFilterQueryString", () => {
  const defaultParams: PartyListParams = {
    search: "old",
    type: undefined,
    ownerId: undefined,
    page: 5,
    pageSize: 20,
  };

  it("resets page to 1", () => {
    const result = buildFilterQueryString(defaultParams, { search: "new" });
    expect(result).toBe("?search=new");
  });

  it("applies filter overrides", () => {
    const result = buildFilterQueryString(defaultParams, { type: "organization" });
    expect(result).toBe("?search=old&type=organization");
  });
});

describe("buildResetQueryString", () => {
  it("returns empty string", () => {
    const result = buildResetQueryString();
    expect(result).toBe("");
  });
});
