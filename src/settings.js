// Nastavení aplikace: popis formuláře, výchozí hodnoty, načtení/uložení a sdílení odkazem.
// Vše kromě loadSettings/saveSettings jsou čisté funkce (testují se v Node).

import { PRESETS, FONTS, BEDS } from './presets.js'

export const STORAGE_KEY = 'scrabble3d:v4'
export const SHARE_PREFIX = '#s='
export const EDGE_MARGIN = 0.5
export const BED_MARGIN = 5

// Skupiny formuláře. Popisky jsou v i18n.js (g.<skupina>, f.<pole>, h.<pole>, o.<pole>.<hodnota>);
// u voleb s hodnotou null se popisek překládá, jinak je to vlastní název (předvolby, fonty, tiskárny).
// advanced: skupina je ve formuláři ve výchozím stavu sbalená.
export const GROUPS = [
	{
		id: 'set',
		fields: [
			{
				id: 'preset',
				type: 'select',
				options: { ...Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.name])), custom: null },
				def: 'cs',
			},
			{ id: 'tiles', type: 'textarea', help: true, def: PRESETS.cs.tiles.trim() },
			{ id: 'printMode', type: 'select', options: { set: null, selection: null }, def: 'set', help: true },
			{ id: 'sets', type: 'number', min: 1, max: 20, step: 1, def: 1, when: (s) => s.printMode === 'set' },
		],
	},
	{
		id: 'style',
		fields: [
			{ id: 'style', type: 'select', options: { engraved: null, inlay: null, raised: null }, def: 'engraved' },
			{ id: 'depth', type: 'number', unit: 'mm', min: 0.2, max: 4, step: 0.04, def: 0.6, when: (s) => s.style !== 'raised' },
			{ id: 'height', type: 'number', unit: 'mm', min: 0.2, max: 4, step: 0.04, def: 0.6, when: (s) => s.style === 'raised' },
			{ id: 'bodyColor', type: 'color', def: '#f1e3c4' },
			{ id: 'letterColor', type: 'color', def: '#2b2117' },
		],
	},
	{
		id: 'size',
		fields: [
			{ id: 'size', type: 'number', unit: 'mm', min: 8, max: 50, step: 0.5, def: 19 },
			{ id: 'thickness', type: 'number', unit: 'mm', min: 1.5, max: 12, step: 0.1, def: 4 },
			{ id: 'radius', type: 'number', unit: 'mm', min: 0, max: 6, step: 0.1, def: 1.5 },
			{ id: 'chamfer', type: 'number', unit: 'mm', min: 0, max: 2, step: 0.1, def: 0.4 },
		],
	},
	{
		id: 'print',
		fields: [
			{
				id: 'bed',
				type: 'select',
				options: { ...Object.fromEntries(BEDS.map((b, i) => [String(i), b.name])), custom: null },
				def: '0',
			},
			{ id: 'bedX', type: 'number', unit: 'mm', min: 50, max: 1000, step: 1, def: 256, when: (s) => s.bed === 'custom' },
			{ id: 'bedY', type: 'number', unit: 'mm', min: 50, max: 1000, step: 1, def: 256, when: (s) => s.bed === 'custom' },
			{ id: 'layerHeight', type: 'number', unit: 'mm', min: 0.04, max: 0.4, step: 0.02, def: 0.2 },
			{ id: 'faceDown', type: 'checkbox', def: false, when: (s) => s.style !== 'raised' },
		],
	},
	{
		id: 'font',
		fields: [
			{ id: 'font', type: 'select', options: Object.fromEntries(FONTS.map((f) => [f.id, f.name])), def: FONTS[0].id },
			{ id: 'fontFile', type: 'file', accept: '.ttf,.otf,.woff' },
		],
	},
	{
		id: 'letter',
		advanced: true,
		fields: [
			{ id: 'letterSize', type: 'number', unit: '%', min: 15, max: 80, step: 1, def: 45 },
			{ id: 'letterMaxWidth', type: 'number', unit: '%', min: 20, max: 95, step: 1, def: 58 },
			{ id: 'letterOffsetX', type: 'number', unit: '%', min: -30, max: 30, step: 1, def: 0 },
			{ id: 'letterOffsetY', type: 'number', unit: '%', min: -30, max: 30, step: 1, def: 3 },
		],
	},
	{
		id: 'value',
		advanced: true,
		fields: [
			{ id: 'showValue', type: 'checkbox', def: true },
			{ id: 'showZero', type: 'checkbox', def: true, when: (s) => s.showValue },
			{ id: 'valueSize', type: 'number', unit: '%', min: 5, max: 40, step: 1, def: 19, when: (s) => s.showValue },
			{ id: 'valueMargin', type: 'number', unit: 'mm', min: 0.5, max: 8, step: 0.1, def: 1.4, when: (s) => s.showValue },
		],
	},
	{
		id: 'mark',
		advanced: true,
		fields: [
			{ id: 'markText', type: 'text', help: true, def: '' },
			{ id: 'markSize', type: 'number', unit: '%', min: 10, max: 60, step: 1, def: 30, when: (s) => s.markText.trim() },
			{ id: 'markDepth', type: 'number', unit: 'mm', min: 0.1, max: 2, step: 0.04, def: 0.4, when: (s) => s.markText.trim() },
		],
	},
	{
		id: 'advanced',
		advanced: true,
		fields: [
			{ id: 'lineWidth', type: 'number', unit: 'mm', min: 0.2, max: 1.2, step: 0.01, def: 0.42 },
			{ id: 'gap', type: 'number', unit: 'mm', min: 0.5, max: 20, step: 0.5, def: 3 },
			{ id: 'curveSegments', type: 'number', min: 2, max: 16, step: 1, def: 6 },
		],
	},
]

export const FIELDS = GROUPS.flatMap((g) => g.fields)
const VALUE_FIELDS = FIELDS.filter((f) => 'def' in f)
const PERCENT = new Set(FIELDS.filter((f) => f.unit === '%').map((f) => f.id))

export function defaults() {
	return { ...Object.fromEntries(VALUE_FIELDS.map((f) => [f.id, f.def])), selection: {}, lang: '' }
}

// Z libovolného (uloženého, sdíleného, starého) objektu udělá platné nastavení.
export function normalizeSettings(source = {}) {
	const s = defaults()
	for (const f of VALUE_FIELDS) {
		const v = source[f.id]
		if (typeof v !== typeof f.def) continue
		if (f.type === 'number') s[f.id] = Number.isFinite(v) ? Math.min(f.max, Math.max(f.min, v)) : f.def
		else if (f.type === 'select') s[f.id] = v in f.options || (f.id === 'font' && v === 'custom') ? v : f.def
		else s[f.id] = v
	}
	if (source.selection && typeof source.selection === 'object') {
		for (const [k, n] of Object.entries(source.selection)) {
			if (Number.isInteger(n) && n > 0) s.selection[k] = Math.min(99, n)
		}
	}
	if (typeof source.lang === 'string') s.lang = source.lang
	// Předvolba určuje seznam kamenů (opravy předvoleb se tak projeví i u uložených nastavení).
	if (PRESETS[s.preset]) s.tiles = PRESETS[s.preset].tiles.trim()
	return s
}

// ---------- Sdílení odkazem: #s=<base64url JSON s hodnotami odlišnými od výchozích> ----------

export function encodeShare(obj) {
	const bytes = new TextEncoder().encode(JSON.stringify(obj))
	let bin = ''
	for (const b of bytes) bin += String.fromCharCode(b)
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeShare(text) {
	const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
	return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
}

export function shareDiff(s) {
	const diff = {}
	for (const f of VALUE_FIELDS) {
		if (s[f.id] === f.def) continue
		if (f.id === 'font' && s.font === 'custom') continue // vlastní font nejde sdílet
		if (f.id === 'tiles' && PRESETS[s.preset]) continue // vyplyne z předvolby
		diff[f.id] = s[f.id]
	}
	if (selectionMode(s) && Object.keys(s.selection).length) diff.selection = s.selection
	return diff
}

export function shareHash(s) {
	const diff = shareDiff(s)
	return Object.keys(diff).length ? SHARE_PREFIX + encodeShare(diff) : ''
}

// ---------- Načtení a uložení (prohlížeč) ----------

// Vrací { settings, fromLink }. Sdílený odkaz má přednost před uloženým nastavením;
// jazyk se ale vždy bere z uloženého nastavení (je to volba návštěvníka, ne odkazu).
export function loadSettings(storage, hash, defaultLang) {
	let stored = {}
	try {
		stored = JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
	} catch {}
	let shared = null
	if (hash.startsWith(SHARE_PREFIX)) {
		try {
			shared = decodeShare(hash.slice(SHARE_PREFIX.length))
		} catch {}
	}
	const settings = normalizeSettings(shared ?? stored)
	settings.lang = typeof stored.lang === 'string' ? stored.lang : ''
	if (!settings.lang) {
		// První návštěva: jazyk podle prohlížeče a k němu odpovídající předvolba.
		settings.lang = defaultLang
		if (!shared && defaultLang === 'en') {
			settings.preset = 'en'
			settings.tiles = PRESETS.en.tiles.trim()
		}
	}
	return { settings, fromLink: !!shared }
}

export function saveSettings(storage, s) {
	try {
		storage.setItem(STORAGE_KEY, JSON.stringify(s))
	} catch {}
}

// ---------- Odvozené hodnoty ----------

export const selectionMode = (s) => s.printMode === 'selection'
export const effectiveFaceDown = (s) => s.faceDown && s.style !== 'raised'
export const hasMark = (s) => s.markText.trim() !== ''

export function bedSize(s) {
	if (s.bed === 'custom') return { x: s.bedX, y: s.bedY }
	const b = BEDS[Number(s.bed)] || BEDS[0]
	return { x: b.x, y: b.y }
}

const GEOMETRY_KEYS = [
	'size',
	'thickness',
	'radius',
	'chamfer',
	'depth',
	'height',
	'style',
	'showValue',
	'showZero',
	'valueMargin',
	'curveSegments',
	'markText',
	'markDepth',
	'lineWidth',
]

// Parametry pro geometry.js (procenta převedená na podíly).
export function geometryParams(s) {
	const p = Object.fromEntries(GEOMETRY_KEYS.map((k) => [k, s[k]]))
	for (const k of PERCENT) p[k] = s[k] / 100
	p.edgeMargin = EDGE_MARGIN
	return p
}
