import dotenv from "dotenv";
import { DiscordBot } from "./bot/DiscordBot";
import { BotModuleFactory } from "./modules/BotModuleFactory";

export class Startup {
    public static async Start(): Promise<void> {
        dotenv.config();

        const token = process.env.DISCORD_TOKEN;
        const guildId = process.env.GUILD_ID;
        const musicRoleName = process.env.MUSIC_ROLE_NAME ?? "Music Bot";

        if (!token) {
            throw new Error("DISCORD_TOKEN fehlt. Bitte in .env setzen.");
        }

        const modules = BotModuleFactory.create({
            guildId,
            musicRoleName
        });

        for (const module of modules) {
            if (module.initialize) {
                await module.initialize();
            }
        }

        const commands = modules.flatMap((module) => module.getCommands());

        console.log(`[Modules] Aktiv: ${modules.map((module) => module.name).join(", ")}`);

        const bot = new DiscordBot({
            token,
            guildId,
            commands: commands,
            onReady: async (client) => {
                for (const module of modules) {
                    if (module.onReady) {
                        await module.onReady(client);
                    }
                }
            },
            buttonHandler: async (customId, interaction) => {
                for (const module of modules) {
                    if (!module.handleButtonInteraction) {
                        continue;
                    }

                    const handled = await module.handleButtonInteraction(customId, interaction);
                    if (handled) {
                        return true;
                    }
                }

                return false;
            }
        });

        await bot.start();
    }
}

void Startup.Start();