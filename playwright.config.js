import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    retries: 1,
    use: {
        baseURL: "http://localhost:5173",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    webServer: {
        command: "npm run dev -- --host 0.0.0.0 --port 5173",
        url: "http://localhost:5173/user",
        reuseExistingServer: true,
        timeout: 120_000,
    },
});

