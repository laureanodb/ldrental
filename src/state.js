import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const S = { cars: [], drivers: [], payments: [], gastos: [], proveedores: [], sanciones: [], prospectos: [], inspecciones: [], mantenimientos: [], multas: [], ready: false, user: null, chan: null, profile: null, profilesEnabled: false };
export const ui = { tab: 'panel', qCars: '', qDrivers: '', filterCar: '', showVendidos: false, showInactivos: false, showProspectos: false };

export let sb = null, dl = null, as = null;
export function setSb(v) { sb = v; }
export function setAs(v) { as = v; }
export function setDl(v) { dl = v; }

export const configured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);
