const SEGUNDOS_A_REVISAR = 30
const TAMANO_VENTANA_SEGUNDOS = 0.05
const UMBRAL_SILENCIO = 0.02

/**
 * Decodifica el audio y busca, en los primeros ~30 segundos, el punto donde
 * el volumen deja de ser silencio. Si todo es silencio (o no se puede
 * decodificar), devuelve 0 para empezar desde el principio.
 *
 * Esto necesita AudioContext.decodeAudioData, que solo existe en el
 * navegador: no se puede probar con tests automáticos (jsdom no lo trae).
 */
export async function encontrarInicioSinSilencio(file: File): Promise<number> {
  const contexto = new AudioContext()

  try {
    const buffer = await file.arrayBuffer()
    const audioBuffer = await contexto.decodeAudioData(buffer)
    const datos = audioBuffer.getChannelData(0)

    const tamanoVentana = Math.max(1, Math.floor(audioBuffer.sampleRate * TAMANO_VENTANA_SEGUNDOS))
    const limite = Math.min(datos.length, Math.floor(audioBuffer.sampleRate * SEGUNDOS_A_REVISAR))

    for (let inicio = 0; inicio < limite; inicio += tamanoVentana) {
      const fin = Math.min(inicio + tamanoVentana, limite)
      let suma = 0
      for (let i = inicio; i < fin; i++) suma += Math.abs(datos[i])
      const promedio = suma / (fin - inicio)

      if (promedio > UMBRAL_SILENCIO) {
        return inicio / audioBuffer.sampleRate
      }
    }

    return 0
  } catch {
    return 0
  } finally {
    await contexto.close()
  }
}
