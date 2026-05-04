# Saját Esemény Szervezés Almodul Specifikáció

## Cél

A `Saját esemény szervezés` ne egy focira túloptimalizált, mindenre ráerőltetett eseménykezelő legyen, hanem egy közös szervezési mag, amelyre sport- és aktivitástípus szerint releváns extrák kapcsolódnak rá.

Ez az almodul a fő terméken belül a könnyebb, gyorsabban belakható szervezői ág.

Nem a torna logikáját kell ismételnie, hanem azokat a kisebb vagy közepes szervezéseket kell támogatnia, ahol:

- van időpont
- van helyszín
- van kapacitás
- van jelentkezés
- és esetenként van pénzügy

## Alapelv

A rendszer először a **közös eseménymagot** kérje be.

Utána csak azokat az extra blokkokat mutassa meg, amelyek az adott sporthoz vagy aktivitáshoz tényleg relevánsak.

### Ezért a modul két rétegből áll

1. `Közös eseménymag`
2. `Típus-specifikus kiegészítők`

## Milyen szervezők használják

Ez az almodul tartozik például ide:

- csapatsport-szervező
- egyéb szervező

Példák:

- baráti foci
- kosárlabda
- jóga
- pilates
- futóedzés
- kerékpártúra
- kirándulás

## Közös eseménymag

Ez minden saját eseménynél közös.

### Kötelező alapelemek

- esemény neve
- esemény típusa
- dátum és időpont
- helyszín
- szervezőhöz tartozó közösség vagy csoport

### Erősen ajánlott közös elemek

- rövid leírás
- maximum létszám
- minimum létszám
- jelentkezési határidő
- várólista engedélyezése

### Opcionális, de általánosan használható elemek

- díj / részvételi költség
- szabályok vagy tudnivalók
- értesítési beállítások
- ismétlődés

## A közös szervezési folyamat

Minden saját eseménynél ugyanaz az alapfolyamat:

1. esemény létrehozása
2. meghívás vagy publikálás
3. jelentkezések követése
4. szükség esetén várólista kezelése
5. esemény lezajlása
6. opcionális pénzügyi és jelenléti lezárás

Ez a közös váz, ehhez jönnek a típus-specifikus különbségek.

## Típus-specifikus ágak

## 1. Csapatsport-események

Példák:

- foci
- kosárlabda
- kézilabda
- röplabda

### Kiegészítő mezők

- pályán lévő játékosok száma
- cserék használata
- cserejátékosok száma
- csapatleosztás engedélyezése

### Opcionális sport-specifikus modulok

- kapusjelölés
- skill modul
- rangmodul
- csapatsorsolás

### UX-elv

Ne azonnal minden haladó mező jelenjen meg, hanem:

- először az alap esemény
- utána opcionális `Csapatsport beállítások`
- azon belül külön `Haladó` rész

## 2. Terem- és óratípusú események

Példák:

- jóga
- pilates
- terhes torna
- csoportos edzés

### Kiegészítő mezők

- terem vagy stúdió
- minimális résztvevőszám
- részvételi díj
- oktató vagy vezető neve
- szükséges felszerelés

### Opcionális logikák

- minimum létszám alatti figyelmeztetés
- automatikus lemondási figyelmeztetés
- költségmegosztás vagy fix díj

### UX-elv

Itt ne jelenjen meg:

- csapatleosztás
- kapusjelölés
- skill modul
- rangmodul

Mert ezek zavaróak és irrelevánsak.

## 3. Kültéri közösségi események

Példák:

- futás
- kerékpártúra
- kirándulás

### Kiegészítő mezők

- indulási pont
- érkezési pont
- táv
- nehézségi szint
- szintidő vagy tervezett időtartam
- megállók vagy etapok

### Opcionális információk

- szükséges felszerelés
- időjárási érzékenység
- útvonalterv link

### UX-elv

Ezeknél az eseményeknél a hangsúly:

- útvonalon
- időkereten
- találkozási ponton

Nem a csapatbontáson vagy a pályalogikán.

## Milyen mezők legyenek univerzális kapcsolók

Az almodulban bizonyos funkciók ne típushoz legyenek keményen beégetve, hanem kapcsolhatók legyenek.

### Javasolt kapcsolható modulok

- várólista
- pénzügy
- ismétlődés
- meghíváskezelés
- részletes tudnivalók

### Csak csapatsportos kapcsolók

- rangmodul
- skillmodul
- csapatsorsolás
- kapuslogika

## Javasolt eseménytípus-hierarchia

### 1. Főkategória

- `team_sport`
- `class_session`
- `outdoor_group`

### 2. Konkrét aktivitástípus

Példák:

- `football`
- `basketball`
- `yoga`
- `pilates`
- `running`
- `cycling`
- `hiking`
- `other`

Ez azért fontos, mert a közös logika a főkategórián múlik, a finomhangolás pedig a konkrét típustól függ.

## A felület javasolt szerkezete

## Saját esemény szervező főmenü

Javasolt főmenük:

1. `Kezdőlap`
2. `Események`
3. `Résztvevők` vagy `Csapat`
4. `Pénzügy`
5. `Beállítások`

## Esemény létrehozása - ajánlott lépések

### 1. Alapok

- esemény neve
- kategória
- konkrét típus
- dátum
- helyszín

### 2. Létszám és részvétel

- minimum létszám
- maximum létszám
- várólista
- jelentkezési határidő

### 3. Típus-specifikus rész

Például:

- csapatsport-blokk
- óratípus-blokk
- kültéri eseményblokk

### 4. Opcionális modulok

- pénzügy
- ismétlődés
- értesítések

### UX-elv

Az adott típushoz nem tartozó blokkok ne legyenek láthatók.

## Mi tartozik ide és mi nem

## Ide tartozik

- saját események
- rendszeres alkalmak
- kisebb közösségi sport- és mozgásesemények
- meghívásos vagy jelentkezéses részvétel

## Nem ide tartozik

- többcsapatos torna
- csoportkör
- kieséses ág
- pálya- és meccsbeosztási logika
- tornaeredmények és tornatáblák

Ez már a `Tornaszervezés` főmodul világa.

## Adatmodell-javaslat

Az eseményekhez hosszabb távon érdemes különválasztani:

### Közös mezők

- `event_category`
- `event_type`
- `max_participants`
- `min_participants`
- `waitlist_enabled`
- `registration_deadline`

### Csapatsportos kiegészítők

- `players_on_field_total`
- `substitutes_enabled`
- `substitutes_count`
- `draw_enabled`

### Óratípusú kiegészítők

- `instructor_name`
- `required_equipment`
- `room_cost_mode`

### Kültéri esemény kiegészítők

- `start_location`
- `end_location`
- `distance_km`
- `difficulty_level`
- `route_notes`

## A jelenlegi rendszerhez kapcsolódó visszabontási döntések

### Maradhat

- esemény alap CRUD
- jelentkezés
- várólista
- naptár export
- helyszín és időpont logika

### Csak csapatsportos ágban maradjon

- csapatleosztás
- rangmodul
- skillmodul
- kapuslogika
- pályán lévő játékosok mező
- csere mezők

### Újra kell gondolni

- a jelenlegi közös eseményűrlap
- a pénzügyi blokkok pozíciója
- az admin oldali minden-egyben eseményszerkesztés

## Következő implementációs lépések

1. a jelenlegi eseményűrlap mezőinek osztályozása:
   - közös mag
   - csapatsportos extra
   - kivezetendő vagy későbbi
2. `event_category` és `event_type` bevezetési terv
3. a frontend eseménylétrehozó flow újrarajzolása
4. a `Csapatsport-szervező` és `Egyéb szervező` kezdőélmény különválasztása

## Rövid összefoglaló

A `Saját esemény szervezés` almodul nem focis különtermék, hanem egy közös eseményszervező motor.

Ebben:

- van egy univerzális eseménymag
- vannak relevancia alapján megjelenő extra blokkok
- és minden, ami többcsapatos, lebonyolítás-vezérelt torna, az már nem ide, hanem a `Tornaszervezés` főmodulba tartozik
