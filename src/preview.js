// 3D náhled kamene nebo podložky (three.js).

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export function trisToGeometry(tris) {
	const g = new THREE.BufferGeometry()
	g.setAttribute('position', new THREE.BufferAttribute(tris, 3))
	g.computeVertexNormals()
	return g
}

export function createPreview(el) {
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	el.append(renderer.domElement)

	const scene = new THREE.Scene()
	const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000)
	camera.up.set(0, 0, 1)
	const controls = new OrbitControls(camera, renderer.domElement)
	controls.enableDamping = true

	scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.6))
	const sun = new THREE.DirectionalLight(0xffffff, 2.2)
	sun.position.set(-40, -60, 120)
	const rim = new THREE.DirectionalLight(0xffffff, 0.6)
	rim.position.set(60, 80, 40)
	scene.add(sun, rim)

	const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0 })
	const accentMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 })
	const content = new THREE.Group()
	const bedGroup = new THREE.Group()
	scene.add(content, bedGroup)

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

	new ResizeObserver(() => {
		const { clientWidth: w, clientHeight: h } = el
		renderer.setSize(w, h, false)
		camera.aspect = w / Math.max(1, h)
		camera.updateProjectionMatrix()
	}).observe(el)

	renderer.setAnimationLoop(() => {
		controls.update()
		renderer.render(scene, camera)
	})

	return {
		setColors(body, letters) {
			bodyMat.color.set(body)
			accentMat.color.set(letters)
		},

		// items: [{ geo: { body, accent }, x, y }]; bed: { x, y } pro podložku, jinak null.
		show(items, { size, bed }) {
			content.clear()
			bedGroup.clear()
			for (const { geo, x, y } of items) {
				const body = new THREE.Mesh(geo.body, bodyMat)
				const accent = new THREE.Mesh(geo.accent, accentMat)
				body.position.set(x, y, 0)
				accent.position.set(x, y, 0)
				content.add(body, accent)
			}
			if (bed) {
				const corners = [
					[-1, -1],
					[1, -1],
					[1, 1],
					[-1, 1],
				].map(([sx, sy]) => new THREE.Vector3((sx * bed.x) / 2, (sy * bed.y) / 2, 0))
				bedGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineBasicMaterial({ color: 0x888888 })))
				frame(bed.x, bed.y, `plate:${bed.x}x${bed.y}`)
			} else {
				frame(size, size, `tile:${size}`)
			}
		},

		// Otočení obsahu o 180° kolem osy Y (pohled na spodek / tisk lícem dolů).
		setFlip(flipped, top) {
			content.rotation.y = flipped ? Math.PI : 0
			content.position.z = flipped ? top : 0
		},
	}
}
