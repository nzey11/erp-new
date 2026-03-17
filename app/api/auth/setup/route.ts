import { NextRequest, NextResponse } from "next/server";
import { parseBody, validationError } from "@/lib/shared/validation";
import { setupSchema } from "@/lib/shared/schemas/auth.schema";
import { hash } from "bcryptjs";
import { UserService } from "@/lib/modules/accounting";

export async function POST(request: NextRequest) {
  try {
    // Only allow setup if no users exist
    const userCount = await UserService.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Настройка уже выполнена" },
        { status: 400 }
      );
    }

    const { username, password } = await parseBody(request, setupSchema);

    const passwordHash = await hash(password, 12);
    const user = await UserService.createInitialAdmin({ username, password: passwordHash });

    return NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    const vErr = validationError(error);
    if (vErr) return vErr;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
