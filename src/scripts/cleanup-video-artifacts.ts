import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { LocalStorage } from "@/server/storage";

export const RETIRED_MEDIA_SEGMENTS = ["video", "audio", "visual", "pages"] as const;

export type RetiredMediaSegment = (typeof RETIRED_MEDIA_SEGMENTS)[number];

export type CleanupFailure = { lessonId: string; prefix: string; error: string };

export type CleanupSummary = {
  scanned: number;
  present: number;
  deleted: number;
  failures: CleanupFailure[];
};

export function retiredMediaPrefixes(lessonId: string): string[] {
  return RETIRED_MEDIA_SEGMENTS.map((segment) => `lessons/${lessonId}/${segment}`);
}

export async function listStoredLessonIds(storageRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(storageRoot, "lessons"), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function cleanupLessonMedia(input: {
  lessonIds: string[];
  storage: Pick<LocalStorage, "exists" | "deletePrefix">;
  apply: boolean;
  log?: (message: string) => void;
}): Promise<CleanupSummary> {
  const log = input.log ?? (() => undefined);
  const summary: CleanupSummary = { scanned: 0, present: 0, deleted: 0, failures: [] };

  for (const lessonId of input.lessonIds) {
    summary.scanned += 1;
    for (const prefix of retiredMediaPrefixes(lessonId)) {
      const exists = await input.storage.exists(prefix);
      if (!exists) {
        log(`missing ${prefix}`);
        continue;
      }
      summary.present += 1;
      if (!input.apply) {
        log(`would delete ${prefix}`);
        continue;
      }
      try {
        await input.storage.deletePrefix(prefix);
        summary.deleted += 1;
        log(`deleted ${prefix}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown cleanup error";
        summary.failures.push({ lessonId, prefix, error: message });
        log(`failed ${prefix}: ${message}`);
      }
    }
  }

  return summary;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const apply = argv.includes("--apply");
  const [{ getStorage }, { prisma }] = await Promise.all([
    import("@/server/storage"),
    import("@/server/db"),
  ]);

  try {
    const lessons = await prisma.lesson.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
    const storage = getStorage();
    const storedIds = await listStoredLessonIds(storage.getRoot());
    const lessonIds = [...new Set([...lessons.map((lesson) => lesson.id), ...storedIds])];
    console.log(
      `${apply ? "Deleting" : "Dry run: would delete"} retired media for ${lessonIds.length} lesson(s) ` +
        `(${lessons.length} in the database, ${storedIds.length} stored directories).`,
    );
    const summary = await cleanupLessonMedia({
      lessonIds,
      storage,
      apply,
      log: (message) => console.log(message),
    });
    console.log(
      `${apply ? "Deleted" : "Matched"} ${apply ? summary.deleted : summary.present} retired prefix(es) across ${summary.scanned} lesson(s).`,
    );
    if (!apply) console.log("Re-run with --apply to delete the listed prefixes.");
    if (summary.failures.length > 0) {
      console.error(`${summary.failures.length} prefix(es) could not be removed.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
