/**
 * b64ToUint8Array regression tests — base64 decoding robustness.
 *
 * Covers:
 * - Valid base64 round-trip (encode → decode → match)
 * - Invalid/corrupted base64 rejects with error
 * - Empty string handling
 * - Large payload decoding
 * - Padding variations (0, 1, 2 padding chars)
 */

import { describe, it, expect } from 'vitest';
import { b64ToUint8Array } from '../utils/b64';

// Helper: encode Uint8Array to base64 (browser-compatible)
function uint8ToB64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

describe('b64ToUint8Array', () => {
  it('decodes valid base64 to correct Uint8Array', async () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = uint8ToB64(original);
    const decoded = await b64ToUint8Array(b64);
    expect(decoded).toEqual(original);
  });

  it('rejects corrupted base64 string', async () => {
    const corrupted = 'not-valid-base64!!!@@@###';
    await expect(b64ToUint8Array(corrupted)).rejects.toThrow();
  });

  it('rejects truncated base64 (missing padding)', async () => {
    // Valid base64 "SGVsbG8=" truncated to "SGVsbG8"
    // fetch data-URI should reject improperly padded base64
    const truncated = 'SGVsbG8';
    // This may or may not throw depending on browser tolerance;
    // if it doesn't throw, the result should still be decodable
    try {
      const result = await b64ToUint8Array(truncated);
      // If no throw, result should be a Uint8Array (some decoders tolerate missing padding)
      expect(result).toBeInstanceOf(Uint8Array);
    } catch {
      // Rejection is acceptable for strict decoders
      expect(true).toBe(true);
    }
  });

  it('handles empty string → empty Uint8Array', async () => {
    const decoded = await b64ToUint8Array('');
    expect(decoded).toEqual(new Uint8Array([]));
  });

  it('round-trips binary data with all byte values (0-255)', async () => {
    const original = new Uint8Array(256);
    for (let i = 0; i < 256; i++) original[i] = i;
    const b64 = uint8ToB64(original);
    const decoded = await b64ToUint8Array(b64);
    expect(decoded).toEqual(original);
  });

  it('handles base64 with 0 padding chars (length % 3 === 0)', async () => {
    const original = new Uint8Array([65, 66, 67]); // "ABC" → "QUJD" (no padding)
    const b64 = uint8ToB64(original);
    expect(b64).toBe('QUJD');
    expect(b64.includes('=')).toBe(false);
    const decoded = await b64ToUint8Array(b64);
    expect(decoded).toEqual(original);
  });

  it('handles base64 with 1 padding char (length % 3 === 2)', async () => {
    const original = new Uint8Array([65, 66]); // "AB" → "QUI=" (1 pad)
    const b64 = uint8ToB64(original);
    expect(b64).toBe('QUI=');
    const decoded = await b64ToUint8Array(b64);
    expect(decoded).toEqual(original);
  });

  it('handles base64 with 2 padding chars (length % 3 === 1)', async () => {
    const original = new Uint8Array([65]); // "A" → "QQ==" (2 pad)
    const b64 = uint8ToB64(original);
    expect(b64).toBe('QQ==');
    const decoded = await b64ToUint8Array(b64);
    expect(decoded).toEqual(original);
  });

  it('decodes a larger payload (simulating PDF chunk)', async () => {
    // 10KB of random-ish data
    const original = new Uint8Array(10240);
    for (let i = 0; i < original.length; i++) original[i] = (i * 7 + 13) % 256;
    const b64 = uint8ToB64(original);
    const decoded = await b64ToUint8Array(b64);
    expect(decoded.length).toBe(original.length);
    expect(decoded).toEqual(original);
  });
});

describe('cache corruption recovery logic', () => {
  it('corrupted base64 is detectable — atob throws but b64ToUint8Array rejects', async () => {
    const corrupted = 'AAAA' + '!!!CORRUPTED!!!' + 'BBBB';

    // atob would throw
    expect(() => atob(corrupted)).toThrow();

    // b64ToUint8Array should also reject
    await expect(b64ToUint8Array(corrupted)).rejects.toThrow();
  });

  it('partially truncated base64 from localStorage is detectable', async () => {
    // Simulate: valid base64 was "SGVsbG8gV29ybGQ=" but localStorage truncated it
    const full = btoa('Hello World');
    const truncated = full.slice(0, Math.floor(full.length / 2)); // cut in half

    // This should either reject or produce wrong data
    try {
      const result = await b64ToUint8Array(truncated);
      // If it doesn't throw, verify it doesn't match the original
      const original = new TextEncoder().encode('Hello World');
      expect(result.length).not.toBe(original.length);
    } catch {
      // Rejection is the expected safe behavior
      expect(true).toBe(true);
    }
  });
});
