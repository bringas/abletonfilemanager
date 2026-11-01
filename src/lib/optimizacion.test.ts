import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import type { ProjectRecord, UserMetaRecord } from './db'
import { CARPETA_FAVORITOS, CARPETA_SIN_ETIQUETA, planificarOptimizacion } from './optimizacion'

function clip(relativePath: string | null): AudioClipInfo {
  return { track: 'Pista', relativePath, originalFileSize: null, durationBeats: null }
}

function proyecto(path: string, clips: AudioClipInfo[] = []): ProjectRecord {
  return { path, info: { liveVersion: '', bpm: 120, tracks: ['Pista'], audioClips: clips } }
}

describe('planificarOptimizacion', () => {
  it('propone mover una carpeta sin referencias externas a su etiqueta', () => {
    const projects = [proyecto('Ideas/Rock Song Project/Rock Song.als', [clip('Samples/Recorded/a.wav')])]
    const meta: Record<string, UserMetaRecord> = {
      'Ideas/Rock Song Project/Rock Song.als': { projectId: 'x', etiquetas: ['rock'] },
    }

    const [grupo] = planificarOptimizacion(projects, meta)

    expect(grupo.nombreActual).toBe('Ideas')
    expect(grupo.fija).toBe(false)
    expect(grupo.destino).toEqual(['rock', 'Ideas'])
  })

  it('los favoritos van a Favoritos aunque tengan etiqueta', () => {
    const projects = [proyecto('Ideas/Rock Song Project/Rock Song.als')]
    const meta: Record<string, UserMetaRecord> = {
      'Ideas/Rock Song Project/Rock Song.als': { projectId: 'x', etiquetas: ['rock'], favorito: true },
    }

    const [grupo] = planificarOptimizacion(projects, meta)
    expect(grupo.destino).toEqual([CARPETA_FAVORITOS, 'Ideas'])
  })

  it('sin etiquetas ni favorito, va a "Sin etiqueta"', () => {
    const projects = [proyecto('Ideas/Rock Song Project/Rock Song.als')]
    const [grupo] = planificarOptimizacion(projects, {})
    expect(grupo.destino).toEqual([CARPETA_SIN_ETIQUETA, 'Ideas'])
  })

  it('dos carpetas de primer nivel que se referencian entre sí quedan fijas', () => {
    const projects = [
      proyecto('carlos y oscar/jam.als'),
      proyecto('la religiosidad/la religiosidad.als', [clip('../carlos y oscar/Samples/Recorded/bass.wav')]),
    ]
    const meta: Record<string, UserMetaRecord> = {
      'la religiosidad/la religiosidad.als': { projectId: 'x', etiquetas: ['rock'] },
    }

    const grupos = planificarOptimizacion(projects, meta)

    expect(grupos.find((g) => g.nombreActual === 'carlos y oscar')?.fija).toBe(true)
    expect(grupos.find((g) => g.nombreActual === 'la religiosidad')?.fija).toBe(true)
  })

  it('una carpeta sin relación con otras no se ve afectada por las que sí comparten', () => {
    const projects = [
      proyecto('carlos y oscar/jam.als'),
      proyecto('la religiosidad/la religiosidad.als', [clip('../carlos y oscar/Samples/Recorded/bass.wav')]),
      proyecto('Finished/Track 1 Project/Track 1.als'),
    ]

    const grupos = planificarOptimizacion(projects, {})
    expect(grupos.find((g) => g.nombreActual === 'Finished')?.fija).toBe(false)
  })

  it('agrupa varios proyectos de la misma carpeta de primer nivel en un solo grupo', () => {
    const projects = [
      proyecto('Ideas/A Project/A.als'),
      proyecto('Ideas/B Project/B.als'),
    ]
    const grupos = planificarOptimizacion(projects, {})
    expect(grupos).toHaveLength(1)
    expect(grupos[0].numeroDeProyectos).toBe(2)
  })

  it('ignora proyectos sueltos en la raíz (sin carpeta de primer nivel)', () => {
    const projects = [proyecto('Suelto.als')]
    expect(planificarOptimizacion(projects, {})).toEqual([])
  })
})
