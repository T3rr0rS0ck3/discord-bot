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

export class CommunityNameVotingModule implements IBotModule {
    public readonly name = "community-name-voting";
    private client?: Client;
    private guild?: Guild;
    private timer?: NodeJS.Timeout;
    private channelName: string;
    private durationHours: number;

    public constructor(private readonly options: BotModuleFactoryOptions) {
        this.channelName = this.normalizeChannelName(options.communityVotingChannelName);
        this.durationHours = this.normalizeDuration(options.communityVotingDurationHours);
    }

    public getCommands() { return []; }

    public async onReady(client: Client): Promise<void> {
        if (!this.options.guildId) return;
        this.client = client;
        this.guild = await client.guilds.fetch(this.options.guildId);
        await this.refresh();
    }

    public async applyRuntimeConfig(config: { communityVotingChannelName?: string; communityVotingDurationHours?: number }): Promise<void> {
        const previousName = this.channelName;
        this.channelName = this.normalizeChannelName(config.communityVotingChannelName);
        this.durationHours = this.normalizeDuration(config.communityVotingDurationHours);

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

        return false;
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

        const channel = await this.getOrCreateChannel();
        let round = await this.options.getCommunityNameVotingRound?.(this.options.guildId);
        const savedMessage = await this.options.getCommunityNameVotingMessage?.(this.options.guildId);
        let existingMessage = savedMessage?.channelId === channel.id
            ? await channel.messages.fetch(savedMessage.messageId).catch(() => undefined)
            : undefined;
        let winner: string | undefined;

        if (round && round.endsAt <= Date.now()) {
            const winnerSuggestionId = this.getPollWinnerSuggestionId(round, existingMessage);
            winner = await this.options.finishCommunityNameVotingRound?.(this.options.guildId, winnerSuggestionId);
            if (winner) console.log(`[CommunityNameVoting] Gewinner hinzugefügt: ${winner}`);
            if (existingMessage) {
                await existingMessage.delete().catch(error => console.error("[CommunityNameVoting] Alte Umfrage konnte nicht gelöscht werden:", error));
                existingMessage = undefined;
            }
            round = undefined;
        }

        if (!round) {
            round = await this.options.startCommunityNameVotingRound?.(
                this.options.guildId,
                this.durationHours * 60 * 60 * 1000
            );
        }

        const suggestionCount = await this.options.getCommunityNameSuggestionCount?.(this.options.guildId) ?? 0;
        const messagePayload = this.buildMessage(round, suggestionCount, winner);
        const canReusePoll = Boolean(round && existingMessage?.poll && !existingMessage.poll.resultsFinalized);
        if (round && existingMessage && !canReusePoll) {
            await existingMessage.delete().catch(error => console.error("[CommunityNameVoting] Alte Vorschlagsnachricht konnte nicht gelöscht werden:", error));
            existingMessage = undefined;
        }
        const message = canReusePoll
            ? existingMessage!
            : existingMessage
                ? await existingMessage.edit(messagePayload)
                : await channel.send(messagePayload);
        if (!message.pinned) {
            await message.pin().catch(error => console.error("[CommunityNameVoting] Umfrage konnte nicht angepinnt werden:", error));
        }
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

        return {
            content: `${winner ? `**Gewinner der letzten Runde:** ${winner}\n\n` : ""}# Kanalnamen-Abstimmung\nVier zufällig ausgewählte Vorschläge stehen zur Wahl. Ende: <t:${Math.floor(round.endsAt / 1000)}:R>\nNeue Vorschläge landen im Pool für eine kommende Runde.`,
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(suggestButton)],
            poll: {
                question: { text: "Wie soll der nächste Community-Sprachkanal heißen?" },
                answers: round.candidates.map(candidate => ({ text: candidate.name.slice(0, 55) })),
                duration: Math.max(1, Math.min(32 * 24, Math.ceil((round.endsAt - Date.now()) / 3_600_000))),
                allowMultiselect: false
            }
        };
    }

    private getPollWinnerSuggestionId(round: CommunityNameVotingRound, message: { poll?: { answers: Map<number, { voteCount: number }> } | null } | undefined): number | undefined {
        if (!message?.poll) return undefined;
        const answers = [...message.poll.answers.values()];
        return round.candidates
            .map((candidate, index) => ({ id: candidate.id, votes: answers[index]?.voteCount ?? 0 }))
            .sort((left, right) => right.votes - left.votes || left.id - right.id)[0]?.id;
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
        return Number.isFinite(value) ? Math.max(1, Math.min(768, Math.floor(value!))) : 168;
    }
}