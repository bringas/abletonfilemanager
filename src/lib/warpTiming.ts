import type { MarcaDeTempo } from './alsReader'

/**
 * Convierte un valor en beats "warpeados" al segundo real correspondiente
 * dentro del archivo de audio, interpolando (o extrapolando, si queda fuera
 * del rango) entre las marcas de tempo más cercanas — las mismas que usa
 * Ableton para "warpear" el clip al tempo del proyecto. Hacen falta al
 * menos dos marcas para saber la pendiente (segundos por beat); con menos,
 * no hay forma de calcularlo.
 */
export function beatsASegundos(beats: number, marcas: MarcaDeTempo[]): number | null {
  if (marcas.length < 2) return null

  const ordenadas = [...marcas].sort((a, b) => a.beats - b.beats)

  let i = ordenadas.findIndex((marca) => marca.beats >= beats)
  if (i === -1) i = ordenadas.length - 1
  if (i === 0) i = 1

  const anterior = ordenadas[i - 1]
  const siguiente = ordenadas[i]
  const tramoBeats = siguiente.beats - anterior.beats
  if (tramoBeats === 0) return anterior.segundos

  const pendiente = (siguiente.segundos - anterior.segundos) / tramoBeats
  return anterior.segundos + (beats - anterior.beats) * pendiente
}
