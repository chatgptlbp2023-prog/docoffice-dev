# No-Show uzleti logika - javasolt vegleges szabalyok

## Cel

A rendszer kulonbseget tegyen:

- idoben lemondott jelentkezes
- kesoi lemondas
- tenyleges no-show

Ugy, hogy ez:

- admin oldalrol kezelheto legyen
- a user sajat allapotaban visszakovetheto legyen
- kesobb rang- es kasszalogikara is rahuzhato legyen
- ne torje el a jelenlegi jelentkezes / varolista mukodest

## Fontos megtartando szabaly

Ha valaki korabban jelentkezett, majd lemondta az esemenyt, kesobb ujra vissza tudjon jelentkezni.

Az elvart ujrajelentkezesi szabaly:

- ha van hely, akkor `going`
- ha nincs hely, akkor `waiting_list`
- a besorolas mindig az aktualis allapot alapjan tortenjen
- az idorend a varolistanal a tenyleges ujrajelentkezes ideje szerint szamitson

Megjegyzes:
A jelenlegi backend szandeka mar ezt koveti, es erre van teszt is az [tests/event-registration.e2e.test.js](D:/Saját/Foci/foci-backend/tests/event-registration.e2e.test.js)-ben. A no-show modul bevezetese mellett ezt valtozatlanul meg kell tartani.

## Javasolt fogalmak

### 1. Cancelled

A user lemondta a jelentkezeset az esemeny kezdete elott.

Ez tovabbra is normal lemondas, nem no-show.

### 2. Late cancel

A user lemondta a jelentkezeset, de egy mar meghatarozott kesoi idoszakban.

Peldak a kesobbi donteshez:

- esemeny elott 12 oran belul
- esemeny elott 6 oran belul
- esemeny napjan

Elso verziohoz ezt meg lehet csak jelolni, kovetkezmeny nelkul.

### 3. No-show

A user az esemenyen `going` statuszban szerepelt, az esemeny `finished` lett, de a szervezok szerint nem jelent meg.

Ez mar kulon kategoria, nem ugyanaz, mint a lemondas.

## Mikor lehet no-show-t rogizteni

- csak `finished` esemenynel
- csak olyan userre, aki az esemenyhez tartozo utolso aktiv allapot szerint `going` volt
- `waiting_list` vagy korabban `cancelled` statuszu user ne lehessen no-show

## Ki allithatja

Elso javaslat:

- `team_admin`
- `team_manager`
- `platform_owner` technikai felulbiralati joggal

Sima `member` ne allithassa.

## Milyen adatot erdemes rogizteni

Legjobb kulon tablaban, nem csak egy flaggel:

- `event_id`
- `user_id`
- `team_id`
- `status` = `present` | `no_show` | `late_cancel_excused` | `late_cancel_unexcused`
- `marked_by_user_id`
- `marked_at`
- `note`
- `updated_at`

Ez kesobb auditot es korrekciot is lehetove tesz.

## Admin workflow

Javasolt elso workflow:

1. Az admin `finished` esemenynel megnyitja a resztvevok listajat.
2. A `going` statuszu jatekosok mellett megjelenik:
   - `Megjelent`
   - `No-show`
3. Opcionisan kesobb jon:
   - `Kesoi lemondas - elfogadott`
   - `Kesoi lemondas - nem elfogadott`
4. A jeloles utolag modositthato legyen.

## User oldali lathatosag

Elso verzio:

- a user sajat profiljaban vagy sajat statisztikajaban lathassa az osszesitett no-show szamot
- az egyes esemenyeknel sajat magara vonatkozoan lathassa, ha no-show-ra lett jelolve

Masok no-show statisztikajat normal tag ne lassa.

## Kovetkezmenyek - javasolt fazisok

### Fazis 1

Csak rogzites es lathatosag:

- admin oldali jeloles
- sajat user oldali lathatosag
- admin statisztika

### Fazis 2

Rang / prioritas hatas:

- visszatero no-show rontsa a megbizhatosagi megiteleset
- ez kesobb hathat a rank modulra vagy jelentkezesi savra

### Fazis 3

Penzugyi hatas:

- no-show eseten az esemenydij akkor is fennmaradhat
- ez a kesobbi kassza modullal kotheto ossze

## Kapcsolat a jelenlegi rank logikaval

A mostani rendszerben a `cancelled` es `waiting_list` mar most is tud "missed" jellegu kimenetet adni a rangszamitasban.

Ezert a no-show bevezetesenel fontos:

- a normal, idoben lemondott `cancelled` ne kapjon ugyanakkora negativ sulyt, mint a tenyleges no-show
- a no-show kulon adatpont legyen
- a rank modul kesobb erre epitsen, ne a sima `cancelled` statuszra

## Javasolt minimalis dontes most

1. No-show csak `finished` esemenynel rogzitheto.
2. Csak `going` statuszu jatekos jelolheto no-show-nak.
3. `team_admin` es `team_manager` allithatja.
4. Utolag korrigalhato maradjon.
5. Elso korben csak statisztika es lathatosag legyen, automatikus buntetes nelkul.
6. A korabban lemondott user ujra jelentkezhessen:
   - hely eseten `going`
   - telitett eseten `waiting_list`

## Fejlesztesi hatas

Ez a modul varhatoan igenyel:

- uj adatmodell / migracio
- admin UI a `finished` esemenyekhez
- user statisztika kiegeszites
- tesztek:
  - no-show csak `finished` esemenynel
  - csak `going` user jelolheto
  - manager is allithatja
  - kesobbi korrekcio mukodik
  - ujrajelentkezes nem torik el
