import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAlsProject } from './alsReader'

/**
 * Estos tres fixtures son sintéticos (XML hecho a mano, no proyectos reales
 * de Ableton) para validar la estructura del lector de forma controlada.
 * Ver tests/fixtures/README.md.
 */
async function loadFixture(name: string): Promise<Uint8Array> {
  const buffer = await readFile(resolve(process.cwd(), 'tests/fixtures', name))
  return new Uint8Array(buffer)
}

describe('parseAlsProject', () => {
  it('lee un proyecto de Live 11 (MasterTrack, formato fácil de rutas)', async () => {
    const bytes = await loadFixture('synthetic-live11.als')
    const info = await parseAlsProject(bytes)

    expect(info.liveVersion).toBe('Ableton Live 11.0.12')
    expect(info.bpm).toBe(120)
    expect(info.tracks).toEqual(['Voz principal', 'Bajo', 'Reverb'])
    expect(info.audioClips).toEqual([
      {
        track: 'Voz principal',
        relativePath: 'Samples/Recorded/Voz principal.wav',
        originalFileSize: 123456,
        durationBeats: 16,
      },
    ])
  })

  it('lee un proyecto de Live 12 (MainTrack, sin clips de audio)', async () => {
    const bytes = await loadFixture('synthetic-live12.als')
    const info = await parseAlsProject(bytes)

    expect(info.liveVersion).toBe('Ableton Live 12.0.5')
    expect(info.bpm).toBe(95.5)
    expect(info.tracks).toEqual(['Guitarra acústica', 'Batería'])
    expect(info.audioClips).toEqual([])
  })

  it('lee un proyecto de Live 9 (formato viejo de rutas, con RelativePathElement)', async () => {
    const bytes = await loadFixture('synthetic-live9.als')
    const info = await parseAlsProject(bytes)

    expect(info.liveVersion).toBe('Ableton Live 9.7.5')
    expect(info.bpm).toBe(140)
    expect(info.tracks).toEqual(['Idea vieja'])
    expect(info.audioClips).toEqual([
      {
        track: 'Idea vieja',
        relativePath: 'Samples/Recorded/0002 idea-1.wav',
        originalFileSize: null,
        durationBeats: 16,
      },
    ])
  })

  it('lanza un error si el archivo no es un .als válido', async () => {
    const basura = new TextEncoder().encode('esto no es gzip')
    await expect(parseAlsProject(basura)).rejects.toThrow()
  })
})
