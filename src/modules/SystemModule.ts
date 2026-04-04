import { ICommand } from "../commands/interfaces/ICommand";
import { JoinCommand } from "../commands/system/JoinCommand";
import { PingCommand } from "../commands/system/PingCommand";
import { IBotModule } from "./interfaces/IBotModule";

export class SystemModule implements IBotModule {
    public readonly name = "system";

    public getCommands(): ICommand[] {
        return [new PingCommand(), new JoinCommand()];
    }
}