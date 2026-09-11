import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import v8ToIstanbul from "v8-to-istanbul";

test.beforeEach(async ({ page }) => {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
});

test.afterEach(async ({ page }, testInfo) => {
    const browserCoverage = await page.coverage.stopJSCoverage();
    const appCoverage = browserCoverage.find(entry => new URL(entry.url).pathname.endsWith("/admin/app.js"));
    expect(appCoverage, "Admin UI JavaScript coverage was not captured").toBeDefined();

    const bundlePath = path.resolve("dist", "admin", "app.js");
    const converter = v8ToIstanbul(bundlePath, 0, { source: fs.readFileSync(bundlePath, "utf8") });
    await converter.load();
    converter.applyCoverage(appCoverage!.functions);

    const rawDirectory = path.resolve("coverage", "ui-raw");
    fs.mkdirSync(rawDirectory, { recursive: true });
    const testSlug = testInfo.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    fs.writeFileSync(
        path.join(rawDirectory, `${testInfo.project.name}-${testSlug}-${testInfo.workerIndex}.json`),
        JSON.stringify(converter.toIstanbul())
    );
});

async function login(page: import("@playwright/test").Page): Promise<void> {
    await page.goto("./");
    await page.getByPlaceholder("Enter your admin username").fill("admin");
    await page.getByPlaceholder("Enter your admin password").fill("e2e-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Manage Discord Bot Runtime" })).toBeVisible();
}

test("login and dashboard render without horizontal overflow", async ({ page }, testInfo) => {
    await login(page);
    await expect(page.getByText("Bot ist fuer den E2E-Test online.")).toBeVisible();
    await expect(page.getByText("Gaming Lounge")).toBeVisible();
    const communityChannelList = page.locator(".log-panel").filter({ hasText: "Gaming Lounge" });
    await expect(communityChannelList).not.toContainText("➕ Sprachkanal erstellen");

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(horizontalOverflow).toBe(false);

    for (const placeholder of ["Enter a role name *", "Describe what this role is for *"]) {
        const field = page.getByPlaceholder(placeholder);
        const box = await field.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(250);
    }

    await expect(page.getByText("Configuration loaded.")).toBeHidden({ timeout: 8_000 });

    const screenshotPath = path.resolve("e2e-results", "screenshots", `${testInfo.project.name}-dashboard.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
});

test("login rejects invalid credentials and trims valid user input", async ({ page }) => {
    await page.goto("./");
    await page.getByPlaceholder("Enter your admin username").fill("  admin  ");
    await page.getByPlaceholder("Enter your admin password").fill(" falsch äöü ");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator(".status")).toContainText(/invalid|unauthorized/i);
    await page.getByPlaceholder("Enter your admin password").fill("  e2e-password  ");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Manage Discord Bot Runtime" })).toBeVisible();
});

test("admin edits and saves Unicode configuration with restart tracking", async ({ page }, testInfo) => {
    await login(page);
    const projectSuffix = testInfo.project.name === "mobile-chromium" ? "Mobil" : "Desktop";
    await page.getByLabel("Kategoriename").fill(`Grüße ÄÖÜß / <Test> & Co ${projectSuffix}`);
    await page.getByLabel("Maximale Anzahl temporärer Sprachkanäle (1-50)").fill("17");
    await page.getByLabel("Welcome Title").fill(`Willkommen, Jörg & Käthe 🎵 ${projectSuffix}`);
    await page.getByPlaceholder("Enter the role name for music access").fill(`Musik & Spaß ÄÖÜß ${projectSuffix}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Configuration saved.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Restart required for:/)).toBeVisible();
    await page.getByRole("button", { name: "Restart bot" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Bot restarted." }).first()).toBeVisible();
});

test("welcome roles support add, Unicode edit, emoji search and removal", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Add role" }).click();
    const names = page.getByPlaceholder("Enter a role name *");
    const descriptions = page.getByPlaceholder("Describe what this role is for *");
    await names.last().fill("Grüße & Spaß / ÄÖÜß");
    await descriptions.last().fill("Für Café, Musik 🎵 und <Tests>");
    await page.getByRole("button", { name: "Open emoji dropdown" }).last().click();
    await page.getByPlaceholder("Search emojis or names").fill("äpfel");
    await page.getByRole("button", { name: /Äpfel/ }).click();
    await expect(page.getByLabel("Welcome message preview")).toContainText("Grüße & Spaß / ÄÖÜß");
    await page.getByRole("button", { name: "Delete role" }).last().click();
    await expect(names).toHaveCount(1);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Channel and emoji list refreshed." }).first()).toBeVisible();
});

test("community deletion handles cancel and confirmation while Twitch sync updates status", async ({ page }) => {
    await login(page);
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Sprachkanal Gaming Lounge löschen" }).click();
    await expect(page.getByText("Gaming Lounge")).toBeVisible();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Sprachkanal Gaming Lounge löschen" }).click();
    await expect(page.getByText("Community-Sprachkanal „Gaming Lounge“ gelöscht.", { exact: true }).first()).toBeVisible();

    await page.getByText("Twitch Settings").click();
    await page.getByRole("button", { name: "Twitch-Rollen jetzt synchronisieren" }).click();
    await expect(page.getByRole("status").filter({ hasText: /2 Rollenänderungen/ }).first()).toBeVisible();
});

test("module toggles, SQLite navigation and logout update the visible application", async ({ page }, testInfo) => {
    await page.route("**/admin/sqlite/**", route => route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body><main>SQLite E2E Browser</main></body></html>"
    }));
    await login(page);
    const communityRegion = page.locator("details.region").filter({ hasText: "Community Sprachkanäle" });
    await communityRegion.getByRole("switch").click({ force: true });
    await expect(communityRegion).toContainText("Community: Aus");
    await communityRegion.getByRole("switch").click({ force: true });
    await expect(communityRegion).toContainText("Community: Ein");
    if (testInfo.project.name === "mobile-chromium") {
        await page.goto("./?page=sqlite");
    } else {
        await page.getByRole("button", { name: "SQLite Browser" }).click();
    }
    await expect(page.getByRole("heading", { name: "SQLite Browser" })).toBeVisible();
    await expect(page).toHaveURL(/page=sqlite/);
    if (testInfo.project.name === "mobile-chromium") {
        await page.evaluate(async () => {
            await fetch(new URL("api/logout", document.baseURI), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: "{}"
            });
        });
        await page.goto("./");
    } else {
        await page.getByRole("button", { name: "Dashboard" }).click();
        await page.getByRole("button", { name: "Log out" }).click();
    }
    await expect(page.getByRole("heading", { name: "Bot Control Center" })).toBeVisible();
});

test("settings handlers, secrets, backup and malformed restore behave like user actions", async ({ page }, testInfo) => {
    await login(page);
    const suffix = testInfo.project.name === "mobile-chromium" ? "Mobil" : "Desktop";

    await page.getByRole("button", { name: "Show admin password" }).click();
    await page.getByPlaceholder("Leave empty to keep the current password").fill(`päss/ÄÖÜß-${suffix}`);
    await page.getByRole("button", { name: "Hide admin password" }).click();
    await page.getByPlaceholder("Enter the UI port").fill("");
    await page.getByPlaceholder("Enter the UI port").fill("8799");

    await page.getByPlaceholder("Choose a default volume level").fill("");
    await page.getByPlaceholder("Choose a default volume level").fill("0");
    await page.getByPlaceholder("Default: 25 results").fill("");
    await page.getByPlaceholder("Default: 25 results").fill("100");
    await page.getByRole("switch", { name: /Music Debug Search/ }).click({ force: true });
    await page.getByRole("button", { name: "Show API key" }).click();
    await page.getByPlaceholder("TheAudioDB key").fill(`premium/&<key>-${suffix}`);
    await page.getByRole("button", { name: "Hide API key" }).click();
    await page.getByRole("combobox").filter({ has: page.getByRole("option", { name: "v2 / Premium API" }) }).selectOption("v2");

    await page.getByText("Twitch Settings").click();
    await page.getByLabel("Verknüpfungskanal").fill(`twitch-grüße-${suffix.toLowerCase()}`);
    await page.getByLabel("Panel-Titel").fill(`Grüße & Spaß / ${suffix}`);
    await page.getByLabel("Panel-Nachricht").fill("Café <Test> & Musik 🎵");
    await page.getByLabel("Broadcaster Name").fill(`jörg_${suffix.toLowerCase()}`);
    await page.getByLabel("Follower Role Name").fill("Follower ÄÖÜß");
    await page.getByLabel("Subscriber Role Name").fill("Abonnent/in & Co");
    await page.evaluate(() => { window.open = () => null; });
    await page.getByRole("button", { name: "Broadcaster mit Twitch verbinden" }).click();

    await page.getByRole("button", { name: "Save and restart" }).click();
    await expect(page.getByText("Configuration saved and bot restarted.", { exact: true }).first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Backup" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    await expect(page.getByText("Configuration backup downloaded.", { exact: true }).first()).toBeVisible();

    page.once("dialog", dialog => dialog.accept());
    await page.locator('input[type="file"]').setInputFiles({
        name: "ungültig-äöü.json",
        mimeType: "application/json",
        buffer: Buffer.from("{ kein gültiges JSON / <test> }")
    });
    await expect(page.getByText("The selected file is not valid JSON.", { exact: true }).first()).toBeVisible();
});