import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from './db'
import { claveDeCarpeta, construirArbolDeCarpetas, proyectosEnCarpeta } from './folderTree'

function proyecto(path: string): ProjectRecord {
  return { path }
}

describe('construirArbolDeCarpetas', () => {
  it('cuenta los proyectos en la raíz', () => {
    const arbol = construirArbolDeCarpetas([proyecto('Idea 1.als'), proyecto('Idea 2.als')])
    expect(arbol.numeroDeProyectos).toBe(2)
    expect(arbol.hijos).toEqual([])
  })

  it('agrupa proyectos en subcarpetas anidadas', () => {
    const arbol = construirArbolDeCarpetas([
      proyecto('Ideas/Berlin Sketch Project/Berlin Sketch.als'),
      proyecto('Ideas/Jams/Jam 1.als'),
      proyecto('Finished/Track 1.als'),
    ])

    expect(arbol.numeroDeProyectos).toBe(3)
    const nombres = arbol.hijos.map((h) => h.nombre)
    expect(nombres).toEqual(['Finished', 'Ideas'])

    const ideas = arbol.hijos.find((h) => h.nombre === 'Ideas')!
    expect(ideas.numeroDeProyectos).toBe(2)
    expect(ideas.hijos.map((h) => h.nombre)).toEqual(['Berlin Sketch Project', 'Jams'])
  })

  it('las carpetas van ordenadas alfabéticamente', () => {
    const arbol = construirArbolDeCarpetas([proyecto('Zeta/a.als'), proyecto('Alfa/b.als')])
    expect(arbol.hijos.map((h) => h.nombre)).toEqual(['Alfa', 'Zeta'])
  })
})

describe('proyectosEnCarpeta', () => {
  const projects = [
    proyecto('Ideas/Berlin Sketch Project/Berlin Sketch.als'),
    proyecto('Ideas/Jams/Jam 1.als'),
    proyecto('Finished/Track 1.als'),
  ]

  it('con carpeta vacía, devuelve todos los proyectos', () => {
    expect(proyectosEnCarpeta(projects, [])).toHaveLength(3)
  })

  it('filtra por carpeta, incluidas las subcarpetas', () => {
    const resultado = proyectosEnCarpeta(projects, ['Ideas'])
    expect(resultado).toHaveLength(2)
    expect(resultado.every((p) => p.path.startsWith('Ideas/'))).toBe(true)
  })

  it('no confunde "Ideas" con "Ideas Viejas"', () => {
    const conParecida = [...projects, proyecto('Ideas Viejas/x.als')]
    const resultado = proyectosEnCarpeta(conParecida, ['Ideas'])
    expect(resultado).toHaveLength(2)
  })
})

describe('claveDeCarpeta', () => {
  it('une los segmentos con "/"', () => {
    expect(claveDeCarpeta(['Ideas', 'Jams'])).toBe('Ideas/Jams')
    expect(claveDeCarpeta([])).toBe('')
  })
})
