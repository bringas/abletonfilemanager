/**
 * Alturas (entre 0.2 y 1) para dibujar una forma de onda decorativa junto a
 * un clip. No es el audio real del archivo —decodificarlo de verdad sería
 * mucho más lento con cientos de clips—, solo ayuda a distinguir clips a
 * simple vista. Es determinista: la misma semilla da siempre las mismas
 * barras, para que no "parpadeen" al volver a renderizar.
 */
export function generarBarras(semilla: string, cantidad: number): number[] {
  let estado = 0
  for (let i = 0; i < semilla.length; i++) {
    estado = (estado * 31 + semilla.charCodeAt(i)) >>> 0
  }
  if (estado === 0) estado = 1

  const barras: number[] = []
  for (let i = 0; i < cantidad; i++) {
    estado = (estado * 1103515245 + 12345) >>> 0
    barras.push(0.2 + (estado % 1000) / 1000 / 1.25)
  }
  return barras
}
