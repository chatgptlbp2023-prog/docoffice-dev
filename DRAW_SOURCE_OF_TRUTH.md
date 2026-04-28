# Draw source of truth

Ez a dokumentum a jelenlegi frontend draw-megjelenítés egyetlen érvényes szabályrendszerét rögzíti.

## 1. Admin oldal
Az admin oldalon a látható csapatleosztás forrása mindig ez a sorrend:
1. aktuális preview (`state.teamDrawPreview`)
2. mentett draw (`state.adminSavedEventDraw`)

Következmény: ha van friss preview, annak kell látszania a korábbi mentett draw helyett.

## 2. User oldal
A user oldal soha nem preview-t jelenít meg.
A user oldali forrás kizárólag a mentett draw (`state.savedEventDraw`).

## 3. Mentés
A mentés elsődlegesen a látható preview-t küldi fel a backendnek.
Ha nincs preview, a backend fallback logikája maradhat érvényben.

## 4. Mentés utáni állapot
Sikeres mentés után:
- a preview törlődik
- az admin mentett draw frissül
- ha ugyanaz az esemény van nyitva user oldalon is, a user mentett draw is frissül

## 5. Tiltott állapotok
Nem megengedett:
- hogy a user oldal preview-ból éljen
- hogy a mentés mást rögzítsen, mint amit az admin látott
- hogy a mentett draw láthatósága lokális preview-tól függjön
