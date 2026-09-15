// tests/core.test.ts
import { describe, expect, it } from 'vitest';

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const validMessage = (value: string) => {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 2000;
};
const validUsername = (value: string) => {
  const normalized = normalize(value);
  return normalized.length >= 2 && normalized.length <= 24;
};

const validPassword = (value: string) => value.length >= 8;

describe('RandomChat validation', () => {
  it('normalizes profile names', () => expect(normalize('  hello   world ')).toBe('hello world'));
  it('rejects empty messages', () => expect(validMessage('   ')).toBe(false));
  it('rejects oversized messages', () => expect(validMessage('x'.repeat(2001))).toBe(false));
  it('accepts the maximum message length', () => expect(validMessage('x'.repeat(2000))).toBe(true));
  it('accepts normal messages', () => expect(validMessage('hello stranger')).toBe(true));
  it('enforces username bounds', () => {
    expect(validUsername('a')).toBe(false);
    expect(validUsername('  ab  ')).toBe(true);
    expect(validUsername('x'.repeat(25))).toBe(false);
  });
  it('requires eight-character passwords', () => {
    expect(validPassword('1234567')).toBe(false);
    expect(validPassword('12345678')).toBe(true);
  });
});
