# TODO

Frissítve: 2026-05-21

Jelölések:
- `[x]` kész vagy a jelenlegi kódban igazoltan megoldva
- `[ ]` nyitott
- `Részben kész` működő alap elkészült, de a teljes termékcél még nincs lezárva
- `Blokkolt` külső hozzáférés, production környezet vagy üzleti döntés kell hozzá

## P0 - Mostani fókusz

- [x] A TODO lista frissítése az aktuális állapot szerint.
- [x] Pilot smoke/regressziós tesztparancs és checklist rögzítése.
- [x] A még módosított fájlok végső ellenőrzése és tesztelése.

## P0 - Új termékirány és belépési modell

- [x] Új termékirány rögzítve a `PRODUCT_DIRECTION.md` fájlban.
- [x] Regisztrációs belépési utak első specifikációja elkészült a `REGISTRATION_ENTRY_SPEC.md` fájlban.
- [x] A külön tornaszervezői munkatér első információs architektúrája elkészült a `TOURNAMENT_WORKSPACE_SPEC.md` fájlban.
- [x] Elkészült a jelenlegi auth, onboarding és admin UI visszabontási terve a `PLATFORM_RESTRUCTURE_PLAN.md` fájlban.
- [x] A `Saját esemény szervezés` almodul első újraszűkítése elkészült az `OWN_EVENT_MODULE_SPEC.md` fájlban.
- [x] A jelenlegi adminfelület felülvizsgálata elkészült az `ADMIN_SURFACE_REVIEW.md` fájlban.
- [x] A moduláris kapcsolótábla-terv elkészült a `MODULE_SWITCHBOARD_SPEC.md` fájlban.
- [x] Az onboarding és marketingnyelv első specifikációja elkészült az `ONBOARDING_MARKETING_SPEC.md` fájlban.
- [x] A `registration_path` bevezetésének technikai terve elkészült a `REGISTRATION_PATH_IMPLEMENTATION_PLAN.md` fájlban.
- [x] `registration_path` és `organizer_activity_type` backend oldali bevezetése, backfill és validáció.
- [x] Local register és Google auth flow `registrationPath` támogatása.
- [x] Frontend regisztrációs payload küldi a választott `registrationPath` értéket.
- [x] Meghívóval érkező regisztráció `invited_participant` ágra kerül.
- [x] Tornaszervezői shell / munkatér váz megjelent és a `tournament_organizer` nem a csapatsport adminba esik vissza.
- [x] A regisztrációs oldalon ideiglenesen csak az aktív utak látszanak: `Csapatsportot szervezek` és `Meghívóval érkeztem`.
- [ ] Részben kész: `tournament_organizer` teljes tartalom és üzleti flow aktiválása.
- [ ] Részben kész: `activity_organizer` önálló munkatér és tartalom aktiválása.
- [ ] Részben kész: régi `registerAsOrganizer` fokozatos kivezetése.

## P0 - Pilot launch

- [ ] Blokkolt: backend deploy külön hosztra.
- [ ] Blokkolt: frontend deploy `web.app` alá.
- [ ] Blokkolt: külön pilot PostgreSQL adatbázis használata.
- [ ] Blokkolt: production env-ek végleges beállítása.
- [ ] Blokkolt: `CORS_ALLOWED_ORIGINS` szűkítése a pilot domainekre.
- [ ] Blokkolt: HTTPS ellenőrzése frontend és backend oldalon.
- [ ] Blokkolt: health check ellenőrzése publikus URL-en.
- [x] Lokális smoke test parancs a fő flow-kra: `npm run test:pilot`.
- [ ] Blokkolt: ugyanez a smoke kör production URL-eken, deploy után.

## P1 - Funkciók

- [x] `Nem jelent meg` jelölés újra elérhető a pénzügyi / jelenléti flow-ban.
- [x] Kassza / befizetési státusz modul első működő verziója elkészült.
- [x] Befizetés mező alapértelmezetten az elvárt összeget tölti, de admin által átírható.
- [x] Eltérő befizetés könyvelése működik: tartozás vagy túlfizetés számolása nem hardcode értékből történik.
- [x] Jelenlét és befizetés rögzítése szétválasztva: a `Megjelent` csak státuszt rögzít, a tényleges összeg külön menthető.
- [x] Ingyenes eseménynél a jelenléti flow nem kér felesleges befizetést.
- [x] Egy játékos / egy sor jellegű admin jelenléti-pénzügyi nézet kialakítva.
- [x] Esemény létrehozási email tartalmazza a belépés, esemény megnyitása, jelentkezem és kihagyom gombokat.
- [x] Emailes `Jelentkezem` és `Kihagyom` action backend oldalon rögzít, oldalmegnyitási kényszer nélkül.
- [x] Új jelentkező értesítésben szerepelnek az adott eseményre már jelentkezett játékosok nevei.
- [x] Meghívó elfogadása után az új tag catch-up emailt kap a már meglévő közelgő eseményekről.
- [x] AccuWeather alapú időjárás szolgáltatás beépítve.
- [x] Google Maps / Places címsegítés első verziója beépítve.
- [ ] Google login élesítése valós `GOOGLE_CLIENT_ID`-val.
- [ ] Push értesítések technikai megvalósítása.
- [ ] Automatikus csapatleosztás 1 órával kezdés előtt production ütemezésben ellenőrizendő.
- [ ] Fegyelmi modul specifikációja és implementációja külön be/ki kapcsolható csapatmodulként: sárga lap, piros lap, okok, hatások, user értesítések, csapatkapitányi jóváhagyási flow.

## P1 - User dashboard és játékosélmény

- [x] User dashboard layout stabilizálva: áttekintő, 7 napos naptár, fókusz esemény sorrend.
- [x] `Fókuszcsapat teljes eseménylistája` user oldali blokk elrejtve / kivéve a fő élményből.
- [x] Már megvalósult események maradványai ki lettek szűrve a játékos oldali közelgő/fókusz logikából.
- [x] 7 napos naptár nézet beépítve a játékos oldalra.
- [x] Csapatváltáskor a fókuszcsapat és kijelölés újrarenderelése javítva.
- [x] Rangmodulra vonatkozó user blokk nem jelenik meg, ha a rangmodul nincs bekapcsolva.
- [ ] Játékos oldali `Kisokos` / súgó blokk vagy menü: jelentkezés menete, útvonal, naptárbejegyzés, automata emailek, rangmodul, fegyelmi modul, pénzügy és gyakori kérdések.
- [ ] Csapat saját szabályzatának játékos oldali megjelenítése és elfogadtatása csapatonként.
- [ ] Részben kész: játékos dashboard további vizuális egyszerűsítése többcsapatos játékosoknak.
- [ ] Részben kész: 7 napos naptár mobil / keskeny nézetének végleges finomítása.

## P1 - Csapatkapitány támogatás és szabályrendszer

- [ ] Csapatkapitány oldali bővített `Kisokos`: modulok magyarázata, elvárt működés, tipikus admin lépések és tutorial flow-k.
- [ ] Csapat létrehozásakor / beállításakor testreszabható szabályrendszer: játék-, fizetési-, rang- és fegyelmi szabályok.
- [ ] Kapcsolattartási pont: hibajelentés, fejlesztési javaslat és általános visszajelzés beküldése.

## P1 - Biztonság és üzemeltetés

- [ ] Backup stratégia beállítása a pilot adatbázisra.
- [ ] Alap monitoring / hibalog beállítása.
- [ ] Platform owner pilot user(ek) ellenőrzése.
- [ ] Secret-ek és `.env` kezelés végső ellenőrzése.

## P2 - UX és frontend

- [ ] Frontend maradék hibás magyar szövegek takarítása a `public` mappában, ha böngészőben is látható gond marad.
- [x] Regisztrációs 4 csempés választó mobil/fold problémája ideiglenesen semlegesítve: csak két aktív csempe látszik.
- [ ] Részben kész: a teljes 4 útvonalas regisztrációs élmény újratervezése akkor, amikor a `tournament_organizer` és `activity_organizer` mögött aktív tartalom lesz.
- [ ] Production API base kényelmesebb kezelése, hogy ne kézzel kelljen beírni.
- [ ] Google login frontend flow végigtesztelése éles domainnel.

## P2 - Minőség

- [ ] Jogosultsági ágak további végigellenőrzése új UI műveleteken.
- [x] Lokális pilot regressziós tesztlista rögzítése a `TESTING_MODULES.md` és `PILOT_DEPLOY.md` fájlban.
- [ ] Deploy utáni production regressziós eredmények rögzítése.
- [ ] Későbbi migráció / seed folyamat egységesítése, ha még nincs rendezve.
- [ ] Styles mobil/fold csempe-scroll probléma újragondolása, mielőtt újabb CSS toldozás készülne.

## P3 - Későbbi modul: csapatszintű chat

- [ ] Külön, csapatszintű chat modul MVP specifikációjának elkészítése.
- [ ] Döntés: külön frontend modul / aldomain, de közös auth és közös jogrendszer.
- [ ] MVP chat adatmodell tervezése: csapatonkénti szoba, üzenetek, reply, seen / last read.
- [ ] MVP chat API tervezése: listázás, küldés, olvasottnak jelölés.
- [ ] Döntés a realtime stratégiáról: első verzióban polling, később websocket vagy SSE.
- [ ] Későbbi push integráció megtervezése csapatüzenetekhez.

Megjegyzés:
Ez nem esemény-chat lenne, hanem a teljes csapat saját, állandó beszélgető felülete. Nem csak a jelentkezett tagoknak, hanem az aktív csapattagoknak szólna. A jelenlegi rendszerhez jól illeszkedik, mert a közös JWT auth, a `team_members` alapú tagság és a szerepkörmodell már adott. Első körben csak szöveges chat lenne: ki üzent, mit üzent, mikor, reply egy konkrét üzenetre, valamint seen / látta-e a többiek. Kép, hang, reakció egyelőre nem kell.

Fejlesztési becslés:
- Pilot-minimum: kb. 1-1.5 hét
- Stabil MVP pollinggal: kb. 2-3 hét
- Erősebb, realtime-osabb verzió: kb. 3-5 hét

Termékszerep:
Magas értékű, mert a Messenger-kiváltás egyik kulcshiányát zárja le. Az eseménykezelés a strukturált szervezést adja, a csapatszintű chat pedig a napi csapatkommunikációt tartja bent az alkalmazásban. Emiatt jó eséllyel növeli a visszatérést és csökkenti a Messengerre való visszaszokást.
