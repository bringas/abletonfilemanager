import { useState } from 'react'
import { parseAlsProject, type AlsProjectInfo } from './lib/alsReader'
import { resolverSegmentos } from './lib/resolvePath'

interface ProjectEntry {
  path: string
  info?: AlsProjectInfo
  error?: string
}

interface FoundAls {
  handle: FileSystemFileHandle
  path: string
}

async function buscarArchivosAls(
  dirHandle: FileSystemDirectoryHandle,
  path = '',
): Promise<FoundAls[]> {
  const encontrados: FoundAls[] = []

  for await (const [name, handle] of dirHandle.entries()) {
    const entryPath = path ? `${path}/${name}` : name
    if (handle.kind === 'directory') {
      encontrados.push(...(await buscarArchivosAls(handle, entryPath)))
    } else if (name.toLowerCase().endsWith('.als')) {
      encontrados.push({ handle, path: entryPath })
    }
  }

  return encontrados
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
  const [notSupported, setNotSupported] = useState(false)

  async function elegirCarpeta() {
    if (!('showDirectoryPicker' in window)) {
      setNotSupported(true)
      return
    }

    setLoading(true)
    setProjects([])

    try {
      const raiz = await window.showDirectoryPicker()
      setRaizHandle(raiz)
      const archivos = await buscarArchivosAls(raiz)

      const entries: ProjectEntry[] = []
      for (const { handle, path } of archivos) {
        try {
          const file = await handle.getFile()
          const bytes = new Uint8Array(await file.arrayBuffer())
          const info = await parseAlsProject(bytes)
          entries.push({ path, info })
        } catch {
          entries.push({ path, error: 'No se pudo leer este archivo' })
        }
      }

      setProjects(entries)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        throw err
      }
    } finally {
      setLoading(false)
    }
  }

  async function onPlayClick(project: ProjectEntry) {
    const relativePath = project.info?.firstAudioClipRelativePath
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
            {project.info?.firstAudioClipRelativePath && (
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
