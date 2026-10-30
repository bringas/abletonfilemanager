import { describe, expect, it } from 'vitest'
import { buscarEnIndice, debeIgnorarse, type AudioFileEntry } from './scanFolder'

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

function entrada(name: string, size: number, path = name): AudioFileEntry {
  return { handle: {} as FileSystemFileHandle, path, name, size }
}

describe('buscarEnIndice', () => {
  it('encuentra por nombre y confirma por tamaño cuando hay varias coincidencias', () => {
    const indice = [entrada('audio.wav', 100, 'a/audio.wav'), entrada('audio.wav', 200, 'b/audio.wav')]
    const resultado = buscarEnIndice(indice, 'audio.wav', 200)
    expect(resultado?.path).toBe('b/audio.wav')
  })

  it('si no hay tamaño esperado, se queda con la primera coincidencia por nombre', () => {
    const indice = [entrada('audio.wav', 100, 'a/audio.wav')]
    const resultado = buscarEnIndice(indice, 'audio.wav', null)
    expect(resultado?.path).toBe('a/audio.wav')
  })

  it('devuelve null si no hay ninguna coincidencia por nombre', () => {
    const indice = [entrada('otra-cosa.wav', 100)]
    expect(buscarEnIndice(indice, 'audio.wav', null)).toBeNull()
  })
})
