import { z } from "zod";
import { json, withAdmin } from "@/server/http";
import { deleteClass, updateClass } from "@/server/services/classes";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteSchema = z.object({ confirm: z.literal(true) });

export async function PATCH(request: Request, context: { params: Promise<{ classId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { classId } = await context.params;
      const classroom = await updateClass(classId, await request.json());
      return json({ class: classroom });
    },
    { mutation: true },
  );
}

export async function DELETE(request: Request, context: { params: Promise<{ classId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { classId } = await context.params;
      const body = deleteSchema.safeParse(await request.json().catch(() => null));
      if (!body.success) {
        throw new ValidationError("Deletion requires explicit confirmation");
      }
      const result = await deleteClass(classId);
      return json({ ok: true, ...result });
    },
    { mutation: true },
  );
}
