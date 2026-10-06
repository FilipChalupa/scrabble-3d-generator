// Seznam kamenů k tisku a jejich rozmístění na podložky (čisté funkce).

import { parseTiles } from './presets.js'
import { BED_MARGIN, bedSize, selectionMode } from './settings.js'

export const tileKey = (t) => `${t.letter}|${t.value}`

export const tileList = (s) => parseTiles(s.tiles)

export const selectedCount = (s, t) => s.selection[tileKey(t)] || 0

// Kameny k tisku: celá sada (× počet sad), nebo jen vybrané počty.
export function expandedTiles(s) {
	const list = []
	const repeat = (t, n) => {
		for (let i = 0; i < n; i++) list.push(t)
	}
	if (selectionMode(s)) {
		for (const t of tileList(s)) repeat(t, selectedCount(s, t))
	} else {
		for (let i = 0; i < s.sets; i++) for (const t of tileList(s)) repeat(t, t.count)
	}
	return list
}

// Rozmístění na podložky se středem v 0, 0; neúplná poslední řada je vycentrovaná.
export function plates(s) {
	const size = s.size
	const gap = s.gap
	const bed = bedSize(s)
	const step = size + gap
	const cols = Math.max(1, Math.floor((bed.x - 2 * BED_MARGIN + gap) / step))
	const rows = Math.max(1, Math.floor((bed.y - 2 * BED_MARGIN + gap) / step))
	const perPlate = cols * rows
	const all = expandedTiles(s)
	const out = []
	for (let i = 0; i < all.length; i += perPlate) {
		const chunk = all.slice(i, i + perPlate)
		const usedRows = Math.ceil(chunk.length / cols)
		out.push(
			chunk.map((t, j) => {
				const row = Math.floor(j / cols)
				const inRow = Math.min(cols, chunk.length - row * cols)
				return { ...t, x: ((j % cols) - (inRow - 1) / 2) * step, y: ((usedRows - 1) / 2 - row) * step }
			}),
		)
	}
	return out
}

// Bezpečný název souboru: bez diakritiky a zvláštních znaků.
export function fileSafe(text, blankName) {
	if (text === '_') return blankName
	return (
		text
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^\w-]/g, '') || 'x'
	)
}
