import * as THREE from 'three'

export class ArSession {
  constructor(renderer, scene, camera, garden) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.garden = garden

    this.hitTestSource = null
    this.refSpace = null
    this.placed = false

    this.reticle = this._buildReticle()
    scene.add(this.reticle)

    this.raycaster = new THREE.Raycaster()
    this.touch = new THREE.Vector2()

    this._onTapBound = this._onTap.bind(this)
  }

  _buildReticle() {
    const geo = new THREE.RingGeometry(0.07, 0.09, 32)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.visible = false
    mesh.matrixAutoUpdate = false
    return mesh
  }

  async start() {
    const btn = document.getElementById('ar-button')
    btn.textContent = 'Starting…'
    btn.disabled = true

    // iOS — no WebXR AR support
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (isIOS) {
      document.getElementById('ios-notice').textContent =
        'AR requires Android Chrome. Showing 3D preview.'
      this._startPreviewMode()
      return
    }

    if (!navigator.xr) {
      this._startPreviewMode()
      return
    }

    const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)
    if (!supported) {
      document.getElementById('ios-notice').textContent =
        'AR not supported on this device. Showing 3D preview.'
      this._startPreviewMode()
      return
    }

    try {
      // hit-test optional so devices without ARCore surface detection still open
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: [],
        optionalFeatures: ['hit-test', 'dom-overlay'],
        domOverlay: { root: document.getElementById('overlay') },
      })

      this.renderer.xr.setReferenceSpaceType('local')
      await this.renderer.xr.setSession(session)

      // Request hit-test only if the feature was granted
      try {
        this.refSpace = await session.requestReferenceSpace('viewer')
        this.hitTestSource = await session.requestHitTestSource({ space: this.refSpace })
      } catch {
        // Hit-test unavailable — tap-to-place won't work but AR passthrough will
        this.hitTestSource = null
      }

      document.getElementById('intro').style.display = 'none'
      document.getElementById('hud').style.display = 'block'
      document.getElementById('hint-text').textContent =
        this.hitTestSource ? 'Scanning surface…' : 'Move around to explore'

      this.renderer.domElement.addEventListener('click', this._onTapBound)
    } catch (err) {
      console.error('AR session failed:', err)
      document.getElementById('ios-notice').textContent =
        `Could not start AR: ${err.message ?? err}`
      btn.textContent = 'Enter Garden'
      btn.disabled = false
    }
  }

  // 3D preview fallback — place garden in front of camera, orbit controls
  _startPreviewMode() {
    document.getElementById('intro').style.display = 'none'
    document.getElementById('hud').style.display = 'block'
    document.getElementById('hint-text').textContent = '3D Preview · Tap a flower'

    // Place garden at a fixed position in front of camera
    this.garden.place(new THREE.Vector3(0, -0.5, -2))
    this.placed = true

    this.renderer.domElement.addEventListener('click', this._onTapBound)

    // Simple orbit on drag
    this._addOrbitDrag()
  }

  _addOrbitDrag() {
    let startX = 0
    const group = this.garden.anchor
    this.renderer.domElement.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX }, { passive: true })
    this.renderer.domElement.addEventListener('touchmove', (e) => {
      const dx = e.touches[0].clientX - startX
      group.rotation.y += dx * 0.005
      startX = e.touches[0].clientX
    }, { passive: true })
    this.renderer.domElement.addEventListener('mousedown', (e) => { startX = e.clientX })
    this.renderer.domElement.addEventListener('mousemove', (e) => {
      if (e.buttons !== 1) return
      group.rotation.y += (e.clientX - startX) * 0.005
      startX = e.clientX
    })
  }

  update(frame) {
    if (!frame || !this.hitTestSource || this.placed) return

    const results = frame.getHitTestResults(this.hitTestSource)
    if (results.length > 0) {
      const pose = results[0].getPose(this.renderer.xr.getReferenceSpace())
      this.reticle.visible = true
      this.reticle.matrix.fromArray(pose.transform.matrix)
      document.getElementById('hint-text').textContent = 'Tap to place the garden'
    } else {
      this.reticle.visible = false
      document.getElementById('hint-text').textContent = 'Scanning surface…'
    }
  }

  _onTap(event) {
    const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? window.innerWidth / 2
    const clientY = event.clientY ?? event.touches?.[0]?.clientY ?? window.innerHeight / 2

    // Place garden on first tap (AR mode)
    if (!this.placed && this.reticle.visible) {
      const pos = new THREE.Vector3()
      pos.setFromMatrixPosition(this.reticle.matrix)
      this.garden.place(pos)
      this.placed = true
      this.reticle.visible = false
      document.getElementById('hint-text').textContent = 'Touch a flower to wake it'
      return
    }

    // Raycast against flower hitboxes
    if (this.placed) {
      this.touch.set(
        (clientX / window.innerWidth) * 2 - 1,
        -(clientY / window.innerHeight) * 2 + 1
      )
      this.raycaster.setFromCamera(this.touch, this.camera)
      const hits = this.raycaster.intersectObjects(this.garden.getHitboxes())
      if (hits.length > 0) {
        hits[0].object.userData.flower.trigger()
      }
    }
  }
}
