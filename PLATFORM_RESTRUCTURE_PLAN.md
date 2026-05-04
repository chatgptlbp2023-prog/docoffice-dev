# Platform Visszabontási és Átállási Terv

## Cél

Ez a dokumentum azt rögzíti, hogyan kell a jelenlegi rendszert fokozatosan átalakítani az új termékirány alapján.

Nem nulláról újraírás a cél, hanem kontrollált visszabontás és újrarendezés.

Az alapelv:

- a működő backend-mag ne vesszen el
- a jelenlegi felületből csak azt tartsuk meg, ami beilleszthető az új modellbe
- a fő törésvonal a regisztrációs út és a külön munkaterek szétválasztása legyen

## Mi a jelenlegi probléma

A jelenlegi rendszer több különböző szervezői világot próbál egy közös adminfelületbe préselni.

Ezért most:

- túl sok minden látszik egyszerre
- a csapatadmin és a jövőbeli tornaszervezés összekeveredik
- az onboarding nem a fő üzleti célhoz igazodik
- a `registerAsOrganizer` logika túl egyszerű a valódi termékhez
- az admin UI túl hamar túl sok funkciót mutat

## Mi marad meg

Az alábbiak jó eséllyel megtarthatók, mert platformszintű, újrahasznosítható építőkockák:

### Backend-mag

- auth
- JWT session
- invite token logika
- user profil
- team membership alapok
- event alapok
- rank és skill motor részei
- pénzügyi ledger alapok
- emailküldési infrastruktúra
- verziókövetés

### Frontendből megtartható alapok

- session-kezelés
- profilpanel alapjai
- üzenetkezelés
- invite kezelési mag
- eseménykártyák egy része
- általános UI komponenslogika

## Mi nem maradhat közös felületként

Az alábbi dolgokat szét kell választani:

### 1. Egyetlen közös auth-indulás

Ez helyett:

- regisztrációs útvonal-választó kell
- szerephez igazított onboarding kell

### 2. Egyetlen közös admin dashboard

Ez helyett:

- külön `tornaszervezői munkatér`
- külön `csapatsport-szervezői munkatér`
- külön `egyéb szervezői munkatér`

### 3. Egyetlen közös pénzügyi nézet

Ez helyett:

- külön tornaalapú pénzügyi logika
- külön saját esemény alapú pénzügyi logika

### 4. Azonos onboarding minden szervezőnek

Ez helyett:

- tornaszervezői onboarding
- csapatsportos onboarding
- egyéb szervezői onboarding
- meghívott résztvevői onboarding

## A jelenlegi kódhoz kapcsolódó fő bontási pontok

## 1. Auth és regisztráció

### Jelenlegi állapot

A mostani auth logika központi döntése:

- `registerAsOrganizer`
- vagy `inviteToken`

Ez technikailag jó kiindulás, de nem felel meg az új terméklogikának.

### Célállapot

A regisztrációban új belépési döntés kell:

- `tournament_organizer`
- `team_sport_organizer`
- `activity_organizer`
- `invited_participant`

### Visszabontási teendők

1. bevezetni a `registration_path` mezőt
2. a jelenlegi `registerAsOrganizer` logikát átmeneti kompatibilitási rétegként megtartani
3. a frontend auth képernyő elé egy útválasztó lépést tenni
4. a login utáni első nézetet már a `registration_path` alapján meghatározni

## 2. Onboarding

### Jelenlegi állapot

Az onboarding több helyen összemosódik:

- invite landing
- auth view
- admin checklist
- csapat létrehozási flow

### Célállapot

Az onboardingnak külön kell válnia:

- szervezői út szerint
- meghívásos vagy saját indulás szerint

### Visszabontási teendők

1. külön onboarding döntési pont definiálása
2. a jelenlegi checklist logika kiszervezése munkatér-specifikus blokkokba
3. a meghívott user első belépését elválasztani a szervezői első belépéstől

## 3. Admin UI

### Jelenlegi állapot

A `public/app.js` state és UI jelenleg több szervezői világot egyben kezel:

- `adminWorkspace`
- `adminTeamSection`
- `adminEventsSection`
- `adminFinanceSection`
- `adminEventFormSection`

Ez jól mutatja, hogy már most is több alnézet próbál megszületni, de még egy közös szerkezeten belül.

### Célállapot

Ezeket a nézeteket nem tovább bővíteni kell, hanem szét kell osztani:

- `Tournament workspace`
- `Team sport workspace`
- `Activity workspace`

### Visszabontási teendők

1. külön munkatér-router bevezetése
2. a jelenlegi `adminView` fokozatos feldarabolása
3. a közös komponensek leválasztása a munkatér-specifikus nézetekről

## 4. Navigáció

### Jelenlegi állapot

A bal oldali nav jelenleg:

- auth
- admin
- játékos nézet

Ez már most sem elég a jövőbeli termékhez.

### Célállapot

A fő navigáció a user típusától függjön.

Példák:

#### Tornaszervező

- Kezdőpult
- Tornák
- Csapatok és nevezések
- Lebonyolítás
- Mérkőzések
- Pénzügy
- Kommunikáció
- Statisztika

#### Csapatsport-szervező

- Kezdőlap
- Csapat
- Események
- Pénzügy
- Statisztika

#### Egyéb szervező

- Kezdőlap
- Események
- Résztvevők
- Pénzügy
- Beállítások

## 5. Pénzügy

### Jelenlegi állapot

A pénzügy jelenleg túl sok különböző use case-et próbál egyszerre kezelni.

### Célállapot

Két külön világ kell:

#### A. Saját esemény pénzügy

- kis csoport
- jelenlét
- tényleges befizetés
- egyenleg

#### B. Torna pénzügy

- nevezési díj
- csapatonkénti fizetés
- torna költségei
- összesített torna-egyenleg

### Visszabontási teendők

1. a jelenlegi pénzügyi UI-ból csak a közös ledger-alapot megtartani
2. külön specifikációk szerint kettébontani a megjelenítést

## Javasolt átállási sorrend

Az átalakítást ne egyszerre végezzük, hanem fix sorrendben.

### 1. fázis - belépési modell

- `registration_path` bevezetése
- auth API bővítése
- regisztrációs UI szétválasztása

### 2. fázis - munkatérválasztás

- login utáni munkatér-routing
- külön kezdőoldalak

### 3. fázis - tornaszervezői shell

- külön tornaszervezői nav
- külön üres, de működő munkatérváz

### 4. fázis - csapatsport-szervező tisztítás

- a jelenlegi adminfelület leszűkítése a `Saját esemény szervezés` világhoz
- foci / kosár és hasonló csapatsportos logika itt marad

### 5. fázis - egyéb szervezői ág

- közös eseményszervezési mag
- sporttípus-specifikus mezők

### 6. fázis - pénzügy kettéválasztása

- saját esemény pénzügy
- torna pénzügy

## Mihez nem szabad most hozzányúlni kapkodva

Az alábbiakat nem szabad addig újraírni, amíg a belépési és munkatérlogika nincs rögzítve:

- teljes pénzügyi UI újabb toldozása
- admin dashboard további bővítése
- új általános checklist logika ráépítése a mostani admin nézetre

Ezek csak tovább mélyítenék a jelenlegi szerkezeti problémát.

## Konkrét következő implementációs feladatok

1. adatmodell-terv a `registration_path` mezőre
2. auth endpointok bővítési terve
3. regisztrációs képernyő új első lépése
4. munkatér-router terv a frontendben
5. a jelenlegi `adminView` elemeinek osztályozása:
   - marad a csapatsport-szervezői ágban
   - átkerül később a tornaszervezői ágba
   - kivezetendő

## Rövid összefoglaló

Az új irányra való átállás nem egyetlen nagy rewrite.

Ez egy tudatos visszabontás:

- először a belépési döntést tisztázzuk
- utána külön munkatereket építünk
- és csak ezután egyszerűsítjük le a meglévő adminfelületet a valódi szerepeire
