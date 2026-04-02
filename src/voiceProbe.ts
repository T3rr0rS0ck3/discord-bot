import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import { entersState, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;
const voiceChannelId = process.env.VOICE_CHANNEL_ID;

if (!token) {
    throw new Error("DISCORD_TOKEN fehlt.");
}

if (!guildId) {
    throw new Error("GUILD_ID fehlt.");
}

if (!voiceChannelId) {
    throw new Error("VOICE_CHANNEL_ID fehlt.");
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once("ready", async () => {
    console.log(`[Probe] Bot online als ${client.user?.tag}`);

    try {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(voiceChannelId);

        if (!channel || !channel.isVoiceBased()) {
            throw new Error("VOICE_CHANNEL_ID ist kein Voice-Channel.");
        }

        const me = guild.members.me ?? await guild.members.fetchMe();
        const permissions = channel.permissionsFor(me);

        console.log(`[Probe] Guild: ${guild.name} (${guild.id})`);
        console.log(`[Probe] Channel: ${channel.name} (${channel.id})`);
        console.log(`[Probe] Permissions - Connect: ${permissions?.has("Connect")}, Speak: ${permissions?.has("Speak")}`);

        const startedAt = Date.now();

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        connection.on("stateChange", (oldState, newState) => {
            console.log(`[Probe] State (+${Date.now() - startedAt}ms): ${oldState.status} -> ${newState.status}`);
        });

        connection.on("error", (error) => {
            console.error(`[Probe] Voice-Error: ${error.message}`);
        });

        connection.on("debug", (info) => {
            console.log(`[Probe] Voice-Debug: ${info}`);
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
            console.log("[Probe] SUCCESS: Connection reached Ready.");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Probe] FAIL: Ready not reached (${message}). Current status: ${connection.state.status}`);
        }

        if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
            connection.destroy();
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Probe] Fatal: ${message}`);
    }
    finally {
        await client.destroy();
        process.exit(0);
    }
});

client.on("error", (error) => {
    console.error(`[Probe] Client-Error: ${error.message}`);
});

void client.login(token);
