import { ICommand } from "../commands/interfaces/ICommand";
import { SystemCommand } from "../commands/system/SystemCommand";
import { IBotModule } from "./interfaces/IBotModule";

export class SystemModule implements IBotModule {
    public readonly name = "system";

    public getCommands(): ICommand[] {
        return [new SystemCommand()];
    }
}