// Rozložení písmen: "písmeno body počet", "_" je žolík (prázdný kámen).

export const PRESETS = {
	cs: {
		name: 'Čeština (100 kamenů)',
		tiles: `
A 1 5
Á 2 2
B 3 2
C 2 3
Č 4 1
D 1 3
Ď 8 1
E 1 5
É 3 2
Ě 3 2
F 5 1
G 5 1
H 2 3
I 1 4
Í 2 3
J 2 2
K 1 3
L 1 3
M 2 3
N 1 5
Ň 6 1
O 1 6
Ó 7 1
P 1 3
R 1 3
Ř 4 2
S 1 4
Š 4 2
T 1 4
Ť 7 1
U 1 3
Ú 5 1
Ů 4 1
V 1 4
X 10 1
Y 2 2
Ý 4 2
Z 2 2
Ž 4 1
_ 0 2`,
	},
	en: {
		name: 'English (100 tiles)',
		tiles: `
A 1 9
B 3 2
C 3 2
D 2 4
E 1 12
F 4 2
G 2 3
H 4 2
I 1 9
J 8 1
K 5 1
L 1 4
M 3 2
N 1 6
O 1 8
P 3 2
Q 10 1
R 1 6
S 1 4
T 1 6
U 1 4
V 4 2
W 4 2
X 8 1
Y 4 2
Z 10 1
_ 0 2`,
	},
}

export const FONTS = [
	{ id: 'dejavu-sans', name: 'DejaVu Sans Bold', url: 'fonts/DejaVuSans-Bold.ttf' },
	{ id: 'liberation-sans', name: 'Liberation Sans Bold', url: 'fonts/LiberationSans-Bold.ttf' },
	{ id: 'dejavu-serif', name: 'DejaVu Serif Bold', url: 'fonts/DejaVuSerif-Bold.ttf' },
	{ id: 'liberation-serif', name: 'Liberation Serif Bold', url: 'fonts/LiberationSerif-Bold.ttf' },
]

export const BEDS = [
	{ name: 'Bambu Lab A1 / P1 / X1 (256 × 256)', x: 256, y: 256 },
	{ name: 'Bambu Lab A1 mini (180 × 180)', x: 180, y: 180 },
	{ name: 'Prusa MK4 / MK3 (250 × 210)', x: 250, y: 210 },
	{ name: 'Prusa MINI (180 × 180)', x: 180, y: 180 },
	{ name: 'Prusa CORE One (250 × 220)', x: 250, y: 220 },
	{ name: 'Creality Ender 3 (220 × 220)', x: 220, y: 220 },
]

export function parseTiles(text) {
	const tiles = []
	for (const raw of text.split('\n')) {
		const line = raw.replace(/#.*/, '').trim()
		if (!line) continue
		const [letter, value = '0', count = '1'] = line.split(/\s+/)
		const v = parseInt(value, 10)
		const c = parseInt(count, 10)
		if (!letter || Number.isNaN(v) || Number.isNaN(c) || c < 1) continue
		tiles.push({ letter: letter.toLocaleUpperCase('cs'), value: v, count: c })
	}
	return tiles
}
