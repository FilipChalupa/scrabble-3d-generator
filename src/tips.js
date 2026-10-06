// Tipy pro tisk a upozornění podle nastavení a vygenerovaných kamenů (čisté funkce).

import { t, getLanguage } from './i18n.js'
import { effectiveFaceDown, hasMark } from './settings.js'

export const mm = (v) => `${(+v.toFixed(2)).toLocaleString(getLanguage())} mm`

export const letterName = (tile) => (tile.letter === '_' ? t('ui.blank') : tile.letter)

// Souvislá délka obrysu (mm), od které se úzký tah či mezera hlásí; kratší úseky jsou rohy.
export const THIN_LIMIT = 1

// Dvoubarevné vrstvy u zapuštěných písmen (číslováno od 1 = první vrstva na podložce).
export function inlayLayers(s) {
	const n = Math.max(1, Math.round(Math.min(s.depth, s.thickness - 0.2) / s.layerHeight))
	if (effectiveFaceDown(s)) return { from: 1, to: n, count: n }
	const total = Math.round(s.thickness / s.layerHeight)
	return { from: total - n + 1, to: total, count: n }
}

// built: [{ tile, info: { missing: [], overflow: bool, thin: { strokes, gaps } } }] pro kameny, které už worker postavil.
export function slicerTips(s, built = []) {
	const lh = s.layerHeight
	const T = s.thickness
	const faceDown = effectiveFaceDown(s)
	const tips = []
	const warn = (text) => tips.push({ text, warn: true })
	const tip = (text) => tips.push({ text })

	const missing = [...new Set(built.flatMap((b) => b.info.missing))]
	if (missing.length) warn(t('tip.missing', { chars: missing.join(' ') }))
	const overflow = built.filter((b) => b.info.overflow).map((b) => letterName(b.tile))
	if (overflow.length) warn(t('tip.overflow', { list: overflow.join(', ') }))
	const thinList = (kind) => built.filter((b) => (b.info.thin?.[kind] ?? 0) > THIN_LIMIT).map((b) => letterName(b.tile))
	const strokes = thinList('strokes')
	if (strokes.length) warn(t('tip.thinStrokes', { lw: mm(s.lineWidth), list: strokes.join(', ') }))
	const gaps = thinList('gaps')
	if (gaps.length) warn(t('tip.thinGaps', { lw: mm(s.lineWidth), list: gaps.join(', ') }))

	if (s.style === 'engraved') tip(t('tip.engraved'))
	else if (s.style === 'inlay') {
		tip(t('tip.inlay'))
		const layers = inlayLayers(s)
		tip(t('tip.inlayLayers', { from: layers.from, to: layers.to, n: layers.count, depth: mm(layers.count * lh) }))
	} else tip(t('tip.raised', { layer: Math.round(T / lh) + 1, z: mm(T + lh), t: mm(T) }))

	if (faceDown) tip(t('tip.faceDown'))
	else if (s.style !== 'raised') tip(t('tip.faceUp'))

	const checks = [[t('check.thickness'), T]]
	if (s.style === 'raised') checks.push([t('check.height'), s.height])
	else checks.push([t('check.depth'), s.depth])
	if (hasMark(s)) checks.push([t('check.mark'), s.markDepth])
	for (const [label, v] of checks) {
		const layers = v / lh
		if (Math.abs(layers - Math.round(layers)) > 0.01) {
			warn(t('tip.layers', { label, v: mm(v), lh: mm(lh), rec: mm(Math.max(1, Math.round(layers)) * lh) }))
		}
	}

	if (hasMark(s) && !faceDown) tip(t('tip.mark'))
	return tips
}
