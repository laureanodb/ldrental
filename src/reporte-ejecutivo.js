import { S } from './state.js';
import { money, moneyUSD, fdate, today } from './utils.js';
import { settings } from './settings.js';
import { toast } from './modal.js';
import { resumenGeneral, resumenAnual, rankingRoiAutos, porcentajePerdidaGanancia, alertasTendencia, proyeccionRentabilidadTendencia, saludChoferes, activeCars } from './calc.js';
import { saldoAutoseguro } from './autoseguro.js';

export async function descargarReporteEjecutivo() {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 20;
  const linea = (label, val) => { doc.text(label, 14, y); doc.text(String(val), 110, y); y += 7; };
  const titulo = (t) => { y += 4; doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(t, 14, y); doc.setFont(undefined, 'normal'); doc.setFontSize(10); y += 8; };

  doc.setFontSize(18); doc.text(settings.companyName || 'LD Rental', 14, y); y += 8;
  doc.setFontSize(11); doc.text('Reporte ejecutivo — ' + fdate(today().toISOString().slice(0, 10)), 14, y); y += 10;
  doc.setFontSize(10);

  const r = resumenGeneral();
  titulo('Resumen general');
  linea('Cobrado total (alquileres)', money(r.cobrado));
  if (r.cobradoUSD) linea('Cobrado total (financiados)', moneyUSD(r.cobradoUSD));
  linea('Gastos totales', money(r.gastos));
  linea('Rentabilidad neta', money(r.neta));
  linea('Deuda de choferes', money(r.deudaTotal));
  if (r.deudaTotalUSD) linea('Deuda de financiados', moneyUSD(r.deudaTotalUSD));
  linea('Autos activos', r.autosActivos);
  linea('Choferes activos', r.choferesActivos);

  const anio = today().getFullYear();
  const act = resumenAnual(anio), ant = resumenAnual(anio - 1);
  if (act.cobrado || ant.cobrado) {
    titulo('Resumen anual');
    linea(String(anio - 1), money(ant.neta));
    linea(String(anio), money(act.neta));
  }

  const p = proyeccionRentabilidadTendencia();
  if (p.promedioMensual) {
    titulo('Proyección según tendencia');
    linea('Promedio mensual (últimos 3 meses)', money(p.promedioMensual));
    linea('A 6 meses', money(p.proyeccion6));
    linea('A 12 meses', money(p.proyeccion12));
  }

  const pg = porcentajePerdidaGanancia();
  if (pg) {
    titulo('Flota en ganancia vs. pérdida');
    linea('En ganancia', pg.ganancia + ' de ' + pg.total + ' (' + pg.pctGanancia + '%)');
    if (pg.perdida) linea('En pérdida', pg.perdida + ' de ' + pg.total);
  }

  const totalesAuto = activeCars().map(c => ({ c, total: S.payments.filter(p => p.carId === c.id).reduce((a, p) => a + (+p.monto || 0), 0) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  if (totalesAuto.length) {
    titulo('Total histórico cobrado por auto (todos los choferes)');
    totalesAuto.forEach(x => linea(x.c.patente || 'Auto', money(x.total)));
  }

  const roi = rankingRoiAutos().slice(0, 5);
  if (roi.length) {
    titulo('Top 5 autos por retorno de inversión');
    roi.forEach(x => linea(x.c.patente || 'Auto', x.roi + '%'));
  }

  const alertas = alertasTendencia();
  if (alertas.length) {
    titulo('Alertas de tendencia');
    alertas.forEach(a => { doc.text('• ' + a.t, 14, y, { maxWidth: 180 }); y += 8; });
  }

  const deudores = saludChoferes().filter(x => x.deuda > 0).sort((a, b) => b.deuda - a.deuda).slice(0, 5);
  if (deudores.length) {
    titulo('Top 5 choferes con deuda');
    deudores.forEach(x => linea(x.nombre, money(x.deuda)));
  }

  titulo('Fondo de autoseguro');
  linea('Saldo actual', money(saldoAutoseguro()));

  doc.save('reporte-ejecutivo-' + today().toISOString().slice(0, 10) + '.pdf');
  toast('Reporte descargado');
}
