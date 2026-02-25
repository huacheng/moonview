/** Decode a base64 string to Uint8Array — uses fetch() data-URI for robustness. */
export async function b64ToUint8Array(b64: string): Promise<Uint8Array> {
  const res = await fetch(`data:application/octet-stream;base64,${b64}`);
  return new Uint8Array(await res.arrayBuffer());
}
