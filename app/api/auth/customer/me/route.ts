import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession, requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { z } from "zod";
import { CustomerService } from "@/lib/modules/ecommerce";

/** GET /api/auth/customer/me — Get current customer */
export async function GET() {
  const customer = await getCustomerSession();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(customer);
}

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(6).max(20).optional(),
  email: z.string().email().max(200).optional().nullable(),
});

/** PATCH /api/auth/customer/me — Update current customer profile */
export async function PATCH(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const body = await request.json();
    const data = updateProfileSchema.parse(body);

    const updated = await CustomerService.updateProfile(customer.id, data);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.flatten() }, { status: 400 });
    }
    return handleCustomerAuthError(error);
  }
}
