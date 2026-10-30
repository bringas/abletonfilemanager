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
  return { handle: {} as FileSystemFileHandle, path, name, size, lastModified: 0 }
}

describe('buscarEnIndice', () => {
  it('encuentra por nombre y confirma por tamaño cuando hay varias coincidencias', () => {
    const indice = [entrada('audio.wav', 100, 'a/audio.wav'), entrada('audio.wav', 200, 'b/audio.wav')]
    const resultado = buscarEnIndice(indice, 'audio.wav', 200)
    expect(resultado?.path).toBe('b/audio.wav')
  })

  it('si solo hay una coincidencia por nombre, se la queda aunque no sepamos el tamaño', () => {
    const indice = [entrada('audio.wav', 100, 'a/audio.wav')]
    const resultado = buscarEnIndice(indice, 'audio.wav', null)
    expect(resultado?.path).toBe('a/audio.wav')
  })

  it('devuelve null si no hay ninguna coincidencia por nombre', () => {
    const indice = [entrada('otra-cosa.wav', 100)]
    expect(buscarEnIndice(indice, 'audio.wav', null)).toBeNull()
  })

  it('con varias coincidencias y sin tamaño que las distinga, no adivina (devuelve null)', () => {
    // Pasa cuando se reutiliza una carpeta de sesión para varios proyectos:
    // puede haber dos archivos distintos con el mismo nombre genérico.
    const indice = [entrada('bass 0001.wav', 500, 'a/bass 0001.wav'), entrada('bass 0001.wav', 700, 'b/bass 0001.wav')]
    expect(buscarEnIndice(indice, 'bass 0001.wav', null)).toBeNull()
    // Un tamaño esperado de 0 (Live a veces lo deja así) tampoco es un tamaño real.
    expect(buscarEnIndice(indice, 'bass 0001.wav', 0)).toBeNull()
  })

  it('con varias coincidencias, si el tamaño esperado coincide con una, esa se queda', () => {
    const indice = [entrada('bass 0001.wav', 500, 'a/bass 0001.wav'), entrada('bass 0001.wav', 700, 'b/bass 0001.wav')]
    const resultado = buscarEnIndice(indice, 'bass 0001.wav', 700)
    expect(resultado?.path).toBe('b/bass 0001.wav')
  })
})
