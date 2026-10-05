import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PRESETS, FONTS, BEDS, parseTiles } from './presets.js'

const STORAGE_KEY = 'scrabble3d:v4'
const EDGE_MARGIN = 0.5
const BED_MARGIN = 5

// ---------- Nastavení ----------

const STYLES = {
	engraved: 'Vyrytá (jedna barva)',
	inlay: 'Zapuštěná v rovině (dvě barvy)',
	raised: 'Vystouplá',
}

const GROUPS = [
	{
		title: 'Sada',
		fields: [
			{
				id: 'preset',
				type: 'select',
				label: 'Předvolba',
				options: { ...Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.name])), custom: 'Vlastní' },
				def: 'cs',
			},
			{
				id: 'tiles',
				type: 'textarea',
				label: 'Kameny',
				help: 'Řádek = písmeno, body, počet. Podtržítko _ je žolík.',
				def: PRESETS.cs.tiles.trim(),
			},
			{
				id: 'printMode',
				type: 'select',
				label: 'Tisknout',
				options: { set: 'Celou sadu', selection: 'Jen vybrané kameny' },
				def: 'set',
				help: 'Výběr se hodí jako náhrada ztracených kamenů nebo doplnění sady – počty nastavíte pod kameny.',
			},
			{ id: 'sets', type: 'number', label: 'Počet sad', min: 1, max: 20, step: 1, def: 1, when: (s) => s.printMode === 'set' },
		],
	},
	{
		title: 'Písmo',
		fields: [
			{
				id: 'font',
				type: 'select',
				label: 'Font',
				options: Object.fromEntries(FONTS.map((f) => [f.id, f.name])),
				def: FONTS[0].id,
			},
			{ id: 'fontFile', type: 'file', label: 'Nahrát vlastní font (TTF / OTF / WOFF)', accept: '.ttf,.otf,.woff' },
		],
	},
	{
		title: 'Rozměry kamene',
		fields: [
			{ id: 'size', type: 'number', label: 'Strana', unit: 'mm', min: 8, max: 50, step: 0.5, def: 19 },
			{ id: 'thickness', type: 'number', label: 'Tloušťka', unit: 'mm', min: 1.5, max: 12, step: 0.1, def: 4 },
			{ id: 'radius', type: 'number', label: 'Zaoblení rohů', unit: 'mm', min: 0, max: 6, step: 0.1, def: 1.5 },
			{ id: 'chamfer', type: 'number', label: 'Zkosení horní hrany', unit: 'mm', min: 0, max: 2, step: 0.1, def: 0.4 },
		],
	},
	{
		title: 'Styl písma na kameni',
		fields: [
			{ id: 'style', type: 'select', label: 'Provedení', options: STYLES, def: 'engraved' },
			{ id: 'depth', type: 'number', label: 'Hloubka písmen', unit: 'mm', min: 0.2, max: 4, step: 0.04, def: 0.6, when: (s) => s.style !== 'raised' },
			{ id: 'height', type: 'number', label: 'Výška písmen', unit: 'mm', min: 0.2, max: 4, step: 0.04, def: 0.6, when: (s) => s.style === 'raised' },
		],
	},
	{
		title: 'Písmeno',
		fields: [
			{ id: 'letterSize', type: 'number', label: 'Výška verzálky', unit: '%', min: 15, max: 80, step: 1, def: 45 },
			{ id: 'letterMaxWidth', type: 'number', label: 'Max. šířka', unit: '%', min: 20, max: 95, step: 1, def: 58 },
			{ id: 'letterOffsetX', type: 'number', label: 'Posun vodorovně', unit: '%', min: -30, max: 30, step: 1, def: 0 },
			{ id: 'letterOffsetY', type: 'number', label: 'Posun svisle', unit: '%', min: -30, max: 30, step: 1, def: 3 },
		],
	},
	{
		title: 'Bodová hodnota',
		fields: [
			{ id: 'showValue', type: 'checkbox', label: 'Zobrazit body', def: true },
			{ id: 'showZero', type: 'checkbox', label: 'Nula na žolíku (aby byl poznat vršek)', def: true, when: (s) => s.showValue },
			{ id: 'valueSize', type: 'number', label: 'Velikost', unit: '%', min: 5, max: 40, step: 1, def: 19, when: (s) => s.showValue },
			{ id: 'valueMargin', type: 'number', label: 'Odsazení od hrany', unit: 'mm', min: 0.5, max: 8, step: 0.1, def: 1.4, when: (s) => s.showValue },
		],
	},
	{
		title: 'Značka na spodku',
		fields: [
			{ id: 'markText', type: 'text', label: 'Text nebo symbol', help: 'Např. iniciály nebo ★ – odliší kameny různých sad. Prázdné = bez značky.', def: '' },
			{ id: 'markSize', type: 'number', label: 'Velikost', unit: '%', min: 10, max: 60, step: 1, def: 30, when: (s) => s.markText.trim() },
			{ id: 'markDepth', type: 'number', label: 'Hloubka', unit: 'mm', min: 0.1, max: 2, step: 0.04, def: 0.4, when: (s) => s.markText.trim() },
		],
	},
	{
		title: 'Tisk',
		fields: [
			{
				id: 'bed',
				type: 'select',
				label: 'Tiskárna',
				options: { ...Object.fromEntries(BEDS.map((b, i) => [String(i), b.name])), custom: 'Vlastní rozměr' },
				def: '0',
			},
			{ id: 'bedX', type: 'number', label: 'Podložka X', unit: 'mm', min: 50, max: 1000, step: 1, def: 256, when: (s) => s.bed === 'custom' },
			{ id: 'bedY', type: 'number', label: 'Podložka Y', unit: 'mm', min: 50, max: 1000, step: 1, def: 256, when: (s) => s.bed === 'custom' },
			{ id: 'layerHeight', type: 'number', label: 'Výška vrstvy', unit: 'mm', min: 0.04, max: 0.4, step: 0.02, def: 0.2 },
			{ id: 'gap', type: 'number', label: 'Mezera mezi kameny', unit: 'mm', min: 0.5, max: 20, step: 0.5, def: 3 },
			{ id: 'faceDown', type: 'checkbox', label: 'Tisknout lícem dolů', def: false, when: (s) => s.style !== 'raised' },
			{ id: 'bodyColor', type: 'color', label: 'Barva kamene', def: '#f1e3c4' },
			{ id: 'letterColor', type: 'color', label: 'Barva písmen', def: '#2b2117' },
			{ id: 'curveSegments', type: 'number', label: 'Hladkost křivek', min: 2, max: 16, step: 1, def: 6 },
		],
	},
]

const FIELDS = GROUPS.flatMap((g) => g.fields)
const PERCENT = new Set(FIELDS.filter((f) => f.unit === '%').map((f) => f.id))

// Sdílený odkaz nese v #s=… jen hodnoty odlišné od výchozích (JSON v base64url).
const SHARE_PREFIX = '#s='

function encodeShare(obj) {
	const bytes = new TextEncoder().encode(JSON.stringify(obj))
	let bin = ''
	for (const b of bytes) bin += String.fromCharCode(b)
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeShare(text) {
	const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
	return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
}

function readSharedSettings() {
	if (!location.hash.startsWith(SHARE_PREFIX)) return null
	try {
		return decodeShare(location.hash.slice(SHARE_PREFIX.length))
	} catch {
		return null
	} finally {
		history.replaceState(null, '', location.pathname + location.search)
	}
}

function loadSettings() {
	const s = Object.fromEntries(FIELDS.filter((f) => 'def' in f).map((f) => [f.id, f.def]))
	let source = readSharedSettings()
	const fromLink = !!source
	if (!source) {
		try {
			source = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
		} catch {
			source = {}
		}
	}
	for (const k of Object.keys(s)) if (k in source && typeof source[k] === typeof s[k]) s[k] = source[k]
	s.selection = source.selection && typeof source.selection === 'object' ? source.selection : {}
	// Předvolba určuje seznam kamenů (a případné opravy předvoleb se tak projeví i u uložených nastavení).
	if (PRESETS[s.preset]) s.tiles = PRESETS[s.preset].tiles.trim()
	s.fromLink = fromLink
	return s
}

function shareURL() {
	const diff = {}
	for (const f of FIELDS) {
		if (!('def' in f) || settings[f.id] === f.def) continue
		if (f.id === 'font' && settings.font === 'custom') continue // vlastní font nejde sdílet
		if (f.id === 'tiles' && PRESETS[settings.preset]) continue // vyplyne z předvolby
		diff[f.id] = settings[f.id]
	}
	if (selectionMode() && Object.keys(settings.selection).length) diff.selection = settings.selection
	const url = new URL(location.href)
	url.hash = Object.keys(diff).length ? SHARE_PREFIX + encodeShare(diff) : ''
	return url.href
}

async function share() {
	const url = shareURL()
	const note = settings.font === 'custom' ? ' Vlastní font se nesdílí – příjemce uvidí výchozí písmo.' : ''
	try {
		await navigator.clipboard.writeText(url)
		setStatus(`Odkaz na toto nastavení je ve schránce.${note}`, false, true)
	} catch {
		window.prompt('Zkopírujte odkaz na toto nastavení:', url)
	}
}

const settings = loadSettings()

function saveSettings() {
	try {
		const { fromLink, ...rest } = settings
		localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
	} catch {}
}

function bedSize() {
	if (settings.bed === 'custom') return { x: settings.bedX, y: settings.bedY }
	const b = BEDS[Number(settings.bed)] || BEDS[0]
	return { x: b.x, y: b.y }
}

const effectiveFaceDown = () => settings.faceDown && settings.style !== 'raised'
const hasMark = () => settings.markText.trim() !== ''

function geometryParams() {
	const p = {}
	for (const k of ['size', 'thickness', 'radius', 'chamfer', 'depth', 'height', 'style', 'showValue', 'showZero', 'valueMargin', 'curveSegments', 'markText', 'markDepth']) {
		p[k] = settings[k]
	}
	for (const k of PERCENT) p[k] = settings[k] / 100
	p.edgeMargin = EDGE_MARGIN
	return p
}

// ---------- Formulář ----------

const form = document.getElementById('settings')
const inputs = {}

function buildForm() {
	for (const g of GROUPS) {
		const fs = document.createElement('fieldset')
		fs.innerHTML = `<legend>${g.title}</legend>`
		for (const f of g.fields) {
			const row = document.createElement('label')
			row.className = `field field-${f.type}`
			row.dataset.field = f.id
			let input
			if (f.type === 'select') {
				input = document.createElement('select')
				for (const [value, label] of Object.entries(f.options)) input.add(new Option(label, value))
			} else if (f.type === 'textarea') {
				input = document.createElement('textarea')
				input.rows = 8
				input.spellcheck = false
			} else {
				input = document.createElement('input')
				input.type = f.type
				for (const a of ['min', 'max', 'step', 'accept']) if (a in f) input[a] = f[a]
			}
			input.name = f.id
			inputs[f.id] = input

			const label = document.createElement('span')
			label.className = 'label'
			label.textContent = f.label
			if (f.type === 'checkbox') {
				row.append(input, label)
			} else if (f.unit) {
				const wrap = document.createElement('span')
				wrap.className = 'with-unit'
				const unit = document.createElement('span')
				unit.className = 'unit'
				unit.textContent = f.unit
				wrap.append(input, unit)
				row.append(label, wrap)
			} else {
				row.append(label, input)
			}
			if (f.help) {
				const help = document.createElement('small')
				help.textContent = f.help
				row.append(help)
			}
			fs.append(row)
		}
		form.append(fs)
	}

	const reset = document.createElement('button')
	reset.type = 'button'
	reset.className = 'btn link'
	reset.textContent = 'Obnovit výchozí nastavení'
	reset.addEventListener('click', () => {
		for (const f of FIELDS) if ('def' in f) settings[f.id] = f.def
		writeForm()
		onChange(true)
	})
	form.append(reset)

	form.addEventListener('input', (e) => readField(e.target, false))
	form.addEventListener('change', (e) => readField(e.target, true))
}

function writeForm() {
	for (const f of FIELDS) {
		if (!('def' in f)) continue
		const input = inputs[f.id]
		if (f.type === 'checkbox') input.checked = settings[f.id]
		else input.value = settings[f.id]
	}
	updateVisibility()
}

function updateVisibility() {
	for (const f of FIELDS) {
		const row = form.querySelector(`[data-field="${f.id}"]`)
		row.hidden = f.when ? !f.when(settings) : false
	}
}

async function readField(input, committed) {
	const f = FIELDS.find((x) => x.id === input.name)
	if (!f) return
	if (f.type === 'file') {
		if (committed && input.files[0]) await useCustomFont(input.files[0])
		return
	}
	let value
	if (f.type === 'checkbox') value = input.checked
	else if (f.type === 'number') {
		value = parseFloat(input.value)
		if (Number.isNaN(value)) {
			if (committed) input.value = settings[f.id]
			return
		}
		value = Math.min(f.max, Math.max(f.min, value))
		// Po dokončení úpravy ukážeme hodnotu, která se skutečně použije.
		if (committed && String(value) !== input.value) input.value = value
	} else value = input.value
	if (settings[f.id] === value) return
	settings[f.id] = value

	if (f.id === 'preset' && PRESETS[value]) {
		settings.tiles = PRESETS[value].tiles.trim()
		inputs.tiles.value = settings.tiles
	}
	if (f.id === 'tiles') {
		settings.preset = Object.keys(PRESETS).find((k) => PRESETS[k].tiles.trim() === value.trim()) || 'custom'
		inputs.preset.value = settings.preset
	}
	if (f.id === 'bed' && value !== 'custom') {
		const b = BEDS[Number(value)]
		settings.bedX = b.x
		settings.bedY = b.y
		inputs.bedX.value = b.x
		inputs.bedY.value = b.y
	}
	if (f.id === 'font') await loadFont(value)
	updateVisibility()
	onChange(f.id !== 'bodyColor' && f.id !== 'letterColor')
}

// ---------- Worker ----------

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
const pending = new Map()
let callSeq = 0

worker.onmessage = ({ data }) => {
	const p = pending.get(data.id)
	if (!p) return
	if ('progress' in data) return p.onProgress?.(data.progress)
	pending.delete(data.id)
	if ('error' in data) p.reject(new Error(data.error))
	else p.resolve(data.result)
}
worker.onerror = (e) => setStatus(`Chyba generátoru: ${e.message || 'nepodařilo se spustit'}`, true)

function call(type, payload, { transfer = [], onProgress } = {}) {
	return new Promise((resolve, reject) => {
		const id = ++callSeq
		pending.set(id, { resolve, reject, onProgress })
		worker.postMessage({ id, type, payload }, transfer)
	})
}

// ---------- Font ----------

// Vlastní font se ukládá do IndexedDB, aby přežil obnovení stránky.
function fontStore(mode, action) {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open('scrabble3d', 1)
		open.onupgradeneeded = () => open.result.createObjectStore('kv')
		open.onerror = () => reject(open.error)
		open.onsuccess = () => {
			const tx = open.result.transaction('kv', mode)
			const req = action(tx.objectStore('kv'))
			tx.oncomplete = () => resolve(req.result)
			tx.onerror = () => reject(tx.error)
		}
	})
}

let fontKey = ''

function setCustomFontOption(name) {
	let opt = inputs.font.querySelector('option[value="custom"]')
	if (!opt) {
		opt = new Option('', 'custom')
		inputs.font.add(opt)
	}
	opt.textContent = `Vlastní: ${name}`
}

async function loadFont(id) {
	setStatus('Načítám písmo…')
	try {
		if (id === 'custom') {
			const stored = await fontStore('readonly', (s) => s.get('font')).catch(() => null)
			if (stored) {
				await call('font', { buffer: stored.buffer.slice(0), key: `custom:${stored.name}:${stored.buffer.byteLength}` })
				fontKey = `custom:${stored.name}:${stored.buffer.byteLength}`
				setCustomFontOption(stored.name)
				inputs.font.value = 'custom'
				return
			}
			id = settings.font = FONTS[0].id
			inputs.font.value = id
		}
		const def = FONTS.find((f) => f.id === id) || FONTS[0]
		await call('font', { url: new URL(def.url, location.href).href, key: def.id })
		fontKey = def.id
	} catch (err) {
		setStatus(`Písmo se nepodařilo načíst: ${err.message}`, true)
		throw err
	}
}

async function useCustomFont(file) {
	try {
		const buffer = await file.arrayBuffer()
		const key = `custom:${file.name}:${buffer.byteLength}`
		await call('font', { buffer: buffer.slice(0), key })
		fontKey = key
		await fontStore('readwrite', (s) => s.put({ name: file.name, buffer }, 'font')).catch(() => {})
		setCustomFontOption(file.name)
		settings.font = 'custom'
		inputs.font.value = 'custom'
		onChange(true)
	} catch (err) {
		setStatus(`Font se nepodařilo načíst: ${err.message}`, true)
	}
}

// ---------- Kameny ----------

function tileList() {
	return parseTiles(settings.tiles)
}

const selectionMode = () => settings.printMode === 'selection'
const selectedCount = (t) => settings.selection[tileKey(t)] || 0

// Kameny k tisku: celá sada (× počet sad), nebo jen vybrané počty.
function expandedTiles() {
	const list = []
	if (selectionMode()) {
		for (const t of tileList()) for (let i = 0; i < selectedCount(t); i++) list.push(t)
		return list
	}
	for (let s = 0; s < settings.sets; s++) {
		for (const t of tileList()) for (let i = 0; i < t.count; i++) list.push(t)
	}
	return list
}

function setSelection(t, n, button) {
	const k = tileKey(t)
	n = Math.max(0, Math.min(99, n))
	if (n) settings.selection[k] = n
	else delete settings.selection[k]
	onChange(false)
	// Seznam se překreslil – vrátíme fokus na stejné tlačítko (ovládání klávesnicí).
	const again = document.querySelector(`[data-step="${CSS.escape(`${k}|${button}`)}"]`)
	if (again && !again.disabled) again.focus()
	else document.querySelector(`[data-step="${CSS.escape(`${k}|plus`)}"]`)?.focus()
}

// Rozmístění na podložky; neúplná poslední řada je vycentrovaná.
function plates() {
	const s = settings.size
	const gap = settings.gap
	const bed = bedSize()
	const cols = Math.max(1, Math.floor((bed.x - 2 * BED_MARGIN + gap) / (s + gap)))
	const rows = Math.max(1, Math.floor((bed.y - 2 * BED_MARGIN + gap) / (s + gap)))
	const per = cols * rows
	const all = expandedTiles()
	const out = []
	for (let i = 0; i < all.length; i += per) {
		const chunk = all.slice(i, i + per)
		const usedRows = Math.ceil(chunk.length / cols)
		out.push(
			chunk.map((t, j) => {
				const row = Math.floor(j / cols)
				const inRow = Math.min(cols, chunk.length - row * cols)
				return {
					...t,
					x: ((j % cols) - (inRow - 1) / 2) * (s + gap),
					y: ((usedRows - 1) / 2 - row) * (s + gap),
				}
			}),
		)
	}
	return out
}

// Náhledové sítě z workeru, klíčované nastavením geometrie a fontem.
let tileCache = new Map()
let tileCacheKey = ''

const tileKey = (t) => `${t.letter}|${t.value}`

async function ensureTiles(items) {
	const params = geometryParams()
	const key = JSON.stringify(params) + fontKey
	if (key !== tileCacheKey) {
		for (const t of tileCache.values()) {
			t.geo.body.dispose()
			t.geo.accent.dispose()
		}
		tileCache = new Map()
		tileCacheKey = key
	}
	const seen = new Set()
	const missing = items.filter((t) => {
		const k = tileKey(t)
		if (tileCache.has(k) || seen.has(k)) return false
		seen.add(k)
		return true
	})
	if (!missing.length) return true
	const built = await call('tiles', { params, items: missing.map(({ letter, value }) => ({ letter, value })) })
	if (key !== tileCacheKey) return false // mezitím se změnilo nastavení
	for (const t of built) {
		tileCache.set(tileKey(t), {
			...t,
			geo: { body: trisToGeometry(t.body), accent: trisToGeometry(t.accent) },
		})
	}
	return true
}

// ---------- 3D náhled ----------

const viewerEl = document.getElementById('viewer')
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
viewerEl.append(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000)
camera.up.set(0, 0, 1)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.6))
const sun = new THREE.DirectionalLight(0xffffff, 2.2)
sun.position.set(-40, -60, 120)
scene.add(sun)
const rim = new THREE.DirectionalLight(0xffffff, 0.6)
rim.position.set(60, 80, 40)
scene.add(rim)

const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0 })
const accentMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 })
const content = new THREE.Group()
const bedGroup = new THREE.Group()
scene.add(content, bedGroup)

function trisToGeometry(tris) {
	const g = new THREE.BufferGeometry()
	g.setAttribute('position', new THREE.BufferAttribute(tris, 3))
	g.computeVertexNormals()
	return g
}

function addTileMesh(t, x, y) {
	const { geo } = tileCache.get(tileKey(t))
	const body = new THREE.Mesh(geo.body, bodyMat)
	const accent = new THREE.Mesh(geo.accent, accentMat)
	body.position.set(x, y, 0)
	accent.position.set(x, y, 0)
	content.add(body, accent)
}

let lastFrame = ''

function frame(w, h, key) {
	if (key === lastFrame) return
	lastFrame = key
	const r = Math.max(w, h)
	camera.position.set(0, -r * 1.6, r * 1.9)
	controls.target.set(0, 0, 0)
	camera.near = r / 100
	camera.far = r * 20
	camera.updateProjectionMatrix()
	controls.update()
}

function resize() {
	const { clientWidth: w, clientHeight: h } = viewerEl
	renderer.setSize(w, h, false)
	camera.aspect = w / Math.max(1, h)
	camera.updateProjectionMatrix()
}
new ResizeObserver(resize).observe(viewerEl)

renderer.setAnimationLoop(() => {
	controls.update()
	renderer.render(scene, camera)
})

// ---------- Stav aplikace ----------

let view = 'tile'
let selected = 0
let plateIndex = 0
let userFlip = false

const statusEl = document.getElementById('status')
// Stavový řádek. Průběžné hlášky („Generuji…“, chyby) překreslení samo smaže,
// informační hlášky (např. o zkopírovaném odkazu) zmizí až po chvíli.
let statusKind = ''
let statusTimer = 0
function setStatus(text, error = false, info = false) {
	statusEl.textContent = text
	statusEl.classList.toggle('error', error)
	statusKind = text ? (info ? 'info' : 'busy') : ''
	clearTimeout(statusTimer)
	if (info) statusTimer = setTimeout(() => statusKind === 'info' && setStatus(''), 6000)
}

const clearBusyStatus = () => statusKind === 'busy' && setStatus('')

const letterName = (t) => (t.letter === '_' ? 'Žolík' : t.letter)

function renderTileList() {
	const list = tileList()
	if (selected >= list.length) selected = 0
	const el = document.getElementById('tile-list')
	el.classList.toggle('selecting', selectionMode())
	el.replaceChildren(
		...list.map((t, i) => {
			const b = document.createElement('button')
			b.type = 'button'
			b.className = 'chip' + (i === selected ? ' active' : '')
			b.setAttribute('aria-pressed', String(i === selected))
			b.setAttribute('aria-label', `${letterName(t)}, ${t.value} b., ${t.count} ks`)
			b.title = `${letterName(t)} · ${t.value} b. · ${t.count}×`
			b.innerHTML = `<span class="l" aria-hidden="true"></span><span class="v" aria-hidden="true"></span><span class="c" aria-hidden="true"></span>`
			b.querySelector('.l').textContent = t.letter === '_' ? '' : t.letter
			b.querySelector('.v').textContent = settings.showValue && (t.value > 0 || settings.showZero) ? t.value : ''
			b.querySelector('.c').textContent = `${t.count}×`
			b.addEventListener('click', () => {
				selected = i
				setView('tile')
				renderTileList()
			})
			if (!selectionMode()) return b

			const cell = document.createElement('div')
			cell.className = 'cell'
			const n = selectedCount(t)
			const stepper = document.createElement('div')
			stepper.className = 'stepper' + (n ? ' on' : '')
			const minus = document.createElement('button')
			minus.type = 'button'
			minus.textContent = '−'
			minus.disabled = !n
			minus.setAttribute('aria-label', `Ubrat ${letterName(t)}`)
			minus.dataset.step = `${tileKey(t)}|minus`
			minus.addEventListener('click', () => setSelection(t, n - 1, 'minus'))
			const count = document.createElement('span')
			count.textContent = n
			count.setAttribute('aria-label', `Vybráno ${letterName(t)}: ${n}`)
			const plus = document.createElement('button')
			plus.type = 'button'
			plus.textContent = '+'
			plus.setAttribute('aria-label', `Přidat ${letterName(t)}`)
			plus.dataset.step = `${tileKey(t)}|plus`
			plus.addEventListener('click', () => setSelection(t, n + 1, 'plus'))
			stepper.append(minus, count, plus)
			cell.append(b, stepper)
			return cell
		}),
	)
	document.getElementById('selection-tools').hidden = !selectionMode()
}

// České skloňování podle počtu: 1 kámen, 2–4 kameny, 0 a 5+ kamenů.
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`
const tilesWord = (n) => plural(n, 'kámen', 'kameny', 'kamenů')

function renderSummary() {
	const total = expandedTiles().length
	const n = plates().length
	document.getElementById('summary').textContent =
		`${selectionMode() ? 'vybráno ' : ''}${tilesWord(total)} · ${plural(n, 'podložka', 'podložky', 'podložek')}`
	const dl = document.getElementById('dl-set')
	dl.textContent = selectionMode() ? 'Stáhnout vybrané (ZIP)' : 'Stáhnout celou sadu (ZIP)'
	dl.disabled = total === 0

	const sel = document.getElementById('plate-select')
	sel.replaceChildren(...Array.from({ length: n }, (_, i) => new Option(`Podložka ${i + 1} / ${n}`, String(i))))
	if (plateIndex >= n) plateIndex = 0
	sel.value = String(plateIndex)
	sel.hidden = view !== 'plate' || n < 2
}

const mm = (v) => `${+v.toFixed(2)} mm`.replace('.', ',')

// Doporučení pro slicer a upozornění podle nastavení a vygenerovaných kamenů.
function slicerTips() {
	const lh = settings.layerHeight
	const T = settings.thickness
	const faceDown = effectiveFaceDown()
	const tips = []
	const warn = (text) => tips.push({ text, warn: true })
	const tip = (text) => tips.push({ text })

	const built = tileList()
		.map((t) => ({ t, info: tileCache.get(tileKey(t)) }))
		.filter((x) => x.info)
	const missing = [...new Set(built.flatMap((x) => x.info.missing))]
	if (missing.length) {
		warn(`Zvolený font neobsahuje znaky ${missing.join(' ')} – na kamenech by chyběly. Zvolte jiný font (např. DejaVu Sans).`)
	}
	const overflow = built.filter((x) => x.info.overflow).map((x) => letterName(x.t))
	if (overflow.length) {
		warn(`Přesahuje okraj kamene a bude oříznuto: ${overflow.join(', ')}. Zmenšete písmeno, hodnotu či značku nebo upravte posun.`)
	}

	if (settings.style === 'engraved') {
		tip('Vyrytá písmena se tisknou v jedné barvě. Pro kontrast lze prohlubně po tisku zatřít barvou nebo voskovkou.')
	} else if (settings.style === 'inlay') {
		tip('Zapuštěná písmena vyžadují vícebarevnou tiskárnu (AMS, MMU…) – kámen i písmena leží ve stejných vrstvách. Otevřete 3MF a dílům „Kámen“ a „Písmena“ přiřaďte různé filamenty.')
	} else {
		const layer = Math.round(T / lh) + 1
		tip(
			`Dvě barvy i na jednobarevné tiskárně: ve sliceru vložte výměnu filamentu (M600 / pauzu) na vrstvu ${layer} ve výšce ${mm(T + lh)} – nad tloušťkou kamene ${mm(T)} se tisknou už jen písmena. Pro vícebarevné tiskárny je ve 3MF samostatný díl „Písmena“.`,
		)
	}

	if (faceDown) {
		tip('Tiskne se lícem dolů: líc převezme povrch podložky (hladká PEI = lesk, texturovaná = mat). Zapněte kompenzaci rozlití první vrstvy (elephant foot), ať písmena zůstanou ostrá.')
	} else if (settings.style !== 'raised') {
		tip('Tiskne se lícem nahoru: pro hladký povrch zapněte žehlení (ironing) horní vrstvy.')
	}

	const checks = [['Tloušťka kamene', T]]
	if (settings.style === 'raised') checks.push(['Výška písmen', settings.height])
	else checks.push(['Hloubka písmen', settings.depth])
	if (hasMark()) checks.push(['Hloubka značky', settings.markDepth])
	for (const [label, v] of checks) {
		const layers = v / lh
		if (Math.abs(layers - Math.round(layers)) > 0.01) {
			warn(`${label} ${mm(v)} není násobkem výšky vrstvy ${mm(lh)} – doporučuji ${mm(Math.max(1, Math.round(layers)) * lh)}.`)
		}
	}

	if (hasMark() && !faceDown) {
		tip('Značka na spodku leží na podložce a tiskne se jako krátké přemostění – stačí mělká (1–2 vrstvy) a jednoduchý tvar. V náhledu ji uvidíte tlačítkem „Otočit“.')
	}
	return tips
}

function renderTips() {
	document.getElementById('hint').replaceChildren(
		...slicerTips().map((t) => {
			const li = document.createElement('li')
			li.textContent = t.text
			if (t.warn) li.className = 'warn'
			return li
		}),
	)
}

// Otočení náhledu: na podložce se kameny ukazují tak, jak se tisknou;
// tlačítko „Otočit“ to vždy převrátí.
function applyFlip() {
	const asPrinted = view === 'plate' && effectiveFaceDown()
	const flipped = userFlip !== asPrinted
	const top = settings.thickness + (settings.style === 'raised' ? settings.height : 0)
	content.rotation.y = flipped ? Math.PI : 0
	content.position.z = flipped ? top : 0
	const btn = document.getElementById('flip')
	btn.setAttribute('aria-pressed', String(userFlip))
	const note = document.getElementById('view-note')
	note.textContent = flipped ? (view === 'plate' && asPrinted && !userFlip ? 'Lícem dolů, jak se tiskne' : 'Pohled na spodek') : ''
}

function drawScene() {
	bodyMat.color.set(settings.bodyColor)
	accentMat.color.set(settings.letterColor)
	content.clear()
	bedGroup.clear()
	if (view === 'tile') {
		const t = tileList()[selected]
		if (t && tileCache.has(tileKey(t))) addTileMesh(t, 0, 0)
		frame(settings.size, settings.size, `tile:${settings.size}`)
	} else {
		const plate = plates()[plateIndex] || []
		for (const t of plate) if (tileCache.has(tileKey(t))) addTileMesh(t, t.x, t.y)
		const bed = bedSize()
		bedGroup.add(
			new THREE.LineLoop(
				new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(-bed.x / 2, -bed.y / 2, 0),
					new THREE.Vector3(bed.x / 2, -bed.y / 2, 0),
					new THREE.Vector3(bed.x / 2, bed.y / 2, 0),
					new THREE.Vector3(-bed.x / 2, bed.y / 2, 0),
				]),
				new THREE.LineBasicMaterial({ color: 0x888888 }),
			),
		)
		frame(bed.x, bed.y, `plate:${bed.x}x${bed.y}`)
	}
	applyFlip()
}

let drawSeq = 0

async function redraw() {
	if (!fontKey) return
	const seq = ++drawSeq
	try {
		// Nejdřív to, co je vidět, pak zbytek sady kvůli upozorněním.
		const visible = view === 'tile' ? tileList().slice(selected, selected + 1) : plates()[plateIndex] || []
		if (visible.some((t) => !tileCache.has(tileKey(t)))) setStatus('Generuji…')
		if (!(await ensureTiles(visible)) || seq !== drawSeq) return
		drawScene()
		if (!(await ensureTiles(tileList())) || seq !== drawSeq) return
		renderTips()
		if (view === 'plate' && !expandedTiles().length) setStatus('Nejsou vybrané žádné kameny.', false, true)
		else clearBusyStatus()
	} catch (err) {
		console.error(err)
		if (seq === drawSeq) setStatus(`Chyba při generování: ${err.message}`, true)
	}
}

function setView(v) {
	view = v
	for (const b of document.querySelectorAll('[data-view]')) {
		b.classList.toggle('active', b.dataset.view === v)
		b.setAttribute('aria-pressed', String(b.dataset.view === v))
	}
	renderSummary()
	redraw()
}

let timer = 0
function onChange(geometry = true) {
	saveSettings()
	renderTileList()
	renderSummary()
	renderTips()
	clearTimeout(timer)
	timer = setTimeout(redraw, geometry ? 150 : 0)
}

// ---------- Export ----------

function download(data, name) {
	const type = name.endsWith('.zip') ? 'application/zip' : 'application/octet-stream'
	const url = URL.createObjectURL(new Blob([data], { type }))
	const a = document.createElement('a')
	a.href = url
	a.download = name
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fileSafe(s) {
	return s === '_' ? 'zolik' : s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]/g, '') || 'x'
}

async function runExport(button, payload) {
	button.disabled = true
	try {
		const { name, data } = await call(
			'export',
			{
				...payload,
				params: geometryParams(),
				flip: effectiveFaceDown() ? settings.thickness : null,
				colors: { body: settings.bodyColor, letters: settings.letterColor },
				bed: bedSize(),
				labels: { body: 'Kámen', letters: 'Písmena', blank: 'Žolík', bodyFile: 'kamen', lettersFile: 'pismena' },
			},
			{ onProgress: (text) => setStatus(text) },
		)
		download(data, name)
		clearBusyStatus()
	} catch (err) {
		console.error(err)
		setStatus(`Export selhal: ${err.message}`, true)
	} finally {
		button.disabled = false
	}
}

function downloadTile(e) {
	const t = tileList()[selected]
	if (!t) return
	const prefix = `scrabble-${fileSafe(t.letter)}-${t.value}`
	runExport(e.currentTarget, {
		groups: [{ prefix, placed: [{ letter: t.letter, value: t.value, x: 0, y: 0 }] }],
		zipName: `${prefix}.zip`,
	})
}

function downloadSet(e) {
	const ps = plates()
	const groups = ps.map((plate, i) => ({
		prefix: `podlozka-${String(i + 1).padStart(2, '0')}`,
		placed: plate.map(({ letter, value, x, y }) => ({ letter, value, x, y })),
	}))
	const readme = [
		'Scrabble 3D generátor – https://github.com/FilipChalupa/scrabble-3d-generator',
		'',
		`Provedení: ${STYLES[settings.style]}`,
		`Kámen: ${settings.size} × ${settings.size} × ${settings.thickness} mm`,
		`Tisk lícem dolů: ${effectiveFaceDown() ? 'ano' : 'ne'}`,
		'',
		...groups.map((g) => `${g.prefix}: ${tilesWord(g.placed.length)} – ${g.placed.map((p) => p.letter).join(' ')}`),
		'',
		'Tipy pro tisk:',
		...slicerTips().map((t) => `- ${t.text}`),
		'',
	].join('\n')
	runExport(e.currentTarget, { groups, readme, zipName: 'scrabble-sada.zip' })
}

// ---------- Start ----------

buildForm()
writeForm()
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view))
document.getElementById('plate-select').addEventListener('change', (e) => {
	plateIndex = Number(e.target.value)
	redraw()
})
document.getElementById('flip').addEventListener('click', () => {
	userFlip = !userFlip
	applyFlip()
})
document.getElementById('dl-tile').addEventListener('click', downloadTile)
document.getElementById('share').addEventListener('click', share)
document.getElementById('select-all').addEventListener('click', () => {
	settings.selection = Object.fromEntries(tileList().map((t) => [tileKey(t), t.count]))
	onChange(false)
})
document.getElementById('select-none').addEventListener('click', () => {
	settings.selection = {}
	onChange(false)
})
document.getElementById('dl-set').addEventListener('click', downloadSet)

renderTileList()
renderSummary()
try {
	await loadFont(settings.font)
	saveSettings()
	await redraw()
	if (settings.fromLink) setStatus('Načteno nastavení ze sdíleného odkazu.', false, true)
} catch {}
