import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    Client,
    Guild,
    ModalBuilder,
    ModalSubmitInteraction,
    TextChannel,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";
import type { CommunityNameVotingRound } from "../admin/AdminConfigStore";
import type { BotModuleFactoryOptions } from "../types/Discord";
import type { IBotModule } from "./interfaces/IBotModule";

const SUGGEST_BUTTON_ID = "community-name-voting:suggest";
const SUGGEST_MODAL_ID = "community-name-voting:suggest-modal";
const SUGGEST_INPUT_ID = "channel-name";
const VOTE_PREFIX = "community-name-voting:vote:";

export class CommunityNameVotingModule implements IBotModule {
    public readonly name = "community-name-voting";
    private client?: Client;
    private guild?: Guild;
    private timer?: NodeJS.Timeout;
    private channelName: string;
    private durationDays: number;

    public constructor(private readonly options: BotModuleFactoryOptions) {
        this.channelName = this.normalizeChannelName(options.communityVotingChannelName);
        this.durationDays = this.normalizeDuration(options.communityVotingDurationDays);
    }

    public getCommands() { return []; }

    public async onReady(client: Client): Promise<void> {
        if (!this.options.guildId) return;
        this.client = client;
        this.guild = await client.guilds.fetch(this.options.guildId);
        await this.refresh();
    }

    public async applyRuntimeConfig(config: { communityVotingChannelName?: string; communityVotingDurationDays?: number }): Promise<void> {
        const previousName = this.channelName;
        this.channelName = this.normalizeChannelName(config.communityVotingChannelName);
        this.durationDays = this.normalizeDuration(config.communityVotingDurationDays);

        if (!this.guild) return;
        const channel = await this.getOrCreateChannel();
        if (channel.name !== this.channelName && channel.name === previousName) {
            await channel.setName(this.channelName, "Community name voting configuration updated");
        }
        await this.refresh();
    }

    public async handleButtonInteraction(customId: string, interaction: ButtonInteraction): Promise<boolean> {
        if (customId === SUGGEST_BUTTON_ID) {
            await interaction.showModal(
                new ModalBuilder()
                    .setCustomId(SUGGEST_MODAL_ID)
                    .setTitle("Kanalnamen vorschlagen")
                    .addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId(SUGGEST_INPUT_ID)
                                .setLabel("Neuer Kanalname")
                                .setStyle(TextInputStyle.Short)
                                .setMinLength(1)
                                .setMaxLength(100)
                                .setRequired(true)
                        )
                    )
            );
            return true;
        }

        if (!customId.startsWith(VOTE_PREFIX)) return false;
        const suggestionId = Number(customId.slice(VOTE_PREFIX.length));
        if (!Number.isSafeInteger(suggestionId) || !interaction.guildId || !this.options.voteForCommunityName) {
            await interaction.reply({ content: "Diese Stimme konnte nicht verarbeitet werden.", ephemeral: true });
            return true;
        }

        try {
            await this.options.voteForCommunityName(interaction.guildId, suggestionId, interaction.user.id);
            await interaction.reply({ content: "Deine Stimme wurde gespeichert. Du kannst sie durch Klick auf einen anderen Namen ändern.", ephemeral: true });
            await this.refresh();
        } catch (error) {
            await interaction.reply({ content: error instanceof Error ? error.message : String(error), ephemeral: true });
        }
        return true;
    }

    public async handleModalSubmitInteraction(customId: string, interaction: ModalSubmitInteraction): Promise<boolean> {
        if (customId !== SUGGEST_MODAL_ID) return false;
        if (!interaction.guildId || !this.options.addCommunityNameSuggestion) {
            await interaction.reply({ content: "Der Vorschlag konnte nicht gespeichert werden.", ephemeral: true });
            return true;
        }

        try {
            const name = interaction.fields.getTextInputValue(SUGGEST_INPUT_ID);
            await this.options.addCommunityNameSuggestion(interaction.guildId, name, interaction.user.id);
            await interaction.reply({ content: `Der Kanalname „${name.trim()}“ wurde für eine kommende Abstimmung gespeichert.`, ephemeral: true });
            await this.refresh();
        } catch (error) {
            await interaction.reply({ content: error instanceof Error ? error.message : String(error), ephemeral: true });
        }
        return true;
    }

    public async shutdown(): Promise<void> {
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        this.client = undefined;
        this.guild = undefined;
    }

    private async refresh(): Promise<void> {
        if (!this.guild || !this.options.guildId) return;
        if (this.timer) clearTimeout(this.timer);

        const winner = await this.options.finishCommunityNameVotingRound?.(this.options.guildId);
        if (winner) console.log(`[CommunityNameVoting] Gewinner hinzugefügt: ${winner}`);

        let round = await this.options.getCommunityNameVotingRound?.(this.options.guildId);
        if (!round) {
            round = await this.options.startCommunityNameVotingRound?.(
                this.options.guildId,
                this.durationDays * 24 * 60 * 60 * 1000
            );
        }

        const channel = await this.getOrCreateChannel();
        const suggestionCount = await this.options.getCommunityNameSuggestionCount?.(this.options.guildId) ?? 0;
        const messagePayload = this.buildMessage(round, suggestionCount, winner);
        const savedMessage = await this.options.getCommunityNameVotingMessage?.(this.options.guildId);
        const existingMessage = savedMessage?.channelId === channel.id
            ? await channel.messages.fetch(savedMessage.messageId).catch(() => undefined)
            : undefined;
        const message = existingMessage
            ? await existingMessage.edit(messagePayload)
            : await channel.send(messagePayload);
        await this.options.saveCommunityNameVotingMessage?.(this.options.guildId, channel.id, message.id);

        if (round) {
            const delay = Math.max(1_000, Math.min(round.endsAt - Date.now(), 2_147_000_000));
            this.timer = setTimeout(() => void this.refresh().catch(error => console.error("[CommunityNameVoting]", error)), delay);
        }
    }

    private buildMessage(round: CommunityNameVotingRound | undefined, suggestionCount: number, winner?: string) {
        const suggestButton = new ButtonBuilder()
            .setCustomId(SUGGEST_BUTTON_ID)
            .setLabel("Namen vorschlagen")
            .setStyle(ButtonStyle.Primary);

        if (!round) {
            return {
                content: `${winner ? `**Gewinner der letzten Runde:** ${winner}\n\n` : ""}# Kanalnamen-Abstimmung\nDer Vorschlagspool enthält ${suggestionCount}/4 Namen. Sobald vier Vorschläge vorhanden sind, werden zufällig vier Namen für die nächste Abstimmung ausgewählt.`,
                components: [new ActionRowBuilder<ButtonBuilder>().addComponents(suggestButton)]
            };
        }

        const voteButtons = round.candidates.map(candidate =>
            new ButtonBuilder()
                .setCustomId(`${VOTE_PREFIX}${candidate.id}`)
                .setLabel(`${candidate.name} (${candidate.votes})`.slice(0, 80))
                .setStyle(ButtonStyle.Secondary)
        );
        return {
            content: `# Kanalnamen-Abstimmung\nVier zufällig ausgewählte Vorschläge stehen zur Wahl. Ende: <t:${Math.floor(round.endsAt / 1000)}:R>\nNeue Vorschläge landen im Pool für eine kommende Runde.`,
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(suggestButton, ...voteButtons)]
        };
    }

    private async getOrCreateChannel(): Promise<TextChannel> {
        const guild = this.guild!;
        await guild.channels.fetch();
        const existing = guild.channels.cache.find(
            channel => channel.type === ChannelType.GuildText && channel.name === this.channelName
        );
        if (existing?.type === ChannelType.GuildText) return existing;
        return guild.channels.create({
            name: this.channelName,
            type: ChannelType.GuildText,
            reason: "Community name voting module"
        });
    }

    private normalizeChannelName(value: string | undefined): string {
        return (value?.trim().toLowerCase().replace(/[^a-z0-9äöüß-]+/g, "-").replace(/^-+|-+$/g, "") || "kanalnamen-abstimmung").slice(0, 100);
    }

    private normalizeDuration(value: number | undefined): number {
        return Number.isFinite(value) ? Math.max(1, Math.min(30, Math.floor(value!))) : 7;
    }
}