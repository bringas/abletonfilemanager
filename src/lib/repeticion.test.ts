import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import type { ProjectRecord } from './db'
import { claveDeClip, contarRepeticiones, filtrarRepetidosSiProcede, vecesRepetido } from './repeticion'

function clip(parcial: Partial<AudioClipInfo>): AudioClipInfo {
  return {
    track: 'Pista',
    relativePath: 'Samples/Recorded/audio.wav',
    originalFileSize: 100,
    durationBeats: 16,
    ...parcial,
  }
}

function proyecto(path: string, clips: AudioClipInfo[]): ProjectRecord {
  return { path, info: { liveVersion: '', bpm: null, tracks: [], audioClips: clips } }
}

describe('claveDeClip', () => {
  it('es null si no hay ruta', () => {
    expect(claveDeClip(clip({ relativePath: null }))).toBeNull()
  })

  it('no distingue mayúsculas en el nombre', () => {
    expect(claveDeClip(clip({ relativePath: 'X/Audio.WAV' }))).toBe(
      claveDeClip(clip({ relativePath: 'Y/audio.wav' })),
    )
  })
})

describe('contarRepeticiones', () => {
  it('cuenta en cuántos proyectos DISTINTOS aparece un archivo (no cuántas veces dentro de uno)', () => {
    const archivoRepetido = clip({ relativePath: 'loop.wav', originalFileSize: 50 })
    const projects = [
      proyecto('a.als', [archivoRepetido, archivoRepetido]), // el mismo dos veces en un proyecto
      proyecto('b.als', [archivoRepetido]),
      proyecto('c.als', [clip({ relativePath: 'otro.wav', originalFileSize: 999 })]),
    ]

    const repeticiones = contarRepeticiones(projects)
    expect(repeticiones.get(claveDeClip(archivoRepetido) as string)).toBe(2)
  })
})

describe('vecesRepetido', () => {
  it('devuelve 0 si no está en el mapa', () => {
    expect(vecesRepetido(clip({}), new Map())).toBe(0)
  })
})

describe('filtrarRepetidosSiProcede', () => {
  const comun = clip({ relativePath: 'comun.wav', originalFileSize: 1 })
  const unico = clip({ relativePath: 'unico.wav', originalFileSize: 2 })
  const repeticiones = new Map([[claveDeClip(comun) as string, 5]])

  it('si no está activo, no filtra nada', () => {
    expect(filtrarRepetidosSiProcede([comun, unico], repeticiones, 3, false)).toEqual([comun, unico])
  })

  it('si está activo, quita lo que supera el umbral', () => {
    expect(filtrarRepetidosSiProcede([comun, unico], repeticiones, 3, true)).toEqual([unico])
  })

  it('si filtrar lo dejaría vacío, no filtra (mejor algo que nada)', () => {
    expect(filtrarRepetidosSiProcede([comun], repeticiones, 3, true)).toEqual([comun])
  })
})
