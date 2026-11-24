export async function createUuid(): Promise<string> {
  const bytes = new Uint8Array(16)
  if (typeof wx !== 'undefined') {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const failure = new Error('Random values unavailable.')
      const timer = setTimeout(() => reject(failure), 3_000)
      try {
        wx.getRandomValues({
          length: bytes.length,
          success: ({ randomValues }) => { clearTimeout(timer); resolve(randomValues) },
          fail: () => { clearTimeout(timer); reject(failure) },
        })
      } catch {
        clearTimeout(timer)
        reject(failure)
      }
    })
    bytes.set(new Uint8Array(buffer))
  } else {
    globalThis.crypto.getRandomValues(bytes)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
