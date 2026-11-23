/** @jest-environment node */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResumenReservaPuntual from './ResumenReservaPuntual';

test('muestra la fecha más próxima, materia, grupo y cantidad de apartados adicionales', () => {
  const reservas = Object.freeze([
    { fecha_actividad: '2026-12-01', materia: 'Bases de datos', grupo: '1 A' },
    { fecha_actividad: '2026-11-24', materia: 'Minería de Texto', grupo: '7° A' },
    { fecha_actividad: '2026-12-08', materia: 'Programación', grupo: '2 B' },
  ]);
  const html = renderToStaticMarkup(<ResumenReservaPuntual reservas={reservas} compacto />);
  expect(html).toMatch(/Apartado el 24[^<]*nov/);
  expect(html).toContain('Minería de Texto');
  expect(html).toContain('Grupo 7° A');
  expect(html).toContain('+2 apartados más');
  expect(html).not.toContain('Bases de datos');
});

test('distingue el uso individual y los apartados sin datos de materia', () => {
  const individual = { fecha_actividad: '2026-11-24', materia: 'Prueba de equipo', grupo: 'INDIVIDUAL' };
  const historica = { fecha_actividad: '2026-11-24', materia: '', grupo: null };
  const html = renderToStaticMarkup(<ResumenReservaPuntual reservas={[individual]} />);
  expect(html).toContain('Prueba de equipo');
  expect(html).toContain('Uso individual');
  expect(renderToStaticMarkup(<ResumenReservaPuntual reservas={[historica]} />)).toContain('Sesión reservada');
  expect(renderToStaticMarkup(<ResumenReservaPuntual reservas={[]} />)).toBe('');
});
