# Admin Felulet Ujraszervezes

## Cel

Az admin felulet ne egyetlen, tulterhelt dashboard legyen, hanem egy konnyen ertheto, lepesenkent kovetheto rendszer.

Az uj admin elmeny fo elvei:

- egy kepernyon egyszerre csak egy fo feladattal kelljen foglalkozni
- az uj csapatkapitany 1-2 perc alatt ertse meg, mi az elso lepese
- a rendszer vezesse vegig a csapatepites, esemenyszervezes es elszamolas folyamaton
- a halado funkciok ne nyomjak el a kezdo elmenyt

## Uj Fo Menuszerkezet

Az admin oldalt 4 fo menure kell bontani:

1. `Kezdolap`
2. `Csapat`
3. `Esemenyek`
4. `Penzugy`

Kesesobb opcionisan:

- `Ertesitesek`
- `Beallitasok`

## 1. Kezdolap

### Cel

Az admin nyitooldal ne szerkesztofelulet legyen, hanem iranyitopult.

Itt az admin azt latja:

- mi a kovetkezo teendo
- hol tart a csapat setupja
- milyen kozelgo esemeny van
- van-e valami surgos tennivalo

### Tartalom

#### A. Setup checklist

Pipalhato blokk:

1. `Csapat letrehozva`
2. `Csapatadatok beallitva`
3. `Jatekosok meghivva`
4. `Elso esemeny letrehozva`
5. `Jelentkezes megnyitva`
6. `Csapatleosztas elkeszitve`
7. `Esemeny lezarva es elszamolva`

Minden sorhoz egy rovid akcio:

- `Megnyitas`
- `Folytatas`
- `Megnezem`

#### B. Kovetkezo teendo kartya

Egyetlen hangsulyos kartya:

- `Kovetkezo ajanlott lepes`
- pelda: `Meg nem hivtal meg jatekosokat a csapatba`
- CTA: `Jatekosok meghivasa`

#### C. Aktiv esemeny fokusz

Ha van kozelgo esemeny:

- cim
- idopont
- jelentkezett letszam
- szabad hely
- csapatleosztas allapota
- gyorsgomb: `Esemeny megnyitasa`

#### D. Figyelmeztetesek

Kulon blokk:

- varolistas jatekosok vannak
- egyes jatekosok no-show jelolest kaptak
- esemeny megvalosult, de nincs lezarva
- esemeny elszamolasra var

### Mit NEM kell itt mutatni

- teljes esemenylista
- teljes taglista
- teljes penzugyi tabla
- halado rank/skill beallitasok reszletei

## 2. Csapat Menu

### Cel

Itt tortenjen minden, ami a csapat felepitesehez es karbantartasahoz tartozik.

### Almenu

#### 2.1 Csapat alapok

- csapatnev
- csapat azonosito
- mentes

#### 2.2 Tagok

- aktiv tagok listaja
- szerepkorok
- kapusnak jelolve
- rang
- skill alapadatok

Elsoleges CTA:

- `Tag meghivasa`

#### 2.3 Meghivasok

- fuggo meghivasok
- elfogadott / lejart / visszavont meghivasok
- uj meghivo letrehozasa

#### 2.4 Halado csapatbeallitasok

Ide keruljen:

- rank modul ON/OFF
- skill modul ON/OFF
- automatikus csapatleosztas logika
- ertesitesi defaultok

Ez az almenu alapbol lehet osszecsukva vagy `Halado` badge-del jelolve.

### UX elv

A `Csapat` menu az onboardingban koran jon, mert ez az elso valodi setup terulet.

## 3. Esemenyek Menu

### Cel

Itt tortenjen minden, ami a meccsek megszervezesehez kapcsolodik.

### Almenu

#### 3.1 Uj esemeny

Kulon tiszta kepernyo:

- esemeny letrehozas / szerkesztese
- helyszin
- letszam
- csere
- ismetlodes
- dijazas
- ertesitesi opciok

Elsoleges CTA:

- `Esemeny letrehozasa`

#### 3.2 Kozelgo esemenyek

Lista a kozelgo esemenyekrol:

- publikalt
- piszkozat
- jelentkezesi allapot
- letszam
- megnyitas / szerkesztes

#### 3.3 Kivalasztott esemeny

Kulon reszletes munkater:

- jelenlegi statusz
- jelentkezok
- varolista
- reszletek
- csapatleosztas
- weather
- naptar linkek

#### 3.4 Lezart esemenyek

Kulon csoport:

- megvalosult, de meg nem lezart
- finished esemenyek
- attendance / no-show kezeles

### UX elv

Az `Esemenyek` menu legyen a legaktivabb szervezoi munkahely.

Ne legyen ugyanazon a kepernyon egyszerre:

- csapat setup
- tagkezeles
- penzugyi osszesito
- uj esemeny form
- attendance admin

Hanem ezek keruljenek kulon alnezetekbe.

## 4. Penzugy Menu

### Cel

Itt jelenjen meg minden, ami elszamolashoz es befolyt penzhez kapcsolodik.

### Almenu

#### 4.1 Esemény elszamolas

Lezart vagy megvalosult esemenyek sorai:

- esemeny neve
- idopont
- helyszin
- fejpénz osszesen
- alapdij osszesen
- befolyt osszesen
- elteres

#### 4.2 Csapat kassza osszesito

Felso osszegzett sorok:

- fejpénz osszesen
- alapdij osszesen
- befolyt osszesen
- elteres osszesen

#### 4.3 Konyvelesre varo esemenyek

Kulon blokk:

- megvalosult, de meg nincs lezarva
- lezarva, de nincs attendance rogzitve
- attendance rogzitve, de nincs penzugyi sor ellenorizve

### UX elv

A penzugyet ne keverjuk az esemeny letrehozassal.

Az adminnak mashogy kell gondolkodnia:

- esemeny szervezes kozben
- es esemeny utani elszamolas kozben

Ezert kell kulon menu.

## Kezdo Onboarding Flow

Az elso belepeskor egy rovid, 5-7 lepeses tutorial induljon.

### Lepesek

1. `Udvozles`
2. `Csapat letrehozasa`
3. `Tagok meghivasa`
4. `Elso esemeny letrehozasa`
5. `Jelentkezesek kezelese`
6. `Esemeny lezarasa`
7. `Elszamolas`

### Forma

Nem hosszu onboarding oldal kell, hanem:

- spotlight
- 1 mondatos magyarazat
- `Tovabb`
- `Kihagyom`

### Pelda szovegek

#### Udvozles

`Itt fogod vegigvinni a csapat szervezeset az elso meghivastol az elszamolasig.`

#### Csapat

`Itt hivsz meg jatekosokat es allitod be a csapat alapmukodeset.`

#### Esemenyek

`Itt hozod letre a kovetkezo focit, es koveted a jelentkezeseket.`

#### Penzugy

`Itt zarod le az esemenyek utan a jelenletet es a befolyt osszegeket.`

## Dashboard Vezérfonal Logika

Az uj admin `Kezdolap` mindig egy ajanlott kovetkezo lepest adjon.

### Döntési sorrend

1. Ha nincs csapat:
   - `Hozd letre az elso csapatodat`
2. Ha van csapat, de nincs aktiv tag:
   - `Hivj meg jatekosokat`
3. Ha vannak tagok, de nincs esemeny:
   - `Hozd letre az elso esemenyt`
4. Ha van draft esemeny:
   - `Publikald az elso esemenyt`
5. Ha van kozelgo, de nincs csapatleosztas:
   - `Keszits csapatleosztast`
6. Ha van megvalosult, de nem lezart esemeny:
   - `Zard le az esemenyt`
7. Ha van lezart, de nem elszamolt esemeny:
   - `Konyveld a befizeteseket`

## Kezdo Es Halado Mod

Javasolt egy egyszeru szuro:

- `Egyszeru mod`
- `Halado mod`

### Egyszeru mod

- onboarding checklist
- kevesebb kartya
- csak a kovetkezo lepes
- rank/skill/halado modulok osszecsukva

### Halado mod

- teljes admin kontroll
- osszes blokk lathato
- gyors eleres minden modulhoz

## Atalakitas Fejlesztesi Sorrend

### Fazis 1

- admin menu strukturaja: `Kezdolap / Csapat / Esemenyek / Penzugy`
- uj admin routing / view valtas

### Fazis 2

- Kezdolap checklist
- kovetkezo teendo kartya
- alap figyelmeztetesek

### Fazis 3

- Csapat oldal szetbontasa
- tagok / meghivasok / halado beallitasok kulon nezetekbe

### Fazis 4

- Esemenyek oldal szetbontasa
- kulon `Uj esemeny`, `Kozelgo`, `Lezart`

### Fazis 5

- Penzugy oldal veglegesitese
- lezart esemenyek tablaja
- csapatszintu osszesites

### Fazis 6

- onboarding tutorial
- egyszeru/halado mod

## Vegso Javaslat

Nem a funkciokat kell visszavagni, hanem az informaciot kell retegzetten megmutatni.

Az uj admin elmeny kulcsa:

- kulon menu alapu munkaterek
- egyertelmu kovetkezo lepes
- kezdo onboarding
- kevesebb zaj egy kepernyon

Ez adja azt az erzest, hogy a rendszer:

- tanithato
- gyorsan atlathato
- es szervezokent vezetett

