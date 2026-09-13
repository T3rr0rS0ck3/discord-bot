export type AchievementMedal = "bronze" | "silver" | "gold";
export type AchievementCategory = "general" | "music" | "community" | "voting" | "welcome" | "twitch";
export type AchievementNotificationMode = "dm" | "channel" | "both" | "silent";

export type AchievementTier = {
    id: string;
    medal: AchievementMedal;
    target: number;
    points: number;
};

export type AchievementSeries = {
    id: string;
    name: string;
    description: string;
    category: AchievementCategory;
    icon: string;
    hidden?: boolean;
    tiers: [AchievementTier, AchievementTier, AchievementTier];
};

export type AchievementProgress = {
    seriesId: string;
    progress: number;
    updatedAt: number;
};

export type AchievementUnlock = {
    achievementId: string;
    unlockedAt: number;
};

export type AchievementUserState = {
    progress: AchievementProgress[];
    unlocks: AchievementUnlock[];
};

export type AchievementRecordResult = {
    progress: number;
    unlocked: AchievementUnlock[];
};

export type AchievementEvent = {
    guildId: string;
    userId: string;
    seriesId: string;
    amount?: number;
    value?: number;
    occurredAt?: number;
};

export type AchievementFactEvent = Omit<AchievementEvent, "amount" | "value"> & {
    factKey: string;
};

function tiers(seriesId: string, bronze: number, silver: number, gold: number): [AchievementTier, AchievementTier, AchievementTier] {
    return [
        { id: `${seriesId}-bronze`, medal: "bronze", target: bronze, points: 10 },
        { id: `${seriesId}-silver`, medal: "silver", target: silver, points: 25 },
        { id: `${seriesId}-gold`, medal: "gold", target: gold, points: 50 }
    ];
}

export const achievementCatalog: AchievementSeries[] = [
    { id: "command-user", name: "Bot-Nutzung", description: "Fuehre Bot-Befehle aus.", category: "general", icon: "⚙️", tiers: tiers("command-user", 1, 25, 250) },
    { id: "module-explorer", name: "Modul-Entdecker", description: "Verwende unterschiedliche Bot-Module.", category: "general", icon: "🧭", tiers: tiers("module-explorer", 2, 4, 6) },
    { id: "music-listener", name: "Musikhoerer", description: "Hoere Tracks mindestens 30 Sekunden lang.", category: "music", icon: "🎧", tiers: tiers("music-listener", 1, 25, 250) },
    { id: "dj", name: "DJ", description: "Starte Tracks fuer den Server.", category: "music", icon: "🎵", tiers: tiers("dj", 10, 100, 500) },
    { id: "queue-builder", name: "Queue-Builder", description: "Baue eine grosse Musik-Queue auf.", category: "music", icon: "📻", tiers: tiers("queue-builder", 5, 10, 25) },
    { id: "night-owl", name: "Nachteule", description: "Hoere nachts zwischen 00:00 und 04:00 Uhr Musik.", category: "music", icon: "🌙", hidden: true, tiers: tiers("night-owl", 1, 10, 50) },
    { id: "channel-creator", name: "Kanal-Ersteller", description: "Erzeuge temporaere Community-Sprachkanaele.", category: "community", icon: "🚪", tiers: tiers("channel-creator", 1, 25, 100) },
    { id: "community-regular", name: "Community-Stammgast", description: "Schliesse Community-Voice-Sitzungen ab.", category: "community", icon: "🏠", tiers: tiers("community-regular", 5, 25, 100) },
    { id: "social-circle", name: "Gute Gesellschaft", description: "Sei mit anderen Nutzern im Community-Sprachkanal.", category: "community", icon: "👥", tiers: tiers("social-circle", 2, 5, 10) },
    { id: "voice-time", name: "Voice-Zeit", description: "Verbringe Zeit in Community-Sprachkanaelen.", category: "community", icon: "🎙️", tiers: tiers("voice-time", 60, 600, 3000) },
    { id: "active-voter", name: "Aktiver Waehler", description: "Nimm an verschiedenen Kanalnamen-Abstimmungen teil.", category: "voting", icon: "🗳️", tiers: tiers("active-voter", 1, 10, 50) },
    { id: "creative-mind", name: "Kreativer Kopf", description: "Reiche gueltige Kanalnamenvorschlaege ein.", category: "voting", icon: "💡", tiers: tiers("creative-mind", 1, 5, 20) },
    { id: "winning-suggestion", name: "Volltreffer", description: "Gewinne mit eigenen Vorschlaegen Abstimmungen.", category: "voting", icon: "🎯", tiers: tiers("winning-suggestion", 1, 5, 15) },
    { id: "welcome-role", name: "Willkommen", description: "Waehle unterschiedliche Welcome-Rollen.", category: "welcome", icon: "👋", tiers: tiers("welcome-role", 1, 3, 10) },
    { id: "twitch-support", name: "Twitch-Verbindung", description: "Verbinde Twitch und erreiche Support-Meilensteine.", category: "twitch", icon: "📺", tiers: tiers("twitch-support", 1, 2, 3) }
];

export const achievementSeriesById = new Map(achievementCatalog.map(series => [series.id, series]));
export const achievementTierById = new Map(achievementCatalog.flatMap(series => series.tiers.map(tier => [tier.id, { series, tier }] as const)));