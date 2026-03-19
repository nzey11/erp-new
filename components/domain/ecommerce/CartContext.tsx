"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type CartItem = {
  id: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  slug: string | null;
  variantId: string | null;
  variantOption: string | null;
  quantity: number;
  priceSnapshot: number;
  unitShortName: string;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  totalAmount: number;
  loading: boolean;
  refreshCart: () => Promise<void>;
  addToCart: (productId: string, variantId: string | null, quantity: number) => Promise<boolean>;
  removeFromCart: (itemId: string) => Promise<boolean>;
  updateQuantity: (itemId: string, delta: number) => Promise<boolean>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}

export function useCartOptional() {
  return useContext(CartContext);
}

interface CartProviderProps {
  children: ReactNode;
  isAuthenticated: boolean;
}

export function CartProvider({ children, isAuthenticated }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const refreshCart = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ecommerce/cart");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addToCart = useCallback(
    async (productId: string, variantId: string | null, quantity: number): Promise<boolean> => {
      if (!isAuthenticated) {
        toast.error("Войдите или зарегистрируйтесь, чтобы добавить товар в корзину");
        router.push("/store/register");
        return false;
      }
      try {
        const res = await fetch("/api/ecommerce/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, variantId, quantity }),
        });

        if (res.ok) {
          toast.success("Товар добавлен в корзину");
          await refreshCart();
          return true;
        } else {
          const err = await res.json();
          toast.error(err.error || "Не удалось добавить в корзину");
          return false;
        }
      } catch {
        toast.error("Не удалось добавить в корзину");
        return false;
      }
    },
    [refreshCart]
  );

  const removeFromCart = useCallback(
    async (itemId: string): Promise<boolean> => {
      const prev = items;
      setItems((current) => current.filter((i) => i.id !== itemId));

      try {
        const res = await fetch(`/api/ecommerce/cart?itemId=${itemId}`, {
          method: "DELETE",
        });

        if (res.ok) {
          toast.success("Товар удалён из корзины");
          return true;
        } else {
          setItems(prev);
          toast.error("Не удалось удалить товар");
          return false;
        }
      } catch {
        setItems(prev);
        toast.error("Не удалось удалить товар");
        return false;
      }
    },
    [items]
  );

  const updateQuantity = useCallback(
    async (itemId: string, delta: number): Promise<boolean> => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return false;

      const newQuantity = item.quantity + delta;
      if (newQuantity < 1) return false;

      const prev = items;
      setItems((current) =>
        current.map((i) => (i.id === itemId ? { ...i, quantity: newQuantity } : i))
      );

      try {
        const res = await fetch("/api/ecommerce/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: item.productId,
            variantId: item.variantId,
            quantity: delta,
          }),
        });

        if (!res.ok) {
          setItems(prev);
          toast.error("Не удалось обновить количество");
          return false;
        }
        return true;
      } catch {
        setItems(prev);
        toast.error("Не удалось обновить количество");
        return false;
      }
    },
    [items]
  );

  const count = items.length;
  const totalAmount = items.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        count,
        totalAmount,
        loading,
        refreshCart,
        addToCart,
        removeFromCart,
        updateQuantity,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
