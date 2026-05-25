import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import api from "../hooks/useApi";
import { useTheme } from "../context/ThemeContext";

function Stat({ label, value, detail, tone = "blue" }) {
  const { themeKey } = useTheme();
  const isDay = themeKey === "day";
  const tones = {
    blue: isDay ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-blue-950/30 border-blue-500/30 text-blue-300",
    emerald: isDay ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-emerald-950/25 border-emerald-500/30 text-emerald-300",
    amber: isDay ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-amber-950/25 border-amber-500/30 text-amber-300",
    slate: isDay ? "bg-white border-slate-200 text-slate-700" : "bg-slate-900/70 border-slate-700 text-slate-300",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.blue}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm font-medium mt-1">{label}</p>
      {detail && <p className="text-xs opacity-75 mt-1">{detail}</p>}
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
      className={`rounded-xl border p-4 text-left transition-colors ${
        isDay ? "bg-white border-slate-200 hover:bg-slate-50" : "bg-slate-900/70 border-slate-700 hover:bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={isDay ? "font-semibold text-slate-950" : "font-semibold text-white"}>{title}</p>
          <p className={isDay ? "text-sm text-slate-600 mt-1" : "text-sm text-slate-400 mt-1"}>{detail}</p>
        </div>
        <span className="text-sm font-semibold text-blue-500">{action}</span>
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
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <p className={`text-xs uppercase tracking-[0.22em] ${muted}`}>Panel institucional</p>
              <h1 className="text-3xl font-bold mt-1">Servicios Escolares</h1>
              <p className={`text-sm mt-2 max-w-3xl ${muted}`}>
                Control de alumnos, matriculas, correos institucionales y activacion del estudio socioeconomico.
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Stat label="Alumnos activos" value={loading ? "..." : alumnos.length} detail="Catalogo academico" tone="blue" />
            <Stat label="Carreras con alumnos" value={loading ? "..." : resumen.carreras} detail="Segun registros activos" tone="emerald" />
            <Stat label="Periodos registrados" value={loading ? "..." : resumen.periodos} detail="Historico cargado" tone="slate" />
            <Stat label="Datos por revisar" value={loading ? "..." : resumen.sinGrupo} detail="Grupo o cuatrimestre faltante" tone="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className={`rounded-2xl border p-5 ${panel}`}>
              <h2 className="text-lg font-bold">Funciones del area</h2>
              <div className="mt-4 grid gap-3">
                <Action
                  title="Catalogo de alumnos"
                  detail="Alta, edicion, importacion Excel, matricula, carrera, grupo y periodo."
                  action="Abrir"
                  onClick={() => navigate("/servicios-escolares/alumnos")}
                />
                <Action
                  title="Estudios socioeconomicos"
                  detail="Activacion para alumnos, revision de fichas enviadas y calidad de datos."
                  action="Disenar"
                  onClick={() => navigate("/servicios-escolares/estudios-socioeconomicos")}
                />
              </div>
            </section>

            <section className={`rounded-2xl border p-5 ${panel}`}>
              <h2 className="text-lg font-bold">Flujo recomendado</h2>
              <div className={`mt-4 space-y-3 text-sm ${muted}`}>
                <p><span className="font-semibold text-blue-500">1.</span> Registrar alumno al recibir matricula.</p>
                <p><span className="font-semibold text-blue-500">2.</span> Actualizar correo institucional cuando sea asignado.</p>
                <p><span className="font-semibold text-blue-500">3.</span> Activar acceso SIGA y estudio socioeconomico.</p>
                <p><span className="font-semibold text-blue-500">4.</span> Validar o solicitar correccion de la ficha enviada.</p>
                <p><span className="font-semibold text-blue-500">5.</span> Entregar datos validados a Tutoria para analisis.</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
