# Pilot Deploy

Ez a repo `web.app`-ra csak frontendként tehető ki. A backendet külön Node hosztra kell deployolni.

## Ajánlott pilot felállás

Frontend:
- Firebase Hosting / `*.web.app`

Backend:
- Render / Railway / Fly.io / VPS Node service

Adatbázis:
- külön pilot PostgreSQL

## Kötelező env-ek

Használd a [.env.example](./.env.example) mintát.

Minimum:
- `NODE_ENV=production`
- `JWT_SECRET`
- `TRUST_PROXY=true` ha reverse proxy mögött fut
- `CORS_ALLOWED_ORIGINS=https://<frontend>.web.app,https://<frontend>.firebaseapp.com`
- `DATABASE_URL` vagy a `DB_*` mezők

## Javasolt lépések

1. Backend deploy külön hosztra.
2. Állítsd be a production env-eket.
3. Health check: `GET /api/health`
4. Frontendet tedd ki `web.app` alá.
5. A frontendben az API base legyen a backend publikus URL-je.
6. Ellenőrizd a login, team load, event list, invite, register flow-t.

## Lokális pilot smoke élesítés előtt

Élesítés előtt futtasd:

```bash
npm run test:pilot
```

Ez a csomag a pilot szempontból legkritikusabb flow-kat fogja össze:

- auth és health check
- regisztrációs útvonalak
- login utáni szerepalapú routing
- csapatmeghívó és meghívó elfogadása
- eseményjelentkezés
- teljes szervezői flow
- esemény email értesítések és email action linkek
- AccuWeather előrejelzés alaplogika
- frontend auth / dashboard regressziók
- kassza, no-show és befizetés regressziók

## Pilot előtti minimum checklist

- külön pilot DB
- backup megoldás
- csak pilot domainek CORS allowlisten
- hosszú random `JWT_SECRET`
- HTTPS mindenhol
- `.env` nincs verziókezelve
