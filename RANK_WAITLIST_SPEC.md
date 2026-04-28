# Rank Modul Kiegeszites Spec

Ez a dokumentum a jelenlegi rang alapu jelentkezesi sav-logika ket tovabbi kiegesziteset irja le:

1. korai savnyitas, ha a magasabb rangsav mar "kifutott"
2. jelentkezes engedese a savkorlatozas ellenere, kulon rangvarolistaval

Celpont:

- a user ne falba utkozzon
- a szervezo lassa a valos erdeklodest
- a rangmodul maradjon rendezesi logika, ne buntetesnek erzodjon
- a jelenlegi 72 oras hullamlogika es a 3 oras villamesemeny-kivetel maradjon ervenyben

## 1. Jelenlegi alaplogika

A jelenlegi rendszer:

- csapatszinten be- es kikapcsolhato rank modult hasznal
- a user effektive rankja alapjan jelentkezesi savot szamol
- egyes rangokhoz idobeli kesleltetes tartozik, pl. 72 ora
- 3 oran belul kezdo esemenynel nincs kesleltetes

Ez jo alap, de ket gyakorlati problema maradt:

- ha a magasabb rangsavu jatekosok mar mind reagaltak, a rendszer akkor is varhat feleslegesen
- az alacsonyabb savban levo user teljesen blokkolva van, a szervezo nem latja az erdeklodeset

## 2. Uj uzleti cel

A rank modul a jovoben ne csak "enged / tilt" logika legyen, hanem:

- savonkent priorizaljon
- de kozben gyujtse be a korai erdeklodest is
- es dinamikusan tudjon korabban nyitni, ha a magasabb sav mar lefutott

## 3. Uj regisztracios statuszok

Javasolt statuszok:

- `going`
- `waiting_list_capacity`
- `waiting_list_rank`
- `cancelled`

Magyar megfeleltetes:

- `going`: jelentkezett
- `waiting_list_capacity`: letszam miatt varolistan van
- `waiting_list_rank`: rank sav miatt elojelentkezett / rankvarolistan van
- `cancelled`: lemondta

Megjegyzes:

- a jelenlegi `waiting_list` statuszt erdemes ket logikai okra bontani
- UX-ben ez fontos, mert mas oka van a varakozasnak

## 4. Korai savnyitas szabaly

### Alapszabaly

Ha a jelenleg nyitott, magasabb prioritasu rangsav minden relevans tagja mar reagalt, a kovetkezo rangsav azonnal megnyithato.

### "Mar reagalt" definicio

Egy user reakcionak szamit, ha az adott esemenyre:

- `going`
- `waiting_list_capacity`
- `waiting_list_rank`
- `cancelled`

statuszba kerult

Nem szamit reagalasnak:

- ha nincs semmilyen regisztracioja az esemenyhez

### "Relevans tag" definicio

Csak az szamit bele az adott savba, aki:

- aktiv csapattag
- nem archived / inactive
- az esemeny idopontjaban ervenyesen a csapathoz tartozik

### Pelda

Csapat letszam: 20 fo

Magas sav:

- 10, 9, 8-as rank
- osszesen 7 fo

Ha a 7 fobol mar mindenkinek van valamilyen reakcioja, akkor:

- nem kell megvarni a teljes 72 oras savveget
- a 7, 6, 5 rank csoport azonnal nyithato

## 5. Rank-varolista szabaly

### Alapszabaly

Ha a user sajat rank sava meg nem nyilt meg, attol meg jelentkezhessen.

Ilyenkor:

- ne foglaljon azonnal helyet
- de latszodjon a szervezo es a tobbi user szamara is
- kapjon kulon statuszt: `waiting_list_rank`

### Mit jelent ez a gyakorlatban

Ha a user:

- rank miatt meg nem jogosult normal jelentkezesre
- de megnyomja a `Jelentkezem` gombot

akkor:

- letrejon a regisztracio
- statusza `waiting_list_rank`
- sorrendet kap `registered_at` szerint

### Miben kulonbozik a normal varolistatol

`waiting_list_capacity`:

- a user rank szempontbol mar jogosult
- de nincs szabad hely

`waiting_list_rank`:

- a user rank szempontbol meg nem jogosult
- ezert egyelore nem kerulhet be a normal `going` vagy letszam-varolista sorba

## 6. Automatikus atmozgas szabalyok

### 6.1 Rank sav megnyilik

Ha a user rank sava megnyilik, akkor a `waiting_list_rank` statuszu userek kozul a legrégebben jelentkezettek automatikusan atkerulnek.

Atkerules szabaly:

1. ha van szabad hely -> `going`
2. ha nincs szabad hely -> `waiting_list_capacity`

### 6.2 Korai savnyitas miatt nyilik meg

Ugyanez ervenyes akkor is, ha nem az ido telt le, hanem a magasabb sav kifutott.

### 6.3 Kapacitas kozben valtozik

Ha valaki lemond es felszabadul hely:

1. eloszor a mar jogositott `waiting_list_capacity` userek kozul kell feltolteni
2. utana a frissen megnyilt `waiting_list_rank` userek johetnek at

### 6.4 Event betelik

Ha a rankvarolistas user sava megnyilik, de kozben az esemeny mar betelt:

- ne vesszen el a jelentkezese
- keruljon at `waiting_list_capacity` statuszba

## 7. UI / UX javaslat

## User oldal

Ha a user rank miatt meg nem normalisan jogosult:

- a gomb maradjon meg: `Jelentkezem`
- a gomb melletti info mondja el, hogy most rankvarolistara kerul

Felirat-javaslat:

- `A csapatkapitany rangsavos jelentkezest hasznal. A jelenlegi rangoddal most meg csak elojelentkezni tudsz. Ha megnyilik a savod, automatikusan bekerulsz a megfelelo sorrendbe.`

Visualis badge:

- `rankvarolista`

Kulonbozo badge-ek:

- `jelentkezett`
- `varolista`
- `rankvarolista`
- `lemondta`

### User reszletes nezet

Kulon szoveg kell:

- miert nem finalis meg a jelentkezes
- mikor nyilik meg a sava
- vagy hogy korabban megnyilt, mert a magasabb sav mar kifutott

## Admin oldal

Az admin resztvevolistan kulon csoportok vagy badge-ek:

- `Going`
- `Varolista`
- `Rankvarolista`
- `Lemondta`

Adminnak kulon osszesitok:

- hanyan jogosultak mar
- hanyan vannak rankvarolistan
- hany magasabb rangsavu tag nem reagalt meg

## Publikus / user lathatosag

Igen, a tobbiek is lathassak, hogy a user "jelentkezett", de kulon jelolve:

- ne tunjon ugy, mintha mar rendes jelentkezo lenne
- de az erdeklodes legyen lathato

## 8. Javasolt adatmodell

Lehetoseg A:

- boviteni a jelenlegi `event_registrations.registration_status` mezot

Uj ertekek:

- `going`
- `waiting_list_capacity`
- `waiting_list_rank`
- `cancelled`

Ez a legegyszerubb irany.

Lehetoseg B:

- megtartani a jelenlegi statuszt
- es kulon `queue_reason` mezot hozzaadni

Ertekek:

- `capacity`
- `rank`

Ez adatmodellileg tisztabb lehet, de UX-ben bonyolultabb.

Elso korre en ezt ajanlom:

- `registration_status` bovites kulon rank-wait statuszra

## 9. Javasolt backend folyamat

### Register endpoint

Ha user jelentkezik:

1. ellenorizd az esemeny altalanos jelentkezesi felteteleit
2. ellenorizd, hogy a rank sava megnyilt-e
3. ha igen:
   - szabad hely eseten `going`
   - kulonben `waiting_list_capacity`
4. ha nem:
   - `waiting_list_rank`

### Promotion endpoint / automatikus folyamat

Minden olyan muvelet utan fusson:

- uj jelentkezes
- lemondas
- esemeny frissites
- savnyitas idobeli tick vagy ujralekerdezes

A folyamat:

1. nezd meg, mely savok vannak nyitva
2. nezd meg, van-e magasabb sav, ami mar kifutott
3. szamold ujra a tenyleges jogosultsagi hatart
4. mozgasd at a `waiting_list_rank` usereket:
   - helyre `going`
   - kulonben `waiting_list_capacity`

## 10. Edge case-ek

### User lemond rankvarolistabol

Igen, lemondhassa.

Statusz:

- `cancelled`

### User ujra jelentkezik

A jelenlegi lemondasi limit szabaly erre is hasson.

Tehat:

- a rankvarolistas jelentkezes lemondasa is beleszamithat a limitbe

Ez kulon dontest igenyel.

En elso korre ezt javaslom:

- igen, szamitson bele
- kulonben a limit konnyen kijatszhato

### Admin manualisan beteszi

Admin tudjon override-olni kesobb, de ez ne legyen az MVP resze.

### Event status valtozas

Ha az esemeny mar nem `published`:

- minden nyitott rankvarolistas mozgas alljon meg

## 11. Javasolt MVP fazisok

### Fazis 1

- `waiting_list_rank` statusz bevezetese
- UI badge-ek
- user tudjon rankkorlatozas ellenere elojelentkezni
- automatikus atkerules, ha a sav rendes idoben megnyilik

### Fazis 2

- korai savnyitas, ha a magasabb sav mar teljesen reagalt

### Fazis 3

- admin dashboard statok
- pontosabb szervezoi vizualizacio
- opcionális admin override

## 12. Vegso ajanlas

Igen, ennek van ertelme.

Sot termek szempontbol jobb, mint a jelenlegi teljes tiltasi modell, mert:

- emberszerubb
- jobb szervezoi ralatast ad
- tobb valos szandekot gyujt be
- a rangmodult kevesbe bunteteskent, inkabb rendezesi logikakent mutatja

Ajánlott bevezetesi sorrend:

1. `waiting_list_rank`
2. kulon UI megkulonboztetes
3. automatikus atmozgas
4. korai savnyitas
