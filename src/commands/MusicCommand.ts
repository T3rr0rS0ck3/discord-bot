import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicPlaybackService } from "../services/MusicPlaybackService";
import { SpotifyOAuthService } from "../services/SpotifyOAuthService";
import { ICommand } from "./interfaces/ICommand";

export class MusicCommand implements ICommand {
    public readonly name = "music";
    public readonly description = "Musik-Wiedergabe und Player-Steuerung";
    private readonly playbackService: MusicPlaybackService;
    private readonly spotifyService: SpotifyOAuthService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("play")
                .setDescription("Spielt eine Quelle ab oder fügt sie zur Queue hinzu")
                .addStringOption((option) =>
                    option
                        .setName("query")
                        .setDescription("MP3-URL, Spotify-Link, YouTube-Link oder Suchtext")
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("player")
                .setDescription("Zeigt den Player im Chat"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("queue")
                .setDescription("Zeigt die aktuelle Queue"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("skip")
                .setDescription("Überspringt den aktuellen Titel"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("back")
                .setDescription("Spielt den vorherigen Titel erneut"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("pause")
                .setDescription("Pausiert die Wiedergabe"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("resume")
                .setDescription("Setzt die Wiedergabe fort"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("volume")
                .setDescription("Stellt die Lautstärke ein (0-100%)")
                .addIntegerOption((option) =>
                    option
                        .setName("percent")
                        .setDescription("Lautstärke in Prozent (0 bis 100)")
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100)))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("spotify-connect")
                .setDescription("Verknüpft deinen Spotify-Account per OAuth"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("spotify-disconnect")
                .setDescription("Trennt die Verknüpfung zu deinem Spotify-Account"));

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
            await interaction.reply({ content: "Dieser Command geht nur auf einem Server.", ephemeral: true });
            return;
        }

        if (!this.playbackService.hasAccess(interaction.member)) {
            await interaction.reply({ content: "Du hast nicht die erforderliche Rolle für die Musikbefehle.", ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand(true);

        switch (subcommand) {
            case "play": {
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
                return;
            }

            case "player": {
                const ui = this.playbackService.buildPlayerUI(interaction.guildId);
                await interaction.reply({ ...ui, ephemeral: false });
                const message = await interaction.fetchReply();
                await this.playbackService.registerControllerMessage(interaction.guildId, interaction.channelId, message.id);
                return;
            }

            case "queue": {
                const snapshot = this.playbackService.getQueueSnapshot(interaction.guildId);
                if (!snapshot || !snapshot.current) {
                    await interaction.reply({ content: "Aktuell läuft nichts.", ephemeral: true });
                    return;
                }

                const queuePreview = snapshot.queue.length > 0
                    ? snapshot.queue.slice(0, 10).map((item, index) => `${index + 1}. ${item.sourceLabel}`).join("\n")
                    : "Queue ist leer.";

                await interaction.reply({
                    content: `Jetzt: ${snapshot.current.sourceLabel}\nStatus: ${snapshot.paused ? "Pausiert" : "Spielt"}\nLautstärke: ${snapshot.volumePercent}%\n\n${queuePreview}`,
                    ephemeral: true
                });
                return;
            }

            case "volume": {
                await interaction.deferReply({ ephemeral: true });
                const percent = interaction.options.getInteger("percent", true);
                const applied = this.playbackService.setVolume(interaction.guildId, percent);

                if (applied !== null) {
                    await this.playbackService.syncPlayerPanel(interaction.guildId);
                    await interaction.deleteReply();
                    return;
                }

                await interaction.editReply("Kein aktiver Player vorhanden.");
                return;
            }

            case "pause": {
                await interaction.deferReply({ ephemeral: true });
                const success = this.playbackService.pause(interaction.guildId);

                if (success) {
                    await this.playbackService.syncPlayerPanel(interaction.guildId);
                    await interaction.deleteReply();
                    return;
                }

                await interaction.editReply("Pausieren nicht möglich.");
                return;
            }

            case "resume": {
                await interaction.deferReply({ ephemeral: true });
                const success = this.playbackService.resume(interaction.guildId);

                if (success) {
                    await this.playbackService.syncPlayerPanel(interaction.guildId);
                    await interaction.deleteReply();
                    return;
                }

                await interaction.editReply("Fortsetzen nicht möglich.");
                return;
            }

            case "skip": {
                await interaction.deferReply({ ephemeral: true });
                const success = await this.playbackService.skip(interaction.guildId);

                if (success) {
                    await this.playbackService.syncPlayerPanel(interaction.guildId);
                    await interaction.deleteReply();
                    return;
                }

                await interaction.editReply("Kein Titel zum Skippen aktiv.");
                return;
            }

            case "back": {
                await interaction.deferReply({ ephemeral: true });
                const success = await this.playbackService.back(interaction.guildId);

                if (success) {
                    await this.playbackService.syncPlayerPanel(interaction.guildId);
                    await interaction.deleteReply();
                    return;
                }

                await interaction.editReply("Kein vorheriger Titel vorhanden.");
                return;
            }

            case "spotify-connect": {
                if (!this.spotifyService.isConfigured()) {
                    await interaction.reply({ content: "Spotify OAuth ist auf dem Bot nicht konfiguriert.", ephemeral: true });
                    return;
                }

                const url = this.spotifyService.createAuthorizationUrl(interaction.user.id);
                await interaction.reply({ content: `Öffne diesen Link und bestätige den Zugriff: ${url}`, ephemeral: true });
                return;
            }

            case "spotify-disconnect": {
                const deleted = await this.spotifyService.unlink(interaction.user.id);
                await interaction.reply({
                    content: deleted ? "Spotify-Verknüpfung wurde entfernt." : "Für deinen Discord-User war kein Spotify-Account gespeichert.",
                    ephemeral: true
                });
                return;
            }

            default:
                await interaction.reply({ content: "Unbekannter Subcommand.", ephemeral: true });
        }
    }
}
