import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    locale: "el-GR",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/el",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
