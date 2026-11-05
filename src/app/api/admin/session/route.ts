import { withAdmin, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdmin(request, async () => json({ ok: true, role: "teacher" }));
}
