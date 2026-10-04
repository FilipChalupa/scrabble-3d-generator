import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import opentype from 'opentype.js'
import { layoutTile, buildTile } from './geometry.js'
import { placeTris, concatTris, toSTL, to3MF, zip } from './export.js'
import { PRESETS, FONTS, BEDS, parseTiles } from './presets.js'

const STORAGE_KEY = 'scrabble3d:v1'
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
			{ id: 'sets', type: 'number', label: 'Počet sad', min: 1, max: 20, step: 1, def: 1 },
		],
	},
	{
		title: 'Písmo',
		fields: [
			{
				id: 'font',
				type: 'select',
				label: 'Font',
				options: { ...Object.fromEntries(FONTS.map((f) => [f.id, f.name])), custom: 'Vlastní soubor…' },
				def: FONTS[0].id,
			},
			{ id: 'fontFile', type: 'file', label: 'Vlastní font (TTF / OTF)', accept: '.ttf,.otf,.woff' },
		],
	},
	{
		title: 'Rozměry kamene',
		fields: [
			{ id: 'size', type: 'number', label: 'Strana', unit: 'mm', min: 8, max: 50, step: 0.5, def: 19 },
			{ id: 'thickness', type: 'number', label: 'Tloušťka', unit: 'mm', min: 1.5, max: 12, step: 0.1, def: 4 },
			{ id: 'radius', type: 'number', label: 'Zaoblení rohů', unit: 'mm', min: 0, max: 6, step: 0.1, def: 1.5 },
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
			{ id: 'letterMaxWidth', type: 'number', label: 'Max. šířka', unit: '%', min: 20, max: 95, step: 1, def: 64 },
			{ id: 'letterOffsetX', type: 'number', label: 'Posun vodorovně', unit: '%', min: -30, max: 30, step: 1, def: -6 },
			{ id: 'letterOffsetY', type: 'number', label: 'Posun svisle', unit: '%', min: -30, max: 30, step: 1, def: 3 },
		],
	},
	{
		title: 'Bodová hodnota',
		fields: [
			{ id: 'showValue', type: 'checkbox', label: 'Zobrazit body', def: true },
			{ id: 'valueSize', type: 'number', label: 'Velikost', unit: '%', min: 5, max: 40, step: 1, def: 20, when: (s) => s.showValue },
			{ id: 'valueMargin', type: 'number', label: 'Odsazení od hrany', unit: 'mm', min: 0.5, max: 8, step: 0.1, def: 1.4, when: (s) => s.showValue },
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

function loadSettings() {
	const s = Object.fromEntries(FIELDS.filter((f) => 'def' in f).map((f) => [f.id, f.def]))
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
		for (const k of Object.keys(s)) if (k in saved) s[k] = saved[k]
	} catch {}
	if (s.font === 'custom') s.font = FONTS[0].id
	return s
}

const settings = loadSettings()

function saveSettings() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
	} catch {}
}

function bedSize() {
	if (settings.bed === 'custom') return { x: settings.bedX, y: settings.bedY }
	const b = BEDS[Number(settings.bed)] || BEDS[0]
	return { x: b.x, y: b.y }
}

const effectiveFaceDown = () => settings.faceDown && settings.style !== 'raised'

function geometryParams() {
	const p = {}
	for (const k of ['size', 'thickness', 'radius', 'depth', 'height', 'style', 'showValue', 'valueMargin', 'curveSegments']) {
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

	form.addEventListener('input', (e) => readField(e.target))
	form.addEventListener('change', (e) => readField(e.target))
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
	form.querySelector('[data-field="fontFile"]').hidden = settings.font !== 'custom'
}

async function readField(input) {
	const f = FIELDS.find((x) => x.id === input.name)
	if (!f) return
	if (f.type === 'file') {
		if (input.files[0]) await loadCustomFont(input.files[0])
		return
	}
	let value
	if (f.type === 'checkbox') value = input.checked
	else if (f.type === 'number') {
		value = parseFloat(input.value)
		if (Number.isNaN(value)) return
		value = Math.min(f.max, Math.max(f.min, value))
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
	if (f.id === 'font') {
		if (value === 'custom') {
			updateVisibility()
			inputs.fontFile.click()
			return
		}
		await loadFont(value)
	}
	updateVisibility()
	onChange(f.id !== 'bodyColor' && f.id !== 'letterColor')
}

// ---------- Font ----------

let font = null
let fontId = ''

async function loadFont(id) {
	const def = FONTS.find((f) => f.id === id) || FONTS[0]
	setStatus('Načítám písmo…')
	const buf = await (await fetch(def.url)).arrayBuffer()
	font = opentype.parse(buf)
	fontId = def.id
}

async function loadCustomFont(file) {
	try {
		font = opentype.parse(await file.arrayBuffer())
		fontId = `custom:${file.name}:${file.size}`
		onChange(true)
	} catch (err) {
		setStatus(`Font se nepodařilo načíst: ${err.message}`, true)
	}
}

// ---------- Kameny ----------

let tileCache = new Map()
let tileCacheKey = ''

function getTile(letter, value) {
	const p = geometryParams()
	const key = JSON.stringify(p) + fontId
	if (key !== tileCacheKey) {
		for (const t of tileCache.values()) disposeTileGeometry(t)
		tileCache = new Map()
		tileCacheKey = key
	}
	const k = `${letter}|${value}`
	let t = tileCache.get(k)
	if (!t) {
		const built = buildTile(layoutTile(font, letter, value, p), p)
		const f = (a) => Float32Array.from(a)
		t = {
			letter,
			value,
			height: built.height,
			body: f(built.body),
			accent: f(built.accent),
			parts: built.parts && { body: f(built.parts.body), letters: f(built.parts.letters) },
		}
		t.single = concatTris([t.body, t.accent])
		tileCache.set(k, t)
	}
	return t
}

function tileList() {
	return parseTiles(settings.tiles)
}

function expandedTiles() {
	const list = []
	for (let s = 0; s < settings.sets; s++) {
		for (const t of tileList()) for (let i = 0; i < t.count; i++) list.push(t)
	}
	return list
}

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
		const usedCols = Math.min(cols, chunk.length)
		const usedRows = Math.ceil(chunk.length / cols)
		out.push(
			chunk.map((t, j) => ({
				...t,
				x: ((j % cols) - (usedCols - 1) / 2) * (s + gap),
				y: ((usedRows - 1) / 2 - Math.floor(j / cols)) * (s + gap),
			})),
		)
	}
	return out
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
const accentMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 })
const content = new THREE.Group()
scene.add(content)

function trisToGeometry(tris) {
	const g = new THREE.BufferGeometry()
	g.setAttribute('position', new THREE.BufferAttribute(tris, 3))
	g.computeVertexNormals()
	return g
}

function tileGeometry(t) {
	if (!t.geo) t.geo = { body: trisToGeometry(t.body), accent: trisToGeometry(t.accent) }
	return t.geo
}

function disposeTileGeometry(t) {
	if (!t.geo) return
	t.geo.body.dispose()
	t.geo.accent.dispose()
}

function addTileMesh(t, x, y) {
	const g = tileGeometry(t)
	const body = new THREE.Mesh(g.body, bodyMat)
	const accent = new THREE.Mesh(g.accent, accentMat)
	body.position.set(x, y, 0)
	accent.position.set(x, y, 0)
	content.add(body, accent)
}

function clearContent() {
	content.clear()
}

let lastFrame = ''

function frame(w, h, key) {
	if (key === lastFrame) return
	lastFrame = key
	const r = Math.max(w, h)
	camera.position.set(0, -r * 1.35, r * 1.55)
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

const statusEl = document.getElementById('status')
function setStatus(text, error = false) {
	statusEl.textContent = text
	statusEl.classList.toggle('error', error)
	statusEl.hidden = !text
}

function renderTileList() {
	const list = tileList()
	if (selected >= list.length) selected = 0
	const el = document.getElementById('tile-list')
	el.replaceChildren(
		...list.map((t, i) => {
			const b = document.createElement('button')
			b.type = 'button'
			b.className = 'chip' + (i === selected ? ' active' : '')
			b.title = `${t.letter === '_' ? 'Žolík' : t.letter} · ${t.value} b. · ${t.count}×`
			b.innerHTML = `<span class="l"></span><span class="v"></span><span class="c"></span>`
			b.querySelector('.l').textContent = t.letter === '_' ? '' : t.letter
			b.querySelector('.v').textContent = settings.showValue && t.value > 0 ? t.value : ''
			b.querySelector('.c').textContent = `${t.count}×`
			b.addEventListener('click', () => {
				selected = i
				setView('tile')
				renderTileList()
			})
			return b
		}),
	)
}

function renderSummary() {
	const total = expandedTiles().length
	const n = plates().length
	const word = n === 1 ? 'podložka' : n < 5 ? 'podložky' : 'podložek'
	document.getElementById('summary').textContent = `${total} kamenů · ${n} ${word}`

	const sel = document.getElementById('plate-select')
	sel.replaceChildren(...Array.from({ length: n }, (_, i) => new Option(`Podložka ${i + 1} / ${n}`, String(i))))
	if (plateIndex >= n) plateIndex = 0
	sel.value = String(plateIndex)
	sel.hidden = view !== 'plate' || n < 2
}

const HINTS = {
	engraved:
		'Vyrytá písmena se tisknou v jedné barvě. Hloubku volte jako násobek výšky vrstvy; pro kontrast lze prohlubně po tisku zatřít barvou.',
	inlay:
		'Ve 3MF je kámen a písmena jako dva díly jednoho objektu – ve sliceru jim přiřaďte různé filamenty. S volbou „lícem dolů“ bude líc dokonale hladký.',
	raised:
		'Vystouplá písmena: STL je jeden díl, ve 3MF jsou písmena samostatný díl, takže je můžete tisknout jinou barvou.',
}

function redraw() {
	if (!font) return
	bodyMat.color.set(settings.bodyColor)
	accentMat.color.set(settings.letterColor)
	document.getElementById('hint').textContent = HINTS[settings.style]
	clearContent()
	try {
		if (view === 'tile') {
			const t = tileList()[selected]
			if (t) addTileMesh(getTile(t.letter, t.value), 0, 0)
			frame(settings.size, settings.size, `tile:${settings.size}`)
		} else {
			const ps = plates()
			const plate = ps[plateIndex] || []
			for (const t of plate) addTileMesh(getTile(t.letter, t.value), t.x, t.y)
			const bed = bedSize()
			const outline = new THREE.LineLoop(
				new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(-bed.x / 2, -bed.y / 2, 0),
					new THREE.Vector3(bed.x / 2, -bed.y / 2, 0),
					new THREE.Vector3(bed.x / 2, bed.y / 2, 0),
					new THREE.Vector3(-bed.x / 2, bed.y / 2, 0),
				]),
				new THREE.LineBasicMaterial({ color: 0x888888 }),
			)
			content.add(outline)
			frame(bed.x, bed.y, `plate:${bed.x}x${bed.y}`)
		}
		setStatus('')
	} catch (err) {
		console.error(err)
		setStatus(`Chyba při generování: ${err.message}`, true)
	}
}

function setView(v) {
	view = v
	for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('active', b.dataset.view === v)
	renderSummary()
	redraw()
}

let timer = 0
function onChange(geometry = true) {
	saveSettings()
	renderTileList()
	renderSummary()
	clearTimeout(timer)
	timer = setTimeout(redraw, geometry ? 150 : 0)
}

// ---------- Export ----------

function download(data, name, type = 'application/octet-stream') {
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

// Vrátí soubory pro skupinu kamenů rozmístěných na pozicích x, y.
function filesFor(prefix, placed) {
	const flip = effectiveFaceDown() ? settings.thickness : null
	const gather = (pick) => concatTris(placed.map((p) => placeTris(pick(p.tile), p.x, p.y, flip)))
	const files = {}
	const style = settings.style
	if (style !== 'inlay') files[`${prefix}.stl`] = toSTL(gather((t) => t.single), prefix)
	if (style !== 'engraved') {
		const body = gather((t) => t.parts.body)
		const letters = gather((t) => t.parts.letters)
		files[`${prefix}${style === 'raised' ? '-vicebarevne' : ''}.3mf`] = to3MF(
			[
				{ name: 'Kámen', color: settings.bodyColor, tris: body },
				{ name: 'Písmena', color: settings.letterColor, tris: letters },
			],
			prefix,
		)
		files[`${prefix}-kamen.stl`] = toSTL(body, `${prefix}-kamen`)
		files[`${prefix}-pismena.stl`] = toSTL(letters, `${prefix}-pismena`)
	}
	return files
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0))

async function downloadTile() {
	const t = tileList()[selected]
	if (!t) return
	const prefix = `scrabble-${fileSafe(t.letter)}-${t.value}`
	const files = filesFor(prefix, [{ tile: getTile(t.letter, t.value), x: 0, y: 0 }])
	const names = Object.keys(files)
	if (names.length === 1) download(files[names[0]], names[0])
	else download(zip(files), `${prefix}.zip`, 'application/zip')
}

async function downloadSet() {
	const btn = document.getElementById('dl-set')
	btn.disabled = true
	try {
		const ps = plates()
		const files = {}
		const lines = [
			'Scrabble 3D generátor – https://github.com/FilipChalupa/scrabble-3d-generator',
			'',
			`Provedení: ${STYLES[settings.style]}`,
			`Kámen: ${settings.size} × ${settings.size} × ${settings.thickness} mm`,
			`Tisk lícem dolů: ${effectiveFaceDown() ? 'ano' : 'ne'}`,
			'',
		]
		for (let i = 0; i < ps.length; i++) {
			setStatus(`Generuji podložku ${i + 1} / ${ps.length}…`)
			await nextFrame()
			const prefix = `podlozka-${String(i + 1).padStart(2, '0')}`
			const placed = ps[i].map((p) => ({ tile: getTile(p.letter, p.value), x: p.x, y: p.y }))
			Object.assign(files, filesFor(prefix, placed))
			const letters = ps[i].map((p) => (p.letter === '_' ? '_' : p.letter)).join(' ')
			lines.push(`${prefix}: ${ps[i].length} kamenů – ${letters}`)
		}
		files['README.txt'] = new TextEncoder().encode(lines.join('\n') + '\n')
		setStatus('Balím ZIP…')
		await nextFrame()
		download(zip(files), 'scrabble-sada.zip', 'application/zip')
		setStatus('')
	} catch (err) {
		console.error(err)
		setStatus(`Export selhal: ${err.message}`, true)
	} finally {
		btn.disabled = false
	}
}

// ---------- Start ----------

buildForm()
writeForm()
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view))
document.getElementById('plate-select').addEventListener('change', (e) => {
	plateIndex = Number(e.target.value)
	redraw()
})
document.getElementById('dl-tile').addEventListener('click', downloadTile)
document.getElementById('dl-set').addEventListener('click', downloadSet)

try {
	await loadFont(settings.font)
} catch (err) {
	setStatus(`Písmo se nepodařilo načíst: ${err.message}`, true)
}
renderTileList()
renderSummary()
redraw()
