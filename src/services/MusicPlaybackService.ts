import { spawn, type ChildProcessByStdio } from "node:child_process";
import { type Readable } from "node:stream";
import {
    AudioPlayer,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnection,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel
} from "@discordjs/voice";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    GuildMember,
    PermissionFlagsBits,
    type TextBasedChannel,
    type VoiceBasedChannel
} from "discord.js";
import ffmpegPath from "ffmpeg-static";
import ytdlp from "yt-dlp-exec";
import type { ResolvedSource, QueueTrack, GuildPlayerState } from "../types/Music";
import { RoleService } from "./RoleService";
import { SpotifyOAuthService } from "./SpotifyOAuthService";
import { YouTubeTrackSearchService } from "./YouTubeTrackSearchService";

type MusicPlaybackServiceOptions = {
    defaultVolumePercent?: number;
    debugSearch?: boolean;
    youtubeSearchLimit?: number;
    allowedRoleNames?: string[];
};

export class MusicPlaybackService {
    private readonly spotifyService: SpotifyOAuthService;
    private readonly defaultVolume: number;
    private readonly searchDebugEnabled: boolean;
    private readonly youtubeSearchLimit: number;
    private readonly youtubeSearchService: YouTubeTrackSearchService;
    private readonly guildStates = new Map<string, GuildPlayerState>();
    public allowedRoleNames: Set<string>;

    public constructor(spotifyService: SpotifyOAuthService, options: MusicPlaybackServiceOptions) {
        this.spotifyService = spotifyService;
        this.defaultVolume = this.parseDefaultVolume(options.defaultVolumePercent);
        this.searchDebugEnabled = options.debugSearch ?? true;
        this.youtubeSearchLimit = this.parseYouTubeSearchLimit(options.youtubeSearchLimit);
        this.youtubeSearchService = new YouTubeTrackSearchService({
            searchLimit: this.youtubeSearchLimit,
            debugEnabled: this.searchDebugEnabled,
            logger: (message) => this.logSearch(message)
        });
        this.allowedRoleNames = new Set((options.allowedRoleNames ?? []).map((value) => value.trim()).filter((value) => value.length > 0));
    }

    public setAllowedRoleNames(roleNames: string[]): void {
        this.allowedRoleNames = new Set(roleNames.map((value) => value.trim()).filter((value) => value.length > 0));
    }

    public async enqueue(interaction: ChatInputCommandInteraction, sourceInput: string): Promise<string> {
        if (!interaction.inCachedGuild()) {
            throw new Error("Dieser Command geht nur auf einem Server.");
        }

        if (!ffmpegPath) {
            throw new Error("ffmpeg wurde nicht gefunden. Bitte installiere ffmpeg oder prüfe ffmpeg-static.");
        }

        const member = interaction.member;
        if (!(member instanceof GuildMember)) {
            throw new Error("Konnte Guild-Member nicht auflösen.");
        }

        if (!RoleService.hasAccess(member, [...this.allowedRoleNames])) {
            throw new Error("Du hast nicht die erforderliche Rolle für die Musikbefehle.");
        }

        const channel = member.voice.channel;
        if (!channel || !channel.isVoiceBased()) {
            throw new Error("Du musst zuerst in einem Voice-Channel sein.");
        }

        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        const permissions = channel.permissionsFor(botMember);
        if (!permissions?.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
            throw new Error("Dem Bot fehlen im Voice-Channel die Rechte Connect oder Speak.");
        }

        const resolved = await this.resolveSource(interaction.user.id, sourceInput.trim());
        const state = await this.getOrCreateGuildState(interaction.guild.id, channel);

        if (interaction.channel && interaction.channel.isTextBased()) {
            state.controllerChannel = interaction.channel;
            state.controllerChannelId = interaction.channel.id;
        }

        const track: QueueTrack = {
            ...resolved,
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            requestedBy: interaction.user.id
        };

        if (!state.current) {
            await this.startTrack(interaction.guild.id, track);
            await this.ensureControllerMessage(interaction.guild.id);
            return `Spiele jetzt ab: ${track.sourceLabel}`;
        }

        state.queue.push(track);
        await this.ensureControllerMessage(interaction.guild.id);
        await this.refreshControllerMessage(interaction.guild.id);
        return `Zur Queue hinzugefügt (#${state.queue.length}): ${track.sourceLabel}`;
    }

    public async skip(guildId: string): Promise<boolean> {
        const state = this.guildStates.get(guildId);
        if (!state?.current) {
            return false;
        }

        state.player.stop(true);
        return true;
    }

    public async back(guildId: string): Promise<boolean> {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return false;
        }

        const previous = state.history.pop();
        if (!previous) {
            return false;
        }

        if (state.current) {
            state.queue.unshift(state.current);
        }

        state.queue.unshift(previous);
        state.player.stop(true);
        return true;
    }

    public pause(guildId: string): boolean {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return false;
        }

        return state.player.pause(true);
    }

    public resume(guildId: string): boolean {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return false;
        }

        return state.player.unpause();
    }

    public setVolume(guildId: string, percent: number): number | null {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return null;
        }

        const clamped = Math.max(0, Math.min(100, percent));
        state.volume = clamped / 100;

        const resource = state.player.state.status !== AudioPlayerStatus.Idle ? state.player.state.resource : null;
        if (resource?.volume) {
            resource.volume.setVolume(state.volume);
        }

        return clamped;
    }

    public getQueueSnapshot(guildId: string): { current?: QueueTrack; queue: QueueTrack[]; paused: boolean; volumePercent: number } | null {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return null;
        }

        return {
            current: state.current,
            queue: [...state.queue],
            paused: state.player.state.status === AudioPlayerStatus.Paused,
            volumePercent: Math.round(state.volume * 100)
        };
    }

    public buildPlayerUI(guildId: string): {
        embeds: EmbedBuilder[];
        components: ActionRowBuilder<ButtonBuilder>[];
    } {
        const snapshot = this.getQueueSnapshot(guildId);

        const embed = new EmbedBuilder()
            .setTitle("Music Player")
            .setColor(0x1db954);

        if (!snapshot?.current) {
            embed.setDescription("Aktuell läuft nichts.");
        }
        else {
            embed.setDescription(`Jetzt: ${snapshot.current.sourceLabel}`)
                .addFields(
                    { name: "Status", value: snapshot.paused ? "Pausiert" : "Spielt", inline: true },
                    { name: "Lautstärke", value: `${snapshot.volumePercent}%`, inline: true },
                    { name: "Queue", value: `${snapshot.queue.length} Titel`, inline: true }
                );

            if (snapshot.current.artworkUrl) {
                embed.setThumbnail(snapshot.current.artworkUrl);
            }

            if (snapshot.queue.length > 0) {
                const preview = snapshot.queue.slice(0, 5).map((item, index) => `${index + 1}. ${item.sourceLabel}`).join("\n");
                embed.addFields({ name: "Nächste Titel", value: preview });
            }
        }

        const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("music:back").setLabel("Zurück").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music:pause-toggle").setLabel(snapshot?.paused ? "Play" : "Pause").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("music:skip").setLabel("Skip").setStyle(ButtonStyle.Secondary)
        );

        const volumeControls = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("music:vol-down-10").setLabel("-10").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music:vol-down-1").setLabel("-1").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music:vol-mute").setLabel("Mute").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music:vol-up-1").setLabel("+1").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music:vol-up-10").setLabel("+10").setStyle(ButtonStyle.Secondary)
        );

        return {
            embeds: [embed],
            components: [controls, volumeControls]
        };
    }

    public async registerControllerMessage(guildId: string, channelId: string, messageId: string): Promise<void> {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return;
        }

        state.controllerChannelId = channelId;
        state.controllerMessageId = messageId;
    }

    public async syncPlayerPanel(guildId: string): Promise<void> {
        await this.ensureControllerMessage(guildId);
    }

    public async handleButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
        if (!interaction.inCachedGuild() || !interaction.customId.startsWith("music:")) {
            return false;
        }

        if (!(interaction.member instanceof GuildMember) || !RoleService.hasAccess(interaction.member, [...this.allowedRoleNames])) {
            await interaction.reply({ content: "Du hast nicht die erforderliche Rolle für die Musikbefehle.", ephemeral: true });
            return true;
        }

        const guildId = interaction.guildId;
        if (!guildId) {
            return false;
        }

        switch (interaction.customId) {
            case "music:skip": {
                await this.skip(guildId);
                break;
            }
            case "music:back": {
                await this.back(guildId);
                break;
            }
            case "music:pause-toggle": {
                const snapshot = this.getQueueSnapshot(guildId);
                if (!snapshot) {
                    break;
                }

                if (snapshot.paused) {
                    this.resume(guildId);
                }
                else {
                    this.pause(guildId);
                }
                break;
            }
            case "music:vol-down-10": {
                const snapshot = this.getQueueSnapshot(guildId);
                if (!snapshot) {
                    break;
                }

                this.setVolume(guildId, Math.max(0, snapshot.volumePercent - 10));
                break;
            }
            case "music:vol-up-10": {
                const snapshot = this.getQueueSnapshot(guildId);
                if (!snapshot) {
                    break;
                }

                this.setVolume(guildId, Math.min(100, snapshot.volumePercent + 10));
                break;
            }
            case "music:vol-down-1": {
                const snapshot = this.getQueueSnapshot(guildId);
                if (!snapshot) {
                    break;
                }

                this.setVolume(guildId, Math.max(0, snapshot.volumePercent - 1));
                break;
            }
            case "music:vol-up-1": {
                const snapshot = this.getQueueSnapshot(guildId);
                if (!snapshot) {
                    break;
                }

                this.setVolume(guildId, Math.min(100, snapshot.volumePercent + 1));
                break;
            }
            case "music:vol-mute": {
                this.setVolume(guildId, 0);
                break;
            }
            default:
                return false;
        }

        const ui = this.buildPlayerUI(guildId);
        await interaction.update(ui);
        return true;
    }

    private async getOrCreateGuildState(guildId: string, channel: VoiceBasedChannel): Promise<GuildPlayerState> {
        const existing = this.guildStates.get(guildId);
        if (existing) {
            if (existing.connection.joinConfig.channelId !== channel.id) {
                existing.connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false
                });
                existing.connection.subscribe(existing.player);
            }

            await entersState(existing.connection, VoiceConnectionStatus.Ready, 15_000);
            return existing;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        });

        const state: GuildPlayerState = {
            connection,
            player,
            queue: [],
            history: [],
            volume: this.defaultVolume
        };

        player.on("error", (error) => {
            console.error(`[Music] Player Fehler (${guildId}): ${error.message}`);
        });

        player.on(AudioPlayerStatus.Idle, () => {
            void this.handleIdle(guildId);
        });

        connection.on("error", (error) => {
            console.error(`[Music] Connection Fehler (${guildId}): ${error.message}`);
        });

        connection.subscribe(player);
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

        this.guildStates.set(guildId, state);
        return state;
    }

    private async startTrack(guildId: string, track: QueueTrack): Promise<void> {
        const state = this.guildStates.get(guildId);
        if (!state) {
            throw new Error("Guild-Player wurde nicht initialisiert.");
        }

        if (track.streamKind === "youtube") {
            console.log(`[Music] YouTube-Quelle (${guildId}): ${track.sourceUrl}`);
        }

        this.killFfmpeg(state);

        const resource = await this.createAudioResourceForTrack(state, track);
        state.current = track;
        state.player.play(resource);
        await entersState(state.player, AudioPlayerStatus.Playing, 8_000);

        await this.refreshControllerMessage(guildId);
    }

    private async handleIdle(guildId: string): Promise<void> {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return;
        }

        if (state.current) {
            state.history.push(state.current);
            state.current = undefined;
        }

        this.killFfmpeg(state);

        const next = state.queue.shift();
        if (!next) {
            await this.refreshControllerMessage(guildId);
            return;
        }

        try {
            await this.startTrack(guildId, next);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Music] Konnte nächsten Track nicht starten (${guildId}): ${message}`);
            void this.handleIdle(guildId);
        }
    }

    private async createAudioResourceForTrack(state: GuildPlayerState, track: QueueTrack): Promise<ReturnType<typeof createAudioResource>> {
        const inputUrl = track.streamKind === "youtube" ? await this.resolveYouTubeMediaUrl(track.sourceUrl) : track.sourceUrl;

        if (!ffmpegPath) {
            throw new Error("ffmpeg wurde nicht gefunden. Bitte installiere ffmpeg oder prüfe ffmpeg-static.");
        }

        const ffmpeg = spawn(
            ffmpegPath,
            [
                "-reconnect", "1",
                "-reconnect_streamed", "1",
                "-reconnect_delay_max", "5",
                "-i", inputUrl,
                "-f", "s16le",
                "-ar", "48000",
                "-ac", "2",
                "pipe:1"
            ],
            { stdio: ["ignore", "pipe", "pipe"] }
        ) as ChildProcessByStdio<null, Readable, Readable>;

        ffmpeg.stderr.on("data", (data: Buffer) => {
            const message = data.toString().trim();
            if (message) {
                console.log(`[Music] ffmpeg: ${message}`);
            }
        });

        state.ffmpegProcess = ffmpeg;

        const resource = createAudioResource(ffmpeg.stdout, {
            inputType: StreamType.Raw,
            inlineVolume: true
        });

        resource.volume?.setVolume(state.volume);
        return resource;
    }

    private killFfmpeg(state: GuildPlayerState): void {
        if (state.ffmpegProcess && state.ffmpegProcess.exitCode === null) {
            state.ffmpegProcess.kill("SIGKILL");
        }

        state.ffmpegProcess = undefined;
    }

    private async refreshControllerMessage(guildId: string): Promise<void> {
        const state = this.guildStates.get(guildId);
        if (!state?.controllerChannel || !state.controllerMessageId) {
            return;
        }

        try {
            const message = await state.controllerChannel.messages.fetch(state.controllerMessageId);
            const ui = this.buildPlayerUI(guildId);
            await message.edit(ui);
        }
        catch {
            // If message/channel was deleted or not accessible, recreate once from stored channel.
            try {
                const recreated = await (state.controllerChannel as any).send(this.buildPlayerUI(guildId));
                state.controllerMessageId = recreated.id;
                state.controllerChannelId = recreated.channelId;
            }
            catch {
                return;
            }
        }
    }

    private async ensureControllerMessage(guildId: string): Promise<void> {
        const state = this.guildStates.get(guildId);
        if (!state?.controllerChannel) {
            return;
        }

        if (!state.controllerMessageId) {
            try {
                const message = await (state.controllerChannel as any).send(this.buildPlayerUI(guildId));
                state.controllerMessageId = message.id;
                state.controllerChannelId = message.channelId;
                return;
            }
            catch {
                return;
            }
        }

        await this.refreshControllerMessage(guildId);
    }

    private async resolveYouTubeMediaUrl(youtubeUrl: string): Promise<string> {
        try {
            const output = await ytdlp(youtubeUrl, {
                f: "bestaudio",
                g: true,
                noWarnings: true,
                skipDownload: true
            } as any);

            const firstLine = String(output).split("\n").map((line) => line.trim()).find((line) => line.length > 0);
            if (!firstLine || !this.isHttpUrl(firstLine)) {
                throw new Error("yt-dlp lieferte keine gültige Audio-URL.");
            }

            return firstLine;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`YouTube-Stream konnte nicht aufgelöst werden: ${message}`);
        }
    }

    private async resolveSource(discordUserId: string, sourceInput: string): Promise<ResolvedSource> {
        this.logSearch(`resolveSource input=\"${sourceInput}\"`);

        if (this.spotifyService.isSpotifyTrackUrl(sourceInput)) {
            this.logSearch("Input als Spotify-Track-URL erkannt.");
            const metadata = await this.spotifyService.resolveTrackMetadata(discordUserId, sourceInput);
            if (!metadata) {
                throw new Error("Spotify-Track konnte nicht geladen werden.");
            }

            const fallback = await this.youtubeSearchService.resolveByQuery(`${metadata.artists.join(" ")} ${metadata.title}`, metadata, sourceInput);
            return {
                streamKind: "youtube",
                sourceUrl: fallback.url,
                sourceLabel: `${metadata.title} - ${metadata.artists.join(", ")}`,
                artworkUrl: metadata.artworkUrl ?? fallback.thumbnailUrl
            };
        }

        if (this.isYouTubeUrl(sourceInput)) {
            this.logSearch("Input als YouTube-URL erkannt.");
            const normalized = this.youtubeSearchService.normalizeYouTubeUrl(sourceInput);
            if (!normalized) {
                throw new Error("YouTube-Link ist ungültig oder nicht direkt abspielbar.");
            }

            return {
                streamKind: "youtube",
                sourceUrl: normalized,
                sourceLabel: normalized,
                artworkUrl: this.youtubeSearchService.getYouTubeThumbnailUrl(normalized)
            };
        }

        if (this.isHttpUrl(sourceInput)) {
            this.logSearch("Input als direkte HTTP-Audioquelle erkannt.");
            return {
                streamKind: "ffmpeg",
                sourceUrl: sourceInput,
                sourceLabel: sourceInput
            };
        }

        this.logSearch("Versuche Spotify-Metadaten fuer Textsuche.");
        try {
            const metadata = await this.spotifyService.searchTrackMetadata(discordUserId, sourceInput);
            if (metadata) {
                const fallback = await this.youtubeSearchService.resolveByQuery(`${metadata.artists.join(" ")} ${metadata.title}`, metadata, sourceInput);
                return {
                    streamKind: "youtube",
                    sourceUrl: fallback.url,
                    sourceLabel: `${metadata.title} - ${metadata.artists.join(", ")}`,
                    artworkUrl: metadata.artworkUrl ?? fallback.thumbnailUrl
                };
            }
        }
        catch {
            // Ignore and try direct YouTube search fallback.
        }

        this.logSearch("Starte direkte YouTube-Suche mit Original-Query.");
        const youtubeResult = await this.youtubeSearchService.resolveByQuery(sourceInput, undefined, sourceInput);

        return {
            streamKind: "youtube",
            sourceUrl: youtubeResult.url,
            sourceLabel: `${youtubeResult.title} (${youtubeResult.url})`,
            artworkUrl: youtubeResult.thumbnailUrl
        };
    }

    private isHttpUrl(value: string): boolean {
        try {
            const parsed = new URL(value);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
        }
        catch {
            return false;
        }
    }

    private isYouTubeUrl(value: string): boolean {
        try {
            const parsed = new URL(value);
            const host = parsed.hostname.toLowerCase();
            return host.includes("youtube.com") || host.includes("youtu.be");
        }
        catch {
            return false;
        }
    }

    private parseDefaultVolume(value: string | number | undefined): number {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return 1;
        }

        const clamped = Math.max(0, Math.min(100, parsed));
        return clamped / 100;
    }

    private parseYouTubeSearchLimit(value: number | string | undefined): number {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return 25;
        }

        return Math.max(10, Math.min(100, Math.floor(parsed)));
    }

    private logSearch(message: string): void {
        if (!this.searchDebugEnabled) {
            return;
        }

        console.log(`[Music][Search] ${message}`);
    }
}
