# Új Termékirány

## Alapelv

Ez a rendszer **egy termék**.

Nem különálló baráti fociszervező és nem különálló tornaszervező app, hanem egy közös sport- és eseményszervező platform, ahol a belépési pontot és a felületet a szervező típusa határozza meg.

Az első nagy döntés **regisztrációnál** történik meg.

## A termék szerkezete

### Főmodul

`Tornaszervezés`

Ez a rendszer elsődleges, kiemelt modulja.

Ide tartozik:

- csapatkapitányok meghívása
- nevezések kezelése
- csapatkeretek felépítése
- csoportok és kieséses ágak létrehozása
- pályák kiosztása
- időbeosztás és menetrend generálása
- eredmények rögzítése
- statisztikák
- pénzügyi nyilvántartás
- kommunikáció

Ez a fő üzleti fókusz.

### Almodul

`Saját esemény szervezés`

Ez a könnyebb, gyorsabban használható szervezői ág.

Erre épülnek rá a különböző sport- és aktivitástípusok:

- foci
- kosárlabda
- jóga
- pilates
- terhes torna
- futás
- kerékpártúra
- kirándulás
- és más csoportos események

Itt nem a sportág neve a legfontosabb, hanem a **szervezési séma**.

## A regisztrációnál eldőlő fő belépési utak

Regisztrációkor vagy onboardingkor a szervező kiválasztja, hogy melyik típusba tartozik:

1. `Tornaszervező`
2. `Csapatsport-szervező`
3. `Egyéb szervező`

Ez a választás határozza meg:

- melyik kezdőfelületet kapja
- melyik modulok látszanak elsődlegesen
- melyik onboarding vezeti végig
- melyik nyelvezetet használja a rendszer

## A tornaszervező felület elvei

A tornaszervező nem ugyanazt a felületet kapja, mint az egyszerű csapatszervező.

Saját, külön munkaterület kell neki, ahol meg tudja adni például:

- hány csapatos a torna
- milyen helyszíneken zajlik
- egyszerre hány pálya használható
- egy mérkőzés hány perces
- milyen lebonyolítási forma kell
- milyen nevezési és pénzügyi szabályok tartoznak hozzá

Ezek alapján a rendszernek később képesnek kell lennie:

- csoportok generálására
- pályabeosztás készítésére
- időlogika felépítésére
- mérkőzésrend előállítására
- eredmények és statisztikák követésére

## A saját esemény szervezés elvei

Ez a modul egy egyszerűbb, rugalmasabb szervezőmotor.

Példák:

- fociedzés vagy baráti meccs
- jógafoglalkozás
- futóedzés
- biciklitúra
- kirándulás

Közös alapjai:

- időpont
- helyszín
- létszám
- jelentkezés
- várólista
- opcionális pénzügy
- opcionális meghíváskezelés

Ehhez sportonként vagy aktivitásonként csak a releváns extra mezők jelenjenek meg.

Például:

- foci esetén csapatleosztás és kapusjelölés
- jóga esetén teremköltség és minimum létszám
- kerékpártúránál etapok, megállók és nehézség

## Moduláris működés

A rendszer ne erőltessen rá minden funkciót minden szervezőre.

Legyen egy erős alapfolyamat, és mellette kapcsolható modulok.

Példák kapcsolható modulokra:

- rangmodul
- skillmodul
- statisztika
- pénzügy
- kommunikáció

Az alapelv:

- ami nem releváns, az ne látszódjon
- ami nem kell, az ne zavarjon
- ami haladó funkció, az csak annak jelenjen meg, aki valóban használja

## Üzleti logika

A tornaszervezés a belépő a rendszerbe magasabb értékű, komplexebb szervezői use case-en keresztül.

Ennek fontos következménye:

- a tornaszervező a rendszerbe hívja be a csapatkapitányokat
- a csapatkapitány a rendszerbe hozza be a saját csapatát
- a csapat és a tagok ezután már bent vannak a platformon
- innen természetes ágon használhatják később a saját eseményszervező almodult is

Ez a növekedési modell fontosabb, mint egy külön, tisztán baráti focis belépés.

## Termékdöntés

Az eddigi irány több ponton túl általános, miközben a fő üzleti fókuszhoz kevésbé igazodik.

Ezért a további tervezésnél és fejlesztésnél ezt kell alapnak tekinteni:

- a rendszer fő fókusza a `Tornaszervezés`
- a `Saját esemény szervezés` ennek almodulja
- a regisztrációnál dől el a szervezői út
- a felületet szerep és szervezési típus szerint kell bontani
- nem minden modul jelenik meg minden szervezőnek

## Következmények a jelenlegi rendszerre

A jelenlegi admin- és pénzügyi felületek további fejlesztését már ennek a szemléletnek kell alárendelni.

Ez a gyakorlatban a következőket jelenti:

1. a jelenlegi közös adminfelületet szerepalapúan újra kell bontani
2. külön tornaszervezői munkaterületet kell tervezni
3. a saját esemény szervezés modulját le kell egyszerűsíteni és sporttípusokra kell szabni
4. a modulok láthatóságát és bekapcsolását újra kell gondolni
5. a jövőbeli marketing- és onboarding-logikát is erre kell építeni

## Rövid összefoglaló

Ez a platform:

- elsősorban tornaszervező rendszer
- másodsorban saját eseményszervező modul
- sport- és aktivitásfüggetlen szervezési motor
- szerepalapú belépéssel
- moduláris, nem mindent mindenkire erőltető felülettel
