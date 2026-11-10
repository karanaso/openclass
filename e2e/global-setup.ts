import { spawn, type ChildProcess } from "node:child_process";

let worker: ChildProcess | undefined;

export default async function globalSetup() {
  worker = spawn("npm", ["run", "worker"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_PROVIDER: "mock",
      TTS_PROVIDER: "mock",
      VIDEO_PROVIDER: "mock",
      GENERATION_MAX_ATTEMPTS: "1",
      WORKER_AUTOSTART: "1",
    },
    stdio: "ignore",
    detached: true,
  });
  worker.unref();

  await new Promise((resolve) => setTimeout(resolve, 2500));

  return async () => {
    if (!worker?.pid) return;
    try {
      process.kill(-worker.pid, "SIGTERM");
    } catch {
      worker.kill("SIGTERM");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  };
}
