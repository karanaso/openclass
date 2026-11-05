import { json, withAdmin } from "@/server/http";
import { ingestUploads } from "@/server/services/ingestion";
import { listLessonsForClass } from "@/server/services/classes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ classId: string }> }) {
  return withAdmin(request, async () => {
    const { classId } = await context.params;
    const lessons = await listLessonsForClass(classId);
    return json({ lessons });
  });
}

export async function POST(request: Request, context: { params: Promise<{ classId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { classId } = await context.params;
      const form = await request.formData();
      const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
      const allowDuplicates = form.get("allowDuplicates") === "1";
      const results = await ingestUploads(classId, files, { allowDuplicates });
      const accepted = results.filter((result) => result.status === "accepted").length;
      const rejected = results.filter((result) => result.status === "rejected").length;
      const duplicates = results.filter((result) => result.status === "duplicate").length;
      return json({ results, accepted, rejected, duplicates }, accepted > 0 ? 201 : 200);
    },
    { mutation: true },
  );
}
