import { execFileSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

export type TestInfra = {
  prisma: PrismaClient;
  databaseUrl: string;
  redisUrl: string;
  postgres: StartedPostgreSqlContainer;
  redis: StartedTestContainer;
  stop: () => Promise<void>;
};

export async function startTestInfra(): Promise<TestInfra> {
  const postgres = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("lessonlab")
    .withUsername("lessonlab")
    .withPassword("lessonlab")
    .start();

  const redis = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();

  const databaseUrl = postgres.getConnectionUri();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

  return {
    prisma,
    databaseUrl,
    redisUrl,
    postgres,
    redis,
    stop: async () => {
      await prisma.$disconnect();
      await postgres.stop();
      await redis.stop();
    },
  };
}
