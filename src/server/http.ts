import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/errors";
import { assertSameOrigin, requireTeacher } from "./auth/guard";

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers });
}

export async function withAdmin(
  request: Request,
  handler: () => Promise<Response>,
  options: { mutation?: boolean } = {},
): Promise<Response> {
  try {
    await requireTeacher(request);
    if (options.mutation) {
      assertSameOrigin(request);
    }
    return await handler();
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status, headers: response.headers });
  }
}

export async function withPublic(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status, headers: response.headers });
  }
}
