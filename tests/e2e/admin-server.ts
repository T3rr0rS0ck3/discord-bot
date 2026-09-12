import { AdminWebServer } from "../../src/admin/AdminWebServer";

const config = {
    systemEnabled: true,
    musicEnabled: true,
    welcomeEnabled: true,
    twitchEnabled: true,
    twitchClientId: "e2e-twitch-client-id",
    twitchClientSecret: "e2e-twitch-client-secret",
    twitchRedirectUri: "http://127.0.0.1:8799/admin/api/twitch/callback",
    communityEnabled: true,
    communityVotingEnabled: true,
    communityCategoryName: "Community",
    communityVotingChannelName: "kanalnamen-abstimmung",
    communityVotingDurationHours: 168,
    communityEmptyTimeoutSeconds: 60,
    communityMaxChannels: 50,
    discordToken: "e2e-discord-token",
    guildId: "123456789012345678",
    guildIds: ["123456789012345678", "987654321098765432"],
    guildConfigs: {
        "123456789012345678": { musicRoleName: "Music Bot Server Alpha", communityCategoryName: "Community Alpha" },
        "987654321098765432": { musicRoleName: "Music Bot Server Beta", communityCategoryName: "Community Beta" }
    },
    adminUiUsername: "admin",
    adminUiToken: "",
    adminUiPort: 8799,
    adminLoginMaxFailures: 5,
    adminLoginBlockMinutes: 15,
    musicRoleName: "Music Bot",
    musicDefaultVolumePercent: 50,
    musicDebugSearch: false,
    musicYoutubeSearchLimit: 25,
    audioDbApiKey: "123",
    audioDbApiVersion: "v1" as const,
    welcomeChannelId: "234567890123456789",
    welcomeTitle: "Willkommen!",
    welcomeReactionPrompt: "Waehle deine Rollen:",
    welcomeReactionInstructions: "Klicke auf eine Reaktion.",
    welcomeRoles: [{ emoji: "🎮", name: "Gaming", description: "Gaming-Rolle" }],
    twitchBroadcasterName: "appnaxx",
    twitchFollowerRoleName: "Follower",
    twitchSubscriberRoleName: "Subscriber",
    twitchLinkChannelName: "twitch-verknuepfung",
    twitchLinkPanelTitle: "Twitch-Konto verbinden",
    twitchLinkPanelMessage: "Verbinde dein Twitch-Konto."
};

const communityChannels = [
    { id: "456789012345678901", name: "Gaming Lounge", memberCount: 0, isManaged: true },
    { id: "567890123456789012", name: "Besprechung", memberCount: 3, isManaged: true }
];
let communityChannelNames = [
    "Äpfel & Öl",
    "Gaming Lounge",
    "Lötstation",
    ...Array.from({ length: 250 }, (_, index) => `Kanal ${String(index + 1).padStart(4, "0")}`)
];

const server = new AdminWebServer({
    port: 8799,
    getAuthConfig: () => ({ username: config.adminUiUsername }),
    verifyAdminPassword: async password => password === "e2e-password",
    getConfig: () => config,
    getLogs: () => [
        { timestamp: Date.now() - 1000, level: "info", message: "E2E test server started." },
        { timestamp: Date.now(), level: "log", message: "Admin UI ready for visual inspection." }
    ],
    saveConfig: async nextConfig => { Object.assign(config, nextConfig); },
    restartBot: async () => {},
    getServerEmojis: async () => [
        { value: "🎮", label: "🎮 Gaming", group: "Activities" },
        { value: "❤️", label: "❤️ Liebe & Grüße", group: "Smileys & Emotion" },
        { value: "<:aepfel:123456789012345678>", label: "<:aepfel:123456789012345678> Äpfel", group: "Server Emojis" }
    ],
    getWelcomeChannels: async () => [{ id: "234567890123456789", name: "#willkommen" }],
    getDiscordStatus: () => ({ state: "online", message: "Bot ist fuer den E2E-Test online.", updatedAt: new Date().toISOString() }),
    getDatabaseStatus: async () => ({ schemaVersion: 8, latestMigration: "guild-config-profiles-v1", appliedMigrations: [] }),
    getCommunityStatus: async () => ({
        configured: true,
        connected: true,
        guildId: config.guildId,
        category: { id: "345678901234567890", name: "Community", exists: true },
        voiceChannels: communityChannels
    }),
    deleteCommunityChannel: async () => {},
    getCommunityChannelNames: async () => [...communityChannelNames].sort((a, b) => a.localeCompare(b, "de")),
    addCommunityChannelName: async name => { communityChannelNames.push(name.trim()); },
    renameCommunityChannelName: async (currentName, nextName) => {
        communityChannelNames = communityChannelNames.map(name => name === currentName ? nextName.trim() : name);
    },
    deleteCommunityChannelName: async name => { communityChannelNames = communityChannelNames.filter(item => item !== name); },
    replaceCommunityChannelNames: async names => {
        communityChannelNames = names.map(name => String(name).trim());
        return [...communityChannelNames].sort((a, b) => a.localeCompare(b, "de"));
    },
    consumeTwitchMemberOAuthState: async () => undefined,
    saveTwitchMemberLink: async () => {},
    syncTwitchRoles: async () => ({ guildId: config.guildId, attemptedAt: Date.now(), successful: true, followerChanges: 1, subscriberChanges: 1 }),
    getTwitchRoleSyncStatus: async () => ({ followerChanges: 1, subscriberChanges: 1, changes: [] })
});

server.start();

async function shutdown(): Promise<void> {
    await server.stop();
    process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());