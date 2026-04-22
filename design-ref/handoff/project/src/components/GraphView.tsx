import { useEffect, useRef, useState } from 'react'
import type { GraphJson, Manifest, GraphNode } from './graph/types'
import { useForceSimulation } from './graph/useForceSimulation'
import { withBase } from '../lib/url'
import styles from './GraphView.module.css'

type Mode = 'note' | 'concept'
type Level = 1 | 2 | 3
type Status = 'loading' | 'ready' | 'error' | 'empty'

function getInitialMode(): Mode {
  if (typeof window === 'undefined') return 'note'
  const p = new URLSearchParams(window.location.search).get('mode')
  return p === 'concept' ? 'concept' : 'note'
}

function getInitialLevel(): Level {
  if (typeof window === 'undefined') return 1
  const p = Number(new URLSearchParams(window.location.search).get('level') ?? '1')
  return p === 2 || p === 3 ? (p as Level) : 1
}

export default function GraphView() {
  const [mode, setMode] = useState<Mode>(getInitialMode)
  const [level, setLevel] = useState<Level>(getInitialLevel)
  const [graph, setGraph] = useState<GraphJson | null>(null)
  const [manifest, setManifest] = useState<Manifest>({})
  const [status, setStatus] = useState<Status>('loading')
  const [retry, setRetry] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)

  // Fetch graph + manifest whenever mode/level/retry changes
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setGraph(null)

    Promise.all([
      fetch(withBase(`/graph/${mode}-l${level}.json`)).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<GraphJson>
      }),
      fetch(withBase('/notes-manifest.json'))
        .then(r => r.json() as Promise<Manifest>)
        .catch(() => ({} as Manifest)),
    ])
      .then(([g, m]) => {
        if (cancelled) return
        setGraph(g)
        setManifest(m)
        setStatus(g.nodes.length === 0 ? 'empty' : 'ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, level, retry])

  // Sync URL without triggering navigation
  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = new URLSearchParams({ mode, level: String(level) })
    history.replaceState(null, '', `?${q.toString()}`)
  }, [mode, level])

  useForceSimulation(svgRef, graph, {
    onNodeClick: (node: GraphNode) => {
      if (node.type === 'note' && manifest[node.id]) {
        window.location.href = withBase(manifest[node.id].href)
      }
    },
  })

  return (
    <div className={styles.root}>
      {/* AF3 — SSR sr-only list for screen readers */}
      <ul className="sr-only" aria-label="graph nodes list">
        {graph?.nodes.map(n => {
          const m = manifest[n.id]
          return (
            <li key={n.id}>
              {m ? <a href={withBase(m.href)}>{n.label}</a> : <span>{n.label}</span>}
            </li>
          )
        })}
      </ul>

      {/* Controls — segmented toggles, no browser radio chrome */}
      <div role="toolbar" aria-label="graph controls" className={styles.toolbar}>
        <div role="radiogroup" aria-label="View mode" className={styles.segmentGroup}>
          <span className={styles.segmentGroupLabel}>Mode</span>
          {(['note', 'concept'] as Mode[]).map(m => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              className={`${styles.segment}${mode === m ? ` ${styles.segmentActive}` : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'note' ? 'Notes' : 'Concepts'}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="Depth level" className={styles.segmentGroup}>
          <span className={styles.segmentGroupLabel}>Level</span>
          {([1, 2, 3] as Level[]).map(l => (
            <button
              key={l}
              role="radio"
              aria-checked={level === l}
              className={`${styles.segment}${level === l ? ` ${styles.segmentActive}` : ''}`}
              onClick={() => setLevel(l)}
            >
              L{l}
            </button>
          ))}
        </div>
      </div>

      {/* AF4 — 3-state loading / error / empty UI */}
      {status === 'loading' && (
        <p className={styles.status}>그래프를 불러오는 중…</p>
      )}

      {status === 'error' && (
        <div className={styles.status}>
          <p role="alert">그래프를 불러올 수 없습니다.</p>
          <button className={styles.retryBtn} onClick={() => setRetry(r => r + 1)}>
            다시 시도
          </button>
        </div>
      )}

      {status === 'empty' && (
        <p className={styles.status}>아직 표시할 노드가 없습니다.</p>
      )}

      {/* SVG — always rendered so svgRef is stable */}
      <svg
        ref={svgRef}
        className={styles.svg}
        style={{ display: status === 'ready' ? 'block' : 'none' }}
        aria-hidden="true"
      />

      {status === 'ready' && graph && (
        <p className={styles.stats}>
          {graph.nodes.length} nodes · {graph.links.length} links
        </p>
      )}
    </div>
  )
}
