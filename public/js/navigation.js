// Keep redirects on this site and avoid loops through the authentication page.
export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || /^[\/]{2}/.test(value)) return null;
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (/[\\\u0000-\u0020\u007f]/.test(value) || /[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith('//')) return null;
  const url = new URL(value, 'https://lume.invalid');
  if (url.origin !== 'https://lume.invalid' || /^\/entrar(?:\.html)?\/?$/i.test(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

export function loginDestination(user, next) {
  return safeNext(next) || (user.role === 'admin' ? '/admin' : '/descobrir');
}
