# Mapa de los módulos

Generado con `node tools/panel-map.js <archivo> --md`. No editar a mano: se
regenera.

Cada fila es una declaración de primer nivel y las líneas que ocupan hasta la
siguiente. Sirve para elegir un corte por nombre, porque los títulos de sección
del código no son fronteras fiables: la sección "Tema del panel" arrastraba
filtros de TUNE, salud y configuración, y "Season tracker" arrastra el bucle de
refresco del panel y el pace vivo.

## 80-panel.js

Entre `createPanel` y `updatePanel` suman 1875 de las 5187 líneas, y las seis de abajo pasan de la mitad del archivo. No son "vistas": son dos funciones:

| Línea | Tipo | Nombre | Líneas |
| --- | --- | --- | --- |
| 2260 | fn | `createPanel` | 1210 |
| 4378 | fn | `updatePanel` | 665 |
| 1926 | fn | `diagnosticReport` | 232 |
| 1609 | fn | `paintLogLists` | 133 |
| 1800 | fn | `importConfig` | 126 |
| 4038 | fn | `paintSeason` | 116 |

Partir "por vistas" (garaje, TUNE, LOG) obliga a entrar dentro de `createPanel`
y `updatePanel`: la plantilla HTML y el cableado de eventos viven ahí. Un corte
por títulos movería código ajeno, que es lo que pasó en el primer intento.

### `80-panel.js` · 5187 lineas

| Linea | Tipo | Nombre | Lineas hasta la siguiente |
| --- | --- | --- | --- |
| 5 | state | `PANEL_ID` | 1 |
| 6 | state | `panel` | 6 |
| 12 | fn | `setText` | 7 |
| 19 | fn | `setDisplay` | 6 |
| 25 | fn | `setColor` | 4 |
| 29 | fn | `setGood` | 16 |
| 45 | fn | `configSnapshot` | 33 |
| 78 | fn | `setUseNitro` | 20 |
| 98 | state | `keepAliveCtx` | 1 |
| 99 | state | `keepAliveSource` | 1 |
| 100 | state | `keepAliveGain` | 1 |
| 101 | state | `keepAliveMode` | 1 |
| 102 | state | `keepAliveError` | 1 |
| 103 | state | `keepAliveResumeAt` | 1 |
| 104 | state | `keepAliveGestureBound` | 1 |
| 105 | state | `KEEPALIVE_SHARED_KEY` | 4 |
| 109 | state | `KEEPALIVE_SHARED_TTL` | 1 |
| 110 | state | `keepAliveReportAt` | 1 |
| 111 | state | `keepAliveHeartbeat` | 5 |
| 116 | fn | `keepAliveShared` | 15 |
| 131 | fn | `reportKeepAlive` | 28 |
| 159 | fn | `startKeepAliveHeartbeat` | 7 |
| 166 | fn | `stopKeepAliveHeartbeat` | 6 |
| 172 | fn | `keepAliveSupported` | 5 |
| 177 | fn | `keepAliveInfo` | 68 |
| 245 | fn | `keepAliveDebug` | 19 |
| 264 | fn | `afkHealthInfo` | 40 |
| 304 | fn | `notificationSupported` | 4 |
| 308 | fn | `notificationInfo` | 17 |
| 325 | fn | `notifyUser` | 24 |
| 349 | fn | `setNotifications` | 47 |
| 396 | fn | `bindKeepAliveGesture` | 19 |
| 415 | fn | `primeKeepAlive` | 72 |
| 487 | fn | `stopKeepAlive` | 20 |
| 507 | fn | `syncKeepAlive` | 12 |
| 519 | fn | `setKeepAlive` | 25 |
| 544 | fn | `setBackgroundFarm` | 18 |
| 562 | fn | `setAfkRequireKeepAlive` | 14 |
| 576 | fn | `setAfkFreezeGuard` | 14 |
| 590 | fn | `setNitroStrategy` | 12 |
| 602 | fn | `setConfigNote` | 6 |
| 608 | fn | `paintNitroPreview` | 35 |
| 643 | fn | `tuneFilterText` | 13 |
| 656 | fn | `filterTune` | 33 |
| 689 | fn | `paintHealthCenter` | 42 |
| 731 | fn | `paintConfig` | 107 |
| 838 | state | `ACC_DELTA_KEY` | 1 |
| 839 | state | `accDeltas` | 8 |
| 847 | state | `accSampleKey` | 1 |
| 848 | state | `accFieldWarned` | 3 |
| 851 | state | `serverWpmWarned` | 5 |
| 856 | fn | `paintAccuracySpark` | 33 |
| 889 | fn | `paintAccuracyDelta` | 30 |
| 919 | fn | `resetAccuracyTrend` | 10 |
| 929 | fn | `noteAccuracyDelta` | 19 |
| 948 | top | `window.__ntaDebug = window.__ntaDebug ||` | 1 |
| 949 | top | `window.__ntaDebug.seedRaceCounters = (pa` | 6 |
| 955 | top | `window.__ntaDebug.watchRaceResults = () ` | 1 |
| 956 | top | `window.__ntaDebug.versionNewer = (candid` | 1 |
| 957 | top | `window.__ntaDebug.readCount = (key) => {` | 5 |
| 962 | top | `window.__ntaDebug.accuracyTrend = () => ` | 5 |
| 967 | top | `window.__ntaDebug.noteAccuracyDelta = (g` | 2 |
| 969 | top | `window.__ntaDebug.resetAccuracy = () => ` | 1 |
| 970 | top | `window.__ntaDebug.diagnostic = () => dia` | 1 |
| 971 | top | `window.__ntaDebug.accuracyTitle = () =>` | 2 |
| 973 | top | `window.__ntaDebug.paceProfile = () => pa` | 1 |
| 974 | top | `window.__ntaDebug.paceSignature = () => ` | 1 |
| 975 | top | `window.__ntaDebug.setPaceProfile = (name` | 1 |
| 976 | top | `window.__ntaDebug.paceRangeFor = (wpm) =` | 1 |
| 977 | top | `window.__ntaDebug.autoPace = () => ({` | 7 |
| 984 | top | `window.__ntaDebug.setCustomWpm = (value)` | 1 |
| 985 | top | `window.__ntaDebug.setCustomAccuracy = (v` | 1 |
| 986 | top | `window.__ntaDebug.paceCenter = (stats) =` | 1 |
| 987 | top | `window.__ntaDebug.accountIdentity = () =` | 1 |
| 988 | top | `window.__ntaDebug.calibrationAccount = (` | 1 |
| 989 | top | `window.__ntaDebug.ensureCalibrationAccou` | 1 |
| 990 | top | `window.__ntaDebug.needsAccountRead = () ` | 1 |
| 991 | top | `window.__ntaDebug.stickerChance = () => ` | 1 |
| 992 | top | `window.__ntaDebug.progressWpm = (progres` | 1 |
| 993 | top | `window.__ntaDebug.lastProgress = () => s` | 1 |
| 994 | top | `window.__ntaDebug.liveCompareCsv = () =>` | 7 |
| 1001 | top | `window.__ntaDebug.nitroTarget = (content` | 2 |
| 1003 | top | `window.__ntaDebug.shouldUseNitro = (cont` | 1 |
| 1004 | top | `window.__ntaDebug.autoNitro = () => CONF` | 1 |
| 1005 | top | `window.__ntaDebug.setAutoNitro = (on) =>` | 1 |
| 1006 | top | `window.__ntaDebug.backgroundFarm = () =>` | 1 |
| 1007 | top | `window.__ntaDebug.setBackgroundFarm = (o` | 1 |
| 1008 | top | `window.__ntaDebug.keepAlive = () => keep` | 1 |
| 1009 | top | `window.__ntaDebug.setKeepAlive = (on) =>` | 1 |
| 1010 | top | `window.__ntaDebug.afkRequireKeepAlive = ` | 1 |
| 1011 | top | `window.__ntaDebug.setAfkRequireKeepAlive` | 1 |
| 1012 | top | `window.__ntaDebug.afkKeepAliveConfirmed ` | 1 |
| 1013 | top | `window.__ntaDebug.hiddenBlocked = () => ` | 1 |
| 1014 | top | `window.__ntaDebug.afkHiddenBlocked = (hi` | 1 |
| 1015 | top | `window.__ntaDebug.prefs = () => readPref` | 1 |
| 1016 | top | `window.__ntaDebug.afkFreezeGuard = () =>` | 1 |
| 1017 | top | `window.__ntaDebug.setAfkFreezeGuard = (o` | 1 |
| 1018 | top | `window.__ntaDebug.afkGuardDecision = () ` | 1 |
| 1019 | top | `window.__ntaDebug.afkFreeze = () => ({ .` | 1 |
| 1020 | top | `window.__ntaDebug.resetAfkFreeze = () =>` | 1 |
| 1021 | top | `window.__ntaDebug.notifications = () => ` | 1 |
| 1022 | top | `window.__ntaDebug.setNotifications = (on` | 1 |
| 1023 | top | `window.__ntaDebug.flight = (limit) => fl` | 1 |
| 1024 | top | `window.__ntaDebug.clearFlight = () => cl` | 1 |
| 1025 | top | `window.__ntaDebug.noteFlight = (kind, de` | 1 |
| 1026 | top | `window.__ntaDebug.flushFlight = () => { ` | 1 |
| 1027 | top | `window.__ntaDebug.noteDq = () => { noteD` | 1 |
| 1028 | top | `window.__ntaDebug.nitroStrategy = () => ` | 1 |
| 1029 | top | `window.__ntaDebug.setNitroStrategy = (va` | 1 |
| 1030 | top | `window.__ntaDebug.useNitro = (app) => us` | 1 |
| 1031 | top | `window.__ntaDebug.pressNitroKey = () => ` | 1 |
| 1032 | top | `window.__ntaDebug.nitroPreview = () => (` | 1 |
| 1033 | top | `window.__ntaDebug.updateState = () => up` | 1 |
| 1034 | top | `window.__ntaDebug.updateBusy = () => upd` | 1 |
| 1035 | top | `window.__ntaDebug.checkForUpdate = (forc` | 1 |
| 1036 | top | `window.__ntaDebug.live = () => liveSitua` | 1 |
| 1037 | top | `window.__ntaDebug.calibrationAuto = () =` | 1 |
| 1038 | top | `window.__ntaDebug.calibrationHealth = ()` | 7 |
| 1045 | top | `window.__ntaDebug.muteAccountReload = (m` | 4 |
| 1049 | top | `window.__ntaDebug.refreshCalibration = (` | 4 |
| 1053 | top | `window.__ntaDebug.stop = () => panic('de` | 1 |
| 1054 | top | `window.__ntaDebug.resume = () => resumeA` | 3 |
| 1057 | top | `window.__ntaDebug.panelRefresh = () => {` | 11 |
| 1068 | top | `window.__ntaDebug.refsAudit = () => {` | 25 |
| 1093 | top | `window.__ntaDebug.session = () => ({` | 27 |
| 1120 | top | `window.__ntaDebug.patchSession = (patch ` | 32 |
| 1152 | top | `window.__ntaDebug.recordRace = () => rec` | 1 |
| 1153 | top | `window.__ntaDebug.countRace = () => coun` | 1 |
| 1154 | top | `window.__ntaDebug.freshTanda = (reason) ` | 1 |
| 1155 | top | `window.__ntaDebug.tandaSummary = () => t` | 3 |
| 1158 | top | `window.__ntaDebug.serverWpm = (value, ke` | 1 |
| 1159 | top | `window.__ntaDebug.sessionTotals = () => ` | 13 |
| 1172 | top | `window.__ntaDebug.autocalibrate = (row =` | 4 |
| 1176 | top | `window.__ntaDebug.trimState = () => {` | 14 |
| 1190 | top | `window.__ntaDebug.advanceSessions = () =` | 4 |
| 1194 | top | `window.__ntaDebug.hudWpm = (force = true` | 1 |
| 1195 | top | `window.__ntaDebug.hudForGuard = (typed =` | 3 |
| 1198 | top | `window.__ntaDebug.connectionText = (text` | 1 |
| 1199 | top | `window.__ntaDebug.connectionError = () =` | 1 |
| 1200 | top | `window.__ntaDebug.connectionExit = () =>` | 6 |
| 1206 | top | `window.__ntaDebug.recoverDq = () => reco` | 1 |
| 1207 | top | `window.__ntaDebug.terminalBanText = (tex` | 1 |
| 1208 | top | `window.__ntaDebug.terminalBan = (text) =` | 1 |
| 1209 | top | `window.__ntaDebug.terminalActive = () =>` | 1 |
| 1210 | top | `window.__ntaDebug.resetTerminalBan = () ` | 4 |
| 1214 | top | `window.__ntaDebug.siteBlock = () => site` | 1 |
| 1215 | top | `window.__ntaDebug.clearSiteBlock = () =>` | 8 |
| 1223 | top | `window.__ntaDebug.perf = () => ({ ...per` | 1 |
| 1224 | top | `window.__ntaDebug.paintEveryMs = () => p` | 1 |
| 1225 | top | `window.__ntaDebug.typing = () => Boolean` | 4 |
| 1229 | top | `window.__ntaDebug.paceCapWaitFor = (star` | 14 |
| 1243 | top | `window.__ntaDebug.paceGovernorFor = (sta` | 3 |
| 1246 | top | `window.__ntaDebug.wpmCeiling = () => ({` | 6 |
| 1252 | top | `window.__ntaDebug.startup = () => ({` | 11 |
| 1263 | top | `window.__ntaDebug.hydrateAllViews = () =` | 4 |
| 1267 | top | `window.__ntaDebug.perfReset = () => {` | 4 |
| 1271 | top | `window.__ntaDebug.paint = (force = false` | 6 |
| 1277 | state | `liveSamples` | 7 |
| 1284 | top | `window.__ntaDebug.liveReadout = () => {` | 15 |
| 1299 | top | `window.__ntaDebug.liveRecentFrom = (samp` | 3 |
| 1302 | top | `window.__ntaDebug.seedLiveRecent = (samp` | 4 |
| 1306 | top | `window.__ntaDebug.calibrateClock = () =>` | 2 |
| 1308 | top | `);` | 1 |
| 1309 | top | `window.__ntaDebug.clock = () => ({` | 13 |
| 1322 | top | `window.__ntaDebug.seedGaps = (list = [])` | 8 |
| 1330 | top | `window.__ntaDebug.gaps = () => session.g` | 1 |
| 1331 | top | `window.__ntaDebug.noteRaceStart = (at) =` | 1 |
| 1332 | top | `window.__ntaDebug.daily = () => dailyCap` | 1 |
| 1333 | top | `window.__ntaDebug.setDailyCounts = (race` | 8 |
| 1341 | top | `window.__ntaDebug.clearDailyCounts = () ` | 5 |
| 1346 | top | `window.__ntaDebug.parseLiveCsv = (text) ` | 1 |
| 1347 | top | `window.__ntaDebug.parseLiveJson = (text)` | 1 |
| 1348 | top | `window.__ntaDebug.active = () => activeW` | 1 |
| 1349 | top | `window.__ntaDebug.activeAt = (start, end` | 6 |
| 1355 | top | `window.__ntaDebug.activeGateAt = (start,` | 6 |
| 1361 | top | `window.__ntaDebug.seedHistory = (rows = ` | 14 |
| 1375 | top | `window.__ntaDebug.season = () => seasonR` | 1 |
| 1376 | top | `window.__ntaDebug.parseSeason = (root) =` | 1 |
| 1377 | top | `window.__ntaDebug.paintSeason = () => {` | 7 |
| 1384 | top | `window.__ntaDebug.paintPanel = () => {` | 3 |
| 1387 | top | `window.__ntaDebug.captureSeason = () => ` | 1 |
| 1388 | top | `window.__ntaDebug.seasonRefresh = (force` | 1 |
| 1389 | top | `window.__ntaDebug.seasonUserXp = () => s` | 1 |
| 1390 | top | `window.__ntaDebug.seasonPace = () => sea` | 1 |
| 1391 | top | `window.__ntaDebug.seasonAlerts = () => s` | 1 |
| 1392 | top | `window.__ntaDebug.seasonXpPerRace = () =` | 2 |
| 1394 | top | `window.__ntaDebug.tabLease = () => tabLe` | 1 |
| 1395 | top | `window.__ntaDebug.typingLock = () => ({` | 4 |
| 1399 | top | `window.__ntaDebug.dropTabLease = () => r` | 3 |
| 1402 | top | `window.__ntaDebug.electInstance = (key, ` | 3 |
| 1405 | top | `window.__ntaDebug.releaseLease = () => r` | 1 |
| 1406 | top | `window.__ntaDebug.role = () => {` | 22 |
| 1428 | state | `chCache` | 1 |
| 1429 | state | `chAllCache` | 1 |
| 1430 | state | `chReadAt` | 1 |
| 1431 | state | `chResetAt` | 1 |
| 1432 | state | `chKnown` | 1 |
| 1433 | state | `chDone` | 1 |
| 1434 | state | `chStamp` | 4 |
| 1438 | fn | `noteChallengeState` | 31 |
| 1469 | fn | `challengeEntries` | 24 |
| 1493 | fn | `readChallengeProgress` | 60 |
| 1553 | fn | `challengeProgressAll` | 5 |
| 1558 | top | `window.__ntaDebug = window.__ntaDebug ||` | 1 |
| 1559 | top | `window.__ntaDebug.challengeProgress = ()` | 1 |
| 1560 | top | `window.__ntaDebug.challengeProgressAll =` | 1 |
| 1561 | top | `window.__ntaDebug.challengeReset = () =>` | 1 |
| 1562 | top | `window.__ntaDebug.refreshChallenges = ()` | 6 |
| 1568 | fn | `paintChallengeList` | 41 |
| 1609 | fn | `paintLogLists` | 133 |
| 1742 | fn | `flashValue` | 32 |
| 1774 | fn | `exportConfig` | 26 |
| 1800 | fn | `importConfig` | 126 |
| 1926 | fn | `diagnosticReport` | 232 |
| 2158 | fn | `exportDiagnostics` | 27 |
| 2185 | fn | `placeHost` | 11 |
| 2196 | fn | `savePosition` | 12 |
| 2208 | fn | `restorePosition` | 14 |
| 2222 | fn | `makeDraggable` | 38 |
| 2260 | fn | `createPanel` | 1210 |
| 3470 | fn | `applyCollapsed` | 15 |
| 3485 | state | `footMode` | 1 |
| 3486 | state | `FOOT_MODES` | 2 |
| 3488 | fn | `applyFootMode` | 7 |
| 3495 | fn | `cycleFootMode` | 12 |
| 3507 | state | `pauseGuard` | 2 |
| 3509 | fn | `clearPauseGuard` | 10 |
| 3519 | fn | `setPaused` | 43 |
| 3562 | fn | `publishState` | 30 |
| 3592 | fn | `seasonClean` | 4 |
| 3596 | fn | `seasonFiberProps` | 21 |
| 3617 | fn | `seasonDateRange` | 14 |
| 3631 | fn | `parseSeasonPage` | 63 |
| 3694 | state | `SEASON_LEVELS_DEFAULT` | 7 |
| 3701 | state | `seasonUserAt` | 5 |
| 3706 | fn | `seasonBoot` | 20 |
| 3726 | fn | `seasonLevelXp` | 9 |
| 3735 | fn | `seasonTierForXp` | 15 |
| 3750 | fn | `seasonEndText` | 18 |
| 3768 | state | `userCacheRaw` | 1 |
| 3769 | state | `userCacheXp` | 2 |
| 3771 | fn | `parseNtUserXp` | 29 |
| 3800 | fn | `seasonUserXp` | 12 |
| 3812 | state | `seasonCacheRaw` | 1 |
| 3813 | state | `seasonCacheSnap` | 2 |
| 3815 | fn | `seasonRead` | 47 |
| 3862 | fn | `seasonRefreshFromUser` | 59 |
| 3921 | fn | `seasonXpText` | 5 |
| 3926 | fn | `seasonXpShort` | 10 |
| 3936 | fn | `seasonDailyXp` | 26 |
| 3962 | fn | `seasonPace` | 37 |
| 3999 | fn | `seasonXpPerRace` | 14 |
| 4013 | fn | `seasonAlertText` | 23 |
| 4036 | state | `seasonPaintAt` | 2 |
| 4038 | fn | `paintSeason` | 116 |
| 4154 | fn | `captureSeasonPage` | 28 |
| 4182 | fn | `paintPanelActions` | 29 |
| 4211 | fn | `panelPaintEveryMs` | 10 |
| 4221 | state | `LIVE_PACE_WINDOW_MS` | 1 |
| 4222 | state | `LIVE_PACE_MIN_MS` | 1 |
| 4223 | state | `LIVE_PACE_MIN_CHARS` | 1 |
| 4224 | state | `liveRecentSamples` | 1 |
| 4225 | state | `liveRecentKey` | 5 |
| 4230 | fn | `liveRecentFrom` | 17 |
| 4247 | fn | `liveRecentNow` | 23 |
| 4270 | fn | `paintLiveNumbers` | 52 |
| 4322 | fn | `paintRaceProgress` | 17 |
| 4339 | fn | `paintLiveClock` | 14 |
| 4353 | fn | `updateLiveReadout` | 16 |
| 4369 | state | `panelRefreshTimer` | 1 |
| 4370 | fn | `schedulePanelRefresh` | 8 |
| 4378 | fn | `updatePanel` | 665 |
| 5043 | state | `XP_BASE_BY_PLACE` | 2 |
| 5045 | fn | `xpBaseForPlace` | 4 |
| 5049 | fn | `xpAccuracyTier` | 10 |
| 5059 | fn | `xpNextAccuracyTier` | 15 |
| 5074 | fn | `xpBreakdown` | 24 |
| 5098 | fn | `renderHistory` | 90 |
