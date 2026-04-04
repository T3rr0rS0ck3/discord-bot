import type { BotModuleFactoryOptions } from "../types/Discord";
import { IBotModule } from "./interfaces/IBotModule";
import { MusicBotModule } from "./MusicBotModule";
import { SystemModule } from "./SystemModule";
import { WelcomeModule } from "./WelcomeModule";

export class BotModuleFactory {
    public static create(options: BotModuleFactoryOptions): IBotModule[] {
        const modules: IBotModule[] = [
            new SystemModule(),
            new MusicBotModule(options)
        ];

        // Welcome module optional wenn konfiguriert
        if (options.welcomeChannelId && options.welcomeRoles && options.welcomeRoles.length > 0) {
            modules.push(
                new WelcomeModule({
                    guildId: options.guildId,
                    welcomeChannelId: options.welcomeChannelId,
                    roles: options.welcomeRoles
                })
            );
        }

        return modules;
    }
}