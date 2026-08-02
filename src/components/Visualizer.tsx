import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../lib/engine'

const BARS = 64
const RADIUS = 1
const MIN_HEIGHT = 0.03
const MAX_HEIGHT = 0.62

/**
 * Groups the analyser's linear frequency bins into `BARS` logarithmic bands,
 * so the ring reads as bass/mid/treble rather than wasting half the bars on
 * frequencies above what anyone can hear. Precomputed once per analyser size.
 */
function makeBandMap(binCount: number, bars: number) {
  const edges = new Array(bars + 1).fill(0).map((_, i) => {
    const t = i / bars
    // log curve, biased so low bars (bass) still get a few bins each
    return Math.floor(Math.pow(binCount, t))
  })
  return edges
}

/**
 * Three.js can't resolve CSS custom properties — `color="var(--signal)"` is
 * silently invalid. Read the computed value off the DOM instead, and re-read
 * it whenever the theme class on <html> flips.
 */
function useThemeColor(variable: string, fallback: string) {
  const [color, setColor] = useState(fallback)

  useEffect(() => {
    const read = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
      if (v) setColor(v)
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [variable])

  return color
}

function Ring({ reduceMotion, color }: { reduceMotion: boolean; color: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const smoothed = useRef(new Float32Array(BARS))
  const bandEdges = useRef<number[] | null>(null)

  const basePositions = useMemo(() => {
    return new Array(BARS).fill(0).map((_, i) => {
      const angle = (i / BARS) * Math.PI * 2
      return { angle, x: Math.cos(angle), z: Math.sin(angle) }
    })
  }, [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    // Lay out the resting ring immediately so there's no pop-in on first frame.
    basePositions.forEach((p, i) => {
      dummy.position.set(p.x * RADIUS, MIN_HEIGHT / 2, p.z * RADIUS)
      dummy.rotation.y = -p.angle
      dummy.scale.set(1, MIN_HEIGHT, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [basePositions, dummy])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const data = engine.sample()
    if (!data.length) return
    if (!bandEdges.current || bandEdges.current.length !== BARS + 1) {
      bandEdges.current = makeBandMap(data.length, BARS)
    }
    const edges = bandEdges.current

    for (let i = 0; i < BARS; i++) {
      let sum = 0
      const lo = edges[i]
      const hi = Math.max(lo + 1, edges[i + 1])
      for (let b = lo; b < hi && b < data.length; b++) sum += data[b]
      const avg = sum / (hi - lo) / 255 // 0..1

      const target = MIN_HEIGHT + avg * avg * MAX_HEIGHT
      // Exponential smoothing: fast attack, slower decay — like a real VU needle.
      const prev = smoothed.current[i]
      const rate = target > prev ? 0.55 : 0.12
      smoothed.current[i] = reduceMotion ? MIN_HEIGHT : prev + (target - prev) * rate

      const h = smoothed.current[i]
      const p = basePositions[i]
      dummy.position.set(p.x * RADIUS, h / 2, p.z * RADIUS)
      dummy.rotation.y = -p.angle
      dummy.scale.set(1, h / MIN_HEIGHT, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  const barGeom = useMemo(() => new THREE.BoxGeometry(0.028, MIN_HEIGHT, 0.028), [])

  return (
    <instancedMesh ref={meshRef} args={[barGeom, undefined, BARS]}>
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
    </instancedMesh>
  )
}

function Rig({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!group.current) return
    // A very slow drift, like a turntable platter — not a spin, a breathing.
    group.current.rotation.y = state.clock.elapsedTime * 0.045
  })
  return <group ref={group}>{children}</group>
}

/**
 * The centerpiece: a ring of GPU-instanced bars reacting to real frequency
 * data from the AnalyserNode. One draw call, no post-processing, cheap enough
 * for integrated graphics. Renders behind the cover art in Now Playing.
 */
export function Visualizer({ className = '' }: { className?: string }) {
  const reduceMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )
  const signalColor = useThemeColor('--signal', '#d2481f')

  return (
    <div className={className} aria-hidden="true" style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0.9, 2.4], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        frameloop={reduceMotion ? 'demand' : 'always'}
      >
        <ambientLight intensity={0.65} />
        <pointLight position={[2, 3, 2]} intensity={40} color="#ffdcc4" />
        <pointLight position={[-2, -1, -2]} intensity={12} color="#5a6b8c" />
        <Rig>
          <Ring reduceMotion={reduceMotion} color={signalColor} />
        </Rig>
      </Canvas>
    </div>
  )
}
