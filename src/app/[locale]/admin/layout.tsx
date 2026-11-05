import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { getTeacherSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getTeacherSession();
  if (!session) {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="min-h-screen">
      <AdminHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
