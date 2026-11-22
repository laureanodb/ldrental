import { describe, it, expect } from 'vitest';
import { dniValido, cuitValido, cbuValido, patenteValida, normalizarTelAR, mismoTel, mismoDni } from '../src/validar.js';

describe('validaciones argentinas', () => {
  it('DNI', () => {
    expect(dniValido('30.111.222')).toBe(true);
    expect(dniValido('1234567')).toBe(true);
    expect(dniValido('123')).toBe(false);
  });
  it('CUIT con dígito verificador', () => {
    expect(cuitValido('20-12345678-6')).toBe(true);
    expect(cuitValido('20-12345678-5')).toBe(false);
    expect(cuitValido('2012345')).toBe(false);
  });
  it('CBU con sus dos verificadores', () => {
    expect(cbuValido('2850590940090418135201')).toBe(true);
    expect(cbuValido('2850590940090418135202')).toBe(false);
  });
  it('patentes', () => {
    expect(patenteValida('AB 123 CD')).toBe(true);
    expect(patenteValida('abc123')).toBe(true);
    expect(patenteValida('A123BCD')).toBe(true);
    expect(patenteValida('AB12CD')).toBe(false);
  });
  it('teléfono al formato de WhatsApp', () => {
    expect(normalizarTelAR('011 15 5555-1234')).toBe('+5491155551234');
    expect(normalizarTelAR('11 5555 1234')).toBe('+5491155551234');
    expect(normalizarTelAR('+54 9 11 5555-1234')).toBe('+5491155551234');
    expect(normalizarTelAR('0221 15 444 5566')).toBe('+5492214445566');
    expect(normalizarTelAR('+598 99 123 456')).toBe('+598 99 123 456');
    expect(normalizarTelAR('')).toBe('');
  });
  it('comparar teléfonos y DNI escritos distinto', () => {
    expect(mismoTel('+5491155551234', '11 5555-1234')).toBe(true);
    expect(mismoTel('1155551234', '1155559999')).toBe(false);
    expect(mismoDni('30.111.222', '30111222')).toBe(true);
  });
});
