/**
 * E-commerce domain types.
 *
 * Core type definitions for orders, payments, and delivery.
 */

export type DeliveryType = "pickup" | "courier";
export type PaymentMethod = "tochka" | "cash";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

// Order item from cart
export interface CartItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  price: number;
}
