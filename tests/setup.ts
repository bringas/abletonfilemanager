import { DecompressionStream, ReadableStream } from 'node:stream/web'

// jsdom no trae estas APIs; Node sí las tiene, así que las copiamos al entorno de test.
if (typeof globalThis.DecompressionStream === 'undefined') {
  // @ts-expect-error -- el tipo de Node no coincide exactamente con el del navegador, pero el comportamiento es el mismo.
  globalThis.DecompressionStream = DecompressionStream
}
if (typeof globalThis.ReadableStream === 'undefined') {
  // @ts-expect-error -- idem.
  globalThis.ReadableStream = ReadableStream
}
