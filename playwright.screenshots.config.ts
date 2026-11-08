import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// `npm run screenshots`: same stand (emulator + production build), only the screenshot spec.
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /screenshots\.spec\.ts/,
  projects: [{ name: "desktop", use: base.projects![0].use }],
  reporter: "list",
});
