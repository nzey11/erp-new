"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Star, ShoppingCart, Heart } from "lucide-react";
import { Card, Tag, Button } from "antd";
import { formatRub } from "@/lib/shared/utils";
import { toast } from "sonner";

import { ProductImageGallery } from "@/components/domain/ecommerce/ProductImageGallery";
import { ProductVariantChips } from "@/components/domain/ecommerce/ProductVariantChips";
import { ProductTabs } from "@/components/domain/ecommerce/ProductTabs";
import { ProductBreadcrumb } from "@/components/domain/ecommerce/ProductBreadcrumb";
import { StockIndicator } from "@/components/domain/ecommerce/StockIndicator";
import { ShareButton } from "@/components/domain/ecommerce/ShareButton";
import { RelatedProducts } from "@/components/domain/ecommerce/RelatedProducts";
import { BuyOneClick } from "@/components/domain/ecommerce/BuyOneClick";
import { useCart } from "@/components/domain/ecommerce/CartContext";

type ProductDetail = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  price: number;
  discountedPrice: number | null;
  discount: { name: string; type: string; value: number } | null;
  inStock: boolean;
  stockQuantity: number;
  rating: number;
  reviewCount: number;
  unit: { name: string; shortName: string };
  category: { id: string; name: string } | null;
  characteristics: { name: string; value: string }[];
  variants: { id: string; option: string; type: string; priceAdjustment: number }[];
  variantLinks: { groupName: string; product: { id: string; name: string; slug: string | null; imageUrl: string | null } }[];
  reviews: { id: string; rating: number; title: string | null; comment: string | null; isVerifiedPurchase: boolean; customerName: string; createdAt: string }[];
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const cart = useCart();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [customer, setCustomer] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const res = await fetch("/api/auth/customer/me");
        if (res.ok) {
          const data = await res.json();
          setCustomer(data);
        }
      } catch {
        // Not authenticated
      }
    };
    fetchCustomer();
  }, []);

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ecommerce/products/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setProduct(data);
        } else if (res.status === 404) {
          toast.error("Товар не найден");
          router.push("/store/catalog");
        }
      } catch (error) {
        console.error("Failed to fetch product:", error);
        toast.error("Не удалось загрузить товар");
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchProduct();
    }
  }, [slug, router]);

  const handleAddToCart = async () => {
    if (!customer) {
      toast.error("Войдите или зарегистрируйтесь, чтобы добавить в корзину");
      router.push("/store/register");
      return;
    }

    if (!product) return;

    setAddingToCart(true);
    await cart.addToCart(product.id, selectedVariant || null, quantity);
    setAddingToCart(false);
  };

  const handleToggleFavorite = async () => {
    if (!customer) {
      toast.error("Войдите или зарегистрируйтесь, чтобы добавить в избранное");
      router.push("/store/register");
      return;
    }

    if (!product) return;

    try {
      const res = await fetch("/api/ecommerce/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });

      if (res.ok) {
        toast.success("Добавлено в избранное");
      } else {
        const error = await res.json();
        toast.error(error.error || "Не удалось добавить в избранное");
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
      toast.error("Не удалось добавить в избранное");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="grid md:grid-cols-2 gap-8">
          <div className="aspect-square bg-muted rounded-lg" />
          <div className="space-y-4">
            <div className="h-8 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-12 bg-muted rounded w-1/2" />
            <div className="h-10 bg-muted rounded w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Товар не найден</p>
        <Button variant="outlined" className="mt-4" onClick={() => router.push("/store/catalog")}>
          Вернуться в каталог
        </Button>
      </div>
    );
  }

  const finalPrice = product.discountedPrice || product.price;
  const variantPrice = selectedVariant
    ? finalPrice + (product.variants.find((v) => v.id === selectedVariant)?.priceAdjustment || 0)
    : finalPrice;

  const breadcrumbItems = [
    { name: "Каталог", href: "/store/catalog" },
    ...(product.category
      ? [{ name: product.category.name, href: `/store/catalog?category=${product.category.id}` }]
      : []),
    { name: product.name },
  ];

  const galleryImages = product.imageUrls?.length > 0
    ? product.imageUrls
    : product.imageUrl
      ? [product.imageUrl]
      : [];

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <ProductBreadcrumb items={breadcrumbItems} />

      {/* Product Main */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* Image Gallery */}
        <div className="relative">
          <ProductImageGallery images={galleryImages} productName={product.name} />
          {product.discount && (
            <Tag color="red" className="absolute top-4 right-4 z-10 text-lg">
              {product.discount.type === "percentage"
                ? `-${product.discount.value}%`
                : `-${formatRub(product.discount.value)}`}
            </Tag>
          )}
        </div>

        {/* Info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
            {product.reviewCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">{product.rating}</span>
                </div>
                <span className="text-muted-foreground">
                  ({product.reviewCount} {product.reviewCount === 1 ? "отзыв" : "отзывов"})
                </span>
              </div>
            )}
          </div>

          {/* Price */}
          <Card className="p-6">
            {product.discountedPrice ? (
              <div>
                <div className="text-lg text-muted-foreground line-through">
                  {formatRub(product.price)}
                </div>
                <div className="text-4xl font-bold text-primary">
                  {formatRub(variantPrice)}
                </div>
              </div>
            ) : (
              <div className="text-4xl font-bold">
                {formatRub(variantPrice)}
              </div>
            )}
            <div className="text-muted-foreground mt-2">
              за {product.unit.shortName}
            </div>
          </Card>

          {/* Variant Chips */}
          <ProductVariantChips
            variants={product.variants}
            selectedVariantId={selectedVariant}
            onSelect={setSelectedVariant}
          />

          {/* Quantity */}
          <div>
            <label className="text-sm font-medium mb-2 block">Количество</label>
            <div className="flex items-center gap-2">
              <Button
                variant="outlined"
                shape="circle"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                -
              </Button>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 text-center border rounded-md h-9"
              />
              <Button
                variant="outlined"
                shape="circle"
                onClick={() => setQuantity((q) => q + 1)}
              >
                +
              </Button>
            </div>
          </div>

          {/* Stock Status */}
          <StockIndicator quantity={product.stockQuantity} unitShortName={product.unit.shortName} />

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              size="large"
              type="primary"
              className="flex-1"
              onClick={handleAddToCart}
              disabled={!product.inStock || addingToCart}
              icon={<ShoppingCart className="h-5 w-5" />}
            >
              {addingToCart ? "Добавление..." : "В корзину"}
            </Button>
            <BuyOneClick
              productId={product.id}
              variantId={selectedVariant || null}
              quantity={quantity}
              price={variantPrice}
              productName={product.name}
            />
          </div>
          <div className="flex gap-3">
            {customer && (
              <Button size="large" variant="outlined" onClick={handleToggleFavorite} icon={<Heart className="h-5 w-5" />}>
                В избранное
              </Button>
            )}
            <ShareButton title={product.name} />
          </div>
        </div>
      </div>

      {/* Tabs: Description, Characteristics, Reviews */}
      <ProductTabs
        description={product.description}
        characteristics={product.characteristics}
        reviews={product.reviews}
        reviewCount={product.reviewCount}
      />

      {/* Variant Links */}
      {product.variantLinks.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Варианты товара</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {product.variantLinks.map((link, idx) => (
              <a key={idx} href={`/store/catalog/${link.product.slug || link.product.id}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                  <div className="relative aspect-square bg-muted">
                    {link.product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={link.product.imageUrl}
                        alt={link.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                        Нет фото
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium line-clamp-2">{link.product.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{link.groupName}</p>
                  </div>
                </Card>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Related Products */}
      {slug && <RelatedProducts slug={slug} />}
    </div>
  );
}
