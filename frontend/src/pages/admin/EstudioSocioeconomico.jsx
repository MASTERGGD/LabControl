import { useMemo, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { useTheme } from "../../context/ThemeContext";

const SECCIONES = [
  {
    id: "personales",
    label: "Datos personales",
    descripcion: "Identidad del alumno, datos academicos base y situacion personal.",
    campos: [
      ["nombre", "Nombre del alumno", "ALEJANDRO LOPEZ DANIEL EMANUEL", "texto"],
      ["matricula", "Matricula", "UTC240001", "matricula"],
      ["fecha_ingreso", "Fecha de ingreso", "2026-05-01", "fecha"],
      ["carrera", "Carrera", "LIC. EN CIENCIA DE DATOS", "select"],
      ["sexo", "Sexo", "Masculino", "select"],
      ["estado_civil", "Estado civil", "Soltero", "select"],
      ["lugar_nacimiento", "Lugar de nacimiento", "Calkini, Campeche", "texto"],
      ["fecha_nacimiento", "Fecha de nacimiento", "2005-09-12", "fecha"],
      ["tiene_hijos", "Tiene hijos", "No", "condicional"],
      ["lengua_indigena", "Habla lengua distinta al espanol", "No", "condicional"],
    ],
  },
  {
    id: "domicilios",
    label: "Contacto y domicilios",
    descripcion: "Domicilio de procedencia, residencia y telefonos capturados por separado.",
    campos: [
      ["procedencia_calle", "Procedencia: calle y numero", "Calle 12 #45", "texto"],
      ["procedencia_colonia", "Procedencia: colonia", "Centro", "texto"],
      ["procedencia_localidad", "Procedencia: localidad", "Calkini", "texto"],
      ["procedencia_municipio", "Procedencia: municipio", "Calkini", "texto"],
      ["procedencia_estado", "Procedencia: estado", "Campeche", "select"],
      ["procedencia_cp", "Procedencia: codigo postal", "24900", "cp"],
      ["procedencia_tel", "Procedencia: telefono", "9961234567", "telefono"],
      ["residencia_calle", "Residencia: calle y numero", "Av. Universidad S/N", "texto"],
      ["residencia_tel", "Residencia: telefono", "", "telefono"],
    ],
  },
  {
    id: "academicos",
    label: "Antecedentes escolares",
    descripcion: "Bachillerato, periodo, promedio y area de procedencia.",
    campos: [
      ["bachillerato", "Bachillerato o escuela de procedencia", "COBACH Calkini", "texto"],
      ["ubicacion_bachillerato", "Lugar de ubicacion", "Calkini, Campeche", "texto"],
      ["periodo_estudios", "Periodo de estudios", "2021-2024", "texto"],
      ["promedio", "Promedio general", "8.4", "decimal"],
      ["area_bachillerato", "Area de bachillerato", "General", "select"],
    ],
  },
  {
    id: "economicos",
    label: "Dependencia economica",
    descripcion: "Persona responsable, ingresos, gasto familiar y apoyos institucionales.",
    campos: [
      ["depende_de", "Depende economicamente de", "Mama", "select"],
      ["responsable_nombre", "Nombre de la persona responsable", "MARIA EMANUEL PECH", "texto"],
      ["responsable_parentesco", "Parentesco", "Madre", "texto"],
      ["responsable_ocupacion", "Ocupacion", "Comerciante", "texto"],
      ["responsable_estudios", "Maximo nivel de estudios", "Bachillerato", "select"],
      ["responsable_ingreso", "Ingreso mensual", "4500", "moneda"],
      ["gasto_familiar", "Gasto mensual familiar", "3800", "moneda"],
      ["dependientes", "Personas que dependen del jefe de familia", "4", "entero"],
      ["apoyo_institucional", "Recibe apoyo o beca", "Si", "condicional"],
      ["institucion_apoyo", "Institucion de apoyo", "Beca institucional", "texto"],
    ],
  },
  {
    id: "familia",
    label: "Datos familiares",
    descripcion: "Informacion de padre, madre, hermanos e ingreso familiar aproximado.",
    campos: [
      ["padre_nombre", "Nombre del padre", "Sin dato", "texto"],
      ["padre_ocupacion", "Ocupacion del padre", "Sin dato", "texto"],
      ["padre_estado_civil", "Estado civil del padre", "Sin dato", "select"],
      ["madre_nombre", "Nombre de la madre", "MARIA EMANUEL PECH", "texto"],
      ["madre_ocupacion", "Ocupacion de la madre", "Comerciante", "texto"],
      ["madre_estado_civil", "Estado civil de la madre", "Soltera", "select"],
      ["num_hijos", "Numero de hijos en la familia", "3", "entero"],
      ["hombres", "Hombres", "1", "entero"],
      ["mujeres", "Mujeres", "2", "entero"],
      ["ingreso_familiar", "Ingreso familiar aproximado", "4500", "moneda"],
    ],
  },
  {
    id: "salud",
    label: "Salud y condiciones",
    descripcion: "Alergias, enfermedad cronica, discapacidad e informacion relevante.",
    campos: [
      ["tiene_alergia", "Tiene alergia", "No", "condicional"],
      ["alergia_cual", "Alergia: cual", "", "texto"],
      ["alergia_medicamento", "Alergia: medicamento", "", "texto"],
      ["enfermedad_cronica", "Tiene enfermedad cronica", "No", "condicional"],
      ["enfermedad_tipo", "Tipo de enfermedad", "", "checklist"],
      ["enfermedad_medicamento", "Enfermedad: medicamento", "", "texto"],
      ["discapacidad", "Tiene discapacidad", "No", "condicional"],
      ["discapacidad_tipo", "Tipo de discapacidad", "", "checklist"],
      ["discapacidad_medicamento", "Discapacidad: medicamento", "", "texto"],
      ["informacion_relevante", "Informacion relevante", "Sin observaciones", "textarea"],
    ],
  },
  {
    id: "control",
    label: "Control y validacion",
    descripcion: "Aplicador, fecha, estado de ficha y firma o consentimiento.",
    campos: [
      ["aplicador", "Nombre del aplicador", "Responsable de Servicios Escolares", "texto"],
      ["fecha_aplicacion", "Fecha de aplicacion", "2026-05-22", "fecha"],
      ["estado_ficha", "Estado de ficha", "Borrador", "select"],
      ["consentimiento", "Consentimiento de uso institucional", "Pendiente", "select"],
      ["origen", "Origen de datos", "Captura SIGA", "select"],
    ],
  },
];

const REGLAS_CALIDAD = [
  ["Telefono", "10 digitos numericos; sin NO, N/A o textos mezclados.", "alta"],
  ["Matricula", "Formato institucional y sin duplicados.", "alta"],
  ["Fechas", "Nacimiento menor a ingreso; ingreso dentro del periodo activo.", "media"],
  ["Ingresos", "Numeros positivos y rangos razonables para evitar montos capturados como texto.", "alta"],
  ["Condicionales", "Si responde Si, el detalle se vuelve obligatorio.", "alta"],
  ["Domicilios", "CP de 5 digitos y procedencia/residencia separados.", "media"],
  ["Promedio", "Valor numerico entre 0 y 10.", "alta"],
  ["Completitud", "Ficha completa antes de usarla en reportes oficiales.", "media"],
];

function FieldPreview({ campo }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const [id, label, value, tipo] = campo;
  const border = isDay ? "border-slate-200 bg-white" : "border-slate-700/70 bg-slate-950/30";
  const text = isDay ? "text-slate-950" : "text-white";
  const muted = isDay ? "text-slate-500" : "text-slate-400";
  const control = tipo === "textarea" ? (
    <textarea value={value} readOnly rows={3} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${border} ${text}`} />
  ) : (
    <input value={value} readOnly className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${border} ${text}`} />
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={`text-xs uppercase tracking-wide ${muted}`}>{label}</label>
        <span className={`text-[10px] rounded-full border px-2 py-0.5 ${isDay ? "border-slate-200 text-slate-500" : "border-slate-700 text-slate-500"}`}>
          {tipo}
        </span>
      </div>
      {control}
    </div>
  );
}

function Metric({ label, value, tone }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const tones = {
    green: isDay ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-emerald-950/25 border-emerald-500/30 text-emerald-300",
    amber: isDay ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-amber-950/25 border-amber-500/30 text-amber-300",
    blue: isDay ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-blue-950/25 border-blue-500/30 text-blue-300",
  };
  return (
    <div className={`card-lift rounded-xl border p-4 ${tones[tone] || tones.blue}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5">{label}</p>
    </div>
  );
}

export default function EstudioSocioeconomico() {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const [seccionActiva, setSeccionActiva] = useState(SECCIONES[0].id);

  const seccion = useMemo(
    () => SECCIONES.find(s => s.id === seccionActiva) || SECCIONES[0],
    [seccionActiva]
  );

  const totalCampos = SECCIONES.reduce((acc, s) => acc + s.campos.length, 0);
  const camposCondicionales = SECCIONES.reduce((acc, s) => acc + s.campos.filter(c => c[3] === "condicional").length, 0);

  const pageBg = isDay ? "bg-slate-50 text-slate-950" : "bg-slate-950 text-white";
  const panel = isDay ? "bg-white border-slate-200" : "bg-slate-900/80 border-slate-800";
  const muted = isDay ? "text-slate-600" : "text-slate-400";
  const soft = isDay ? "bg-slate-100 border-slate-200" : "bg-slate-800/50 border-slate-700/70";

  return (
    <AdminLayout>
      <div className={`min-h-screen p-6 ${pageBg}`}>
        <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <p className={`text-xs uppercase tracking-[0.2em] ${muted}`}>Diseno funcional</p>
              <h1 className="text-3xl font-bold mt-1">Estudio socioeconomico</h1>
              <p className={`text-sm mt-2 max-w-3xl ${muted}`}>
                Prototipo del formulario F-SE-05 para captura directa en SIGA. El Excel queda como apoyo de migracion, pero la ficha validada nace aqui.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  isDay
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    : "border-slate-600/70 text-slate-300 hover:bg-white/5"
                }`}
              >
                Importar Excel
              </button>
              <button type="button" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
                Nueva ficha
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Metric label="Campos contemplados" value={totalCampos} tone="blue" />
            <Metric label="Secciones del formato" value={SECCIONES.length} tone="green" />
            <Metric label="Reglas condicionales" value={camposCondicionales} tone="amber" />
            <Metric label="Acceso estudiante" value="Portal alumno" tone="blue" />
          </div>

          <section className={`card-lift rounded-2xl border p-5 ${panel}`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Flujo de activacion para alumnos</h2>
                <p className={`text-sm mt-1 ${muted}`}>
                  Servicios Escolares activa la ficha en el perfil del estudiante. El alumno entra a SIGA y solo ve el formulario socioeconomico activo.
                </p>
              </div>
              <div className={`rounded-xl border px-4 py-3 text-sm ${soft}`}>
                Ruta interna: <span className="font-semibold">/alumno/estudio-socioeconomico</span>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
              {[
                ["1", "Activar", "Servicios Escolares habilita el estudio por periodo."],
                ["2", "Capturar", "El alumno llena y guarda borrador por secciones."],
                ["3", "Validar", "Servicios Escolares revisa calidad y solicita correccion si aplica."],
                ["4", "Analizar", "Tutoria usa fichas validadas para semaforos y reportes."],
              ].map(([num, title, detail]) => (
                <div key={num} className={`card-lift rounded-xl border p-4 ${soft}`}>
                  <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold">{num}</span>
                  <p className="font-semibold mt-3">{title}</p>
                  <p className={`text-xs mt-1 ${muted}`}>{detail}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_360px] 2xl:grid-cols-[320px_minmax(0,1fr)_380px] gap-6">
            <aside className={`card-lift rounded-2xl border p-3 h-fit ${panel}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide px-2 mb-2 ${muted}`}>Secciones</p>
              <div className="space-y-1">
                {SECCIONES.map((s, index) => {
                  const active = s.id === seccionActiva;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSeccionActiva(s.id)}
                      className={`w-full rounded-xl px-3 py-3 text-left transition-colors border ${
                        active
                          ? "bg-blue-600 text-white border-blue-500"
                          : isDay
                            ? "bg-white text-slate-700 border-transparent hover:bg-slate-100"
                            : "bg-transparent text-slate-300 border-transparent hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${active ? "bg-white/20" : soft}`}>
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium">{s.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className={`card-lift rounded-2xl border ${panel}`}>
              <div className="p-6 border-b border-slate-700/50">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{seccion.label}</h2>
                    <p className={`text-sm mt-1 ${muted}`}>{seccion.descripcion}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${soft}`}>
                    {seccion.campos.length} campos
                  </span>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                {seccion.campos.map(campo => <FieldPreview key={campo[0]} campo={campo} />)}
              </div>
              <div className={`mx-6 mb-6 rounded-xl border p-4 ${soft}`}>
                <p className="text-sm font-semibold">Comportamiento esperado</p>
                <p className={`text-sm mt-1 ${muted}`}>
                  Cada campo se guardara con tipo de dato definido. Las respuestas condicionales activan campos obligatorios y las advertencias de calidad aparecen antes de validar la ficha.
                </p>
              </div>
            </main>

            <aside className="space-y-4">
              <section className={`card-lift rounded-2xl border p-5 ${panel}`}>
                <h3 className="font-bold">Calidad de datos</h3>
                <p className={`text-sm mt-1 ${muted}`}>Validaciones que deben ejecutarse al capturar, importar y antes de reportar.</p>
                <div className="mt-4 space-y-3">
                  {REGLAS_CALIDAD.map(([titulo, detalle, prioridad]) => (
                    <div key={titulo} className={`card-lift rounded-xl border p-3 ${soft}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{titulo}</p>
                        <span className={`text-[10px] rounded-full px-2 py-0.5 border ${
                          prioridad === "alta"
                            ? "border-red-500/40 text-red-300 bg-red-950/20"
                            : "border-amber-500/40 text-amber-300 bg-amber-950/20"
                        }`}>
                          {prioridad}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${muted}`}>{detalle}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className={`card-lift rounded-2xl border p-5 ${panel}`}>
                <h3 className="font-bold">Flujo propuesto</h3>
                <div className={`mt-4 space-y-3 text-sm ${muted}`}>
                  <p><span className="font-semibold text-blue-400">1.</span> Captura o prellenado desde Excel.</p>
                  <p><span className="font-semibold text-blue-400">2.</span> Revision automatica de calidad.</p>
                  <p><span className="font-semibold text-blue-400">3.</span> Correccion por Servicios Escolares o Tutoria.</p>
                  <p><span className="font-semibold text-blue-400">4.</span> Validacion institucional.</p>
                  <p><span className="font-semibold text-blue-400">5.</span> Uso en dashboard, reportes y semaforo.</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
