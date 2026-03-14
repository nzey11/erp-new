/**
 * Tests for parse-party-list-params
 */

import { describe, it, expect } from "vitest";
import { parsePartyListParams } from "../../../app/(accounting)/crm/parties/_lib/parse-party-list-params";

describe("parsePartyListParams", () => {
  describe("empty input", () => {
    it("returns defaults for empty input", () => {
      const result = parsePartyListParams({});
      expect(result).toEqual({
        search: undefined,
        type: undefined,
        ownerId: undefined,
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe("search", () => {
    it("trims search input", () => {
      const result = parsePartyListParams({ search: "  ivan  " });
      expect(result.search).toBe("ivan");
    });

    it("converts empty string to undefined", () => {
      const result = parsePartyListParams({ search: "   " });
      expect(result.search).toBeUndefined();
    });

    it("preserves valid search", () => {
      const result = parsePartyListParams({ search: "test query" });
      expect(result.search).toBe("test query");
    });
  });

  describe("type", () => {
    it("accepts 'person' type", () => {
      const result = parsePartyListParams({ type: "person" });
      expect(result.type).toBe("person");
    });

    it("accepts 'organization' type", () => {
      const result = parsePartyListParams({ type: "organization" });
      expect(result.type).toBe("organization");
    });

    it("converts type to lowercase", () => {
      const result = parsePartyListParams({ type: "PERSON" });
      expect(result.type).toBe("person");
    });

    it("rejects invalid type", () => {
      const result = parsePartyListParams({ type: "invalid" });
      expect(result.type).toBeUndefined();
    });

    it("rejects empty type", () => {
      const result = parsePartyListParams({ type: "" });
      expect(result.type).toBeUndefined();
    });
  });

  describe("owner", () => {
    it("maps owner to ownerId", () => {
      const result = parsePartyListParams({ owner: "user_123" });
      expect(result.ownerId).toBe("user_123");
    });

    it("trims owner input", () => {
      const result = parsePartyListParams({ owner: "  user_123  " });
      expect(result.ownerId).toBe("user_123");
    });

    it("converts empty owner to undefined", () => {
      const result = parsePartyListParams({ owner: "   " });
      expect(result.ownerId).toBeUndefined();
    });
  });

  describe("page", () => {
    it("parses valid page number", () => {
      const result = parsePartyListParams({ page: "5" });
      expect(result.page).toBe(5);
    });

    it("defaults to 1 for missing page", () => {
      const result = parsePartyListParams({});
      expect(result.page).toBe(1);
    });

    it("defaults to 1 for invalid page", () => {
      const result = parsePartyListParams({ page: "invalid" });
      expect(result.page).toBe(1);
    });

    it("defaults to 1 for negative page", () => {
      const result = parsePartyListParams({ page: "-5" });
      expect(result.page).toBe(1);
    });

    it("defaults to 1 for zero page", () => {
      const result = parsePartyListParams({ page: "0" });
      expect(result.page).toBe(1);
    });

    it("defaults to 1 for float page", () => {
      const result = parsePartyListParams({ page: "2.5" });
      expect(result.page).toBe(1);
    });
  });

  describe("pageSize", () => {
    it("always returns 20", () => {
      const result = parsePartyListParams({});
      expect(result.pageSize).toBe(20);
    });
  });

  describe("combined params", () => {
    it("parses all params together", () => {
      const result = parsePartyListParams({
        search: "  test  ",
        type: "person",
        owner: "user_123",
        page: "3",
      });
      expect(result).toEqual({
        search: "test",
        type: "person",
        ownerId: "user_123",
        page: 3,
        pageSize: 20,
      });
    });
  });
});
