# TODO

## Prioritaet 1: Betrieb und Status

- [x] Healthcheck-Endpunkt fuer Docker und Home Assistant ergaenzen
- [x] Docker-Healthcheck fuer Port `8787` konfigurieren
- [x] Statusanzeige in der Admin-UI einfuehren: online, Token ungueltig, Guild nicht erreichbar
- [ ] Graceful Shutdown bei Container- und Home-Assistant-Neustarts pruefen
- [ ] Automatische Datenbankmigrationen mit Versionsanzeige ergaenzen
- [ ] Rate-Limit- und Timeout-Behandlung fuer TheAudioDB und YouTube verbessern

## Prioritaet 2: Sicherheit und Konfiguration

- [ ] Admin-Passwoerter gehasht statt im Klartext in SQLite speichern
- [ ] Login-Versuche begrenzen und bei zu vielen Fehlversuchen temporaer sperren
- [ ] Alle Sessions nach einer Admin-Passwortaenderung beenden
- [ ] Konfigurations-Backup aus der Admin-UI herunterladen koennen
- [ ] Konfigurations-Backup aus der Admin-UI wiederherstellen koennen
- [ ] Testverbindung fuer Discord, TheAudioDB und Twitch anbieten

## Musik

- [ ] `/music remove` zum Entfernen einzelner Queue-Eintraege ergaenzen
- [ ] `/music clear` zum Leeren der Queue ergaenzen
- [ ] Loop fuer den aktuellen Track und fuer die gesamte Queue ergaenzen
- [ ] Shuffle fuer die Queue ergaenzen
- [ ] Lautstaerke-Slider im Musik-Player ergaenzen
- [ ] Fortschrittsanzeige und Trackdauer im Musik-Player anzeigen
- [ ] Mehrere TheAudioDB-Suchergebnisse zur Auswahl anzeigen
- [ ] Bei fehlenden TheAudioDB-Treffern auf direkte YouTube-Suche zurueckfallen

## Community

- [ ] Status der Community-Kategorie und verwalteten Kanaele in der Admin-UI anzeigen
- [ ] Verwaiste Community-Kanaele manuell ueber die UI aufraeumen koennen
- [ ] Bestimmte Rollen oder Benutzer von Community-Kanaelen ausschliessen koennen
- [ ] Community-Kanalnamen aus der UI exportieren koennen
- [ ] Community-Kanalnamen aus der UI importieren koennen

## Welcome und Twitch

- [ ] Testbutton fuer Welcome-Rollen ergaenzen
- [ ] Vorschau der Welcome-Nachricht anzeigen
- [ ] Twitch-Synchronisierung manuell starten koennen
- [ ] Zeitpunkt des letzten erfolgreichen Twitch-Syncs anzeigen
- [ ] Protokollieren, welche Twitch-Rollen hinzugefuegt oder entfernt wurden

## Tests und Qualitaet

- [ ] Tests fuer Pflichtfeldvalidierung ergaenzen
- [ ] Tests fuer TheAudioDB v1 und v2 ergaenzen
- [ ] Tests fuer ungueltige Discord-Tokens ergaenzen
- [ ] Tests fuer Healthcheck und Shutdown ergaenzen
- [ ] Admin-UI in Desktop- und Mobile-Ansicht pruefen
