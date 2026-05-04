# Regisztrációs Belépési Utak Specifikáció

## Cél

A regisztráció és az első onboarding ne egyetlen általános belépési út legyen, hanem a szervező típusa szerint már az elején szétváljon.

Ez a döntés határozza meg:

- milyen kezdőfelületet kap a felhasználó
- melyik modulok legyenek hangsúlyosak
- milyen onboarding vezesse végig
- milyen nyelvezetet és példákat használjon a rendszer

Ez a dokumentum a `PRODUCT_DIRECTION.md` alapján rögzíti a következő nagy átalakítás első konkrét lépését.

## Jelenlegi állapot

A jelenlegi rendszerben a regisztráció lényegében két útra bomlik:

1. `registerAsOrganizer = true`
2. `inviteToken` alapú csatlakozás

Ez a mostani logika technikailag működő alap, de termékszinten túl szűk:

- nem különbözteti meg a tornaszervezőt a csapatsport-szervezőtől
- nem különbözteti meg az egyéb szervezőt a csapatsportos szervezőtől
- túl korán egyetlen általános adminfelületre tereli a szervezőket
- nem a fő üzleti fókuszt teszi hangsúlyossá

## Célállapot

Regisztrációkor vagy az első belépés utáni onboardingban a user kiválasztja az induló szervezői útját.

### 1. Tornaszervező

Ez a fő belépési út.

Jellemzői:

- több csapat nevezésével dolgozik
- csapatkapitányokat hív be a rendszerbe
- mérkőzés- és pályalogikát igényel
- eredményeket, statisztikát és pénzügyet kezel

Kezdő fókusza:

- torna létrehozása
- torna paraméterei
- csapatkapitányok meghívása
- nevezések követése

### 2. Csapatsport-szervező

Ide tartozik például:

- baráti foci
- kosárlabda
- rendszeres csapatos edzés vagy meccs

Jellemzői:

- saját csapatot kezel
- eseményeket ír ki
- jelentkezést és várólistát kezel
- opcionálisan csapatsorsolást használ

Kezdő fókusza:

- csapat létrehozása
- tagok meghívása
- első esemény létrehozása

### 3. Egyéb szervező

Ide tartozik például:

- jóga
- pilates
- terhes torna
- futóedzés
- kerékpártúra
- kirándulás

Jellemzői:

- nem feltétlenül csapatstruktúrában gondolkodik
- eseményeket, helyszínt, létszámot és pénzt kezel
- sporttípus vagy aktivitástípus szerint kap kiegészítő mezőket

Kezdő fókusza:

- első esemény vagy alkalom létrehozása
- helyszín és kapacitás beállítása
- résztvevők meghívása

## Meghívásos belépés helye az új modellben

A meghívásos onboarding továbbra is megmarad, de a szerepe pontosabban rendeződik.

### Tornaszervezői meghívási lánc

1. a tornaszervező meghívja a csapatkapitányt
2. a csapatkapitány regisztrál
3. a rendszer a csapatkapitányt már a saját csapatkezelő világába teszi
4. onnan behívja a saját csapattagjait

### Csapatmeghívás

Ha valaki meghívólinkkel érkezik:

- alapértelmezetten nem kell szervezői útvonalat választania
- először a meghívott szerepe legyen a fókusz
- később külön dönthet arról, hogy szervezői feladatokat is szeretne-e

Ez azért fontos, mert egy meghívott játékos vagy résztvevő nem feltétlenül akar azonnal szervezővé válni.

## Adatmodell-javaslat

### Javasolt új user mező

`registration_path`

Lehetséges értékek:

- `tournament_organizer`
- `team_sport_organizer`
- `activity_organizer`
- `invited_participant`

Megjegyzés:

Az `invited_participant` elsődleges induló státusz lehet azoknak, akik meghívóval érkeznek, és később külön léphetnek tovább szervezői útra.

### Opcionális kiegészítő mező

`organizer_activity_type`

Lehetséges példák:

- `football`
- `basketball`
- `yoga`
- `pilates`
- `running`
- `cycling`
- `hiking`
- `other`

Ez nem minden esetben kötelező az első körben, de hosszabb távon segíti:

- a nyelvezet testreszabását
- a sporttípus-specifikus mezők megjelenítését
- az onboarding egyszerűsítését

## UX-javaslat a regisztrációra

### Egyszerű első lépés

A regisztrációs képernyő ne legyen túlterhelve.

Első lépésként ez jelenjen meg:

- `Tornát szervezek`
- `Csapatsportot szervezek`
- `Egyéb eseményt szervezek`
- `Meghívóval érkeztem`

Ezután jöjjön a tényleges regisztrációs űrlap.

### Miért jobb ez, mint a jelenlegi checkbox

A jelenlegi `registerAsOrganizer` checkbox túl szegényes.

Nem mondja meg:

- milyen szervező vagy
- milyen felületet kapsz
- mire számíthatsz

Az új modell viszont már a belépéskor pozicionál.

## Jogosultsági értelmezés

Fontos különválasztani:

- a `platform role`
- a `team role`
- a `registration path`

Ezek nem ugyanazok.

### Platform role

Például:

- `platform_owner`
- alap user

### Team role

Például:

- `team_admin`
- `team_manager`
- `member`

### Registration path

Például:

- `tournament_organizer`
- `team_sport_organizer`
- `activity_organizer`
- `invited_participant`

Ez a harmadik dimenzió a felületi és onboarding-logikát határozza meg, nem közvetlenül az engedélyezést.

## Migrációs stratégia

### 1. fázis

A jelenlegi `registerAsOrganizer` logika megmarad kompatibilitási okból, de bevezetünk mellé egy új mezőt.

Ajánlott mapping:

- `registerAsOrganizer = true` + nincs választott út -> átmenetileg `team_sport_organizer`
- `inviteToken`-nel érkező új user -> `invited_participant`

### 2. fázis

A frontend regisztrációs nézet új választófelületet kap.

### 3. fázis

A login utáni kezdőélmény a `registration_path` alapján válik szét.

### 4. fázis

Külön tornaszervezői kezdőmunkatér készül.

## Első konkrét fejlesztési következmények

Az új irány alapján a következő fejlesztési lépések ajánlottak:

1. user mező bevezetése: `registration_path`
2. auth validáció és regisztráció bővítése
3. regisztrációs UI újratervezése
4. login utáni felületváltó logika bevezetése
5. tornaszervezői kezdőmunkatér külön specifikációja

## Rövid döntési összefoglaló

Ettől a ponttól kezdve a regisztráció nem pusztán technikai account-létrehozás, hanem termékbeli belépési döntés.

Ez a belépési döntés határozza meg:

- a felhasználó első élményét
- a modulok relevanciáját
- a további onboardingot
- és azt is, hogy a platform fő fókusza végre a tornaszervezés felé tudjon rendeződni
