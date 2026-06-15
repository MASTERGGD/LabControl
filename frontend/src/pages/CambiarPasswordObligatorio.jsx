import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

const ROLES_REDIRECT = {
  SUPER_ADMIN: '/admin',
  LAB_ADMIN: '/lab',
  TUTORIA_ADMIN: '/admin/tutoria',
  SERVICIOS_ESCOLARES: '/servicios-escolares',
  DOCENTE: '/docente',
  ALUMNO: '/alumno/estudio-socioeconomico',
};

/**
 * Pantalla de cambio de contraseña OBLIGATORIO.
 *
 * Se muestra cuando el usuario tiene debe_cambiar_password=true (p. ej. el
 * admin sembrado o tras un reseteo administrativo). El backend bloquea todos
 * los endpoints excepto /auth/me, /usuarios/me/password y /auth/sessions
 * mientras el flag esté activo, así que no hay forma de saltarse esta pantalla.
 */
export default function CambiarPasswordObligatorio() {
  const navigate = useNavigate();
  const { usuario, login } = useAuth();

  const [form, setForm] = useState({ password_actual: '', password_nuevo: '', confirmar: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!usuario) return <Navigate to="/login" replace />;
  if (!usuario.debe_cambiar_password) {
    return <Navigate to={ROLES_REDIRECT[usuario.rol] || '/'} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password_nuevo !== form.confirmar) { setError('Las contraseñas no coinciden'); return; }
    if (form.password_nuevo.length < 8) { setError('Mínimo 8 caracteres'); return; }
    setLoading(true); setError('');
    try {
      await api.put('/usuarios/me/password', {
        password_actual: form.password_actual,
        password_nuevo: form.password_nuevo,
      });
      // Actualizar el usuario en sesión: el flag ya quedó en false en backend.
      const token = sessionStorage.getItem('token');
      login({ ...usuario, debe_cambiar_password: false }, token);
      navigate(ROLES_REDIRECT[usuario.rol] || '/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #F5F7FA 0%, #EEF6F2 52%, #E6F3EC 100%)' }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-800">Cambio de contraseña obligatorio</h1>
          <p className="text-sm text-slate-500">
            Por seguridad, debes definir una nueva contraseña antes de usar el sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            ['password_actual', 'Contraseña actual', 'La contraseña temporal que recibiste'],
            ['password_nuevo', 'Nueva contraseña', 'Mínimo 8 caracteres'],
            ['confirmar', 'Confirmar nueva contraseña', 'Repite la nueva contraseña'],
          ].map(([field, label, placeholder]) => (
            <div key={field}>
              <label className="block text-sm text-slate-600 mb-1">{label}</label>
              <input
                type="password"
                required
                value={form[field]}
                onChange={(e) => { setForm({ ...form, [field]: e.target.value }); setError(''); }}
                placeholder={placeholder}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(90deg,#007A53,#00A36C)' }}
          >
            {loading ? 'Guardando…' : 'Cambiar contraseña y continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
