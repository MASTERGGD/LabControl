/**
 * TimeGrid — componente de cuadrícula semanal compartida
 *
 * Props:
 *   dias        {number[]}         — índices de días a mostrar (0=Lunes…5=Sábado)
 *   horas       {string[]}         — hora_inicio ordenada, ej. ['08:00','09:00',...]
 *   horaFinMap  {Record<string,string>} — { '08:00':'09:00', '09:00':'09:45', ... }
 *   renderCell  {(dia, hora) => ReactNode} — contenido de cada celda
 *   showBreak   {boolean}          — mostrar fila de receso 9:45→10:15 (default true)
 */

import React from 'react';

const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// La cuadrícula representa periodos, no una línea de tiempo proporcional.
// Mantener una altura fija evita que un turno largo de un solo día deforme toda la semana.
const ROW_PX = 80;

// Estilos compartidos
const BG_DARK    = 'var(--timegrid-bg, rgb(2 6 23))';
const BORDER_ROW = 'var(--timegrid-row-border, rgba(255,255,255,0.04))';
const BORDER_COL = 'var(--timegrid-col-border, rgba(255,255,255,0.05))';
const BORDER_HDR = 'var(--timegrid-header-border, rgba(255,255,255,0.07))';

export default function TimeGrid({
  dias,
  horas,
  horaFinMap = {},
  renderCell,
  showBreak = true,
}) {
  return (
    <div className="time-grid overflow-x-auto">
      {/* border-separate + spacing:0 es necesario para que sticky funcione en Safari/Chrome */}
      <table
        className="w-full text-sm"
        style={{
          borderCollapse: 'separate',
          borderSpacing: 0,
          background: BG_DARK,
          tableLayout: 'fixed',
        }}
      >
        {/* ── Cabecera de días ── */}
        <thead>
          <tr>
            {/* Esquina */}
            <th
              className="sticky left-0 z-20"
              style={{
                background: BG_DARK,
                borderBottom: `1px solid ${BORDER_HDR}`,
                borderRight: `1px solid ${BORDER_COL}`,
                width: '76px',
                minWidth: '76px',
                padding: '10px 12px',
              }}
            >
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Hora</span>
            </th>

            {/* Día por día */}
            {dias.map(d => (
              <th
                key={d}
                style={{
                  borderBottom: `1px solid ${BORDER_HDR}`,
                  borderRight: `1px solid ${BORDER_COL}`,
                  padding: '10px 8px',
                  minWidth: '110px',
                  textAlign: 'center',
                }}
              >
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {DIAS_LABEL[d]}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Cuerpo ── */}
        <tbody>
          {horas.map(hora => {
            const hFin  = horaFinMap[hora];
            const rowH  = ROW_PX;

            return (
              <React.Fragment key={hora}>

                {/* Fila de receso entre 09:45 y 10:15 */}
                {showBreak && hora === '10:15' && (
                  <tr>
                    <td
                      colSpan={dias.length + 1}
                      style={{
                        padding: 0,
                        background: 'rgba(255,255,255,0.03)',
                        borderTop:    '1px dashed rgba(255,255,255,0.08)',
                        borderBottom: '1px dashed rgba(255,255,255,0.08)',
                      }}
                    >
                      <div className="flex items-center justify-center gap-2 px-3 py-1 text-slate-500 text-[11px] font-medium tracking-widest uppercase">
                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                        <span>☕ Receso · 9:45 – 10:15</span>
                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                      </div>
                    </td>
                  </tr>
                )}

                {/* Fila de horario */}
                <tr>
                  {/* Columna de hora — sticky */}
                  <td
                    className="sticky left-0 z-10"
                    style={{
                      background: BG_DARK,
                      borderTop:   `1px solid ${BORDER_ROW}`,
                      borderRight: `1px solid ${BORDER_COL}`,
                      borderBottom: 'none',
                      height: `${rowH}px`,
                      width: '76px',
                      minWidth: '76px',
                      verticalAlign: 'middle',
                      padding: '0 12px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="text-xs font-mono font-semibold text-slate-400 block leading-tight">
                      {hora}
                    </span>
                    {hFin && (
                      <span className="text-xs font-mono text-slate-600 block leading-tight mt-0.5">
                        {hFin}
                      </span>
                    )}
                  </td>

                  {/* Celdas de contenido */}
                  {dias.map(dia => (
                    <td
                      key={dia}
                      style={{
                        borderTop:   `1px solid ${BORDER_ROW}`,
                        borderRight: `1px solid ${BORDER_COL}`,
                        borderBottom: 'none',
                        height: `${rowH}px`,
                        verticalAlign: 'top',
                        padding: '4px 6px',
                      }}
                    >
                      {renderCell(dia, hora)}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
