import { useEffect, useMemo, useRef, useState } from 'react'
import { parseAlsProject } from './lib/alsReader'
import { coincideBusqueda } from './lib/busqueda'
import { elegirMejorClip, encontrarExportacionesSueltas, PISTA_EXPORTADO } from './lib/clipPriority'
import { db, ROOT_ID, type ProjectRecord, type UserMetaRecord } from './lib/db'
import { calcularEstado, type EstadoPreescucha } from './lib/estadoPreescucha'
import { reducirClipsPorPista } from './lib/reducirRuido'
import { contarRepeticiones, filtrarRepetidosSiProcede, vecesRepetido } from './lib/repeticion'
import { resolverClip } from './lib/resolvePath'
import { debeReutilizarProyecto } from './lib/rescan'
import { recorrerCarpeta, type AudioFileEntry } from './lib/scanFolder'
import { encontrarInicioSinSilencio } from './lib/silenceSkip'

const DURACION_PREESCUCHA_SEGUNDOS = 15
// A partir de cuántos proyectos distintos un archivo cuenta como "repetido".
const UMBRAL_REPETICION = 3

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

  const [busqueda, setBusqueda] = useState('')
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null)
  const [fichaClips, setFichaClips] = useState<Record<string, Array<FileSystemFileHandle | null>>>({})
  const [mostrarNoEncontrados, setMostrarNoEncontrados] = useState(false)
  const [mostrarOtrosArchivos, setMostrarOtrosArchivos] = useState(false)
  const [metaPorPath, setMetaPorPath] = useState<Record<string, UserMetaRecord>>({})
  const [repeticiones, setRepeticiones] = useState<Map<string, number>>(new Map())
  const [ignorarRepetidos, setIgnorarRepetidos] = useState(false)

  const proyectosVisibles = useMemo(() => {
    return projects
      .filter((p) => coincideBusqueda(p, busqueda, metaPorPath[p.path]))
      .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
  }, [projects, busqueda, metaPorPath])

  async function guardarMeta(path: string, cambios: Partial<UserMetaRecord>) {
    const nuevo: UserMetaRecord = { ...metaPorPath[path], ...cambios, projectId: path }
    await db.userMeta.put(nuevo)
    setMetaPorPath((prev) => ({ ...prev, [path]: nuevo }))
  }

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
      const proyectosGuardados = await db.projects.toArray()
      setProjects(proyectosGuardados)
      setRepeticiones(contarRepeticiones(proyectosGuardados))

      const metas = await db.userMeta.toArray()
      if (!cancelado) {
        setMetaPorPath(Object.fromEntries(metas.map((meta) => [meta.projectId, meta])))
      }

      const permiso = await root.handle.queryPermission({ mode: 'read' })
      if (!cancelado) setNecesitaPermiso(permiso !== 'granted')
    })()

    return () => {
      cancelado = true
    }
  }, [])

  /**
   * reutilizarExistentes=true es "Buscar cambios": si un .als no cambió desde
   * el último escaneo (misma fecha de modificación), no lo vuelve a leer ni a
   * resolver sus audios, solo reutiliza lo que ya teníamos guardado.
   */
  async function escanearCarpeta(raiz: FileSystemDirectoryHandle, reutilizarExistentes = false) {
    const existentesPorPath = new Map(projects.map((p) => [p.path, p]))

    setLoading(true)
    if (!reutilizarExistentes) setProjects([])
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
        let lastModified: number | undefined

        try {
          const file = await handle.getFile()
          lastModified = file.lastModified

          const existente = existentesPorPath.get(path)
          if (debeReutilizarProyecto(existente, lastModified, reutilizarExistentes)) {
            entry = existente as ProjectEntry
          } else {
            const bytes = new Uint8Array(await file.arrayBuffer())
            const infoLeida = await parseAlsProject(bytes)
            const exportacionesSueltas = encontrarExportacionesSueltas(audioFiles, carpetaProyecto)
            const infoConExportaciones =
              exportacionesSueltas.length === 0
                ? infoLeida
                : {
                    ...infoLeida,
                    tracks: [...infoLeida.tracks, PISTA_EXPORTADO],
                    audioClips: [...infoLeida.audioClips, ...exportacionesSueltas],
                  }
            // Si una pista tiene muchas tomas sueltas, nos quedamos solo con
            // la más reciente y la más larga (si hay cientos, es ruido).
            const info = {
              ...infoConExportaciones,
              audioClips: reducirClipsPorPista(infoConExportaciones.audioClips, audioFiles, carpetaProyecto),
            }

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
            entry = { path, info, estado, lastModified }
          }
        } catch {
          entry = { path, error: 'No se pudo leer este archivo', estado: 'no legible', lastModified }
        }

        entries.push(entry)
        if (reutilizarExistentes) {
          setProjects(entries.slice())
        } else {
          setProjects((prev) => [...prev, entry])
        }
        setProgreso((prev) => (prev ? { ...prev, leidos: prev.leidos + 1 } : prev))
      }

      setRepeticiones(contarRepeticiones(entries))

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

  /** Pide permiso de la carpeta si hace falta. Devuelve si ya lo tenemos. */
  async function asegurarPermiso(): Promise<boolean> {
    if (!raizHandle) return false
    if (!necesitaPermiso) return true
    const permiso = await raizHandle.requestPermission({ mode: 'read' })
    setNecesitaPermiso(permiso !== 'granted')
    return permiso === 'granted'
  }

  async function buscarCambios() {
    if (!raizHandle || !(await asegurarPermiso())) return
    await escanearCarpeta(raizHandle, true)
  }

  async function reproducirHandle(path: string, handle: FileSystemFileHandle) {
    const audioEl = audioElRef.current
    if (!audioEl) return

    if (urlActual) URL.revokeObjectURL(urlActual)

    const file = await handle.getFile()
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
    setReproduciendoPath(path)
    setProgresoReproduccion(0)
    await audioEl.play()
  }

  async function onPlayClick(project: ProjectEntry) {
    if (!project.info || !raizHandle || !(await asegurarPermiso())) return

    // Solo se reproducen por defecto los clips que se muestran por
    // defecto (lo que Ableton reproduciría); las tomas archivadas/sobrantes
    // quedan fuera salvo que el usuario las revele con el interruptor.
    const clipsVisibles = project.info.audioClips.filter((clip) => clip.mostrarPorDefecto !== false)
    const candidatos = filtrarRepetidosSiProcede(
      clipsVisibles,
      repeticiones,
      UMBRAL_REPETICION,
      ignorarRepetidos,
    )
    const mejorClip = elegirMejorClip(candidatos)
    if (!mejorClip) return

    const carpetaProyecto = project.path.split('/').slice(0, -1)
    const audioHandle = await resolverClip(raizHandle, carpetaProyecto, mejorClip, audioIndex)
    if (!audioHandle) return

    await reproducirHandle(project.path, audioHandle)
  }

  async function onPlayClipClick(project: ProjectEntry, handle: FileSystemFileHandle) {
    if (!(await asegurarPermiso())) return
    await reproducirHandle(project.path, handle)
  }

  async function toggleFicha(project: ProjectEntry) {
    if (fichaAbierta === project.path) {
      setFichaAbierta(null)
      return
    }
    setFichaAbierta(project.path)

    if (!project.info || !raizHandle || fichaClips[project.path] || !(await asegurarPermiso())) return

    const carpetaProyecto = project.path.split('/').slice(0, -1)
    const resultados: Array<FileSystemFileHandle | null> = []
    for (const clip of project.info.audioClips) {
      resultados.push(await resolverClip(raizHandle, carpetaProyecto, clip, audioIndex))
    }
    setFichaClips((prev) => ({ ...prev, [project.path]: resultados }))
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

        {raizHandle && !necesitaPermiso && (
          <button
            type="button"
            onClick={buscarCambios}
            disabled={loading}
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Buscar cambios
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

      {projects.length > 0 && (
        <>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre de proyecto o de pista…"
            className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={ignorarRepetidos}
              onChange={(e) => setIgnorarRepetidos(e.target.checked)}
            />
            Al reproducir, ignorar grabaciones que se repiten en {UMBRAL_REPETICION}+ proyectos
          </label>
        </>
      )}

      <ul className="mt-6 divide-y divide-gray-200">
        {proyectosVisibles.map((project) => (
          <li key={project.path} className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => guardarMeta(project.path, { favorito: !metaPorPath[project.path]?.favorito })}
                  aria-label="Marcar como favorito"
                  className="text-amber-500"
                >
                  {metaPorPath[project.path]?.favorito ? '★' : '☆'}
                </button>
                <p className="font-medium">{metaPorPath[project.path]?.alias || project.path}</p>
              </div>
              {metaPorPath[project.path]?.alias && (
                <p className="text-xs text-gray-400">{project.path}</p>
              )}
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
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  type="text"
                  defaultValue={metaPorPath[project.path]?.alias ?? ''}
                  onBlur={(e) => guardarMeta(project.path, { alias: e.target.value })}
                  placeholder="Ponle un alias…"
                  className="w-40 rounded border border-gray-200 px-1.5 py-0.5 text-xs"
                />
                <input
                  type="text"
                  defaultValue={(metaPorPath[project.path]?.etiquetas ?? []).join(', ')}
                  onBlur={(e) =>
                    guardarMeta(project.path, {
                      etiquetas: e.target.value
                        .split(',')
                        .map((etiqueta) => etiqueta.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Etiquetas separadas por comas…"
                  className="w-48 rounded border border-gray-200 px-1.5 py-0.5 text-xs"
                />
              </div>
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
          </div>

          {project.info && (
            <>
              <button
                type="button"
                onClick={() => toggleFicha(project)}
                className="mt-1 text-xs text-violet-600 hover:underline"
              >
                {fichaAbierta === project.path ? 'Ocultar ficha' : 'Ver ficha'}
              </button>

              {fichaAbierta === project.path && (
                <div className="mt-2 rounded-md bg-gray-50 p-3 text-sm">
                  <label className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={mostrarNoEncontrados}
                      onChange={(e) => setMostrarNoEncontrados(e.target.checked)}
                    />
                    Mostrar también los audios no encontrados
                  </label>
                  <label className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={mostrarOtrosArchivos}
                      onChange={(e) => setMostrarOtrosArchivos(e.target.checked)}
                    />
                    Mostrar también las tomas archivadas (no están en el carril principal de la pista)
                  </label>
                  {project.info.tracks.map((trackName, i) => {
                    const resueltos = fichaClips[project.path]
                    const todosDeLaPista = project.info?.audioClips
                      .map((clip, idx) => ({ clip, idx }))
                      .filter(({ clip }) => clip.track === trackName)
                    const baseDeLaPista = mostrarOtrosArchivos
                      ? todosDeLaPista
                      : (todosDeLaPista ?? []).filter(({ clip }) => clip.mostrarPorDefecto !== false)
                    const archivadasOcultas = (todosDeLaPista?.length ?? 0) - (baseDeLaPista?.length ?? 0)
                    const noEncontrados = resueltos
                      ? (baseDeLaPista ?? []).filter(({ idx }) => resueltos[idx] === null).length
                      : 0
                    const clipsDeLaPista = mostrarNoEncontrados
                      ? baseDeLaPista
                      : (baseDeLaPista ?? []).filter(({ idx }) => !resueltos || resueltos[idx] !== null)
                    return (
                      <div key={`${trackName}-${i}`} className="mb-2 last:mb-0">
                        <p className="font-medium">{trackName}</p>
                        {!todosDeLaPista || todosDeLaPista.length === 0 ? (
                          <p className="text-gray-500">Solo MIDI</p>
                        ) : clipsDeLaPista && clipsDeLaPista.length === 0 ? (
                          <p className="text-gray-400">
                            {noEncontrados > 0
                              ? `Ninguna grabación encontrada (${noEncontrados} oculta${noEncontrados === 1 ? '' : 's'})`
                              : 'comprobando…'}
                          </p>
                        ) : (
                          <ul className="ml-3 list-disc text-gray-600">
                            {clipsDeLaPista?.map(({ clip, idx }) => {
                              const handle = resueltos?.[idx]
                              const veces = vecesRepetido(clip, repeticiones)
                              return (
                                <li key={idx} className="flex items-center gap-2">
                                  <span>
                                    {clip.relativePath ?? '(ruta desconocida)'} —{' '}
                                    {!resueltos ? 'comprobando…' : handle ? 'encontrado' : 'no encontrado'}
                                    {veces >= 2 && (
                                      <span className="text-gray-400"> · en {veces} proyectos</span>
                                    )}
                                  </span>
                                  {handle && (
                                    <button
                                      type="button"
                                      onClick={() => onPlayClipClick(project, handle)}
                                      className="rounded-full border border-violet-600 px-2 py-0.5 text-xs text-violet-600 hover:bg-violet-50"
                                    >
                                      ▶
                                    </button>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        {!mostrarNoEncontrados && noEncontrados > 0 && clipsDeLaPista && clipsDeLaPista.length > 0 && (
                          <p className="text-xs text-gray-400">
                            + {noEncontrados} no encontrada{noEncontrados === 1 ? '' : 's'} (ocultas)
                          </p>
                        )}
                        {!mostrarOtrosArchivos && archivadasOcultas > 0 && (
                          <p className="text-xs text-gray-400">
                            + {archivadasOcultas} toma{archivadasOcultas === 1 ? '' : 's'} archivada
                            {archivadasOcultas === 1 ? '' : 's'} (oculta{archivadasOcultas === 1 ? '' : 's'})
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
