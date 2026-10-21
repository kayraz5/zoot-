import * as THREE from 'three'
import { PAGE_W, PAGE_H } from './pageArt.js'
import { DEFAULT_COVER } from '../../model/services/brand.js'

// 3D flip passport. Each leaf hinges on the spine (x = 0): page 2i on its front, page 2i + 1 on its back.

const BOOK_W = 1
const BOOK_H = 1.4
const CURL_SEGMENTS = 28
const LEAF_GAP = 0.0045 // stops stacked leaves from z-fighting
const FLIP_SPEED = 1.9 // leaves per second

export class PassportBook {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{pageCount:number, paint:(i:number, ctx:CanvasRenderingContext2D)=>void, coverColor:string}} options
   */
  constructor(canvas, { pageCount, paint, coverColor = DEFAULT_COVER }) {
    this.canvas = canvas
    this.paint = paint
    this.pageCount = pageCount
    this.leafCount = Math.ceil(pageCount / 2)
    this.spread = 0 // number of leaves turned
    this.cameraX = BOOK_W / 2
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
    this.backCover = new THREE.Mesh(
      new THREE.BoxGeometry(BOOK_W + 0.04, 0.03, BOOK_H + 0.04),
      new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.8 })
    )
    this.backCover.position.set(BOOK_W / 2, -0.02, 0)
    this.scene.add(this.backCover)

    this.pages = Array.from({ length: pageCount }, (_, i) => this.makePage(i))
    this.leaves = Array.from({ length: this.leafCount }, (_, i) => this.makeLeaf(i))
    this.leaves.forEach((leaf) => this.bendLeaf(leaf))

    this.stampTool = this.makeStampTool()
    this.scene.add(this.stampTool)

    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement || canvas)
    this.lastFrame = performance.now()
    this.loop = this.loop.bind(this)
    this.frameId = requestAnimationFrame(this.loop)
  }

  // Soft shadow under the book
  makeShadow() {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(64, 64, 10, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(0,0,0,0.35)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false })
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(0, -0.05, 0.05)
    return shadow
  }

  // Each page is a canvas drawn by paint() and used as a texture
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

  // A leaf is a strip of CURL_SEGMENTS quads; the front and back meshes share the same vertices
  makeLeaf(i) {
    const columns = CURL_SEGMENTS + 1
    const front = new THREE.BufferGeometry()
    front.setAttribute('position', new THREE.BufferAttribute(new Float32Array(columns * 2 * 3), 3))
    front.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(columns * 2 * 3), 3))

    const frontUv = new Float32Array(columns * 4)
    const backUv = new Float32Array(columns * 4) // mirrored so the back page isn't flipped
    const triangles = []
    for (let col = 0; col < columns; col++) {
      const u = col / CURL_SEGMENTS
      // Each column has a top vertex (v = 1) and a bottom vertex (v = 0)
      frontUv.set([u, 1, u, 0], col * 4)
      backUv.set([1 - u, 1, 1 - u, 0], col * 4)
      if (col < CURL_SEGMENTS) {
        const a = col * 2
        triangles.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
      }
    }
    front.setIndex(triangles)
    front.setAttribute('uv', new THREE.BufferAttribute(frontUv, 2))

    const back = new THREE.BufferGeometry()
    back.setIndex(front.getIndex())
    back.setAttribute('position', front.getAttribute('position'))
    back.setAttribute('normal', front.getAttribute('normal'))
    back.setAttribute('uv', new THREE.BufferAttribute(backUv, 2))

    const frontPage = this.pages[i * 2]
    const backPage = this.pages[i * 2 + 1]
    const frontMesh = new THREE.Mesh(front, new THREE.MeshStandardMaterial({ map: frontPage.texture, roughness: 0.92, side: THREE.FrontSide }))
    const backMesh = new THREE.Mesh(back, new THREE.MeshStandardMaterial({
      map: backPage?.texture || null,
      color: backPage ? 0xffffff : 0xfff8dc,
      roughness: 0.92,
      side: THREE.BackSide
    }))
    frontMesh.frustumCulled = false
    backMesh.frustumCulled = false
    this.scene.add(frontMesh, backMesh)

    // progress: 0 = lying on the right, 1 = turned to the left
    return { i, front, frontMesh, backMesh, progress: 0, target: 0, delay: 0 }
  }

  // Rotate the leaf around the spine by progress × 180°, curling it mid-turn
  bendLeaf(leaf) {
    const positions = leaf.front.getAttribute('position')
    const angle = leaf.progress * Math.PI
    const curl = 0.6 * Math.sin(leaf.progress * Math.PI)

    // Stack height: leaves on the right pile up in reverse order to leaves on the left
    const heightOnRight = (this.leafCount - leaf.i) * LEAF_GAP
    const heightOnLeft = (leaf.i + 1) * LEAF_GAP
    const height = heightOnRight + (heightOnLeft - heightOnRight) * leaf.progress

    const step = BOOK_W / CURL_SEGMENTS
    let x = 0
    let y = 0
    for (let col = 0; col <= CURL_SEGMENTS; col++) {
      if (col > 0) {
        const segmentAngle = angle - curl * ((col - 0.5) / CURL_SEGMENTS)
        x += Math.cos(segmentAngle) * step
        y += Math.sin(segmentAngle) * step
      }
      positions.setXYZ(col * 2, x, y + height, -BOOK_H / 2)
      positions.setXYZ(col * 2 + 1, x, y + height, BOOK_H / 2)
    }
    positions.needsUpdate = true
    leaf.front.computeVertexNormals()
    leaf.front.computeBoundingSphere()
  }

  // Rubber stamp: yellow handle, black block, coloured ink pad
  makeStampTool() {
    const tool = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.6 })

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.32, 12), wood)
    handle.position.y = 0.26
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), wood)
    knob.position.y = 0.45
    const block = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 24), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }))
    block.position.y = 0.07

    this.stampInk = new THREE.MeshStandardMaterial({ color: 0xf83878, roughness: 0.4 })
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 24), this.stampInk)
    pad.position.y = 0.012

    tool.add(handle, knob, block, pad)
    tool.visible = false
    return tool
  }

  // Fit the whole open book in view
  resize() {
    const container = this.canvas.parentElement || this.canvas
    const width = container.clientWidth || 300
    const height = container.clientHeight || 300
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const viewSize = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    this.cameraDistance = Math.max(1.75 / viewSize, 2.25 / (viewSize * this.camera.aspect)) * 1.02
  }

  repaint(i) {
    const page = this.pages[i]
    if (!page) return
    this.paint(i, page.ctx)
    page.texture.needsUpdate = true
  }

  repaintAll() {
    this.pages.forEach((_, i) => this.repaint(i))
  }

  setCoverColor(color) {
    this.backCover.material.color.set(color)
  }

  // Turn to spread k (0 = closed cover, leafCount = closed on the back). Resolves when the pages settle.
  flipTo(k) {
    k = Math.max(0, Math.min(this.leafCount, k))
    const from = this.spread
    this.spread = k

    // Leaves turn one after another, not all at once
    const turning = k > from ? this.leaves.slice(from, k) : this.leaves.slice(k, from).reverse()
    turning.forEach((leaf, n) => (leaf.delay = n * 0.14))
    this.leaves.forEach((leaf) => (leaf.target = leaf.i < k ? 1 : 0))

    return new Promise((resolve) => (this.onSettled = resolve))
  }

  next() { return this.flipTo(this.spread + 1) }
  prev() { return this.flipTo(this.spread - 1) }

  spreadForPage(i) {
    return i % 2 === 0 ? i / 2 : (i + 1) / 2
  }

  // 3D position of canvas pixel (cx, cy) on page i while the book is open at that page
  pagePoint(i, cx, cy) {
    const z = -BOOK_H / 2 + (cy / PAGE_H) * BOOK_H
    const u = cx / PAGE_W
    const x = i % 2 === 0 ? u * BOOK_W : (u - 1) * BOOK_W
    return new THREE.Vector3(x, 0.03, z)
  }

  // Drop the rubber stamp on page i at (cx, cy). onImpact runs the moment it hits.
  slam(i, cx, cy, ink, onImpact) {
    const at = this.pagePoint(i, cx, cy)
    this.stampInk.color.set(ink)
    this.slamState = { time: 0, at, onImpact, hit: false, ink }
    this.stampTool.visible = true
    return new Promise((resolve) => (this.slamDone = resolve))
  }

  // Slam animation: hover → drop → squash on impact → lift away
  stepSlam(dt) {
    const slam = this.slamState
    if (!slam) return
    slam.time += dt
    const t = slam.time
    let height
    let squash = 1

    if (t < 0.45) {
      const k = t / 0.45
      height = 0.55 - 0.15 * k + Math.sin(t * 20) * 0.01
      this.stampTool.scale.setScalar(Math.min(1, k * 1.6))
      this.stampTool.rotation.z = Math.sin(t * 9) * 0.08
    } else if (t < 0.56) {
      const k = (t - 0.45) / 0.11
      height = 0.4 - 0.4 * k * k
      this.stampTool.rotation.z = 0
    } else if (t < 0.8) {
      height = 0
      squash = 1 - 0.18 * Math.sin(((t - 0.56) / 0.24) * Math.PI)
      if (!slam.hit) {
        slam.hit = true
        this.shake = 0.35
        this.addShockwave(slam.at, slam.ink)
        slam.onImpact?.()
      }
    } else if (t < 1.25) {
      const k = (t - 0.8) / 0.45
      height = k * k * 0.7
      this.stampTool.scale.setScalar(1 - k * 0.9)
    } else {
      this.stampTool.visible = false
      this.slamState = null
      this.slamDone?.()
      return
    }

    this.stampTool.position.set(slam.at.x, slam.at.y + height, slam.at.z)
    this.stampTool.scale.y = this.stampTool.scale.x * squash
  }

  // Expanding ink ring where the stamp lands
  addShockwave(at, ink) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.13, 40),
      new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.7, depthWrite: false })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(at).add(new THREE.Vector3(0, 0.01, 0))
    this.scene.add(ring)
    this.effects.push({ mesh: ring, time: 0 })
  }

  updateLeaves(dt) {
    let moving = false
    for (const leaf of this.leaves) {
      if (leaf.progress === leaf.target) continue
      if (leaf.delay > 0) {
        leaf.delay -= dt
        moving = true
        continue
      }
      const direction = Math.sign(leaf.target - leaf.progress)
      leaf.progress = Math.max(0, Math.min(1, leaf.progress + direction * FLIP_SPEED * dt))
      const passedTarget = direction > 0 ? leaf.progress >= leaf.target : leaf.progress <= leaf.target
      if (passedTarget) leaf.progress = leaf.target
      this.bendLeaf(leaf)
      moving = true
    }

    if (!moving && this.onSettled) {
      const settle = this.onSettled
      this.onSettled = null
      settle()
    }
  }

  updateEffects(dt) {
    for (const effect of this.effects) {
      effect.time += dt
      effect.mesh.scale.setScalar(1 + effect.time * 9)
      effect.mesh.material.opacity = Math.max(0, 0.7 - effect.time * 1.6)
    }
    this.effects = this.effects.filter((effect) => {
      if (effect.time < 0.5) return true
      this.scene.remove(effect.mesh)
      effect.mesh.geometry.dispose()
      effect.mesh.material.dispose()
      return false
    })
  }

  // Slide the camera to the open pages, add shake after a slam, then render
  updateCamera(dt) {
    const targetX = this.spread === 0 ? BOOK_W / 2 : this.spread === this.leafCount ? -BOOK_W / 2 : 0
    this.cameraX += (targetX - this.cameraX) * (1 - Math.exp(-dt * 5))

    this.shake = Math.max(0, this.shake - dt)
    const jitter = this.shake * 0.05
    const elevation = THREE.MathUtils.degToRad(58)
    this.camera.position.set(
      this.cameraX + (Math.random() - 0.5) * jitter,
      Math.sin(elevation) * this.cameraDistance + (Math.random() - 0.5) * jitter,
      Math.cos(elevation) * this.cameraDistance + 0.05
    )
    this.camera.lookAt(this.cameraX, 0, 0.08)
  }

  loop() {
    if (this.disposed) return
    this.frameId = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now

    this.updateLeaves(dt)
    this.stepSlam(dt)
    this.updateEffects(dt)
    this.updateCamera(dt)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frameId)
    this.resizeObserver?.disconnect()
    this.scene.traverse((object) => {
      if (object.isMesh) {
        object.geometry?.dispose()
        object.material?.map?.dispose()
        object.material?.dispose()
      }
    })
    this.pages.forEach((page) => page.texture.dispose())
    this.renderer.dispose()
  }
}
