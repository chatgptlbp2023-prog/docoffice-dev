# Pénzügyi Egyenleg Modul Spec

## Cél

A jelenlegi attendance + befizetés rögzítés jó első lépés, de nem elég pontos egy valódi csapatszintű kassza kezeléséhez.

A következő verzió célja:

- külön kezelni a `jelenlétet` és a `pénzügyi teljesítést`
- csapatszinten nyilvántartani minden játékos futó egyenlegét
- támogatni a `tartozás` és a `többlet` továbbvitelét a következő eseményekre
- ezt admin és user oldalon is átláthatóvá tenni

Ez a modul nem banki fizetési rendszer. Ez egy belső, admin által könyvelt csapatkassza.

---

## Alapelv

Egy eseménynél négy külön dolog létezik:

1. `Elvárt összeg`
2. `Ténylegesen beérkezett összeg`
3. `Eltérés`
4. `Futó csapatszintű egyenleg`

Fontos:

- a `Megjelent` nem jelentheti automatikusan azt, hogy pontosan fizetett is
- a ténylegesen jóváhagyott összeg mindig az legyen, ami valóban beérkezett
- az eltérés pozitív és negatív irányban is élő adat

---

## Fogalmak

### 1. Eseményhez tartozó pénzügyi elvárás

Az eseményből számolt, játékosra eső összeg:

- `fejpénz / fő`
- `alapdíj / fő`
- `esemény elvárt összesen / fő`

Példa:

- fejpénz: `1200 Ft`
- alapdíj: `100 Ft`
- esemény elvárt összesen: `1300 Ft`

### 2. Tényleges befizetés

Az összeg, amit az admin a jelenléti könyvelésnél rögzít:

- lehet pontos
- lehet kevesebb
- lehet több

Példa:

- elvárt: `1300 Ft`
- tényleges: `1500 Ft`

### 3. Esemény eltérés

Képlet:

`eltérés = tényleges befizetés - eseményre elvárt összeg`

Példák:

- `1500 - 1300 = +200`
- `1000 - 1300 = -300`

### 4. Csapatszintű futó egyenleg

Minden usernek, minden csapatban legyen külön futó pénzügyi egyenlege:

- pozitív: többlete van
- negatív: tartozik
- nulla: rendezett

Képlet:

`új egyenleg = előző egyenleg + aktuális esemény eltérés`

Példa:

- előző egyenleg: `-300`
- mostani eltérés: `+100`
- új egyenleg: `-200`

---

## Üzleti szabályok

## 1. Jelenlét és pénzügy szétválasztása

Az admin jelenléti rögzítésnél ezeket kezeli külön:

- `Megjelent`
- `No-show`
- `Ténylegesen befizetett összeg`

Szabály:

- `no_show` esetén alapból `0 Ft` befizetés
- `present` esetén a befizetett összeg szabadon írható

## 2. A default összeg továbbra is segédérték

Ha az esemény `1300 Ft / fő`, akkor a mező alapértelmezett értéke legyen `1300`.

De ez csak előtöltött érték:

- admin átírhatja
- a rögzítés a ténylegesen beírt összeget menti

## 3. Tartozás továbbvitele

Ha egy user kevesebbet fizetett, az negatív egyenlegként menjen tovább.

Példa:

- előző egyenleg: `-300`
- új esemény elvárt díja: `1300`
- rendezendő összesen: `1600`

## 4. Többlet továbbvitele

Ha egy user többet fizetett, az pozitív egyenlegként menjen tovább.

Példa:

- előző egyenleg: `+200`
- új esemény elvárt díja: `1300`
- rendezendő összesen: `1100`

## 5. A következő eseményben az előző egyenleg látszódjon

Present játékos könyvelésekor az admin ezt lássa:

- esemény díja
- előző egyenleg
- most rendezendő összesen
- tényleges befizetés
- új egyenleg

## 6. No-show és pénzügy

Első verzióban:

- a no-show önmagában nem terhel automatikus pénzt
- csak azt könyveljük, amit az admin ténylegesen rögzít

Később bővíthető:

- no-show díj
- késői lemondási díj

---

## Ajánlott adatmodell

## A. Eseményszintű könyvelési sor

Javasolt új vagy kibővített rekord esemény + user szinten:

- `team_id`
- `event_id`
- `user_id`
- `attendance_status`
- `expected_base_amount`
- `expected_fee_amount`
- `expected_total_amount`
- `balance_before_event`
- `settlement_target_amount`
- `actual_paid_amount`
- `event_delta_amount`
- `balance_after_event`
- `recorded_by_user_id`
- `recorded_at`

Megjegyzés:

- az attendance táblát lehet bővíteni
- vagy külön `event_financial_entries` tábla is lehet

Én külön táblát javasolnék, mert tisztább:

- attendance = jelenlét
- finance entry = pénzügyi könyvelés

## B. Csapatszintű user egyenleg

Lehet számolt vagy materializált.

Egyszerű első verzió:

- ne külön tárolt mező legyen
- hanem a könyvelt eseménysorokból számoljuk

Később optimalizálható:

- `team_member_balances`

Javasolt mezők:

- `team_id`
- `user_id`
- `current_balance_amount`
- `updated_at`

---

## Admin UI terv

## 1. Esemény könyvelés

A jelenléti panelben minden játékos sorában legyen:

- név
- attendance státusz
- esemény díja
- előző egyenleg
- most rendezendő
- ténylegesen befolyt összeg mező
- új egyenleg előnézet

Példa sor:

- `Esemény díja: 1300 Ft`
- `Előző egyenleg: -300 Ft`
- `Most rendezendő: 1600 Ft`
- `Befolyt: [1500]`
- `Új egyenleg: -100 Ft`

## 2. Mind megjelent

A `Mind megjelent` gomb:

- csak jelenlétet és default befizetési összeget töltsön be
- de az admin ettől még felülírhatja a mezőket

Ha tényleges tömeges mentés marad:

- az aktuális sorokban lévő összegeket mentse

## 3. Pénzügy / kassza modul

A csapatszintű pénzügyi nézetben legyen:

### Összesítő

- Fejpénz összesen
- Alapdíj összesen
- Elvárt összesen
- Ténylegesen befolyt összesen
- Eltérés összesen
- Nyitott tartozás összesen
- Nyitott többlet összesen

### Eseménysorok

Sorok mezői:

- esemény neve
- időpont
- helyszín
- fejpénz összesen
- alapdíj összesen
- elvárt összesen
- befolyt összesen
- eltérés

### Tagonkénti egyenleg nézet

Külön lista:

- játékos neve
- aktuális egyenleg
- utolsó könyvelt esemény
- státusz:
  - `rendezett`
  - `tartozik`
  - `többlete van`

---

## User UI terv

Minden felhasználónak legyen csapatszintű `Pénzügyeim` blokkja.

## Felső összesítő

- aktuális egyenleg
- rendezendő következő eseménynél
- utolsó könyvelt befizetés

## Eseménylista

Sorok:

- esemény neve
- időpont
- elvárt összeg
- befizetett összeg
- esemény eltérés
- esemény utáni egyenleg

## Állapotjelölések

- `Rendezve`
- `Tartozás: -300 Ft`
- `Többlet: +200 Ft`

---

## Példa folyamat

## Esemény 1

- esemény díja: `1300 Ft`
- előző egyenleg: `0`
- befizetett: `1500`
- esemény eltérés: `+200`
- új egyenleg: `+200`

## Esemény 2

- esemény díja: `1300 Ft`
- előző egyenleg: `+200`
- rendezendő összesen: `1100`
- befizetett: `1000`
- esemény eltérés a rendezendőhöz képest: `-100`
- új egyenleg: `-100`

## Esemény 3

- esemény díja: `1300 Ft`
- előző egyenleg: `-100`
- rendezendő összesen: `1400`
- befizetett: `1400`
- új egyenleg: `0`

---

## MVP javaslat

### 1. fázis

- eseményenkénti pénzügyi könyvelési sor
- előző egyenleg számítása
- új egyenleg számítása
- admin eseménykönyvelő UI
- user `Pénzügyeim` alapnézet

### 2. fázis

- csapatszintű admin egyenleglista
- szűrők
- eseményenként részletes bontás

### 3. fázis

- automatikus no-show díj opció
- késői lemondási díj
- részfizetés / több részlet

---

## Nyitott döntések

1. `No-show` esetén lehet-e pozitív befizetés?

Javaslat:

- igen, technikailag lehessen
- de default `0 Ft`

2. A többletet automatikusan levonjuk a következő eseménynél?

Javaslat:

- igen, számoljuk bele automatikusan
- de az admin lássa és felülírhassa

3. Tartozás esetén a user kapjon figyelmeztetést?

Javaslat:

- igen, user oldalon vizuálisan jelezzük

4. Admin lássa-e, hogy a user aktuálisan mennyivel jön a következő eseményre?

Javaslat:

- igen, ez legyen az admin könyvelési sor része

---

## Rövid összefoglaló

Az új pénzügyi modell lényege:

- nem az eseményre eső díjat könyveljük vakon
- hanem a ténylegesen beérkezett pénzt
- ebből eseményenként eltérés keletkezik
- az eltérés csapatszintű egyenleggé áll össze
- ez továbbvihető a következő eseményekre

Ez lesz az első valóban használható, tisztességes csapatkassza-logika.
