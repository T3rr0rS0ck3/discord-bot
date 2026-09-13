import path from "node:path";
import { AttachmentBuilder, EmbedBuilder, type Client, type GuildTextBasedChannel } from "discord.js";
import type { AdminConfigStore, AchievementNotification } from "../admin/AdminConfigStore";
import {
    achievementCatalog,
    achievementSeriesById,
    achievementTierById,
    type AchievementEvent,
    type AchievementFactEvent,
    type AchievementNotificationMode,
    type AchievementRecordResult,
    type AchievementUserState
} from "../types/Achievement";

export type AchievementGuildSettings = {
    enabled: boolean;
    notificationMode: AchievementNotificationMode;
    channelId?: string;
    activeModuleCount?: number;
    welcomeRoleCount?: number;
    publicProfilesEnabled?: boolean;
    hiddenEnabled?: boolean;
    enabledCategories?: Set<string>;
};

export class AchievementService {
    private client?: Client;
    private flushTimer?: NodeJS.Timeout;
    private flushing = false;

    public constructor(
        private readonly store: AdminConfigStore,
        private readonly getGuildSettingsCallback: (guildId: string) => AchievementGuildSettings
    ) {}

    public attachClient(client: Client): void {
        this.client = client;
        this.scheduleFlush(250);
    }

    public async record(event: AchievementEvent): Promise<AchievementRecordResult> {
        const settings = this.getGuildSettingsCallback(event.guildId);
        const series = achievementSeriesById.get(event.seriesId);
        if (!settings.enabled || !series || settings.enabledCategories?.has(series.category) === false || (series.hidden && settings.hiddenEnabled === false)) return { progress: 0, unlocked: [] };

        const result = await this.store.recordAchievementProgress(
            event.guildId,
            event.userId,
            event.seriesId,
            this.resolveTiers(event.guildId, series),
            { amount: event.amount, value: event.value, now: event.occurredAt }
        );
        if (result.unlocked.length > 0) this.scheduleFlush();
        return result;
    }

    public async recordMaximum(event: AchievementEvent & { value: number }): Promise<AchievementRecordResult> {
        const settings = this.getGuildSettingsCallback(event.guildId);
        const series = achievementSeriesById.get(event.seriesId);
        if (!settings.enabled || !series || settings.enabledCategories?.has(series.category) === false || (series.hidden && settings.hiddenEnabled === false)) return { progress: 0, unlocked: [] };
        const result = await this.store.recordAchievementProgress(event.guildId, event.userId, event.seriesId, this.resolveTiers(event.guildId, series), {
            maximum: event.value,
            now: event.occurredAt
        });
        if (result.unlocked.length > 0) this.scheduleFlush();
        return result;
    }

    public async recordFact(event: AchievementFactEvent): Promise<AchievementRecordResult> {
        const settings = this.getGuildSettingsCallback(event.guildId);
        const series = achievementSeriesById.get(event.seriesId);
        if (!settings.enabled || !series || settings.enabledCategories?.has(series.category) === false || (series.hidden && settings.hiddenEnabled === false)) return { progress: 0, unlocked: [] };

        const result = await this.store.recordAchievementFact(
            event.guildId,
            event.userId,
            event.seriesId,
            event.factKey,
            this.resolveTiers(event.guildId, series),
            event.occurredAt
        );
        if (result.unlocked.length > 0) this.scheduleFlush();
        return result;
    }

    public getGuildSettings(guildId: string): AchievementGuildSettings {
        return this.getGuildSettingsCallback(guildId);
    }

    public getCatalog() {
        return achievementCatalog;
    }

    public async getUserState(guildId: string, userId: string): Promise<AchievementUserState> {
        return this.store.getAchievementUserState(guildId, userId);
    }

    public async flushPending(now = Date.now()): Promise<void> {
        if (this.flushing || !this.client) return;
        this.flushing = true;
        try {
            const pending = await this.store.getPendingAchievementNotifications(now);
            const groups = new Map<string, AchievementNotification[]>();
            for (const notification of pending) {
                const key = `${notification.guildId}:${notification.userId}`;
                groups.set(key, [...(groups.get(key) ?? []), notification]);
            }
            for (const notifications of groups.values()) {
                await this.deliverGroup(notifications, now);
            }
        } finally {
            this.flushing = false;
        }
    }

    public async shutdown(): Promise<void> {
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
        await this.flushPending();
        this.client = undefined;
    }

    private scheduleFlush(delayMs = 2_000): void {
        if (!this.client || this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            void this.flushPending().catch(error => console.error("[Achievements] Notification flush failed:", error));
        }, delayMs);
        this.flushTimer.unref?.();
    }

    private async deliverGroup(notifications: AchievementNotification[], now: number): Promise<void> {
        const first = notifications[0];
        const settings = this.getGuildSettingsCallback(first.guildId);
        const ids = notifications.map(item => item.id);
        if (!settings.enabled || settings.notificationMode === "silent") {
            await this.store.markAchievementNotificationsDelivered(ids, now);
            return;
        }

        const unlocked = notifications
            .map(item => achievementTierById.get(item.achievementId))
            .filter((item): item is NonNullable<typeof item> => Boolean(item));
        if (unlocked.length === 0) {
            await this.store.markAchievementNotificationsDelivered(ids, now);
            return;
        }

        const highest = unlocked.reduce((best, item) => item.tier.points > best.tier.points ? item : best);
        const filePath = path.resolve("assets", "achievements", `logo-full-${highest.tier.medal}-256.png`);
        const fileName = `achievement-${highest.tier.medal}.png`;
        const embed = new EmbedBuilder()
            .setColor(this.medalColor(highest.tier.medal))
            .setTitle(unlocked.length === 1 ? "Achievement freigeschaltet" : `${unlocked.length} Achievements freigeschaltet`)
            .setDescription(unlocked.map(item => `${item.series.icon} **${item.series.name} ${this.medalLabel(item.tier.medal)}**\n${item.series.description} · +${item.tier.points} Punkte`).join("\n\n"))
            .setThumbnail(`attachment://${fileName}`)
            .setTimestamp(now);
        const payload = { embeds: [embed], files: [new AttachmentBuilder(filePath, { name: fileName })] };

        try {
            if (settings.notificationMode === "dm" || settings.notificationMode === "both") {
                const user = await this.client!.users.fetch(first.userId);
                await user.send(payload);
            }
            if (settings.notificationMode === "channel" || settings.notificationMode === "both") {
                const channel = settings.channelId
                    ? await this.client!.channels.fetch(settings.channelId).catch(() => null)
                    : null;
                if (channel?.isTextBased()) {
                    await (channel as GuildTextBasedChannel).send({ content: `<@${first.userId}>`, ...payload });
                } else if (settings.notificationMode === "channel") {
                    throw new Error("Achievement channel is unavailable.");
                }
            }
            await this.store.markAchievementNotificationsDelivered(ids, now);
        } catch (error) {
            const attempts = Math.max(...notifications.map(item => item.attempts)) + 1;
            const delay = Math.min(86_400_000, 60_000 * (2 ** Math.min(attempts - 1, 10)));
            await this.store.rescheduleAchievementNotifications(ids, attempts, now + delay);
            console.warn(`[Achievements] Notification delivery failed for ${first.guildId}/${first.userId}:`, error);
        }
    }

    private medalLabel(medal: "bronze" | "silver" | "gold"): string {
        return medal === "bronze" ? "Bronze" : medal === "silver" ? "Silber" : "Gold";
    }

    private resolveTiers(guildId: string, series: (typeof achievementCatalog)[number]) {
        const settings = this.getGuildSettingsCallback(guildId);
        const dynamicGold = series.id === "module-explorer"
            ? settings.activeModuleCount
            : series.id === "welcome-role" ? settings.welcomeRoleCount : undefined;
        if (!dynamicGold) return series.tiers;
        return [series.tiers[0], series.tiers[1], { ...series.tiers[2], target: Math.max(1, dynamicGold) }];
    }

    private medalColor(medal: "bronze" | "silver" | "gold"): number {
        return medal === "bronze" ? 0xb96a3d : medal === "silver" ? 0xaab4c2 : 0xe2a900;
    }
}