const PARTICULAS_NOMBRE = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

export function formatNombre(valor = '') {
  return String(valor).trim().replace(/\s+/g, ' ').split(' ').map((palabra, indice) => {
    const minuscula = palabra.toLocaleLowerCase('es-MX');
    if (indice > 0 && PARTICULAS_NOMBRE.has(minuscula)) return minuscula;
    return minuscula.replace(/(^|[-'])\p{L}/gu, letra => letra.toLocaleUpperCase('es-MX'));
  }).join(' ');
}

export function formatCarrera(nombre = '') {
  const original = String(nombre).trim();
  const normal = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/TECNOLOGIAS.*INFORMACION/.test(normal)) return 'TIID';
  if (/INTELIGENCIA ARTIFICIAL/.test(normal)) return /TECNICO|TSU/.test(normal) ? 'TSU IA' : 'IA';
  if (/AGRICULTURA SUSTENTABLE.*PROTEGIDA/.test(normal)) return 'ASP';
  if (/DESARROLLO.*GESTION DE SOFTWARE/.test(normal)) return 'DGS';
  if (/CONTADURIA/.test(normal)) return 'TSU Contaduría';
  if (/PARAMEDICO/.test(normal)) return 'TSU Paramédico';
  if (original.length <= 22) return formatNombre(original);
  const palabras = normal.replace(/LICENCIATURA|INGENIERIA|TECNICO SUPERIOR UNIVERSITARIO/g, '').split(/[^A-Z0-9]+/).filter(p => p && !['EN', 'DE', 'DEL', 'LA', 'EL', 'LAS', 'LOS', 'Y'].includes(p));
  return palabras.map(p => p[0]).join('') || original.slice(0, 22);
}

export function formatAsistencia(porcentaje, clasesRegistradas, minimoMuestra = 3) {
  const clases = Number(clasesRegistradas || 0);
  if (!clases || porcentaje == null) {
    return { texto: 'Sin registro', corto: '—', estado: 'SIN_REGISTRO', clase: 'text-slate-500' };
  }
  const texto = `${Number(porcentaje).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;
  if (clases < minimoMuestra) {
    return { texto, corto: texto, estado: 'MUESTRA_INSUFICIENTE', clase: 'text-slate-400' };
  }
  return {
    texto,
    corto: texto,
    estado: 'CON_DATOS',
    clase: Number(porcentaje) < 80 ? 'text-red-400' : Number(porcentaje) < 90 ? 'text-amber-400' : 'text-emerald-400',
  };
}
