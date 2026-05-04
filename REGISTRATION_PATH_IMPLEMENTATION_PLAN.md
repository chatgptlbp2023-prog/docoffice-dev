# `registration_path` Bevezetési Technikai Terv

## Cél

Ez a dokumentum rögzíti, hogyan kell technikailag bevezetni a `registration_path` mezőt a jelenlegi rendszerbe úgy, hogy:

- a meglévő auth flow ne törjön el
- a jelenlegi felhasználók ne veszítsék el a hozzáférésüket
- a frontend és a backend fokozatosan átállhasson az új belépési modellre

## Új mezők

## 1. Kötelező új user mező

`registration_path`

Javasolt típus:

- `text` vagy enum-szerű `varchar`

Javasolt értékek:

- `tournament_organizer`
- `team_sport_organizer`
- `activity_organizer`
- `invited_participant`

## 2. Opcionális új user mező

`organizer_activity_type`

Javasolt értékek például:

- `football`
- `basketball`
- `yoga`
- `pilates`
- `running`
- `cycling`
- `hiking`
- `other`

## Adatbázis terv

## 1. Migration

Új migration szükséges a `users` táblához.

### Javasolt műveletek

1. `registration_path` oszlop hozzáadása
2. `organizer_activity_type` oszlop hozzáadása
3. kezdetben `registration_path` lehet ideiglenesen nullable
4. backfill után érdemes `not null` irányba menni

### Javasolt default stratégia

Első körben ne a DB default mondja meg a végleges üzleti irányt.

Jobb:

- migration után backfill script
- majd app oldali explicit kitöltés

## 2. Backfill logika a meglévő userekre

Ajánlott ideiglenes szabály:

- ha `can_create_team = true`, akkor `team_sport_organizer`
- különben `invited_participant`

Ez csak átmeneti mapping.

Később a valós szervezői út külön onboarding vagy admin döntés alapján finomítható.

## Backend terv

## 1. `src/middleware/requestValidation.js`

### Bővítendő

- `validateRegister`
- később `validateGoogleAuth`, ha külön validációja van

### Új inputok

- `registrationPath`
- opcionálisan `organizerActivityType`

### Validáció

`registrationPath` csak ezek egyike lehet:

- `tournament_organizer`
- `team_sport_organizer`
- `activity_organizer`
- `invited_participant`

`organizerActivityType` csak whitelistből jöhet vagy `null`.

## 2. `src/controllers/authController.js`

### Érintett részek

- `register`
- `googleAuth`
- `serializeUser`

### Változtatások

1. a jelenlegi `registerAsOrganizer` logika mellé bekerül a `registrationPath`
2. ha nincs új mező, a régi flow kompatibilitási mappinget használ
3. a user létrehozásakor a mező mentődik
4. a `serializeUser` visszaadja:
   - `registration_path`
   - `organizer_activity_type`

## 3. User létrehozó query-k

Minden olyan helyen bővíteni kell, ahol user keletkezik vagy frissül:

- local register
- Google auth upsert
- esetleges seed vagy teszt setup

## 4. `src/services/userProfileService.js`

Ha a mező profilból később módosítható vagy megjelenik, a `getUserByIdWithStats` lekérdezést is bővíteni kell.

## Frontend terv

## 1. Auth state

### Jelenlegi

Az auth UI jelenleg:

- login
- register
- invite preview
- `registerAsOrganizer`

### Cél

Külön első lépés kell:

- útvonalválasztó képernyő vagy blokk

Állapot:

- `selectedRegistrationPath`
- opcionálisan `selectedOrganizerActivityType`

## 2. Regisztrációs UI

### Új lépések

1. útválasztó kártyák
2. regisztrációs űrlap
3. szükség esetén típusfinomítás

### Beküldendő payload

Mostantól a register kérés küldje:

- `name`
- `email`
- `password`
- `phone`
- `inviteToken`
- `registrationPath`
- `organizerActivityType`

### Kompatibilitás

Átmenetileg a frontend még küldheti a `registerAsOrganizer` mezőt is, de a valódi döntést már az új mezőnek kell adnia.

## 3. Login utáni routing

### Cél

A frontend a sikeres login után a `registration_path` alapján döntsön az elsődleges munkatérről.

Például:

- `tournament_organizer` -> tornaszervezői shell
- `team_sport_organizer` -> csapatsport-szervezői shell
- `activity_organizer` -> egyéb szervezői shell
- `invited_participant` -> meghívotti vagy játékos nézet

## API kompatibilitási stratégia

## 1. Átmeneti időszak

Mindkét mezőt elfogadjuk:

- `registerAsOrganizer`
- `registrationPath`

### Prioritási szabály

1. ha van `registrationPath`, az számít
2. ha nincs, akkor fallback a régi `registerAsOrganizer`

## 2. Későbbi tisztítás

Ha a frontend átállt, a `registerAsOrganizer` később kivezethető.

## Tesztelési terv

## Backend tesztek

Új esetek:

1. register `tournament_organizer` path-tal
2. register `team_sport_organizer` path-tal
3. register `activity_organizer` path-tal
4. invite-os register `invited_participant` path-tal
5. fallback a régi `registerAsOrganizer` mezőről
6. invalid `registrationPath` -> `400`

## Frontend tesztek

Új esetek:

1. regisztrációs útválasztó megjelenik
2. a kiválasztott út bekerül a payloadba
3. meghívóval érkező user helyes ágra megy
4. login utáni első nézet `registration_path` alapján vált

## Implementációs sorrend

## 1. fázis

- migration
- backfill
- backend input és output bővítése

## 2. fázis

- frontend auth state bővítése
- új regisztrációs választó UI

## 3. fázis

- login utáni munkatér-routing

## 4. fázis

- régi `registerAsOrganizer` visszaszorítása

## Kockázatok

## 1. Régi userek rossz ágra kerülnek

Megoldás:

- kezdeti backfill + későbbi finomhangolási lehetőség

## 2. Meghívóval érkező user rossz szervezői ágat kap

Megoldás:

- elsődlegesen `invited_participant`
- és csak később válthat szervezői útra

## 3. Frontend és backend átmenetileg eltérően gondolkodik

Megoldás:

- kompatibilitási időszak
- explicit prioritási szabály

## Rövid összefoglaló

A `registration_path` bevezetése a teljes új platformlogika technikai kapuja.

Ez lesz az a mező, amely összeköti:

- a regisztrációt
- az onboardingot
- a munkatérválasztást
- és a későbbi modul-láthatósági szabályokat
