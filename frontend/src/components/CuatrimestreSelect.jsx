import SelectDark from './SelectDark';

/**
 * CuatrimestreSelect — selector de período académico.
 *
 * El año universitario UTECAN tiene 3 cuatrimestres:
 *   ENE-ABR | MAY-AGO | SEP-DIC
 *
 * Exporta también:
 *   getCuatrimestreActual()  → string del período en curso
 *   getCuatrimestres()       → array con rango de opciones
 */

const PERIODOS = ['ENE-ABR', 'MAY-AGO', 'SEP-DIC'];

/**
 * Devuelve el cuatrimestre actual basado en el mes del sistema.
 */
export function getCuatrimestreActual() {
  const mes  = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  if (mes <= 4) return `ENE-ABR-${year}`;
  if (mes <= 8) return `MAY-AGO-${year}`;
  return `SEP-DIC-${year}`;
}

/**
 * Genera el listado de cuatrimestres para el selector.
 * @param {number} antes   - años hacia atrás  (default 1)
 * @param {number} despues - años hacia adelante (default 2)
 */
export function getCuatrimestres(antes = 1, despues = 2) {
  const year = new Date().getFullYear();
  const result = [];
  for (let y = year - antes; y <= year + despues; y++) {
    PERIODOS.forEach(p => result.push(`${p}-${y}`));
  }
  return result;
}

/**
 * Componente <CuatrimestreSelect> listo para usar en cualquier formulario.
 *
 * Props:
 *   value      string  — valor controlado
 *   onChange   fn(str) — callback cuando cambia
 *   className  string  — clases Tailwind adicionales
 *   dark       bool    — ignorado (siempre dark, se mantiene por compatibilidad)
 */
export default function CuatrimestreSelect({ value, onChange, className = '' }) {
  const opciones = getCuatrimestres();
  const opts = opciones.map(c => ({ value: c, label: c }));

  return (
    <SelectDark
      value={value}
      onChange={onChange}
      options={opts}
      className={className}
    />
  );
}
