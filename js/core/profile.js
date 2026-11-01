// Perfil sem login: nome + avatar + um código secreto guardado no aparelho.
// O servidor usa o código para juntar as partidas no ranking global e nas estatísticas.
// Sem servidor (ex.: aberto como site estático), tudo continua funcionando só localmente.
import { AVATARS } from './multimodes.js';
import { getPlayerName, setPlayerName } from './ranking.js';

const KEY = 'trama.profile';
const AVATAR_KEY = 'trama.avatar';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const write = (p) => { try { p ? localStorage.setItem(KEY, JSON.stringify(p)) : localStorage.removeItem(KEY); } catch { /* ignore */ } };

export function getAvatar() {
  try { return localStorage.getItem(AVATAR_KEY) || AVATARS[0]; } catch { return AVATARS[0]; }
}
export function setAvatar(a) {
  try { localStorage.setItem(AVATAR_KEY, a); } catch { /* ignore */ }
}
export const localProfile = () => read();
export const profileToken = () => read()?.token || null;

let statusPromise = null;
// O servidor do Trama está disponível? (resultado guardado por alguns segundos)
export function serverStatus() {
  if (!statusPromise) {
    statusPromise = fetch('api/status').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setTimeout(() => (statusPromise = null), 15000);
  }
  return statusPromise;
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  const token = profileToken();
  if (token) headers['x-trama-perfil'] = token;
  const res = await fetch(`api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) throw Object.assign(new Error(data?.erro || `Erro ${res.status}`), { status: res.status, data });
  return data;
}

// Garante que existe um perfil no servidor com o nome/avatar atuais. Retorna null se offline.
export async function ensureProfile({ name = getPlayerName() || 'Jogador', avatar = getAvatar() } = {}) {
  if (!(await serverStatus())) return null;
  let p = read();
  try {
    if (!p?.token) {
      const c = await api('perfil', { method: 'POST', body: { name, avatar } });
      p = { id: c.id, token: c.token, name: c.name, avatar: c.avatar };
      write(p);
    } else if (p.name !== name || p.avatar !== avatar) {
      const u = await api('perfil', { method: 'PATCH', body: { name, avatar } });
      p = { ...p, name: u.perfil.name, avatar: u.perfil.avatar };
      write(p);
    }
    return p;
  } catch (e) {
    if (e.status === 404) { write(null); return ensureProfile({ name, avatar }); } // perfil sumiu do servidor
    return null;
  }
}

export async function saveIdentity(name, avatar) {
  setPlayerName(name);
  setAvatar(avatar);
  return ensureProfile({ name, avatar });
}

// Usar o mesmo perfil em outro aparelho: cola o código e confere no servidor.
export async function importProfileCode(code) {
  const token = String(code || '').trim();
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Código inválido');
  const res = await fetch('api/perfil', { headers: { 'x-trama-perfil': token } });
  if (!res.ok) throw new Error('Nenhum perfil com esse código');
  const { perfil } = await res.json();
  write({ id: perfil.id, token, name: perfil.name, avatar: perfil.avatar });
  setPlayerName(perfil.name);
  setAvatar(perfil.avatar);
  return perfil;
}
