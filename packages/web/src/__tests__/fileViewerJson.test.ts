import { describe, it, expect } from 'vitest';
import { isJsonFile, formatJsonContent } from '../utils/jsonFormat';

describe('JSON format detection', () => {
  it('data.json is detected as JSON', () => {
    expect(isJsonFile('data.json')).toBe(true);
  });

  it('config.json is detected as JSON', () => {
    expect(isJsonFile('config.json')).toBe(true);
  });

  it('test.notebook.json is NOT detected as JSON (excluded)', () => {
    expect(isJsonFile('test.notebook.json')).toBe(false);
  });

  it('file.txt is not detected as JSON', () => {
    expect(isJsonFile('file.txt')).toBe(false);
  });

  it('file.jsonl is not detected as JSON', () => {
    expect(isJsonFile('file.jsonl')).toBe(false);
  });
});

describe('JSON formatting', () => {
  it('formats valid JSON with 2-space indent', () => {
    const input = '{"name":"test","value":42}';
    const expected = '{\n  "name": "test",\n  "value": 42\n}';
    expect(formatJsonContent(input)).toBe(expected);
  });

  it('falls back to raw content for invalid JSON', () => {
    const input = 'not valid json {[}]';
    expect(formatJsonContent(input)).toBe(input);
  });

  it('handles empty JSON object', () => {
    expect(formatJsonContent('{}')).toBe('{}');
  });

  it('handles JSON array', () => {
    const input = '[1,2,3]';
    const expected = '[\n  1,\n  2,\n  3\n]';
    expect(formatJsonContent(input)).toBe(expected);
  });
});
