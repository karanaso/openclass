import { getTranslations } from "next-intl/server";
import { ClassManager } from "@/components/admin/class-manager";
import { listClasses } from "@/server/services/classes";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const t = await getTranslations("admin");
  const classes = await listClasses();

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{t("classesTitle")}</h1>
      <p className="mt-1 text-muted-foreground">{t("classesSubtitle")}</p>
      <div className="mt-8">
        <ClassManager
          initialClasses={classes.map((classroom) => ({
            id: classroom.id,
            name: classroom.name,
            description: classroom.description,
            color: classroom.color,
            position: classroom.position,
            lessonCount: classroom._count.lessons,
            createdAt: classroom.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
