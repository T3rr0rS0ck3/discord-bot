import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    outputDir: "e2e-results/artifacts",
    reporter: [["list"], ["html", { outputFolder: "e2e-results/report", open: "never" }]],
    use: {
        baseURL: "http://127.0.0.1:8799",
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
    },
    webServer: {
        command: "npm run e2e:server",
        url: "http://127.0.0.1:8799/health",
        reuseExistingServer: false,
        timeout: 30_000
    },
    projects: [
        {
            name: "desktop-chromium",
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } }
        },
        {
            name: "mobile-chromium",
            use: { ...devices["Pixel 7"] }
        }
    ]
});