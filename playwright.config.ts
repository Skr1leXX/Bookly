import { defineConfig, devices } from "@playwright/test";

const APP = "http://localhost:3100";
const SUPABASE = "http://127.0.0.1:54321";

// The tests drive the real production build against the local Supabase stand-in (supabase/tests/emulator.mjs):
// real migrations, real seed, real RLS. Nothing is mocked at the browser level.
export default defineConfig({
  testDir: "./e2e",
  testIgnore: /screenshots.spec.ts/, // pictures for the README: `npm run screenshots`
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one shared database, so tests run one after another
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: APP,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", testMatch: /booking\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node supabase/tests/emulator.mjs",
      port: 54321,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run build && npx next start -p 3100",
      url: `${APP}/login`,
      reuseExistingServer: false,
      timeout: 600_000,
      env: { NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key" },
    },
  ],
});
