# Jelenlegi Adminfelület Felülvizsgálata az Új Terméklogika Alapján

## Cél

Ez a dokumentum a jelenlegi adminfelületet vizsgálja felül az új termékirány szerint.

A kérdés nem az, hogy mi működik technikailag, hanem az, hogy:

- melyik rész maradhat a `Csapatsport-szervező` ágban
- melyik rész közös platformelem
- melyik rész szorul áthelyezésre vagy újragondolásra
- és melyik rész nem fér bele a jövőbeli szerkezetbe ebben a formában

## Kiindulási állapot

A jelenlegi adminnézet alapja:

- egyetlen `adminView`
- ezen belül `home / team / events / finance`
- és ezen belül további alnézetek

Ez jó irány volt egy túlterhelt dashboard csökkentésére, de még mindig egyetlen szervezői világként kezeli azt, amit az új terméklogika szerint szét kell választani.

## A jelenlegi adminfelület fő blokkjai

## 1. Admin fejléc és felső összegzők

### Mi van most

- `Csapat admin` fejléc
- overview kártyák

### Értékelés

Ez alapvetően a `Csapatsport-szervező` világhoz tartozik.

### Döntés

- maradhat a csapatsportos munkatérben
- nem kerül át a tornaszervezői világba ebben a formában

## 2. `Kezdőlap / Csapat / Események / Pénzügy` admin subnav

### Mi van most

Az admin fő szervezői nézete erre a négy munkatérre bomlik.

### Értékelés

Ez jó kiindulás a `Csapatsport-szervező` ág számára.

### Döntés

- maradhat a `Csapatsport-szervező` világ elsődleges főnavjaként
- nem tekinthető platformszintű általános adminnavigációnak
- nem használható változatlanul a `Tornaszervező` világban

## 3. `Kezdő admin iránytű` és `Gyors áttekintés`

### Mi van most

- csapat setup
- első lépések
- következő ajánlott teendő

### Értékelés

Ez hasznos minta, de jelenleg túl erősen a csapatkapitányi logikára épül.

### Döntés

- az elv maradjon meg
- a konkrét tartalom csak a `Csapatsport-szervező` ágba maradjon
- külön tornaszervezői iránytű kell
- külön egyéb szervezői iránytű kell

## 4. `Csapat kontextus`

### Mi van most

- csapat betöltése
- csapat létrehozása
- meghívások
- tagok
- csapatsorsolás
- haladó beállítások

### Értékelés

Ez egyértelműen a `Csapatsport-szervező` ág magja.

### Döntés

- a `Csapatsport-szervező` világban marad
- a tornaszervezői világban nem ez a központi egység
- ott a központi egység a `torna`, nem a saját csapat

## 5. `Tag meghívása` és `Csapat meghívói`

### Mi van most

- emailes meghívás
- szerepkör
- üzenet
- meghívólista

### Értékelés

A meghíváskezelés platformszintű képesség, de a jelenlegi felület csapatszintű szervezésre van optimalizálva.

### Döntés

- a képesség maradjon közös platformelem
- a jelenlegi megjelenítés maradjon a `Csapatsport-szervező` ágban
- a `Tornaszervező` világban külön `Csapatkapitányok meghívása` nézet kell

## 6. `Csapattagok kezelése`

### Mi van most

- közvetlen taghozzáadás
- szerepkörök
- csapattaglista

### Értékelés

Ez csapatszervezői logika, nem tornaszervezői.

### Döntés

- maradjon a `Csapatsport-szervező` munkatérben
- a közvetlen admin beléptetés hosszabb távon másodlagos maradjon a meghívás mögött

## 7. `Csapatsorsolás` blokk

### Mi van most

- kiválasztott eseményhez kapcsolódó generálás
- preview
- mentés és publikálás

### Értékelés

Ez erősen foci- és csapatsport-specifikus funkció.

### Döntés

- csak a `Csapatsport-szervező` ágba tartozik
- a `Saját esemény szervezés` almodulon belül is csak csapatsport esetén jelenjen meg
- a `Tornaszervező` világban ezt nem szabad újrafelhasználni, mert ott teljesen más lebonyolítási logika kell

## 8. `Haladó beállítások`

### Mi van most

- rangmodul
- skill modul
- csapatleosztási előnézethez kapcsolódó logikák

### Értékelés

Ez csak a csapatsportos szervezési világban releváns.

### Döntés

- marad a `Csapatsport-szervező` ágban
- az `Egyéb szervező` ágban nem jelenhet meg
- a `Tornaszervező` világban külön, más statisztikai és lebonyolítási modulok lesznek

## 9. `Új esemény` szerkesztő

### Mi van most

A jelenlegi űrlapban egyszerre szerepel:

- cím
- státusz
- leírás
- kezdés
- helyszín
- minimum játékos
- pályán lévők száma
- csere
- szabályok
- ismétlődés
- értesítések
- díjszámítás

### Értékelés

Ez a jelenlegi szerkezet egyik legfontosabb túlterhelési pontja.

Mert:

- keveri a közös eseménymagot
- keveri a csapatsportos extrákat
- és keveri a haladó opciókat

### Döntés

- a teljes jelenlegi forma nem maradhat egyben
- ebből kell kinyerni a `Saját esemény szervezés` közös magját
- a csapatsportos mezőket külön blokkba kell helyezni
- az egyéb szervezői világban ezek nagy részének nem szabad megjelennie

## 10. `Értesítési paletta`

### Mi van most

Külön értesítési kapcsolók az esemény létrehozási felületen.

### Értékelés

Hasznos lehetőség, de jelenleg túl korán és túl mélyen jelenik meg.

### Döntés

- az elsődleges eseménylétrehozó flow-ból érdemes háttérbe tolni
- opcionális vagy haladó blokk maradjon
- hosszabb távon szervezőtípus szerint más defaultokat kapjon

## 11. `Pénzügy` és `Esemény elszámolása`

### Mi van most

- csapatkassza
- egyenlegek
- esemény utáni attendance és befizetési könyvelés

### Értékelés

Ez a jelenlegi megközelítés kifejezetten a kisebb csapatszervezői use case felé húz.

### Döntés

- a `Csapatsport-szervező` ágban marad a saját eseményes pénzügyi világ
- a `Tornaszervező` világban teljesen külön pénzügyi munkatér kell
- az `Egyéb szervező` ágnál csak egyszerűsített, eseményalapú pénzügy maradjon

## 12. `Platform gazda nézet`

### Mi van most

- külön platform overview
- csapatok és közelgő események

### Értékelés

Ez szerkezetileg már külön nézetként jelenik meg, ami jó előjel.

### Döntés

- maradjon külön platformszintű admin nézet
- nem szabad összekeverni sem a tornaszervezői, sem a csapatszervezői munkatérrel

## Összesített osztályozás

## A. Közös platformképességek

Ezek a képességek közösek maradnak:

- auth
- profil
- meghívás-infrastruktúra
- session
- értesítési alapok
- pénzügyi alap ledger

## B. Marad a `Csapatsport-szervező` ágban

- csapat létrehozása
- csapat betöltése
- tagkezelés
- csapatmeghívás
- csapatsorsolás
- rangmodul
- skill modul
- foci- és csapatsportos eseményszerkesztés
- saját esemény utáni attendance és mikropénzügy

## C. Áthelyezendő vagy újraépítendő

- általános admin iránytű
- közös checklist
- közös pénzügyi munkatér
- közös eseményűrlap

## D. Nem használható a `Tornaszervező` világban ebben a formában

- csapatkontextus, mint fő szervezői kiindulópont
- csapatsorsolás blokk
- csapatsport-specifikus eseménymezők
- csapaton belüli attendance alapú pénzügyi flow

## Következő konkrét fejlesztési következmények

1. a jelenlegi `adminView` elemeinek címkézése a frontendben:
   - `shared`
   - `team_sport_only`
   - `replace_for_tournament`
2. a jelenlegi eseményűrlap mezőinek kivonatolása a közös eseménymaghoz
3. a `Csapatsport-szervező` shell és a `Tornaszervező` shell különvázának megrajzolása
4. a checklist logika leválasztása a jelenlegi közös adminnézetről

## Rövid összefoglaló

A jelenlegi adminfelület nem kuka, de nem is maradhat közös szervezői felületként.

Az új terméklogika szerint:

- egy része megtartható a `Csapatsport-szervező` ágban
- egy része közös platformképesség
- és egy része csak átmeneti szerkezet, amit külön világakra kell szétvágni
