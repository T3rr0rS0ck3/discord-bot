import assert from "node:assert/strict";
import test from "node:test";
import { adminApi, resolveAdminUrl } from "../src/admin-ui/api/adminApi";
import { normalizeConfig, serializeConfig, toRestartRelevantState } from "../src/admin-ui/utils/config";
import type { AdminConfig } from "../src/admin-ui/types";

const documentBaseUri = "http://localhost:8787/ingress/session/admin/";
Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { baseURI: documentBaseUri }
});

test("normalizeConfig handles defaults, Unicode values and numeric boundaries", () => {
    const defaults = normalizeConfig({});
    assert.equal(defaults.communityCategoryName, "Community");
    assert.equal(defaults.communityMaxChannels, 50);
    assert.equal(defaults.musicDefaultVolumePercent, 50);
    assert.equal(defaults.musicYoutubeSearchLimit, 25);
    assert.equal(defaults.audioDbApiKey, "123");
    assert.equal(defaults.audioDbApiVersion, "v1");
    assert.deepEqual(defaults.welcomeRoles, []);

    const configured = normalizeConfig({
        systemEnabled: true,
        musicEnabled: true,
        welcomeEnabled: true,
        twitchEnabled: true,
        communityEnabled: true,
        communityVotingEnabled: true,
        communityMaxChannels: "1" as unknown as number,
        communityCategoryName: "Grüße / ÄÖÜß <Test>",
        guildId: 123 as unknown as string,
        musicDefaultVolumePercent: 0,
        musicDebugSearch: false,
        musicYoutubeSearchLimit: 100,
        audioDbApiKey: "premium-key",
        audioDbApiVersion: "v2",
        welcomeRoles: [{ emoji: undefined, name: "Jörg & Käthe", description: null } as unknown as AdminConfig["welcomeRoles"][number]],
        twitchAccessTokenExpiresAt: "12345" as unknown as number
    });

    assert.equal(configured.communityCategoryName, "Grüße / ÄÖÜß <Test>");
    assert.equal(configured.communityMaxChannels, 1);
    assert.equal(configured.guildId, "123");
    assert.equal(configured.musicDefaultVolumePercent, 0);
    assert.equal(configured.musicDebugSearch, false);
    assert.equal(configured.audioDbApiVersion, "v2");
    assert.deepEqual(configured.welcomeRoles, [{ emoji: "", name: "Jörg & Käthe", description: "" }]);
    assert.equal(configured.twitchAccessTokenExpiresAt, 12345);
});

test("serializeConfig trims text and preserves empty or malformed numeric input", () => {
    const config = normalizeConfig({
        discordToken: " token ",
        guildId: " guild ",
        adminUiUsername: " admin ",
        adminUiToken: " secret ",
        musicRoleName: " Musik & Spaß ",
        welcomeChannelId: " channel ",
        welcomeRoles: [{ emoji: " 🎵 ", name: " Grüße ", description: " Café / Test " }],
        musicDefaultVolumePercent: Number.NaN,
        musicYoutubeSearchLimit: undefined,
        adminUiPort: Number.NaN,
        audioDbApiKey: " ",
        audioDbApiVersion: "v2",
        twitchAccessTokenExpiresAt: Number.NaN
    });

    const serialized = JSON.parse(serializeConfig(config));
    assert.equal(serialized.discordToken, "token");
    assert.equal(serialized.guildId, "guild");
    assert.equal(serialized.adminUiUsername, "admin");
    assert.equal(serialized.musicRoleName, "Musik & Spaß");
    assert.deepEqual(serialized.welcomeRoles, [{ emoji: "🎵", name: "Grüße", description: "Café / Test" }]);
    assert.equal(serialized.musicDefaultVolumePercent, "");
    assert.equal(serialized.musicYoutubeSearchLimit, "25");
    assert.equal(serialized.adminUiPort, "");
    assert.equal(serialized.audioDbApiKey, "123");
    assert.equal(serialized.audioDbApiVersion, "v2");
    assert.equal(serialized.twitchAccessTokenExpiresAt, "");

    const restartState = toRestartRelevantState({
        ...config,
        musicDefaultVolumePercent: undefined,
        musicYoutubeSearchLimit: Number.NaN,
        audioDbApiVersion: "v1"
    });
    assert.equal(restartState.musicDefaultVolumePercent, "");
    assert.equal(restartState.musicYoutubeSearchLimit, "");
    assert.equal(restartState.audioDbApiVersion, "v1");
});

test("adminApi resolves ingress paths and exercises all request methods", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("api/config/backup")) {
            return new Response("backup", {
                status: 200,
                headers: { "content-disposition": "attachment; filename=\"grüße-backup.json\"" }
            });
        }
        return Response.json({
            ok: true,
            username: "admin",
            channels: [],
            emojis: [],
            logs: [],
            config: {},
            result: { followerChanges: 1, subscriberChanges: 2 }
        });
    };

    try {
        assert.equal(resolveAdminUrl("/api/config"), `${documentBaseUri}api/config`);
        await adminApi.login("jörg", "päss/ß");
        await adminApi.logout();
        await adminApi.loadConfig();
        await adminApi.saveConfig({ welcomeTitle: "Grüße <&>" });
        await adminApi.restart();
        await adminApi.loadChannels();
        await adminApi.loadEmojis();
        await adminApi.loadLogs();
        await adminApi.loadStatus();
        await adminApi.loadDatabaseStatus();
        await adminApi.loadCommunityStatus();
        await adminApi.deleteCommunityChannel("kanal/äöü");
        await adminApi.loadTwitchSyncStatus();
        await adminApi.syncTwitchRoles();
        await adminApi.restoreConfigBackup({ title: "Grüße" });
        const backup = await adminApi.downloadConfigBackup();
        assert.equal(backup.fileName, "grüße-backup.json");
        assert.equal(await backup.blob.text(), "backup");
        assert.equal(requests.length, 16);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("adminApi surfaces JSON, HTTP and network failures", async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => Response.json({ error: "Ungültige Eingabe: ÄÖÜß" }, { status: 400 });
        await assert.rejects(adminApi.loadConfig(), /Ungültige Eingabe: ÄÖÜß/);

        globalThis.fetch = async () => new Response("not json", { status: 503 });
        await assert.rejects(adminApi.loadStatus(), /HTTP 503/);
        await assert.rejects(adminApi.downloadConfigBackup(), /HTTP 503/);

        globalThis.fetch = async () => { throw new Error("Netzwerk getrennt"); };
        await assert.rejects(adminApi.loadLogs(), /Netzwerk getrennt/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
