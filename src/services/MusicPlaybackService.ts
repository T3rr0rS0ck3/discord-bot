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
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    type TextBasedChannel,
    type VoiceBasedChannel
} from "discord.js";
import ffmpegPath from "ffmpeg-static";
import ytdlp from "yt-dlp-exec";
import type { ResolvedSource, QueueTrack, GuildPlayerState, MusicLoopMode } from "../types/Music";
import { RoleService } from "./RoleService";
import { TheAudioDbService } from "./TheAudioDbService";
import { YouTubeTrackSearchService } from "./YouTubeTrackSearchService";

type MusicPlaybackServiceOptions = {
    defaultVolumePercent?: number;
    debugSearch?: boolean;
    youtubeSearchLimit?: number;
    allowedRoleNames?: string[];
};

export class MusicPlaybackService {
    private readonly audioDbService: TheAudioDbService;
    private readonly defaultVolume: number;
    private readonly searchDebugEnabled: boolean;
    private readonly youtubeSearchLimit: number;
    private readonly youtubeSearchService: YouTubeTrackSearchService;
    private readonly guildStates = new Map<string, GuildPlayerState>();
    private allowedRoleNames: Set<string>;

    public constructor(audioDbService: TheAudioDbService, options: MusicPlaybackServiceOptions) {
        this.audioDbService = audioDbService;
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

    public shutdown(): void {
        for (const state of this.guildStates.values()) {
            state.player.removeAllListeners();
            state.player.stop(true);
            this.killFfmpeg(state);
            state.connection.destroy();
        }
        this.guildStates.clear();
    }

    public hasAccess(member: GuildMember): boolean {
        return RoleService.hasAccess(member, [...this.allowedRoleNames]);
    }

    public async enqueue(interaction: ChatInputCommandInteraction, sourceInput: string): Promise<string> {
        if (!interaction.inCachedGuild()) {
            throw new Error("This command can only be used in a server.");
        }

        if (!ffmpegPath) {
            throw new Error("ffmpeg was not found. Please install ffmpeg or check ffmpeg-static.");
        }

        const member = interaction.member;
        if (!(member instanceof GuildMember)) {
            throw new Error("Could not resolve guild member.");
        }

        if (!this.hasAccess(member)) {
            throw new Error("You do not have the required role for music commands.");
        }

        const channel = member.voice.channel;
        if (!channel || !channel.isVoiceBased()) {
            throw new Error("You must be in a voice channel first.");
        }

        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        const permissions = channel.permissionsFor(botMember);
        if (!permissions?.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
            throw new Error("The bot is missing Connect or Speak permissions in the voice channel.");
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
            return `Now playing: ${track.sourceLabel}`;
        }

        state.queue.push(track);
        await this.ensureControllerMessage(interaction.guild.id);
        await this.refreshControllerMessage(interaction.guild.id);
        return `Added to queue (#${state.queue.length}): ${track.sourceLabel}`;
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

        const paused = state.player.pause(true);
        if (paused && !state.pausedAt) state.pausedAt = Date.now();
        return paused;
    }

    public resume(guildId: string): boolean {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return false;
        }

        const resumed = state.player.unpause();
        if (resumed && state.pausedAt) {
            state.pausedDurationMs += Date.now() - state.pausedAt;
            state.pausedAt = undefined;
        }
        return resumed;
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

    public clearQueue(guildId: string): number {
        const state = this.guildStates.get(guildId);
        if (!state) return 0;
        const removed = state.queue.length;
        state.queue = [];
        return removed;
    }

    public removeFromQueue(guildId: string, trackId: string): boolean {
        const state = this.guildStates.get(guildId);
        if (!state) return false;
        const index = state.queue.findIndex(track => track.id === trackId);
        if (index < 0) return false;
        state.queue.splice(index, 1);
        return true;
    }

    public shuffleQueue(guildId: string): boolean {
        const state = this.guildStates.get(guildId);
        if (!state || state.queue.length < 2) return false;
        for (let index = state.queue.length - 1; index > 0; index -= 1) {
            const target = Math.floor(Math.random() * (index + 1));
            [state.queue[index], state.queue[target]] = [state.queue[target], state.queue[index]];
        }
        return true;
    }

    public cycleLoopMode(guildId: string): MusicLoopMode | undefined {
        const state = this.guildStates.get(guildId);
        if (!state) return undefined;
        state.loopMode = state.loopMode === "off" ? "track" : state.loopMode === "track" ? "queue" : "off";
        return state.loopMode;
    }

    public getQueueSnapshot(guildId: string): { current?: QueueTrack; queue: QueueTrack[]; paused: boolean; volumePercent: number; loopMode: MusicLoopMode; elapsedSec: number } | null {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return null;
        }

        return {
            current: state.current,
            queue: [...state.queue],
            paused: state.player.state.status === AudioPlayerStatus.Paused,
            volumePercent: Math.round(state.volume * 100),
            loopMode: state.loopMode,
            elapsedSec: this.getElapsedSeconds(state)
        };
    }

    public buildPlayerUI(guildId: string): {
        embeds: EmbedBuilder[];
        components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
    } {
        const snapshot = this.getQueueSnapshot(guildId);

        const embed = new EmbedBuilder()
            .setTitle("Music Player")
            .setColor(0x1db954);

        if (!snapshot?.current) {
            embed.setDescription("Nothing is currently playing.");
        }
        else {
            embed.setDescription(`Now playing: ${snapshot.current.sourceLabel}`)
                .addFields(
                    { name: "Status", value: snapshot.paused ? "Paused" : "Playing", inline: true },
                    { name: "Volume", value: `${snapshot.volumePercent}%`, inline: true },
                    { name: "Queue", value: `${snapshot.queue.length} tracks`, inline: true },
                    { name: "Loop", value: snapshot.loopMode === "off" ? "Off" : snapshot.loopMode === "track" ? "Track" : "Queue", inline: true },
                    { name: "Progress", value: this.formatProgress(snapshot.elapsedSec, snapshot.current.durationSec), inline: true }
                );

            if (snapshot.current.artworkUrl) {
                embed.setThumbnail(snapshot.current.artworkUrl);
            }

            if (snapshot.queue.length > 0) {
                const preview = snapshot.queue.slice(0, 5).map((item, index) => `${index + 1}. ${item.sourceLabel}`).join("\n");
                embed.addFields({ name: "Up next", value: preview });
            }
        }

        const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("music:back").setLabel("Back").setStyle(ButtonStyle.Secondary),
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

        const queueControls = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("music:loop").setLabel(`Loop: ${snapshot?.loopMode ?? "off"}`).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music:shuffle").setLabel("Shuffle").setStyle(ButtonStyle.Secondary).setDisabled((snapshot?.queue.length ?? 0) < 2),
            new ButtonBuilder().setCustomId("music:clear").setLabel("Clear queue").setStyle(ButtonStyle.Danger).setDisabled((snapshot?.queue.length ?? 0) === 0)
        );

        const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [controls, volumeControls, queueControls];
        if (snapshot && snapshot.queue.length > 0) {
            components.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("music:remove")
                        .setPlaceholder("Remove a track from the queue")
                        .addOptions(snapshot.queue.slice(0, 25).map((track, index) => ({
                            label: `${index + 1}. ${track.sourceLabel}`.slice(0, 100),
                            value: track.id,
                            description: "Remove this queued track"
                        })))
                )
            );
        }
        else {
            components.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("music:volume")
                        .setPlaceholder(`Set volume (${snapshot?.volumePercent ?? Math.round(this.defaultVolume * 100)}%)`)
                        .addOptions([0, 10, 25, 50, 75, 100].map(percent => ({
                            label: `${percent}%`,
                            value: String(percent),
                            default: snapshot?.volumePercent === percent
                        })))
                )
            );
        }

        return {
            embeds: [embed],
            components
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

        if (!(interaction.member instanceof GuildMember) || !this.hasAccess(interaction.member)) {
            await interaction.reply({ content: "You do not have the required role for music commands.", ephemeral: true });
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
            case "music:loop": {
                this.cycleLoopMode(guildId);
                break;
            }
            case "music:shuffle": {
                this.shuffleQueue(guildId);
                break;
            }
            case "music:clear": {
                this.clearQueue(guildId);
                break;
            }
            default:
                return false;
        }

        const ui = this.buildPlayerUI(guildId);
        await interaction.update(ui);
        return true;
    }

    public async handleStringSelectInteraction(interaction: StringSelectMenuInteraction): Promise<boolean> {
        if (!interaction.inCachedGuild() || !["music:remove", "music:volume"].includes(interaction.customId)) return false;
        if (!(interaction.member instanceof GuildMember) || !this.hasAccess(interaction.member)) {
            await interaction.reply({ content: "You do not have the required role for music controls.", ephemeral: true });
            return true;
        }

        if (interaction.customId === "music:volume") {
            this.setVolume(interaction.guildId, Number(interaction.values[0]));
            await interaction.update(this.buildPlayerUI(interaction.guildId));
            return true;
        }

        const removed = this.removeFromQueue(interaction.guildId, interaction.values[0]);
        if (!removed) {
            await interaction.reply({ content: "This track is no longer in the queue.", ephemeral: true });
            return true;
        }
        await interaction.update(this.buildPlayerUI(interaction.guildId));
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
            volume: this.defaultVolume,
            loopMode: "off",
            pausedDurationMs: 0
        };

        player.on("error", (error) => {
            console.error(`[Music] Player error (${guildId}): ${error.message}`);
        });

        player.on(AudioPlayerStatus.Idle, () => {
            void this.handleIdle(guildId);
        });

        connection.on("error", (error) => {
            console.error(`[Music] Connection error (${guildId}): ${error.message}`);
        });

        connection.subscribe(player);
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

        this.guildStates.set(guildId, state);
        return state;
    }

    private async startTrack(guildId: string, track: QueueTrack): Promise<void> {
        const state = this.guildStates.get(guildId);
        if (!state) {
            throw new Error("Guild player was not initialized.");
        }

        if (track.streamKind === "youtube") {
            console.log(`[Music] YouTube-Quelle (${guildId}): ${track.sourceUrl}`);
        }

        this.killFfmpeg(state);

        const resource = await this.createAudioResourceForTrack(state, track);
        state.current = track;
        state.startedAt = Date.now();
        state.pausedAt = undefined;
        state.pausedDurationMs = 0;
        state.player.play(resource);
        await entersState(state.player, AudioPlayerStatus.Playing, 8_000);

        await this.refreshControllerMessage(guildId);
    }

    private async handleIdle(guildId: string): Promise<void> {
        const state = this.guildStates.get(guildId);
        if (!state) {
            return;
        }

        const finished = state.current;
        if (finished) {
            state.history.push(finished);
            state.current = undefined;
            state.startedAt = undefined;
            state.pausedAt = undefined;
            state.pausedDurationMs = 0;
            if (state.loopMode === "track") {
                state.queue.unshift(finished);
            } else if (state.loopMode === "queue") {
                state.queue.push(finished);
            }
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
            console.error(`[Music] Could not start next track (${guildId}): ${message}`);
            void this.handleIdle(guildId);
        }
    }

    private async createAudioResourceForTrack(state: GuildPlayerState, track: QueueTrack): Promise<ReturnType<typeof createAudioResource>> {
        const inputUrl = track.streamKind === "youtube" ? await this.resolveYouTubeMediaUrl(track.sourceUrl) : track.sourceUrl;

        if (!ffmpegPath) {
            throw new Error("ffmpeg was not found. Please install ffmpeg or check ffmpeg-static.");
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
                throw new Error("yt-dlp did not return a valid audio URL.");
            }

            return firstLine;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to resolve YouTube stream: ${message}`);
        }
    }

    private async resolveSource(_discordUserId: string, sourceInput: string): Promise<ResolvedSource> {
        this.logSearch(`resolveSource input=\"${sourceInput}\"`);

        if (this.isYouTubeUrl(sourceInput)) {
            this.logSearch("Input als YouTube-URL erkannt.");
            const normalized = this.youtubeSearchService.normalizeYouTubeUrl(sourceInput);
            if (!normalized) {
                throw new Error("YouTube link is invalid or not directly playable.");
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

        this.logSearch("Versuche TheAudioDB-Metadaten fuer Textsuche.");
        try {
            const metadata = await this.audioDbService.searchTrackMetadata(sourceInput);
            if (metadata) {
                const fallback = await this.youtubeSearchService.resolveByQuery(`${metadata.artists.join(" ")} ${metadata.title}`, metadata, sourceInput);
                return {
                    streamKind: "youtube",
                    sourceUrl: fallback.url,
                    sourceLabel: `${metadata.title} - ${metadata.artists.join(", ")}`,
                    artworkUrl: metadata.artworkUrl ?? fallback.thumbnailUrl,
                    durationSec: metadata.durationSec || undefined
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

    private getElapsedSeconds(state: GuildPlayerState): number {
        if (!state.startedAt) return 0;
        const end = state.pausedAt ?? Date.now();
        return Math.max(0, Math.floor((end - state.startedAt - state.pausedDurationMs) / 1000));
    }

    private formatProgress(elapsedSec: number, durationSec?: number): string {
        const elapsed = this.formatDuration(elapsedSec);
        if (!durationSec) return elapsed;
        const bounded = Math.min(elapsedSec, durationSec);
        const filled = Math.round((bounded / durationSec) * 10);
        return `${this.formatDuration(bounded)} / ${this.formatDuration(durationSec)}\n${"■".repeat(filled)}${"□".repeat(10 - filled)}`;
    }

    private formatDuration(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
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
