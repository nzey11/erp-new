"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/domain/ecommerce/RichTextEditor";
import { ChevronLeft, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { generateSlug } from "@/lib/shared/utils";
import Link from "next/link";

export default function CmsPageEditPage() {
  const params = useParams();
  const router = useRouter();
  const pageId = params?.id as string;
  const isNew = pageId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [showInFooter, setShowInFooter] = useState(true);
  const [showInHeader, setShowInHeader] = useState(false);

  useEffect(() => {
    if (isNew) return;

    const fetchPage = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/accounting/cms-pages/${pageId}`);
        if (!res.ok) {
          toast.error("Страница не найдена");
          router.push("/cms-pages");
          return;
        }
        const data = await res.json();
        setTitle(data.title);
        setSlug(data.slug);
        setContent(data.content);
        setSeoTitle(data.seoTitle || "");
        setSeoDescription(data.seoDescription || "");
        setIsPublished(data.isPublished);
        setSortOrder(data.sortOrder);
        setShowInFooter(data.showInFooter);
        setShowInHeader(data.showInHeader);
      } catch {
        toast.error("Не удалось загрузить страницу");
        router.push("/cms-pages");
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [pageId, isNew, router]);

  const handleGenerateSlug = () => {
    if (title.trim()) {
      setSlug(generateSlug(title));
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Заголовок обязателен");
      return;
    }
    if (!slug.trim()) {
      toast.error("Slug обязателен");
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        slug: slug.trim(),
        content,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        isPublished,
        sortOrder,
        showInFooter,
        showInHeader,
      };

      const url = isNew
        ? "/api/accounting/cms-pages"
        : `/api/accounting/cms-pages/${pageId}`;

      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка сохранения");
      }

      const saved = await res.json();
      toast.success(isNew ? "Страница создана" : "Страница сохранена");

      if (isNew) {
        router.push(`/cms-pages/${saved.id}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-1/4 animate-pulse" />
        <div className="h-[400px] bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/cms-pages"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Назад к списку
          </Link>
          <PageHeader
            title={isNew ? "Новая страница" : "Редактирование страницы"}
          />
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Заголовок страницы *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="О компании"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="slug">URL (slug) *</Label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-0">
                    <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0">
                      /store/pages/
                    </span>
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="o-kompanii"
                      className="rounded-l-none"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateSlug}
                    title="Сгенерировать из заголовка"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Content Editor */}
          <Card className="p-6">
            <Label className="mb-3 block">Содержимое страницы</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Начните писать..."
            />
          </Card>

          {/* SEO */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">SEO</h3>
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="seoTitle">SEO Заголовок</Label>
                <Input
                  id="seoTitle"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder="Заголовок для поисковых систем"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="seoDescription">SEO Описание</Label>
                <Input
                  id="seoDescription"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Краткое описание для поисковых систем"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Publishing */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Публикация</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="isPublished">Опубликовано</Label>
                <Switch
                  id="isPublished"
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sortOrder">Порядок сортировки</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </Card>

          {/* Navigation */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Навигация</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="showInFooter">Показывать в футере</Label>
                <Switch
                  id="showInFooter"
                  checked={showInFooter}
                  onCheckedChange={setShowInFooter}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="showInHeader">Показывать в шапке</Label>
                <Switch
                  id="showInHeader"
                  checked={showInHeader}
                  onCheckedChange={setShowInHeader}
                />
              </div>
            </div>
          </Card>

          {/* Preview */}
          {!isNew && isPublished && (
            <Card className="p-6">
              <h3 className="font-semibold mb-3">Предпросмотр</h3>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(`/store/pages/${slug}`, "_blank")}
              >
                Открыть на сайте
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
