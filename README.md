# Discord Bot (Node.js + TypeScript)

Minimales Grundgerüst für einen Discord-Bot mit `/ping`, `/join` und `/play` Slash-Commands.

## Voraussetzungen

- Node.js 20+
- Ein Discord-Bot-Token

## Setup

1. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

2. `.env` erstellen und Werte eintragen:

   ```env
   DISCORD_TOKEN=dein_bot_token_hier
   GUILD_ID=deine_server_id_hier
   ```

3. Bot in der Discord Developer Console:
   - Bot auf deinen Server einladen

## Entwicklung starten

```bash
npm run dev
```

Dann im Discord-Channel:

```text
/ping
/join
/play source:https://example.com/audio.mp3
```

Antwort vom Bot:

```text
Pong! 🏓
```

Bei `/join` joint der Bot deinen aktuellen Voice-Channel.
Bei `/play` wird eine Audio-Datei oder direkte Audio-URL in deinem Voice-Channel abgespielt.

## Build + Start

```bash
npm run build
npm start
```

## Hinweis

- `GUILD_ID` sorgt dafür, dass `/ping` sofort auf deinem Server verfügbar ist.
- Ohne `GUILD_ID` wird der Command global registriert (kann bis zu 1h dauern).
- Für `/join` braucht der Bot Voice-Rechte auf dem Channel (`Connect`, optional `Speak`).
- Für `/play` sollte eine direkte Audio-URL oder ein lokaler Dateipfad angegeben werden.
- Wenn du MP3/WAV/ähnliche Dateien abspielen willst, wird `ffmpeg-static` mitinstalliert.
