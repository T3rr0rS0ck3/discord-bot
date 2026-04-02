import dotenv from "dotenv";
import { DiscordBot } from "./bot/DiscordBot";
import { CommandFactory } from "./commands/CommandFactory";

export class Startup {
    public static Start(): void {
        dotenv.config();

        const token = process.env.DISCORD_TOKEN;
        const guildId = process.env.GUILD_ID;

        if (!token) {
            throw new Error("DISCORD_TOKEN fehlt. Bitte in .env setzen.");
        }

        const commands = CommandFactory.Create();

        const bot = new DiscordBot({
            token,
            guildId,
            commands: commands
        });

        void bot.start();
    }
}

Startup.Start();