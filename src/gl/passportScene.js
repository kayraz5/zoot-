import * as THREE from 'three'
import { PAGE_W, PAGE_H } from './pageArt.js'
import { DEFAULT_COVER } from '../lib/brand.js'

/**
 * 3D flip passport (Shrey's set piece).
 * Leaves hinge on the spine (z axis at x = 0). Leaf i shows page 2i on its front
 * (right-hand side) and page 2i+1 on its back (left-hand side once flipped).
 * Pages curl while turning; a rubber stamp can slam a chop onto any page.
 */
const W = 1
const H = 1.4
const SEG = 28
const EPS = 0.0045
const FLIP_SPEED = 1.9 // leaves per second

export class PassportBook {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{pageCount:number, paint:(i:number, ctx:CanvasRenderingContext2D)=>void, coverColor:string}} opts
   */
  constructor(canvas, { pageCount, paint, coverColor = DEFAULT_COVER }) {
    this.canvas = canvas
    this.paint = paint
    this.pageCount = pageCount
    this.leafCount = Math.ceil(pageCount / 2)
    this.spread = 0
    this.camX = W / 2
    this.shake = 0
    this.effects = []
    this.disposed = false

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xffe9a0, 2.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-1.5, 4, 2.5)
    this.scene.add(sun)

    this.scene.add(this.makeShadow())
    this.backBoard = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.03, H + 0.04), new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.8 }))
    this.backBoard.position.set(W / 2, -0.02, 0)
    this.scene.add(this.backBoard)

    this.pages = Array.from({ length: pageCount }, (_, i) => this.makePage(i))
    this.leaves = Array.from({ length: this.leafCount }, (_, i) => this.makeLeaf(i))
    this.leaves.forEach((l) => this.deform(l))

    this.tool = this.makeStampTool()
    this.scene.add(this.tool)

    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas.parentElement || canvas)
    this.last = performance.now()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  makeShadow() {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64)
    g.addColorStop(0, 'rgba(0,0,0,0.35)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
    m.rotation.x = -Math.PI / 2
    m.position.set(0, -0.05, 0.05)
    return m
  }

  makePage(i) {
    const canvas = document.createElement('canvas')
    canvas.width = PAGE_W
    canvas.height = PAGE_H
    const ctx = canvas.getContext('2d')
    this.paint(i, ctx)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    return { canvas, ctx, texture }
  }

  makeLeaf(i) {
    const cols = SEG + 1
    const front = new THREE.BufferGeometry()
    front.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * 2 * 3), 3))
    front.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cols * 2 * 3), 3))
    const uvF = new Float32Array(cols * 4)
    const uvB = new Float32Array(cols * 4)
    const index = []
    for (let c = 0; c < cols; c++) {
      const u = c / SEG
      // j=0 top edge (v=1, z=-H/2), j=1 bottom edge (v=0, z=+H/2)
      uvF.set([u, 1, u, 0], c * 4)
      uvB.set([1 - u, 1, 1 - u, 0], c * 4)
      if (c < SEG) {
        const a = c * 2
        index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
      }
    }
    front.setIndex(index)
    front.setAttribute('uv', new THREE.BufferAttribute(uvF, 2))
    const back = new THREE.BufferGeometry()
    back.setIndex(front.getIndex())
    back.setAttribute('position', front.getAttribute('position'))
    back.setAttribute('normal', front.getAttribute('normal'))
    back.setAttribute('uv', new THREE.BufferAttribute(uvB, 2))

    const fp = this.pages[i * 2]
    const bp = this.pages[i * 2 + 1]
    const frontMesh = new THREE.Mesh(front, new THREE.MeshStandardMaterial({ map: fp.texture, roughness: 0.92, side: THREE.FrontSide }))
    const backMesh = new THREE.Mesh(back, new THREE.MeshStandardMaterial({ map: bp?.texture || null, color: bp ? 0xffffff : 0xfff8dc, roughness: 0.92, side: THREE.BackSide }))
    frontMesh.frustumCulled = backMesh.frustumCulled = false
    this.scene.add(frontMesh, backMesh)
    return { i, front, frontMesh, backMesh, p: 0, target: 0, delay: 0, dirty: true }
  }

  /** Bend the leaf: spine angle p·π with a trailing curl that vanishes when flat. */
  deform(leaf) {
    const pos = leaf.front.getAttribute('position')
    const A = leaf.p * Math.PI
    const curl = 0.6 * Math.sin(leaf.p * Math.PI)
    const right = (this.leafCount - leaf.i) * EPS
    const left = (leaf.i + 1) * EPS
    const yOff = right + (left - right) * leaf.p
    const step = W / SEG
    let x = 0
    let y = 0
    for (let c = 0; c <= SEG; c++) {
      if (c > 0) {
        const a = A - curl * ((c - 0.5) / SEG)
        x += Math.cos(a) * step
        y += Math.sin(a) * step
      }
      pos.setXYZ(c * 2, x, y + yOff, -H / 2)
      pos.setXYZ(c * 2 + 1, x, y + yOff, H / 2)
    }
    pos.needsUpdate = true
    leaf.front.computeVertexNormals()
    leaf.front.computeBoundingSphere()
  }

  makeStampTool() {
    const g = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.6 }) // yellow handle, ink block
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.32, 12), wood)
    handle.position.y = 0.26
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), wood)
    knob.position.y = 0.45
    const block = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 24), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }))
    block.position.y = 0.07
    this.toolInk = new THREE.MeshStandardMaterial({ color: 0xf83878, roughness: 0.4 })
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 24), this.toolInk)
    pad.position.y = 0.012
    g.add(handle, knob, block, pad)
    g.visible = false
    return g
  }

  resize() {
    const el = this.canvas.parentElement || this.canvas
    const w = el.clientWidth || 300
    const h = el.clientHeight || 300
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    this.camDist = Math.max(1.75 / t, 2.25 / (t * this.camera.aspect)) * 1.02
  }

  repaint(i) {
    const pg = this.pages[i]
    if (!pg) return
    this.paint(i, pg.ctx)
    pg.texture.needsUpdate = true
  }

  /** Spread k = k leaves turned. 0 = closed cover, leafCount = closed on the back. */
  flipTo(k) {
    k = Math.max(0, Math.min(this.leafCount, k))
    const from = this.spread
    this.spread = k
    const order = k > from ? this.leaves.slice(from, k) : this.leaves.slice(k, from).reverse()
    order.forEach((leaf, n) => (leaf.delay = n * 0.14))
    this.leaves.forEach((l) => (l.target = l.i < k ? 1 : 0))
    return new Promise((resolve) => (this.onSettled = resolve))
  }

  next() { return this.flipTo(this.spread + 1) }
  prev() { return this.flipTo(this.spread - 1) }

  spreadForPage(i) {
    return i % 2 === 0 ? i / 2 : (i + 1) / 2
  }

  /** World position of canvas pixel (cx, cy) on page i when that page is lying open. */
  pagePoint(i, cx, cy) {
    const z = -H / 2 + (cy / PAGE_H) * H
    const u = cx / PAGE_W
    const x = i % 2 === 0 ? u * W : (u - 1) * W
    return new THREE.Vector3(x, 0.03, z)
  }

  /** Drop the rubber stamp onto page i at canvas point (cx, cy). onImpact runs at contact. */
  slam(i, cx, cy, ink, onImpact) {
    const at = this.pagePoint(i, cx, cy)
    this.toolInk.color.set(ink)
    this.slamState = { t: 0, at, onImpact, hit: false, ink }
    this.tool.visible = true
    return new Promise((resolve) => (this.slamDone = resolve))
  }

  stepSlam(dt) {
    const s = this.slamState
    if (!s) return
    s.t += dt
    const t = s.t
    let y
    let squash = 1
    if (t < 0.45) {
      const k = t / 0.45
      y = 0.55 - 0.15 * k + Math.sin(t * 20) * 0.01
      this.tool.scale.setScalar(Math.min(1, k * 1.6))
      this.tool.rotation.z = Math.sin(t * 9) * 0.08
    } else if (t < 0.56) {
      const k = (t - 0.45) / 0.11
      y = 0.4 - 0.4 * k * k
      this.tool.rotation.z = 0
    } else if (t < 0.8) {
      y = 0
      squash = 1 - 0.18 * Math.sin(((t - 0.56) / 0.24) * Math.PI)
      if (!s.hit) {
        s.hit = true
        this.shake = 0.35
        this.addShockwave(s.at, s.ink)
        s.onImpact?.()
      }
    } else if (t < 1.25) {
      const k = (t - 0.8) / 0.45
      y = k * k * 0.7
      this.tool.scale.setScalar(1 - k * 0.9)
    } else {
      this.tool.visible = false
      this.slamState = null
      this.slamDone?.()
      return
    }
    this.tool.position.set(s.at.x, s.at.y + y, s.at.z)
    this.tool.scale.y = this.tool.scale.x * squash
  }

  addShockwave(at, ink) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 40), new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.7, depthWrite: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(at).add(new THREE.Vector3(0, 0.01, 0))
    this.scene.add(ring)
    this.effects.push({ mesh: ring, t: 0 })
  }

  loop() {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now

    let moving = false
    for (const leaf of this.leaves) {
      if (leaf.p === leaf.target) continue
      if (leaf.delay > 0) { leaf.delay -= dt; moving = true; continue }
      const dir = Math.sign(leaf.target - leaf.p)
      leaf.p = Math.max(0, Math.min(1, leaf.p + dir * FLIP_SPEED * dt))
      if ((dir > 0 && leaf.p >= leaf.target) || (dir < 0 && leaf.p <= leaf.target)) leaf.p = leaf.target
      this.deform(leaf)
      moving = true
    }
    if (!moving && this.onSettled) {
      const done = this.onSettled
      this.onSettled = null
      done()
    }

    const targetX = this.spread === 0 ? W / 2 : this.spread === this.leafCount ? -W / 2 : 0
    this.camX += (targetX - this.camX) * (1 - Math.exp(-dt * 5))
    this.stepSlam(dt)

    for (const fx of this.effects) {
      fx.t += dt
      fx.mesh.scale.setScalar(1 + fx.t * 9)
      fx.mesh.material.opacity = Math.max(0, 0.7 - fx.t * 1.6)
    }
    this.effects = this.effects.filter((fx) => {
      if (fx.t < 0.5) return true
      this.scene.remove(fx.mesh)
      fx.mesh.geometry.dispose()
      fx.mesh.material.dispose()
      return false
    })

    this.shake = Math.max(0, this.shake - dt)
    const jitter = this.shake * 0.05
    const elev = THREE.MathUtils.degToRad(58)
    this.camera.position.set(
      this.camX + (Math.random() - 0.5) * jitter,
      Math.sin(elev) * this.camDist + (Math.random() - 0.5) * jitter,
      Math.cos(elev) * this.camDist + 0.05
    )
    this.camera.lookAt(this.camX, 0, 0.08)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose()
        o.material?.map?.dispose()
        o.material?.dispose()
      }
    })
    this.pages.forEach((p) => p.texture.dispose())
    this.renderer.dispose()
  }
}
