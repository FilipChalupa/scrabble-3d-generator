// Formulář nastavení generovaný z popisu skupin v settings.js.

import { PRESETS, BEDS } from './presets.js'
import { GROUPS, FIELDS } from './settings.js'
import { t } from './i18n.js'

const OPEN_KEY = 'scrabble3d:open-groups'

function readOpenGroups() {
	try {
		return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'))
	} catch {
		return new Set()
	}
}

function writeOpenGroups(open) {
	try {
		localStorage.setItem(OPEN_KEY, JSON.stringify([...open]))
	} catch {}
}

function createInput(f) {
	let input
	if (f.type === 'select') {
		input = document.createElement('select')
		for (const [value, label] of Object.entries(f.options)) input.add(new Option(label ?? t(`o.${f.id}.${value}`), value))
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
	return input
}

function createRow(f, input) {
	const row = document.createElement('label')
	row.className = `field field-${f.type}`
	row.dataset.field = f.id
	const label = document.createElement('span')
	label.className = 'label'
	label.textContent = t(`f.${f.id}`)
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
		help.textContent = t(`h.${f.id}`)
		row.append(help)
	}
	return row
}

// handlers: onChange(fieldId, geometryChanged), onFont(id), onFontFile(file), onReset()
export function createForm(el, settings, handlers) {
	const inputs = {}

	function render() {
		el.replaceChildren()
		const open = readOpenGroups()
		for (const g of GROUPS) {
			const rows = g.fields.map((f) => createRow(f, (inputs[f.id] = createInput(f))))
			if (g.advanced) {
				const details = document.createElement('details')
				details.className = 'group'
				details.open = open.has(g.id)
				const summary = document.createElement('summary')
				summary.textContent = t(`g.${g.id}`)
				details.append(summary, ...rows)
				details.addEventListener('toggle', () => {
					const now = readOpenGroups()
					if (details.open) now.add(g.id)
					else now.delete(g.id)
					writeOpenGroups(now)
				})
				el.append(details)
			} else {
				const fs = document.createElement('fieldset')
				const legend = document.createElement('legend')
				legend.textContent = t(`g.${g.id}`)
				fs.append(legend, ...rows)
				el.append(fs)
			}
		}

		const reset = document.createElement('button')
		reset.type = 'button'
		reset.className = 'btn link'
		reset.textContent = t('form.reset')
		reset.addEventListener('click', handlers.onReset)
		el.append(reset)
		write()
	}

	function write() {
		for (const f of FIELDS) {
			if (!('def' in f)) continue
			if (f.type === 'checkbox') inputs[f.id].checked = settings[f.id]
			else inputs[f.id].value = settings[f.id]
		}
		updateVisibility()
	}

	function updateVisibility() {
		for (const f of FIELDS) el.querySelector(`[data-field="${f.id}"]`).hidden = f.when ? !f.when(settings) : false
	}

	async function read(input, committed) {
		const f = FIELDS.find((x) => x.id === input.name)
		if (!f) return
		if (f.type === 'file') {
			if (committed && input.files[0]) await handlers.onFontFile(input.files[0])
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
			settings.bedX = inputs.bedX.value = b.x
			settings.bedY = inputs.bedY.value = b.y
		}
		if (f.id === 'font') await handlers.onFont(value)
		updateVisibility()
		handlers.onChange(f.id, f.id !== 'bodyColor' && f.id !== 'letterColor')
	}

	el.addEventListener('input', (e) => read(e.target, false))
	el.addEventListener('change', (e) => read(e.target, true))

	return { inputs, render, write }
}
