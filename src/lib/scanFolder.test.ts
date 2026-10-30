import { describe, expect, it } from 'vitest'
import { debeIgnorarse } from './scanFolder'

describe('debeIgnorarse', () => {
  it('ignora una carpeta llamada Backup', () => {
    expect(debeIgnorarse('Backup', 'directory')).toBe(true)
  })

  it('no ignora un archivo llamado Backup.als', () => {
    expect(debeIgnorarse('Backup.als', 'file')).toBe(false)
  })

  it('ignora archivos que empiezan por "._"', () => {
    expect(debeIgnorarse('._idea.als', 'file')).toBe(true)
  })

  it('no ignora carpetas o archivos normales', () => {
    expect(debeIgnorarse('idea berto 2 Project', 'directory')).toBe(false)
    expect(debeIgnorarse('idea berto 2.als', 'file')).toBe(false)
  })
})
