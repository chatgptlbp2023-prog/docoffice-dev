# Email ertesitesek es akciogombok

Ez a jegyzet a jelenlegi email-flowk gyors attekintesehez keszult.

## Esemeny emailok

| Mikor megy | Cimzett | Targy | Tartalom | Gomb / reakcio |
|---|---|---|---|---|
| Uj esemeny letrehozasakor vagy draftbol publikalaskor | Aktiv csapattagok, a letrehozot kiveve | `Uj esemeny: [esemeny]` | Csapatnev, esemenynev, idopont, helyszin, palya, fizetesi info, belepesi link, esemenylink | `Jelentkezem`: regisztral az esemenyre. Ha van hely: `going`, ha tele: `waiting_list`, ha rangsav zarva: `waiting_list_rank`. `Kihagyom`: csak naplozza a kihagyast. `Belepes a feluletre`: app fooldal. `Esemeny megnyitasa`: appban az adott esemeny. |
| Uj tag kesobb csatlakozik egy csapathoz | Az uj tag | `Uj esemeny: [esemeny]` | Ugyanaz, mint az uj esemeny email, a mar letezo kozelgo esemenyekrol | Ugyanazok a gombok: `Jelentkezem`, `Kihagyom`, `Belepes a feluletre`, `Esemeny megnyitasa`. |
| Uj jelentkezo erkezik, ha be van kapcsolva | Csapattagok, a jelentkezot kiveve | `Uj jelentkezo: [esemeny]` | Ki jelentkezett, statusz, idopont, helyszin, mar jelentkezettek nevsora | Nincs gomb. |
| Mar csak 2 hely maradt | Aktiv esemenyre jelentkezettek | `Mar csak 2 hely maradt: [esemeny]` | Esemennyel kapcsolatos kapacitasfigyelmeztetes, idopont, helyszin | Nincs gomb. |
| Betelt az esemeny | Aktiv csapattagok, az utolso jelentkezot kiveve | `Betelt az esemeny: [esemeny]` | Betelt az esemeny, idopont, helyszin, plusz osztonzo varolistas szoveg | `Varolistara jelentkezem`: email action regisztracio. Ha tovabbra is tele van: `waiting_list`; ha kozben felszabadult hely: akar `going`; ha mar jelentkezett: "mar rogzitve van". |
| Varolistarol bekerult jatekos | A bekerult jatekos | `Bekerultel a varolistabol: [esemeny]` | Bekerultel varolistarol, idopont, helyszin | Nincs gomb. |
| Idopont vagy helyszin valtozott | Aktiv esemenyre jelentkezettek | `Valtozott az esemeny: [esemeny]` | Korabbi idopont/helyszin es uj idopont/helyszin | Nincs gomb. |
| Esemeny torolve / elmarad | Esemenyregisztracioval erintettek | `Elmarad az esemeny: [esemeny]` | Esemeny elmarad vagy torolve lett, eredeti idopont, helyszin | Nincs gomb. |
| Csapatleosztas publikalva | Aktiv esemenyre jelentkezettek | `Csapatleosztas kesz: [esemeny]` | Manualis esetben: csapatleosztas elerheto. Automatikus esetben: a rendszer automatikusan kihirdette. Esemenynev, idopont, helyszin | Nincs gomb. |
| Idojarasi figyelmeztetes | Aktiv esemenyre jelentkezettek | `Idojarasi figyelmeztetes: [esemeny]` | Csapat, esemeny, idopont, helyszin, idojarasi kockazat, homerseklet, csapadek, szel | Nincs gomb. |

## Meghivo email

| Mikor megy | Cimzett | Targy | Tartalom | Gomb / reakcio |
|---|---|---|---|---|
| Csapatkapitany meghivot kuld | Meghivott email cim | `Meghivo a(z) [csapat] csapatba` | Ki hivta meg, melyik csapatba, milyen szerepre: `tag` vagy `csapatkapitany-helyettes`, szemelyes uzenet, meghivokod, lejarat | `Meghivo megnyitasa`: `/?invite=token` linkre visz, regisztracios nezetet nyit, meghivott email elore kitoltve. Nem automatikus csatlakozas, a usernek regisztralnia vagy belepnie kell. |

## Belso rendszer email

| Mikor megy | Cimzett | Targy | Tartalom | Gomb / reakcio |
|---|---|---|---|---|
| Uj user regisztracio utan | `REGISTRATION_NOTIFY_EMAIL`, vagy default belso cim | `[idopont] uj regisztracio tortent a Foci Szervezo` | Regisztracios utvonalankent napi/osszes darabszam, aznapi email cimek | Nincs gomb. |

## Akciogombok pontos reakcioi

| Gomb | Mit csinal |
|---|---|
| `Jelentkezem` | Backend email-token alapjan meghivja a normal esemenyjelentkezest. Ugyanaz, mintha a feluleten kattintana. Szabalyzatot, tagsagot, esemenystatuszt es letszamot ellenoriz. |
| `Varolistara jelentkezem` | Ugyanaz a mechanika, mint a `Jelentkezem`; telt esemenynel varolistara tesz. |
| `Kihagyom` | Nem hoz letre jelentkezest. Csak naplozza a kihagyasi jelzest, rangmodul eseten rangmodulhoz hasznalhato. |
| `Meghivo megnyitasa` | Meghivos regisztracios oldalra visz, email elore kitoltve. |
| `Belepes a feluletre` | App fooldalat nyitja. |
| `Esemeny megnyitasa` | Appot nyitja `teamId` es `eventId` parameterrel, tehat az adott esemenyre fokuszal. |

## Kapcsolodo forrasok

- `src/services/eventNotificationService.js`
- `src/services/eventEmailActionService.js`
- `src/services/inviteEmailService.js`
- `src/services/weatherService.js`
- `src/services/registrationNotificationService.js`
