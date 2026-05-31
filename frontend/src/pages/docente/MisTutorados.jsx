import { useState, useEffect, useCallback } from "react";
import api from "../../hooks/useApi";
import { useToast } from "../../context/ToastContext";
import AdminLayout from "../../components/AdminLayout";
import SelectDark from "../../components/SelectDark";

// ─── Constantes ───────────────────────────────────────────────────────────────
const SEMAFORO = {
  ALTO:      { emoji: "🔴", label: "Vulnerabilidad Alta",       cls: "border-red-500/50 bg-red-900/10" },
  MEDIO:     { emoji: "🟡", label: "Vulnerabilidad Media",      cls: "border-amber-500/50 bg-amber-900/10" },
  BAJO:      { emoji: "🟢", label: "Vulnerabilidad Baja",       cls: "border-emerald-500/30 bg-slate-800/60" },
  SIN_DATOS: { emoji: "⚪", label: "Sin datos socioeconómicos", cls: "border-slate-600/50 bg-slate-800/40" },
};

const toTitleCase = s =>
  s ? s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase()) : s;

const ESTADO_SEG = {
  SIN_SEGUIMIENTO: { label: "Sin seguimiento", cls: "bg-transparent text-slate-500 border-slate-600/60" },
  EN_OBSERVACION:  { label: "En observación",  cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  CANALIZADO:      { label: "Canalizado",      cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  ATENDIDO:        { label: "Atendido",        cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  CERRADO:         { label: "Cerrado",         cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
};

const ESTADO_CAN = {
  PENDIENTE:      { label: "Pendiente",      cls: "text-red-400" },
  EN_SEGUIMIENTO: { label: "En seguimiento", cls: "text-amber-400" },
  ATENDIDA:       { label: "Atendida",       cls: "text-emerald-400" },
};

const CATEGORIAS_F09 = {
  BAJA: "🚪 Baja escolar", VULNERABILIDAD_ACADEMICA: "📚 Vulnerabilidad académica",
  APOYO_PSICOPEDAGOGICO: "🧠 Apoyo psicopedagógico", VULNERABILIDAD_ECONOMICA: "💰 Vulnerabilidad económica",
  PADRE_MADRE: "👨‍👩‍👧 Padre/Madre de familia", EMBARAZADA: "🤰 Embarazada",
  ADICCIONES: "⚠️ Adicciones", ENFERMEDAD: "🏥 Enfermedad diagnosticada", TRABAJA: "💼 Trabaja",
};

// ─── Perfil Socioeconómico ────────────────────────────────────────────────────
function PerfilCard({ perfil }) {
  if (!perfil) return <p className="text-xs text-slate-500 mt-2">Sin datos del estudio socioeconómico.</p>;
  const items = [
    perfil.promedio_bachillerato && `Prom. bachillerato: ${perfil.promedio_bachillerato}`,
    perfil.ingreso_familiar_mensual && `Ingreso familiar: $${Number(perfil.ingreso_familiar_mensual).toLocaleString("es-MX")}/mes`,
    perfil.recibe_apoyo_institucional && `Apoyo institucional: ${perfil.institucion_apoyo || "Sí"}`,
    perfil.habla_lengua_indigena && "Habla lengua indígena",
    perfil.tiene_hijos && `Tiene ${perfil.num_hijos || ""} hijo(s)`,
    perfil.trabaja && `Trabaja: ${perfil.empresa || "Sí"}`,
    perfil.tiene_alergia && "Tiene alergia",
    perfil.tiene_enfermedad_cronica && [
      perfil.diabetes && "Diabetes", perfil.hipertension && "Hipertensión",
      perfil.hemofilia && "Hemofilia", perfil.problemas_cardiacos && "Prob. cardíacos",
    ].filter(Boolean).join(", "),
    perfil.tiene_discapacidad && "Discapacidad diagnosticada",
  ].filter(Boolean);

  return (
    <div className="mt-2 space-y-1">
      {items.map((item, i) => (
        <p key={i} className="text-xs text-slate-300 flex items-start gap-1">
          <span className="text-slate-500 mt-0.5">·</span> {item}
        </p>
      ))}
      {perfil.informacion_relevante && (
        <p className="text-xs text-amber-300 mt-1">📌 {perfil.informacion_relevante}</p>
      )}
    </div>
  );
}

// ─── Modal Registrar Sesión (F-DC-07) ────────────────────────────────────────
function ModalSesion({ grupo, alumnos, onClose, onGuardado }) {
  const { toast: showToast } = useToast();
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [tipoSesion, setTipoSesion] = useState("GRUPAL");
  const [observaciones, setObservaciones] = useState("");
  const [registros, setRegistros] = useState(
    alumnos.map(a => ({
      alumno_id: a.id, nombre: a.nombre, matricula: a.matricula,
      asistio: true, tipo_academico: false, tipo_personal: false, tipo_otro: false,
      requiere_canalizacion: false, tema: "", acciones_preventivas: "", comentarios: "",
    }))
  );
  const [loading, setLoading] = useState(false);

  const upd = (idx, field, val) =>
    setRegistros(rs => rs.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const submit = async () => {
    if (!fecha) { showToast("Indica la fecha de la sesión", "error"); return; }
    setLoading(true);
    try {
      await api.post("/tutoria/sesiones", {
        grupo_tutorado_id: grupo.id,
        fecha, tipo_sesion: tipoSesion,
        observaciones_generales: observaciones,
        registros: registros.map(({ nombre, matricula, ...r }) => r),
      });
      showToast("Sesión F-DC-07 registrada correctamente", "success");
      onGuardado();
    } catch (e) {
      showToast(e.response?.data?.detail || "Error al guardar sesión", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl my-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">📋 Registro de Sesión (F-DC-07)</h3>
            <p className="text-xs text-slate-400">{grupo.carrera} · Grupo {grupo.grupo}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fecha *</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="input-dark w-full text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tipo de sesión</label>
            <select value={tipoSesion} onChange={e => setTipoSesion(e.target.value)}
              className="input-dark w-full text-sm">
              <option value="GRUPAL">Grupal</option>
              <option value="INDIVIDUAL">Individual</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Observaciones generales</label>
            <input value={observaciones} onChange={e => setObservaciones(e.target.value)}
              className="input-dark w-full text-sm" placeholder="Opcional" />
          </div>
        </div>

        <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wide">Registro por alumno</p>
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {registros.map((r, idx) => (
            <div key={r.alumno_id} className="bg-slate-800/60 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-white">
                {toTitleCase(r.nombre)}
                <span className="ml-1.5 text-xs" style={{ color: '#9CA3AF' }}>({r.matricula})</span>
              </p>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={r.asistio} onChange={e => upd(idx, "asistio", e.target.checked)}
                    className="accent-blue-500" />
                  Asistió
                </label>
              </div>
              {r.asistio && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3 text-xs">
                    {[["tipo_academico","Académico"],["tipo_personal","Personal"],["tipo_otro","Otro"]].map(([k, l]) => (
                      <label key={k} className="flex items-center gap-1 text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={r[k]} onChange={e => upd(idx, k, e.target.checked)} className="accent-blue-500" />
                        {l}
                      </label>
                    ))}
                    <label className={`flex items-center gap-1 cursor-pointer transition-colors ${r.requiere_canalizacion ? 'text-amber-300' : 'text-slate-400'}`}>
                      <input type="checkbox" checked={r.requiere_canalizacion}
                        onChange={e => upd(idx, "requiere_canalizacion", e.target.checked)} className="accent-amber-500" />
                      Requiere canalización
                    </label>
                  </div>
                  <input value={r.tema} onChange={e => upd(idx, "tema", e.target.value)}
                    className="w-full text-xs rounded-lg px-3 py-2 bg-slate-900/60 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                    placeholder="Tema tratado" />
                  <input value={r.acciones_preventivas} onChange={e => upd(idx, "acciones_preventivas", e.target.value)}
                    className="w-full text-xs rounded-lg px-3 py-2 bg-slate-900/60 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                    placeholder="Acciones preventivas" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancelar</button>
          <button onClick={submit} disabled={loading} className="btn-blue px-5 py-2 text-sm">
            {loading ? "Guardando…" : "Guardar sesión"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Nueva Canalización (F-DC-08) ───────────────────────────────────────
function ModalCanalizar({ alumnos, grupoId, onClose, onGuardado }) {
  const { toast: showToast } = useToast();
  const [alumnoId, setAlumnoId] = useState(alumnos[0]?.id || "");
  const [tipos, setTipos] = useState({ tipo_psicologico: false, tipo_pedagogico: false, tipo_personal: false, tipo_medico: false });
  const [modalidad, setModalidad] = useState("INDIVIDUAL");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  const toggle = k => setTipos(t => ({ ...t, [k]: !t[k] }));

  const submit = async () => {
    if (!motivo.trim()) { showToast("El motivo es requerido", "error"); return; }
    setLoading(true);
    try {
      await api.post("/tutoria/canalizaciones", {
        alumno_id: Number(alumnoId), grupo_tutorado_id: grupoId,
        ...tipos, modalidad, motivo,
      });
      showToast("Canalización F-DC-08 registrada", "success");
      onGuardado();
    } catch (e) {
      showToast(e.response?.data?.detail || "Error al canalizar", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">🔔 Nueva Canalización (F-DC-08)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Alumno *</label>
            <SelectDark
              value={alumnoId}
              onChange={setAlumnoId}
              options={alumnos.map(a => ({
                value: a.id,
                label: toTitleCase(a.nombre),
                sublabel: a.matricula,
              }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Tipo de atención</label>
            <div className="flex gap-4">
              {[["tipo_psicologico","Psicológico"],["tipo_pedagogico","Pedagógico"],["tipo_personal","Personal"],["tipo_medico","🏥 Médico"]].map(([k, l]) => (
                <label key={k} className={`flex items-center gap-1.5 text-sm cursor-pointer ${k === "tipo_medico" ? "text-rose-300" : "text-slate-300"}`}>
                  <input type="checkbox" checked={tipos[k]} onChange={() => toggle(k)}
                    className={k === "tipo_medico" ? "accent-rose-500" : "accent-blue-500"} /> {l}
                </label>
              ))}
            </div>
            {tipos.tipo_medico && (
              <p className="text-xs text-rose-300 bg-rose-900/20 border border-rose-700/30 rounded-lg px-3 py-2 mt-2">
                🏥 Esta canalización aparecerá como pendiente en el panel del médico para que la atienda directamente.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Modalidad</label>
            <SelectDark
              value={modalidad}
              onChange={setModalidad}
              options={[
                { value: 'INDIVIDUAL', label: 'Individual' },
                { value: 'GRUPAL',     label: 'Grupal'     },
              ]}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Motivo de canalización *</label>
            <textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
              placeholder="Describe el motivo que fundamenta la canalización…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancelar</button>
          <button onClick={submit} disabled={loading} className="btn-blue px-5 py-2 text-sm">
            {loading ? "Enviando…" : "Registrar canalización"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Informe Bimestral (F-DC-09) ─────────────────────────────────────────────
function InformeBimestral({ grupo }) {
  const { toast: showToast } = useToast();
  const [bimestre, setBimestre] = useState(1);
  const [informe, setInforme] = useState(null);
  const [textos, setTextos] = useState({ principal_problematica: "", sugerencias: "" });
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/tutoria/grupos/${grupo.id}/informe/${bimestre}`);
      setInforme(data);
      setTextos({ principal_problematica: data.principal_problematica || "", sugerencias: data.sugerencias || "" });
    } catch { showToast("Error al cargar informe", "error"); }
    finally { setLoading(false); }
  }, [grupo.id, bimestre]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardarTextos = async () => {
    setGuardando(true);
    try {
      await api.put(`/tutoria/informes/${informe.id}/textos`, textos);
      showToast("Borrador guardado", "success");
    } catch { showToast("Error al guardar", "error"); }
    finally { setGuardando(false); }
  };

  const enviar = async () => {
    try {
      await api.post(`/tutoria/informes/${informe.id}/enviar`);
      showToast("Informe F-DC-09 enviado al responsable de tutoría", "success");
      cargar();
    } catch (e) { showToast(e.response?.data?.detail || "Error al enviar", "error"); }
  };

  const exportarPDF = async () => {
    try {
      const resp = await api.get(`/tutoria/informes/${informe.id}/pdf`, { responseType: "blob" });
      const url  = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `F-DC-09_${informe.periodo}_B${informe.bimestre}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { showToast("Error al generar el PDF", "error"); }
  };

  if (loading) return <p className="text-slate-400 text-sm py-8 text-center">Cargando informe…</p>;
  if (!informe) return null;

  const ESTADO_COLOR = { BORRADOR: "text-slate-400", ENVIADO: "text-blue-400", RECIBIDO: "text-emerald-400" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[1, 2].map(b => (
            <button key={b} onClick={() => setBimestre(b)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                bimestre === b ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
              }`}>
              Bimestre {b}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {informe.documento_codigo && (
            <span className="text-xs text-slate-500">{informe.documento_codigo} v{informe.documento_version}</span>
          )}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            informe.estado === 'BORRADOR'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              : informe.estado === 'ENVIADO'
              ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          }`}>{informe.estado}</span>
          <button onClick={exportarPDF}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs text-white font-medium">
            📥 Exportar F-DC-09
          </button>
          {informe.estado === "BORRADOR" && (
            <button onClick={enviar}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs text-white font-medium">
              📤 Enviar al responsable
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          [informe.matricula_inicial, "Matrícula inicial (B1)"],
          [informe.matricula_final, "Matrícula actual (B2)"],
        ].map(([v, l]) => (
          <div key={l} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{v}</p>
            <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{l}</p>
          </div>
        ))}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
          <p className="text-xs mb-1" style={{ color: '#9CA3AF' }}>Sesiones por mes</p>
          <div className="flex gap-2 justify-between">
            {[informe.sesiones_mes1, informe.sesiones_mes2, informe.sesiones_mes3, informe.sesiones_mes4].map((n, i) => (
              <div key={i} className="text-center">
                <p className={`text-lg font-bold ${n > 0 ? 'text-white' : 'text-slate-600'}`}>{n}</p>
                <p className="text-xs" style={{ color: '#6B7280' }}>Mes {i + 1}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {informe.detalles_auto?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-white mb-2">📊 Categorías detectadas del perfil socioeconómico</p>
          <div className="space-y-2">
            {Object.entries(
              informe.detalles_auto.reduce((acc, d) => {
                if (!acc[d.categoria]) acc[d.categoria] = [];
                acc[d.categoria].push(d);
                return acc;
              }, {})
            ).map(([cat, items]) => (
              <div key={cat} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
                <p className="text-xs font-medium text-slate-300 mb-1">{CATEGORIAS_F09[cat] || cat}</p>
                {items.map((item, i) => (
                  <p key={i} className="text-xs text-slate-400">
                    · {item.alumno} ({item.matricula}){item.detalle ? ` — ${item.detalle}` : ""}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {[
          ["principal_problematica", "Principal problemática del grupo observada", "Describe la principal problemática observada…"],
          ["sugerencias", "Sugerencias para trabajo individual/grupal", "Estrategias sugeridas para el siguiente bimestre…"],
        ].map(([key, label, ph]) => (
          <div key={key}>
            <label className="text-sm font-medium text-white mb-1 block">{label}</label>
            <textarea rows={3} value={textos[key]}
              onChange={e => setTextos(t => ({ ...t, [key]: e.target.value }))}
              disabled={informe.estado !== "BORRADOR"}
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none placeholder-slate-500 focus:outline-none focus:border-blue-500/60 disabled:opacity-50"
              placeholder={ph} />
          </div>
        ))}
        {informe.estado === "BORRADOR" && (
          <button onClick={guardarTextos} disabled={guardando}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-white disabled:opacity-50">
            {guardando ? "Guardando…" : "💾 Guardar borrador"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Agenda ("Lo que debo hacer") ───────────────────────────────────────
function TabAgenda({ pendientes, grupos, onRegistrarSesion, onCanalizar }) {
  if (!pendientes) return <p className="text-slate-400 text-sm text-center py-12">Cargando agenda…</p>;

  const { sesiones_vencidas = [], sesiones_proximas = [],
          alumnos_riesgo = [], canalizaciones_pendientes = [],
          informes_borrador = [], resumen = {} } = pendientes;

  const todo = sesiones_vencidas.length + alumnos_riesgo.length +
               sesiones_proximas.length + canalizaciones_pendientes.length +
               informes_borrador.length;

  if (todo === 0) return (
    <div className="text-center py-16">
      <p className="text-4xl mb-3">✅</p>
      <p className="text-white font-semibold text-lg">¡Todo al día!</p>
      <p className="text-slate-400 text-sm mt-1">No tienes pendientes urgentes esta semana.</p>
    </div>
  );

  const Section = ({ emoji, title, color, children }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span>{emoji}</span>
        <h3 className={`text-sm font-semibold ${color}`}>{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Resumen rápido */}
      <div className="flex gap-3">
        {resumen.urgente > 0 && (
          <div className="flex-1 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-red-400">{resumen.urgente}</p>
            <p className="text-xs text-red-300 mt-0.5">Urgente</p>
          </div>
        )}
        {resumen.pendiente > 0 && (
          <div className="flex-1 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{resumen.pendiente}</p>
            <p className="text-xs text-amber-300 mt-0.5">Pendiente</p>
          </div>
        )}
      </div>

      {/* Sesiones vencidas */}
      {sesiones_vencidas.length > 0 && (
        <Section emoji="🚨" title="Sesiones programadas vencidas" color="text-red-400">
          {sesiones_vencidas.map(s => (
            <div key={s.id} className="bg-red-900/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white font-medium">{s.grupo_label}</p>
                <p className="text-xs text-red-300">
                  Programada: {new Date(s.fecha_programada).toLocaleDateString("es-MX")}
                  {s.dias_atraso > 0 && <span className="ml-2 font-semibold">· {s.dias_atraso} días de atraso</span>}
                </p>
                {s.objetivo && <p className="text-xs text-slate-400 mt-0.5">{s.objetivo}</p>}
              </div>
              <button onClick={() => onRegistrarSesion(s.grupo_id)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs text-white font-medium">
                📋 Registrar
              </button>
            </div>
          ))}
        </Section>
      )}

      {/* Alumnos de riesgo sin seguimiento */}
      {alumnos_riesgo.length > 0 && (
        <Section emoji="🔴" title="Alumnos con vulnerabilidad alta sin seguimiento" color="text-red-400">
          <p className="text-xs text-slate-500">El Responsable de Tutoría asignará el estado de seguimiento; tú puedes canalizarlos si lo ves necesario.</p>
          {alumnos_riesgo.map(a => (
            <div key={a.alumno_id} className="bg-red-900/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white font-medium">{a.nombre}</p>
                <p className="text-xs text-slate-400">{a.matricula} · {a.grupo_label}</p>
              </div>
              <button onClick={() => onCanalizar()}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs text-white font-medium">
                🔔 Canalizar
              </button>
            </div>
          ))}
        </Section>
      )}

      {/* Sesiones próximas */}
      {sesiones_proximas.length > 0 && (
        <Section emoji="📅" title="Sesiones programadas esta semana" color="text-blue-400">
          {sesiones_proximas.map(s => (
            <div key={s.id} className="bg-blue-900/10 border border-blue-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white font-medium">{s.grupo_label}</p>
                <p className="text-xs text-blue-300">
                  {new Date(s.fecha_programada).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
                  <span className="ml-2 text-slate-400">· {s.tipo_sesion}</span>
                </p>
                {s.objetivo && <p className="text-xs text-slate-400 mt-0.5">{s.objetivo}</p>}
              </div>
              <button onClick={() => onRegistrarSesion(s.grupo_id)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs text-white font-medium">
                📋 Registrar
              </button>
            </div>
          ))}
        </Section>
      )}

      {/* Canalizaciones sin movimiento */}
      {canalizaciones_pendientes.length > 0 && (
        <Section emoji="🔔" title="Canalizaciones sin respuesta (≥5 días)" color="text-amber-400">
          {canalizaciones_pendientes.map(c => (
            <div key={c.can_id} className="bg-amber-900/10 border border-amber-500/30 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-white font-medium">{c.alumno_nombre}
                    <span className="text-slate-400 text-xs ml-1">({c.alumno_matricula})</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{c.motivo_corto}</p>
                  {c.tipos?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {c.tipos.map(t => (
                        <span key={t} className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-xs text-amber-400 font-medium">{c.dias}d</span>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-500 mt-1">El Responsable de Tutoría es quien atiende las canalizaciones.</p>
        </Section>
      )}

      {/* Informes en borrador */}
      {informes_borrador.length > 0 && (
        <Section emoji="📋" title="Informes F-DC-09 pendientes de envío" color="text-slate-300">
          {informes_borrador.map(inf => (
            <div key={inf.informe_id} className="bg-slate-800/60 border border-slate-600/40 rounded-xl p-3">
              <p className="text-sm text-white font-medium">{inf.grupo_label}</p>
              <p className="text-xs text-slate-400">{inf.periodo} · Bimestre {inf.bimestre}</p>
              <p className="text-xs text-blue-400 mt-1">Ve a la pestaña "Informe Bimestral" para revisar y enviar.</p>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// ─── Tab: Sesiones ────────────────────────────────────────────────────────────
function TabSesiones({ grupoId }) {
  const [sesiones, setSesiones] = useState([]);
  const [programadas, setProgramadas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!grupoId) return;
    setLoading(true);
    Promise.all([
      api.get(`/tutoria/sesiones?grupo_tutorado_id=${grupoId}`),
      api.get(`/tutoria/programaciones?grupo_tutorado_id=${grupoId}`),
    ]).then(([s, p]) => {
      setSesiones(s.data);
      setProgramadas(p.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [grupoId]);

  if (loading) return <p className="text-slate-400 text-sm text-center py-8">Cargando sesiones…</p>;

  const prog_vencidas = programadas.filter(p => p.estado === "PROGRAMADA" && new Date(p.fecha_programada) < new Date());
  const prog_futuras  = programadas.filter(p => p.estado === "PROGRAMADA" && new Date(p.fecha_programada) >= new Date());
  const prog_ok       = programadas.filter(p => p.estado === "REALIZADA");

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        {[
          [sesiones.length, "Sesiones registradas", "text-emerald-400"],
          [prog_vencidas.length, "Programadas vencidas", "text-red-400"],
          [prog_futuras.length, "Próximas programadas", "text-blue-400"],
        ].map(([v, l, c]) => (
          <div key={l} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${v === 0 ? 'text-slate-500' : c}`}>{v}</p>
            <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{l}</p>
          </div>
        ))}
      </div>

      {/* Programaciones vencidas */}
      {prog_vencidas.length > 0 && (
        <div>
          <p className="text-xs text-red-400 font-medium uppercase tracking-wide mb-2">🚨 Programadas vencidas</p>
          <div className="space-y-2">
            {prog_vencidas.map(p => (
              <div key={p.id} className="bg-red-900/10 border border-red-500/30 rounded-xl px-4 py-2.5 flex justify-between items-center">
                <div>
                  <p className="text-sm text-white">{new Date(p.fecha_programada).toLocaleDateString("es-MX")}
                    <span className="text-slate-400 text-xs ml-2">· {p.tipo_sesion}</span>
                  </p>
                  {p.objetivo && <p className="text-xs text-slate-400">{p.objetivo}</p>}
                </div>
                <span className="text-xs text-red-400 font-medium">
                  {Math.floor((new Date() - new Date(p.fecha_programada)) / 86400000)}d de atraso
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sesiones registradas */}
      {sesiones.length > 0 && (
        <div>
          <p className="text-xs text-emerald-400 font-medium uppercase tracking-wide mb-2">✅ Sesiones registradas</p>
          <div className="space-y-2">
            {sesiones.map(s => (
              <div key={s.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {new Date(s.fecha).toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.tipo_sesion}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-emerald-400 font-medium">{s.asistentes} asistentes</p>
                    {s.con_canalizacion > 0 && <p className="text-amber-400">{s.con_canalizacion} canalizaciones</p>}
                  </div>
                </div>
                {s.observaciones_generales && (
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{s.observaciones_generales}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sesiones.length === 0 && prog_vencidas.length === 0 && (
        <div className="text-center py-8">
          <p className="text-slate-400 text-sm">No hay sesiones registradas aún.</p>
          <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
            Usa el botón "Registrar Sesión" del encabezado para capturar tu primera sesión F-DC-07.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function MisTutorados() {
  const { toast: showToast } = useToast();
  const [grupos, setGrupos] = useState([]);
  const [grupoSel, setGrupoSel] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [canalizaciones, setCanalizaciones] = useState([]);
  const [pendientes, setPendientes] = useState(null);
  const [tab, setTab] = useState("agenda");
  const [modal, setModal] = useState(null); // null | "sesion" | "canalizar"
  const [expandido, setExpandido] = useState(null);
  const [registrarGrupoId, setRegistrarGrupoId] = useState(null);

  const cargarPendientes = useCallback(async () => {
    try {
      const { data } = await api.get("/tutoria/mis-pendientes");
      setPendientes(data);
    } catch { setPendientes({ sesiones_vencidas: [], sesiones_proximas: [], alumnos_riesgo: [], canalizaciones_pendientes: [], informes_borrador: [], resumen: {} }); }
  }, []);

  useEffect(() => {
    api.get("/tutoria/grupos").then(({ data }) => {
      setGrupos(data);
      if (data.length > 0) setGrupoSel(data[0]);
    }).catch(() => showToast("Error al cargar grupos", "error"));
    cargarPendientes();
  }, []);

  useEffect(() => {
    if (!grupoSel) return;
    api.get(`/tutoria/grupos/${grupoSel.id}/alumnos`)
      .then(({ data }) => setAlumnos(data))
      .catch(() => showToast("Error al cargar alumnos", "error"));
    api.get("/tutoria/canalizaciones")
      .then(({ data }) => setCanalizaciones(data))
      .catch(() => {});
  }, [grupoSel]);

  const urgentes = pendientes?.resumen?.urgente || 0;
  const canPend  = canalizaciones.filter(c => c.estado === "PENDIENTE").length;

  if (grupos.length === 0) return (
    <AdminLayout>
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">🧑‍🏫</p>
          <p className="text-slate-400">No tienes grupos tutorados asignados.</p>
          <p className="text-slate-500 text-sm mt-1">Contacta al Responsable de Tutoría.</p>
        </div>
      </div>
    </AdminLayout>
  );

  const TABS = [
    { id: "agenda",         label: "Agenda",         badge: urgentes > 0 ? urgentes : null,  badgeColor: "bg-red-500" },
    { id: "alumnos",        label: "Mi Grupo",        badge: null },
    { id: "sesiones",       label: "Sesiones",        badge: null },
    { id: "informe",        label: "Informe F-DC-09", badge: null },
    { id: "canalizaciones", label: "Canalizaciones",  badge: canPend > 0 ? canPend : null, badgeColor: "bg-amber-500" },
  ];

  const onRegistrarSesion = (grupoId) => {
    if (grupoId && grupoSel?.id !== grupoId) {
      const g = grupos.find(x => x.id === grupoId);
      if (g) setGrupoSel(g);
    }
    setModal("sesion");
  };

  const recargarTodo = () => {
    setModal(null);
    cargarPendientes();
    api.get("/tutoria/grupos").then(({ data }) => {
      setGrupos(data);
      const updated = data.find(g => g.id === grupoSel?.id);
      if (updated) setGrupoSel(updated);
    });
    api.get("/tutoria/canalizaciones").then(({ data }) => setCanalizaciones(data)).catch(() => {});
  };

  return (
    <AdminLayout>
      <div className="text-white">
        {/* Encabezado */}
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Mis Tutorados</h1>
            <p className="text-sm text-slate-400">Programa Institucional de Tutorías · P-DC-02 v08</p>
          </div>
          {grupoSel && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setModal("sesion")}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium">
                📋 Registrar Sesión
              </button>
              <button onClick={() => setModal("canalizar")}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium">
                🔔 Nueva Canalización
              </button>
            </div>
          )}
        </div>

        {/* Selector de grupo */}
        {grupos.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {grupos.map(g => (
              <button key={g.id} onClick={() => setGrupoSel(g)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                  grupoSel?.id === g.id
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "border-slate-600 text-slate-400 hover:text-white"
                }`}>
                {g.carrera} · {g.grupo} · {g.periodo}
              </button>
            ))}
          </div>
        )}

        {/* Info del grupo */}
        {grupoSel && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold text-white">{grupoSel.carrera}</p>
                <p className="text-xs text-slate-400">
                  Grupo {grupoSel.grupo} · {grupoSel.cuatrimestre}° cuatrimestre · {grupoSel.periodo}
                </p>
              </div>
              <div className="flex gap-4 text-center">
                <div>
                  <p className="text-xl font-bold text-white">{grupoSel.total_alumnos}</p>
                  <p className="text-xs text-slate-400">Alumnos</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-emerald-400">{grupoSel.sesiones_realizadas}</p>
                  <p className="text-xs text-slate-400">Sesiones</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-slate-800/50 rounded-xl p-1 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                tab === t.id ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
              }`}>
              {t.label}
              {t.badge && (
                <span className={`${t.badgeColor} text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── AGENDA ── */}
        {tab === "agenda" && (
          <TabAgenda
            pendientes={pendientes}
            grupos={grupos}
            onRegistrarSesion={onRegistrarSesion}
            onCanalizar={() => setModal("canalizar")}
          />
        )}

        {/* ── MI GRUPO ── */}
        {tab === "alumnos" && (
          <div className="space-y-3">
            {alumnos.map(a => {
              const sem = a.semaforo_vulnerabilidad;
              const est = a.estado_seguimiento || "SIN_SEGUIMIENTO";
              const isExp = expandido === a.id;
              return (
                <div key={a.id} className={`border rounded-xl p-4 transition-all ${SEMAFORO[sem]?.cls}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap cursor-pointer"
                    onClick={() => setExpandido(isExp ? null : a.id)}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{SEMAFORO[sem]?.emoji}</span>
                      <div>
                        <p className="font-medium text-white">{toTitleCase(a.nombre)}</p>
                        <p className="text-xs text-slate-400">{a.matricula}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${ESTADO_SEG[est]?.cls}`}>
                        {ESTADO_SEG[est]?.label}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600/60 text-slate-500">
                        {SEMAFORO[sem]?.label}
                      </span>
                      <span className="text-slate-500 text-sm">{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isExp && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <PerfilCard perfil={a.perfil_socioeconomico} />
                      {a.estado_observaciones && (
                        <div className="mt-2 p-2 bg-slate-700/40 rounded-lg">
                          <p className="text-xs text-slate-400">Nota del responsable:</p>
                          <p className="text-xs text-slate-300 mt-0.5">{a.estado_observaciones}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {alumnos.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">
                No hay alumnos asignados a este grupo.<br />
                <span className="text-xs">Pide al Responsable de Tutoría que asigne los alumnos.</span>
              </p>
            )}
          </div>
        )}

        {/* ── SESIONES ── */}
        {tab === "sesiones" && grupoSel && (
          <TabSesiones grupoId={grupoSel.id} />
        )}

        {/* ── INFORME BIMESTRAL ── */}
        {tab === "informe" && grupoSel && (
          <InformeBimestral grupo={grupoSel} />
        )}

        {/* ── CANALIZACIONES ── */}
        {tab === "canalizaciones" && (
          <div className="space-y-3">
            {canalizaciones.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">No has levantado canalizaciones.</p>
            )}
            {canalizaciones.map(c => (
              <div key={c.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-white">
                      {c.alumno_nombre} <span className="text-slate-400 text-sm">({c.alumno_matricula})</span>
                    </p>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {c.tipos?.map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">{t}</span>
                      ))}
                      <span className="text-xs text-slate-500">· {c.modalidad}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{c.motivo}</p>
                    {c.descripcion_atencion && (
                      <p className="text-xs text-emerald-400 mt-1">✓ Atendida: {c.descripcion_atencion}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-medium ${ESTADO_CAN[c.estado]?.cls}`}>
                      {ESTADO_CAN[c.estado]?.label}
                    </p>

                    <p className="text-xs text-slate-500 mt-1">
                      {c.fecha_solicitud ? new Date(c.fecha_solicitud).toLocaleDateString("es-MX") : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modales */}
        {modal === "sesion" && grupoSel && (
          <ModalSesion grupo={grupoSel} alumnos={alumnos}
            onClose={() => setModal(null)}
            onGuardado={recargarTodo} />
        )}
        {modal === "canalizar" && grupoSel && (
          <ModalCanalizar alumnos={alumnos} grupoId={grupoSel.id}
            onClose={() => setModal(null)}
            onGuardado={recargarTodo} />
        )}
      </div>
    </AdminLayout>
  );
}
