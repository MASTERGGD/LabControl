import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import api from "../../hooks/useApi";
import { useToast } from "../../context/ToastContext";

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDT = (iso) =>
  iso ? new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso, days) => {
  if (!iso || !days) return "";
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + Number(days) - 1);
  return d.toISOString().slice(0, 10);
};

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const SEXO_LABEL = { M: "Masculino", F: "Femenino", OTRO: "Otro" };
const ORIGEN_LABEL = { ESPONTANEA: "Espontánea", CANALIZADA_TUTORIA: "Tutoría", CANALIZADA_INTERNA: "Interna" };
const DESTINO_OPTS = ["PSICOLOGIA","TUTORIA","NUTRICION","HOSPITAL","OTRO"];

// ─── sub-componentes de tarjeta ───────────────────────────────────────────────
function Chip({ color = "slate", text }) {
  const cls = {
    emerald: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40",
    red:     "bg-red-900/40 text-red-300 border border-red-700/40",
    yellow:  "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
    blue:    "bg-blue-900/40 text-blue-300 border border-blue-700/40",
    slate:   "bg-slate-700/40 text-slate-300 border border-slate-600/40",
    cyan:    "bg-cyan-900/40 text-cyan-300 border border-cyan-700/40",
  }[color] || "bg-slate-700/40 text-slate-300";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{text}</span>;
}

function Campo({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm text-slate-200">{value || "—"}</p>
    </div>
  );
}

// ─── Modal: Nueva / Ver Consulta ──────────────────────────────────────────────
// canalizacionTutoria: objeto con {canalizacion_id, alumno_nombre, motivo, tutor_nombre}
// si se pasa, la consulta se registra como atención a ese referido de tutoría
function ModalConsulta({ paciente, consulta, canalizacionTutoria, onClose, onGuardado }) {
  const { toast: showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    temperatura: consulta?.temperatura || "",
    presion_arterial: consulta?.presion_arterial || "",
    peso: consulta?.peso || "",
    talla: consulta?.talla || "",
    frecuencia_cardiaca: consulta?.frecuencia_cardiaca || "",
    saturacion_oxigeno: consulta?.saturacion_oxigeno || "",
    motivo_consulta: consulta?.motivo_consulta || (canalizacionTutoria ? canalizacionTutoria.motivo : ""),
    diagnostico: consulta?.diagnostico || "",
    medicamentos: consulta?.medicamentos || "",
    indicaciones: consulta?.indicaciones || "",
    genera_incapacidad: consulta?.genera_incapacidad || false,
    dias_incapacidad: consulta?.dias_incapacidad || "",
    fecha_inicio_incapacidad: consulta?.fecha_inicio_incapacidad || "",
    requiere_seguimiento: consulta?.requiere_seguimiento || false,
    fecha_seguimiento: consulta?.fecha_seguimiento || "",
    seguimiento_notas: consulta?.seguimiento_notas || "",
  });
  const [cans, setCans] = useState([]);
  const [exportando, setExportando] = useState(false);
  const soloLectura = !!consulta;
  const finIncapacidad = form.genera_incapacidad
    ? (consulta?.fecha_fin_incapacidad || addDaysISO(form.fecha_inicio_incapacidad, form.dias_incapacidad))
    : "";

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (soloLectura) return;
    if (!form.motivo_consulta.trim() || !form.diagnostico.trim()) {
      showToast("Motivo y diagnóstico son obligatorios", "error");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        paciente_id: paciente.id,
        ...form,
        temperatura: form.temperatura ? parseFloat(form.temperatura) : null,
        peso: form.peso ? parseFloat(form.peso) : null,
        talla: form.talla ? parseFloat(form.talla) : null,
        frecuencia_cardiaca: form.frecuencia_cardiaca ? parseInt(form.frecuencia_cardiaca) : null,
        saturacion_oxigeno: form.saturacion_oxigeno ? parseFloat(form.saturacion_oxigeno) : null,
        dias_incapacidad: form.dias_incapacidad ? parseInt(form.dias_incapacidad) : null,
        fecha_inicio_incapacidad: form.genera_incapacidad ? (form.fecha_inicio_incapacidad || todayISO()) : null,
        fecha_seguimiento: form.fecha_seguimiento || null,
        canalizaciones: cans.filter(c => c.destino),
        origen: canalizacionTutoria ? "CANALIZADA_TUTORIA" : "ESPONTANEA",
      };
      if (consulta) {
        await api.put(`/consultorio/consultas/${consulta.id}`, payload);
      } else if (canalizacionTutoria) {
        // Endpoint especial que también cierra la canalización de tutoría
        await api.post(`/consultorio/canalizaciones-tutoria/${canalizacionTutoria.canalizacion_id}/atender`, payload);
      } else {
        await api.post("/consultorio/consultas", payload);
      }
      showToast(consulta ? "Consulta actualizada" : "Consulta registrada", "success");
      onGuardado();
    } catch (err) {
      showToast(err.response?.data?.detail || "Error al guardar", "error");
    } finally {
      setLoading(false);
    }
  };

  const exportarPDF = async () => {
    if (!consulta) return;
    setExportando(true);
    try {
      const resp = await api.get(`/consultorio/consultas/${consulta.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Consulta_${paciente.nombre.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { showToast("Error al generar la impresión", "error"); }
    finally { setExportando(false); }
  };

  const addCan = () => setCans(c => [...c, { destino: "", motivo: "" }]);
  const setCan = (i, k, v) => setCans(c => c.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const delCan = (i) => setCans(c => c.filter((_, j) => j !== i));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="glass w-full max-w-3xl shadow-glass animate-fadeUp my-4">
        {/* header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">
              {consulta ? "✏️ Editar Consulta" : "🩺 Nueva Consulta"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{paciente.nombre}</p>
          </div>
          <div className="flex gap-2">
            {consulta && (
              <button onClick={exportarPDF} disabled={exportando}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs text-white font-medium">
                {exportando ? "Generando..." : "Imprimir consulta"}
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Banner cuando viene de tutoría */}
          {canalizacionTutoria && (
            <div className="bg-rose-900/20 border border-rose-700/30 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-lg">🏥</span>
              <div>
                <p className="text-sm text-rose-200 font-medium">Referido desde Tutoría</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tutor: {canalizacionTutoria.tutor_nombre} · Motivo: {canalizacionTutoria.motivo}
                </p>
              </div>
            </div>
          )}

          {/* Signos vitales */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Signos Vitales</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { key: "temperatura", label: "Temperatura (°C)", placeholder: "36.6" },
                { key: "presion_arterial", label: "Presión Arterial", placeholder: "120/80" },
                { key: "peso", label: "Peso (kg)", placeholder: "65.0" },
                { key: "talla", label: "Talla (cm)", placeholder: "170" },
                { key: "frecuencia_cardiaca", label: "Frec. Cardíaca (lpm)", placeholder: "72" },
                { key: "saturacion_oxigeno", label: "Saturación O₂ (%)", placeholder: "98" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <input type="text" value={form[key]} onChange={e => set(key, e.target.value)}
                    placeholder={placeholder} className="input-dark w-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Motivo y diagnóstico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Motivo de consulta *</label>
              <textarea value={form.motivo_consulta} onChange={e => set("motivo_consulta", e.target.value)}
                rows={3} required className="input-dark w-full resize-none" placeholder="Describe el motivo..." />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Diagnóstico *</label>
              <textarea value={form.diagnostico} onChange={e => set("diagnostico", e.target.value)}
                rows={3} required className="input-dark w-full resize-none" placeholder="Diagnóstico médico..." />
            </div>
          </div>

          {/* Receta */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Medicamentos (uno por línea)</label>
            <textarea value={form.medicamentos} onChange={e => set("medicamentos", e.target.value)}
              rows={3} className="input-dark w-full resize-none font-mono text-sm"
              placeholder={"Paracetamol 500mg c/8h por 3 días\nIbuprofeno 400mg c/12h por 5 días"} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Indicaciones y cuidados</label>
            <textarea value={form.indicaciones} onChange={e => set("indicaciones", e.target.value)}
              rows={2} className="input-dark w-full resize-none"
              placeholder="Reposo, hidratación, dieta blanda..." />
          </div>

          {/* Incapacidad */}
          <div className="bg-slate-800/40 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.genera_incapacidad}
                disabled={soloLectura}
                onChange={e => setForm(f => ({
                  ...f,
                  genera_incapacidad: e.target.checked,
                  fecha_inicio_incapacidad: e.target.checked && !f.fecha_inicio_incapacidad ? todayISO() : f.fecha_inicio_incapacidad,
                }))}
                className="rounded border-slate-600" />
              <span className="text-sm text-slate-300">Genera incapacidad</span>
            </label>
            {form.genera_incapacidad && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Días de incapacidad</label>
                  <input type="number" min="1" value={form.dias_incapacidad}
                    disabled={soloLectura}
                    onChange={e => set("dias_incapacidad", e.target.value)}
                    className="input-dark w-full" placeholder="3" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha de inicio</label>
                  <input type="date" value={form.fecha_inicio_incapacidad}
                    disabled={soloLectura}
                    onChange={e => set("fecha_inicio_incapacidad", e.target.value)}
                    className="input-dark w-full" />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-400">
                    Periodo calculado: {form.fecha_inicio_incapacidad || "inicio pendiente"} al {finIncapacidad || "fin pendiente"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Seguimiento */}
          <div className="bg-slate-800/40 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requiere_seguimiento}
                onChange={e => set("requiere_seguimiento", e.target.checked)}
                className="rounded border-slate-600" />
              <span className="text-sm text-slate-300">Requiere seguimiento</span>
            </label>
            {form.requiere_seguimiento && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha de cita</label>
                  <input type="date" value={form.fecha_seguimiento}
                    onChange={e => set("fecha_seguimiento", e.target.value)}
                    className="input-dark w-full" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Notas de seguimiento</label>
                  <input type="text" value={form.seguimiento_notas}
                    onChange={e => set("seguimiento_notas", e.target.value)}
                    className="input-dark w-full" placeholder="Indicaciones..." />
                </div>
              </div>
            )}
          </div>

          {/* Canalizaciones de salida */}
          {!consulta && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Canalizaciones (opcional)
                </p>
                <button type="button" onClick={addCan}
                  className="text-xs px-2 py-1 rounded-lg bg-blue-700/30 hover:bg-blue-700/50 text-blue-300">
                  + Agregar
                </button>
              </div>
              {cans.map((can, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select value={can.destino} onChange={e => setCan(i, "destino", e.target.value)}
                    className="input-dark flex-1">
                    <option value="">-- Destino --</option>
                    {DESTINO_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input type="text" value={can.motivo} onChange={e => setCan(i, "motivo", e.target.value)}
                    className="input-dark flex-[2]" placeholder="Motivo de canalización..." />
                  <button type="button" onClick={() => delCan(i)}
                    className="text-red-400 hover:text-red-300 px-2">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            {!soloLectura && (
              <button type="submit" disabled={loading} className="btn-blue flex-1">
                {loading ? "Guardando..." : "Registrar Consulta"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Buscar / Crear Paciente ───────────────────────────────────────────
function ModalPaciente({ onSelect, onClose }) {
  const { toast: showToast } = useToast();
  const [tab, setTab] = useState("buscar");
  // Búsquedas independientes por tab
  const [qPaciente, setQPaciente] = useState("");
  const [qAlumno, setQAlumno]     = useState("");
  const [qPersonal, setQPersonal] = useState("");
  const [resultados, setResultados]   = useState([]);
  const [alumnosBS, setAlumnosBS]     = useState([]);
  const [personalBS, setPersonalBS]   = useState([]);
  const [buscando, setBuscando]       = useState(false);
  // Paso 2: confirmar datos del personal seleccionado del sistema
  const [personalSel, setPersonalSel] = useState(null);
  const [sexoPersonal, setSexoPersonal]   = useState("");
  const [fnPersonal, setFnPersonal]       = useState("");
  // Formulario manual (persona externa)
  const [formExt, setFormExt] = useState({ nombre: "", departamento: "", matricula_o_emp: "", sexo: "", fecha_nacimiento: "" });

  // ── Buscar en pacientes ya registrados ────────────────────────────────────
  const buscarPaciente = async () => {
    if (qPaciente.length < 2) return;
    setBuscando(true);
    try {
      const { data } = await api.get("/consultorio/pacientes/buscar", { params: { q: qPaciente } });
      setResultados(data);
    } catch { showToast("Error al buscar", "error"); }
    finally { setBuscando(false); }
  };

  useEffect(() => {
    if (tab !== "buscar") return;
    if (qPaciente.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => buscarPaciente(), 350);
    return () => clearTimeout(t);
  }, [qPaciente, tab]);

  // ── Buscar alumno en catálogo ─────────────────────────────────────────────
  const buscarAlumno = async () => {
    if (qAlumno.length < 2) return;
    setBuscando(true);
    try {
      const { data } = await api.get("/consultorio/pacientes/buscar-alumno", { params: { q: qAlumno } });
      setAlumnosBS(data);
    } catch { showToast("Error al buscar", "error"); }
    finally { setBuscando(false); }
  };

  // ── Buscar personal (docentes / administrativos) en usuarios del sistema ──
  const buscarPersonal = async () => {
    if (qPersonal.length < 2) return;
    setBuscando(true);
    try {
      const { data } = await api.get("/consultorio/pacientes/buscar-personal", { params: { q: qPersonal } });
      setPersonalBS(data);
    } catch { showToast("Error al buscar", "error"); }
    finally { setBuscando(false); }
  };

  // ── Registrar alumno como paciente ────────────────────────────────────────
  const registrarAlumno = async (alumno) => {
    try {
      const { data } = await api.post("/consultorio/pacientes", {
        tipo: "ALUMNO",
        alumno_id: alumno.id,
        nombre: alumno.nombre,
        matricula_o_emp: alumno.matricula,
        carrera: alumno.carrera,
        cuatrimestre: alumno.cuatrimestre,
        sexo: null,
        fecha_nacimiento: null,
      });
      onSelect(data);
    } catch { showToast("Error al registrar paciente", "error"); }
  };

  // ── Confirmar personal del sistema y registrar como paciente ─────────────
  const confirmarPersonal = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/consultorio/pacientes", {
        tipo: "ADMINISTRATIVO",
        nombre: personalSel.nombre,
        matricula_o_emp: personalSel.numero_empleado || "",
        departamento: personalSel.departamento || "",
        sexo: sexoPersonal || null,
        fecha_nacimiento: fnPersonal || null,
      });
      onSelect(data);
    } catch { showToast("Error al registrar", "error"); }
  };

  // ── Registrar persona externa (no en sistema) ─────────────────────────────
  const registrarExterno = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/consultorio/pacientes", { tipo: "ADMINISTRATIVO", ...formExt });
      onSelect(data);
    } catch { showToast("Error al registrar", "error"); }
  };

  const ROL_LABEL = { DOCENTE: "Docente", ADMINISTRATIVO: "Administrativo", MEDICO: "Médico",
    SUPER_ADMIN: "Admin", LAB_ADMIN: "Admin Lab", TUTORIA_ADMIN: "Tutoría" };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass w-full max-w-xl shadow-glass animate-fadeUp">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-white">👤 Seleccionar Paciente</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1 text-xs">
            {[["buscar","🔍 Ya atendido"],["alumno","🎓 Alumno"],["personal","🏢 Personal"]].map(([k,l]) => (
              <button key={k} onClick={() => { setTab(k); setPersonalSel(null); }}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${tab === k ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Tab: Buscar paciente ya registrado */}
          {tab === "buscar" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Pacientes que ya han sido atendidos antes</p>
              <div className="flex gap-2">
                <input type="text" value={qPaciente} onChange={e => setQPaciente(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && buscarPaciente()}
                  className="input-dark flex-1" placeholder="Nombre o matrícula/empleado..." />
                <button onClick={buscarPaciente} className="btn-blue px-4 text-sm">Buscar</button>
              </div>
              {buscando && <p className="text-slate-400 text-sm text-center animate-pulse">Buscando…</p>}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {resultados.map(p => (
                  <button key={p.id} onClick={() => onSelect(p)}
                    className="w-full text-left p-3 rounded-xl bg-slate-700/40 hover:bg-slate-700/70 transition-colors">
                    <p className="text-sm text-white font-medium">{p.nombre}</p>
                    <p className="text-xs text-slate-400">
                      {p.tipo} · {SEXO_LABEL[p.sexo] || "Sexo n/d"} · {p.carrera || p.departamento || "—"}
                      {p.matricula_o_emp ? ` · ${p.matricula_o_emp}` : ""}
                    </p>
                  </button>
                ))}
                {resultados.length === 0 && qPaciente.length >= 2 && !buscando && (
                  <p className="text-slate-500 text-sm text-center py-2">
                    Sin coincidencias en pacientes atendidos. Si es alumno o personal, usa su pestaña para vincularlo.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab: Alumno del catálogo */}
          {tab === "alumno" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Busca por nombre, apellido o matrícula</p>
              <div className="flex gap-2">
                <input type="text" value={qAlumno} onChange={e => setQAlumno(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && buscarAlumno()}
                  className="input-dark flex-1" placeholder="Ej: García, VERO, 23010001..." />
                <button onClick={buscarAlumno} className="btn-blue px-4 text-sm">Buscar</button>
              </div>
              {buscando && <p className="text-slate-400 text-sm text-center animate-pulse">Buscando…</p>}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alumnosBS.map(a => (
                  <button key={a.id} onClick={() => registrarAlumno(a)}
                    className="w-full text-left p-3 rounded-xl bg-slate-700/40 hover:bg-slate-700/70 transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-white font-medium">{a.nombre}</p>
                        <p className="text-xs text-slate-400">
                          {a.matricula} · {a.carrera || "Sin carrera"} · {a.grupo} · {a.periodo}
                        </p>
                      </div>
                      <span className="text-xs text-blue-400 ml-2 flex-shrink-0">Seleccionar →</span>
                    </div>
                  </button>
                ))}
                {alumnosBS.length === 0 && qAlumno.length >= 2 && !buscando && (
                  <p className="text-slate-500 text-sm text-center py-2">Sin resultados</p>
                )}
              </div>
            </div>
          )}

          {/* Tab: Personal del sistema (docentes / administrativos) */}
          {tab === "personal" && !personalSel && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Busca docentes y administrativos registrados en el sistema</p>
              <div className="flex gap-2">
                <input type="text" value={qPersonal} onChange={e => setQPersonal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && buscarPersonal()}
                  className="input-dark flex-1" placeholder="Nombre o número de empleado..." />
                <button onClick={buscarPersonal} className="btn-blue px-4 text-sm">Buscar</button>
              </div>
              {buscando && <p className="text-slate-400 text-sm text-center animate-pulse">Buscando…</p>}
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {personalBS.map(u => (
                  <button key={u.usuario_id} onClick={() => setPersonalSel(u)}
                    className="w-full text-left p-3 rounded-xl bg-slate-700/40 hover:bg-slate-700/70 transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-white font-medium">{u.nombre}</p>
                        <p className="text-xs text-slate-400">
                          {ROL_LABEL[u.rol] || u.rol}
                          {u.departamento ? ` · ${u.departamento}` : ""}
                          {u.numero_empleado ? ` · Emp: ${u.numero_empleado}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-blue-400 ml-2 flex-shrink-0">Seleccionar →</span>
                    </div>
                  </button>
                ))}
                {personalBS.length === 0 && qPersonal.length >= 2 && !buscando && (
                  <p className="text-slate-500 text-sm text-center py-2">Sin resultados</p>
                )}
              </div>
              {/* Separador para persona externa */}
              <div className="border-t border-white/5 pt-3">
                <p className="text-xs text-slate-500 mb-2">¿No aparece en el sistema? Regístralo manualmente:</p>
                <form onSubmit={registrarExterno} className="space-y-2">
                  <input type="text" required value={formExt.nombre}
                    onChange={e => setFormExt(f => ({ ...f, nombre: e.target.value }))}
                    className="input-dark w-full" placeholder="Nombre completo *" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={formExt.matricula_o_emp}
                      onChange={e => setFormExt(f => ({ ...f, matricula_o_emp: e.target.value }))}
                      className="input-dark w-full" placeholder="N° Empleado" />
                    <input type="text" value={formExt.departamento}
                      onChange={e => setFormExt(f => ({ ...f, departamento: e.target.value }))}
                      className="input-dark w-full" placeholder="Departamento" />
                    <select value={formExt.sexo} onChange={e => setFormExt(f => ({ ...f, sexo: e.target.value }))}
                      className="input-dark w-full">
                      <option value="">Sexo</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                      <option value="OTRO">Otro</option>
                    </select>
                    <input type="date" value={formExt.fecha_nacimiento}
                      onChange={e => setFormExt(f => ({ ...f, fecha_nacimiento: e.target.value }))}
                      className="input-dark w-full" title="Fecha de nacimiento" />
                  </div>
                  <button type="submit" className="btn-blue w-full text-sm">Registrar persona externa</button>
                </form>
              </div>
            </div>
          )}

          {/* Paso 2: confirmar sexo/nacimiento del personal seleccionado */}
          {tab === "personal" && personalSel && (
            <form onSubmit={confirmarPersonal} className="space-y-4">
              <div className="bg-slate-800/60 rounded-xl p-3">
                <p className="text-sm text-white font-medium">{personalSel.nombre}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ROL_LABEL[personalSel.rol] || personalSel.rol}
                  {personalSel.departamento ? ` · ${personalSel.departamento}` : ""}
                  {personalSel.numero_empleado ? ` · Emp: ${personalSel.numero_empleado}` : ""}
                </p>
              </div>
              <p className="text-xs text-slate-400">Completa los datos clínicos que no están en el sistema:</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Sexo</label>
                  <select value={sexoPersonal} onChange={e => setSexoPersonal(e.target.value)}
                    className="input-dark w-full">
                    <option value="">-- Sexo --</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha de nacimiento</label>
                  <input type="date" value={fnPersonal} onChange={e => setFnPersonal(e.target.value)}
                    className="input-dark w-full" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPersonalSel(null)} className="btn-ghost flex-1 text-sm">← Volver</button>
                <button type="submit" className="btn-blue flex-1 text-sm">Confirmar y continuar</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Vista: Expediente del paciente ──────────────────────────────────────────
function ExpedientePaciente({ paciente, onNuevaConsulta, onClose }) {
  const [expediente, setExpediente] = useState(null);
  const [consultaSel, setConsultaSel] = useState(null);
  const { toast: showToast } = useToast();

  useEffect(() => {
    api.get(`/consultorio/pacientes/${paciente.id}`)
      .then(r => setExpediente(r.data))
      .catch(() => showToast("Error al cargar expediente", "error"));
  }, [paciente.id]);

  if (!expediente) return (
    <div className="flex items-center justify-center h-40">
      <span className="text-slate-400 animate-pulse">Cargando expediente…</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header paciente */}
      <div className="glass p-4 rounded-2xl flex items-start justify-between">
        <div>
          <h3 className="text-white font-bold text-lg">{expediente.nombre}</h3>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Chip color={expediente.tipo === "ALUMNO" ? "blue" : "cyan"} text={expediente.tipo} />
            {expediente.sexo && <Chip text={SEXO_LABEL[expediente.sexo] || expediente.sexo} />}
            {expediente.carrera && <Chip color="emerald" text={expediente.carrera} />}
            {expediente.departamento && <Chip color="cyan" text={expediente.departamento} />}
          </div>
          {expediente.matricula_o_emp && (
            <p className="text-xs text-slate-500 mt-1">
              {expediente.tipo === "ALUMNO" ? "Matrícula" : "Empleado"}: {expediente.matricula_o_emp}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onNuevaConsulta} className="btn-blue text-sm px-4">
            + Nueva consulta
          </button>
          <button onClick={onClose} className="btn-ghost text-sm px-3">Cerrar</button>
        </div>
      </div>

      {/* Historial */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Historial ({expediente.total_consultas} consultas)
        </p>
        {expediente.consultas.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-6">Sin consultas registradas</p>
        )}
        <div className="space-y-3">
          {expediente.consultas.map(c => (
            <div key={c.id} className="glass p-4 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setConsultaSel(c)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm text-white font-medium">{c.diagnostico}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.motivo_consulta}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Chip color="slate" text={fmtDT(c.fecha_consulta)} />
                    <Chip color={c.origen === "ESPONTANEA" ? "emerald" : "yellow"} text={ORIGEN_LABEL[c.origen] || c.origen} />
                    {c.genera_incapacidad && <Chip color="red" text={`Incapacidad ${c.dias_incapacidad}d`} />}
                    {c.requiere_seguimiento && c.fecha_seguimiento && (
                      <Chip color="blue" text={`Seguimiento ${fmt(c.fecha_seguimiento)}`} />
                    )}
                  </div>
                </div>
                {c.temperatura && (
                  <span className="text-xs text-slate-500 ml-3">🌡 {c.temperatura}°C</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal ver/editar consulta */}
      {consultaSel && (
        <ModalConsulta
          paciente={paciente}
          consulta={consultaSel}
          onClose={() => setConsultaSel(null)}
          onGuardado={() => {
            setConsultaSel(null);
            api.get(`/consultorio/pacientes/${paciente.id}`).then(r => setExpediente(r.data));
          }}
        />
      )}
    </div>
  );
}

// ─── Vista: Estadísticas ──────────────────────────────────────────────────────
function Estadisticas() {
  const [stats, setStats] = useState(null);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [modo, setModo] = useState("anio");
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [cuatrimestre, setCuatrimestre] = useState(Math.floor(new Date().getMonth() / 4) + 1);
  const { toast: showToast } = useToast();

  useEffect(() => {
    api.get("/consultorio/estadisticas", {
      params: {
        anio,
        mes: modo === "mes" ? mes : undefined,
        cuatrimestre: modo === "cuatrimestre" ? cuatrimestre : undefined,
      },
    })
      .then(r => setStats(r.data))
      .catch(() => showToast("Error al cargar estadísticas", "error"));
  }, [anio, modo, mes, cuatrimestre]);

  if (!stats) return (
    <div className="flex items-center justify-center h-40">
      <span className="text-slate-400 animate-pulse">Cargando estadísticas…</span>
    </div>
  );

  const maxMes = Math.max(...stats.por_mes.map(m => m.total), 1);

  return (
    <div className="space-y-6">
      {/* Selector año */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-400">Año:</label>
        <select value={anio} onChange={e => setAnio(Number(e.target.value))}
          className="input-dark w-32">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={modo} onChange={e => setModo(e.target.value)} className="input-dark w-44">
          <option value="anio">Todo el anio</option>
          <option value="mes">Mes</option>
          <option value="cuatrimestre">Cuatrimestre</option>
        </select>
        {modo === "mes" && (
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="input-dark w-36">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        )}
        {modo === "cuatrimestre" && (
          <select value={cuatrimestre} onChange={e => setCuatrimestre(Number(e.target.value))} className="input-dark w-40">
            <option value={1}>ENE-ABR</option>
            <option value={2}>MAY-AGO</option>
            <option value={3}>SEP-DIC</option>
          </select>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Consultas periodo", value: stats.total_periodo ?? stats.total_anio, color: "blue", icon: "🩺" },
          { label: "Consultas año", value: stats.total_anio, color: "blue", icon: "🩺" },
          { label: "Este mes", value: stats.consultas_mes_actual, color: "emerald", icon: "📅" },
          { label: "Incapacidades", value: stats.incapacidades_anio, color: "red", icon: "📋" },
          { label: "Seguimientos pend.", value: stats.seguimientos_pendientes, color: "yellow", icon: "🔔" },
          { label: "Canalizaciones pend.", value: stats.canalizaciones_pendientes, color: "cyan", icon: "➡️" },
        ].map(({ label, value, color, icon }) => {
          const cls = {
            blue: "border-blue-500/30 bg-blue-500/10",
            emerald: "border-emerald-500/30 bg-emerald-500/10",
            red: "border-red-500/30 bg-red-500/10",
            yellow: "border-yellow-500/30 bg-yellow-500/10",
            cyan: "border-cyan-500/30 bg-cyan-500/10",
          }[color];
          const tcls = {
            blue: "text-blue-300", emerald: "text-emerald-300",
            red: "text-red-300", yellow: "text-yellow-300", cyan: "text-cyan-300",
          }[color];
          return (
            <div key={label} className={`glass border ${cls} p-4 rounded-2xl text-center`}>
              <div className="text-2xl mb-1">{icon}</div>
              <div className={`text-2xl font-bold ${tcls}`}>{value}</div>
              <div className="text-xs text-slate-400 mt-1">{label}</div>
            </div>
          );
        })}
      </div>

      {/* Gráfica por mes */}
      <div className="glass p-5 rounded-2xl">
        <p className="text-sm font-semibold text-slate-300 mb-4">Consultas por mes — {anio}</p>
        <div className="flex items-end gap-1 h-32">
          {stats.por_mes.map(({ mes, total }) => (
            <div key={mes} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-slate-400">{total || ""}</span>
              <div
                className="w-full bg-blue-500/70 rounded-t-sm transition-all"
                style={{ height: `${(total / maxMes) * 100}%`, minHeight: total > 0 ? 4 : 0 }}
                title={`${MESES[mes - 1]}: ${total}`}
              />
              <span className="text-xs text-slate-500">{MESES[mes - 1]}</span>
            </div>
          ))}
        </div>
      </div>

      {stats.por_cuatrimestre && (
        <div className="glass p-5 rounded-2xl">
          <p className="text-sm font-semibold text-slate-300 mb-4">Consultas por cuatrimestre</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {stats.por_cuatrimestre.map(c => (
              <div key={c.cuatrimestre} className="rounded-xl bg-slate-800/50 border border-white/10 p-4">
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{c.total}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Por sexo y tipo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sexo */}
        <div className="glass p-4 rounded-2xl">
          <p className="text-sm font-semibold text-slate-300 mb-3">Por Sexo</p>
          <div className="space-y-2">
            {Object.entries(stats.por_sexo).map(([sexo, cnt]) => (
              <div key={sexo} className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{SEXO_LABEL[sexo] || sexo}</span>
                <span className="text-sm font-bold text-white">{cnt}</span>
              </div>
            ))}
            {Object.keys(stats.por_sexo).length === 0 && (
              <p className="text-slate-500 text-sm">Sin datos</p>
            )}
          </div>
        </div>

        {/* Tipo de paciente */}
        <div className="glass p-4 rounded-2xl">
          <p className="text-sm font-semibold text-slate-300 mb-3">Por Tipo</p>
          <div className="space-y-2">
            {Object.entries(stats.por_tipo).map(([tipo, cnt]) => (
              <div key={tipo} className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{tipo}</span>
                <span className="text-sm font-bold text-white">{cnt}</span>
              </div>
            ))}
            {Object.keys(stats.por_tipo).length === 0 && (
              <p className="text-slate-500 text-sm">Sin datos</p>
            )}
          </div>
        </div>

        {/* Origen */}
        <div className="glass p-4 rounded-2xl">
          <p className="text-sm font-semibold text-slate-300 mb-3">Por Origen</p>
          <div className="space-y-2">
            {Object.entries(stats.por_origen).map(([origen, cnt]) => (
              <div key={origen} className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{ORIGEN_LABEL[origen] || origen}</span>
                <span className="text-sm font-bold text-white">{cnt}</span>
              </div>
            ))}
            {Object.keys(stats.por_origen).length === 0 && (
              <p className="text-slate-500 text-sm">Sin datos</p>
            )}
          </div>
        </div>
      </div>

      {/* Diagnósticos frecuentes */}
      {stats.top_diagnosticos.length > 0 && (
        <div className="glass p-4 rounded-2xl">
          <p className="text-sm font-semibold text-slate-300 mb-3">Diagnósticos más frecuentes</p>
          <div className="space-y-2">
            {stats.top_diagnosticos.map(({ diagnostico, total }, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-5 text-right">{i + 1}.</span>
                <div className="flex-1 bg-slate-700/50 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${(total / stats.top_diagnosticos[0].total) * 100}%` }} />
                </div>
                <span className="text-sm text-slate-300 flex-[2]">{diagnostico}</span>
                <span className="text-sm font-bold text-white w-6 text-right">{total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vista: Canalizaciones pendientes ────────────────────────────────────────
// onAtenderTutoria: función que recibe la canalización para abrir el modal de consulta
function Canalizaciones({ onAtenderTutoria }) {
  const [cansTutoria, setCansTutoria] = useState([]);
  const [cansInternas, setCansInternas] = useState([]);
  const [filtroInterno, setFiltroInterno] = useState("PENDIENTE");
  const [seccion, setSeccion] = useState("tutoria"); // tutoria | internas
  const { toast: showToast } = useToast();

  const cargarTutoria = useCallback(() => {
    api.get("/consultorio/canalizaciones-tutoria")
      .then(r => setCansTutoria(r.data))
      .catch(() => showToast("Error al cargar referidos de tutoría", "error"));
  }, []);

  const cargarInternas = useCallback(() => {
    api.get("/consultorio/canalizaciones", { params: { estado: filtroInterno || undefined } })
      .then(r => setCansInternas(r.data))
      .catch(() => showToast("Error al cargar canalizaciones", "error"));
  }, [filtroInterno]);

  useEffect(() => { cargarTutoria(); cargarInternas(); }, [cargarTutoria, cargarInternas]);

  const marcarAtendidaInterna = async (can) => {
    try {
      await api.put(`/consultorio/canalizaciones/${can.id}`, {
        estado: "ATENDIDA", fecha_atencion: new Date().toISOString(),
      });
      showToast("Marcada como atendida", "success");
      cargarInternas();
    } catch { showToast("Error al actualizar", "error"); }
  };

  const DESTINO_COLOR = { PSICOLOGIA: "blue", TUTORIA: "cyan", NUTRICION: "emerald", HOSPITAL: "red", OTRO: "slate" };
  const pendientesTutoria = cansTutoria.filter(c => !c.consulta_medica_id).length;

  return (
    <div className="space-y-4">
      {/* Selector de sección */}
      <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1 text-sm">
        <button onClick={() => setSeccion("tutoria")}
          className={`flex-1 py-2 rounded-lg font-medium transition-all relative ${seccion === "tutoria" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-white"}`}>
          🏥 Referidos de Tutoría
          {pendientesTutoria > 0 && (
            <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {pendientesTutoria}
            </span>
          )}
        </button>
        <button onClick={() => setSeccion("internas")}
          className={`flex-1 py-2 rounded-lg font-medium transition-all ${seccion === "internas" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
          ➡️ Canalizaciones internas
        </button>
      </div>

      {/* ── Referidos de Tutoría ──────────────────────────────────────── */}
      {seccion === "tutoria" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Alumnos canalizados al médico por su tutor. Haz clic en <b className="text-white">Atender</b> para registrar la consulta y cerrar el referido automáticamente.
          </p>

          {cansTutoria.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <div className="text-4xl mb-2">✅</div>
              <p>Sin referidos pendientes de Tutoría</p>
            </div>
          )}

          {cansTutoria.map(can => {
            const atendido = !!can.consulta_medica_id;
            return (
              <div key={can.canalizacion_id}
                className={`glass p-4 rounded-xl border ${atendido ? "border-emerald-700/30 opacity-70" : "border-rose-700/30"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Chip color={atendido ? "emerald" : "red"} text={atendido ? "Atendido" : "Pendiente"} />
                      {can.alumno_carrera && <Chip color="slate" text={can.alumno_carrera} />}
                    </div>
                    <p className="text-sm text-white font-semibold truncate">{can.alumno_nombre}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {can.alumno_matricula && <span className="mr-2">Mat: {can.alumno_matricula}</span>}
                      Tutor: {can.tutor_nombre}
                    </p>
                    {can.motivo && (
                      <p className="text-xs text-slate-300 bg-slate-800/60 rounded-lg px-2 py-1 mt-2 italic">
                        "{can.motivo}"
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      Enviado: {fmt(can.fecha_solicitud)}
                      {atendido && " · ✓ Consulta registrada"}
                    </p>
                  </div>
                  {!atendido && (
                    <button
                      onClick={() => onAtenderTutoria(can)}
                      className="flex-shrink-0 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors">
                      🩺 Atender
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Canalizaciones internas ───────────────────────────────────── */}
      {seccion === "internas" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {["PENDIENTE", "ATENDIDA", ""].map((e, i) => (
              <button key={i} onClick={() => setFiltroInterno(e)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  filtroInterno === e ? "bg-blue-600 text-white" : "bg-slate-700/40 text-slate-400 hover:text-white"
                }`}>
                {e || "Todas"}
              </button>
            ))}
          </div>

          {cansInternas.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <div className="text-4xl mb-2">✅</div>
              <p>Sin canalizaciones {filtroInterno === "PENDIENTE" ? "pendientes" : ""}</p>
            </div>
          )}

          {cansInternas.map(can => (
            <div key={can.id} className="glass p-4 rounded-xl">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Chip color={DESTINO_COLOR[can.destino] || "slate"} text={can.destino} />
                    <Chip color={can.estado === "PENDIENTE" ? "yellow" : "emerald"} text={can.estado} />
                  </div>
                  <p className="text-sm text-white font-medium">{can.paciente_nombre}</p>
                  {can.motivo && <p className="text-xs text-slate-400 mt-0.5">{can.motivo}</p>}
                  <p className="text-xs text-slate-500 mt-1">
                    {fmtDT(can.fecha_canaliza)}
                    {can.fecha_atencion && ` · Atendido: ${fmtDT(can.fecha_atencion)}`}
                  </p>
                </div>
                {can.estado === "PENDIENTE" && (
                  <button onClick={() => marcarAtendidaInterna(can)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700/40 hover:bg-emerald-700/70 text-emerald-300 text-xs font-medium ml-3">
                    ✓ Atendida
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Vista: Consultas recientes ───────────────────────────────────────────────
function ConsultasRecientes({ onVerPaciente }) {
  const [data, setData] = useState({ total: 0, consultas: [] });
  const [filtroTipo, setFiltroTipo] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const { toast: showToast } = useToast();

  const cargar = useCallback(() => {
    api.get("/consultorio/consultas", {
      params: {
        tipo_paciente: filtroTipo || undefined,
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
        limit: 30,
      },
    })
      .then(r => setData(r.data))
      .catch(() => showToast("Error al cargar consultas", "error"));
  }, [filtroTipo, fechaDesde, fechaHasta]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Tipo paciente</label>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="input-dark">
            <option value="">Todos</option>
            <option value="ALUMNO">Alumnos</option>
            <option value="ADMINISTRATIVO">Administrativos</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="input-dark" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="input-dark" />
        </div>
        <button onClick={cargar} className="btn-blue text-sm px-4">Filtrar</button>
      </div>

      <p className="text-xs text-slate-500">{data.total} consultas encontradas</p>

      <div className="space-y-2">
        {data.consultas.map(c => (
          <div key={c.id} className="glass p-3 rounded-xl flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-white font-medium">{c.paciente_nombre}</span>
                {c.paciente_sexo && <Chip text={SEXO_LABEL[c.paciente_sexo] || c.paciente_sexo} />}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{c.diagnostico}</p>
              <p className="text-xs text-slate-500 mt-1">{fmtDT(c.fecha_consulta)}</p>
            </div>
            <button onClick={() => onVerPaciente(c.paciente_id)}
              className="text-xs text-blue-400 hover:text-blue-300 ml-3 flex-shrink-0">
              Ver expediente →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────
export default function ConsultorioMedico() {
  const [tab, setTab] = useState("inicio");
  const [pacienteSel, setPacienteSel] = useState(null);
  const [showModalPaciente, setShowModalPaciente] = useState(false);
  const [showModalConsulta, setShowModalConsulta] = useState(false);
  const [canalizacionTutoriaSel, setCanalizacionTutoriaSel] = useState(null);
  const { toast: showToast } = useToast();

  const seleccionarPaciente = (pac) => {
    setPacienteSel(pac);
    setShowModalPaciente(false);
    setShowModalConsulta(true);  // abre la consulta directo, sin pasar por expediente
  };

  const verPacientePorId = async (pacienteId) => {
    try {
      const { data } = await api.get(`/consultorio/pacientes/${pacienteId}`);
      setPacienteSel(data);
      setTab("expediente");
    } catch { showToast("Error al cargar paciente", "error"); }
  };

  // Abre ModalConsulta desde un referido de Tutoría
  const onAtenderTutoria = async (can) => {
    try {
      // Buscar paciente existente por alumno_id
      const { data: lista } = await api.get(
        `/consultorio/pacientes/buscar?q=${encodeURIComponent(can.alumno_nombre || "")}`
      );
      const existing = lista.find(p => p.alumno_id === can.alumno_id);

      if (existing) {
        const { data: detail } = await api.get(`/consultorio/pacientes/${existing.id}`);
        setPacienteSel(detail);
      } else {
        // Paciente aún no existe — el backend lo crea al guardar la consulta
        setPacienteSel({
          id: null,
          nombre: can.alumno_nombre,
          tipo: "ALUMNO",
          alumno_id: can.alumno_id,
          sexo: null,
          fecha_nacimiento: null,
          consultas: [],
        });
      }
      setCanalizacionTutoriaSel(can);
      setShowModalConsulta(true);
    } catch {
      showToast("Error al cargar datos del alumno", "error");
    }
  };

  const TABS = [
    { key: "inicio", label: "🏠 Inicio" },
    { key: "consultas", label: "📋 Consultas" },
    { key: "estadisticas", label: "📊 Estadísticas" },
    { key: "canalizaciones", label: "➡️ Canalizaciones" },
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">🏥 Consultorio Médico</h1>
            <p className="text-sm text-slate-400 mt-0.5">Universidad Tecnológica de Candelaria</p>
          </div>
          <button onClick={() => setShowModalPaciente(true)}
            className="btn-blue px-5 text-sm font-medium">
            + Nueva Consulta
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/60 rounded-2xl p-1 text-sm">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-xl font-medium transition-all ${
                tab === key ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}>
              {label}
            </button>
          ))}
          {pacienteSel && (
            <button onClick={() => setTab("expediente")}
              className={`flex-1 py-2 rounded-xl font-medium transition-all text-xs ${
                tab === "expediente" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}>
              📁 {pacienteSel.nombre?.split(" ")[0]}
            </button>
          )}
        </div>

        {/* Contenido */}
        <div className="min-h-96">
          {tab === "inicio" && (
            <div className="space-y-6">
              <div className="glass p-6 rounded-2xl">
                <h2 className="text-white font-semibold mb-4">Acciones rápidas</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={() => setShowModalPaciente(true)}
                    className="p-4 rounded-xl bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 transition-colors text-left">
                    <div className="text-2xl mb-2">🩺</div>
                    <p className="text-white font-medium">Nueva consulta</p>
                    <p className="text-xs text-slate-400 mt-1">Registrar atención médica</p>
                  </button>
                  <button onClick={() => setTab("estadisticas")}
                    className="p-4 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors text-left">
                    <div className="text-2xl mb-2">📊</div>
                    <p className="text-white font-medium">Ver estadísticas</p>
                    <p className="text-xs text-slate-400 mt-1">Consultas por mes, sexo y diagnóstico</p>
                  </button>
                  <button onClick={() => setTab("canalizaciones")}
                    className="p-4 rounded-xl bg-yellow-600/20 border border-yellow-500/30 hover:bg-yellow-600/30 transition-colors text-left">
                    <div className="text-2xl mb-2">➡️</div>
                    <p className="text-white font-medium">Canalizaciones pendientes</p>
                    <p className="text-xs text-slate-400 mt-1">Revisar referidos sin atender</p>
                  </button>
                  <button onClick={() => setTab("consultas")}
                    className="p-4 rounded-xl bg-slate-600/20 border border-slate-500/30 hover:bg-slate-600/30 transition-colors text-left">
                    <div className="text-2xl mb-2">📋</div>
                    <p className="text-white font-medium">Historial de consultas</p>
                    <p className="text-xs text-slate-400 mt-1">Buscar y filtrar atenciones</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "consultas" && (
            <ConsultasRecientes onVerPaciente={verPacientePorId} />
          )}

          {tab === "estadisticas" && <Estadisticas />}

          {tab === "canalizaciones" && (
            <Canalizaciones onAtenderTutoria={onAtenderTutoria} />
          )}

          {tab === "expediente" && pacienteSel && (
            <ExpedientePaciente
              paciente={pacienteSel}
              onNuevaConsulta={() => setShowModalConsulta(true)}
              onClose={() => { setTab("inicio"); setPacienteSel(null); }}
            />
          )}
        </div>
      </div>

      {/* Modal: seleccionar / crear paciente */}
      {showModalPaciente && (
        <ModalPaciente
          onSelect={seleccionarPaciente}
          onClose={() => setShowModalPaciente(false)}
        />
      )}

      {/* Modal: nueva consulta para paciente seleccionado */}
      {showModalConsulta && pacienteSel && (
        <ModalConsulta
          paciente={pacienteSel}
          consulta={null}
          canalizacionTutoria={canalizacionTutoriaSel}
          onClose={() => {
            setShowModalConsulta(false);
            setCanalizacionTutoriaSel(null);
          }}
          onGuardado={() => {
            setShowModalConsulta(false);
            setCanalizacionTutoriaSel(null);
            if (!pacienteSel.id) {
              setTab("canalizaciones");
              setPacienteSel(null);
            } else {
              api.get(`/consultorio/pacientes/${pacienteSel.id}`)
                .then(r => { setPacienteSel(r.data); setTab("expediente"); });
            }
          }}
        />
      )}
    </AdminLayout>
  );
}
