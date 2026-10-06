// Propojení aplikace: stav, formulář, náhled, seznam kamenů, export a jazyk.

import { FONTS } from './presets.js'
import { t, count, setLanguage, defaultLanguage, LANGUAGES } from './i18n.js'
import {
	FIELDS,
	loadSettings,
	saveSettings as storeSettings,
	shareHash,
	selectionMode,
	effectiveFaceDown,
	bedSize,
	geometryParams,
} from './settings.js'
import { tileKey, tileList, selectedCount, expandedTiles, plates, fileSafe } from './tiles.js'
import { slicerTips, letterName } from './tips.js'
import { createForm } from './form.js'
import { createPreview, trisToGeometry } from './preview.js'
import { createWorkerClient } from './worker-client.js'

const $ = (id) => document.getElementById(id)

const loaded = loadSettings(localStorage, location.hash, defaultLanguage())
const settings = loaded.settings
if (loaded.fromLink) history.replaceState(null, '', location.pathname + location.search)
const saveSettings = () => storeSettings(localStorage, settings)

let view = 'tile'
let selected = 0
let plateIndex = 0
let userFlip = false

// ---------- Stavový řádek ----------

// Průběžné hlášky („Generuji…“, chyby) překreslení samo smaže,
// informační hlášky (např. o zkopírovaném odkazu) zmizí až po chvíli.
const statusEl = $('status')
let statusKind = ''
let statusTimer = 0

function setStatus(text, { error = false, info = false } = {}) {
	statusEl.textContent = text
	statusEl.classList.toggle('error', error)
	statusKind = text ? (info ? 'info' : 'busy') : ''
	clearTimeout(statusTimer)
	if (info) statusTimer = setTimeout(() => statusKind === 'info' && setStatus(''), 6000)
}

const clearBusyStatus = () => statusKind === 'busy' && setStatus('')

// ---------- Worker a font ----------

const call = createWorkerClient((msg) => setStatus(t('status.workerError', { msg }), { error: true }))

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
let customFontName = ''

function showCustomFontOption() {
	if (!customFontName) return
	let opt = form.inputs.font.querySelector('option[value="custom"]')
	if (!opt) form.inputs.font.add((opt = new Option('', 'custom')))
	opt.textContent = t('ui.custom', { name: customFontName })
	form.inputs.font.value = settings.font
}

async function loadFont(id) {
	setStatus(t('status.loadingFont'))
	try {
		if (id === 'custom') {
			const stored = await fontStore('readonly', (s) => s.get('font')).catch(() => null)
			if (stored) {
				fontKey = `custom:${stored.name}:${stored.buffer.byteLength}`
				await call('font', { buffer: stored.buffer.slice(0), key: fontKey })
				customFontName = stored.name
				showCustomFontOption()
				return
			}
			id = settings.font = FONTS[0].id
			form.inputs.font.value = id
		}
		const def = FONTS.find((f) => f.id === id) || FONTS[0]
		await call('font', { url: new URL(def.url, location.href).href, key: def.id })
		fontKey = def.id
	} catch (err) {
		setStatus(t('status.fontError', { msg: err.message }), { error: true })
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
		customFontName = file.name
		settings.font = 'custom'
		showCustomFontOption()
		onChange(true)
	} catch (err) {
		setStatus(t('status.fontError', { msg: err.message }), { error: true })
	}
}

// ---------- Náhledové sítě z workeru ----------

// Klíčované nastavením geometrie a fontem; drží i informace pro upozornění.
let tileCache = new Map()
let tileCacheKey = ''

async function ensureTiles(items) {
	const params = geometryParams(settings)
	const key = JSON.stringify(params) + fontKey
	if (key !== tileCacheKey) {
		for (const c of tileCache.values()) {
			c.geo.body.dispose()
			c.geo.accent.dispose()
		}
		tileCache = new Map()
		tileCacheKey = key
	}
	const missing = [...new Map(items.filter((i) => !tileCache.has(tileKey(i))).map((i) => [tileKey(i), i])).values()]
	if (!missing.length) return true
	const built = await call('tiles', { params, items: missing.map(({ letter, value }) => ({ letter, value })) })
	if (key !== tileCacheKey) return false // mezitím se změnilo nastavení
	for (const b of built) {
		tileCache.set(tileKey(b), { ...b, geo: { body: trisToGeometry(b.body), accent: trisToGeometry(b.accent) } })
	}
	return true
}

// ---------- Náhled ----------

const preview = createPreview($('viewer'))

function drawScene() {
	preview.setColors(settings.bodyColor, settings.letterColor)
	const cached = (tile) => tileCache.get(tileKey(tile))
	if (view === 'tile') {
		const tile = tileList(settings)[selected]
		preview.show(tile && cached(tile) ? [{ geo: cached(tile).geo, x: 0, y: 0 }] : [], { size: settings.size })
	} else {
		const plate = plates(settings)[plateIndex] || []
		preview.show(
			plate.filter(cached).map((p) => ({ geo: cached(p).geo, x: p.x, y: p.y })),
			{ size: settings.size, bed: bedSize(settings) },
		)
	}
	applyFlip()
}

// Na podložce se kameny ukazují tak, jak se tisknou; „Otočit“ to vždy převrátí.
function applyFlip() {
	const asPrinted = view === 'plate' && effectiveFaceDown(settings)
	const flipped = userFlip !== asPrinted
	preview.setFlip(flipped, settings.thickness + (settings.style === 'raised' ? settings.height : 0))
	$('flip').setAttribute('aria-pressed', String(userFlip))
	$('view-note').textContent = flipped ? (asPrinted && !userFlip ? t('ui.viewPrinted') : t('ui.viewBottom')) : ''
}

let drawSeq = 0

async function redraw() {
	if (!fontKey) return
	const seq = ++drawSeq
	try {
		// Nejdřív to, co je vidět, pak zbytek sady kvůli upozorněním.
		const visible = view === 'tile' ? tileList(settings).slice(selected, selected + 1) : plates(settings)[plateIndex] || []
		if (visible.some((tile) => !tileCache.has(tileKey(tile)))) setStatus(t('status.generating'))
		if (!(await ensureTiles(visible)) || seq !== drawSeq) return
		drawScene()
		if (!(await ensureTiles(tileList(settings))) || seq !== drawSeq) return
		renderTips()
		if (view === 'plate' && !expandedTiles(settings).length) setStatus(t('status.noSelection'), { info: true })
		else clearBusyStatus()
	} catch (err) {
		console.error(err)
		if (seq === drawSeq) setStatus(t('status.buildError', { msg: err.message }), { error: true })
	}
}

// ---------- Seznam kamenů, souhrn a tipy ----------

function setSelection(tile, n, button) {
	const k = tileKey(tile)
	n = Math.max(0, Math.min(99, n))
	if (n) settings.selection[k] = n
	else delete settings.selection[k]
	onChange(false)
	// Seznam se překreslil – vrátíme fokus na stejné tlačítko (ovládání klávesnicí).
	const again = document.querySelector(`[data-step="${CSS.escape(`${k}|${button}`)}"]`)
	if (again && !again.disabled) again.focus()
	else document.querySelector(`[data-step="${CSS.escape(`${k}|plus`)}"]`)?.focus()
}

function stepButton(tile, kind, n) {
	const b = document.createElement('button')
	b.type = 'button'
	b.textContent = kind === 'plus' ? '+' : '−'
	b.disabled = kind === 'minus' && !n
	b.dataset.step = `${tileKey(tile)}|${kind}`
	b.setAttribute('aria-label', t(kind === 'plus' ? 'ui.add' : 'ui.remove', { x: letterName(tile) }))
	b.addEventListener('click', () => setSelection(tile, n + (kind === 'plus' ? 1 : -1), kind))
	return b
}

function tileChip(tile, i) {
	const b = document.createElement('button')
	b.type = 'button'
	b.className = 'chip' + (i === selected ? ' active' : '')
	b.setAttribute('aria-pressed', String(i === selected))
	b.setAttribute('aria-label', `${letterName(tile)}, ${tile.value} ${t('ui.points')}, ${tile.count} ${t('ui.pieces')}`)
	b.title = `${letterName(tile)} · ${tile.value} ${t('ui.points')} · ${tile.count}×`
	const part = (cls, text) => {
		const span = document.createElement('span')
		span.className = cls
		span.setAttribute('aria-hidden', 'true')
		span.textContent = text
		return span
	}
	b.append(
		part('l', tile.letter === '_' ? '' : tile.letter),
		part('v', settings.showValue && (tile.value > 0 || settings.showZero) ? tile.value : ''),
		part('c', `${tile.count}×`),
	)
	b.addEventListener('click', () => {
		selected = i
		setView('tile')
		renderTileList()
	})
	return b
}

function renderTileList() {
	const list = tileList(settings)
	if (selected >= list.length) selected = 0
	const el = $('tile-list')
	el.classList.toggle('selecting', selectionMode(settings))
	el.replaceChildren(
		...list.map((tile, i) => {
			const chip = tileChip(tile, i)
			if (!selectionMode(settings)) return chip
			const n = selectedCount(settings, tile)
			const value = document.createElement('span')
			value.textContent = n
			value.setAttribute('aria-label', t('ui.selectedCount', { x: letterName(tile), n }))
			const stepper = document.createElement('div')
			stepper.className = 'stepper' + (n ? ' on' : '')
			stepper.append(stepButton(tile, 'minus', n), value, stepButton(tile, 'plus', n))
			const cell = document.createElement('div')
			cell.className = 'cell'
			cell.append(chip, stepper)
			return cell
		}),
	)
	$('selection-tools').hidden = !selectionMode(settings)
}

function renderSummary() {
	const total = expandedTiles(settings).length
	const n = plates(settings).length
	$('summary').textContent = `${selectionMode(settings) ? `${t('ui.selected')} ` : ''}${count(total, 'n.tiles')} · ${count(n, 'n.plates')}`
	const dl = $('dl-set')
	dl.textContent = selectionMode(settings) ? t('ui.downloadSelection') : t('ui.downloadSet')
	dl.disabled = total === 0

	const sel = $('plate-select')
	sel.replaceChildren(...Array.from({ length: n }, (_, i) => new Option(t('ui.plateOf', { i: i + 1, n }), String(i))))
	if (plateIndex >= n) plateIndex = 0
	sel.value = String(plateIndex)
	sel.hidden = view !== 'plate' || n < 2
}

const currentTips = () =>
	slicerTips(
		settings,
		tileList(settings)
			.map((tile) => ({ tile, info: tileCache.get(tileKey(tile)) }))
			.filter((b) => b.info),
	)

function renderTips() {
	$('hint').replaceChildren(
		...currentTips().map((tip) => {
			const li = document.createElement('li')
			li.textContent = tip.text
			if (tip.warn) li.className = 'warn'
			return li
		}),
	)
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

// ---------- Formulář ----------

const form = createForm($('settings'), settings, {
	onChange: (_id, geometry) => onChange(geometry),
	onFont: loadFont,
	onFontFile: useCustomFont,
	onReset: () => {
		const lang = settings.lang
		for (const f of FIELDS) if ('def' in f) settings[f.id] = f.def
		settings.selection = {}
		settings.lang = lang
		form.write()
		loadFont(settings.font).then(() => onChange(true))
	},
})

// ---------- Export a sdílení ----------

function download(data, name) {
	const type = name.endsWith('.zip') ? 'application/zip' : 'application/octet-stream'
	const url = URL.createObjectURL(new Blob([data], { type }))
	const a = document.createElement('a')
	a.href = url
	a.download = name
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function runExport(button, payload) {
	button.disabled = true
	try {
		const { name, data } = await call(
			'export',
			{
				...payload,
				params: geometryParams(settings),
				flip: effectiveFaceDown(settings) ? settings.thickness : null,
				colors: { body: settings.bodyColor, letters: settings.letterColor },
				bed: bedSize(settings),
				labels: {
					body: t('part.body'),
					letters: t('part.letters'),
					blank: t('ui.blank'),
					bodyFile: t('file.body'),
					lettersFile: t('file.letters'),
					progressPlate: t('status.progressPlate'),
					zipping: t('status.zipping'),
				},
			},
			{ onProgress: (text) => setStatus(text) },
		)
		download(data, name)
		clearBusyStatus()
	} catch (err) {
		console.error(err)
		setStatus(t('status.exportError', { msg: err.message }), { error: true })
	} finally {
		button.disabled = false
	}
}

function downloadTile(e) {
	const tile = tileList(settings)[selected]
	if (!tile) return
	const prefix = `scrabble-${fileSafe(tile.letter, t('file.blank'))}-${tile.value}`
	runExport(e.currentTarget, {
		groups: [{ prefix, placed: [{ letter: tile.letter, value: tile.value, x: 0, y: 0 }] }],
		zipName: `${prefix}.zip`,
	})
}

function downloadSet(e) {
	const groups = plates(settings).map((plate, i) => ({
		prefix: `${t('file.plate')}-${String(i + 1).padStart(2, '0')}`,
		placed: plate.map(({ letter, value, x, y }) => ({ letter, value, x, y })),
	}))
	const readme = [
		`${t('app.title')} – https://github.com/FilipChalupa/scrabble-3d-generator`,
		'',
		`${t('readme.style')}: ${t(`o.style.${settings.style}`)}`,
		`${t('readme.tile')}: ${settings.size} × ${settings.size} × ${settings.thickness} mm`,
		`${t('readme.faceDown')}: ${effectiveFaceDown(settings) ? t('readme.yes') : t('readme.no')}`,
		'',
		...groups.map((g) => `${g.prefix}: ${count(g.placed.length, 'n.tiles')} – ${g.placed.map((p) => p.letter).join(' ')}`),
		'',
		t('readme.tips'),
		...currentTips().map((tip) => `- ${tip.text}`),
		'',
	].join('\n')
	runExport(e.currentTarget, { groups, readme, zipName: `${t('file.set')}.zip` })
}

async function share() {
	const url = new URL(location.href)
	url.hash = shareHash(settings)
	const note = settings.font === 'custom' ? t('status.sharedFont') : ''
	try {
		await navigator.clipboard.writeText(url.href)
		setStatus(t('status.shared') + note, { info: true })
	} catch {
		window.prompt(t('status.sharePrompt'), url.href)
	}
}

// ---------- Jazyk ----------

function applyStaticTexts() {
	for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
	for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle)
	for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria))
	document.querySelector('meta[name="description"]').content = t('app.description')
}

function changeLanguage(lang) {
	settings.lang = lang
	setLanguage(lang)
	applyStaticTexts()
	form.render()
	showCustomFontOption()
	saveSettings()
	renderTileList()
	renderSummary()
	renderTips()
	applyFlip()
}

// ---------- Start ----------

setLanguage(settings.lang)
applyStaticTexts()
const langSelect = $('lang')
for (const [code, { name }] of Object.entries(LANGUAGES)) langSelect.add(new Option(name, code))
langSelect.value = settings.lang
langSelect.addEventListener('change', () => changeLanguage(langSelect.value))
form.render()

for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view))
$('plate-select').addEventListener('change', (e) => {
	plateIndex = Number(e.target.value)
	redraw()
})
$('flip').addEventListener('click', () => {
	userFlip = !userFlip
	applyFlip()
})
$('dl-tile').addEventListener('click', downloadTile)
$('dl-set').addEventListener('click', downloadSet)
$('share').addEventListener('click', share)
$('select-all').addEventListener('click', () => {
	settings.selection = Object.fromEntries(tileList(settings).map((tile) => [tileKey(tile), tile.count]))
	onChange(false)
})
$('select-none').addEventListener('click', () => {
	settings.selection = {}
	onChange(false)
})

renderTileList()
renderSummary()
try {
	await loadFont(settings.font)
	saveSettings()
	await redraw()
	if (loaded.fromLink) setStatus(t('status.fromLink'), { info: true })
} catch {}
