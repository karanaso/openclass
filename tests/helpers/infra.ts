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
      const cleanupErrors: unknown[] = [];
      try {
        await postgres.stop();
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await redis.stop();
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (cleanupErrors.length > 0) {
        // Rootless Podman can fail to kill its network process during teardown
        // after the containers have already stopped. Keep that runtime quirk
        // from failing otherwise green integration runs.
        console.warn("Test container cleanup reported errors", cleanupErrors);
      }
    },
  };
}
