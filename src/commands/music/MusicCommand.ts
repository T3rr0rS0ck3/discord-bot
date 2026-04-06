import {
    ActionRowBuilder,
    AutocompleteInteraction,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    SlashCommandBuilder
} from "discord.js";
import { MusicPlaybackService } from "../../services/MusicPlaybackService";
import { SpotifyOAuthService } from "../../services/SpotifyOAuthService";
import { ICommand } from "../interfaces/ICommand";

export class MusicCommand implements ICommand {
    public readonly name = "music";
    public readonly description = "Music playback and player controls";
    private readonly playbackService: MusicPlaybackService;
    private readonly spotifyService: SpotifyOAuthService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("play")
                .setDescription("Play a source or add it to the queue")
                .addStringOption((option) =>
                    option
                        .setName("query")
                        .setDescription("MP3 URL, Spotify link, YouTube link, or search text")
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("player")
                .setDescription("Show the player in chat"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("queue")
                .setDescription("Show the current queue"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("skip")
                .setDescription("Skip the current track"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("back")
                .setDescription("Play the previous track again"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("pause")
                .setDescription("Pause playback"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("resume")
                .setDescription("Resume playback"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("volume")
                .setDescription("Set the volume (0-100%)")
                .addIntegerOption((option) =>
                    option
                        .setName("percent")
                        .setDescription("Volume in percent (0 to 100)")
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("spotify-connect")
                .setDescription("Link your Spotify account via OAuth"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("spotify-disconnect")
                .setDescription("Unlink your Spotify account"));

    public constructor(playbackService: MusicPlaybackService, spotifyService: SpotifyOAuthService) {
        this.playbackService = playbackService;
        this.spotifyService = spotifyService;
    }

    public async executeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "query") {
            await interaction.respond([]);
            return;
        }

        const subcommand = interaction.options.getSubcommand(false);
        if (subcommand !== "play") {
            await interaction.respond([]);
            return;
        }

        const input = String(focused.value ?? "").trim();
        if (input.length < 2) {
            await interaction.respond([]);
            return;
        }

        const suggestions = await this.spotifyService.searchTrackSuggestions(input, 10);
        await interaction.respond(
            suggestions.map((entry) => ({
                name: entry.label,
                value: entry.value
            }))
        );
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
            return;
        }

        if (!this.playbackService.hasAccess(interaction.member)) {
            await interaction.reply({ content: "You do not have the required role for music commands.", ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand(true);

        switch (subcommand) {
            case "play": {
                await this.handlePlay(interaction);
                return;
            }

            case "player": {
                await this.handlePlayer(interaction);
                return;
            }

            case "queue": {
                await this.handleQueue(interaction);
                return;
            }

            case "volume": {
                await this.handleVolume(interaction);
                return;
            }

            case "pause": {
                await this.handlePause(interaction);
                return;
            }

            case "resume": {
                await this.handleResume(interaction);
                return;
            }

            case "skip": {
                await this.handleSkip(interaction);
                return;
            }

            case "back": {
                await this.handleBack(interaction);
                return;
            }

            case "spotify-connect": {
                await this.handleSpotifyConnect(interaction);
                return;
            }

            case "spotify-disconnect": {
                await this.handleSpotifyDisconnect(interaction);
                return;
            }

            default:
                await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
        }
    }

    private async handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        const source = interaction.options.getString("query", true);

        try {
            const result = await this.playbackService.enqueue(interaction, source);
            await interaction.editReply(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await interaction.editReply(message);
        }
    }

    private async handlePlayer(interaction: ChatInputCommandInteraction): Promise<void> {
        const guildId = this.requireGuildId(interaction);
        const ui = this.playbackService.buildPlayerUI(guildId);
        await interaction.reply({ ...ui, ephemeral: false });
        const message = await interaction.fetchReply();
        await this.playbackService.registerControllerMessage(guildId, interaction.channelId, message.id);
    }

    private async handleQueue(interaction: ChatInputCommandInteraction): Promise<void> {
        const guildId = this.requireGuildId(interaction);
        const snapshot = this.playbackService.getQueueSnapshot(guildId);
        if (!snapshot || !snapshot.current) {
            await interaction.reply({ content: "Nothing is currently playing.", ephemeral: true });
            return;
        }

        const queuePreview = snapshot.queue.length > 0
            ? snapshot.queue.slice(0, 10).map((item, index) => `${index + 1}. ${item.sourceLabel}`).join("\n")
            : "Queue is empty.";

        await interaction.reply({
            content: `Now playing: ${snapshot.current.sourceLabel}\nStatus: ${snapshot.paused ? "Paused" : "Playing"}\nVolume: ${snapshot.volumePercent}%\n\n${queuePreview}`,
            ephemeral: true
        });
    }

    private async handleVolume(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        const guildId = this.requireGuildId(interaction);
        const percent = interaction.options.getInteger("percent", true);
        const applied = this.playbackService.setVolume(guildId, percent);

        if (applied !== null) {
            await this.playbackService.syncPlayerPanel(guildId);
            await interaction.deleteReply();
            return;
        }

        await interaction.editReply("No active player found.");
    }

    private async handlePause(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        const guildId = this.requireGuildId(interaction);
        const success = this.playbackService.pause(guildId);

        if (success) {
            await this.playbackService.syncPlayerPanel(guildId);
            await interaction.deleteReply();
            return;
        }

        await interaction.editReply("Unable to pause playback.");
    }

    private async handleResume(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        const guildId = this.requireGuildId(interaction);
        const success = this.playbackService.resume(guildId);

        if (success) {
            await this.playbackService.syncPlayerPanel(guildId);
            await interaction.deleteReply();
            return;
        }

        await interaction.editReply("Unable to resume playback.");
    }

    private async handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        const guildId = this.requireGuildId(interaction);
        const success = await this.playbackService.skip(guildId);

        if (success) {
            await this.playbackService.syncPlayerPanel(guildId);
            await interaction.deleteReply();
            return;
        }

        await interaction.editReply("No track is currently available to skip.");
    }

    private async handleBack(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });
        const guildId = this.requireGuildId(interaction);
        const success = await this.playbackService.back(guildId);

        if (success) {
            await this.playbackService.syncPlayerPanel(guildId);
            await interaction.deleteReply();
            return;
        }

        await interaction.editReply("No previous track available.");
    }

    private async handleSpotifyConnect(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!this.spotifyService.isConfigured()) {
            await interaction.reply({ content: "Spotify OAuth is not configured on this bot.", ephemeral: true });
            return;
        }

        const url = this.spotifyService.createAuthorizationUrl(interaction.user.id);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setURL(url)
                .setLabel("Open Spotify Connect")
        );

        await interaction.reply({
            content: "Click the button to connect your Spotify account.",
            components: [row],
            ephemeral: true
        });
    }

    private async handleSpotifyDisconnect(interaction: ChatInputCommandInteraction): Promise<void> {
        const deleted = await this.spotifyService.unlink(interaction.user.id);
        await interaction.reply({
            content: deleted ? "Spotify link removed." : "No Spotify account is linked to your Discord user.",
            ephemeral: true
        });
    }

    private requireGuildId(interaction: ChatInputCommandInteraction): string {
        if (!interaction.guildId) {
            throw new Error("This command can only be used in a server.");
        }

        return interaction.guildId;
    }
}
