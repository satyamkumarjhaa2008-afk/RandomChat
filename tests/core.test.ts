// tests/core.test.ts
import { describe, expect, it } from 'vitest';

const normalize = (value:string) => value.trim().replace(/\s+/g,' ');
const validMessage = (value:string) => { const v=value.trim(); return v.length>0 && v.length<=2000; };

describe('RandomChat validation',()=>{
  it('normalizes profile names',()=>expect(normalize('  hello   world ')).toBe('hello world'));
  it('rejects empty messages',()=>expect(validMessage('   ')).toBe(false));
  it('rejects oversized messages',()=>expect(validMessage('x'.repeat(2001))).toBe(false));
  it('accepts normal messages',()=>expect(validMessage('hello stranger')).toBe(true));
});
