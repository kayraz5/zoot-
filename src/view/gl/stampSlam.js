import * as THREE from 'three'

// Transparent Three.js layer over the passport that drops a 3D rubber stamp onto the page.
// It only renders while a slam is playing.

const DURATION = 1.2 // seconds
const IMPACT = 0.5 // the stamp hits the paper here

export class StampSlam {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    // Camera looks down at the paper (the y = 0 plane) at about 50°, so the stamp reads as 3D
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
    this.camera.position.set(0, 9, 8)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateMatrixWorld() // needed before the first render, for paperPoint()
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xffe9a0, 1.8))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(-3, 8, 4)
    this.scene.add(sun)

    // Stamp, 1 unit wide: yellow knob and handle on a black block with a coloured ink pad
    this.ink = new THREE.MeshStandardMaterial({ color: 0xf83878 })
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 })
    const parts = [
      [new THREE.SphereGeometry(0.2, 24, 16), yellow, 0.95],
      [new THREE.CylinderGeometry(0.09, 0.12, 0.6, 24), yellow, 0.55],
      [new THREE.CylinderGeometry(0.48, 0.5, 0.2, 48), new THREE.MeshStandardMaterial({ color: 0x111111 }), 0.15],
      [new THREE.CylinderGeometry(0.47, 0.47, 0.05, 48), this.ink, 0.025]
    ]
    this.stamp = new THREE.Group()
    for (const [geometry, material, y] of parts) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.y = y
      this.stamp.add(mesh)
    }

    // Ink ring that spreads out on impact
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 48), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
    this.ring.rotation.x = -Math.PI / 2
    this.scene.add(this.stamp, this.ring)
    this.stamp.visible = this.ring.visible = false
  }

  // Canvas pixel → point on the paper
  paperPoint(x, y) {
    const ndc = new THREE.Vector2((x / this.canvas.clientWidth) * 2 - 1, 1 - (y / this.canvas.clientHeight) * 2)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, this.camera)
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
  }

  /** Slam down at canvas pixel (x, y) with a pad `size` px wide. onImpact runs as it hits; resolves when done. */
  slam({ x, y, size, ink }, onImpact) {
    const { clientWidth: width, clientHeight: height } = this.canvas
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    const at = this.paperPoint(x, y)
    const edge = this.paperPoint(x + size / 2, y)
    if (!at || !edge) return Promise.resolve()
    const scale = at.distanceTo(edge) * 2 // world units for one pad width

    this.ink.color.set(ink)
    this.ring.material.color.set(ink)
    this.stamp.position.copy(at)
    this.ring.position.set(at.x, 0.002, at.z)
    this.stamp.visible = true

    return new Promise((resolve) => {
      const start = performance.now()
      let hit = false
      const frame = (now) => {
        const t = (now - start) / 1000
        if (t >= DURATION) {
          this.stamp.visible = this.ring.visible = false
          this.renderer.render(this.scene, this.camera)
          return resolve()
        }

        if (t < IMPACT) {
          // Fall from above with a little wobble, speeding up
          const k = t / IMPACT
          this.stamp.position.y = scale * 1.6 * (1 - k * k)
          this.stamp.rotation.z = Math.sin(t * 9) * 0.1 * (1 - k)
          this.stamp.scale.setScalar(scale * Math.min(1, 0.4 + k))
        } else {
          if (!hit) {
            hit = true
            this.ring.visible = true
            onImpact?.()
          }
          // Squash on the paper, then lift away and shrink
          const k = (t - IMPACT) / (DURATION - IMPACT)
          const squash = k < 0.35 ? 1 - 0.2 * Math.sin((k / 0.35) * Math.PI) : 1
          const lift = Math.max(0, (k - 0.35) / 0.65)
          this.stamp.position.y = scale * 2 * lift * lift
          this.stamp.rotation.z = 0
          this.stamp.scale.set(scale * (1 - lift * 0.9), scale * (1 - lift * 0.9) * squash, scale * (1 - lift * 0.9))
          this.ring.scale.setScalar(scale * (1 + k * 3))
          this.ring.material.opacity = Math.max(0, 0.8 - k * 2)
        }
        this.renderer.render(this.scene, this.camera)
        this.frameId = requestAnimationFrame(frame)
      }
      this.frameId = requestAnimationFrame(frame)
    })
  }

  dispose() {
    cancelAnimationFrame(this.frameId)
    this.scene.traverse((object) => {
      if (!object.isMesh) return
      object.geometry.dispose()
      object.material.dispose()
    })
    this.renderer.dispose()
  }
}
