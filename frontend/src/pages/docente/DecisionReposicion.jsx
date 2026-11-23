import { useId } from 'react';

export default function DecisionReposicion({ value, onChange }) {
  const grupo = useId();

  return (
    <fieldset className="space-y-2 rounded-xl border border-white/10 p-3 text-sm text-slate-300">
      <legend className="px-1 font-semibold text-slate-200">¿Se repondrá esta clase?</legend>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="radio" name={grupo} checked={value === true} onChange={() => onChange(true)} />
        Sí, queda pendiente de programar
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="radio" name={grupo} checked={value === false} onChange={() => onChange(false)} />
        No, cerrar sin reposición
      </label>
    </fieldset>
  );
}
