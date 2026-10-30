import { useState } from 'react'
import { parseAlsProject, type AlsProjectInfo } from './lib/alsReader'
import { resolverSegmentos } from './lib/resolvePath'
import { buscarArchivosAls } from './lib/scanFolder'

interface ProjectEntry {
  path: string
  info?: AlsProjectInfo
  error?: string
}

interface Progreso {
  leidos: number
  total: number
}

async function resolverArchivo(
  raiz: FileSystemDirectoryHandle,
  segmentos: string[],
): Promise<FileSystemFileHandle | null> {
  if (segmentos.length === 0) return null

  try {
    let carpeta = raiz
    for (const nombre of segmentos.slice(0, -1)) {
      carpeta = await carpeta.getDirectoryHandle(nombre)
    }
    return await carpeta.getFileHandle(segmentos[segmentos.length - 1])
  } catch {
    return null
  }
}

async function reproducir(handle: FileSystemFileHandle) {
  const file = await handle.getFile()
  const url = URL.createObjectURL(file)
  const audio = new Audio(url)
  audio.addEventListener('ended', () => URL.revokeObjectURL(url))
  await audio.play()
}

function App() {
  const [raizHandle, setRaizHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [notSupported, setNotSupported] = useState(false)

  async function elegirCarpeta() {
    if (!('showDirectoryPicker' in window)) {
      setNotSupported(true)
      return
    }

    setLoading(true)
    setProjects([])
    setProgreso(null)

    try {
      const raiz = await window.showDirectoryPicker()
      setRaizHandle(raiz)
      const archivos = await buscarArchivosAls(raiz)
      setProgreso({ leidos: 0, total: archivos.length })

      for (const { handle, path } of archivos) {
        let entry: ProjectEntry
        try {
          const file = await handle.getFile()
          const bytes = new Uint8Array(await file.arrayBuffer())
          const info = await parseAlsProject(bytes)
          entry = { path, info }
        } catch {
          entry = { path, error: 'No se pudo leer este archivo' }
        }
        setProjects((prev) => [...prev, entry])
        setProgreso((prev) => (prev ? { ...prev, leidos: prev.leidos + 1 } : prev))
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        throw err
      }
    } finally {
      setLoading(false)
      setProgreso(null)
    }
  }

  async function onPlayClick(project: ProjectEntry) {
    const relativePath = project.info?.audioClips.find((clip) => clip.relativePath)?.relativePath
    if (!relativePath || !raizHandle) return

    const carpetaProyecto = project.path.split('/').slice(0, -1)
    const segmentos = resolverSegmentos(carpetaProyecto, relativePath)
    const audioHandle = await resolverArchivo(raizHandle, segmentos)
    if (!audioHandle) return

    await reproducir(audioHandle)
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">ProjectRescue</h1>
      <p className="mt-1 text-sm text-gray-500">Tus archivos no salen de este ordenador.</p>

      <button
        type="button"
        onClick={elegirCarpeta}
        disabled={loading}
        className="mt-6 rounded-md bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {loading ? 'Escaneando…' : 'Elegir carpeta de proyectos'}
      </button>

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
            </div>
            {project.info?.audioClips.some((clip) => clip.relativePath) && (
              <button
                type="button"
                onClick={() => onPlayClick(project)}
                className="shrink-0 rounded-full border border-violet-600 px-3 py-1 text-sm text-violet-600 hover:bg-violet-50"
              >
                ▶ Reproducir
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
