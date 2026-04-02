import { CommandConstants } from "../constants/CommandConstants";
import { ICommand } from "./interfaces/ICommand";
import { JoinCommand } from "./JoinCommand";
import { PingCommand } from "./PingCommand";
import { PlayCommand } from "./PlayCommand";

export class CommandFactory {
    private static availableCommands: CommandConstants[] = [
        CommandConstants.PING,
        CommandConstants.JOIN,
        CommandConstants.PLAY
    ];

    public static Create(): ICommand[] {
        const commands: ICommand[] = [];

        CommandFactory.availableCommands.forEach(commandName => {
            try {
                const command = this.CreateCommand(commandName);
                commands.push(command);
                console.log(`Command ${commandName} erstellt.`);
            } catch (error) {
                console.error(`Fehler beim Erstellen des Commands ${commandName}:`, error);
            }
        });

        return commands;
    }

    public static CreateCommand(commandName: CommandConstants): ICommand {
        switch (commandName) {
            case CommandConstants.PING:
                return new PingCommand();
            case CommandConstants.JOIN:
                return new JoinCommand();
            case CommandConstants.PLAY:
                return new PlayCommand();
            default:
                throw new Error(`Unbekannter Command: ${commandName}`);
        }
    }
}