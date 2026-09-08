# Discord Bot Home Assistant App

Die App verwendet dasselbe Multi-Arch-Image wie die normale Docker-Installation.
Die SQLite-Konfiguration und die Community-Daten liegen im von Home Assistant
verwalteten `/data`-Verzeichnis.

Nach der Installation die App starten und ueber den App-Eintrag oder Ingress die
Admin-Oberflaeche oeffnen. Der Standard-Login ist `admin` / `admin`. Dort werden
Discord-Token, Guild-ID und die weiteren Moduleinstellungen gespeichert.

Beim ersten Start wird die SQLite-Datenbank mit dem aktuellen Schema automatisch
im persistenten `/data`-Verzeichnis angelegt. Eine Datenbankdatei muss nicht in
das App-Repository oder Docker-Image aufgenommen werden.

Der Spotify-OAuth-Callback ist bei Bedarf ueber Port `3000` erreichbar. Fuer
direkte Zugriffe auf die Admin-Oberflaeche kann Port `8787` zusaetzlich in den
App-Netzwerkeinstellungen freigegeben werden.
