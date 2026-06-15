export function getApiErrorMessage(error, fallback = 'Ocurrió un error inesperado') {
  const detail = error?.response?.data?.detail;

  if (!detail) return error?.message || fallback;
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map(item => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return String(item);

        const field = Array.isArray(item.loc)
          ? item.loc.filter(part => part !== 'body').join('.')
          : '';
        return [field, item.msg].filter(Boolean).join(': ');
      })
      .filter(Boolean);

    return messages.join(' · ') || fallback;
  }

  if (typeof detail === 'object') {
    return detail.msg || detail.message || fallback;
  }

  return String(detail);
}
