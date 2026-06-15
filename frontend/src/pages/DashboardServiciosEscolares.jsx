import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import api from "../hooks/useApi";
import { useTheme } from "../context/ThemeContext";

function Stat({ label, value, detail, tone = "blue" }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  // Fondo neutro idéntico — solo el número adopta el color del tono
  const numColors = {
    blue:    isDay ? "text-blue-600"    : "text-blue-400",
    emerald: isDay ? "text-emerald-700" : "text-emerald-400",
    amber:   isDay ? "text-amber-600"   : "text-amber-400",
    slate:   isDay ? "text-slate-800"   : "text-slate-200",
  };
  const cardBg  = isDay ? "bg-white border-slate-200" : "bg-slate-900/70 border-slate-700";
  const numCls  = numColors[tone] || numColors.blue;
  return (
    <div className={`card-lift rounded-xl border p-4 ${cardBg}`}>
      <p className={`text-3xl font-bold ${numCls}`}>{value}</p>
      <p className={`text-sm font-medium mt-1 ${isDay ? "text-slate-700" : "text-slate-300"}`}>{label}</p>
      {detail && <p className={`text-xs mt-1 ${isDay ? "text-slate-500" : "text-slate-500"}`}>{detail}</p>}
    </div>
  );
}

function Action({ title, detail, action, onClick }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card-lift rounded-xl border p-4 text-left transition-colors group ${
        isDay ? "bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40" : "bg-slate-900/70 border-slate-700 hover:bg-white/5 hover:border-emerald-600/40"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={isDay ? "font-semibold text-slate-900" : "font-semibold text-white"}>{title}</p>
          <p className={isDay ? "text-sm text-slate-500 mt-1" : "text-sm text-slate-400 mt-1"}>{detail}</p>
        </div>
        {/* CTA en verde institucional con flecha */}
        <span className="text-sm font-semibold text-emerald-600 group-hover:text-emerald-500 whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors">
          {action}
          <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </span>
      </div>
    </button>
  );
}

export default function DashboardServiciosEscolares() {
  const navigate = useNavigate();
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const [alumnos, setAlumnos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/catalogo/alumnos?activo=true")
      .then(({ data }) => setAlumnos(Array.isArray(data) ? data : []))
      .catch(() => setAlumnos([]))
      .finally(() => setLoading(false));
  }, []);

  const resumen = useMemo(() => {
    const periodos = new Set(alumnos.map(a => a.periodo).filter(Boolean));
    const carreras = new Set(alumnos.map(a => a.carrera).filter(Boolean));
    const sinGrupo = alumnos.filter(a => !a.grupo || !a.cuatrimestre).length;
    return { periodos: periodos.size, carreras: carreras.size, sinGrupo };
  }, [alumnos]);

  const pageBg = isDay ? "bg-slate-50 text-slate-950" : "bg-slate-950 text-white";
  const muted = isDay ? "text-slate-600" : "text-slate-400";
  const panel = isDay ? "bg-white border-slate-200" : "bg-slate-900/70 border-slate-700";

  return (
    <AdminLayout>
      <div className={`min-h-screen p-6 ${pageBg}`}>
        <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <p className={`text-xs uppercase tracking-[0.22em] ${muted}`}>Panel institucional</p>
              <h1 className="text-3xl font-bold mt-1">Servicios Escolares</h1>
              <p className={`text-sm mt-2 max-w-3xl ${muted}`}>
                Control de alumnos, matrículas, correos institucionales y activación del estudio socioeconómico.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/servicios-escolares/alumnos")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Gestionar alumnos
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Stat label="Alumnos activos" value={loading ? "..." : alumnos.length} detail="Catálogo académico" tone="blue" />
            <Stat label="Carreras con alumnos" value={loading ? "..." : resumen.carreras} detail="Según registros activos" tone="emerald" />
            <Stat label="Periodos registrados" value={loading ? "..." : resumen.periodos} detail="Histórico cargado" tone="slate" />
            <Stat label="Datos por revisar" value={loading ? "..." : resumen.sinGrupo} detail="Grupo o cuatrimestre faltante" tone="amber" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] gap-6">
            <section className={`card-lift rounded-2xl border p-5 ${panel}`}>
              <h2 className="text-lg font-bold">Funciones del área</h2>
              <div className="mt-4 grid gap-3">
                <Action
                  title="Catálogo de alumnos"
                  detail="Alta, edición e importación desde Excel de matrícula, carrera, grupo y periodo."
                  action="Abrir"
                  onClick={() => navigate("/servicios-escolares/alumnos")}
                />
                <Action
                  title="Estudios socioeconómicos"
                  detail="Activación para alumnos, revisión de fichas enviadas y calidad de datos."
                  action="Gestionar"
                  onClick={() => navigate("/servicios-escolares/estudios-socioeconomicos")}
                />
              </div>
            </section>

            <section className={`card-lift rounded-2xl border p-5 ${panel}`}>
              <h2 className="text-lg font-bold">Flujo recomendado</h2>
              <div className={`mt-4 space-y-3 text-sm ${muted}`}>
                <p><span className="font-semibold text-emerald-500">1.</span> Registrar alumno al recibir matrícula.</p>
                <p><span className="font-semibold text-emerald-500">2.</span> Actualizar correo institucional cuando sea asignado.</p>
                <p><span className="font-semibold text-emerald-500">3.</span> Activar acceso SIGA y estudio socioeconómico.</p>
                <p><span className="font-semibold text-emerald-500">4.</span> Validar o solicitar corrección de la ficha enviada.</p>
                <p><span className="font-semibold text-emerald-500">5.</span> Compartir datos validados con Tutoría para seguimiento y análisis.</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
