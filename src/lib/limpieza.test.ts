import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import type { ProjectRecord } from './db'
import { archivosUsados, encontrarArchivosSobrantes } from './limpieza'
import type { AudioFileEntry } from './scanFolder'

function clip(relativePath: string | null): AudioClipInfo {
  return { track: 'Pista', relativePath, originalFileSize: null, durationBeats: null }
}

function proyecto(path: string, clips: AudioClipInfo[]): ProjectRecord {
  return { path, info: { liveVersion: '', bpm: 120, tracks: ['Pista'], audioClips: clips } }
}

function archivo(path: string): AudioFileEntry {
  const name = path.split('/').pop() ?? path
  return { handle: {} as FileSystemFileHandle, path, name, size: 100, lastModified: 0 }
}

describe('archivosUsados', () => {
  it('resuelve la ruta de cada clip relativa a la carpeta de su proyecto', () => {
    const projects = [proyecto('Ideas/A Project/A.als', [clip('Samples/Recorded/a.wav')])]
    expect(archivosUsados(projects)).toEqual(new Set(['Ideas/A Project/Samples/Recorded/a.wav']))
  })

  it('sigue rutas con ".." hacia otro proyecto', () => {
    const projects = [
      proyecto('Ideas/A Project/A.als', [clip('../B Project/Samples/Recorded/b.wav')]),
    ]
    expect(archivosUsados(projects)).toEqual(new Set(['Ideas/B Project/Samples/Recorded/b.wav']))
  })

  it('ignora clips sin ruta y proyectos sin info', () => {
    const projects = [
      proyecto('A Project/A.als', [clip(null)]),
      { path: 'B Project/B.als' } as ProjectRecord,
    ]
    expect(archivosUsados(projects)).toEqual(new Set())
  })
})

describe('encontrarArchivosSobrantes', () => {
  it('un archivo que nadie referencia es sobrante', () => {
    const projects = [proyecto('A Project/A.als', [clip('Samples/Recorded/usado.wav')])]
    const indice = [archivo('A Project/Samples/Recorded/usado.wav'), archivo('A Project/Samples/Recorded/huerfano.wav')]

    const sobrantes = encontrarArchivosSobrantes(projects, indice)

    expect(sobrantes.map((a) => a.path)).toEqual(['A Project/Samples/Recorded/huerfano.wav'])
  })

  it('un archivo compartido entre proyectos (vía "..") no es sobrante aunque su propio proyecto no lo use', () => {
    const projects = [
      proyecto('carlos y oscar Project/jam.als', []),
      proyecto('la religiosidad Project/la religiosidad.als', [
        clip('../carlos y oscar Project/Samples/Recorded/bass.wav'),
      ]),
    ]
    const indice = [archivo('carlos y oscar Project/Samples/Recorded/bass.wav')]

    expect(encontrarArchivosSobrantes(projects, indice)).toEqual([])
  })

  it('no confunde archivos con el mismo nombre en carpetas distintas', () => {
    const projects = [proyecto('A Project/A.als', [clip('Samples/Recorded/take.wav')])]
    const indice = [
      archivo('A Project/Samples/Recorded/take.wav'),
      archivo('B Project/Samples/Recorded/take.wav'),
    ]

    const sobrantes = encontrarArchivosSobrantes(projects, indice)

    expect(sobrantes.map((a) => a.path)).toEqual(['B Project/Samples/Recorded/take.wav'])
  })
})
