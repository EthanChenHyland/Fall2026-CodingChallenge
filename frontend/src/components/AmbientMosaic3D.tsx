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
    const geometry = new THREE.PlaneGeometry(1.02, 0.7)
    const colors = [0xd9d2c7, 0x4d5bd1, 0xb7afa3, 0xe6dfd5, 0x7d78c9, 0x857f77]
    const meshes = Array.from({ length: 22 }, (_, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: colors[index % colors.length],
        transparent: true,
        opacity: 0.2 + (index % 4) * 0.03,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      const column = index % 7
      const row = Math.floor(index / 7)
      mesh.position.set(
        (column - 3) * 1.26 + Math.sin(index * 1.7) * 0.3,
        (row - 1.15) * 1.5 + Math.cos(index * 0.9) * 0.36,
        -1.5 + (index % 4) * 0.42,
      )
      mesh.rotation.z = (index % 2 ? -1 : 1) * (0.05 + (index % 5) * 0.018)
      mesh.userData.baseX = mesh.position.x
      mesh.userData.baseY = mesh.position.y
      mesh.userData.baseRotation = mesh.rotation.z
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
      group.rotation.y = current.x * 0.095
      group.rotation.x = current.y * -0.065
      group.position.y = Math.sin(time * 0.00018) * 0.08
      meshes.forEach((mesh, index) => {
        const phase = Number(mesh.userData.phase)
        mesh.position.x = Number(mesh.userData.baseX) + Math.cos(time * 0.0003 + phase) * 0.12
        mesh.position.y = Number(mesh.userData.baseY) + Math.sin(time * 0.00048 + phase) * 0.18
        mesh.rotation.z = Number(mesh.userData.baseRotation) + Math.sin(time * 0.00024 + index) * 0.025
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
