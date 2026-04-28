# App.js bontás - 2. pont
Ez a patch viselkedésváltozás nélkül bontja szét a korábbi egyfájlos public/app.js-t több, sorrendben betöltött scriptre.

## Fájlok
- `app-core.js`: sorok 1-671 — Alap state, DOM referenciák, utilok, countdown és közös render segédek.
- `app-session.js`: sorok 672-965 — Session, auth, csapat- és meghívóbetöltés, user/admin overview és team-summary mag.
- `app-team-admin.js`: sorok 966-2121 — Team/admin műveletek, skill modul, draw kezelő admin blokk, create/edit team-event admin flow.
- `app-events.js`: sorok 2122-2512 — Eseménylista, admin/user event detail, saved draw betöltés és esemény műveletek.
- `app.js`: sorok 2513-2636 — Init és event binding; ezt hagyjuk belépési fájlnak.

## Fontos szabály
- A script tagek sorrendje nem cserélhető fel.
- A működő baseline megtartása volt a cél, nem új logika.
- Minden további frontend patchnél a legkisebb érintés elvét kell követni.
