export type EstadoPreescucha = 'con audio' | 'solo MIDI' | 'audio no encontrado' | 'no legible'

export function calcularEstado(opciones: {
  tieneError: boolean
  numeroDeClips: number
  algunoEncontrado: boolean
}): EstadoPreescucha {
  if (opciones.tieneError) return 'no legible'
  if (opciones.numeroDeClips === 0) return 'solo MIDI'
  return opciones.algunoEncontrado ? 'con audio' : 'audio no encontrado'
}
