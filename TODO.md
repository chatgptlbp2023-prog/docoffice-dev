# TODO

## P0 - Pilot launch

- [ ] Backend deploy kulon hosztra
- [ ] Frontend deploy `web.app` ala
- [ ] Kulon pilot PostgreSQL adatbazis hasznalata
- [ ] Production env-ek vegleges beallitasa
- [ ] `CORS_ALLOWED_ORIGINS` szukitese a pilot domainekre
- [ ] HTTPS ellenorzese frontend es backend oldalon
- [ ] Health check ellenorzese publikus URL-en
- [ ] Smoke test a fo flow-kon: login, csapat betoltes, esemenylista, invite, register, captain transfer

## P1 - Funkciok

- [ ] No-show uzleti logika veglegesitese
- [ ] Google login elesitese valos `GOOGLE_CLIENT_ID`-val
- [ ] Kassza / befizetesi statusz modul elso verzioja
- [ ] Push ertesitesek technikai megvalositasa

## P1 - Biztonsag es uzemeltetes

- [ ] Backup strategia beallitasa a pilot adatbazisra
- [ ] Alap monitoring / hibalog beallitasa
- [ ] Platform owner pilot user(ek) ellenorzese
- [ ] Secret-ek es `.env` kezeles vegso ellenorzese

## P2 - UX es frontend

- [ ] Frontend maradek mojibake / hibas magyar szovegek takaritasa a `public` mappaban
- [ ] Production API base kenyelmesebb kezelese, hogy ne kezzel kelljen beirni
- [ ] Google login frontend flow vegigtesztelese eles domainnel

## P2 - Minoseg

- [ ] Jogosultsagi agak tovabbi vegigellenorzese uj UI muveleteken
- [ ] Deploy utani regresszios tesztlista rogzitese
- [ ] Kesobbi migracio / seed folyamat egysegesitese, ha meg nincs rendezve

## P3 - Kesobbi modul: csapatszintu chat

- [ ] Kulon, csapatszintu chat modul MVP specifikaciojanak elkeszitese
- [ ] Dontes: kulon frontend modul / aldomain, de kozos auth es kozos jogrendszer
- [ ] MVP chat adatmodell tervezese: csapatonkenti szoba, uzenetek, reply, seen / last read
- [ ] MVP chat API tervezese: listazas, kuldes, olvasottnak jeloles
- [ ] Dontes a realtime strategiarol: elso verzioban polling, kesobb websocket vagy SSE
- [ ] Kesobbi push integracio megtervezese csapatuzenetekhez

Megjegyzes:
Ez nem esemeny-chat lenne, hanem a teljes csapat sajat, allando beszelgeto felulete. Nem csak a jelentkezett tagoknak, hanem az aktiv csapattagoknak szolna. A jelenlegi rendszerhez jol illeszkedik, mert a kozos JWT auth, a `team_members` alapu tagsag es a szerepkormodell mar adott. Elso korben csak szoveges chat lenne: ki uzent, mit uzent, mikor, reply egy konkret uzenetre, valamint seen / latta-e a tobbiek. Kep, hang, reakcio egyelore nem kell.

Fejlesztesi becsles:
- Pilot-minimum: kb. 1-1.5 het
- Stabil MVP pollinggal: kb. 2-3 het
- Erosebb, realtime-osabb verzio: kb. 3-5 het

Termekszerep:
Magas erteku, mert a messenger-kivaltas egyik kulcshianyat zarja le. Az esemenykezeles a strukturalt szervezest adja, a csapatszintu chat pedig a napi csapatkommunikaciot tartja bent az alkalmazasban. Emiatt jo esellyel noveli a visszaterest es csokkenti a Messengerre valo visszaszokast.
