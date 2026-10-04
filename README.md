# Scrabble 3D generátor

Mini webová aplikace, která generuje kameny do hry Scrabble jako 3D modely pro tisk na 3D tiskárně.
Vše běží přímo v prohlížeči, žádný server ani instalace nejsou potřeba.

**👉 https://filipchalupa.cz/scrabble-3d-generator/**

## Co umí

- předvolby rozložení písmen pro **češtinu** a **angličtinu**, nebo vlastní seznam (`písmeno body počet`, `_` = žolík)
- tři provedení písmen:
  - **vyrytá** – jedna barva, písmena jsou prohlubně v kameni
  - **zapuštěná v rovině** – dvoubarevný tisk (AMS / MMU), povrch kamene je hladký
  - **vystouplá** – písmena vystupují nad povrch
- nastavitelné rozměry kamene, zaoblení, velikost a posun písmene i bodové hodnoty
- přibalené fonty s českou diakritikou (DejaVu, Liberation) nebo vlastní TTF/OTF
- rozmístění kamenů na podložky podle tiskárny (Bambu Lab, Prusa, Creality, vlastní rozměr)
- volitelný tisk lícem dolů (hladký líc z texturované / hladké podložky)
- export:
  - jednotlivý kámen nebo celá sada v ZIPu
  - `STL` (jeden uzavřený díl) a `3MF` s kamenem a písmeny jako dvěma díly v barvách

## Vícebarevný tisk

Soubor `3MF` obsahuje jeden objekt složený ze dvou dílů (*Kámen* a *Písmena*).
Po otevření v PrusaSliceru, Bambu Studiu nebo OrcaSliceru stačí dílům přiřadit filamenty.
Alternativně lze načíst `*-kamen.stl` a `*-pismena.stl` současně a potvrdit načtení jako jeden objekt s více díly.

### Na jednobarevné tiskárně

Použijte provedení **vystouplá**: kámen se tiskne do své tloušťky (výchozí 4 mm) a nad ní už jsou jen písmena.
Ve sliceru přidejte výměnu filamentu ve výšce první vrstvy nad tloušťkou kamene
(PrusaSlicer: „+“ u posuvníku vrstev, Bambu/Orca: pravým tlačítkem „Add pause / filament change“).

Provedení **zapuštěná v rovině** jednobarevně vytisknout nejde – písmena i kámen sdílejí stejné vrstvy,
takže výměna filamentu by obarvila celý povrch. Provedení **vyrytá** je jednobarevné, prohlubně lze případně zatřít barvou.

Hloubku / výšku písmen volte jako násobek výšky vrstvy (např. 0,6 mm = 3 × 0,2 mm).

## Vývoj

Statická stránka bez build kroku – stačí ji servírovat libovolným HTTP serverem:

```sh
python3 -m http.server
```

Knihovny ([three.js](https://threejs.org/), [opentype.js](https://opentype.js.org/), [polygon-clipping](https://github.com/mfogel/polygon-clipping), [fflate](https://github.com/101arrowz/fflate)) se načítají z CDN přes import map.

- `src/geometry.js` – převod glyfů na obrysy, sjednocení a vytažení do uzavřené 3D sítě
- `src/export.js` – zápis binárního STL a 3MF
- `src/presets.js` – rozložení písmen, fonty, tiskárny
- `src/main.js` – formulář, 3D náhled, rozmístění na podložky a export

## Licence

Kód: MIT. Fonty ve složce `fonts/` mají vlastní licence (DejaVu – Bitstream Vera / public domain, Liberation – SIL OFL 1.1), viz soubory `fonts/LICENSE-*.txt`.
