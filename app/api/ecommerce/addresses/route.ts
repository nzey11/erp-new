import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, handleCustomerAuthError } from "@/lib/shared/customer-auth";
import { parseBody, validationError } from "@/lib/shared/validation";
import { createAddressSchema, updateAddressSchema } from "@/lib/modules/ecommerce/schemas/addresses.schema";
import { AddressService } from "@/lib/modules/ecommerce";

/** GET /api/ecommerce/addresses — Get customer addresses */
export async function GET() {
  try {
    const customer = await requireCustomer();

    const addresses = await AddressService.list(customer.id);

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
      await AddressService.clearDefaults(customer.id);
    }

    const address = await AddressService.create({
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
    const existing = await AddressService.findById(id);

    if (!existing || existing.customerId !== customer.id) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    // If isDefault, unset other defaults
    if (isDefault) {
      await AddressService.clearDefaultsExcluding(customer.id, id);
    }

    const address = await AddressService.update(id, {
      label: label ?? undefined,
      recipientName: recipientName ?? undefined,
      phone: phone ?? undefined,
      city: city ?? undefined,
      street: street ?? undefined,
      building: building ?? undefined,
      apartment: apartment ?? undefined,
      postalCode: postalCode ?? undefined,
      isDefault: isDefault ?? undefined,
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
    const address = await AddressService.findById(id);

    if (!address || address.customerId !== customer.id) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    await AddressService.delete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return handleCustomerAuthError(error);
  }
}
