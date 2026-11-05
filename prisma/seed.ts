import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existingClass = await prisma.class.findFirst({ where: { name: "Demo Class" } });
  const demoClass =
    existingClass ??
    (await prisma.class.create({
      data: { name: "Demo Class", description: "A development class", color: "#2563eb", position: 0 },
    }));

  const existingLesson = await prisma.lesson.findFirst({
    where: { classId: demoClass.id, title: "Demo Lesson" },
  });

  if (!existingLesson) {
    await prisma.lesson.create({
      data: {
        classId: demoClass.id,
        title: "Demo Lesson",
        originalFilename: "demo.pdf",
        storageKey: `lessons/demo/original.pdf`,
        checksum: "demo-checksum",
        sizeBytes: 1024,
        pageCount: 1,
        sourceLocale: "el",
        status: "READY",
        readyAt: new Date(),
      },
    });
  }

  console.log("Seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
