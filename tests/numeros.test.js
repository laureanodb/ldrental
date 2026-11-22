import { describe, it, expect } from 'vitest';
import { normalizarNumero } from '../src/numeros.js';

describe('montos escritos a la argentina', () => {
  it('punto de miles', () => {
    expect(normalizarNumero('360.000')).toBe('360000');
    expect(normalizarNumero('1.500.000')).toBe('1500000');
    expect(normalizarNumero('$ 330.000')).toBe('330000');
  });
  it('coma decimal', () => {
    expect(normalizarNumero('1.500.000,50')).toBe('1500000.50');
    expect(normalizarNumero('12,5')).toBe('12.5');
  });
  it('lo que ya está bien no se toca', () => {
    expect(normalizarNumero('360000')).toBe('360000');
    expect(normalizarNumero('12.5')).toBe('12.5');
    expect(normalizarNumero('hola')).toBe('hola');
  });
});
