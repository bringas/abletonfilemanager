import { useEffect, useRef, useState } from 'react'
import { parseAlsProject } from './lib/alsReader'
import { elegirMejorClip } from './lib/clipPriority'
import { db, ROOT_ID, type ProjectRecord } from './lib/db'
import { calcularEstado, type EstadoPreescucha } from './lib/estadoPreescucha'
import { resolverClip } from './lib/resolvePath'
import { recorrerCarpeta, type AudioFileEntry } from './lib/scanFolder'
import { encontrarInicioSinSilencio } from './lib/silenceSkip'

const DURACION_PREESCUCHA_SEGUNDOS = 15

type ProjectEntry = ProjectRecord

interface Progreso {
  leidos: number
  total: number
}

const ETIQUETA_ESTADO: Record<EstadoPreescucha, string> = {
  'con audio': 'Con audio',
  'solo MIDI': 'Solo MIDI',
  'audio no encontrado': 'Audio no encontrado',
  'no legible': 'No legible',
}

const COLOR_ESTADO: Record<EstadoPreescucha, string> = {
  'con audio': 'bg-green-100 text-green-700',
  'solo MIDI': 'bg-gray-100 text-gray-600',
  'audio no encontrado': 'bg-amber-100 text-amber-700',
  'no legible': 'bg-red-100 text-red-700',
}

function App() {
  const [raizHandle, setRaizHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [necesitaPermiso, setNecesitaPermiso] = useState(false)
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [audioIndex, setAudioIndex] = useState<AudioFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [notSupported, setNotSupported] = useState(false)

  // Un único <audio>, reutilizado siempre: así solo suena una cosa a la vez.
  // Se crea en un efecto (no durante el render) y vive mientras dura la página.
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    audioElRef.current = new Audio()
  }, [])
  const [urlActual, setUrlActual] = useState<string | null>(null)
  const [reproduciendoPath, setReproduciendoPath] = useState<string | null>(null)
  const [progresoReproduccion, setProgresoReproduccion] = useState(0)

  function pararReproduccion() {
    audioElRef.current?.pause()
    if (urlActual) URL.revokeObjectURL(urlActual)
    setUrlActual(null)
    setReproduciendoPath(null)
    setProgresoReproduccion(0)
  }

  // Al abrir la página, recupero la última carpeta y el catálogo guardados.
  useEffect(() => {
    let cancelado = false

    ;(async () => {
      const root = await db.roots.get(ROOT_ID)
      if (!root || cancelado) return

      setRaizHandle(root.handle)
      setProjects(await db.projects.toArray())

      const permiso = await root.handle.queryPermission({ mode: 'read' })
      if (!cancelado) setNecesitaPermiso(permiso !== 'granted')
    })()

    return () => {
      cancelado = true
    }
  }, [])

  async function escanearCarpeta(raiz: FileSystemDirectoryHandle) {
    setLoading(true)
    setProjects([])
    setProgreso(null)

    try {
      setRaizHandle(raiz)
      const { alsFiles, audioFiles } = await recorrerCarpeta(raiz)
      setAudioIndex(audioFiles)
      setProgreso({ leidos: 0, total: alsFiles.length })

      const entries: ProjectEntry[] = []
      for (const { handle, path } of alsFiles) {
        const carpetaProyecto = path.split('/').slice(0, -1)
        let entry: ProjectEntry

        try {
          const file = await handle.getFile()
          const bytes = new Uint8Array(await file.arrayBuffer())
          const info = await parseAlsProject(bytes)

          let algunoEncontrado = false
          for (const clip of info.audioClips) {
            const encontrado = await resolverClip(raiz, carpetaProyecto, clip, audioFiles)
            if (encontrado) {
              algunoEncontrado = true
              break
            }
          }

          const estado = calcularEstado({
            tieneError: false,
            numeroDeClips: info.audioClips.length,
            algunoEncontrado,
          })
          entry = { path, info, estado }
        } catch {
          entry = { path, error: 'No se pudo leer este archivo', estado: 'no legible' }
        }

        entries.push(entry)
        setProjects((prev) => [...prev, entry])
        setProgreso((prev) => (prev ? { ...prev, leidos: prev.leidos + 1 } : prev))
      }

      await db.roots.put({ id: ROOT_ID, nombre: raiz.name, handle: raiz, ultimoEscaneo: new Date() })
      await db.projects.clear()
      await db.projects.bulkPut(entries)
      setNecesitaPermiso(false)
    } finally {
      setLoading(false)
      setProgreso(null)
    }
  }

  async function elegirCarpeta() {
    if (!('showDirectoryPicker' in window)) {
      setNotSupported(true)
      return
    }

    try {
      const raiz = await window.showDirectoryPicker()
      await escanearCarpeta(raiz)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        throw err
      }
    }
  }

  async function reconectarCarpeta() {
    if (!raizHandle) return
    const permiso = await raizHandle.requestPermission({ mode: 'read' })
    setNecesitaPermiso(permiso !== 'granted')
  }

  async function onPlayClick(project: ProjectEntry) {
    const audioEl = audioElRef.current
    if (!project.info || !raizHandle || !audioEl) return

    if (necesitaPermiso) {
      const permiso = await raizHandle.requestPermission({ mode: 'read' })
      setNecesitaPermiso(permiso !== 'granted')
      if (permiso !== 'granted') return
    }

    const mejorClip = elegirMejorClip(project.info.audioClips)
    if (!mejorClip) return

    const carpetaProyecto = project.path.split('/').slice(0, -1)
    const audioHandle = await resolverClip(raizHandle, carpetaProyecto, mejorClip, audioIndex)
    if (!audioHandle) return

    if (urlActual) URL.revokeObjectURL(urlActual)

    const file = await audioHandle.getFile()
    const inicio = await encontrarInicioSinSilencio(file)
    const url = URL.createObjectURL(file)

    audioEl.src = url
    audioEl.currentTime = inicio
    audioEl.ontimeupdate = () => {
      const transcurrido = audioEl.currentTime - inicio
      setProgresoReproduccion(Math.min(1, transcurrido / DURACION_PREESCUCHA_SEGUNDOS))
      if (transcurrido >= DURACION_PREESCUCHA_SEGUNDOS) pararReproduccion()
    }
    audioEl.onended = () => pararReproduccion()

    setUrlActual(url)
    setReproduciendoPath(project.path)
    setProgresoReproduccion(0)
    await audioEl.play()
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">ProjectRescue</h1>
      <p className="mt-1 text-sm text-gray-500">Tus archivos no salen de este ordenador.</p>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={elegirCarpeta}
          disabled={loading}
          className="rounded-md bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? 'Escaneando…' : 'Elegir carpeta de proyectos'}
        </button>

        {necesitaPermiso && (
          <button
            type="button"
            onClick={reconectarCarpeta}
            disabled={loading}
            className="rounded-md border border-violet-600 px-4 py-2 text-violet-600 hover:bg-violet-50 disabled:opacity-50"
          >
            Reconectar carpeta
          </button>
        )}
      </div>

      {progreso && progreso.total > 0 && (
        <div className="mt-3">
          <p className="text-sm text-gray-500">
            {progreso.leidos} de {progreso.total} proyectos
          </p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-violet-600 transition-all"
              style={{ width: `${(progreso.leidos / progreso.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {notSupported && (
        <p className="mt-4 text-sm text-red-600">
          Tu navegador no soporta elegir carpetas así. Prueba con Chrome o Edge de escritorio.
        </p>
      )}

      <ul className="mt-6 divide-y divide-gray-200">
        {projects.map((project) => (
          <li key={project.path} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">{project.path}</p>
              {project.error && <p className="text-sm text-red-600">{project.error}</p>}
              {project.info && (
                <p className="text-sm text-gray-500">
                  {project.info.liveVersion || 'Versión desconocida'} · BPM:{' '}
                  {project.info.bpm ?? '—'} · Pistas: {project.info.tracks.join(', ') || '—'}
                </p>
              )}
              {project.estado && (
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${COLOR_ESTADO[project.estado]}`}
                >
                  {ETIQUETA_ESTADO[project.estado]}
                </span>
              )}
              {reproduciendoPath === project.path && (
                <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-violet-600"
                    style={{ width: `${progresoReproduccion * 100}%` }}
                  />
                </div>
              )}
            </div>
            {project.estado === 'con audio' &&
              (reproduciendoPath === project.path ? (
                <button
                  type="button"
                  onClick={pararReproduccion}
                  className="shrink-0 rounded-full border border-red-600 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                >
                  ■ Parar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onPlayClick(project)}
                  className="shrink-0 rounded-full border border-violet-600 px-3 py-1 text-sm text-violet-600 hover:bg-violet-50"
                >
                  ▶ Reproducir
                </button>
              ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
