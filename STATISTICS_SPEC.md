# Statisztikák modul specifikáció

## Cél

A `Statisztikák` külön admin menüpont legyen, amely nem napi operatív munkára szolgál, hanem csapatszintű áttekintést ad:

- kik aktívak és kik kezdenek lemorzsolódni
- hogyan alakul a rangeloszlás
- kik megbízhatók jelenlét és reakció szempontból
- hogyan áll a csapat pénzügyi fegyelme
- kik igényelnek szervezői figyelmet

Ez a menü elsősorban `team_admin` és `team_manager` szerepkörnek készül.

## Fő menüszerkezet

Új főmenü:

- `Kezdőlap`
- `Csapat`
- `Események`
- `Pénzügy`
- `Statisztikák`

## Statisztikák oldal fő blokkjai

### 1. Gyors csapatösszkép

Felül egy gyors, vezetői összefoglaló blokk:

- aktív tagok száma
- inaktív vagy lemorzsolódó tagok száma
- tartozók száma
- többlettel rendelkező tagok száma
- legalább 3 eseményre nem reagálók száma
- no-show kockázatos tagok száma
- rangeloszlás mini összegzés

Ez a blokk legyen azonnal olvasható, 6-8 számkártyával.

### 2. Rangok

Cél: megmutatni, hogyan oszlik el a keret a rangok mentén, és ki milyen irányba mozdult.

#### Kiemelt mutatók

- hány játékos van az egyes rangokban
- hány játékos lépett feljebb az utolsó értékelés óta
- hány játékos lépett lejjebb
- hány maradt változatlan

#### Játékosonkénti oszlopok

- név
- aktuális rang
- előző rang
- rangváltozás iránya
- rangváltozás dátuma
- effektív rang / vendég státusz
- hány értékelt esemény számított bele

#### Vizuális jelölés

- `↑` zöld: feljebb lépett
- `↓` piros: lejjebb lépett
- `—` fekete vagy sötétszürke: nem változott

#### Extra hasznos mezők

- rangváltozás oka röviden:
  - jó részvétel
  - no-show
  - inaktivitás
  - lemondási minta

### 3. Jelenlét

Cél: látni, ki mennyire megbízható.

#### Kiemelt mutatók

- összes jelentkezés
- összes tényleges részvétel
- összes lemondás
- összes no-show
- részvételi arány
- no-show arány
- lemondási arány

#### Játékosonkénti oszlopok

- név
- hány alkalommal jelentkezett
- hány alkalommal jelent meg
- hányszor mondta le
- hányszor volt no-show
- részvételi arány %
- no-show arány %
- hány esemény került értékelésre

#### Extra mutatók

- egymást követő jelenlétek száma
- egymást követő no-show / nem reagálás száma
- utolsó megjelenés dátuma

### 4. Aktivitás

Cél: kiszűrni azokat, akik eltűnőben vannak, vagy nem reagálnak a szervezésre.

#### Kiemelt mutatók

- legalább 3 eseményre nem reagálók száma
- utolsó 30 napban inaktív játékosok száma
- utolsó 3 eseményből 0 reakcióval rendelkezők száma

#### Játékosonkénti oszlopok

- név
- utolsó aktivitás dátuma
- utolsó jelentkezés dátuma
- nem reagált események száma
- egymást követő nem reagálások
- reakciós arány %
- átlagos reakcióidő

#### Üzleti jelzés

Legyen külön lista:

- `Figyelmet igényel`

Ide kerüljenek azok, akiknél:

- 3 vagy több nem reagálás
- magas no-show arány
- nincs aktivitás 30 napja
- tartozásuk van

### 5. Pénzügyi statisztika

Cél: az admin ne csak eseményenként, hanem játékosonként is lássa az anyagi fegyelmet.

#### Kiemelt mutatók

- teljes csapat tartozás
- teljes csapat többlet
- rendezett tagok száma
- tartozók száma
- többlettel rendelkezők száma
- összes befizetett összeg eddig

#### Játékosonkénti oszlopok

- név
- eddig befizetett összeg
- elvárt összeg összesen
- aktuális egyenleg
- tartozás / többlet státusz
- könyvelt események száma
- utolsó pénzügyi mozgás dátuma

#### Külön státuszok

- `rendezett`
- `tartozik`
- `többlete van`

## Szűrés és rendezés

Minden statisztikai blokkban legyen:

- név szerinti keresés
- státusz szerinti szűrés
- rendezés csökkenő / növekvő irányban

Példák:

- legtöbb no-show
- legnagyobb tartozás
- legjobb részvételi arány
- legtöbb nem reagálás

## Ajánlott alnézetek a Statisztikák menün belül

- `Összkép`
- `Rangok`
- `Jelenlét`
- `Aktivitás`
- `Pénzügy`

Az `Összkép` legyen a belépő nézet, a többi részletesebb bontás.

## UI javaslat

### Felső sor

- 6-8 statkártya

### Középső rész

- bal oldalt: diagram / rangeloszlás
- jobb oldalt: figyelmet igénylő játékosok

### Alsó rész

- nagy, szűrhető táblázat

## Diagram javaslatok

### Rangeloszlás

- oszlopdiagram vagy sávdiagram
- rangonként darabszám

### Részvételi minőség

- megjelent / lemondta / no-show arány megoszlás

### Pénzügyi állapot

- rendezett / tartozik / többlete van megoszlás

## Ajánlott további statisztikai számok

Kifejezetten hasznos extra számok:

- reakciós arány %
- átlagos reakcióidő
- utolsó aktivitás
- egymást követő nem reagálások
- egymást követő jelenlétek
- várólistára kerülések száma
- rangvárólistára kerülések száma
- kapusnak jelölt státusz
- csapatleosztásban részvétel száma

## MVP fázisok

### 1. fázis

Alap, gyorsan használható verzió:

- Összkép kártyák
- Rangeloszlás
- Jelenlét táblázat
- Pénzügyi egyenleg táblázat
- 3 eseményre nem reagálók száma

### 2. fázis

Finomabb vezetői rálátás:

- rangváltozás iránya és előző rang
- reakciós arány
- egymást követő nem reagálás
- figyelmet igénylő lista
- szűrők és rendezések

### 3. fázis

Haladó elemzés:

- diagramok
- trendek időben
- időszak szerinti szűrés
- automatikus figyelmeztető insightok

## Fontos üzleti szabályok

- a statisztika csapatszintű legyen
- a számok mindig az adott csapatra legyenek szűrve
- a `megjelent`, `no-show`, `lemondás`, `nem reagált` fogalmak egyértelműen el legyenek választva
- a pénzügyi statisztika a ledgerből jöjjön, ne ad hoc számításból
- a rangváltozás mindig az utolsó mentett rangállapothoz képest történjen

## Várható haszon

A `Statisztikák` modul segít:

- gyorsan látni, kikre lehet stabilan számítani
- észrevenni a lemorzsolódó játékosokat
- felismerni a pénzügyi problémákat
- objektívebben kezelni a rangmodult
- kevesebb érzésalapú, több adat-alapú csapatvezetést adni
