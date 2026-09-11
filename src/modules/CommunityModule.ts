import { promises as fs } from "node:fs";
import path from "node:path";
import { ChannelType, Client, Guild, VoiceState, type CategoryChannel } from "discord.js";
import type { IBotModule } from "./interfaces/IBotModule";
import type { CommunityState } from "../admin/AdminConfigStore";


type Config = { communityCategoryName?: string; communityEmptyTimeoutSeconds?: number; communityMaxChannels?: number };
type SavedState = CommunityState;

/** Tracks only channels created by this module; unrelated channels are never deleted. */
export class CommunityModule implements IBotModule {
    public readonly name = "community";
    private client?: Client;
    private guild?: Guild;
    private state: SavedState = { temporaryIds: [] };
    private timers = new Map<string, NodeJS.Timeout>();
    private pending: Promise<void> = Promise.resolve();
    private stopped = false;
    private config: Config;
    private readonly statePath: string;
    private readonly listener = (before: VoiceState, after: VoiceState): void => {
        if (before.channelId === after.channelId || after.guild.id !== this.guild?.id) return;
        this.enqueue(async () => {
            if (before.channelId) this.scheduleDeletion(before.channelId);
            if (after.channelId) this.scheduleDeletion(after.channelId);
            if (after.channelId === this.state.entryId && after.member && !after.member.user.bot) {
                await this.createRoom(after);
            }
        });
    };

    public constructor(private readonly options: Config & {
        guildId?: string;
        getCommunityChannelNames: () => Promise<string[]>;
        getCommunityState?: (guildId: string) => Promise<SavedState | undefined>;
        saveCommunityState?: (guildId: string, state: SavedState) => Promise<void>;
    }) {
        this.config = options;
        // The configured guild ID is never used as a path component without validation.
        const key = /^\d+$/.test(options.guildId ?? "") ? options.guildId : "unconfigured";
        this.statePath = path.resolve("data", `community-${key}.json`);
    }

    public getCommands() { return []; }

    private enqueue(action: () => Promise<void>): Promise<void> {
        this.pending = this.pending.then(async () => {
            if (!this.stopped) await action();
        }).catch(error => console.error("[Community]", error));
        return this.pending;
    }

    public async onReady(client: Client): Promise<void> {
        if (!this.options.guildId) return;
        this.client = client;
        client.on("voiceStateUpdate", this.listener);
        await this.enqueue(async () => {
            this.guild = await client.guilds.fetch(this.options.guildId!);
            const persisted = await this.options.getCommunityState?.(this.options.guildId!);
            if (persisted) {
                this.state = persisted;
            } else {
                await this.migrateLegacyState();
            }
            await this.setup();
            for (const id of this.state.temporaryIds) this.scheduleDeletion(id);
        });
    }

    public async applyRuntimeConfig(config: Config): Promise<void> {
        return this.enqueue(async () => {
            const changed = this.config.communityCategoryName !== config.communityCategoryName;
            const timeoutChanged = this.config.communityEmptyTimeoutSeconds !== config.communityEmptyTimeoutSeconds;
            this.config = { ...config };
            if (!this.guild) return;
            if (changed || !this.state.entryId) await this.setup();
            if (timeoutChanged) {
                for (const timer of this.timers.values()) clearTimeout(timer);
                this.timers.clear();
                for (const id of this.state.temporaryIds) this.scheduleDeletion(id);
            }
        });
    }

    public async deleteManagedChannel(channelId: string): Promise<void> {
        let failure: unknown;
        await this.enqueue(async () => {
            try {
                if (!this.guild) throw new Error("Das Community-Modul ist noch nicht mit Discord verbunden.");
                if (!this.state.temporaryIds.includes(channelId) || channelId === this.state.entryId) {
                    throw new Error("Dieser Sprachkanal wird nicht vom Community-Modul verwaltet.");
                }
                await this.guild.channels.fetch();
                const channel = this.guild.channels.cache.get(channelId);
                if (!channel) {
                    this.state.temporaryIds = this.state.temporaryIds.filter(value => value !== channelId);
                    await this.persist();
                    return;
                }
                if (channel.type !== ChannelType.GuildVoice || channel.parentId !== this.state.categoryId) {
                    throw new Error("Der Sprachkanal gehört nicht zur verwalteten Community-Kategorie.");
                }
                if (channel.members.size > 0) throw new Error("Belegte Sprachkanäle können nicht gelöscht werden.");

                const timer = this.timers.get(channelId);
                if (timer) clearTimeout(timer);
                this.timers.delete(channelId);
                await channel.delete("Manual Community channel deletion from admin UI");
                this.state.temporaryIds = this.state.temporaryIds.filter(value => value !== channelId);
                await this.persist();
            } catch (error) {
                failure = error;
            }
        });
        if (failure) throw failure;
    }

    private async setup(): Promise<void> {
        const guild = this.guild!;
        await guild.channels.fetch();
        const name = this.config.communityCategoryName?.trim().slice(0, 100) || "Community";
        const matchingCategories = [...guild.channels.cache.values()].filter((channel): channel is CategoryChannel =>
            channel.type === ChannelType.GuildCategory && channel.name === name
        );
        const storedCategory = this.state.categoryId ? guild.channels.cache.get(this.state.categoryId) : undefined;
        let category = storedCategory?.type === ChannelType.GuildCategory ? storedCategory : undefined;
        if (matchingCategories.length > 1) {
            category = matchingCategories.sort((left, right) => {
                const leftChildren = [...guild.channels.cache.values()].filter(channel => channel.parentId === left.id).length;
                const rightChildren = [...guild.channels.cache.values()].filter(channel => channel.parentId === right.id).length;
                return rightChildren - leftChildren;
            })[0];
        }
        if (category?.type !== ChannelType.GuildCategory) {
            category = matchingCategories[0];
            if (!category) {
                category = await guild.channels.create({ name, type: ChannelType.GuildCategory });
            }
        } else if (category.name !== name) await category.setName(name);
        this.state.categoryId = category.id;

        const storedEntry = this.state.entryId ? guild.channels.cache.get(this.state.entryId) : undefined;
        let entry = [...guild.channels.cache.values()].find(channel =>
            channel.type === ChannelType.GuildVoice &&
            channel.name === "➕ Sprachkanal erstellen" &&
            channel.parentId === category.id
        ) ?? storedEntry;
        if (entry?.type !== ChannelType.GuildVoice) {
            entry = [...guild.channels.cache.values()].find(channel =>
                channel.type === ChannelType.GuildVoice && channel.name === "➕ Sprachkanal erstellen"
            );
            if (!entry) {
                entry = await guild.channels.create({
                    name: "➕ Sprachkanal erstellen", type: ChannelType.GuildVoice, parent: category.id
                });
            }
        }
        if (entry.type !== ChannelType.GuildVoice) {
            throw new Error("Community entry channel is not a voice channel.");
        }
        if (entry.parentId !== category.id) await entry.setParent(category.id);
        this.state.entryId = entry.id;

        const duplicateEntries = [...guild.channels.cache.values()].filter(channel =>
            channel.type === ChannelType.GuildVoice &&
            channel.id !== entry.id &&
            channel.name === "➕ Sprachkanal erstellen" &&
            channel.members.size === 0
        );
        for (const duplicate of duplicateEntries) {
            await duplicate.delete("Remove duplicate Community entry channel from an earlier bot version");
        }

        const duplicateCategories = matchingCategories.filter(candidate => candidate.id !== category.id);
        for (const duplicate of duplicateCategories) {
            const hasChildren = [...guild.channels.cache.values()].some(channel => channel.parentId === duplicate.id);
            if (!hasChildren) {
                await duplicate.delete("Remove empty duplicate Community category from an earlier bot version");
            }
        }
        await this.persist();
        console.log(`[Community] Ready: ${name}`);
    }

    private async createRoom(voice: VoiceState): Promise<void> {
        const member = voice.member!;
        if (member.voice.channelId !== this.state.entryId || this.stopped) return;
        // Creation is serialized: concurrent joins cannot race past the configured limit.
        const guild = this.guild!;
        this.state.temporaryIds = this.state.temporaryIds.filter(id => guild.channels.cache.has(id));
        const configured = this.config.communityMaxChannels ?? 50;
        const limit = Number.isFinite(configured) ? Math.max(1, Math.min(50, Math.floor(configured))) : 50;
        const children = [...guild.channels.cache.values()].filter(channel => channel.parentId === this.state.categoryId);
        if (children.length >= limit || guild.channels.cache.size >= 500) {
            console.log(`[Community] Kein neuer Sprachkanal: Kanal-Limit erreicht (Einstellung: ${limit}).`);
            await member.voice.disconnect("Maximale Anzahl Community-Sprachkanäle erreicht");
            return;
        }
        const channelNames = await this.options.getCommunityChannelNames();
        if (!channelNames.length) throw new Error("Keine Community-Kanalnamen in SQLite vorhanden.");
        if (member.voice.channelId !== this.state.entryId || this.stopped) return;
        const usedNames = new Set([...guild.channels.cache.values()].map(channel => channel.name));
        const availableNames = channelNames.filter(name => !usedNames.has(name));
        const pool = availableNames.length ? availableNames : channelNames;
        const room = await this.guild!.channels.create({
            name: pool[Math.floor(Math.random() * pool.length)],
            type: ChannelType.GuildVoice, parent: this.state.categoryId
        });
        this.state.temporaryIds.push(room.id);
        try {
            await this.persist();
            if (!this.stopped && member.voice.channelId === this.state.entryId) {
                await member.voice.setChannel(room);
            }
        } finally {
            this.scheduleDeletion(room.id);
        }
    }

    private scheduleDeletion(id: string): void {
        if (!this.state.temporaryIds.includes(id) || id === this.state.entryId) return;
        const room = this.guild?.channels.cache.get(id);
        if (room?.type !== ChannelType.GuildVoice || room.members.size > 0 || this.stopped) {
            const timer = this.timers.get(id);
            if (timer) clearTimeout(timer);
            this.timers.delete(id);
            return;
        }
        if (this.timers.has(id)) return;
        const seconds = Math.max(1, Math.min(86400, this.config.communityEmptyTimeoutSeconds ?? 60));
        const timer = setTimeout(() => {
            void this.enqueue(async () => {
                if (this.timers.get(id) !== timer) return;
                this.timers.delete(id);
                // Read current gateway membership again immediately before deleting.
                const current = this.guild?.channels.cache.get(id);
                if (current?.type === ChannelType.GuildVoice && current.members.size > 0) return;
                if (current && current.type !== ChannelType.GuildVoice) return;
                if (current) {
                    try { await current.delete("Community voice channel empty timeout"); }
                    catch (error) { this.scheduleDeletion(id); throw error; }
                }
                this.state.temporaryIds = this.state.temporaryIds.filter(value => value !== id);
                await this.persist();
            });
        }, seconds * 1000);
        this.timers.set(id, timer);
    }

    private async persist(): Promise<void> {
        if (this.options.saveCommunityState && this.options.guildId) {
            await this.options.saveCommunityState(this.options.guildId, this.state);
            return;
        }

        await fs.mkdir(path.dirname(this.statePath), { recursive: true });
        await fs.writeFile(`${this.statePath}.tmp`, JSON.stringify(this.state), "utf8");
        await fs.rename(`${this.statePath}.tmp`, this.statePath);
    }

    private async migrateLegacyState(): Promise<void> {
        try {
            const saved = JSON.parse(await fs.readFile(this.statePath, "utf8")) as SavedState;
            if (!Array.isArray(saved.temporaryIds) || !saved.temporaryIds.every(id => /^\d+$/.test(id))) {
                throw new Error("Invalid Community channel state");
            }
            this.state = saved;
            if (this.options.saveCommunityState && this.options.guildId) {
                await this.options.saveCommunityState(this.options.guildId, this.state);
                await fs.unlink(this.statePath);
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }

    public async shutdown(): Promise<void> {
        this.stopped = true;
        this.client?.off("voiceStateUpdate", this.listener);
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
        await this.pending;
    }
}
