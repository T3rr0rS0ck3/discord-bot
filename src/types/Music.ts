import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { AudioPlayer, VoiceConnection } from "@discordjs/voice";
import type { TextBasedChannel } from "discord.js";

export type ResolvedSource = {
    streamKind: "ffmpeg" | "youtube";
    sourceUrl: string;
    sourceLabel: string;
    artworkUrl?: string;
};

export type QueueTrack = ResolvedSource & {
    id: string;
    requestedBy: string;
};

export type GuildPlayerState = {
    connection: VoiceConnection;
    player: AudioPlayer;
    queue: QueueTrack[];
    history: QueueTrack[];
    current?: QueueTrack;
    ffmpegProcess?: ChildProcessByStdio<null, Readable, Readable>;
    volume: number;
    controllerChannelId?: string;
    controllerMessageId?: string;
    controllerChannel?: TextBasedChannel;
};

export type PlaybackControlOptions = {
    skip?: boolean;
    pause?: boolean;
    resume?: boolean;
    stop?: boolean;
    volume?: number;
};
