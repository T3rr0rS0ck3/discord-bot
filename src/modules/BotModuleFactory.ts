import type { BotModuleFactoryOptions } from "../types/Discord";
import { IBotModule } from "./interfaces/IBotModule";
import { MusicBotModule } from "./MusicBotModule";
import { SystemModule } from "./SystemModule";

export class BotModuleFactory {
    public static create(options: BotModuleFactoryOptions): IBotModule[] {
        return [
            new SystemModule(),
            new MusicBotModule(options)
        ];
    }
}