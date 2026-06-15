import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../hooks/useApi";
import { formatApiError } from "../../components/AutocompleteInput";

const SECCIONES = [
  {
    id: "personales",
    titulo: "Datos personales",
    campos: [
      { name: "nombre", label: "Nombre completo", required: true },
      { name: "matricula", label: "Matricula", required: true, pattern: "matricula" },
      { name: "fecha_ingreso", label: "Fecha de ingreso", type: "date", required: true },
      { name: "carrera", label: "Carrera", required: true },
      { name: "sexo", label: "Sexo", type: "select", options: ["", "Femenino", "Masculino", "Prefiero no decirlo"], required: true },
      { name: "estado_civil", label: "Estado civil", type: "select", options: ["", "Soltero", "Casado", "Union libre", "Otro"], required: true },
      { name: "lugar_nacimiento", label: "Lugar de nacimiento", required: true },
      { name: "fecha_nacimiento", label: "Fecha de nacimiento", type: "date", required: true },
      { name: "tiene_hijos", label: "Tiene hijos", type: "boolean", required: true },
      { name: "num_hijos", label: "Numero de hijos", type: "number", dependsOn: ["tiene_hijos", "SI"] },
      { name: "habla_lengua", label: "Habla lengua distinta al espanol", type: "boolean", required: true },
      { name: "lengua", label: "Cual lengua", dependsOn: ["habla_lengua", "SI"] },
    ],
  },
  {
    id: "domicilios",
    titulo: "Contacto y domicilios",
    campos: [
      { name: "telefono", label: "Telefono principal", required: true, pattern: "telefono" },
      { name: "procedencia_calle", label: "Procedencia: calle y numero", required: true },
      { name: "procedencia_colonia", label: "Procedencia: colonia", required: true },
      { name: "procedencia_localidad", label: "Procedencia: localidad", required: true },
      { name: "procedencia_municipio", label: "Procedencia: municipio", required: true },
      { name: "procedencia_estado", label: "Procedencia: estado", required: true },
      { name: "procedencia_cp", label: "Procedencia: codigo postal", required: true, pattern: "cp" },
      { name: "residencia_calle", label: "Residencia: calle y numero", required: true },
      { name: "residencia_colonia", label: "Residencia: colonia", required: true },
      { name: "residencia_localidad", label: "Residencia: localidad", required: true },
      { name: "residencia_municipio", label: "Residencia: municipio", required: true },
      { name: "residencia_estado", label: "Residencia: estado", required: true },
      { name: "residencia_cp", label: "Residencia: codigo postal", required: true, pattern: "cp" },
    ],
  },
  {
    id: "escolares",
    titulo: "Antecedentes escolares",
    campos: [
      { name: "bachillerato", label: "Bachillerato o escuela de procedencia", required: true },
      { name: "bachillerato_ubicacion", label: "Lugar de ubicaci?n", required: true },
      { name: "periodo_estudios", label: "Periodo de estudios", required: true },
      { name: "promedio", label: "Promedio general", type: "number", required: true, pattern: "promedio" },
      { name: "area_bachillerato", label: "?rea de bachillerato", type: "select", options: ["", "F?sico-Matem?tico", "Econ?mico-Administrativo", "Ciencias Sociales", "Qu?mico-Biol?gico", "Humanidades", "General", "Otro"], required: true },
    ],
  },
  {
    id: "economia",
    titulo: "Situaci?n econ?mica",
    campos: [
      { name: "depende_de", label: "Depende econ?micamente de", type: "select", options: ["", "Pap?", "Mam?", "Independiente", "Otros"], required: true },
      { name: "responsable_nombre", label: "Nombre de la persona responsable", required: true },
      { name: "responsable_parentesco", label: "Parentesco", required: true },
      { name: "responsable_ocupacion", label: "Ocupaci?n", required: true },
      { name: "responsable_estudios", label: "M?ximo nivel de estudios", required: true },
      { name: "responsable_telefono", label: "Tel?fono de la persona responsable", pattern: "telefono" },
      { name: "ingreso_mensual", label: "Ingreso mensual familiar aproximado", type: "number", required: true },
      { name: "gasto_mensual", label: "Gasto mensual familiar aproximado", type: "number", required: true },
      { name: "dependientes", label: "Personas que dependen del jefe de familia", type: "number", required: true },
      { name: "recibe_apoyo", label: "Recibe apoyo econ?mico o beca", type: "boolean", required: true },
      { name: "institucion_apoyo", label: "Instituci?n o programa de apoyo", dependsOn: ["recibe_apoyo", "SI"] },
    ],
  },
  {
    id: "salud",
    titulo: "Salud y condiciones relevantes",
    campos: [
      { name: "tiene_alergia", label: "Tiene alergia", type: "boolean", required: true },
      { name: "alergia_cual", label: "Cu?l alergia", dependsOn: ["tiene_alergia", "SI"] },
      { name: "alergia_medicamento", label: "Medicamento por alergia", dependsOn: ["tiene_alergia", "SI"] },
      { name: "enfermedad_cronica", label: "Tiene enfermedad cr?nica", type: "boolean", required: true },
      { name: "enfermedad_cual", label: "Cu?l enfermedad", dependsOn: ["enfermedad_cronica", "SI"] },
      { name: "enfermedad_medicamento", label: "Medicamento por enfermedad", dependsOn: ["enfermedad_cronica", "SI"] },
      { name: "tiene_discapacidad", label: "Tiene discapacidad", type: "boolean", required: true },
      { name: "discapacidad_tipo", label: "Tipo de discapacidad", dependsOn: ["tiene_discapacidad", "SI"] },
      { name: "discapacidad_medicamento", label: "Medicamento o apoyo requerido", dependsOn: ["tiene_discapacidad", "SI"] },
      { name: "informacion_relevante", label: "Informaci?n relevante", type: "textarea" },
    ],
  },
  {
    id: "confirmacion",
    titulo: "Confirmaci?n",
    campos: [
      { name: "confirmo_veracidad", label: "Confirmo que la informaci?n proporcionada es correcta", type: "checkbox", required: true },
      { name: "acepto_uso", label: "Acepto el uso institucional de la informaci?n para seguimiento acad?mico y tutorial", type: "checkbox", required: true },
    ],
  },
];

const initialForm = SECCIONES.flatMap(s => s.campos).reduce((acc, campo) => {
  acc[campo.name] = campo.type === "checkbox" ? false : "";
  return acc;
}, {});

function normalizar(v) {
  return String(v || "").trim();
}

function campoVisible(campo, form) {
  if (!campo.dependsOn) return true;
  const [name, value] = campo.dependsOn;
  return form[name] === value;
}

function validarCampo(campo, form) {
  if (!campoVisible(campo, form)) return null;
  const value = form[campo.name];
  if (campo.required && (campo.type === "checkbox" ? !value : !normalizar(value))) {
    return "Campo obligatorio";
  }
  if (!normalizar(value)) return null;
  if (campo.pattern === "telefono" && !/^\d{10}$/.test(normalizar(value))) {
    return "Debe tener 10 dígitos";
  }
  if (campo.pattern === "cp" && !/^\d{5}$/.test(normalizar(value))) {
    return "Debe tener 5 digitos";
  }
  if (campo.pattern === "promedio") {
    const n = Number(value);
    if (Number.isNaN(n) || n < 0 || n > 10) return "Debe estar entre 0 y 10";
  }
  return null;
}

function calcularCalidad(form) {
  const visibles = SECCIONES.flatMap(s => s.campos).filter(c => campoVisible(c, form));
  const obligatorios = visibles.filter(c => c.required || c.dependsOn);
  const completos = obligatorios.filter(c => !validarCampo(c, form)).length;
  const errores = visibles.map(c => [c, validarCampo(c, form)]).filter(([, error]) => error);
  return {
    total: obligatorios.length,
    completos,
    score: obligatorios.length ? Math.round((completos / obligatorios.length) * 100) : 0,
    errores,
  };
}

function InputCampo({ campo, form, setForm, error, carreras = [] }) {
  if (!campoVisible(campo, form)) return null;
  const common = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const set = value => setForm(prev => ({ ...prev, [campo.name]: value }));
  const opciones = campo.name === "carrera" && carreras.length
    ? ["", ...carreras.map(c => c.nombre)]
    : campo.options;

  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {campo.label}{campo.required || campo.dependsOn ? " *" : ""}
      </label>
      {opciones ? (
        <select value={form[campo.name]} onChange={e => set(e.target.value)} className={common}>
          {opciones.map(op => <option key={op} value={op}>{op || "Seleccionar"}</option>)}
        </select>
      ) : campo.type === "boolean" ? (
        <select value={form[campo.name]} onChange={e => set(e.target.value)} className={common}>
          <option value="">Seleccionar</option>
          <option value="NO">No</option>
          <option value="SI">Si</option>
        </select>
      ) : campo.type === "checkbox" ? (
        <label className="mt-2 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
          <input type="checkbox" checked={!!form[campo.name]} onChange={e => set(e.target.checked)} className="mt-1" />
          <span>{campo.label}</span>
        </label>
      ) : campo.type === "textarea" ? (
        <textarea value={form[campo.name]} onChange={e => set(e.target.value)} rows={4} className={common} />
      ) : (
        <input type={campo.type || "text"} value={form[campo.name]} onChange={e => set(e.target.value)} className={common} />
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Mapeo form ↔ backend ────────────────────────────────────────────────────
const BOOL_FIELDS = [
  "tiene_hijos","habla_lengua","recibe_apoyo",
  "tiene_alergia","enfermedad_cronica","tiene_discapacidad",
];

function formToApi(form) {
  const out = { ...form };
  // Renombrar nombre → nombre_completo
  if ("nombre" in out) { out.nombre_completo = out.nombre; delete out.nombre; }
  // Convertir "SI"/"NO" → bool
  BOOL_FIELDS.forEach(f => {
    if (f in out) out[f] = out[f] === "SI" ? true : out[f] === "NO" ? false : null;
  });
  // Convertir promedio, num_hijos, ingreso_mensual, etc. a número
  ["promedio","num_hijos","ingreso_mensual","gasto_mensual","dependientes"].forEach(f => {
    if (out[f] !== undefined) {
      out[f] = out[f] === "" ? null : Number(out[f]);
      if (Number.isNaN(out[f])) out[f] = null;
    }
  });
  return out;
}

function apiToForm(data) {
  const out = { ...initialForm };
  // Renombrar nombre_completo → nombre
  if (data.nombre_completo) out.nombre = data.nombre_completo;
  // Copiar el resto
  Object.keys(initialForm).forEach(k => {
    if (k !== "nombre" && data[k] !== undefined && data[k] !== null) out[k] = data[k];
  });
  // Convertir bool → "SI"/"NO"
  BOOL_FIELDS.forEach(f => {
    if (data[f] === true)  out[f] = "SI";
    if (data[f] === false) out[f] = "NO";
  });
  return out;
}

export default function AlumnoEstudioSocioeconomico() {
  const { usuario, logout } = useAuth();
  const [seccionId, setSeccionId] = useState(SECCIONES[0].id);
  const [form, setForm]           = useState(initialForm);
  // estados de la ficha
  const [fichaEstado, setFichaEstado]         = useState(null);   // null = cargando
  const [notaCorreccion, setNotaCorreccion]   = useState("");
  const [alumnoInfo, setAlumnoInfo]           = useState(null);
  const [sinFicha, setSinFicha]               = useState(false);
  const [carreras, setCarreras]               = useState([]);
  // UI
  const [guardando, setGuardando]   = useState(false);
  const [enviando, setEnviando]     = useState(false);
  const [apiError, setApiError]     = useState("");
  const [guardadoOk, setGuardadoOk] = useState(false);

  if (usuario.rol && usuario.rol !== "ALUMNO") {
    return <Navigate to="/" replace />;
  }

  // Cargar ficha al iniciar
  const cargarFicha = useCallback(async () => {
    try {
      const [{ data }, carrerasRes] = await Promise.all([
        api.get("/servicios-escolares/mi-ficha"),
        api.get("/servicios-escolares/carreras").catch(() => ({ data: [] })),
      ]);
      setCarreras(Array.isArray(carrerasRes.data) ? carrerasRes.data : []);
      if (data.estado === "SIN_FICHA") {
        setSinFicha(true);
        setAlumnoInfo(data.alumno);
        setFichaEstado("SIN_FICHA");
        return;
      }
      setFichaEstado(data.estado);
      setNotaCorreccion(data.nota_correccion || "");
      setAlumnoInfo(data.alumno);
      const next = apiToForm(data);
      if (!next.carrera && data.alumno.carrera) next.carrera = data.alumno.carrera;
      setForm(next);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map(d => d.msg || String(d)).join(' · ')
          : "Error al cargar tu ficha. Contacta a Servicios Escolares.";
      setApiError(msg);
      setFichaEstado("ERROR");
    }
  }, []);

  useEffect(() => { cargarFicha(); }, [cargarFicha]);

  const seccion      = SECCIONES.find(s => s.id === seccionId) || SECCIONES[0];
  const calidad      = useMemo(() => calcularCalidad(form), [form]);
  const seccionIndex = SECCIONES.findIndex(s => s.id === seccion.id);
  const erroresSeccion = seccion.campos
    .map(c => [c.name, validarCampo(c, form)])
    .filter(([, error]) => error);

  const guardar = async () => {
    setGuardando(true); setApiError(""); setGuardadoOk(false);
    try {
      const { data } = await api.put("/servicios-escolares/mi-ficha",
        { ...formToApi(form), enviar: false });
      setFichaEstado(data.estado);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e) {
      setApiError(formatApiError(e, "Error al guardar. Intenta de nuevo."));
    } finally { setGuardando(false); }
  };

  const siguiente = async () => {
    await guardar();
    if (seccionIndex < SECCIONES.length - 1) setSeccionId(SECCIONES[seccionIndex + 1].id);
  };

  const enviar = async () => {
    if (calidad.errores.length > 0) return;
    setEnviando(true); setApiError("");
    try {
      const { data } = await api.put("/servicios-escolares/mi-ficha",
        { ...formToApi(form), enviar: true });
      setFichaEstado(data.estado);
    } catch (e) {
      setApiError(formatApiError(e, "Error al enviar. Intenta de nuevo."));
    } finally { setEnviando(false); }
  };

  // ── Pantalla de carga ──────────────────────────────────────────────────────
  if (fichaEstado === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500 animate-pulse">Cargando tu ficha…</p>
      </div>
    );
  }

  // ── Sin ficha activa ───────────────────────────────────────────────────────
  if (fichaEstado === "SIN_FICHA" || fichaEstado === "ERROR") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-md w-full">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-500">SIGA</div>
          <h2 className="text-xl font-bold mb-2">
            {fichaEstado === "ERROR" ? "Error al cargar" : "Sin ficha activa"}
          </h2>
          <p className="text-sm text-slate-600 mb-6">
            {fichaEstado === "ERROR"
              ? apiError
              : "Servicios Escolares aún no ha activado tu estudio socioeconómico. Acércate a la ventanilla para solicitarlo."}
          </p>
          <button onClick={logout} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // ── Ficha ya enviada / validada ────────────────────────────────────────────
  const estadosNoEditables = ["ENVIADA", "VALIDADA", "RECHAZADA"];
  const soloLectura = estadosNoEditables.includes(fichaEstado);

  const ESTADO_INFO = {
    ENVIADA:   { color: "bg-amber-100 text-amber-800 border-amber-200",  icono: "⏳", msg: "Tu ficha fue enviada y está pendiente de revisión por Servicios Escolares." },
    VALIDADA:  { color: "bg-emerald-100 text-emerald-800 border-emerald-200", icono: "✅", msg: "¡Tu ficha fue validada por Servicios Escolares!" },
    RECHAZADA: { color: "bg-red-100 text-red-800 border-red-200",        icono: "❌", msg: "Tu ficha fue rechazada. Contacta a Servicios Escolares." },
    REQUIERE_CORRECCION: { color: "bg-orange-100 text-orange-800 border-orange-200", icono: "✏️", msg: "Servicios Escolares solicitó correcciones." },
  };
  const estadoInfo = ESTADO_INFO[fichaEstado];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">SIGA UTECAN</p>
            <h1 className="text-xl font-bold">Estudio socioeconómico</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{alumnoInfo.nombre || usuario.nombre || "Alumno"}</span>
            {alumnoInfo.matricula && (
              <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded-lg text-slate-500">{alumnoInfo.matricula}</span>
            )}
            <button type="button" onClick={logout} className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50">
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Banner de estado */}
      {estadoInfo && (
        <div className={`border-b px-4 py-3 ${estadoInfo.color}`}>
          <div className="mx-auto max-w-6xl flex items-start gap-3">
            <span className="text-lg shrink-0">{estadoInfo.icono}</span>
            <div>
              <p className="font-semibold text-sm">{estadoInfo.msg}</p>
              {fichaEstado === "REQUIERE_CORRECCION" && notaCorreccion && (
                <p className="text-xs mt-1 opacity-80">Nota: {notaCorreccion}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error API */}
      {apiError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          <div className="mx-auto max-w-6xl">{apiError}</div>
        </div>
      )}

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[260px_1fr_280px]">
        {/* Sidebar de secciones */}
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Secciones</p>
          <div className="space-y-1">
            {SECCIONES.map((s, i) => {
              const active = s.id === seccion.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { if (!soloLectura) guardar(); setSeccionId(s.id); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${active ? "bg-white/20" : "bg-slate-100"}`}>
                    {i + 1}
                  </span>
                  <span className="font-medium">{s.titulo}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Formulario */}
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-6">
            <p className="text-sm text-slate-500">
              {soloLectura ? "Vista de solo lectura" : "Ficha activada por Servicios Escolares"}
            </p>
            <h2 className="mt-1 text-2xl font-bold">{seccion.titulo}</h2>
            <div className="mt-4 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${((seccionIndex + 1) / SECCIONES.length) * 100}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            {seccion.campos.map(campo => (
              <InputCampo
                key={campo.name}
                campo={campo}
                form={form}
                setForm={soloLectura ? () => {} : setForm}
                error={soloLectura ? "" : validarCampo(campo, form)}
                carreras={carreras}
              />
            ))}
          </div>

          {!soloLectura && (
            <div className="flex flex-col gap-3 border-t border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {guardadoOk ?
                  <span className="text-emerald-600 font-medium">✓ Guardado</span>
                  : erroresSeccion.length ?
                    `${erroresSeccion.length} campo(s) por corregir en esta sección.`
                    : "Sección sin errores."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={guardar}
                  disabled={guardando}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {guardando ? "Guardando…" : "Guardar borrador"}
                </button>
                {seccionIndex < SECCIONES.length - 1 ? (
                  <button
                    type="button"
                    onClick={siguiente}
                    disabled={guardando}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={enviar}
                    disabled={calidad.errores.length > 0 || enviando}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {enviando ? "Enviando..." : "Enviar estudio"}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Panel lateral */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold">Calidad de captura</h3>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-4xl font-black text-blue-600">{calidad.score}%</span>
              <span className="pb-1 text-sm text-slate-500">{calidad.completos}/{calidad.total} requeridos</span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${calidad.score}%` }} />
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold">Antes de enviar</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>Revisa teléfonos, ingresos y fechas.</p>
              <p>Los campos marcados con * son obligatorios.</p>
              <p>Si respondes Sí, el detalle correspondiente se vuelve necesario.</p>
            </div>
          </section>
          {alumnoInfo && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-sm mb-2">Tu ficha</h3>
              <p className="text-xs text-slate-500 font-mono">{alumnoInfo.carrera}</p>
              <p className="text-xs text-slate-400 mt-1">{alumnoInfo.periodo}</p>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
