// Volání Web Workeru (src/worker.js) jako slibů, včetně hlášení průběhu.

export function createWorkerClient(onCrash) {
	const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
	const pending = new Map()
	let seq = 0

	worker.onmessage = ({ data }) => {
		const p = pending.get(data.id)
		if (!p) return
		if ('progress' in data) return p.onProgress?.(data.progress)
		pending.delete(data.id)
		if ('error' in data) p.reject(new Error(data.error))
		else p.resolve(data.result)
	}
	worker.onerror = (e) => onCrash(e.message || '?')

	return function call(type, payload, { transfer = [], onProgress } = {}) {
		return new Promise((resolve, reject) => {
			const id = ++seq
			pending.set(id, { resolve, reject, onProgress })
			worker.postMessage({ id, type, payload }, transfer)
		})
	}
}
