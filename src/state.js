import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const S = { cars: [], drivers: [], payments: [], gastos: [], proveedores: [], sanciones: [], prospectos: [], inspecciones: [], mantenimientos: [], multas: [], depositos: [], siniestros: [], gastosrecurrentes: [], recordatorios: [], ready: false, user: null, chan: null, profile: null, profilesEnabled: false };
export const ui = { tab: 'panel', masView: '', qCars: '', qDrivers: '', filterCar: '', showVendidos: false, showInactivos: false, showProspectos: false, qMant: '', mantProveedor: '', mantDesde: '', mantHasta: '', mantAuto: '', mantItem: '', mantTipo: '', mantOrden: 'fecha', ordenAutos: 'patente', ordenChoferes: 'nombre', filtroAutoTipo: '', filtroCobrosMetodo: '', showDesgloseCobrado: false, ordenCompChoferes: 'antiguedad', ordenCompAutos: 'neta', muAuto: '', muEstado: '', muOrden: 'fecha', siAuto: '', siEstado: '', siOrden: 'fecha', repDesde: '', repHasta: '', autosLimite: 30, choferesLimite: 30, editandoNota: false };

export let sb = null, dl = null, as = null;
export function setSb(v) { sb = v; }
export function setAs(v) { as = v; }
export function setDl(v) { dl = v; }

export const configured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);
