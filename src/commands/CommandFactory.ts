import { CommandConstants } from "../constants/CommandConstants";
import { MusicPlaybackService } from "../services/MusicPlaybackService";
import { SpotifyOAuthService } from "../services/SpotifyOAuthService";
import { ICommand } from "./interfaces/ICommand";
import { JoinCommand } from "./JoinCommand";
import { MusicCommand } from "./MusicCommand";
import { PingCommand } from "./PingCommand";

export class CommandFactory {
    private static spotifyService: SpotifyOAuthService | null = null;
    private static playbackService: MusicPlaybackService | null = null;

    private static availableCommands: CommandConstants[] = [
        CommandConstants.PING,
        CommandConstants.JOIN,
        CommandConstants.MUSIC
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
        const spotifyService = this.getSpotifyServiceInstance();
        const playbackService = this.getPlaybackServiceInstance();

        switch (commandName) {
            case CommandConstants.PING:
                return new PingCommand();
            case CommandConstants.JOIN:
                return new JoinCommand();
            case CommandConstants.MUSIC:
                return new MusicCommand(playbackService, spotifyService);
            default:
                throw new Error(`Unbekannter Command: ${commandName}`);
        }
    }

    public static GetSpotifyService(): SpotifyOAuthService {
        return this.getSpotifyServiceInstance();
    }

    private static getSpotifyServiceInstance(): SpotifyOAuthService {
        if (!this.spotifyService) {
            this.spotifyService = new SpotifyOAuthService();
        }

        return this.spotifyService;
    }

    public static GetPlaybackService(): MusicPlaybackService {
        return this.getPlaybackServiceInstance();
    }

    private static getPlaybackServiceInstance(): MusicPlaybackService {
        if (!this.playbackService) {
            this.playbackService = new MusicPlaybackService(this.getSpotifyServiceInstance());
        }

        return this.playbackService;
    }
}