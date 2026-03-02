import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/shared/db";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createAddressSchema, updateAddressSchema } from "@/lib/modules/ecommerce/schemas/addresses.schema";

/** GET /api/ecommerce/addresses — Get customer addresses */
export async function GET() {
  try {
    const customer = await requireCustomer();

    const addresses = await db.customerAddress.findMany({
      where: { customerId: customer.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ addresses });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

/** POST /api/ecommerce/addresses — Create address */
export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const {
      label,
      recipientName,
      phone,
      city,
      street,
      building,
      apartment,
      postalCode,
      isDefault,
    } = await parseBody(request, createAddressSchema);

    // If isDefault, unset other defaults
    if (isDefault) {
      await db.customerAddress.updateMany({
        where: { customerId: customer.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await db.customerAddress.create({
      data: {
        customerId: customer.id,
        label,
        recipientName,
        phone,
        city,
        street,
        building,
        apartment,
        postalCode,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json({ address });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

/** PUT /api/ecommerce/addresses — Update address */
export async function PUT(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const {
      id,
      label,
      recipientName,
      phone,
      city,
      street,
      building,
      apartment,
      postalCode,
      isDefault,
    } = await parseBody(request, updateAddressSchema);

    // Verify ownership
    const existing = await db.customerAddress.findUnique({
      where: { id },
      select: { customerId: true },
    });

    if (!existing || existing.customerId !== customer.id) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    // If isDefault, unset other defaults
    if (isDefault) {
      await db.customerAddress.updateMany({
        where: { customerId: customer.id, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const address = await db.customerAddress.update({
      where: { id },
      data: {
        label: label ?? undefined,
        recipientName: recipientName ?? undefined,
        phone: phone ?? undefined,
        city: city ?? undefined,
        street: street ?? undefined,
        building: building ?? undefined,
        apartment: apartment ?? undefined,
        postalCode: postalCode ?? undefined,
        isDefault: isDefault ?? undefined,
      },
    });

    return NextResponse.json({ address });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}

/** DELETE /api/ecommerce/addresses?id=xxx — Delete address */
export async function DELETE(request: NextRequest) {
  try {
    const customer = await requireCustomer();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing address id" }, { status: 400 });
    }

    // Verify ownership
    const address = await db.customerAddress.findUnique({
      where: { id },
      select: { customerId: true },
    });

    if (!address || address.customerId !== customer.id) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    await db.customerAddress.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}
