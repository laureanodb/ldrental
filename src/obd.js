// Códigos de falla OBD-II: diccionario de los más comunes y lectura con un
// adaptador ELM327 Bluetooth LE desde Chrome en Android (Web Bluetooth).

// Descripciones genéricas (SAE). Cada marca puede tener las suyas.
const DICC = {
  P0010: 'Circuito del actuador de la distribución variable (banco 1)',
  P0011: 'Distribución variable adelantada de más (banco 1)',
  P0100: 'Falla en el sensor de flujo de aire (MAF)',
  P0101: 'Sensor de flujo de aire (MAF) fuera de rango',
  P0105: 'Falla en el sensor de presión del múltiple (MAP)',
  P0106: 'Sensor de presión del múltiple (MAP) fuera de rango',
  P0110: 'Falla en el sensor de temperatura del aire de admisión',
  P0115: 'Falla en el sensor de temperatura del motor',
  P0116: 'Sensor de temperatura del motor fuera de rango',
  P0117: 'Sensor de temperatura del motor: señal baja',
  P0118: 'Sensor de temperatura del motor: señal alta',
  P0120: 'Falla en el sensor de posición del acelerador (TPS)',
  P0121: 'Sensor de posición del acelerador fuera de rango',
  P0128: 'El motor no llega a temperatura (posible termostato abierto)',
  P0130: 'Falla en la sonda lambda (banco 1, sensor 1)',
  P0133: 'Sonda lambda lenta (banco 1, sensor 1)',
  P0134: 'Sonda lambda sin actividad (banco 1, sensor 1)',
  P0135: 'Calefactor de la sonda lambda (banco 1, sensor 1)',
  P0136: 'Falla en la sonda lambda (banco 1, sensor 2)',
  P0141: 'Calefactor de la sonda lambda (banco 1, sensor 2)',
  P0171: 'Mezcla pobre (banco 1): posible entrada de aire, inyectores o bomba de nafta',
  P0172: 'Mezcla rica (banco 1)',
  P0174: 'Mezcla pobre (banco 2)',
  P0175: 'Mezcla rica (banco 2)',
  P0201: 'Circuito del inyector del cilindro 1',
  P0202: 'Circuito del inyector del cilindro 2',
  P0203: 'Circuito del inyector del cilindro 3',
  P0204: 'Circuito del inyector del cilindro 4',
  P0230: 'Circuito de la bomba de combustible',
  P0300: 'Fallas de encendido en varios cilindros',
  P0301: 'Falla de encendido en el cilindro 1',
  P0302: 'Falla de encendido en el cilindro 2',
  P0303: 'Falla de encendido en el cilindro 3',
  P0304: 'Falla de encendido en el cilindro 4',
  P0325: 'Falla en el sensor de detonación',
  P0335: 'Falla en el sensor de posición del cigüeñal',
  P0340: 'Falla en el sensor de posición del árbol de levas',
  P0351: 'Bobina de encendido A',
  P0352: 'Bobina de encendido B',
  P0353: 'Bobina de encendido C',
  P0354: 'Bobina de encendido D',
  P0400: 'Falla en la recirculación de gases (EGR)',
  P0401: 'Flujo de EGR insuficiente',
  P0420: 'Eficiencia del catalizador baja (banco 1)',
  P0430: 'Eficiencia del catalizador baja (banco 2)',
  P0440: 'Falla en el sistema de vapores de combustible (canister)',
  P0442: 'Pérdida chica en el sistema de vapores (revisar tapa de nafta)',
  P0443: 'Válvula de purga del canister',
  P0455: 'Pérdida grande en el sistema de vapores (revisar tapa de nafta)',
  P0480: 'Circuito del electroventilador 1',
  P0500: 'Falla en el sensor de velocidad',
  P0505: 'Falla en el control de ralentí',
  P0506: 'Ralentí más bajo de lo normal',
  P0507: 'Ralentí más alto de lo normal',
  P0560: 'Tensión del sistema (batería o alternador)',
  P0562: 'Tensión del sistema baja (batería o alternador)',
  P0563: 'Tensión del sistema alta',
  P0600: 'Falla de comunicación de la computadora',
  P0700: 'Falla en la caja automática (leer el código de la caja)',
  P0715: 'Sensor de velocidad de entrada de la caja',
  P1000: 'Diagnóstico a bordo sin completar (normal después de desconectar la batería)',
  P2135: 'Sensores del acelerador no coinciden',
  P2187: 'Mezcla pobre en ralentí (banco 1)',
  C0035: 'Sensor de velocidad de rueda delantera izquierda (ABS)',
  C0040: 'Sensor de velocidad de rueda delantera derecha (ABS)',
  U0100: 'Sin comunicación con la computadora del motor',
};
export function describirCodigo(cod) {
  const c = String(cod || '').toUpperCase().trim();
  if (DICC[c]) return DICC[c];
  const sistema = { P: 'motor o caja', C: 'chasis (frenos, ABS, dirección)', B: 'carrocería (airbag, confort)', U: 'comunicación entre módulos' }[c[0]];
  return sistema ? 'Código del sistema de ' + sistema + (c[1] === '1' || c[1] === '3' ? ', propio de la marca' : '') : '';
}
export const codigoValido = c => /^[PCBU][0-3][0-9A-F]{3}$/i.test(String(c || '').trim());

// "43 01 33 00 00" → ["P0133"]. Admite respuestas con o sin espacios y con el byte de cantidad (CAN).
export function parsearModo03(resp) {
  const out = [];
  String(resp || '').toUpperCase().split(/[\r\n>]+/).map(l => l.replace(/[^0-9A-F]/g, '')).filter(l => l.startsWith('43')).forEach(l => {
    let d = l.slice(2);
    if (d.length % 4 === 2) d = d.slice(2);
    for (let i = 0; i + 4 <= d.length; i += 4) {
      const h = d.slice(i, i + 4);
      if (h === '0000') continue;
      const v = parseInt(h[0], 16);
      out.push('PCBU'[v >> 2] + (v & 3) + h.slice(1));
    }
  });
  return [...new Set(out)];
}

const SERVICIOS = [0xfff0, 0xffe0, 0x18f0, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000fff0-0000-1000-8000-00805f9b34fb'];
export const obdDisponible = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

// Se conecta al adaptador, pide los códigos guardados (modo 03) y pendientes (modo 07) y se desconecta.
export async function leerCodigosOBD(progreso) {
  if (!obdDisponible()) throw new Error('Este celular o navegador no permite Bluetooth desde la web. Usá Chrome en Android.');
  const p = t => { try { progreso && progreso(t); } catch (e) {} };
  p('Elegí el adaptador en la lista…');
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS });
  p('Conectando con ' + (dev.name || 'el adaptador') + '…');
  const server = await dev.gatt.connect();
  try {
    let lectura = null, escritura = null;
    for (const uuid of SERVICIOS) {
      let svc; try { svc = await server.getPrimaryService(uuid); } catch (e) { continue; }
      const chars = await svc.getCharacteristics();
      lectura = chars.find(ch => ch.properties.notify || ch.properties.indicate) || null;
      escritura = chars.find(ch => ch.properties.write || ch.properties.writeWithoutResponse) || null;
      if (lectura && escritura) break;
    }
    if (!lectura || !escritura) throw new Error('El adaptador no es compatible (tiene que ser ELM327 Bluetooth LE / 4.0).');
    let buffer = '', esperando = null;
    lectura.addEventListener('characteristicvaluechanged', ev => {
      buffer += new TextDecoder().decode(ev.target.value);
      if (buffer.includes('>') && esperando) { const r = buffer; buffer = ''; const f = esperando; esperando = null; f(r); }
    });
    await lectura.startNotifications();
    const enviar = cmd => new Promise((resolve, reject) => {
      buffer = '';
      const t = setTimeout(() => { esperando = null; reject(new Error('El adaptador no respondió a ' + cmd)); }, cmd === 'ATZ' ? 6000 : 8000);
      esperando = r => { clearTimeout(t); resolve(r); };
      const datos = new TextEncoder().encode(cmd + '\r');
      (escritura.properties.write ? escritura.writeValue(datos) : escritura.writeValueWithoutResponse(datos)).catch(e => { clearTimeout(t); reject(e); });
    });
    p('Preparando el adaptador…');
    for (const c of ['ATZ', 'ATE0', 'ATL0', 'ATS1', 'ATH0', 'ATSP0']) await enviar(c);
    p('Leyendo códigos de falla…');
    const guardados = parsearModo03(await enviar('03'));
    let pendientes = [];
    try { pendientes = parsearModo03((await enviar('07')).replace(/(^|[\r\n])\s*47/g, '$143')); } catch (e) {}
    return { guardados, pendientes: pendientes.filter(c => !guardados.includes(c)), adaptador: dev.name || '' };
  } finally {
    try { server.disconnect(); } catch (e) {}
  }
}
