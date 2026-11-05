import { json, withAdmin } from "@/server/http";
import { reorderClasses } from "@/server/services/classes";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ ids: z.array(z.string().min(1)) });

export async function PUT(request: Request) {
  return withAdmin(
    request,
    async () => {
      const body = bodySchema.parse(await request.json());
      const classes = await reorderClasses(body.ids);
      return json({ classes });
    },
    { mutation: true },
  );
}
