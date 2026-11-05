import { json, withAdmin } from "@/server/http";
import { createClass, listClasses } from "@/server/services/classes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdmin(request, async () => {
    const classes = await listClasses();
    return json({ classes });
  });
}

export async function POST(request: Request) {
  return withAdmin(
    request,
    async () => {
      const body = await request.json();
      const classroom = await createClass(body);
      return json({ class: classroom }, 201);
    },
    { mutation: true },
  );
}
