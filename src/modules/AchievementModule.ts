import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type InteractionEditReplyOptions,
    type InteractionReplyOptions,
    type StringSelectMenuInteraction
} from "discord.js";
import { AchievementsCommand } from "../commands/system/AchievementsCommand";
import type { AchievementService } from "../services/AchievementService";
import type { AchievementCategory, AchievementSeries, AchievementUserState } from "../types/Achievement";
import type { ICommand } from "../commands/interfaces/ICommand";
import type { IBotModule } from "./interfaces/IBotModule";

type AchievementFilter = "all" | "unlocked" | "progress" | AchievementCategory;

export class AchievementModule implements IBotModule {
    public readonly name = "achievements";
    public readonly targetGuildId: string;
    private readonly commands: ICommand[];

    public constructor(
        guildId: string,
        private readonly service: AchievementService
    ) {
        this.targetGuildId = guildId;
        this.commands = [new AchievementsCommand(interaction => this.executeCommand(interaction))];
    }

    public getCommands(): ICommand[] {
        return this.commands;
    }

    public async handleButtonInteraction(customId: string, interaction: ButtonInteraction): Promise<boolean> {
        if (!customId.startsWith("achievements:page:")) return false;
        if (interaction.guildId !== this.targetGuildId) return false;
        const state = this.parseComponentState(customId, "page");
        if (!state || interaction.user.id !== state.viewerId) {
            await interaction.reply({ content: "Diese Achievement-Ansicht gehoert einem anderen Nutzer.", ephemeral: true });
            return true;
        }
        await interaction.update(await this.buildView(state.viewerId, state.targetId, state.filter, state.page));
        return true;
    }

    public async handleStringSelectInteraction(customId: string, interaction: StringSelectMenuInteraction): Promise<boolean> {
        if (!customId.startsWith("achievements:filter:")) return false;
        if (interaction.guildId !== this.targetGuildId) return false;
        const state = this.parseComponentState(customId, "filter");
        if (!state || interaction.user.id !== state.viewerId) {
            await interaction.reply({ content: "Diese Achievement-Ansicht gehoert einem anderen Nutzer.", ephemeral: true });
            return true;
        }
        await interaction.update(await this.buildView(state.viewerId, state.targetId, this.normalizeFilter(interaction.values[0]), 0));
        return true;
    }

    private async executeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.guildId !== this.targetGuildId) {
            await interaction.reply({ content: "Achievements sind fuer diesen Server nicht aktiv.", ephemeral: true });
            return;
        }
        const target = interaction.options.getUser("user") ?? interaction.user;
        if (target.id !== interaction.user.id && this.service.getGuildSettings(this.targetGuildId).publicProfilesEnabled === false) {
            await interaction.reply({ content: "Oeffentliche Achievement-Profile sind auf diesem Server deaktiviert.", ephemeral: true });
            return;
        }
        const filter = this.normalizeFilter(interaction.options.getString("filter"));
        const view = await this.buildView(interaction.user.id, target.id, filter, 0);
        const reply: InteractionReplyOptions = {
            embeds: view.embeds,
            components: view.components,
            ephemeral: target.id === interaction.user.id
        };
        await interaction.reply(reply);
    }

    private async buildView(viewerId: string, targetId: string, filter: AchievementFilter, requestedPage: number): Promise<InteractionEditReplyOptions> {
        const state = await this.service.getUserState(this.targetGuildId, targetId);
        const progress = new Map(state.progress.map(item => [item.seriesId, item.progress]));
        const unlocks = new Map(state.unlocks.map(item => [item.achievementId, item.unlockedAt]));
        const settings = this.service.getGuildSettings(this.targetGuildId);
        const allSeries = this.service.getCatalog().filter(series =>
            settings.enabledCategories?.has(series.category) !== false && (!series.hidden || settings.hiddenEnabled !== false)
        );
        const filtered = allSeries.filter(series => this.matchesFilter(series, filter, progress.get(series.id) ?? 0, unlocks));
        const pageCount = Math.max(1, Math.ceil(filtered.length / 5));
        const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
        const visible = filtered.slice(page * 5, page * 5 + 5);
        const unlockedCount = allSeries.flatMap(series => series.tiers).filter(tier => unlocks.has(tier.id)).length;
        const points = allSeries.flatMap(series => series.tiers).reduce((sum, tier) => sum + (unlocks.has(tier.id) ? tier.points : 0), 0);
        const embed = new EmbedBuilder()
            .setColor(0xe2a900)
            .setTitle(`Achievements von <@${targetId}>`)
            .setDescription(`**${unlockedCount} / ${allSeries.length * 3}** Medaillen · **${points} Punkte**`)
            .setFooter({ text: `Seite ${page + 1} von ${pageCount}` });

        if (visible.length === 0) {
            embed.addFields({ name: "Keine Treffer", value: "Fuer diesen Filter sind noch keine Achievements vorhanden." });
        } else {
            for (const series of visible) {
                embed.addFields({ name: `${series.icon} ${series.name}`, value: this.seriesText(series, progress.get(series.id) ?? 0, unlocks) });
            }
        }

        const filterId = `achievements:filter:${viewerId}:${targetId}:${page}`;
        const pageId = (nextPage: number) => `achievements:page:${viewerId}:${targetId}:${filter}:${nextPage}`;
        const select = new StringSelectMenuBuilder()
            .setCustomId(filterId)
            .setPlaceholder("Achievement-Filter")
            .addOptions([
                ["Alle", "all"], ["Erreicht", "unlocked"], ["In Arbeit", "progress"], ["Allgemein", "general"],
                ["Musik", "music"], ["Community", "community"], ["Abstimmungen", "voting"], ["Welcome", "welcome"], ["Twitch", "twitch"]
            ].map(([label, value]) => ({ label, value, default: value === filter })));
        const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(pageId(page - 1)).setLabel("Zurueck").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId(pageId(page + 1)).setLabel("Weiter").setStyle(ButtonStyle.Secondary).setDisabled(page >= pageCount - 1)
        );
        return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), navigation] };
    }

    private seriesText(series: AchievementSeries, value: number, unlocks: Map<string, number>): string {
        const hidden = series.hidden && !series.tiers.some(tier => unlocks.has(tier.id));
        if (hidden) return "❓ Geheimes Achievement · Bedingung wird bei der Freischaltung enthuellt.";
        const medal = (name: string, id: string) => {
            const unlockedAt = unlocks.get(id);
            return unlockedAt ? `✅ ${name} <t:${Math.floor(unlockedAt / 1000)}:d>` : `⬜ ${name}`;
        };
        const next = series.tiers.find(tier => !unlocks.has(tier.id));
        const target = next?.target ?? series.tiers[2].target;
        const filled = Math.min(10, Math.floor(Math.min(value, target) / Math.max(1, target) * 10));
        return `${series.description}\n${medal("Bronze", series.tiers[0].id)} · ${medal("Silber", series.tiers[1].id)} · ${medal("Gold", series.tiers[2].id)}\n${"█".repeat(filled)}${"░".repeat(10 - filled)} ${Math.min(value, target)} / ${target}`;
    }

    private matchesFilter(series: AchievementSeries, filter: AchievementFilter, progress: number, unlocks: Map<string, number>): boolean {
        if (filter === "all") return true;
        if (filter === "unlocked") return series.tiers.some(tier => unlocks.has(tier.id));
        if (filter === "progress") return progress > 0 && !unlocks.has(series.tiers[2].id);
        return series.category === filter;
    }

    private normalizeFilter(value: string | null | undefined): AchievementFilter {
        const supported: AchievementFilter[] = ["all", "unlocked", "progress", "general", "music", "community", "voting", "welcome", "twitch"];
        return supported.includes(value as AchievementFilter) ? value as AchievementFilter : "all";
    }

    private parseComponentState(customId: string, kind: "page" | "filter") {
        const parts = customId.split(":");
        if (kind === "page" && parts.length === 6) {
            return { viewerId: parts[2], targetId: parts[3], filter: this.normalizeFilter(parts[4]), page: Number(parts[5]) || 0 };
        }
        if (kind === "filter" && parts.length === 5) {
            return { viewerId: parts[2], targetId: parts[3], filter: "all" as AchievementFilter, page: Number(parts[4]) || 0 };
        }
        return undefined;
    }
}