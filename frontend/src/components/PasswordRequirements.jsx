import React from 'react';

export const PASSWORD_RULES = [
  { label: '10 caracteres como mínimo', test: value => value.length >= 10 },
  { label: 'Una letra mayúscula', test: value => /[A-Z]/.test(value) },
  { label: 'Una letra minúscula', test: value => /[a-z]/.test(value) },
  { label: 'Un número', test: value => /\d/.test(value) },
  { label: 'Un símbolo', test: value => /[^A-Za-z0-9]/.test(value) },
];

export function isStrongPassword(value) {
  return PASSWORD_RULES.every(rule => rule.test(value));
}

export default function PasswordRequirements({ value = '' }) {
  const passed = PASSWORD_RULES.filter(rule => rule.test(value)).length;
  const width = `${(passed / PASSWORD_RULES.length) * 100}%`;
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full transition-all ${passed === 5 ? 'bg-emerald-600' : passed >= 3 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width }} />
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PASSWORD_RULES.map(rule => {
          const ok = rule.test(value);
          return <span key={rule.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span>{rule.label}
          </span>;
        })}
      </div>
    </div>
  );
}
