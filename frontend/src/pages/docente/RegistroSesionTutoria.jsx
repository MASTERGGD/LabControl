import { useEffect, useMemo, useState } from "react";
import api from "../../hooks/useApi";
import { useToast } from "../../context/ToastContext";
import { todayISOInMexico } from "../../utils/timezone";

const titleCase = value => value ? value.toLowerCase().replace(/(?:^|\s)\S/g, letter => letter.toUpperCase()) : value;
const shortCareer = value => String(value || "")
  .replace(/^TÉCNICO SUPERIOR UNIVERSITARIO\s+EN\s+/i, "TSU en ")
  .replace(/^LICENCIATURA\s+EN\s+/i, "Licenciatura en ");

const emptyRecord = alumno => ({
  alumno_id: alumno.id,
  nombre: alumno.nombre,
  matricula: alumno.matricula,
  asistio: true,
  comentarios: "",
  nota_abierta: false,
  requiere_canalizacion: false,
  canalizacion: { area: "ASESORIA_ACADEMICA", motivo: "" },
});

export default function RegistroSesionTutoria({ grupo, alumnos, onClose, onGuardado }) {
  const { toast } = useToast();
  const draftKey = `siga:tutoria:f-dc-07:${grupo.id}`;
  const draft = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(draftKey) || "null"); } catch { return null; }
  }, [draftKey]);
  const [form, setForm] = useState(draft?.form || {
    fecha: todayISOInMexico(), hora_inicio: "", duracion_minutos: 60, lugar: "",
    tipo_sesion: "GRUPAL", programacion_id: "", alumno_id: alumnos[0]?.id || "",
    categoria: "ACADEMICO", categoria_otro: "", tema: "",
    acciones_preventivas: "", observaciones_generales: "",
  });
  const [registros, setRegistros] = useState(() => {
    const saved = new Map((draft?.registros || []).map(record => [String(record.alumno_id), record]));
    return alumnos.map(alumno => ({ ...emptyRecord(alumno), ...(saved.get(String(alumno.id)) || {}) }));
  });
  const [programaciones, setProgramaciones] = useState([]);
  const [guardadoEn, setGuardadoEn] = useState(draft?.guardadoEn || null);
  const [dirty, setDirty] = useState(Boolean(draft));
  const [loading, setLoading] = useState(false);

  const updateForm = patch => { setForm(current => ({ ...current, ...patch })); setDirty(true); };
  const updateRecord = (index, patch) => {
    setRegistros(current => current.map((record, position) => position === index ? { ...record, ...patch } : record));
    setDirty(true);
  };

  useEffect(() => {
    api.get(`/tutoria/programaciones?grupo_id=${grupo.id}`)
      .then(({ data }) => setProgramaciones(data.filter(item => item.estado === "PROGRAMADA")))
      .catch(() => setProgramaciones([]));
  }, [grupo.id]);

  useEffect(() => {
    if (!dirty) return undefined;
    const timer = setTimeout(() => {
      const timestamp = new Date().toISOString();
      localStorage.setItem(draftKey, JSON.stringify({ form, registros, guardadoEn: timestamp }));
      setGuardadoEn(timestamp);
    }, 500);
    return () => clearTimeout(timer);
  }, [dirty, draftKey, form, registros]);

  useEffect(() => {
    const preventLoss = event => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  const selectedRecords = form.tipo_sesion === "INDIVIDUAL"
    ? registros.filter(record => String(record.alumno_id) === String(form.alumno_id))
    : registros;
  const present = selectedRecords.filter(record => record.asistio).length;
  const withNote = selectedRecords.filter(record => record.comentarios.trim()).length;
  const withReferral = selectedRecords.filter(record => record.requiere_canalizacion).length;
  const selectedSchedule = programaciones.find(item => String(item.id) === String(form.programacion_id));

  const leave = () => {
    if (dirty && !window.confirm("Hay cambios guardados como borrador. ¿Deseas salir del registro?")) return;
    onClose();
  };

  const selectSchedule = id => {
    const schedule = programaciones.find(item => String(item.id) === String(id));
    updateForm({ programacion_id: id, ...(schedule ? { fecha: schedule.fecha_programada } : {}) });
  };

  const save = async () => {
    if (!form.fecha || !form.hora_inicio) return toast("Indica fecha y hora de inicio", "error");
    if (!form.tema.trim()) return toast("Describe el tema tratado", "error");
    if (form.categoria === "OTRO" && !form.categoria_otro.trim()) return toast("Especifica la categoría Otro", "error");
    if (form.tipo_sesion === "INDIVIDUAL" && !form.alumno_id) return toast("Selecciona al alumno", "error");
    if (selectedRecords.some(record => record.requiere_canalizacion && (!record.canalizacion.area || !record.canalizacion.motivo.trim()))) {
      return toast("Completa el área y motivo de cada canalización", "error");
    }
    const day = new Date(`${form.fecha}T12:00:00`).getDay();
    if ((day === 0 || day === 6) && !window.confirm("La fecha cae en fin de semana. ¿Deseas registrar una sesión extraordinaria?")) return;

    setLoading(true);
    try {
      const { alumno_id, ...sessionFields } = form;
      await api.post("/tutoria/sesiones", {
        grupo_tutorado_id: grupo.id,
        ...sessionFields,
        programacion_id: form.tipo_sesion === "GRUPAL" && form.programacion_id ? Number(form.programacion_id) : null,
        registros: selectedRecords.map(({ nombre, matricula, nota_abierta, ...record }) => record),
      });
      localStorage.removeItem(draftKey);
      setDirty(false);
      toast("Sesión F-DC-07 registrada correctamente", "success");
      onGuardado();
    } catch (error) {
      toast(error.response?.data?.detail || "Error al guardar sesión", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-8 text-white">
      <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/70">
        <header className="border-b border-slate-700 p-5 md:p-6">
          <button type="button" onClick={leave} className="mb-3 text-sm font-medium text-emerald-400 hover:text-emerald-300">← Volver a Mis Tutorados</button>
          <h1 className="text-2xl font-bold">Registro de sesión tutorial</h1>
          <p className="mt-1 text-sm text-slate-400" title={grupo.carrera}>F-DC-07 · {shortCareer(grupo.carrera)} · {grupo.cuatrimestre}° {grupo.grupo} · {alumnos.length} alumnos</p>
          {form.tipo_sesion === "GRUPAL" ? (
            <p className="mt-3 inline-flex rounded-lg border-l-2 border-emerald-400 bg-slate-800 px-3 py-2 text-xs text-slate-300">
              {selectedSchedule ? `Vinculada a la sesión programada del ${new Date(`${selectedSchedule.fecha_programada}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}` : "Sesión grupal sin programación seleccionada"}
            </p>
          ) : <p className="mt-3 inline-flex rounded-lg border-l-2 border-sky-300 bg-slate-800 px-3 py-2 text-xs text-slate-300">Sesión individual · no completa una programación grupal</p>}
        </header>

        <div className="space-y-6 p-5 md:p-6">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800 p-1">
            {["GRUPAL", "INDIVIDUAL"].map(type => <button key={type} type="button" onClick={() => updateForm({ tipo_sesion: type, programacion_id: type === "INDIVIDUAL" ? "" : form.programacion_id })} className={`rounded-lg px-4 py-2 text-sm font-semibold ${form.tipo_sesion === type ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}>{type === "GRUPAL" ? "Grupal" : "Individual"}</button>)}
          </div>

          <div className={`grid grid-cols-1 gap-4 ${form.tipo_sesion === "INDIVIDUAL" ? "md:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-5"}`}>
            {form.tipo_sesion === "INDIVIDUAL" && <Field label="Alumno *" wide><select value={form.alumno_id} onChange={event => updateForm({ alumno_id: event.target.value })} className="input-dark w-full"><option value="">Seleccionar alumno</option>{alumnos.map(alumno => <option key={alumno.id} value={alumno.id}>{titleCase(alumno.nombre)} · {alumno.matricula}</option>)}</select></Field>}
            {form.tipo_sesion === "GRUPAL" && <Field label="Sesión programada" wide><select value={form.programacion_id} onChange={event => selectSchedule(event.target.value)} className="input-dark w-full"><option value="">Sin vínculo explícito</option>{programaciones.map(item => <option key={item.id} value={item.id}>{new Date(`${item.fecha_programada}T12:00:00`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}{item.objetivo ? ` · ${item.objetivo}` : ""}</option>)}</select></Field>}
            <Field label="Fecha *"><input type="date" value={form.fecha} onChange={event => updateForm({ fecha: event.target.value, programacion_id: "" })} className="input-dark w-full" /></Field>
            <Field label="Hora de inicio *"><input type="time" value={form.hora_inicio} onChange={event => updateForm({ hora_inicio: event.target.value })} className="input-dark w-full" /></Field>
            <Field label="Duración"><select value={form.duracion_minutos} onChange={event => updateForm({ duracion_minutos: Number(event.target.value) })} className="input-dark w-full">{[30,45,60,90,120].map(minutes => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select></Field>
            {form.tipo_sesion === "GRUPAL" && <Field label="Lugar"><input value={form.lugar} onChange={event => updateForm({ lugar: event.target.value })} className="input-dark w-full" placeholder="Salón o espacio" /></Field>}
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/35">
            <div className="border-b border-slate-700 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-400">{form.tipo_sesion === "GRUPAL" ? "Tema de la sesión" : "Registro de la sesión"}</div>
            <div className="space-y-4 p-5">
              <fieldset><legend className="mb-2 text-xs font-medium text-slate-400">Categoría *</legend><div className="flex flex-wrap gap-2">{[["ACADEMICO","Académico"],["PERSONAL","Personal"],["OTRO","Otro…"]].map(([value,label]) => <button key={value} type="button" onClick={() => updateForm({ categoria: value })} className={`rounded-full border px-4 py-2 text-sm ${form.categoria === value ? "border-emerald-400 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-400"}`}>{label}</button>)}</div></fieldset>
              {form.categoria === "OTRO" && <Field label="Especifica la categoría *"><input value={form.categoria_otro} onChange={event => updateForm({ categoria_otro: event.target.value })} className="input-dark w-full" /></Field>}
              <Field label="Tema tratado *"><textarea rows={3} value={form.tema} onChange={event => updateForm({ tema: event.target.value })} className="input-dark w-full" /></Field>
              <Field label="Acciones preventivas acordadas"><textarea rows={3} value={form.acciones_preventivas} onChange={event => updateForm({ acciones_preventivas: event.target.value })} className="input-dark w-full" /></Field>
              <Field label="Observaciones generales"><textarea rows={2} value={form.observaciones_generales} onChange={event => updateForm({ observaciones_generales: event.target.value })} className="input-dark w-full" /></Field>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/20">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-5 py-3"><span className="text-xs font-bold uppercase tracking-widest text-slate-400">{form.tipo_sesion === "GRUPAL" ? "Asistencia" : "Atención individual"}</span><span className="text-xs text-slate-400">{selectedRecords.length} {selectedRecords.length === 1 ? "alumno" : "alumnos"} · {present} asistieron · {withNote} con nota · {withReferral} canalización</span></div>
            <div className="divide-y divide-slate-700/70">
              {registros.map((record, index) => {
                if (form.tipo_sesion === "INDIVIDUAL" && String(record.alumno_id) !== String(form.alumno_id)) return null;
                return <div key={record.alumno_id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" checked={record.asistio} onChange={event => updateRecord(index, { asistio: event.target.checked })} className="h-5 w-5 accent-emerald-500" /><span className={record.asistio ? "font-medium text-white" : "text-slate-400"}>{titleCase(record.nombre)} <span className="font-mono text-xs text-slate-500">{record.matricula}</span></span>{!record.asistio && <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">Faltó</span>}</label>
                    <button type="button" onClick={() => updateRecord(index, { nota_abierta: !record.nota_abierta })} className={`rounded-lg border px-3 py-1.5 text-xs ${record.nota_abierta || record.comentarios ? "border-emerald-500 text-emerald-300" : "border-slate-700 text-slate-400"}`}>Nota</button>
                    <button type="button" onClick={() => updateRecord(index, { requiere_canalizacion: !record.requiere_canalizacion })} className={`rounded-lg border px-3 py-1.5 text-xs ${record.requiere_canalizacion ? "border-amber-400 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"}`}>Canalizar…</button>
                  </div>
                  {(record.nota_abierta || record.comentarios) && <div className="ml-8 mt-3"><Field label="Nota individual"><textarea rows={2} value={record.comentarios} onChange={event => updateRecord(index, { comentarios: event.target.value })} className="input-dark w-full" /></Field></div>}
                  {record.requiere_canalizacion && <div className="ml-8 mt-3 grid gap-3 rounded-xl border-l-2 border-amber-400 bg-amber-500/10 p-4 md:grid-cols-2"><p className="md:col-span-2 text-xs font-semibold text-amber-300">Se generará una canalización F-DC-08 · requiere área y motivo</p><Field label="Área *"><select value={record.canalizacion.area} onChange={event => updateRecord(index, { canalizacion: { ...record.canalizacion, area: event.target.value } })} className="input-dark w-full"><option value="ASESORIA_ACADEMICA">Asesoría académica</option><option value="PSICOLOGIA">Psicología</option><option value="PEDAGOGIA">Pedagogía</option><option value="PERSONAL">Atención personal</option><option value="MEDICO">Servicio médico</option></select></Field><Field label="Motivo *"><input value={record.canalizacion.motivo} onChange={event => updateRecord(index, { canalizacion: { ...record.canalizacion, motivo: event.target.value } })} className="input-dark w-full" /></Field></div>}
                </div>;
              })}
            </div>
          </section>
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-slate-900 px-5 py-4 md:px-6">
          <p className="text-xs text-slate-400"><span className="font-semibold text-emerald-400">Borrador guardado</span>{guardadoEn ? ` · ${new Date(guardadoEn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · se conserva en este equipo` : ""}</p>
          <div className="flex gap-2"><button type="button" onClick={leave} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancelar</button><button type="button" onClick={save} disabled={loading} className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">{loading ? "Guardando…" : "Guardar sesión"}</button></div>
        </footer>
      </section>
      <p className="px-2 text-xs text-slate-500">Trazabilidad digital: el registro conserva usuario autenticado, fecha y hora de creación y versión vigente del F-DC-07.</p>
    </div>
  );
}

function Field({ label, children, wide = false }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>{children}</label>;
}
