import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import { resolverClip, resolverSegmentos } from './resolvePath'
import type { AudioFileEntry } from './scanFolder'

describe('resolverSegmentos', () => {
  it('resuelve una ruta relativa dentro de la misma carpeta del proyecto', () => {
    const resultado = resolverSegmentos(
      ['carlos y oscar', 'camoeli2 Project'],
      'Samples/Recorded/audio.wav',
    )
    expect(resultado).toEqual(['carlos y oscar', 'camoeli2 Project', 'Samples', 'Recorded', 'audio.wav'])
  })

  it('sube de carpeta con ".." hasta otro proyecto hermano', () => {
    // Caso real encontrado en camoeli2.als: el audio está en otro proyecto.
    const resultado = resolverSegmentos(
      ['carlos y oscar', 'camoeli2 Project'],
      '../../Untitled Project/Samples/Recorded/audio.wav',
    )
    expect(resultado).toEqual(['Untitled Project', 'Samples', 'Recorded', 'audio.wav'])
  })

  it('ignora segmentos "."', () => {
    const resultado = resolverSegmentos(['proyecto'], './Samples/audio.wav')
    expect(resultado).toEqual(['proyecto', 'Samples', 'audio.wav'])
  })
})

/** Simula una carpeta raíz donde ninguna ruta existe, para forzar el fallback al índice. */
function raizQueNuncaEncuentraNada(): FileSystemDirectoryHandle {
  return {
    getDirectoryHandle: () => Promise.reject(new Error('no existe')),
    getFileHandle: () => Promise.reject(new Error('no existe')),
  } as unknown as FileSystemDirectoryHandle
}

describe('resolverClip', () => {
  it('devuelve null si el clip no tiene ruta relativa', async () => {
    const clip: AudioClipInfo = {
      track: 'Voz',
      relativePath: null,
      originalFileSize: null,
      durationBeats: null,
    }
    const resultado = await resolverClip(raizQueNuncaEncuentraNada(), [], clip, [])
    expect(resultado).toBeNull()
  })

  it('si la ruta relativa no existe, cae al índice de audios por nombre y tamaño', async () => {
    const clip: AudioClipInfo = {
      track: 'Voz',
      relativePath: 'Samples/Recorded/audio.wav',
      originalFileSize: 999,
      durationBeats: 16,
    }
    const handleEsperado = {} as FileSystemFileHandle
    const indice: AudioFileEntry[] = [
      { handle: handleEsperado, path: 'Samples/Recorded/audio.wav', name: 'audio.wav', size: 999 },
    ]

    const resultado = await resolverClip(raizQueNuncaEncuentraNada(), ['proyecto'], clip, indice)
    expect(resultado).toBe(handleEsperado)
  })

  it('devuelve null si ni la ruta ni el índice encuentran el archivo', async () => {
    const clip: AudioClipInfo = {
      track: 'Voz',
      relativePath: 'Samples/Recorded/audio.wav',
      originalFileSize: 999,
      durationBeats: 16,
    }
    const resultado = await resolverClip(raizQueNuncaEncuentraNada(), ['proyecto'], clip, [])
    expect(resultado).toBeNull()
  })
})
