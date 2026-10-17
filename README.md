# Sibyl.doc

**Test-Integration 0.7.0** – Gemeinsames Wiki und Dokumentationsaddon für Sibyl System.

- Provider-ID: `Sibyl.doc`, Typ: `documents`, Modus: `shared`.
- Daten: gemeinsame Artikel in `sibyl_addon_documents` mit `addon_id=Sibyl.doc`.
- API: `/api/v1/addons/Sibyl.doc/documents`.
- Administrator-Konfiguration: `maxBodyLength` (serverseitig für dieses Addon geprüft).
- Berechtigungen: Berechtigte Benutzer lesen; ausschließlich Administratoren bearbeiten und löschen.
- Oberfläche: vorhandene Sibyl-Dokumentenansicht.

Quellcode unter `Addons/Sibyl.doc/`. Diese Dateien sind zur Kompilierung mit dem aktuellen Core vorgesehen und stellen **keinen eigenständig deploybaren Wiki-Service** dar. Die DB-Registrierung erfolgt in Core-Migration V7.

Stand: Im Entwicklungs-Build kompiliert; End-to-End-Tests und Testdeployment stehen aus. Eine vollständige Parität mit der historischen Wiki-Oberfläche wurde nicht nachgewiesen.
