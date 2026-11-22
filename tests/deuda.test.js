import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S } from '../src/state.js';
import { tocarDatos } from '../src/memo.js';
import { calc } from '../src/calc.js';

// La cuenta más importante de la app: cuánto debe cada chofer.
describe('deuda de un alquiler semanal', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 22, 12)); // domingo 22/11/2026
    S.payments = []; S.depositos = []; S.drivers = [{ id: 'd1', nombre: 'Ana' }];
  });
  afterEach(() => vi.useRealTimers());
  const auto = extra => ({ id: 'c1', tipo: 'alquiler', choferId: 'd1', monto: 300000, inicio: '2026-11-02', ...extra });

  it('cuenta las semanas empezadas', () => {
    S.cars = [auto()]; tocarDatos();
    const r = calc(S.cars[0]);
    expect(r.weeks).toBe(3);
    expect(r.due).toBe(900000);
    expect(r.debt).toBe(900000);
  });
  it('descuenta los pagos de alquiler desde el inicio', () => {
    S.cars = [auto()];
    S.payments = [
      { id: 'p1', carId: 'c1', tipo: 'alquiler', monto: 300000, fecha: '2026-11-03' },
      { id: 'p2', carId: 'c1', tipo: 'alquiler', monto: 300000, fecha: '2026-11-10' },
      { id: 'p3', carId: 'c1', tipo: 'alquiler', monto: 999999, fecha: '2026-10-01' }, // de antes del contrato: no cuenta
      { id: 'p4', carId: 'c1', tipo: 'multa', monto: 50000, fecha: '2026-11-12' }, // otro concepto: no cuenta
    ];
    tocarDatos();
    const r = calc(S.cars[0]);
    expect(r.paid).toBe(600000);
    expect(r.debt).toBe(300000);
    expect(r.late).toBe(1);
  });
  it('suma la deuda inicial y resta los ajustes', () => {
    S.cars = [auto({ deudaInicial: 100000, ajustesDeuda: [{ monto: 50000 }] })]; tocarDatos();
    expect(calc(S.cars[0]).debt).toBe(950000);
  });
  it('nunca da deuda negativa', () => {
    S.cars = [auto()]; S.payments = [{ id: 'p1', carId: 'c1', tipo: 'alquiler', monto: 5000000, fecha: '2026-11-03' }]; tocarDatos();
    expect(calc(S.cars[0]).debt).toBe(0);
  });
  it('un contrato que todavía no empezó no debe nada', () => {
    S.cars = [auto({ inicio: '2026-12-01' })]; tocarDatos();
    expect(calc(S.cars[0]).debt).toBe(0);
  });
  it('un auto sin contrato no debe nada', () => {
    S.cars = [auto({ tipo: 'disponible' })]; tocarDatos();
    expect(calc(S.cars[0]).debt).toBe(0);
  });
});
