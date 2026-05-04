# Tornaszervezői Munkatér Információs Architektúra

## Cél

A tornaszervező ne ugyanabba az általános adminfelületbe essen bele, mint az egyszerű csapatszervező.

Külön munkatér kell neki, mert más a gondolkodási logikája, más a feladata és más a napi fókusza.

Ez a dokumentum rögzíti a tornaszervezői felület első, irányadó információs architektúráját.

## Alapelv

A tornaszervezői munkatér:

- nem csapatadmin-felület
- nem eseménylista központú
- nem egyetlen csapat belső életére optimalizált nézet

Hanem:

- több csapatot kezelő
- nevezésalapú
- lebonyolítás-központú
- eredmény- és pénzügyvezérelt
- operatív szervezői munkatér

## A tornaszervező fő feladatai

A tornaszervező tipikus folyamata:

1. létrehozza a tornát
2. megadja a torna paramétereit
3. meghívja a csapatkapitányokat
4. követi a nevezéseket
5. lezárja a nevezést
6. legenerálja a lebonyolítást
7. kezeli a meccseket és eredményeket
8. vezeti a pénzügyet
9. lezárja a tornát

Ez a teljes felület szerkezetét is meghatározza.

## Fő navigáció

A tornaszervezői munkatér fő menüje ne egyezzen meg a csapatsport-szervező menüjével.

Javasolt főmenük:

1. `Kezdőpult`
2. `Tornák`
3. `Csapatok és nevezések`
4. `Lebonyolítás`
5. `Mérkőzések`
6. `Pénzügy`
7. `Kommunikáció`
8. `Statisztika`

## 1. Kezdőpult

### Cél

Ez legyen a tornaszervező napi operatív belépési pontja.

### Mit kell itt látni

- aktuális vagy legközelebbi torna
- következő sürgős teendő
- nevezési állapot
- lebonyolítás készültsége
- nyitott pénzügyi feladatok
- friss szervezői figyelmeztetések

### Fő blokkok

#### A. Következő teendő

Egyetlen hangsúlyos blokk:

- `Hiányzik még 4 csapatkapitány visszajelzése`
- `A nevezés lezárható`
- `A csoportkör még nincs legenerálva`
- `3 mérkőzés eredménye hiányzik`
- `A nevezési díjak közül 2 még rendezetlen`

#### B. Aktív torna fókusz

- torna neve
- dátum
- helyszín
- csapatlétszám
- nevezett csapatok száma
- lebonyolítás állapota
- gyorsgomb: `Torna megnyitása`

#### C. Operatív összegző sor

- nevezett csapatok
- visszaigazolt csapatok
- sorsolt csoportok
- hátralévő mérkőzések
- hiányzó eredmények
- nyitott pénzügyek

#### D. Figyelmeztetések

- ütköző pályaidő
- be nem osztott mérkőzés
- hiányzó csapatkeret
- hiányzó nevezési díj
- hiányzó eredmény

### Mit ne mutasson a kezdőpult

- teljes mérkőzéslista
- teljes csapatlista részletesen
- teljes pénzügyi táblázat
- részletes beállítási űrlapok

## 2. Tornák

### Cél

Itt történjen a torna létrehozása és a tornaalapadatok kezelése.

### Alnézetek

#### 2.1 Új torna

Mezők első körben:

- torna neve
- sportág vagy aktivitástípus
- helyszín
- kezdőnap
- zárónap
- hány csapatra tervezett
- egyszerre hány pálya áll rendelkezésre
- egy mérkőzés hossza
- lebonyolítási forma

#### 2.2 Tornalistám

Lista:

- közelgő tornák
- futó tornák
- lezárt tornák

#### 2.3 Torna beállításai

Részletesebb paraméterek:

- korosztály
- szabályrendszer
- pontozás
- továbbjutás logika
- nevezési szabályok
- pénzügyi alapok

## 3. Csapatok és nevezések

### Cél

Ez a menü a torna résztvevői oldalát kezeli.

### Alnézetek

#### 3.1 Csapatkapitányok meghívása

- emailes meghívás
- meghívás állapota
- újraküldés
- lejárt meghívók

#### 3.2 Nevező csapatok

- csapatnév
- kapitány neve
- kapcsolattartó
- nevezés állapota
- keret hiánytalan-e
- fizetési állapot

#### 3.3 Csapatkeretek

- játékoslista
- minimális / maximális keretszám
- hiányzó adatok
- esetleges ellenőrzési státusz

### UX-elv

Itt a központi entitás a `nevező csapat`, nem a belső csapattag-adminisztráció.

## 4. Lebonyolítás

### Cél

Ez a tornaszervező egyik legfontosabb saját munkaterülete.

Itt kell történnie annak, ami az egyszerű csapatszervező modulban egyáltalán nincs:

- csoportok kialakítása
- kieséses ág létrehozása
- pályák kiosztása
- időrend felépítése

### Alnézetek

#### 4.1 Formátum

- csoportkör
- egyenes kiesés
- vegyes forma

#### 4.2 Csoportok

- csapatok csoportba osztása
- automatikus vagy kézi rendezés

#### 4.3 Pályák és idősávok

- hány pálya van
- melyik pálya mikor használható
- ütközések jelzése

#### 4.4 Generálás

- mérkőzésrend létrehozása
- csoportbeosztás véglegesítése
- időrendi ütközések ellenőrzése

### UX-elv

Ez legyen egy lépésenként haladó, erősen vezetett felület.

Ne egyetlen túlterhelt táblában jelenjen meg minden.

## 5. Mérkőzések

### Cél

Itt történjen a torna élő vagy utólagos operatív követése.

### Alnézetek

#### 5.1 Mai mérkőzések

- időrendben
- pályánként
- állapot szerint

#### 5.2 Eredményrögzítés

- végeredmény
- gólok
- asszisztok
- egyéb statisztikai mezők később

#### 5.3 Hiányzó eredmények

Külön lista:

- még nem lezárt mérkőzések
- részben kitöltött mérkőzések

### UX-elv

A mérkőzések menü legyen gyors, mobilról is kezelhető, és ne keveredjen a tornaalapadatokkal.

## 6. Pénzügy

### Cél

A pénzügy itt ne eseményenkénti baráti elszámolás legyen, hanem tornaalapú szervezői pénzügyi követés.

### Fő nézetek

#### 6.1 Nevezési díjak

- csapatonkénti nevezési díj
- fizetve / részben fizetve / nincs fizetve

#### 6.2 Költségek

- pályabérlet
- bírói díj
- egyéb költségek

#### 6.3 Torna pénzügyi összesítő

- bevételek
- költségek
- nyitott tételek
- egyenleg

### Megjegyzés

Ez más pénzügyi séma, mint az egyszerű saját események kis létszámos jelenléti és befizetési könyvelése.

Ezért a két pénzügyi világot külön kell kezelni.

## 7. Kommunikáció

### Cél

A tornaszervezőnek központilag kell tudnia kommunikálni:

- csapatkapitányokkal
- nevező csapatokkal
- adott esetben minden résztvevővel

### Lehetséges blokkok

- általános tájékoztatók
- szabályváltozás
- időpontmódosítás
- pályaváltozás
- hiánypótlási kérés

Ez később kapcsolódhat a csapatszintű chathez vagy értesítési rendszerhez.

## 8. Statisztika

### Cél

Itt már nem adminisztratív, hanem szervezői és sportértékű kimenetek jelenjenek meg.

Példák:

- tabellák
- góllövőlista
- asszisztlista
- csapatstatisztikák
- mérkőzésszámok

## Tornaszervezői onboarding

Az onboarding ne ugyanaz legyen, mint a csapatkapitányi onboarding.

### Javasolt lépések

1. `Torna létrehozása`
2. `Fő paraméterek megadása`
3. `Csapatkapitányok meghívása`
4. `Nevezések követése`
5. `Lebonyolítás generálása`
6. `Mérkőzések kezelése`
7. `Pénzügy lezárása`

### Első belépéskor hangsúlyos CTA

Ne az legyen, hogy `Csapat létrehozása`, hanem:

- `Új torna létrehozása`

## Mi nem kerülhet ide

Az egyszerű saját eseményszervezőből ismert elemek közül több nem lehet elsődleges a tornaszervezőnél.

Nem ez legyen a fókusz:

- egyetlen saját csapat belső tagkezelése
- baráti esemény checklistek
- egyszerű csapatleosztás
- jelenléti alapú mikropénzügy

Ezek másik szervezői úthoz tartoznak.

## Kapcsolat a többi modullal

### Csapatkapitányi oldal

A tornaszervező meghívja a csapatkapitányt, de a csapatkapitány már a saját csapatkezelő világában dolgozik tovább.

### Saját esemény szervezés

Ez külön almodul marad, nem keveredik a tornaszervezői felülettel.

### Közös mag

Közös lehet:

- auth
- meghíváskezelés
- profil
- értesítési infrastruktúra
- alap pénzügyi és kommunikációs építőkockák

## Következő fejlesztési következmények

1. külön `tornaszervező` kezdőfelület megtervezése
2. a jelenlegi admin IA és a tornaszervező IA szétválasztása
3. új entitások és adatmodell-terv előkészítése:
   - tournament
   - tournament_teams
   - tournament_registrations
   - tournament_groups
   - tournament_matches
   - tournament_fields
   - tournament_finance
4. a regisztrációs út és a munkatér összekötése a `registration_path` logikával

## Rövid összefoglaló

A tornaszervezői munkatér egy külön szervezői univerzum.

Nem a jelenlegi csapatadmin nézet kibővítése, hanem egy saját, önálló információs architektúra, amely:

- nevezésre épül
- több csapatot kezel
- lebonyolítást generál
- mérkőzéseket követ
- pénzügyet vezet
- és a platform fő üzleti fókuszát hordozza
