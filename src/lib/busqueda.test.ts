import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from './db'
import { coincideBusqueda } from './busqueda'

function proyecto(parcial: Partial<ProjectRecord>): ProjectRecord {
  return { path: 'idea.als', ...parcial }
}

describe('coincideBusqueda', () => {
  it('con texto vacío, coincide siempre', () => {
    expect(coincideBusqueda(proyecto({}), '')).toBe(true)
    expect(coincideBusqueda(proyecto({}), '   ')).toBe(true)
  })

  it('coincide por nombre de archivo, sin importar mayúsculas', () => {
    expect(coincideBusqueda(proyecto({ path: 'Carpeta/Idea Berto 2.als' }), 'berto')).toBe(true)
  })

  it('coincide por nombre de pista', () => {
    const project = proyecto({
      path: 'x.als',
      info: { liveVersion: '', bpm: null, tracks: ['Voz principal'], audioClips: [] },
    })
    expect(coincideBusqueda(project, 'voz')).toBe(true)
  })

  it('no coincide si no aparece ni en el nombre ni en las pistas', () => {
    const project = proyecto({
      path: 'x.als',
      info: { liveVersion: '', bpm: null, tracks: ['Bajo'], audioClips: [] },
    })
    expect(coincideBusqueda(project, 'batería')).toBe(false)
  })

  it('coincide por alias', () => {
    const project = proyecto({ path: 'Untitled 47.als' })
    expect(coincideBusqueda(project, 'post-punk', { projectId: project.path, alias: 'Post-punk riff' })).toBe(
      true,
    )
  })

  it('coincide por etiqueta', () => {
    const project = proyecto({ path: 'Untitled 47.als' })
    const meta = { projectId: project.path, etiquetas: ['reggaeton', 'demo'] }
    expect(coincideBusqueda(project, 'reggaeton', meta)).toBe(true)
  })
})
