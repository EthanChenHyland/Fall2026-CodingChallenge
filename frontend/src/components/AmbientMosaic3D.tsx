import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export function AmbientMosaic3D() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerWidth <= 700) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.z = 8

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.domElement.setAttribute('aria-hidden', 'true')
    mount.appendChild(renderer.domElement)

    const group = new THREE.Group()
    scene.add(group)
    const geometry = new THREE.PlaneGeometry(0.9, 0.62)
    const colors = [0xd9d2c7, 0x4d5bd1, 0xb7afa3, 0xe6dfd5, 0x857f77]
    const meshes = Array.from({ length: 18 }, (_, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: colors[index % colors.length],
        transparent: true,
        opacity: 0.12 + (index % 4) * 0.025,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      const column = index % 6
      const row = Math.floor(index / 6)
      mesh.position.set(
        (column - 2.5) * 1.34 + Math.sin(index * 1.7) * 0.26,
        (row - 1) * 1.4 + Math.cos(index * 0.9) * 0.34,
        -1.5 + (index % 4) * 0.42,
      )
      mesh.rotation.z = (index % 2 ? -1 : 1) * (0.05 + (index % 5) * 0.018)
      mesh.userData.baseY = mesh.position.y
      mesh.userData.phase = index * 0.72
      group.add(mesh)
      return mesh
    })

    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    const resize = () => {
      const width = Math.max(mount.clientWidth, 1)
      const height = Math.max(mount.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const pointer = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect()
      target.x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2
      target.y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2
    }
    const leave = () => {
      target.x = 0
      target.y = 0
    }

    let frame = 0
    const animate = (time: number) => {
      current.x += (target.x - current.x) * 0.045
      current.y += (target.y - current.y) * 0.045
      group.rotation.y = current.x * 0.075
      group.rotation.x = current.y * -0.05
      meshes.forEach((mesh) => {
        mesh.position.y = Number(mesh.userData.baseY) + Math.sin(time * 0.00042 + Number(mesh.userData.phase)) * 0.11
      })
      renderer.render(scene, camera)
      frame = window.requestAnimationFrame(animate)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    mount.parentElement?.addEventListener('pointermove', pointer)
    mount.parentElement?.addEventListener('pointerleave', leave)
    frame = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      mount.parentElement?.removeEventListener('pointermove', pointer)
      mount.parentElement?.removeEventListener('pointerleave', leave)
      meshes.forEach((mesh) => (mesh.material as THREE.Material).dispose())
      geometry.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="welcome-three-field" ref={mountRef} aria-hidden="true" />
}
