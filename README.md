# NULL SECTOR

Önálló, böngészőben futó 3D FPS Three.js alapokon. A szülőprojekt GitHub Actionjét nem módosítja.

## Indítás

Node.js 20.19+ vagy 22.12+ szükséges. A `game/` mappában:

```sh
npm install
npm run dev
```

Nyisd meg a terminálban jelzett címet, alapértelmezésben `http://localhost:5173`.
Mobilon a géped helyi hálózati IP-címével is elérhető, például `http://192.168.1.10:5173`.
A fejlesztői szerver ezért minden hálózati interfészen figyel; csak megbízható hálózaton használd.

## Kooperatív mód (2–4 fő)

1. Mindenki ugyanazt a szervert nyissa meg. Helyben `http://localhost:5173`, a többieknek a szervert futtató gép hálózati címe kell.
2. Írd be a játékosneved, majd válaszd a **Szoba létrehozása** lehetőséget. A pályakód opcionális.
3. Küldd el a hatjegyű szobakódot. A többiek ezt a **Szobakód** mezőbe írva csatlakozhatnak.
4. A szobagazda legalább két játékossal elindíthatja a bevetést. Mindenki a **Belépés a bevetésbe** gombbal kapcsolja be az egérvezérlést.
5. Tisztítsátok meg a pályát, majd minden élő játékos menjen a kijárat 3 méteres körzetébe. A következő szektort a szobagazda indítja.

- A csapattársakat kékeszöld jelzés és a csapatlista különbözteti meg. Nincs baráti tűz.
- Nulla életerőnél földre kerülsz, nem mozoghatsz és nem lőhetsz. Nincs kivérzési időkorlát.
- Újraélesztés: menj 2,5 méteren belülre, és tartsd nyomva az **E** billentyűt **3 másodpercig**, közvetlen rálátással. Mobilon külön gomb jelenik meg.
- Az újraélesztett játékos 50 HP-t és 3 másodperc védelmet kap. Ha mindenki elesik, a csapat újrakezdheti a bevetést.
- A szünetmenü és a háttérbe tett böngészőlap **nem állítja meg** a közös játékot; a karakter továbbra is sebezhető.
- A szobagazda kilépésekor a szerep automatikusan átkerül egy bent maradó játékoshoz. Egyedül maradva befejezheted a már elindított bevetést.
- Csatlakozni csak a váróteremben lehet. Automatikus visszacsatlakozás és mentés még nincs; az üres szobák törlődnek, a szerver újraindítása megszünteti a szobákat.

A fejlesztői és preview szerver ugyanazon a porton szolgálja ki a játékot és a
`/coop` WebSocket kapcsolatot. Nincs szükség második terminálra.
A szerver 30 Hz-en szimulál, 15 Hz-en küld közös állapotot. A kliens simítja a
mozgást; a mozgás, találat, lőszer, ellenfelek, felvételek és újraélesztés a
szerveren dőlnek el. A hálózati találatok egyszerűsített karakter-hitboxot használnak.
Nagy hálózati késleltetésnél a mozgáson érezhető késés lehet; ez az első kooperatív változat.

### Internetes telepítés

```sh
npm run build
npm start
```

Az `npm start` a `dist/` fájljait és a játékszervert szolgálja ki, alapból az
5173-as porton (`PORT` környezeti változóval módosítható). Interneten használj
HTTPS reverse proxyt, amely a `/coop` útvonal WebSocket upgrade-jét is továbbítja.
A böngésző HTTPS mellett automatikusan WSS-t használ. A pusztán statikus tárhely
csak az egyjátékos módhoz elegendő. A szobakódot csak a csapattársaiddal oszd meg;
nincs fiókos hitelesítés. A szerver legfeljebb 32 szobát és 128 kapcsolatot fogad,
üzenetméret- és üzenetsebesség-korláttal.

## Játékmenet

- Minden szektor véletlenszerű, összefüggő szobákból és folyosókból áll.
- Azonos pályakód és szektorszám azonos pályaelrendezést eredményez.
- Semlegesíts minden őrrobotot, majd lépj a minimapon jelölt zöld kijárathoz.
- A következő szektorban több, gyorsabb és erősebb őrrobot vár.
- A zöld csomag életerőt, a sárga lőszert ad. Ezek a minimapon is láthatók.
- Az őrrobotok három találatot bírnak. A falak mindkét fél lövéseit megállítják.
- A VX-9 AUTO gépkarabély 30-as tárral, folyamatos sorozatlövéssel működik. Üres tárnál nyomva tartott tűzgomb mellett automatikusan újratölt, ha van tartalék lőszer.

| Vezérlés | Művelet |
| --- | --- |
| WASD vagy nyilak | Mozgás |
| Egér | Körülnézés |
| Jobb egérgomb nyomva | Nagyított célzás, középre emelt fegyver és finomabb egérmozgás |
| Bal egérgomb nyomva | Automata sorozatlövés, célzás közben is |
| R | Újratöltés |
| Shift | Sprint |
| Esc | Szünet, egér feloldása |

Mobilon a bal oldali joystick mozgat, a jobb oldali terület húzása céloz. A CÉL gomb kapcsolja a nagyított célzást. A LÖVÉS gombot nyomva tartva sorozatot lőhetsz, az R gombbal újratölthetsz.
A hang szintetizált, nincs letöltendő hangfájl. A Google Fonts opcionális; hálózat nélkül rendszerbetűkkel is működik.
WebGL2-képes, modern böngésző és engedélyezett hardveres gyorsítás szükséges. Asztalon a játék egérzárolást kér.

## Ellenőrzés és kiadás

A karakterek a Quaternius / Tomás Laulhé által készített **RobotExpressive**
modellből készülnek, három páncélszínnel. A modell **CC0 1.0** licencű,
ingyenesen használható és terjeszthető, kereskedelmi projektekben is.
Járás-, futás-, várakozás- és halálanimációi külön csontvázzal futnak minden
ellenfélen. A kb. 454 kB-os modell helyben található a
`public/models/RobotExpressive.glb` fájlban; nincs külső modellfüggőség futásidőben.
A pontos forrás és licenchivatkozás: [ATTRIBUTION.md](public/models/ATTRIBUTION.md).

```sh
npm test
npm run build
npm run preview
```

A `dist/` tartalma egyjátékos módban statikus webszerverre telepíthető; kooperatív módhoz a fenti Node.js szerver szükséges. Közvetlen `file://` megnyitás helyett HTTP-kiszolgáló szükséges.
A böngészős tesztekhez indítsd el a fejlesztői szervert, majd futtasd:

```sh
npx playwright test
```

Alapértelmezésben `/usr/bin/google-chrome` fut. Más böngészőútvonalat a `CHROME_PATH` környezeti változóval adhatsz meg.
