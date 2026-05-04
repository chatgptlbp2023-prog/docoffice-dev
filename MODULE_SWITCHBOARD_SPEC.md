# Moduláris Kapcsolótábla Specifikáció

## Cél

A rendszer ne egy kész, mindent egyszerre ráöntő adminfelület legyen, hanem egy olyan platform, ahol:

- van közös alapműködés
- vannak kapcsolható extrák
- és a modulok relevancia alapján jelennek meg

Ez a dokumentum rögzíti a kapcsolótábla logikáját.

## Alapelv

Minden szervezői útvonalnál három rétegben kell gondolkodni:

1. `Kötelező alap`
2. `Ajánlott kapcsolható modul`
3. `Haladó vagy csak bizonyos típusnál értelmezett modul`

Ez azért fontos, mert:

- az új user ne vesszen el
- a haladó user ne érezze szűknek a rendszert
- a platform ne legyen túlzsúfolt

## A kapcsolótábla helye a rendszerben

A kapcsolótábla nem egy technikai beállítási oldal mellékes része, hanem a szervezői élmény egyik fő eleme.

### Hol jelenjen meg

#### 1. Regisztráció után, onboarding közben

Első körben csak a releváns, legfontosabb modulokkal.

#### 2. A saját munkatér `Beállítások` vagy `Modulok` részében

Itt már teljesebb kapcsolótábla jelenhet meg.

#### 3. Bizonyos modulok eseményszinten is finomhangolhatók lehetnek

Például:

- pénzügy
- várólista
- ismétlődés

## Közös alapmodulok

Ezek nem kapcsolhatók ki, mert a rendszer alapműködéséhez tartoznak.

### Platformszintű alapok

- auth
- profil
- meghívás infrastruktúra
- értesítési alapok
- alap jogosultsági modell

### Saját esemény szervezés alapszint

- esemény létrehozása
- időpont
- helyszín
- jelentkezés

### Tornaszervezés alapszint

- torna létrehozása
- csapatkapitány-meghívás
- nevezések kezelése

## Kapcsolható modulok - közös logika szerint

Az alábbi modulok azok, amelyeket a usernek vagy a szervezői típus alapján automatikusan javaslunk, vagy ő maga be- és kikapcsolhat.

## 1. Várólista

### Mire való

Túljelentkezés vagy létszámkorlát kezelése.

### Kinek releváns

- csapatsport-szervező
- egyéb szervező

### Tornaszervezőnél

Nem elsődleges modul, mert ott a nevezéslogika más.

### Alapértelmezés

- csapatsportnál: `bekapcsolva`
- óratípusú vagy kültéri eseménynél: `ajánlott`

## 2. Pénzügy

### Mire való

Részvételi díj, költségek, befizetések, egyenlegek nyomon követése.

### Kinek releváns

- csapatsport-szervező
- egyéb szervező
- tornaszervező

### Fontos különbség

Ez nem egyetlen modul, hanem közös név alatti eltérő működés:

- saját esemény pénzügy
- torna pénzügy

### Alapértelmezés

- csapatsportnál: `kikapcsolva`, de ajánlott
- óratípusú vagy költséges eseménynél: `erősen ajánlott`
- tornaszervezőnél: `bekapcsolva`

## 3. Kommunikáció

### Mire való

Szervező és résztvevők közti strukturált kommunikáció.

### Kinek releváns

- minden szervezői típusnak

### Lehetséges részei

- meghívóüzenetek
- szervezői közlemények
- csapatszintű chat később

### Alapértelmezés

- alap értesítési szinten: `bekapcsolva`
- haladó chat vagy belső kommunikáció: `későbbi kapcsolható modul`

## 4. Statisztika

### Mire való

Összesített visszanézés, trendek, szervezői rálátás.

### Kinek releváns

- csapatsport-szervező
- tornaszervező
- egyéb szervezőnél opcionális

### Alapértelmezés

- csapatsportnál: `kikapcsolva`, de ajánlott
- tornaszervezőnél: `bekapcsolva`
- egyéb szervezőnél: `opcionális`

## 5. Ismétlődés

### Mire való

Rendszeres alkalmak vagy eseménysorozatok kezelése.

### Kinek releváns

- csapatsport-szervező
- egyéb szervező

### Alapértelmezés

- csapatsportnál: `ajánlott`
- jóga / pilates / csoportos edzés jellegnél: `erősen ajánlott`
- tornaszervezőnél: nem eseményszintű elsődleges modul

## Csak csapatsportos modulok

Az alábbi modulok csak akkor jelenjenek meg, ha a szervező típusa és az esemény típusa valóban indokolja.

## 6. Rangmodul

### Mire való

Időablakos vagy sávos jelentkezési előny kezelése.

### Kinek releváns

- kizárólag csapatsport-szervező

### Alapértelmezés

- `kikapcsolva`

### Megjelenés

Ne az első onboardingban jelenjen meg hangsúlyosan.
Inkább:

- `Haladó csapatsport modulok`

## 7. Skillmodul

### Mire való

Kiegyensúlyozottabb csapatleosztás.

### Kinek releváns

- kizárólag csapatsport-szervező

### Alapértelmezés

- `kikapcsolva`

## 8. Csapatsorsolás

### Mire való

Jelentkezők két vagy több csapatba rendezése.

### Kinek releváns

- csapatsport-szervező
- különösen foci, kosárlabda, hasonló sportok

### Alapértelmezés

- `kikapcsolva`, de sporttípus szerint ajánlott

## 9. Kapuslogika

### Mire való

Kapusjelölés és kapusalapú csapatképzés.

### Kinek releváns

- jellemzően csak foci vagy kézilabda jellegű eseményeknél

### Alapértelmezés

- `kikapcsolva`

## Csak tornaszervezői modulok

## 10. Nevezéskezelés

### Mire való

Csapatnevezések, nevezési státuszok, hiányzó keretek kezelése.

### Alapértelmezés

- `bekapcsolva`

## 11. Lebonyolítás

### Mire való

Csoportkör, kieséses ág, pályák, idősávok.

### Alapértelmezés

- `bekapcsolva`

## 12. Mérkőzéskezelés

### Mire való

Meccslista, eredményrögzítés, hiányzó eredmények kezelése.

### Alapértelmezés

- `bekapcsolva`

## 13. Torna pénzügy

### Mire való

Nevezési díjak, költségek, tornaegyenleg.

### Alapértelmezés

- `bekapcsolva`

## 14. Torna statisztika

### Mire való

Tabellák, góllövőlista, asszisztok, tornaösszesítések.

### Alapértelmezés

- `bekapcsolva`

## Csak egyéb szervezőknél releváns modulok

## 15. Minimum létszám figyelés

### Mire való

Annak jelzése, hogy egy óra vagy esemény csak bizonyos létszám felett éri meg.

### Kinek releváns

- jóga
- pilates
- csoportos teremórák

### Alapértelmezés

- `ajánlott`

## 16. Útvonal és etapok

### Mire való

Kültéri, mozgásalapú események szervezéséhez.

### Kinek releváns

- futás
- kerékpártúra
- kirándulás

### Alapértelmezés

- `kikapcsolva`, de típus szerint ajánlott

## Modulmegjelenési szabályok

## 1. Ne mutassunk irreleváns modult

Példák:

- jógánál ne jelenjen meg csapatsorsolás
- futásnál ne jelenjen meg kapuslogika
- tornaszervezőnél ne jelenjen meg csapaton belüli rank modul

## 2. Ne mutassunk túl sok modult egyszerre

Az első belépéskor legfeljebb 2-3 kapcsolható extra jelenjen meg.

## 3. A kapcsolók ne legyenek technikaiak

Ne ezt lássa a user:

- `rank engine`
- `skill mode`

Hanem ezt:

- `Elsőbbségi jelentkezési sávok`
- `Kiegyensúlyozott csapatleosztás`

## 4. A rendszer javasoljon

Ne csak üres kapcsolólistát adjon, hanem típus alapján mondja:

- `Ehhez az eseménytípushoz ezt ajánljuk`

## Ajánlott alapbeállítások szervezőtípus szerint

## Tornaszervező

### Alapból aktív

- nevezéskezelés
- lebonyolítás
- mérkőzéskezelés
- torna pénzügy
- torna statisztika
- kommunikáció

### Nem releváns vagy külön világ

- rank modul
- skill modul
- csapatsorsolás
- kapuslogika

## Csapatsport-szervező

### Alapból aktív

- esemény létrehozása
- jelentkezés
- meghíváskezelés

### Ajánlott kapcsolók

- várólista
- ismétlődés
- pénzügy

### Haladó kapcsolók

- rangmodul
- skillmodul
- csapatsorsolás
- kapuslogika
- statisztika

## Egyéb szervező

### Alapból aktív

- esemény létrehozása
- jelentkezés
- meghíváskezelés

### Ajánlott kapcsolók

- várólista
- pénzügy
- ismétlődés
- minimum létszám figyelés

### Típusfüggő kapcsolók

- útvonal és etapok
- részletes felszerelés-információ

## UI-javaslat a kapcsolótáblára

## 1. Egyszerű, emberi nyelvű kártyák

Ne táblázatban jelenjen meg elsőre, hanem kapcsolókártyákon:

- cím
- rövid magyarázat
- `Be / Ki`

## 2. Szakaszolt megjelenés

### Első szint

- alapmodulok
- 2-3 ajánlott extra

### Második szint

- haladó modulok

## 3. Típus szerinti ajánlás

Példák:

- `Focihoz ajánlott`
- `Jógafoglalkozáshoz ajánlott`
- `Tornaszervezői alapmodul`

## Jövőbeli implementációs következmények

1. modul-nyilvántartási séma megtervezése
2. szervezőtípus alapú defaultok rögzítése
3. event type alapú láthatósági szabályok kialakítása
4. a jelenlegi UI-ból a modulok címkézése és kiszervezése

## Rövid összefoglaló

A moduláris kapcsolótábla lényege:

- legyen közös alap
- csak a releváns extrák jelenjenek meg
- a rendszer javasoljon, de ne erőltessen
- és a modulok megjelenése a szervező típusától és az esemény típusától függjön
