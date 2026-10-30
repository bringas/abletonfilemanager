import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from './db'
import { debeReutilizarProyecto } from './rescan'

describe('debeReutilizarProyecto', () => {
  it('no reutiliza en un escaneo completo (no es de cambios)', () => {
    const existente: ProjectRecord = { path: 'a.als', lastModified: 100 }
    expect(debeReutilizarProyecto(existente, 100, false)).toBe(false)
  })

  it('no reutiliza si el proyecto es nuevo (no estaba antes)', () => {
    expect(debeReutilizarProyecto(undefined, 100, true)).toBe(false)
  })

  it('reutiliza si la fecha de modificación no cambió', () => {
    const existente: ProjectRecord = { path: 'a.als', lastModified: 100 }
    expect(debeReutilizarProyecto(existente, 100, true)).toBe(true)
  })

  it('no reutiliza si la fecha de modificación cambió', () => {
    const existente: ProjectRecord = { path: 'a.als', lastModified: 100 }
    expect(debeReutilizarProyecto(existente, 200, true)).toBe(false)
  })
})
