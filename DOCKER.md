# Docker

A Dockerfile nem buildel es nem telepit csomagokat. Csak a helyben eloallitott
`dist/` mappat es a `build/server.mjs` szervercsomagot masolja a kontenerbe.
Az `npm run build` a szerver JavaScript-fuggosegeit (ws, three) is becsomagolja,
igy nincs szukseg a helyi node_modules atmasolasara.

A `game/` mappaban futtasd:

```sh
npm ci
npm run build
docker build -t null-sector .
docker run -d --name null-sector --restart unless-stopped -p 5173:5173 null-sector
```

Megnyitas: `http://localhost:5173`, masik geprol
`http://<szerver-ip>:5173`. A HTTP es a multiplayer WebSocket ugyanazt a portot
hasznalja. A szerver tuzfalen engedelyezni kell az 5173/TCP elerest.

A helyi buildhez a fejlesztoi fuggosegek is szuksegesek (`npm ci --include=dev`,
ha a kornyezet production modra van allitva). A kontenernek sem npm telepites,
sem helyi node_modules nem kell. A ws opcionalis nativ gyorsitoi helyett a
beepitett JavaScript-megvalositas fut.

Meglevo kontener frissitese a helyi build es a docker build utan:

```sh
docker stop null-sector
docker rm null-sector
docker run -d --name null-sector --restart unless-stopped -p 5173:5173 null-sector
```

Az image ujraepitese onmagaban nem frissiti a mar letezo kontenert.

A kontener a `/app/dist/index.html` fajlt szolgalja ki a `/` utvonalon.
A bongeszoben a `http://<szerver-ip>:5173/` cimet nyisd meg, ne a `/game/`
vagy `/dist/` utvonalat. A `STATIC_DIR` alapbol `/app/dist` a kontenerben.
Hianyzo vagy nem olvashato index.html eseten a szerver indulaskor pontos
hibauzenettel leall. Mas hianyzo fajlok utvonala a docker logs kimenetebe kerul.
Ne csatolj ures vagy mas tartalmu volume-ot az `/app` vagy `/app/dist` helyere.

A szobak csak memoriaban elnek, a kontener ujrainditasakor megszunnek.
