import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { SpotifyOAuthService } from "./SpotifyOAuthService";

export class SpotifyOAuthCallbackServer {
    private readonly spotifyService: SpotifyOAuthService;
    private readonly redirectUri: string;
    private started = false;
    private server?: Server;

    public constructor(spotifyService: SpotifyOAuthService, redirectUri: string) {
        this.spotifyService = spotifyService;
        this.redirectUri = redirectUri;
    }

    public start(): void {
        if (this.started) {
            return;
        }

        const parsed = new URL(this.redirectUri);
        const defaultCallbackPort = 3000;
        const port = Number(parsed.port || String(defaultCallbackPort));
        const callbackPath = parsed.pathname;
        const bindHost = "0.0.0.0";

        this.server = createServer(async (request, response) => {
            await this.handleRequest(request, response, callbackPath);
        });

        this.server.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "EADDRINUSE") {
                console.warn(`[SpotifyOAuth] Callback port ${port} is already in use. Existing server will continue to run.`);
                return;
            }

            console.error("[SpotifyOAuth] Callback server error:", error);
        });

        this.server.listen(port, bindHost, () => {
            console.log(
                `[SpotifyOAuth] Callback server listening on ${bindHost}:${port} (public callback URL: ${parsed.origin}${callbackPath})`
            );
        });

        this.started = true;
    }

    public async stop(): Promise<void> {
        if (!this.server) {
            return;
        }

        await new Promise<void>((resolve) => {
            this.server!.close(() => resolve());
        });

        this.server = undefined;
        this.started = false;
    }

    private async handleRequest(request: IncomingMessage, response: ServerResponse, callbackPath: string): Promise<void> {
        const requestUrl = new URL(request.url ?? "/", this.redirectUri);

        if (requestUrl.pathname !== callbackPath) {
            this.writeHtml(response, 404, "Not Found", "This URL is not a Spotify callback endpoint.");
            return;
        }

        const error = requestUrl.searchParams.get("error");
        if (error) {
            this.writeHtml(response, 400, "Spotify OAuth Error", `Spotify canceled the login flow: ${error}`);
            return;
        }

        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");

        if (!code || !state) {
            this.writeHtml(response, 400, "Invalid Callback", "Missing code or state parameters.");
            return;
        }

        try {
            const result = await this.spotifyService.handleOAuthCallback(code, state);
            this.writeHtml(
                response,
                200,
                "Spotify Connected",
                `Spotify account ${result.displayName} was linked to your Discord user successfully. You can now close this browser window.`
            );
            console.log(`[SpotifyOAuth] Linked Discord user ${result.discordUserId} to Spotify ${result.spotifyUserId}.`);
        }
        catch (callbackError) {
            const message = callbackError instanceof Error ? callbackError.message : String(callbackError);
            this.writeHtml(response, 500, "OAuth Failed", message);
            console.error(`[SpotifyOAuth] Callback error: ${message}`);
        }
    }

    private writeHtml(response: ServerResponse, status: number, title: string, body: string): void {
        response.writeHead(status, {
            "Content-Type": "text/html; charset=utf-8"
        });

        response.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
body { font-family: Segoe UI, sans-serif; margin: 2rem; color: #111; }
.card { max-width: 42rem; padding: 1rem 1.25rem; border: 1px solid #ddd; border-radius: 8px; }
h1 { margin-top: 0; font-size: 1.2rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`);
    }
}
