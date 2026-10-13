# Sibyl.doc

> **Release-Stand (13.10.2026):** neueste veröffentlichte Vorabversion `v0.1.0-rc.3` · [Core-Kompatibilität und Addon-Browser](docs/CORE-COMPATIBILITY.md). Die Anzeige im Browser installiert keine Addons. Ältere Versionsbeispiele im folgenden Text bleiben als historische Dokumentation erhalten.

Wiki-/Dokumentationsaddon (Pre-Release 0.1.0-rc.2) für Sibyl System. Quelle für die geplante UI-/API-Parität: [Niko Wiki-Testaddon](https://github.com/FionaAleksic/Niko_Web-System/tree/Test/Addons/wiki), [bestehende React-Ansicht](https://github.com/FionaAleksic/Niko_Web-System/tree/Test/frontend-next/src/modules/wiki), [bisheriger Backend-Service](https://github.com/FionaAleksic/Niko_Web-System/blob/Test/backend/src/main/java/app/webplatform/service/WikiService.java).

Dieser Stand stellt das unabhängige Java-21-Domänenmodell für Wiki-Seiten, Revisionen, Optimistic Locking und Archiv bereit und enthält automatisierte Regressionstests. Build: `bash scripts/build-release.sh`.

**Noch nicht UI-/Funktionsparität:** Ordnerhierarchien, Medien, Blöcke, Berechtigungen, Legacy-CSS, Datenmigration, API-Routen und Plugin-UI werden erst mit dem Core-Addon-SDK angebunden. Core RC.7 kann Releases herunterladen, nicht dynamisch ausführen. Soft-Archivierung erfolgt hier in-memory als Demonstration des Datenvertrags; keine persistente Ablage oder Restore-Zusage. Keine Produktion ändern.

## Eigener Installationsvertrag

Mit `deployment.json` beschreibt das Addon die Operation `publish-ui`. Der Core führt diese generisch aus und registriert den Navigationspunkt. Die selbst gelieferte UI ist aktuell eine isolierte, rein lokale Markdown-Vorschau; der volle Wiki-Editor bleibt für eine spätere Phase offen.
