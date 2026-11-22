import { describe, it, expect } from 'vitest';
import { camposCambiados, combinar } from '../src/conflictos.js';

describe('dos personas editando lo mismo', () => {
  const base = { id: 'c1', km: 1000, notas: '', monto: 300000 };
  it('detecta qué campos cambié', () => {
    expect(camposCambiados(base, { ...base, notas: 'hola' })).toEqual(['notas']);
  });
  it('junta cambios en campos distintos', () => {
    const r = combinar({ ...base, km: 5000 }, { ...base, notas: 'chau' }, base);
    expect(r).toMatchObject({ km: 5000, notas: 'chau' });
  });
  it('se puede saber cuándo tocaron el mismo campo', () => {
    const servidor = { ...base, monto: 350000 }, mio = { ...base, monto: 320000 };
    const pisados = camposCambiados(base, mio).filter(k => camposCambiados(base, servidor).includes(k));
    expect(pisados).toEqual(['monto']);
    expect(combinar(servidor, mio, base).monto).toBe(320000);
  });
  it('si borré un campo, se borra', () => {
    const r = combinar({ ...base, km: 5000 }, { id: 'c1', km: 1000, monto: 300000 }, base);
    expect('notas' in r).toBe(false);
  });
});
