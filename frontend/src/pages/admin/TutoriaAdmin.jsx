import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../hooks/useApi";
import { useToast } from "../../context/ToastContext";
import AdminLayout from "../../components/AdminLayout";
import { useTheme } from "../../context/ThemeContext";

const SEMAFORO = {
  ALTO:      { label: "Vulnerabilidad Alta",   cls: "bg-red-500/20 text-red-300 border-red-500/40" },
  MEDIO:     { label: "Vulnerabilidad Media",  cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  BAJO:      { label: "Vulnerabilidad Baja",   cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  SIN_DATOS: { label: "Sin datos",             cls: "bg-slate-700/40 text-slate-400 border-slate-600" },
};

const ESTADO_SEG = {
  SIN_SEGUIMIENTO: { label: "Sin seguimiento", cls: "bg-slate-700/50 text-slate-400 border-slate-600" },
  EN_OBSERVACION:  { label: "En observación",  cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  CANALIZADO:      { label: "Canalizado",      cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  ATENDIDO:        { label: "Atendido",        cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  CERRADO:         { label: "Cerrado",         cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
};

const ESTADO_CAN = {
  PENDIENTE:      { label: "Pendiente",      cls: "bg-red-500/20 text-red-300" },
  EN_SEGUIMIENTO: { label: "En seguimiento", cls: "bg-amber-500/20 text-amber-300" },
  ATENDIDA:       { label: "Atendida",       cls: "bg-emerald-500/20 text-emerald-300" },
};

const ESTADO_INF = {
  BORRADOR: { label: "Borrador",  cls: "bg-slate-700/40 text-slate-400" },
  ENVIADO:  { label: "Enviado",   cls: "bg-blue-500/20 text-blue-300" },
  RECIBIDO: { label: "Recibido",  cls: "bg-emerald-500/20 text-emerald-300" },
};

// â”€â”€â”€ Stat Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatCard({ label, value, icon, alert, hint, tone = "slate" }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const tones = {
    slate: isDay ? "bg-white border-slate-200" : "bg-slate-800/60 border-slate-700/50",
    blue: isDay ? "bg-blue-50 border-blue-200" : "bg-blue-950/35 border-blue-500/30",
    emerald: isDay ? "bg-emerald-50 border-emerald-200" : "bg-emerald-950/30 border-emerald-500/30",
    amber: isDay ? "bg-amber-50 border-amber-200" : "bg-amber-950/30 border-amber-500/30",
    red: isDay ? "bg-red-50 border-red-200" : "bg-red-950/30 border-red-500/30",
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${
      alert ? tones.red : tones[tone] || tones.slate
    }`}>
      <span className={`text-xl w-10 h-10 rounded-xl border flex items-center justify-center ${isDay ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-white/5 border-white/10"}`}>{icon}</span>
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${isDay ? "text-slate-950" : "text-white"}`}>{value}</p>
        <p className={`text-xs ${isDay ? "text-slate-600" : "text-slate-400"}`}>{label}</p>
        {hint && <p className={`text-[11px] mt-0.5 truncate ${isDay ? "text-slate-400" : "text-slate-500"}`}>{hint}</p>}
      </div>
    </div>
  );
}

function ActionRow({ tone = "blue", title, detail, action, onClick }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const tones = {
    red: isDay ? "border-red-200 bg-red-50 text-red-600" : "border-red-500/30 bg-red-950/20 text-red-300",
    amber: isDay ? "border-amber-200 bg-amber-50 text-amber-700" : "border-amber-500/30 bg-amber-950/20 text-amber-300",
    blue: isDay ? "border-blue-200 bg-blue-50 text-blue-600" : "border-blue-500/30 bg-blue-950/20 text-blue-300",
    slate: isDay ? "border-slate-200 bg-white text-slate-600" : "border-slate-700/60 bg-slate-800/40 text-slate-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-colors hover:bg-white/5 ${tones[tone] || tones.slate}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${isDay ? "text-slate-950" : "text-white"}`}>{title}</p>
          <p className={`text-xs mt-0.5 ${isDay ? "text-slate-600" : "text-slate-400"}`}>{detail}</p>
        </div>
        <span className="text-xs font-medium shrink-0">{action}</span>
      </div>
    </button>
  );
}

function TutorCumplimientoCard({ tutor, onVerGrupos, onVerInformes }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const tone = {
    VERDE: isDay ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-emerald-500/25 bg-emerald-950/15 text-emerald-300",
    AMARILLO: isDay ? "border-amber-200 bg-amber-50 text-amber-700" : "border-amber-500/25 bg-amber-950/15 text-amber-300",
    ROJO: isDay ? "border-red-200 bg-red-50 text-red-700" : "border-red-500/25 bg-red-950/15 text-red-300",
  }[tutor.semaforo] || (isDay ? "border-slate-200 bg-white text-slate-600" : "border-slate-700/60 bg-slate-800/35 text-slate-300");
  const dot = {
    VERDE: "bg-emerald-400",
    AMARILLO: "bg-amber-400",
    ROJO: "bg-red-400",
  }[tutor.semaforo] || "bg-slate-500";

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
            <p className={`font-semibold truncate ${isDay ? "text-slate-950" : "text-white"}`}>{tutor.tutor_nombre}</p>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{tutor.grupos} grupo(s) · {tutor.alumnos} alumno(s)</p>
        </div>
        <span className={`text-lg font-bold ${isDay ? "text-slate-950" : "text-white"}`}>{tutor.cumplimiento_pct}%</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className={`rounded-lg border px-2 py-1.5 ${isDay ? "bg-white/70 border-slate-200" : "bg-black/15 border-white/10"}`}>
          <p className="text-slate-500">Sesiones</p>
          <p className="text-slate-200">{tutor.sesiones_realizadas}/{tutor.sesiones_esperadas}</p>
        </div>
        <div className={`rounded-lg border px-2 py-1.5 ${isDay ? "bg-white/70 border-slate-200" : "bg-black/15 border-white/10"}`}>
          <p className="text-slate-500">Vencidas</p>
          <p className={tutor.programadas_vencidas > 0 ? "text-red-300" : "text-slate-200"}>{tutor.programadas_vencidas}</p>
        </div>
        <div className={`rounded-lg border px-2 py-1.5 ${isDay ? "bg-white/70 border-slate-200" : "bg-black/15 border-white/10"}`}>
          <p className="text-slate-500">Canaliz.</p>
          <p className={tutor.canalizaciones_abiertas > 0 ? "text-amber-300" : "text-slate-200"}>{tutor.canalizaciones_abiertas}</p>
        </div>
        <div className={`rounded-lg border px-2 py-1.5 ${isDay ? "bg-white/70 border-slate-200" : "bg-black/15 border-white/10"}`}>
          <p className="text-slate-500">Informes</p>
          <p className={tutor.informes_pendientes > 0 ? "text-amber-300" : "text-slate-200"}>{tutor.informes_pendientes}</p>
        </div>
      </div>
      {tutor.alumnos_riesgo_sin_seguimiento > 0 && (
        <p className="text-xs text-red-200 mt-3">{tutor.alumnos_riesgo_sin_seguimiento} alumno(s) de riesgo alto sin seguimiento.</p>
      )}
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={() => onVerGrupos(tutor)}
          className="flex-1 rounded-lg border border-slate-600/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5">
          Ver grupos
        </button>
        <button type="button" onClick={onVerInformes}
          className="flex-1 rounded-lg bg-blue-600/80 px-3 py-1.5 text-xs text-white hover:bg-blue-600">
          Informes
        </button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Modal Crear Grupo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalCrearGrupo({ docentes, onClose, onCreado }) {
  const { toast: showToast } = useToast();
  const [catalogo, setCatalogo] = useState([]);
  const [tutor_id,    setTutorId]   = useState("");
  const [carrera,     setCarrera]   = useState("");
  const [periodo,     setPeriodo]   = useState("");
  const [grupo,       setGrupo]     = useState("");
  const [loading,     setLoading]   = useState(false);

  // Cargar catÃ¡logo para derivar opciones
  useEffect(() => {
    api.get("/catalogo/alumnos").then(({ data }) => setCatalogo(data)).catch(() => {});
  }, []);

  // Valores Ãºnicos derivados del catÃ¡logo en cascada
  const carreras = [...new Set(catalogo.map(a => a.carrera).filter(Boolean))].sort();
  const periodos = [...new Set(
    catalogo.filter(a => !carrera || a.carrera === carrera).map(a => a.periodo).filter(Boolean)
  )].sort().reverse();
  const grupos = [...new Set(
    catalogo.filter(a => (!carrera || a.carrera === carrera) && (!periodo || a.periodo === periodo))
      .map(a => a.grupo).filter(Boolean)
  )].sort();

  // Cuatrimestre: valor mÃ¡s comÃºn entre los alumnos del grupo seleccionado
  const cuatriDerivado = (() => {
    const sub = catalogo.filter(a =>
      a.carrera === carrera && a.periodo === periodo && a.grupo === grupo
    );
    if (!sub.length) return "";
    const freq = {};
    sub.forEach(a => { freq[a.cuatrimestre] = (freq[a.cuatrimestre] || 0) + 1; });
    return String(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
  })();

  // Alumnos que coinciden exactamente (para previsualizaciÃ³n)
  const alumnosGrupo = catalogo.filter(a =>
    a.carrera === carrera && a.periodo === periodo && a.grupo === grupo
  );

  const submit = async () => {
    if (!tutor_id || !carrera || !periodo || !grupo) {
      showToast("Completa todos los campos", "error"); return;
    }
    const cuatrimestre = Number(cuatriDerivado) || 1;
    setLoading(true);
    try {
      const { data: grupoCreado } = await api.post("/tutoria/grupos", {
        tutor_id: Number(tutor_id), carrera, cuatrimestre, grupo, periodo,
      });
      // Auto-asignar alumnos que coinciden con carrera + grupo + periodo
      if (alumnosGrupo.length > 0) {
        await api.post(`/tutoria/grupos/${grupoCreado.id}/alumnos`, {
          alumno_ids: alumnosGrupo.map(a => a.id),
        });
        showToast(`Grupo creado con ${alumnosGrupo.length} alumno(s) asignado(s)`, "success");
      } else {
        showToast("Grupo creado. Asigna alumnos manualmente.", "success");
      }
      onCreado();
    } catch (e) {
      showToast(e.response?.data?.detail || "Error al crear grupo", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-white mb-4">Nuevo grupo tutorado</h3>
        <div className="space-y-3">

          {/* Tutor */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tutor asignado *</label>
            <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              value={tutor_id} onChange={e => setTutorId(e.target.value)}>
              <option value="">Seleccionar docente</option>
              {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>

          {/* Carrera */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Carrera *</label>
            <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              value={carrera} onChange={e => { setCarrera(e.target.value); setPeriodo(""); setGrupo(""); }}>
              <option value="">Seleccionar carrera</option>
              {carreras.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Periodo */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Periodo *</label>
            <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              value={periodo} onChange={e => { setPeriodo(e.target.value); setGrupo(""); }}
              disabled={!carrera}>
              <option value="">Seleccionar periodo</option>
              {periodos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Grupo */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Grupo *</label>
            <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              value={grupo} onChange={e => setGrupo(e.target.value)}
              disabled={!periodo}>
              <option value="">Seleccionar grupo</option>
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* PrevisualizaciÃ³n de alumnos detectados */}
          {grupo && (
            <div className={`rounded-lg px-3 py-2 text-xs border ${
              alumnosGrupo.length > 0
                ? "bg-emerald-900/20 border-emerald-500/30 text-emerald-300"
                : "bg-slate-800 border-slate-600 text-slate-400"
            }`}>
              {alumnosGrupo.length > 0
                ? `Se asignarán automáticamente ${alumnosGrupo.length} alumno(s) del catálogo · Cuatrimestre ${cuatriDerivado}`
                : "No se encontraron alumnos con ese grupo/carrera/periodo en el catálogo"}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800">
            Cancelar
          </button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
            {loading ? "Creando..." : "Crear grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Modal Editar Grupo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalEditarGrupo({ grupo, docentes, onClose, onGuardado }) {
  const { toast: showToast } = useToast();
  const [tutorId,  setTutorId]  = useState(String(grupo.tutor_id));
  const [activo,   setActivo]   = useState(grupo.activo);
  const [loading,  setLoading]  = useState(false);

  const guardar = async () => {
    setLoading(true);
    try {
      await api.put(`/tutoria/grupos/${grupo.id}`, {
        tutor_id: Number(tutorId),
        activo,
      });
      showToast("Grupo actualizado", "success");
      onGuardado();
    } catch (e) {
      showToast(e.response?.data?.detail || "Error al actualizar", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-white mb-1">Editar grupo</h3>
        <p className="text-xs text-slate-400 mb-4">{grupo.carrera} · Grupo {grupo.grupo} · {grupo.periodo}</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tutor asignado</label>
            <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              value={tutorId} onChange={e => setTutorId(e.target.value)}>
              {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 px-1">
            <input type="checkbox" id="activo-chk" checked={activo}
              onChange={e => setActivo(e.target.checked)}
              className="accent-blue-500 w-4 h-4" />
            <label htmlFor="activo-chk" className="text-sm text-slate-300 cursor-pointer">
              Grupo activo
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800">
            Cancelar
          </button>
          <button onClick={guardar} disabled={loading}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Modal Ver Alumnos del Grupo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalVerAlumnos({ grupo, onClose, onVerSeguimiento }) {
  const { toast: showToast } = useToast();
  const [alumnos,    setAlumnos]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [busqueda,   setBusqueda]   = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [nuevoEstado,setNuevoEstado]= useState("");
  const [obsText,    setObsText]    = useState("");
  const [guardando,  setGuardando]  = useState(false);

  const recargar = () => {
    setLoading(true);
    api.get(`/tutoria/grupos/${grupo.id}/alumnos`)
      .then(({ data }) => setAlumnos(data))
      .catch(() => showToast("Error al cargar alumnos", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { recargar(); }, [grupo.id]);

  const SEM_MINI = {
    ALTO:      "bg-red-500/20 text-red-300",
    MEDIO:     "bg-amber-500/20 text-amber-300",
    BAJO:      "bg-emerald-500/20 text-emerald-300",
    SIN_DATOS: "bg-slate-700 text-slate-400",
  };

  const filtrados = alumnos.filter(a =>
    `${a.matricula} ${a.nombre}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  const abrirEdicion = (a) => {
    setEditandoId(a.asignacion_id);
    setNuevoEstado(a.estado_seguimiento || "SIN_SEGUIMIENTO");
    setObsText(a.estado_observaciones || "");
  };

  const guardarEstado = async (a) => {
    setGuardando(true);
    try {
      await api.put(`/tutoria/asignaciones/${a.asignacion_id}/estado`, {
        estado: nuevoEstado, observaciones: obsText || null,
      });
      showToast("Estado actualizado", "success");
      setEditandoId(null);
      recargar();
    } catch { showToast("Error al guardar", "error"); }
    finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl flex flex-col" style={{maxHeight:"88vh"}}>
        <div className="p-5 border-b border-slate-700 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Alumnos del Grupo</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {grupo.carrera} · Grupo {grupo.grupo} · {grupo.periodo} · {alumnos.length} alumno(s)
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-5 pt-4 pb-2">
          <input type="text" placeholder="Buscar por matrícula o nombre..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 text-sm"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2 mt-2">
          {loading && <p className="text-slate-500 text-sm text-center py-6">Cargando...</p>}
          {!loading && filtrados.map(a => {
            const semCls  = SEM_MINI[a.semaforo_vulnerabilidad] || SEM_MINI.SIN_DATOS;
            const estInfo = ESTADO_SEG[a.estado_seguimiento] || ESTADO_SEG.SIN_SEGUIMIENTO;
            const enEdicion = editandoId === a.asignacion_id;
            return (
              <div key={a.id} className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-3 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{a.nombre}</p>
                    <p className="text-xs text-slate-400">{a.matricula}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${semCls}`}>
                    {a.semaforo_vulnerabilidad?.replace("SIN_DATOS","Sin datos") || "Sin datos"}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${estInfo.cls}`}>
                    {estInfo.label}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    {onVerSeguimiento && (
                      <button onClick={() => onVerSeguimiento(a.id)}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-blue-600/80 hover:bg-blue-600 text-white">
                        Historial
                      </button>
                    )}
                    <button onClick={() => enEdicion ? setEditandoId(null) : abrirEdicion(a)}
                      className="text-[11px] px-2 py-0.5 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700">
                      {enEdicion ? "Cancelar" : "Estado"}
                    </button>
                  </div>
                </div>

                {/* Inline estado editor */}
                {enEdicion && (
                  <div className="mt-3 border-t border-slate-700/50 pt-3 space-y-2">
                    <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white">
                      {Object.entries(ESTADO_SEG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <textarea rows={2} placeholder="Observaciones (opcional)"
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-300 resize-none"
                      value={obsText} onChange={e => setObsText(e.target.value)} />
                    <button onClick={() => guardarEstado(a)} disabled={guardando}
                      className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
                      {guardando ? "Guardando..." : "Guardar estado"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!loading && filtrados.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-6">
              {alumnos.length === 0 ? "No hay alumnos asignados a este grupo." : "Sin resultados"}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-700">
          <button onClick={onClose}
            className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Modal Importar SocioeconÃ³mico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalImportar({ onClose }) {
  const { toast: showToast } = useToast();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const importar = async () => {
    if (!file) { showToast("Selecciona un archivo", "error"); return; }
    setLoading(true);
    const periodo = document.getElementById("periodo-import")?.value?.trim() || "";
    const fd = new FormData();
    fd.append("file", file);
    const url = "/tutoria/perfil-socioeconomico/importar" + (periodo ? `?periodo=${encodeURIComponent(periodo)}` : "");
    try {
      const { data } = await api.post(url, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setResultado(data);
      const cat = data.creados_catalogo > 0 ? `, ${data.creados_catalogo} en catálogo` : "";
      showToast(`Perfiles: ${data.creados} nuevos, ${data.actualizados} actualizados${cat}`, "success");
    } catch (e) {
      showToast(e.response?.data?.detail || "Error al importar", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-white mb-2">Importar estudio socioeconómico</h3>
        <p className="text-xs text-slate-400 mb-4">
          Archivo Excel generado por Servicios Escolares. Los alumnos nuevos se agregan automáticamente al catálogo.
        </p>
        {!resultado ? (
          <>
            <div className="mb-3">
              <label className="block text-xs text-slate-400 mb-1">Periodo académico <span className="text-slate-600">(opcional, ej: MAY-AGO 2025)</span></label>
              <input type="text" placeholder="MAY-AGO 2025"
                id="periodo-import"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 text-sm"
              />
            </div>
            <input type="file" accept=".xlsx,.xls"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 text-sm mb-4"
              onChange={e => setFile(e.target.files[0])} />
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm">
                Cancelar
              </button>
              <button onClick={importar} disabled={loading}
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
                {loading ? "Importando..." : "Importar"}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Perfiles nuevos", resultado.creados,          "text-emerald-400"],
                ["Actualizados",    resultado.actualizados,     "text-blue-400"],
                ["En catálogo",     resultado.creados_catalogo, "text-violet-400"],
                ["Errores",         resultado.total_errores,    "text-red-400"],
              ].map(([l, v, c]) => (
                <div key={l} className="bg-slate-800 rounded-lg p-3 text-center">
                  <p className={`text-xl font-bold ${c}`}>{v ?? 0}</p>
                  <p className="text-xs text-slate-400">{l}</p>
                </div>
              ))}
            </div>
            {resultado.errores?.length > 0 && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 max-h-32 overflow-y-auto">
                {resultado.errores.map((e, i) => (
                  <p key={i} className="text-xs text-red-300">Fila {e.fila}: {e.matricula} - {e.error}</p>
                ))}
              </div>
            )}
            <button onClick={onClose} className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm mt-2">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Modal Atender CanalizaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalAtenderCan({ can, onClose, onAtendida }) {
  const { toast: showToast } = useToast();
  const [form, setForm] = useState({ area_atencion: "", tipo_servicio: "", fecha_atencion: "", descripcion_atencion: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.area_atencion || !form.tipo_servicio || !form.fecha_atencion || !form.descripcion_atencion) {
      showToast("Completa todos los campos", "error"); return;
    }
    setLoading(true);
    try {
      await api.put(`/tutoria/canalizaciones/${can.id}/atender`, form);
      showToast("Canalización marcada como atendida", "success");
      onAtendida();
    } catch { showToast("Error al guardar", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-white mb-1">Atender canalización</h3>
        <p className="text-sm text-slate-400 mb-4">
          Alumno: <span className="text-white font-medium">{can.alumno_nombre}</span> · {can.alumno_matricula}
        </p>
        <p className="text-xs text-slate-500 mb-3">Motivo: {can.motivo}</p>
        <div className="space-y-3">
          {[["area_atencion", "Área que atendió *", "Psicología, Trabajo Social..."],
            ["tipo_servicio", "Tipo de servicio *", "Orientación individual"],
            ["fecha_atencion", "Fecha de atención *", ""],
            ["descripcion_atencion", "Descripción de la atención *", "Resumen..."],
          ].map(([k, lbl, ph]) => (
            <div key={k}>
              <label className="text-xs text-slate-400 mb-1 block">{lbl}</label>
              {k === "descripcion_atencion" ? (
                <textarea rows={3} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
                  placeholder={ph} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              ) : (
                <input type={k === "fecha_atencion" ? "date" : "text"}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder={ph} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm">Cancelar</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
            {loading ? "Guardando..." : "Marcar atendida"}
          </button>
        </div>
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PÃGINA PRINCIPAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ─── Modal historial completo del alumno ─────────────────────────────────────
function ModalSeguimientoAlumno({ alumnoId, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [seccion, setSeccion] = useState("sesiones"); // sesiones | canalizaciones | evolucion | informes | ficha | perfil

  useEffect(() => {
    api.get(`/tutoria/alumno/${alumnoId}/seguimiento`)
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  }, [alumnoId]);

  const semInfo = data ? (SEMAFORO[data.semaforo_vulnerabilidad] || SEMAFORO.SIN_DATOS) : SEMAFORO.SIN_DATOS;

  const ESTADO_CAN_MODAL = {
    PENDIENTE:      { label: "Pendiente",      cls: "bg-red-500/20 text-red-300" },
    EN_SEGUIMIENTO: { label: "En seguimiento", cls: "bg-amber-500/20 text-amber-300" },
    ATENDIDA:       { label: "Atendida",       cls: "bg-emerald-500/20 text-emerald-300" },
  };

  const fmtPerfil = (k, v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v ? "Sí" : "No";
    if (k === "ingreso_familiar_mensual") return `$${Number(v).toLocaleString("es-MX")}`;
    return String(v);
  };

  const PERFIL_LABELS = {
    ingreso_familiar_mensual:   "Ingreso familiar",
    promedio_bachillerato:      "Prom. bachillerato",
    trabaja:                    "Trabaja",
    tiene_hijos:                "Tiene hijos",
    num_hijos:                  "N.° hijos",
    tiene_enfermedad_cronica:   "Enf. crónica",
    tiene_discapacidad:         "Discapacidad",
    recibe_apoyo_institucional: "Apoyo institucional",
    habla_lengua_indigena:      "Lengua indígena",
  };

  const FICHA_SECCIONES = [
    {
      titulo: "Datos generales",
      campos: [
        ["matricula", "Matrícula", data?.alumno?.matricula],
        ["nombre", "Nombre completo", data?.alumno?.nombre],
        ["carrera", "Carrera", data?.alumno?.carrera],
        ["cuatrimestre", "Cuatrimestre", data?.alumno?.cuatrimestre],
        ["grupo", "Grupo", data?.alumno?.grupo],
        ["periodo", "Periodo", data?.alumno?.periodo],
      ],
    },
    {
      titulo: "Contacto y origen",
      campos: [
        ["telefono", "Teléfono", data?.perfil_socioeconomico?.telefono],
        ["domicilio_residencia", "Domicilio de residencia", data?.perfil_socioeconomico?.domicilio_residencia],
        ["domicilio_procedencia", "Domicilio de procedencia", data?.perfil_socioeconomico?.domicilio_procedencia],
        ["lugar_nacimiento", "Lugar de nacimiento", data?.perfil_socioeconomico?.lugar_nacimiento],
        ["sexo", "Sexo", data?.perfil_socioeconomico?.sexo],
        ["estado_civil", "Estado civil", data?.perfil_socioeconomico?.estado_civil],
      ],
    },
    {
      titulo: "Antecedentes académicos",
      campos: [
        ["escuela_procedencia", "Escuela de procedencia", data?.perfil_socioeconomico?.escuela_procedencia],
        ["promedio_bachillerato", "Promedio bachillerato", data?.perfil_socioeconomico?.promedio_bachillerato],
        ["area_bachillerato", "Área de bachillerato", data?.perfil_socioeconomico?.area_bachillerato],
      ],
    },
    {
      titulo: "Situación socioeconómica",
      campos: [
        ["ingreso_familiar_mensual", "Ingreso familiar mensual", fmtPerfil("ingreso_familiar_mensual", data?.perfil_socioeconomico?.ingreso_familiar_mensual)],
        ["recibe_apoyo_institucional", "Recibe apoyo institucional", fmtPerfil("recibe_apoyo_institucional", data?.perfil_socioeconomico?.recibe_apoyo_institucional)],
        ["institucion_apoyo", "Institución de apoyo", data?.perfil_socioeconomico?.institucion_apoyo],
        ["trabaja", "Trabaja", fmtPerfil("trabaja", data?.perfil_socioeconomico?.trabaja)],
        ["empresa", "Empresa", data?.perfil_socioeconomico?.empresa],
        ["tiene_hijos", "Tiene hijos", fmtPerfil("tiene_hijos", data?.perfil_socioeconomico?.tiene_hijos)],
        ["num_hijos", "Número de hijos", data?.perfil_socioeconomico?.num_hijos],
      ],
    },
    {
      titulo: "Salud y condiciones relevantes",
      campos: [
        ["tiene_alergia", "Tiene alergia", fmtPerfil("tiene_alergia", data?.perfil_socioeconomico?.tiene_alergia)],
        ["medicamento_alergia", "Medicamento por alergia", data?.perfil_socioeconomico?.medicamento_alergia],
        ["tiene_enfermedad_cronica", "Enfermedad crónica", fmtPerfil("tiene_enfermedad_cronica", data?.perfil_socioeconomico?.tiene_enfermedad_cronica)],
        ["diabetes", "Diabetes", fmtPerfil("diabetes", data?.perfil_socioeconomico?.diabetes)],
        ["hipertension", "Hipertensión", fmtPerfil("hipertension", data?.perfil_socioeconomico?.hipertension)],
        ["hemofilia", "Hemofilia", fmtPerfil("hemofilia", data?.perfil_socioeconomico?.hemofilia)],
        ["problemas_cardiacos", "Problemas cardíacos", fmtPerfil("problemas_cardiacos", data?.perfil_socioeconomico?.problemas_cardiacos)],
        ["otra_enfermedad", "Otra enfermedad", data?.perfil_socioeconomico?.otra_enfermedad],
        ["medicamento_enfermedad", "Medicamento por enfermedad", data?.perfil_socioeconomico?.medicamento_enfermedad],
        ["tiene_discapacidad", "Tiene discapacidad", fmtPerfil("tiene_discapacidad", data?.perfil_socioeconomico?.tiene_discapacidad)],
        ["otra_discapacidad", "Otra discapacidad", data?.perfil_socioeconomico?.otra_discapacidad],
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="p-5 border-b border-slate-700 flex items-start justify-between">
          {loading ? (
            <div>
              <p className="text-slate-400 text-sm">Cargando historial...</p>
            </div>
          ) : data ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-white">{data.alumno.nombre}</h3>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${semInfo.cls}`}>
                  {semInfo.label}
                </span>
                {data.estado_seguimiento && (() => {
                  const est = ESTADO_SEG[data.estado_seguimiento] || ESTADO_SEG.SIN_SEGUIMIENTO;
                  return (
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${est.cls}`}>
                      {est.label}
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{data.alumno.matricula} · {data.alumno.carrera} · Grupo {data.alumno.grupo}</p>
              <div className="flex gap-4 mt-2 text-xs text-slate-500">
                <span>📋 <strong className="text-slate-300">{data.total_sesiones}</strong> sesiones</span>
                <span>✅ <strong className="text-emerald-400">{data.total_asistencias}</strong> asistencias</span>
                <span>❌ <strong className="text-red-400">{data.total_inasistencias}</strong> inasistencias</span>
                <span>🔴 <strong className="text-purple-400">{data.canalizaciones.length}</strong> canalizaciones</span>
              </div>
            </div>
          ) : <p className="text-slate-400 text-sm">Alumno no encontrado</p>}
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none ml-3 mt-0.5 shrink-0">×</button>
        </div>

        {/* Tabs internas */}
        {!loading && data && (
          <>
            <div className="flex gap-1 px-5 pt-4">
              {[
                { id: "sesiones",       label: `Sesiones (${data.total_sesiones})` },
                { id: "canalizaciones", label: `Canalizaciones (${data.canalizaciones.length})` },
                { id: "evolucion",      label: `Evolución (${(data.evolucion_seguimiento || []).length})` },
                { id: "informes",       label: `Informes (${(data.informes || []).length})` },
                { id: "trayectoria",    label: `Trayectoria (${(data.grupos_historial || []).length})` },
                { id: "documentos",     label: `Documentos (${(data.documentos_generados || []).length})` },
                { id: "ficha",          label: "Ficha completa" },
                { id: "perfil",         label: "Perfil socioeconómico" },
              ].map(t => (
                <button key={t.id} onClick={() => setSeccion(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    seccion === t.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 pt-3 space-y-2">

              {/* Sesiones */}
              {seccion === "sesiones" && (
                data.sesiones.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">Sin sesiones registradas.</p>
                ) : data.sesiones.map((s, i) => (
                  <div key={i} className={`rounded-xl border px-4 py-3 ${
                    s.asistio === true  ? "border-emerald-500/20 bg-emerald-950/10" :
                    s.asistio === false ? "border-red-500/20 bg-red-950/10" :
                    "border-slate-700/40 bg-slate-800/30"
                  }`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {s.fecha ? new Date(s.fecha).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Sin fecha"}
                          <span className="text-xs text-slate-500 ml-2">{s.tipo_sesion}</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Grupo {s.grupo} · {s.periodo} · {s.tutor_nombre}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {s.asistio === true  && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">✓ Asistió</span>}
                        {s.asistio === false && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">✗ Falta</span>}
                        {s.asistio === null  && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Sin registro</span>}
                        {s.tipos_atencion?.map(t => (
                          <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">{t}</span>
                        ))}
                        {s.requiere_canalizacion && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">Canalización</span>
                        )}
                      </div>
                    </div>
                    {(s.tema || s.comentarios || s.acciones_preventivas) && (
                      <div className="mt-2 space-y-0.5 text-xs text-slate-400 border-t border-slate-700/40 pt-2">
                        {s.tema && <p><span className="text-slate-500">Tema:</span> {s.tema}</p>}
                        {s.acciones_preventivas && <p><span className="text-slate-500">Acciones:</span> {s.acciones_preventivas}</p>}
                        {s.comentarios && <p><span className="text-slate-500">Comentarios:</span> {s.comentarios}</p>}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Canalizaciones */}
              {seccion === "canalizaciones" && (
                data.canalizaciones.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">Sin canalizaciones registradas.</p>
                ) : data.canalizaciones.map(c => (
                  <div key={c.id} className="rounded-xl border border-slate-700/40 bg-slate-800/40 px-4 py-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex gap-2 flex-wrap mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_CAN_MODAL[c.estado]?.cls}`}>
                            {ESTADO_CAN_MODAL[c.estado]?.label}
                          </span>
                          {c.tipos?.map(t => <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">{t}</span>)}
                        </div>
                        <p className="text-xs text-slate-400">
                          {c.fecha_solicitud ? new Date(c.fecha_solicitud).toLocaleDateString("es-MX") : ""}
                          {c.tutor_nombre ? ` · Tutor: ${c.tutor_nombre}` : ""}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">{c.motivo}</p>
                      </div>
                    </div>
                    {c.descripcion_atencion && (
                      <div className="mt-2 border-t border-slate-700/40 pt-2 text-xs text-slate-400">
                        <p><span className="text-slate-500">Área:</span> {c.area_atencion}</p>
                        <p><span className="text-slate-500">Atención:</span> {c.descripcion_atencion}</p>
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Informes donde aparece */}
              {seccion === "informes" && (() => {
                const informes = data.informes || [];
                if (informes.length === 0) return (
                  <p className="text-slate-500 text-sm text-center py-8">
                    Este alumno aún no aparece en informes bimestrales.
                  </p>
                );
                return informes.map((inf, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-700/40 bg-slate-800/40 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-white">{inf.categoria}</p>
                        <p className="text-xs text-slate-500">
                          {inf.carrera} · Grupo {inf.grupo} · {inf.periodo} · B{inf.bimestre}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_INF[inf.estado]?.cls || "bg-slate-700 text-slate-400"}`}>
                        {ESTADO_INF[inf.estado]?.label || inf.estado}
                      </span>
                    </div>
                    {inf.detalle && <p className="text-xs text-slate-300 mt-2">{inf.detalle}</p>}
                  </div>
                ));
              })()}

              {seccion === "trayectoria" && (() => {
                const grupos = data.grupos_historial || [];
                if (grupos.length === 0) return <p className="text-slate-500 text-sm text-center py-8">Sin trayectoria tutorial registrada.</p>;
                return grupos.map((g, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-700/40 bg-slate-800/40 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-white">{g.carrera} · Grupo {g.grupo}</p>
                        <p className="text-xs text-slate-500">{g.periodo} · {g.cuatrimestre}° cuatrimestre · Tutor: {g.tutor_nombre || "Sin tutor"}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${g.activo ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>
                        {g.activo ? "Actual" : "Histórico"}
                      </span>
                    </div>
                  </div>
                ));
              })()}

              {seccion === "documentos" && (() => {
                const docs = data.documentos_generados || [];
                if (docs.length === 0) return <p className="text-slate-500 text-sm text-center py-8">Aún no hay documentos generados para este alumno.</p>;
                return docs.map((d, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-700/40 bg-slate-800/40 px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{d.codigo} v{d.version}</p>
                      <p className="text-xs text-slate-500">{d.tipo} · {d.referencia}</p>
                    </div>
                    <span className="text-xs text-slate-500">{d.fecha ? new Date(d.fecha).toLocaleDateString("es-MX") : "Sin fecha"}</span>
                  </div>
                ));
              })()}

              {/* Evolución del seguimiento */}
              {seccion === "evolucion" && (() => {
                const ev = data.evolucion_seguimiento || [];
                if (ev.length === 0) return (
                  <p className="text-slate-500 text-sm text-center py-8">
                    Sin cambios de estado registrados. El primer cambio aparecerá aquí.
                  </p>
                );
                return (
                  <div className="relative pl-6">
                    {/* Línea vertical de la timeline */}
                    <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-700/60" />
                    <div className="space-y-4">
                      {ev.map((h, i) => {
                        const estAnterior = ESTADO_SEG[h.estado_anterior] || { label: "—", cls: "bg-slate-700 text-slate-400" };
                        const estNuevo    = ESTADO_SEG[h.estado_nuevo]    || { label: h.estado_nuevo, cls: "bg-slate-700 text-slate-400" };
                        const esMasReciente = i === ev.length - 1;
                        return (
                          <div key={h.id} className="relative flex gap-3">
                            {/* Punto en la línea */}
                            <div className={`absolute -left-6 mt-1.5 w-[10px] h-[10px] rounded-full border-2 border-slate-900 ${
                              esMasReciente ? "bg-blue-400" : "bg-slate-600"
                            }`} />
                            <div className={`flex-1 rounded-xl border px-4 py-3 ${
                              esMasReciente
                                ? "border-blue-500/30 bg-blue-950/15"
                                : "border-slate-700/40 bg-slate-800/30"
                            }`}>
                              {/* Cabecera: estados */}
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                {h.estado_anterior ? (
                                  <>
                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${estAnterior.cls}`}>
                                      {estAnterior.label}
                                    </span>
                                    <span className="text-slate-500 text-xs">→</span>
                                  </>
                                ) : (
                                  <span className="text-xs text-slate-500 italic">Primer estado asignado</span>
                                )}
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${estNuevo.cls}`}>
                                  {estNuevo.label}
                                </span>
                              </div>
                              {/* Observación */}
                              {h.observacion && (
                                <p className="text-xs text-slate-300 mt-1 italic">"{h.observacion}"</p>
                              )}
                              {/* Pie: quién y cuándo */}
                              <p className="text-[11px] text-slate-500 mt-1.5">
                                {h.responsable}
                                {h.creado_en && (
                                  <> · {new Date(h.creado_en).toLocaleString("es-MX", {
                                    day: "numeric", month: "short", year: "numeric",
                                    hour: "2-digit", minute: "2-digit"
                                  })}</>
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Ficha completa */}
              {seccion === "ficha" && (
                !data.perfil_socioeconomico ? (
                  <p className="text-slate-500 text-sm text-center py-8">No hay ficha socioeconómica registrada.</p>
                ) : (
                  <div className="space-y-4">
                    {FICHA_SECCIONES.map(sec => (
                      <section key={sec.titulo} className="rounded-xl border border-slate-700/50 bg-slate-800/25 p-4">
                        <h3 className="text-sm font-semibold text-white mb-3">{sec.titulo}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {sec.campos.map(([key, label, value]) => {
                            const visible = value !== null && value !== undefined && String(value).trim() !== "";
                            return (
                              <div key={key} className="rounded-lg bg-slate-900/45 px-3 py-2">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                                <p className={`text-sm mt-0.5 ${visible ? "text-slate-100" : "text-slate-600 italic"}`}>
                                  {visible ? String(value) : "Sin dato"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                    {data.perfil_socioeconomico.informacion_relevante && (
                      <section className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
                        <h3 className="text-sm font-semibold text-amber-200">Información relevante</h3>
                        <p className="text-sm text-slate-300 mt-1">{data.perfil_socioeconomico.informacion_relevante}</p>
                      </section>
                    )}
                  </div>
                )
              )}

              {/* Perfil socioeconómico */}
              {seccion === "perfil" && (
                !data.perfil_socioeconomico ? (
                  <p className="text-slate-500 text-sm text-center py-8">No hay estudio socioeconómico registrado.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(PERFIL_LABELS).map(([k, lbl]) => {
                      const v = fmtPerfil(k, data.perfil_socioeconomico[k]);
                      if (!v) return null;
                      return (
                        <div key={k} className="bg-slate-800/50 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-slate-500 uppercase">{lbl}</p>
                          <p className="text-sm font-medium text-white mt-0.5">{v}</p>
                        </div>
                      );
                    })}
                    {data.perfil_socioeconomico.informacion_relevante && (
                      <div className="col-span-2 sm:col-span-3 bg-slate-800/50 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-slate-500 uppercase">Información relevante</p>
                        <p className="text-sm text-slate-300 mt-0.5">{data.perfil_socioeconomico.informacion_relevante}</p>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </>
        )}

        <div className="p-4 border-t border-slate-700">
          <button onClick={onClose}
            className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta alumno en riesgo ──────────────────────────────────────────────────
function AlumnoRiesgoCard({ alumno, onVerSeguimiento }) {
  const [expandido, setExpandido] = useState(false);
  // Backend returns semaforo_vulnerabilidad and perfil_socioeconomico
  const sem   = alumno.semaforo_vulnerabilidad || "SIN_DATOS";
  const perfil = alumno.perfil_socioeconomico;
  const semInfo = SEMAFORO[sem] || SEMAFORO.SIN_DATOS;

  const PERFIL_LABELS = {
    ingreso_familiar_mensual:   "Ingreso familiar",
    promedio_bachillerato:      "Promedio bachillerato",
    trabaja:                    "Trabaja",
    tiene_hijos:                "Tiene hijos",
    tiene_enfermedad_cronica:   "Enfermedad crónica",
    tiene_discapacidad:         "Discapacidad",
    recibe_apoyo_institucional: "Apoyo institucional",
    habla_lengua_indigena:      "Lengua indígena",
  };

  const fmt = (k, v) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Sí" : "No";
    if (k === "ingreso_familiar_mensual" && v) return `$${Number(v).toLocaleString("es-MX")}`;
    return String(v);
  };

  const alertKeys = new Set(["tiene_hijos", "tiene_enfermedad_cronica", "tiene_discapacidad"]);

  return (
    <div className={`rounded-xl border transition-all ${
      sem === "ALTO"  ? "border-red-500/30 bg-red-950/10" :
      sem === "MEDIO" ? "border-amber-500/30 bg-amber-950/10" :
      sem === "BAJO"  ? "border-emerald-500/20 bg-emerald-950/5" :
      "border-slate-700/50 bg-slate-800/30"
    }`}>
      <div className="p-4 flex items-start gap-3 flex-wrap">
        <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold border ${semInfo.cls}`}>
          {semInfo.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm">{alumno.nombre}</p>
          <p className="text-xs text-slate-400">{alumno.matricula}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {alumno.carrera} · Grupo {alumno.grupo} · {alumno.periodo}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center text-xs text-slate-400 shrink-0">
          <span>
            <span className="text-slate-600">Tutor: </span>
            <span className="text-slate-300">{alumno.tutor_nombre || "—"}</span>
          </span>
          {alumno.canalizaciones_activas > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
              {alumno.canalizaciones_activas} canalización(es) activa(s)
            </span>
          )}
          {alumno.ultima_asistencia && (
            <span>Asistencia: {new Date(alumno.ultima_asistencia).toLocaleDateString("es-MX")}</span>
          )}
        </div>
        <div className="flex gap-2 shrink-0 items-center">
          <button onClick={() => onVerSeguimiento && onVerSeguimiento(alumno.id)}
            className="text-xs px-2.5 py-1 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white font-medium transition-colors">
            Ver seguimiento
          </button>
          {perfil ? (
            <button onClick={() => setExpandido(v => !v)}
              className="text-xs text-slate-400 hover:text-white transition-colors">
              {expandido ? "▲ Perfil" : "▼ Perfil"}
            </button>
          ) : (
            <span className="text-xs text-slate-600">Sin perfil</span>
          )}
        </div>
      </div>

      {expandido && perfil && (
        <div className="border-t border-slate-700/40 px-4 pb-4 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Perfil socioeconómico</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(PERFIL_LABELS).map(([k, lbl]) =>
              perfil[k] !== null && perfil[k] !== undefined ? (
                <div key={k} className="bg-slate-800/50 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">{lbl}</p>
                  <p className={`text-sm font-medium mt-0.5 ${
                    alertKeys.has(k) && perfil[k] ? "text-amber-300" :
                    k === "trabaja" && perfil[k]  ? "text-blue-300" :
                    "text-white"
                  }`}>
                    {fmt(k, perfil[k])}
                  </p>
                </div>
              ) : null
            )}
            {perfil.informacion_relevante && (
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 bg-slate-800/50 rounded-lg px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Información relevante</p>
                <p className="text-sm text-slate-300 mt-0.5">{perfil.informacion_relevante}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TutoriaAdmin() {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const { toast: showToast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [dash, setDash] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [canalizaciones, setCanalizaciones] = useState([]);
  const [informes, setInformes] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [modal, setModal] = useState(null); // null | "grupo" | "importar" | {type:"atender", can}
  const [filtroEstadoCan, setFiltroEstadoCan] = useState("PENDIENTE");
  const [filtroCarrera, setFiltroCarrera] = useState("");
  const [filtroPeriodo, setFiltroPeriodo] = useState("");
  const [filtroTutor, setFiltroTutor] = useState("");
  const [alumnosRiesgo, setAlumnosRiesgo] = useState([]);
  const [filtroSemaforo, setFiltroSemaforo] = useState("");
  const [alertas, setAlertas] = useState([]);
  const [reporteGeneral, setReporteGeneral] = useState([]);
  const [busquedaReporte, setBusquedaReporte] = useState("");
  const [modalSeguimiento, setModalSeguimiento] = useState(null); // alumno_id | null
  const [cierres, setCierres] = useState([]);
  const [cierrePeriodo, setCierrePeriodo] = useState("");
  const [cierreBimestre, setCierreBimestre] = useState("1");
  const [cierreResumen, setCierreResumen] = useState(null);
  const [cierreObs, setCierreObs] = useState("");
  const [cierreLoading, setCierreLoading] = useState(false);
  const [programaciones, setProgramaciones] = useState([]);
  const [documentosCtrl, setDocumentosCtrl] = useState([]);
  const [nuevaProg, setNuevaProg] = useState({ grupo_tutorado_id: "", fecha_programada: "", tipo_sesion: "GRUPAL", objetivo: "" });

  const carrerasDisponibles = useMemo(
    () => [...new Set(grupos.map(g => g.carrera).filter(Boolean))].sort(),
    [grupos]
  );
  const periodosDisponibles = useMemo(
    () => [...new Set(grupos.map(g => g.periodo).filter(Boolean))].sort().reverse(),
    [grupos]
  );
  const tutoresDisponibles = useMemo(
    () => [...new Map(grupos.filter(g => g.tutor_id).map(g => [g.tutor_id, g.tutor_nombre])).entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")),
    [grupos]
  );
  const reporteGeneralFiltrado = useMemo(() => {
    const q = busquedaReporte.trim().toLowerCase();
    if (!q) return reporteGeneral;
    return reporteGeneral.filter(r => [
      r.matricula,
      r.nombre,
      r.carrera,
      r.grupo,
      r.periodo,
      r.tutor_nombre,
      r.estado_seguimiento,
      r.semaforo_vulnerabilidad,
    ].some(v => String(v || "").toLowerCase().includes(q)));
  }, [reporteGeneral, busquedaReporte]);

  const cargarDash = useCallback(async () => {
    try {
      const { data } = await api.get("/tutoria/dashboard");
      setDash(data);
    } catch {
      showToast("Error al cargar el panel de tutoría", "error");
    }
  }, [showToast]);

  const cargarGrupos = useCallback(async () => {
    try {
      const { data } = await api.get("/tutoria/grupos");
      setGrupos(data);
    } catch {
      showToast("Error al cargar grupos tutorados", "error");
    }
  }, [showToast]);

  const cargarCanalizaciones = useCallback(async () => {
    try {
      const params = filtroEstadoCan !== "TODAS" ? `?estado=${filtroEstadoCan}` : "";
      const { data } = await api.get(`/tutoria/canalizaciones${params}`);
      setCanalizaciones(data);
    } catch {
      showToast("Error al cargar canalizaciones", "error");
    }
  }, [filtroEstadoCan, showToast]);

  const cargarInformes = useCallback(async () => {
    try {
      const { data } = await api.get("/tutoria/informes");
      setInformes(data);
    } catch {
      showToast("Error al cargar informes", "error");
    }
  }, [showToast]);

  const cargarDocentes = useCallback(async () => {
    try {
      const { data } = await api.get("/usuarios?rol=DOCENTE");
      setDocentes(data);
    } catch {
      showToast("Error al cargar docentes", "error");
    }
  }, [showToast]);

  const cargarAlertas = useCallback(async () => {
    try {
      const { data } = await api.get("/tutoria/alertas");
      setAlertas(data);
    } catch { /* silencioso */ }
  }, []);

  const cargarReporteGeneral = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filtroCarrera)  params.append("carrera",  filtroCarrera);
      if (filtroPeriodo)  params.append("periodo",  filtroPeriodo);
      if (filtroTutor)    params.append("tutor_id", filtroTutor);
      if (filtroSemaforo) params.append("semaforo", filtroSemaforo);
      const { data } = await api.get(`/tutoria/reporte-general?${params.toString()}`);
      setReporteGeneral(data);
    } catch {
      showToast("Error al cargar el reporte general", "error");
    }
  }, [filtroCarrera, filtroPeriodo, filtroTutor, filtroSemaforo, showToast]);

  const cargarAlumnosRiesgo = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filtroSemaforo) params.append("semaforo", filtroSemaforo);
      if (filtroCarrera)  params.append("carrera",  filtroCarrera);
      if (filtroPeriodo)  params.append("periodo",  filtroPeriodo);
      if (filtroTutor)    params.append("tutor_id", filtroTutor);
      const qs = params.toString();
      const { data } = await api.get(`/tutoria/alumnos-riesgo${qs ? "?" + qs : ""}`);
      setAlumnosRiesgo(data);
    } catch {
      showToast("Error al cargar alumnos en riesgo", "error");
    }
  }, [filtroSemaforo, filtroCarrera, filtroPeriodo, filtroTutor, showToast]);

  const cargarProgramaciones = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filtroPeriodo) params.append("periodo", filtroPeriodo);
      const { data } = await api.get(`/tutoria/programaciones?${params.toString()}`);
      setProgramaciones(data);
    } catch {
      showToast("Error al cargar programación de tutoría", "error");
    }
  }, [filtroPeriodo, showToast]);

  const cargarDocumentosCtrl = useCallback(async () => {
    try {
      const { data } = await api.get("/tutoria/documentos-controlados");
      setDocumentosCtrl(data);
    } catch {
      showToast("Error al cargar documentos controlados", "error");
    }
  }, [showToast]);

  const cargarCierres = useCallback(async () => {
    try {
      const qs = cierrePeriodo ? `?periodo=${encodeURIComponent(cierrePeriodo)}` : "";
      const { data } = await api.get(`/tutoria/cierres${qs}`);
      setCierres(data);
    } catch {
      showToast("Error al cargar cierres de tutoría", "error");
    }
  }, [cierrePeriodo, showToast]);

  const cargarResumenCierre = useCallback(async () => {
    const periodo = cierrePeriodo || periodosDisponibles[0];
    if (!periodo) {
      showToast("Selecciona un periodo para previsualizar el cierre", "error");
      return;
    }
    setCierrePeriodo(periodo);
    setCierreLoading(true);
    try {
      const params = new URLSearchParams({ periodo });
      if (cierreBimestre) params.append("bimestre", cierreBimestre);
      const { data } = await api.get(`/tutoria/cierres/resumen?${params.toString()}`);
      setCierreResumen(data);
    } catch {
      showToast("Error al previsualizar el cierre", "error");
    } finally {
      setCierreLoading(false);
    }
  }, [cierrePeriodo, cierreBimestre, periodosDisponibles, showToast]);

  const registrarCierre = async () => {
    const periodo = cierrePeriodo || periodosDisponibles[0];
    if (!periodo) {
      showToast("Selecciona un periodo para registrar el cierre", "error");
      return;
    }
    setCierreLoading(true);
    try {
      const { data } = await api.post("/tutoria/cierres", {
        periodo,
        bimestre: cierreBimestre ? Number(cierreBimestre) : null,
        alcance: cierreBimestre ? "BIMESTRE" : "CUATRIMESTRE",
        observaciones: cierreObs || null,
      });
      setCierreResumen({ periodo, bimestre: data.bimestre, indicadores: data.resumen, pendientes: [], puede_cerrar: true });
      setCierreObs("");
      showToast("Cierre de tutoría registrado", "success");
      cargarCierres();
    } catch {
      showToast("Error al registrar cierre", "error");
    } finally {
      setCierreLoading(false);
    }
  };

  useEffect(() => {
    cargarDash();
    cargarDocentes();
    cargarGrupos();
    cargarAlertas();
  }, []);

  useEffect(() => {
    if (tab === "grupos") cargarGrupos();
    if (tab === "canalizaciones") cargarCanalizaciones();
    if (tab === "informes") cargarInformes();
    if (tab === "cierre") cargarCierres();
    if (tab === "programacion") cargarProgramaciones();
    if (tab === "documentos") cargarDocumentosCtrl();
  }, [tab, filtroEstadoCan, cargarGrupos, cargarCanalizaciones, cargarInformes, cargarCierres, cargarProgramaciones, cargarDocumentosCtrl]);

  useEffect(() => {
    if (tab === "riesgo")   cargarAlumnosRiesgo();
    if (tab === "reporte")  cargarReporteGeneral();
  }, [tab, filtroSemaforo, filtroCarrera, filtroPeriodo, filtroTutor]);

  useEffect(() => {
    if (!cierrePeriodo && periodosDisponibles.length > 0) {
      setCierrePeriodo(periodosDisponibles[0]);
    }
  }, [cierrePeriodo, periodosDisponibles]);

  const gruposFiltrados = useMemo(() => grupos.filter(g =>
    (!filtroCarrera || g.carrera === filtroCarrera)
    && (!filtroPeriodo || g.periodo === filtroPeriodo)
    && (!filtroTutor || String(g.tutor_id) === String(filtroTutor))
  ), [grupos, filtroCarrera, filtroPeriodo, filtroTutor]);

  const gruposSinAlumnos = useMemo(
    () => grupos.filter(g => Number(g.total_alumnos || 0) === 0),
    [grupos]
  );

  const accionesPendientes = useMemo(() => {
    if (!dash) return [];
    const items = [];
    if (dash.canalizaciones_pendientes > 0) {
      items.push({
        tone: "red",
        title: `${dash.canalizaciones_pendientes} canalización(es) pendiente(s)`,
        detail: "Requieren seguimiento o registro de atención F-DC-08.",
        action: "Revisar",
        onClick: () => { setFiltroEstadoCan("PENDIENTE"); setTab("canalizaciones"); },
      });
    }
    if (dash.informes_por_revisar > 0) {
      items.push({
        tone: "amber",
        title: `${dash.informes_por_revisar} informe(s) por revisar`,
        detail: "Hay F-DC-09 enviados pendientes de recepción.",
        action: "Ver informes",
        onClick: () => setTab("informes"),
      });
    }
    if (dash.tutores_sin_sesion_semana > 0) {
      items.push({
        tone: "amber",
        title: `${dash.tutores_sin_sesion_semana} tutor(es) sin sesión esta semana`,
        detail: "Conviene revisar cumplimiento del acompañamiento tutorial.",
        action: "Ver grupos",
        onClick: () => setTab("grupos"),
      });
    }
    if (gruposSinAlumnos.length > 0) {
      items.push({
        tone: "blue",
        title: `${gruposSinAlumnos.length} grupo(s) sin alumnos asignados`,
        detail: "La evidencia del proceso queda incompleta si no hay tutorados.",
        action: "Completar",
        onClick: () => setTab("grupos"),
      });
    }
    return items;
  }, [dash, gruposSinAlumnos.length]);

  const marcarSeguimiento = async (id) => {
    try {
      await api.put(`/tutoria/canalizaciones/${id}/en-seguimiento`);
      showToast("Marcada en seguimiento", "success");
      cargarCanalizaciones();
    } catch { showToast("Error", "error"); }
  };

  const recibirInforme = async (id) => {
    try {
      await api.put(`/tutoria/informes/${id}/recibir`);
      showToast("Informe marcado como recibido", "success");
      cargarInformes();
    } catch { showToast("Error", "error"); }
  };

  const crearProgramacion = async () => {
    if (!nuevaProg.grupo_tutorado_id || !nuevaProg.fecha_programada) {
      showToast("Selecciona grupo y fecha", "error");
      return;
    }
    try {
      await api.post("/tutoria/programaciones", {
        ...nuevaProg,
        grupo_tutorado_id: Number(nuevaProg.grupo_tutorado_id),
        objetivo: nuevaProg.objetivo || null,
      });
      setNuevaProg({ grupo_tutorado_id: "", fecha_programada: "", tipo_sesion: "GRUPAL", objetivo: "" });
      showToast("Sesión programada", "success");
      cargarProgramaciones();
      cargarAlertas();
    } catch (e) {
      showToast(e.response?.data?.detail || "Error al programar sesión", "error");
    }
  };

  const abrirGruposTutor = (tutor) => {
    setFiltroTutor(String(tutor.tutor_id));
    setFiltroCarrera("");
    setFiltroPeriodo("");
    setTab("grupos");
  };

  const alertasAltas = alertas.filter(a => a.nivel === "ALTO").length;
  const TABS = [
    { id: "dashboard",      label: "Dashboard" + (alertasAltas > 0 ? ` 🔴${alertasAltas}` : "") },
    { id: "grupos",         label: "Grupos tutorados" },
    { id: "canalizaciones", label: "Canalizaciones" + (dash?.canalizaciones_pendientes > 0 ? ` (${dash.canalizaciones_pendientes})` : "") },
    { id: "informes",       label: "Informes bimestrales" },
    { id: "riesgo",         label: "🚨 Alumnos en Riesgo" },
    { id: "reporte",        label: "📊 Reporte General" },
    { id: "programacion",   label: "Programación" },
    { id: "cierre",         label: "Cierre de periodo" },
    { id: "documentos",     label: "Control documental" },
  ];

  return (
    <AdminLayout>
    <div className={`${isDay ? "text-slate-950" : "text-white"} w-full max-w-[1920px] 2xl:mx-auto space-y-6`}>
      {/* Encabezado */}
      <div className={`rounded-2xl border p-5 2xl:p-6 flex items-center justify-between flex-wrap gap-4 ${isDay ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900/45"}`}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Proceso de Tutoría</p>
          <h1 className="text-3xl font-bold mt-1">Seguimiento tutorial</h1>
          <p className="text-sm text-slate-400 mt-1">P-DC-02 v08 · F-DC-07, F-DC-08 y F-DC-09</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate("/admin/comunicados?nuevo=1&origen=tutoria")}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold flex items-center gap-2">
            Enviar comunicado a tutores
          </button>
          <button onClick={() => setModal("importar")}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold flex items-center gap-2">
            Importar estudio socioeconómico
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 rounded-xl p-1 w-fit max-w-full overflow-x-auto ${isDay ? "bg-white border border-slate-200" : "bg-slate-800/50"}`}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.id ? "bg-blue-600 text-white shadow" : isDay ? "text-slate-600 hover:text-slate-950 hover:bg-slate-100" : "text-slate-400 hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* â”€â”€ DASHBOARD â”€â”€ */}
      {tab === "dashboard" && dash && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard label="Grupos activos" value={dash.total_grupos} icon="G" tone="blue" hint="Con tutor asignado" />
            <StatCard label="Tutores asignados" value={dash.total_tutores} icon="T" hint="Docentes con grupo" />
            <StatCard label="Alumnos tutorados" value={dash.total_tutorados} icon="A" tone="emerald" hint="Asignaciones activas" />
            <StatCard label="Sesiones esta semana" value={dash.sesiones_esta_semana} icon="S" hint="Registros F-DC-07" />
            <StatCard label="Grupos sin alumnos" value={gruposSinAlumnos.length} icon="!" alert={gruposSinAlumnos.length > 0} hint="Revisar asignación" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
            <StatCard label="Estudios importados" value={dash.perfiles_importados || 0} icon="E"
              tone="blue" hint="Perfiles socioeconómicos" />
            <StatCard label="Alumnos en riesgo alto" value={dash.perfiles_riesgo_alto ?? dash.alumnos_riesgo_alto ?? 0} icon="R"
              alert={(dash.perfiles_riesgo_alto ?? dash.alumnos_riesgo_alto ?? 0) > 0} hint="Semáforo socioeconómico" />
            <StatCard label="Riesgo medio" value={dash.perfiles_riesgo_medio || 0} icon="M"
              alert={(dash.perfiles_riesgo_medio || 0) > 0} hint="Vulnerabilidad moderada" />
            <StatCard label="Sin grupo tutorado" value={dash.perfiles_sin_grupo || 0} icon="G"
              alert={(dash.perfiles_sin_grupo || 0) > 0} hint="Importados sin asignación" />
            <StatCard label="Asistencia global" value={`${dash.porcentaje_asistencia || 0}%`} icon="%"
              tone="emerald" hint="Sesiones registradas" />
            <StatCard label="Canalizaciones abiertas" value={dash.canalizaciones_abiertas || 0} icon="C"
              alert={(dash.canalizaciones_abiertas || 0) > 0} hint="Pendientes + seguimiento" />
            <StatCard label="Tiempo de atención" value={dash.promedio_dias_atencion == null ? "—" : `${dash.promedio_dias_atencion} d`} icon="D"
              tone="blue" hint="Promedio de canalizaciones atendidas" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
            <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Atención requerida</h2>
                  <p className="text-sm text-slate-400">Pendientes que pueden afectar el cierre del bimestre.</p>
                </div>
                <span className="text-xs text-slate-500">SGC · Tutoría</span>
              </div>
              {accionesPendientes.length > 0 ? (
                <div className="space-y-3">
                  {accionesPendientes.map((item, idx) => (
                    <ActionRow key={idx} {...item} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-5">
                  <p className="font-semibold text-emerald-300">Proceso al día</p>
                  <p className="text-sm text-slate-400 mt-1">No hay canalizaciones, informes o grupos incompletos que atender.</p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-3">
              <h2 className="text-lg font-semibold">Indicadores críticos</h2>
              <StatCard label="Canalizaciones pendientes" value={dash.canalizaciones_pendientes} icon="C"
                alert={dash.canalizaciones_pendientes > 0} hint="Seguimiento F-DC-08" />
              <StatCard label="Informes por revisar" value={dash.informes_por_revisar} icon="I"
                alert={dash.informes_por_revisar > 0} hint="Recepción F-DC-09" />
              <StatCard label="Tutores sin sesión esta semana" value={dash.tutores_sin_sesion_semana} icon="T"
                alert={dash.tutores_sin_sesion_semana > 0} hint="Cumplimiento semanal" />
              {dash.sesiones_por_tutor?.length > 0 && (
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/35 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Sesiones por tutor</p>
                  <div className="space-y-2">
                    {dash.sesiones_por_tutor.map(t => (
                      <div key={t.tutor_id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-300 truncate">{t.tutor_nombre}</span>
                        <span className="text-slate-500 shrink-0">{t.sesiones} sesiones · {t.alumnos} alumnos</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Cumplimiento por tutor</h2>
                <p className="text-sm text-slate-400">Semáforo operativo: sesiones realizadas vs esperadas, informes, canalizaciones y alumnos de riesgo.</p>
              </div>
              <button onClick={() => setTab("programacion")}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-white/5">
                Ver programación
              </button>
            </div>
            {dash.cumplimiento_tutores?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {dash.cumplimiento_tutores.map(t => (
                  <TutorCumplimientoCard
                    key={t.tutor_id}
                    tutor={t}
                    onVerGrupos={abrirGruposTutor}
                    onVerInformes={() => setTab("informes")}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-8">Aún no hay datos suficientes para calcular cumplimiento por tutor.</p>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Expedientes que requieren atención</h2>
                <p className="text-sm text-slate-400">Alumnos de riesgo alto sin seguimiento institucional registrado.</p>
              </div>
              <button onClick={() => { setFiltroSemaforo("ALTO"); setTab("riesgo"); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-white/5">
                Ver todos
              </button>
            </div>
            {dash.alumnos_prioritarios?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {dash.alumnos_prioritarios.map(a => (
                  <button key={a.alumno_id} type="button" onClick={() => setModalSeguimiento(a.alumno_id)}
                    className="text-left rounded-xl border border-red-500/20 bg-red-950/10 p-4 hover:bg-red-950/20 transition-colors">
                    <p className="font-semibold text-white truncate">{a.nombre}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{a.matricula} · {a.carrera} · Grupo {a.grupo}</p>
                    <p className="text-xs text-red-300 mt-2">{a.motivo}</p>
                    {a.tutor_nombre && <p className="text-xs text-slate-400 mt-1">Tutor: {a.tutor_nombre}</p>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-4">
                <p className="text-sm font-medium text-emerald-300">Sin expedientes críticos abiertos</p>
                <p className="text-xs text-slate-500 mt-0.5">No hay alumnos de riesgo alto sin seguimiento institucional.</p>
              </div>
            )}
          </section>

          {/* Alertas persistentes */}
          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold">Alertas del sistema</h2>
                <p className="text-xs text-slate-500">{alertas.length} alerta(s) activa(s)</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    const { data } = await api.post("/tutoria/alertas/procesar");
                    showToast(`${data.notificaciones_nuevas} notificacion(es) enviada(s)`, "success");
                    cargarAlertas();
                  } catch { showToast("Error al procesar alertas", "error"); }
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-600 text-slate-300 text-xs hover:bg-white/5 flex items-center gap-1.5">
                🔔 Enviar notificaciones
              </button>
            </div>
            {alertas.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-4">
                <p className="text-sm text-emerald-300 font-medium">Sin alertas activas</p>
                <p className="text-xs text-slate-500 mt-0.5">Todos los tutores han registrado sesiones recientes y no hay canalizaciones sin atender.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {alertas.map((a, i) => (
                  <div key={i} className={`rounded-xl border px-4 py-3 ${
                    a.nivel === "ALTO"
                      ? "border-red-500/30 bg-red-950/15"
                      : "border-amber-500/30 bg-amber-950/10"
                  }`}>
                    <div className="flex items-start gap-3">
                      <span className="text-lg mt-0.5 shrink-0">
                        {a.tipo === "SIN_SESION" ? "📅" : "🔴"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${a.nivel === "ALTO" ? "text-red-200" : "text-amber-200"}`}>
                          {a.mensaje}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{a.detalle}</p>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${
                        a.nivel === "ALTO" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"
                      }`}>{a.nivel}</span>
                    </div>
                    {/* Acciones directas */}
                    <div className="flex gap-2 mt-2.5 ml-8 flex-wrap">
                      {a.tipo === "SIN_SESION" && a.grupo_id && (
                        <button
                          onClick={() => {
                            setTab("grupos");
                            // Pequeño delay para que el tab cambie primero
                            setTimeout(() => setModal({ type: "ver-alumnos", grupo: { id: a.grupo_id, carrera: "", grupo: "", periodo: "" } }), 150);
                          }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600">
                          Ver grupo →
                        </button>
                      )}
                      {a.tipo === "CANALIZACION_PENDIENTE" && a.alumno_id && (
                        <button
                          onClick={() => setModalSeguimiento(a.alumno_id)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600">
                          Ver alumno →
                        </button>
                      )}
                      {a.tipo === "CANALIZACION_PENDIENTE" && (
                        <button
                          onClick={() => { setFiltroEstadoCan("PENDIENTE"); setTab("canalizaciones"); }}
                          className="text-xs px-2.5 py-1 rounded-lg bg-purple-600/70 hover:bg-purple-600 text-white">
                          Ver canalización →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* â”€â”€ GRUPOS â”€â”€ */}
      {tab === "grupos" && (
        <div className="space-y-4">
          <div className="flex justify-between items-start gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Grupos tutorados</h2>
              <p className="text-sm text-slate-400">Asignación de tutores, alumnos y seguimiento de sesiones.</p>
            </div>
            <button onClick={() => setModal("grupo")}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium">
              Nuevo grupo
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/35 p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200">
              <option value="">Todos los periodos</option>
              {periodosDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filtroCarrera} onChange={e => setFiltroCarrera(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200">
              <option value="">Todas las carreras</option>
              {carrerasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtroTutor} onChange={e => setFiltroTutor(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200">
              <option value="">Todos los tutores</option>
              {tutoresDisponibles.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <button type="button"
              onClick={() => { setFiltroPeriodo(""); setFiltroCarrera(""); setFiltroTutor(""); }}
              className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
              Limpiar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {gruposFiltrados.map(g => (
              <div key={g.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-white">{g.carrera}</p>
                    <p className="text-xs text-slate-400">Grupo {g.grupo} · {g.cuatrimestre}° cuatrimestre · {g.periodo}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${g.activo ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>
                    {g.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between items-center text-xs text-slate-400">
                  <span>{g.tutor_nombre}</span>
                  <span className={Number(g.total_alumnos || 0) === 0 ? "text-amber-300" : ""}>
                    {g.total_alumnos} alumnos · {g.sesiones_realizadas} sesiones
                  </span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setModal({ type: "ver-alumnos", grupo: g })}
                    className="flex-1 py-1.5 rounded-lg border border-slate-600 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-all">
                    Ver alumnos
                  </button>
                  <button
                    onClick={() => setModal({ type: "editar", grupo: g })}
                    className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-xs hover:bg-slate-700 transition-all">
                    Editar
                  </button>
                </div>
              </div>
            ))}
            {gruposFiltrados.length === 0 && (
              <p className="text-slate-500 text-sm col-span-3 text-center py-8">
                No hay grupos tutorados con estos filtros.
              </p>
            )}
          </div>
        </div>
      )}

      {/* â”€â”€ CANALIZACIONES â”€â”€ */}
      {tab === "canalizaciones" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {["PENDIENTE","EN_SEGUIMIENTO","ATENDIDA","TODAS"].map(e => (
              <button key={e} onClick={() => setFiltroEstadoCan(e)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  filtroEstadoCan === e ? "bg-blue-600 border-blue-500 text-white" : "border-slate-600 text-slate-400 hover:text-white"
                }`}>{e}</button>
            ))}
          </div>

          <div className="space-y-3">
            {canalizaciones.map(c => (
              <div key={c.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_CAN[c.estado]?.cls}`}>
                        {ESTADO_CAN[c.estado]?.label}
                      </span>
                      {c.tipos?.map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">{t}</span>
                      ))}
                      <span className="text-xs text-slate-500">· {c.modalidad}</span>
                    </div>
                    <p className="font-medium text-white">{c.alumno_nombre} <span className="text-slate-400 text-sm">({c.alumno_matricula})</span></p>
                    <p className="text-sm text-slate-400 mt-0.5">Tutor: {c.tutor_nombre}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.motivo}</p>
                    {c.descripcion_atencion && (
                      <p className="text-xs text-emerald-400 mt-1">✓ {c.descripcion_atencion}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-col items-end">
                    <span className="text-xs text-slate-500">
                      {c.fecha_solicitud ? new Date(c.fecha_solicitud).toLocaleDateString("es-MX") : ""}
                    </span>
                    {c.estado === "PENDIENTE" && (
                      <>
                        <button onClick={() => marcarSeguimiento(c.id)}
                          className="px-3 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-xs text-white">
                          En seguimiento
                        </button>
                        <button onClick={() => setModal({ type: "atender", can: c })}
                          className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-xs text-white">
                          Atender
                        </button>
                      </>
                    )}
                    {c.estado === "EN_SEGUIMIENTO" && (
                      <button onClick={() => setModal({ type: "atender", can: c })}
                        className="px-3 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-xs text-white">
                        Registrar atención
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {canalizaciones.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">No hay canalizaciones con este estado.</p>
            )}
          </div>
        </div>
      )}

      {/* â”€â”€ INFORMES BIMESTRALES â”€â”€ */}
      {tab === "informes" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Informes Bimestrales (F-DC-09)</h2>
          {informes.map(inf => (
            <div key={inf.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-medium text-white">{inf.tutor_nombre}</p>
                <p className="text-xs text-slate-400">{inf.carrera} · Grupo {inf.grupo} · {inf.periodo} · B{inf.bimestre}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full ${ESTADO_INF[inf.estado]?.cls}`}>
                  {ESTADO_INF[inf.estado]?.label}
                </span>
                {inf.enviado_en && (
                  <span className="text-xs text-slate-500">
                    Enviado: {new Date(inf.enviado_en).toLocaleDateString("es-MX")}
                  </span>
                )}
                {inf.estado === "ENVIADO" && (
                  <button onClick={() => recibirInforme(inf.id)}
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs text-white">
                    ✓ Marcar recibido
                  </button>
                )}
              </div>
            </div>
          ))}
          {informes.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">No hay informes bimestrales registrados.</p>
          )}
        </div>
      )}

      {/* ── ALUMNOS EN RIESGO ── */}
      {tab === "riesgo" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Vista global · Alumnos en riesgo</h2>
            <p className="text-sm text-slate-400">Semáforo de vulnerabilidad basado en perfil socioeconómico. Actualizado desde los datos importados.</p>
          </div>

          {/* Filtros */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/35 p-3 flex flex-wrap gap-3 items-center">
            {/* Semáforo pills */}
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: "",       label: "Todos",  cls: "border-slate-600 text-slate-300" },
                { key: "ALTO",   label: "🔴 Alto",   cls: "border-red-500/50 text-red-300 bg-red-500/10" },
                { key: "MEDIO",  label: "🟡 Medio",  cls: "border-amber-500/50 text-amber-300 bg-amber-500/10" },
                { key: "BAJO",   label: "🟢 Bajo",   cls: "border-emerald-500/50 text-emerald-300 bg-emerald-500/10" },
              ].map(({ key, label, cls }) => (
                <button key={key} onClick={() => setFiltroSemaforo(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    filtroSemaforo === key
                      ? "ring-2 ring-offset-1 ring-offset-slate-900 ring-blue-500 " + cls
                      : "border-slate-700 text-slate-400 hover:text-white"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap ml-auto">
              <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200">
                <option value="">Todos los periodos</option>
                {periodosDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filtroCarrera} onChange={e => setFiltroCarrera(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200">
                <option value="">Todas las carreras</option>
                {carrerasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroTutor} onChange={e => setFiltroTutor(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200">
                <option value="">Todos los tutores</option>
                {tutoresDisponibles.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <button onClick={() => { setFiltroSemaforo(""); setFiltroCarrera(""); setFiltroPeriodo(""); setFiltroTutor(""); }}
                className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
                Limpiar
              </button>
            </div>
          </div>

          {/* Contador */}
          <p className="text-xs text-slate-500">
            {alumnosRiesgo.length} alumno(s) encontrado(s)
            {filtroSemaforo === "ALTO" && <span className="text-red-400 font-medium"> · Vulnerabilidad Alta</span>}
            {filtroSemaforo === "MEDIO" && <span className="text-amber-400 font-medium"> · Vulnerabilidad Media</span>}
            {filtroSemaforo === "BAJO" && <span className="text-emerald-400 font-medium"> · Vulnerabilidad Baja</span>}
          </p>

          {/* Cards */}
          <div className="space-y-3">
            {alumnosRiesgo.map(a => (
              <AlumnoRiesgoCard key={`${a.id}-${a.grupo_id}`} alumno={a}
                onVerSeguimiento={id => setModalSeguimiento(id)} />
            ))}
            {alumnosRiesgo.length === 0 && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-8 text-center">
                <p className="text-slate-400 text-sm">No hay alumnos con los filtros seleccionados.</p>
                <p className="text-slate-500 text-xs mt-1">Intenta cambiar el semáforo o importar estudios socioeconómicos.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REPORTE GENERAL ── */}
      {tab === "reporte" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Reporte general de tutorados</h2>
              <p className="text-sm text-slate-400">Todos los alumnos activos con indicadores de seguimiento tutorial.</p>
            </div>
            <button
              onClick={() => {
                if (reporteGeneralFiltrado.length === 0) return;
                const COLS = ["matricula","nombre","carrera","grupo","cuatrimestre","periodo","tutor_nombre","semaforo_vulnerabilidad","estado_seguimiento","sesiones_grupo","asistencias","inasistencias","porcentaje_asistencia","canalizaciones_activas","ultima_asistencia","tiene_perfil"];
                const HEADS = ["Matrícula","Nombre","Carrera","Grupo","Cuatrimestre","Periodo","Tutor","Semáforo","Estado seguimiento","Sesiones grupo","Asistencias","Faltas","% asistencia","Canalizaciones activas","Última asistencia","Perfil SE"];
                const rows = [HEADS, ...reporteGeneralFiltrado.map(r => COLS.map(c => {
                  const v = r[c];
                  if (c === "tiene_perfil") return v ? "Sí" : "No";
                  if (c === "ultima_asistencia") return v ? new Date(v).toLocaleDateString("es-MX") : "";
                  return v ?? "";
                }))];
                const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url;
                a.download = `reporte_tutoria_${new Date().toISOString().slice(0,10)}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium">
              ⬇ Exportar CSV
            </button>
          </div>

          {/* Filtros */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/35 p-3 flex flex-wrap gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: "",      label: "Todos" },
                { key: "ALTO",  label: "🔴 Alto" },
                { key: "MEDIO", label: "🟡 Medio" },
                { key: "BAJO",  label: "🟢 Bajo" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFiltroSemaforo(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    filtroSemaforo === key
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "border-slate-700 text-slate-400 hover:text-white"
                  }`}>{label}</button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap ml-auto">
              <input
                value={busquedaReporte}
                onChange={e => setBusquedaReporte(e.target.value)}
                placeholder="Buscar por matrícula, nombre, carrera, grupo o tutor..."
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200 min-w-[280px]"
              />
              <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200">
                <option value="">Todos los periodos</option>
                {periodosDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filtroCarrera} onChange={e => setFiltroCarrera(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200">
                <option value="">Todas las carreras</option>
                {carrerasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroTutor} onChange={e => setFiltroTutor(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200">
                <option value="">Todos los tutores</option>
                {tutoresDisponibles.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <button onClick={() => { setFiltroSemaforo(""); setFiltroCarrera(""); setFiltroPeriodo(""); setFiltroTutor(""); setBusquedaReporte(""); }}
                className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
                Limpiar
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            {reporteGeneralFiltrado.length} alumno(s) visible(s)
            {reporteGeneralFiltrado.length !== reporteGeneral.length && (
              <span> de {reporteGeneral.length} resultado(s) cargado(s)</span>
            )}
          </p>

          {/* Tabla */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 text-xs text-slate-400 uppercase tracking-wide">
                    {["Matrícula","Nombre","Carrera","Gr.","Periodo","Tutor","Semáforo","Estado","Asist.%","Canalizaciones","Última asistencia","Perfil SE",""].map(h => (
                      <th key={h} className="text-left px-3 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reporteGeneralFiltrado.map((r, i) => {
                    const sem = SEMAFORO[r.semaforo_vulnerabilidad] || SEMAFORO.SIN_DATOS;
                    const estado = ESTADO_SEG[r.estado_seguimiento] || ESTADO_SEG.SIN_SEGUIMIENTO;
                    return (
                      <tr key={i} className="border-b border-slate-800/60 hover:bg-white/3 transition-colors">
                        <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{r.matricula}</td>
                        <td className="px-3 py-2.5 text-white font-medium max-w-[180px] truncate">{r.nombre}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[120px] truncate">{r.carrera}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-center">{r.grupo}</td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{r.periodo}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[120px] truncate">{r.tutor_nombre || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${sem.cls}`}>
                            {sem.label.replace("Vulnerabilidad ", "")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${estado.cls}`}>
                            {estado.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-300 whitespace-nowrap">
                          {r.porcentaje_asistencia || 0}% <span className="text-slate-600">({r.asistencias || 0}/{(r.asistencias || 0) + (r.inasistencias || 0)})</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {r.canalizaciones_activas > 0
                            ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">{r.canalizaciones_activas}</span>
                            : <span className="text-slate-600">0</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                          {r.ultima_asistencia ? new Date(r.ultima_asistencia).toLocaleDateString("es-MX") : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {r.tiene_perfil
                            ? <span className="text-emerald-400 text-xs">✓</span>
                            : <span className="text-slate-600 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setModalSeguimiento(r.alumno_id)}
                            className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap">
                            Ver →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {reporteGeneralFiltrado.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-3 py-10 text-center text-slate-500 text-sm">
                        No hay tutorados con estos filtros o búsqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── PROGRAMACION ── */}
      {tab === "programacion" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Programación de sesiones tutoriales</h2>
            <p className="text-sm text-slate-400">Planea las sesiones esperadas y compáralas contra la evidencia F-DC-07 capturada.</p>
          </div>
          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 grid grid-cols-1 lg:grid-cols-[1fr_170px_150px_1fr_auto] gap-3 items-end">
            <select value={nuevaProg.grupo_tutorado_id} onChange={e => setNuevaProg(p => ({ ...p, grupo_tutorado_id: e.target.value }))}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200">
              <option value="">Grupo tutorado</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.carrera} · Grupo {g.grupo} · {g.periodo} · {g.tutor_nombre}</option>)}
            </select>
            <input type="date" value={nuevaProg.fecha_programada} onChange={e => setNuevaProg(p => ({ ...p, fecha_programada: e.target.value }))}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200" />
            <select value={nuevaProg.tipo_sesion} onChange={e => setNuevaProg(p => ({ ...p, tipo_sesion: e.target.value }))}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200">
              <option value="GRUPAL">Grupal</option>
              <option value="INDIVIDUAL">Individual</option>
            </select>
            <input value={nuevaProg.objetivo} onChange={e => setNuevaProg(p => ({ ...p, objetivo: e.target.value }))}
              placeholder="Objetivo de la sesión"
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200" />
            <button onClick={crearProgramacion}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold">
              Programar
            </button>
          </section>

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
            <div className="p-4 border-b border-slate-700/60 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold">Sesiones programadas</h3>
                <p className="text-xs text-slate-500">{programaciones.length} registro(s)</p>
              </div>
              <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-200">
                <option value="">Todos los periodos</option>
                {periodosDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="divide-y divide-slate-800/80">
              {programaciones.map(p => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-medium text-white">{p.grupo_label}</p>
                    <p className="text-xs text-slate-500">{p.tutor_nombre} · {p.fecha_programada ? new Date(p.fecha_programada).toLocaleDateString("es-MX") : ""} · {p.tipo_sesion}</p>
                    {p.objetivo && <p className="text-xs text-slate-400 mt-1">{p.objetivo}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    p.estado === "CUMPLIDA" ? "bg-emerald-500/15 text-emerald-300" :
                    p.estado === "CANCELADA" ? "bg-slate-700/60 text-slate-400" :
                    p.estado === "OMITIDA" ? "bg-red-500/15 text-red-300" :
                    "bg-blue-500/15 text-blue-300"
                  }`}>{p.estado}</span>
                </div>
              ))}
              {programaciones.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No hay sesiones programadas.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── CIERRE DE PERIODO ── */}
      {tab === "cierre" && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Cierre de bimestre/cuatrimestre</h2>
              <p className="text-sm text-slate-400">Valida evidencia, pendientes y deja registro formal para coordinación o rectoría.</p>
            </div>
          </div>

          <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Periodo</label>
                <select value={cierrePeriodo} onChange={e => { setCierrePeriodo(e.target.value); setCierreResumen(null); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200">
                  <option value="">Seleccionar periodo</option>
                  {periodosDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Alcance</label>
                <select value={cierreBimestre} onChange={e => { setCierreBimestre(e.target.value); setCierreResumen(null); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200">
                  <option value="1">Bimestre 1</option>
                  <option value="2">Bimestre 2</option>
                  <option value="">Cuatrimestre completo</option>
                </select>
              </div>
              <button onClick={cargarResumenCierre} disabled={cierreLoading}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold disabled:opacity-50">
                {cierreLoading ? "Calculando..." : "Previsualizar cierre"}
              </button>
            </div>

            {cierreResumen && (() => {
              const ind = cierreResumen.indicadores || {};
              const abiertos = (ind.canalizaciones_pendientes || 0) + (ind.canalizaciones_seguimiento || 0);
              const informesPend = (ind.informes_borrador || 0) + (ind.informes_enviados || 0);
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    <StatCard label="Grupos" value={ind.total_grupos || 0} icon="G" tone="blue" />
                    <StatCard label="Tutorados" value={ind.total_tutorados || 0} icon="A" tone="emerald" />
                    <StatCard label="Sesiones" value={ind.total_sesiones || 0} icon="S" />
                    <StatCard label="Asistencia" value={`${ind.porcentaje_asistencia || 0}%`} icon="%" tone="emerald" />
                    <StatCard label="Riesgo alto" value={ind.alumnos_riesgo_alto || 0} icon="R" alert={(ind.alumnos_riesgo_alto || 0) > 0} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <StatCard label="Canalizaciones abiertas" value={abiertos} icon="C" alert={abiertos > 0} />
                    <StatCard label="Informes pendientes" value={informesPend} icon="I" alert={informesPend > 0} />
                    <StatCard label="Grupos sin sesión" value={ind.grupos_sin_sesion || 0} icon="!" alert={(ind.grupos_sin_sesion || 0) > 0} />
                  </div>

                  <div className={`rounded-xl border p-4 ${
                    cierreResumen.puede_cerrar
                      ? "border-emerald-500/25 bg-emerald-950/15"
                      : "border-amber-500/25 bg-amber-950/15"
                  }`}>
                    <p className={`text-sm font-semibold ${cierreResumen.puede_cerrar ? "text-emerald-300" : "text-amber-300"}`}>
                      {cierreResumen.puede_cerrar ? "Listo para cierre formal" : "Cierre con pendientes"}
                    </p>
                    {cierreResumen.pendientes?.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-slate-300">
                        {cierreResumen.pendientes.map((p, i) => <li key={i}>• {p}</li>)}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400 mt-1">No se detectaron pendientes críticos en la previsualización.</p>
                    )}
                  </div>

                  {cierreResumen.checklist?.length > 0 && (
                    <div className="rounded-xl border border-slate-700/60 bg-slate-800/35 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-700/60">
                        <p className="text-sm font-semibold text-white">Checklist del procedimiento</p>
                        <p className="text-xs text-slate-500">Validaciones mínimas antes del cierre institucional.</p>
                      </div>
                      <div className="divide-y divide-slate-700/50">
                        {cierreResumen.checklist.map(item => (
                          <div key={item.clave} className="px-4 py-3 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm text-white">{item.label}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{item.detalle}</p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                              item.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                            }`}>
                              {item.ok ? "Cumple" : "Pendiente"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Observaciones del cierre</label>
                    <textarea value={cierreObs} onChange={e => setCierreObs(e.target.value)}
                      className="w-full min-h-[86px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200"
                      placeholder="Ej. Se cierra bimestre con canalizaciones en seguimiento para continuidad del siguiente periodo." />
                  </div>
                  <button onClick={registrarCierre} disabled={cierreLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold disabled:opacity-50">
                    Registrar cierre formal
                  </button>
                </div>
              );
            })()}
          </section>

          <section className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
            <div className="p-4 border-b border-slate-700/60">
              <h3 className="font-semibold text-white">Historial de cierres</h3>
              <p className="text-xs text-slate-500">Evidencia institucional registrada por el responsable de tutoría.</p>
            </div>
            <div className="divide-y divide-slate-800/80">
              {cierres.map(c => {
                const abiertos = (c.canalizaciones_pendientes || 0) + (c.canalizaciones_seguimiento || 0);
                return (
                  <div key={c.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-medium text-white">{c.periodo} · {c.bimestre ? `Bimestre ${c.bimestre}` : "Cuatrimestre completo"}</p>
                      <p className="text-xs text-slate-500">
                        {c.cerrado_en ? new Date(c.cerrado_en).toLocaleString("es-MX") : "Sin fecha"} · {c.total_tutorados} tutorados · {c.total_sesiones} sesiones
                      </p>
                      {c.observaciones && <p className="text-xs text-slate-400 mt-1 max-w-3xl">{c.observaciones}</p>}
                    </div>
                    <div className="flex gap-2 text-xs flex-wrap">
                      <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300">{c.informes_recibidos} informes recibidos</span>
                      <span className={`px-2 py-1 rounded-full ${abiertos > 0 ? "bg-amber-500/15 text-amber-300" : "bg-slate-700/50 text-slate-400"}`}>
                        {abiertos} canalizaciones abiertas
                      </span>
                      <span className={`px-2 py-1 rounded-full ${(c.grupos_sin_sesion || 0) > 0 ? "bg-red-500/15 text-red-300" : "bg-slate-700/50 text-slate-400"}`}>
                        {c.grupos_sin_sesion || 0} grupos sin sesión
                      </span>
                    </div>
                  </div>
                );
              })}
              {cierres.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Aún no hay cierres registrados.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── CONTROL DOCUMENTAL ── */}
      {tab === "documentos" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Control documental básico</h2>
            <p className="text-sm text-slate-400">Versiones vigentes usadas por las evidencias digitales del proceso de tutoría.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {documentosCtrl.map(d => (
              <div key={d.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-300 font-bold">{d.codigo}</p>
                    <h3 className="font-semibold text-white mt-1">{d.nombre}</h3>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${d.vigente ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>
                    {d.vigente ? "Vigente" : "Histórico"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-800/45 border border-slate-700/50 px-3 py-2">
                    <p className="text-slate-500">Versión</p>
                    <p className="text-white font-semibold">{d.version}</p>
                  </div>
                  <div className="rounded-xl bg-slate-800/45 border border-slate-700/50 px-3 py-2">
                    <p className="text-slate-500">Efectividad</p>
                    <p className="text-white font-semibold">{d.fecha_efectivo ? new Date(d.fecha_efectivo).toLocaleDateString("es-MX") : "Sin fecha"}</p>
                  </div>
                </div>
                {d.observaciones && <p className="text-xs text-slate-400 mt-3">{d.observaciones}</p>}
              </div>
            ))}
            {documentosCtrl.length === 0 && (
              <p className="text-sm text-slate-500">No hay documentos controlados registrados.</p>
            )}
          </div>
        </div>
      )}

      {/* Modales */}
      {modal === "grupo" && (
        <ModalCrearGrupo docentes={docentes} onClose={() => setModal(null)}
          onCreado={() => { setModal(null); cargarGrupos(); cargarDash(); }} />
      )}
      {modal === "importar" && (
        <ModalImportar onClose={() => setModal(null)} />
      )}
      {modal?.type === "ver-alumnos" && (
        <ModalVerAlumnos
          grupo={modal.grupo}
          onClose={() => setModal(null)}
          onVerSeguimiento={id => setModalSeguimiento(id)}
        />
      )}
      {modal?.type === "editar" && (
        <ModalEditarGrupo
          grupo={modal.grupo}
          docentes={docentes}
          onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); cargarGrupos(); cargarDash(); }}
        />
      )}
      {modal?.type === "atender" && (
        <ModalAtenderCan can={modal.can} onClose={() => setModal(null)}
          onAtendida={() => { setModal(null); cargarCanalizaciones(); cargarDash(); }} />
      )}
      {modalSeguimiento && (
        <ModalSeguimientoAlumno
          alumnoId={modalSeguimiento}
          onClose={() => setModalSeguimiento(null)}
        />
      )}
    </div>
    </AdminLayout>
  );
}
