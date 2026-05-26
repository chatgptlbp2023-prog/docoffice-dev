# Moduláris tesztcsomagok

Az alkalmazás főmoduljai külön is futtatható tesztcsomagot kaptak, hogy gyorsan lásd, pontosan melyik üzleti terület tört el.

## Rang modul

Parancs:

```bash
npm run test:module:rank
```

Mit ellenőriz:

- rang miatti időkorlátos jelentkezés
- 72 órás hullám viselkedés
- 3 órán belüli villám esemény kivétel
- frontend tájékoztató és visszaszámláló megjelenés

## Skill + csapatleosztás modul

Parancs:

```bash
npm run test:module:skill
```

Mit ellenőriz:

- skill beállítások
- kapuslogika
- preview / save / publish draw státuszok
- stale logika
- admin és user oldali csapatleosztás megjelenés

## Kassza / jelenlét modul

Parancs:

```bash
npm run test:module:cash
```

Mit ellenőriz:

- jelenléti ív rögzítése
- no-show jelölés
- befizetés könyvelése
- megvalósult, de még nem lezárt esemény auto-lezárása első mentéskor
- pénzügyi sor és kassza összesítő megjelenése

## Teljes szervezői folyamat

Parancs:

```bash
npm run test:flow:organizer
```

Mit ellenőriz:

1. szervező regisztráció
2. csapat létrehozása
3. tagok hozzáadása
4. esemény létrehozása
5. jelentkezések
6. csapatleosztás preview / mentés / publikálás
7. esemény megvalósítása
8. jelenlét és befizetés könyvelése
9. pénzügyi összesítők visszaolvasása

## Modulcsomagok együtt

Parancs:

```bash
npm run test:modules
```

Ez egymás után lefuttatja az összes fő modul külön tesztcsomagját.

## Pilot smoke / regressziós csomag

Parancs:

```bash
npm run test:pilot
```

Mikor használd:

- élesítés előtt
- nagyobb user dashboard, auth, invite, esemény vagy kassza módosítás után
- production env beállítások előtt utolsó lokális ellenőrzésként

Mit ellenőriz:

- auth és health check alapok
- regisztrációs belépési utak és login utáni routing
- csapatmeghívók és meghívó elfogadása
- eseményre jelentkezés és várólista alapok
- teljes szervezői flow
- esemény email értesítések és email action linkek
- időjárás szolgáltatás alaplogika
- frontend auth / user dashboard kritikus viselkedések
- frontend kassza / no-show / befizetés kritikus viselkedések
