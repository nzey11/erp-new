import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyTelegramAuth } from "@/lib/modules/integrations/telegram";

const BOT_TOKEN = "test_bot_token_for_unit_tests";

/**
 * Compute a valid Telegram auth hash for the given fields.
 * Mirrors the algorithm in verifyTelegramAuth.
 */
function buildValidHash(fields: Record<string, string>): string {
  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest();
  return crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
}

function freshAuthDate(): string {
  return String(Math.floor(Date.now() / 1000));
}

describe("verifyTelegramAuth", () => {
  describe("valid data", () => {
    it("should return true for correctly signed minimal payload (id + auth_date)", () => {
      const fields = { id: "123456789", auth_date: freshAuthDate() };
      const hash = buildValidHash(fields);

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(true);
    });

    it("should return true with all optional fields present", () => {
      const fields = {
        id: "987654321",
        first_name: "Ivan",
        last_name: "Petrov",
        username: "ivan_p",
        auth_date: freshAuthDate(),
      };
      const hash = buildValidHash(fields);

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(true);
    });

    it("should return true when photo_url is present in payload", () => {
      const fields = {
        id: "111222333",
        first_name: "Anna",
        photo_url: "https://t.me/i/userpic/320/test.jpg",
        auth_date: freshAuthDate(),
      };
      const hash = buildValidHash(fields);

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(true);
    });
  });

  describe("invalid hash", () => {
    it("should return false when hash is completely wrong", () => {
      const fields = { id: "123", auth_date: freshAuthDate() };
      expect(
        verifyTelegramAuth({ ...fields, hash: "deadbeef".repeat(8) }, BOT_TOKEN)
      ).toBe(false);
    });

    it("should return false when hash is missing", () => {
      const fields = { id: "123", auth_date: freshAuthDate() };
      // No hash key at all
      expect(verifyTelegramAuth(fields, BOT_TOKEN)).toBe(false);
    });

    it("should return false when hash was signed with a different bot token", () => {
      const fields = { id: "123", auth_date: freshAuthDate() };
      const wrongHash = buildValidHash(fields); // signed with BOT_TOKEN
      const differentToken = "completely_different_token";

      // Verify against different token → should fail
      expect(verifyTelegramAuth({ ...fields, hash: wrongHash }, differentToken)).toBe(false);
    });

    it("should return false when payload was tampered after signing", () => {
      const fields = { id: "123", first_name: "Real", auth_date: freshAuthDate() };
      const hash = buildValidHash(fields);

      // Tamper: change first_name after signing
      expect(
        verifyTelegramAuth({ ...fields, first_name: "Hacker", hash }, BOT_TOKEN)
      ).toBe(false);
    });
  });

  describe("expired auth_date", () => {
    it("should return false when auth_date is older than 86400 seconds", () => {
      const expiredDate = String(Math.floor(Date.now() / 1000) - 90000); // 25 hours ago
      const fields = { id: "555", auth_date: expiredDate };
      const hash = buildValidHash(fields);

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(false);
    });

    it("should return false when auth_date is exactly at the boundary (86401s ago)", () => {
      const boundaryDate = String(Math.floor(Date.now() / 1000) - 86401);
      const fields = { id: "666", auth_date: boundaryDate };
      const hash = buildValidHash(fields);

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(false);
    });

    it("should return true when auth_date is just within the 86400-second window", () => {
      const recentDate = String(Math.floor(Date.now() / 1000) - 86300); // ~23h 59m ago
      const fields = { id: "777", auth_date: recentDate };
      const hash = buildValidHash(fields);

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(true);
    });

    it("should return false when auth_date is 0 (epoch)", () => {
      const fields = { id: "888", auth_date: "0" };
      const hash = buildValidHash(fields);

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should be case-sensitive: uppercase hash should fail", () => {
      const fields = { id: "321", auth_date: freshAuthDate() };
      const hash = buildValidHash(fields).toUpperCase();

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(false);
    });

    it("should correctly sort fields alphabetically for check-string", () => {
      // Fields provided in reverse alphabetical order — result must still be valid
      const authDate = freshAuthDate();
      const fields = {
        username: "z_user",
        last_name: "Z",
        id: "100",
        first_name: "A",
        auth_date: authDate,
      };
      const hash = buildValidHash(fields);

      expect(verifyTelegramAuth({ ...fields, hash }, BOT_TOKEN)).toBe(true);
    });
  });
});
