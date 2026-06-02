# Prestart automatika production ellenorzes

Az `Automatikus csapatleosztas 1 oraval kezdes elott` funkcio nem folyamatos backend timerrel fut, hanem kulso production scheduler/cron hivja meg.

## Parancsok

Dry-run, ellenorzes adatbazis-iras es emailkuldes nelkul:

```bash
npm run check:prestart
```

Tenyleges feldolgozas:

```bash
npm run process:prestart
```

Deterministikus ellenorzes adott idoponttal:

```bash
node src/tools/processPrestartEventAutomation.js --dry-run --now=2026-05-28T16:00:00.000Z
```

## Production utemezes

Javasolt cron: 5 percenkent.

```cron
*/5 * * * * cd /app && npm run process:prestart
```

Render/Railway/Fly/VPS kornyezetben ennek megfelelo scheduled jobot kell beallitani. A schedulernek ugyanazt a production env-et kell latnia, mint a backendnek, kulonosen:

- `DATABASE_URL` vagy a `DB_*` adatbazis beallitasok
- email kuldeshez szukseges SMTP env-ek
- ido- es lokaciofuggo modulokhoz szukseges kulcsok, ha ezek aktivak

## Mit dolgoz fel

Egy esemeny akkor kerul bele a prestart ablakba, ha:

- `events.status = 'published'`
- az esemeny kezdese a kovetkezo 1 oraban van
- `event_settings.auto_prestart_processed_at` meg ures
- a notification preferences alapjan legalabb az egyik prestart automatika aktiv:
- `enableAutoTeamDrawOneHourBefore = true`
- vagy `notifyWeatherAlerts = true`

Ha az automatikus csapatleosztas aktiv:

- elegendo going letszam eseten menti es kihirdeti a csapatleosztast
- minimum letszam alatt lemondja az esemenyt
- sikeres feldolgozas utan kitolti az `auto_prestart_processed_at` es `auto_prestart_outcome` mezoket

## Duplafutas elleni vedelem

A service esemenyenkent PostgreSQL advisory lockot hasznal, majd lock alatt ujraellenorzi az `auto_prestart_processed_at` mezot. Ez csokkenti annak kockazatat, hogy ket production scheduler ugyanazt az esemenyt egyszerre dolgozza fel.

## Deploy utani ellenorzes

1. Futtasd: `npm run check:prestart`
2. Ellenorizd, hogy JSON valasz erkezik `dueCount` es `candidates` mezokkel.
3. Allitsd be a scheduled jobot 5 percenkent: `npm run process:prestart`
4. Egy teszt esemenynel ellenorizd, hogy a kezdes elotti 1 oras ablakban az `auto_prestart_outcome` `team_draw_published` vagy `cancelled_low_attendance` lesz.
