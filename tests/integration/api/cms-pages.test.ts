import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestRequest, jsonResponse, mockAuthUser, mockAuthNone } from "../../helpers/api-client";
import { createUser, createStorePage } from "../../helpers/factories";

// Mock the auth module
vi.mock("@/lib/shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shared/auth")>();
  return {
    ...actual,
    getAuthSession: vi.fn(),
  };
});

import { GET as AdminList, POST as AdminCreate } from "@/app/api/accounting/cms-pages/route";
import { PATCH as AdminUpdate, DELETE as AdminDelete } from "@/app/api/accounting/cms-pages/[id]/route";
import { GET as PublicList } from "@/app/api/ecommerce/cms-pages/route";
import { GET as PublicGet } from "@/app/api/ecommerce/cms-pages/[slug]/route";

describe("API: CMS Pages", () => {
  let adminUser: Awaited<ReturnType<typeof createUser>>;

  beforeEach(async () => {
    adminUser = await createUser({ role: "admin" });
    mockAuthNone();
  });

  // ==========================================
  // Admin CRUD
  // ==========================================

  describe("POST /api/accounting/cms-pages", () => {
    it("should create a page with valid data", async () => {
      mockAuthUser(adminUser);

      const req = createTestRequest("/api/accounting/cms-pages", {
        method: "POST",
        body: {
          title: "О компании",
          slug: "about",
          content: "<p>Мы — крутая компания</p>",
          isPublished: true,
          showInFooter: true,
          showInHeader: false,
          sortOrder: 1,
        },
      });

      const res = await AdminCreate(req);
      expect(res.status).toBe(201);

      const data = await jsonResponse(res);
      expect(data.title).toBe("О компании");
      expect(data.slug).toBe("about");
      expect(data.isPublished).toBe(true);
      expect(data.showInFooter).toBe(true);
    });

    it("should reject duplicate slug", async () => {
      mockAuthUser(adminUser);
      await createStorePage({ slug: "about", title: "Existing" });

      const req = createTestRequest("/api/accounting/cms-pages", {
        method: "POST",
        body: {
          title: "Another About",
          slug: "about",
          content: "<p>Content</p>",
          isPublished: false,
          showInFooter: false,
          showInHeader: false,
          sortOrder: 0,
        },
      });

      const res = await AdminCreate(req);
      expect(res.status).toBe(409);
    });

    it("should reject without authentication", async () => {
      mockAuthNone();

      const req = createTestRequest("/api/accounting/cms-pages", {
        method: "POST",
        body: {
          title: "Test",
          slug: "test",
          content: "<p>Test</p>",
          isPublished: false,
          showInFooter: false,
          showInHeader: false,
          sortOrder: 0,
        },
      });

      const res = await AdminCreate(req);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/accounting/cms-pages", () => {
    it("should list all pages", async () => {
      mockAuthUser(adminUser);
      await createStorePage({ title: "Page A", slug: "page-a" });
      await createStorePage({ title: "Page B", slug: "page-b" });

      const req = createTestRequest("/api/accounting/cms-pages");
      const res = await AdminList(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(2);
    });

    it("should filter by search term", async () => {
      mockAuthUser(adminUser);
      await createStorePage({ title: "Доставка", slug: "delivery" });
      await createStorePage({ title: "Контакты", slug: "contacts" });

      const req = createTestRequest("/api/accounting/cms-pages", {
        query: { search: "Доставка" },
      });
      const res = await AdminList(req);
      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].title).toBe("Доставка");
    });
  });

  describe("PATCH /api/accounting/cms-pages/[id]", () => {
    it("should update page title", async () => {
      mockAuthUser(adminUser);
      const page = await createStorePage({ title: "Old Title", slug: "old" });

      const req = createTestRequest(`/api/accounting/cms-pages/${page.id}`, {
        method: "POST", // PATCH is sent as POST in body but route handles PATCH
        body: { title: "New Title" },
      });

      const res = await AdminUpdate(req, { params: Promise.resolve({ id: page.id }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.title).toBe("New Title");
    });

    it("should reject slug collision on update", async () => {
      mockAuthUser(adminUser);
      await createStorePage({ title: "Page A", slug: "page-a" });
      const pageB = await createStorePage({ title: "Page B", slug: "page-b" });

      const req = createTestRequest(`/api/accounting/cms-pages/${pageB.id}`, {
        method: "POST",
        body: { slug: "page-a" },
      });

      const res = await AdminUpdate(req, { params: Promise.resolve({ id: pageB.id }) });
      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /api/accounting/cms-pages/[id]", () => {
    it("should delete a page", async () => {
      mockAuthUser(adminUser);
      const page = await createStorePage({ title: "To Delete", slug: "delete-me" });

      const req = createTestRequest(`/api/accounting/cms-pages/${page.id}`, {
        method: "DELETE",
      });

      const res = await AdminDelete(req, { params: Promise.resolve({ id: page.id }) });
      expect(res.status).toBe(200);
    });
  });

  // ==========================================
  // Public API
  // ==========================================

  describe("GET /api/ecommerce/cms-pages (public)", () => {
    it("should return only published pages", async () => {
      await createStorePage({ title: "Published", slug: "pub", isPublished: true });
      await createStorePage({ title: "Draft", slug: "draft", isPublished: false });

      const req = createTestRequest("/api/ecommerce/cms-pages");
      const res = await PublicList(req);
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].title).toBe("Published");
    });

    it("should filter by showInFooter", async () => {
      await createStorePage({ title: "Footer", slug: "footer", isPublished: true, showInFooter: true });
      await createStorePage({ title: "No Footer", slug: "no-footer", isPublished: true, showInFooter: false });

      const req = createTestRequest("/api/ecommerce/cms-pages", {
        query: { showInFooter: "true" },
      });
      const res = await PublicList(req);
      const data = await jsonResponse(res);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].title).toBe("Footer");
    });
  });

  describe("GET /api/ecommerce/cms-pages/[slug] (public)", () => {
    it("should return published page by slug", async () => {
      await createStorePage({ title: "About Us", slug: "about-us", isPublished: true, content: "<p>Hello</p>" });

      const req = createTestRequest("/api/ecommerce/cms-pages/about-us");
      const res = await PublicGet(req, { params: Promise.resolve({ slug: "about-us" }) });
      expect(res.status).toBe(200);

      const data = await jsonResponse(res);
      expect(data.title).toBe("About Us");
      expect(data.content).toBe("<p>Hello</p>");
    });

    it("should return 404 for unpublished page", async () => {
      await createStorePage({ title: "Draft", slug: "draft-page", isPublished: false });

      const req = createTestRequest("/api/ecommerce/cms-pages/draft-page");
      const res = await PublicGet(req, { params: Promise.resolve({ slug: "draft-page" }) });
      expect(res.status).toBe(404);
    });

    it("should return 404 for non-existent slug", async () => {
      const req = createTestRequest("/api/ecommerce/cms-pages/nonexistent");
      const res = await PublicGet(req, { params: Promise.resolve({ slug: "nonexistent" }) });
      expect(res.status).toBe(404);
    });
  });
});
