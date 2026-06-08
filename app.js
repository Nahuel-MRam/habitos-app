// ═══════════════════════════════════════════════════════════════
//  CONFIGURACIÓN BASE
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  PASSWORD_USER:  "soyfeliz",
  PASSWORD_ADMIN: "admin",
  GITHUB_USER:    "Nahuel-MRam",
  GITHUB_REPO:    "habitos-storage",
  PUNTOS_POR_OBJETIVO: 10,
  SYNC_INTERVAL_MS: 30000, // 30 segundos
};

// ═══════════════════════════════════════════════════════════════
//  TOKEN
// ═══════════════════════════════════════════════════════════════

function getToken() { return localStorage.getItem('habitos_admin_token') || ""; }
function setToken(t) { localStorage.setItem('habitos_admin_token', t); }

// ═══════════════════════════════════════════════════════════════
//  CONFIG DINÁMICA
// ═══════════════════════════════════════════════════════════════

const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

const CONFIG_DEFAULT = {
  objetivos: [
    {
      id: "caminata",
      titulo: "Caminata diaria",
      descripcion: "Salí a caminar y sacá una foto del lugar al que llegaste.",
      emoji: "🏃",
      horaInicio: 7, minInicio: 0,
      horaFin: 21,   minFin: 0,
      dias: [1,2,3,4,5],
      activo: true,
    }
  ],
};

let appConfig = JSON.parse(JSON.stringify(CONFIG_DEFAULT));

function objetivosDeHoy() {
  const dia = new Date().getDay();
  return appConfig.objetivos.filter(o => o.activo && o.dias.includes(dia));
}

// ═══════════════════════════════════════════════════════════════
//  ESTADO
// ═══════════════════════════════════════════════════════════════

let rol         = null;
let timers      = {};
let syncTimer   = null;
let registros   = {};

// ═══════════════════════════════════════════════════════════════
//  GITHUB — URLs
// ═══════════════════════════════════════════════════════════════

const BASE_URL       = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents`;
const CONFIG_URL     = `${BASE_URL}/config.json`;
const REGISTROS_URL  = `${BASE_URL}/registros.json`;

function ghHeaders() {
  return { 'Authorization': `token ${getToken()}`, 'Content-Type': 'application/json' };
}

// ═══════════════════════════════════════════════════════════════
//  GITHUB — leer archivo
// ═══════════════════════════════════════════════════════════════

async function ghGet(url) {
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return { sha: data.sha, content: JSON.parse(atob(data.content.replace(/\n/g, ''))) };
}

// ═══════════════════════════════════════════════════════════════
//  GITHUB — guardar archivo
// ═══════════════════════════════════════════════════════════════

async function ghPut(url, content, sha, message) {
  const json    = JSON.stringify(content, null, 2);
  const bytes   = new TextEncoder().encode(json);
  const binary  = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  const encoded = btoa(binary);
  const body    = { message, content: encoded };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json()).message || 'Error al guardar');
  return (await res.json()).content.sha;
}

// ═══════════════════════════════════════════════════════════════
//  CONFIG REMOTA
// ═══════════════════════════════════════════════════════════════

async function cargarConfigRemota() {
  try {
    const data = await ghGet(CONFIG_URL);
    if (!data) return;
    appConfig = { ...CONFIG_DEFAULT, ...data.content };
    appConfig.objetivos = appConfig.objetivos.map(o => ({
      dias: [1,2,3,4,5], horaInicio: 7, minInicio: 0, horaFin: 21, minFin: 0, activo: true, ...o
    }));
  } catch (e) { console.warn('Config no disponible:', e); }
}

async function guardarConfigRemota() {
  const data = await ghGet(CONFIG_URL);
  await ghPut(CONFIG_URL, appConfig, data?.sha, 'actualizar config');
}

// ═══════════════════════════════════════════════════════════════
//  REGISTROS REMOTOS
// ═══════════════════════════════════════════════════════════════

let registrosSha = null;

async function cargarRegistrosRemotos() {
  try {
    const data = await ghGet(REGISTROS_URL);
    if (!data) { registros = {}; registrosSha = null; return; }
    registros    = data.content;
    registrosSha = data.sha;
  } catch (e) { console.warn('Registros no disponibles:', e); }
}

async function guardarRegistrosRemotos() {
  registrosSha = await ghPut(REGISTROS_URL, registros, registrosSha, 'actualizar registros');
}

// ═══════════════════════════════════════════════════════════════
//  SYNC — polling cada 30s
// ═══════════════════════════════════════════════════════════════

function iniciarSync() {
  detenerSync();
  syncTimer = setInterval(async () => {
    await cargarRegistrosRemotos();
    if (rol === 'user')  { renderObjetivosUsuario(); renderHistorialUsuario(); actualizarPuntos(); }
    if (rol === 'admin') { renderAdminPendientes(); renderAdminHistorial(); }
  }, CONFIG.SYNC_INTERVAL_MS);
}

function detenerSync() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function hoyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function registroKey(fecha, objId) { return `${fecha}_${objId}`; }
function nombreDia()  { return DIAS_SEMANA[new Date().getDay()]; }
function fechaLarga() {
  const d = new Date();
  const m = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d.getDate()} de ${m[d.getMonth()]}`;
}
function formatearFecha(key) {
  const partes = key.split('_')[0].split('-');
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}
function estaEnHorario(obj) {
  const ahora   = new Date();
  const totalMin = ahora.getHours() * 60 + ahora.getMinutes();
  const inicio  = obj.horaInicio * 60 + (obj.minInicio || 0);
  const fin     = obj.horaFin   * 60 + (obj.minFin    || 0);
  return totalMin >= inicio && totalMin < fin;
}
function tiempoRestante(obj) {
  const fin = new Date();
  fin.setHours(obj.horaFin, obj.minFin || 0, 0, 0);
  const diff = fin - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function totalPuntos() {
  return Object.values(registros).filter(r => r.estado === 'aprobado').length * CONFIG.PUNTOS_POR_OBJETIVO;
}
function actualizarPuntos() {
  const el = document.getElementById('user-points-display');
  if (el) el.textContent = `${totalPuntos()} pts`;
}

// ═══════════════════════════════════════════════════════════════
//  GITHUB — subir foto
// ═══════════════════════════════════════════════════════════════

async function subirFotoGitHub(file, key, objId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const path   = `fotos/${key}_${objId}.jpg`;
      const url    = `${BASE_URL}/${path}`;
      try {
        const res = await fetch(url, {
          method: 'PUT', headers: ghHeaders(),
          body: JSON.stringify({ message: `foto ${key} ${objId}`, content: base64 }),
        });
        if (!res.ok) { reject(new Error((await res.json()).message)); return; }
        resolve((await res.json()).content.download_url);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsDataURL(file);
  });
}

async function eliminarFotoGitHub(fotoUrl) {
  try {
    const match = fotoUrl.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)/);
    if (!match) return;
    const url  = `${BASE_URL}/${match[1]}`;
    const data = await ghGet(url);
    if (!data) return;
    await fetch(url, {
      method: 'DELETE', headers: ghHeaders(),
      body: JSON.stringify({ message: 'eliminar foto', sha: data.sha }),
    });
  } catch (e) { console.warn('No se pudo eliminar foto:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  VALIDAR TOKEN
// ═══════════════════════════════════════════════════════════════

async function validarToken(token) {
  try {
    const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    return res.ok;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
//  PANTALLAS
// ═══════════════════════════════════════════════════════════════

function mostrarPantalla(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
//  SETUP TOKEN
// ═══════════════════════════════════════════════════════════════

document.getElementById('token-btn').addEventListener('click', guardarTokenInicial);
document.getElementById('token-input').addEventListener('keydown', e => { if (e.key === 'Enter') guardarTokenInicial(); });

async function guardarTokenInicial() {
  const token = document.getElementById('token-input').value.trim();
  const error = document.getElementById('token-error');
  const btn   = document.getElementById('token-btn');
  if (!token) return;
  btn.disabled = true; btn.textContent = 'Verificando...';
  if (await validarToken(token)) {
    setToken(token); document.getElementById('token-input').value = '';
    error.classList.add('hidden'); iniciarAdmin(); mostrarPantalla('screen-admin');
  } else { error.classList.remove('hidden'); }
  btn.disabled = false; btn.textContent = 'Guardar token';
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════

document.getElementById('login-btn').addEventListener('click', hacerLogin);
document.getElementById('login-input').addEventListener('keydown', e => { if (e.key === 'Enter') hacerLogin(); });

function hacerLogin() {
  const pass  = document.getElementById('login-input').value.trim();
  const error = document.getElementById('login-error');
  if (pass === CONFIG.PASSWORD_ADMIN) {
    rol = 'admin'; error.classList.add('hidden');
    document.getElementById('login-input').value = '';
    if (getToken()) { iniciarAdmin(); mostrarPantalla('screen-admin'); }
    else mostrarPantalla('screen-token');
  } else if (pass === CONFIG.PASSWORD_USER) {
    rol = 'user'; error.classList.add('hidden');
    document.getElementById('login-input').value = '';
    mostrarPantalla('screen-user'); iniciarUsuario();
  } else { error.classList.remove('hidden'); }
}

// ═══════════════════════════════════════════════════════════════
//  VISTA USUARIO
// ═══════════════════════════════════════════════════════════════

async function iniciarUsuario() {
  document.getElementById('user-day-chip').textContent = nombreDia() + ", " + fechaLarga();
  document.getElementById('user-loading').classList.remove('hidden');
  document.getElementById('objectives-list').classList.add('hidden');
  document.getElementById('user-history-section').classList.add('hidden');

  await Promise.all([cargarConfigRemota(), cargarRegistrosRemotos()]);

  document.getElementById('user-loading').classList.add('hidden');
  actualizarPuntos();
  renderObjetivosUsuario();
  renderHistorialUsuario();
  iniciarSync();
}

function limpiarTimers() {
  Object.values(timers).forEach(t => clearInterval(t));
  timers = {};
}

function renderObjetivosUsuario() {
  limpiarTimers();
  const lista = document.getElementById('objectives-list');
  const hoy   = hoyKey();
  const objs  = objetivosDeHoy();
  lista.classList.remove('hidden');

  if (objs.length === 0) {
    const dia = new Date().getDay();
    lista.innerHTML = (dia === 0 || dia === 6)
      ? `<div class="obj-card"><div class="status-box status-rest"><span class="status-icon">😴</span><p>Día de descanso. ¡Volvé el lunes!</p></div></div>`
      : `<div class="obj-card"><div class="status-box status-rest"><span class="status-icon">📅</span><p>Hoy no tenés objetivos asignados.</p></div></div>`;
    return;
  }

  lista.innerHTML = objs.map(obj => renderTarjetaObjetivo(obj, hoy)).join('');

  // Timers de cuenta regresiva
  objs.forEach(obj => {
    const rk      = registroKey(hoy, obj.id);
    const reg     = registros[rk];
    const activo  = estaEnHorario(obj) && (!reg || reg.estado === 'rechazado');
    if (!activo) return;
    timers[obj.id] = setInterval(() => {
      const el = document.getElementById(`timer-${obj.id}`);
      if (!el) { clearInterval(timers[obj.id]); return; }
      const t = tiempoRestante(obj);
      if (!t) { clearInterval(timers[obj.id]); renderObjetivosUsuario(); }
      else el.textContent = `⏱ ${t} restantes`;
    }, 1000);
  });

  // Eventos de upload
  objs.forEach(obj => {
    const pickBtn  = document.getElementById(`pick-${obj.id}`);
    const fileInput = document.getElementById(`file-${obj.id}`);
    const sendBtn  = document.getElementById(`send-${obj.id}`);
    const changeBtn = document.getElementById(`change-${obj.id}`);
    if (!pickBtn) return;

    pickBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        document.getElementById(`preview-img-${obj.id}`).src = ev.target.result;
        document.getElementById(`preview-wrap-${obj.id}`).classList.remove('hidden');
        pickBtn.classList.add('hidden');
        document.querySelector(`#upload-area-${obj.id} .upload-hint`).classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });

    changeBtn.addEventListener('click', () => {
      fileInput.value = '';
      document.getElementById(`preview-wrap-${obj.id}`).classList.add('hidden');
      pickBtn.classList.remove('hidden');
      document.querySelector(`#upload-area-${obj.id} .upload-hint`).classList.remove('hidden');
    });

    sendBtn.addEventListener('click', async () => {
      const file = fileInput.files[0]; if (!file) return;
      const statusEl = document.getElementById(`upload-status-${obj.id}`);
      sendBtn.disabled = true; sendBtn.textContent = 'Subiendo...';
      statusEl.textContent = 'Subiendo foto...'; statusEl.classList.remove('hidden');
      try {
        const key = hoyKey();
        const url = await subirFotoGitHub(file, key, obj.id);
        const rk  = registroKey(key, obj.id);
        registros[rk] = { fecha: key, objetivo: obj.id, estado: 'enviado', fotoUrl: url, timestamp: Date.now() };
        await guardarRegistrosRemotos();
        actualizarPuntos();
        renderObjetivosUsuario();
        renderHistorialUsuario();
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        sendBtn.disabled = false; sendBtn.textContent = 'Enviar foto ✓';
      }
    });
  });
}

function renderTarjetaObjetivo(obj, hoy) {
  const rk       = registroKey(hoy, obj.id);
  const reg      = registros[rk];
  const enHorario = estaEnHorario(obj);
  const tiempo   = tiempoRestante(obj);
  const timerStr = (enHorario && tiempo && (!reg || reg.estado === 'rechazado'))
    ? `<span class="obj-timer" id="timer-${obj.id}">⏱ ${tiempo} restantes</span>` : '';

  let contenido = '';
  if (reg) {
    if (reg.estado === 'enviado') {
      contenido = `<div class="status-box status-sent"><span class="status-icon">⏳</span><p>Foto enviada. Esperando aprobación...</p></div>`;
    } else if (reg.estado === 'aprobado') {
      contenido = `<div class="status-box status-ok"><span class="status-icon">✅</span><p>¡Completado! +${CONFIG.PUNTOS_POR_OBJETIVO} pts</p></div>`;
    } else if (reg.estado === 'rechazado') {
      contenido = enHorario
        ? uploadAreaHTML(obj.id)
        : `<div class="status-box status-bad"><span class="status-icon">❌</span><p>Rechazado. El tiempo venció.</p></div>`;
    }
  } else if (!enHorario) {
    const h   = new Date().getHours();
    const msg = h < obj.horaInicio ? `Empieza a las ${obj.horaInicio}:00 hs.` : `El tiempo venció.`;
    contenido = `<div class="status-box status-warn"><span class="status-icon">🕐</span><p>${msg}</p></div>`;
  } else {
    contenido = uploadAreaHTML(obj.id);
  }

  return `
    <div class="obj-card" id="obj-card-${obj.id}">
      <div class="obj-tag">${obj.emoji} OBJETIVO</div>
      <h3 class="obj-title">${obj.titulo}</h3>
      <p class="obj-desc">${obj.descripcion}</p>
      <div class="obj-time-row">
        <span class="obj-time">⏰ ${String(obj.horaInicio).padStart(2,'0')}:${String(obj.minInicio||0).padStart(2,'0')} – ${String(obj.horaFin).padStart(2,'0')}:${String(obj.minFin||0).padStart(2,'0')} hs</span>
        ${timerStr}
      </div>
      ${contenido}
    </div>`;
}

function uploadAreaHTML(objId) {
  return `
    <div class="upload-area" id="upload-area-${objId}">
      <p class="upload-hint">📷 Subí tu foto para completar el objetivo</p>
      <input type="file" id="file-${objId}" accept="image/*" hidden />
      <button class="btn-primary" id="pick-${objId}">Elegir foto</button>
      <div id="preview-wrap-${objId}" class="preview-wrap hidden">
        <img id="preview-img-${objId}" src="" alt="preview" />
        <button class="btn-primary" id="send-${objId}">Enviar foto ✓</button>
        <button class="btn-ghost"   id="change-${objId}">Cambiar</button>
      </div>
      <p id="upload-status-${objId}" class="upload-status hidden"></p>
    </div>`;
}

function renderHistorialUsuario() {
  const lista   = document.getElementById('history-list');
  const section = document.getElementById('user-history-section');
  section.classList.remove('hidden');
  const items = Object.values(registros).sort((a,b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
  const objMap = {};
  appConfig.objetivos.forEach(o => { objMap[o.id] = o; });
  if (items.length === 0) { lista.innerHTML = '<li class="history-empty">Todavía no hay registros.</li>'; return; }
  lista.innerHTML = items.map(r => {
    const obj = objMap[r.objetivo] || { emoji: '🎯', titulo: r.objetivo };
    const icono = r.estado === 'aprobado' ? '✅' : r.estado === 'rechazado' ? '❌' : '⏳';
    const clase = r.estado === 'aprobado' ? 'status-text-ok' : r.estado === 'rechazado' ? 'status-text-bad' : 'status-text-sent';
    return `<li class="history-item">
      <span class="history-obj">${obj.emoji} ${obj.titulo}</span>
      <div class="history-right">
        <span class="history-date">${formatearFecha(r.fecha)}</span>
        <span class="history-status ${clase}">${icono}</span>
      </div>
    </li>`;
  }).join('');
}

document.getElementById('logout-user').addEventListener('click', () => { limpiarTimers(); detenerSync(); cerrarSesion(); });

// ═══════════════════════════════════════════════════════════════
//  VISTA ADMIN
// ═══════════════════════════════════════════════════════════════

async function iniciarAdmin() {
  await Promise.all([cargarConfigRemota(), cargarRegistrosRemotos()]);
  renderAdminPendientes();
  renderAdminHistorial();
  renderConfigPanel();
  iniciarSync();
}

function renderAdminPendientes() {
  const contenedor = document.getElementById('pending-list');
  const pendientes = Object.values(registros).filter(r => r.estado === 'enviado').sort((a,b) => b.fecha.localeCompare(a.fecha));
  if (pendientes.length === 0) { contenedor.innerHTML = '<p class="empty-msg">No hay fotos pendientes.</p>'; return; }
  contenedor.innerHTML = pendientes.map(r => tarjetaRevision(r, true)).join('');
  bindAdminCards(contenedor);
}

function renderAdminHistorial() {
  const contenedor = document.getElementById('admin-history-list');
  const revisados  = Object.values(registros).filter(r => r.estado !== 'enviado').sort((a,b) => b.fecha.localeCompare(a.fecha));
  if (revisados.length === 0) { contenedor.innerHTML = '<p class="empty-msg">Sin registros revisados aún.</p>'; return; }
  contenedor.innerHTML = revisados.map(r => tarjetaRevision(r, false)).join('');
  bindAdminCards(contenedor);
}

function bindAdminCards(contenedor) {
  contenedor.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', () => cambiarEstado(btn.dataset.key, 'aprobado')));
  contenedor.querySelectorAll('.btn-reject' ).forEach(btn => btn.addEventListener('click', () => cambiarEstado(btn.dataset.key, 'rechazado')));
  contenedor.querySelectorAll('.btn-delete' ).forEach(btn => btn.addEventListener('click', () => eliminarRegistro(btn.dataset.key)));
}

function tarjetaRevision(r, conAcciones) {
  const objMap = {};
  appConfig.objetivos.forEach(o => { objMap[o.id] = o; });
  const obj        = objMap[r.objetivo] || { emoji: '🎯', titulo: r.objetivo };
  const rk         = registroKey(r.fecha, r.objetivo);
  const badgeClass = r.estado === 'aprobado' ? 'badge-ok' : r.estado === 'rechazado' ? 'badge-bad' : 'badge-sent';
  const badgeTexto = r.estado === 'aprobado' ? 'Aprobado' : r.estado === 'rechazado' ? 'Rechazado' : 'Pendiente';

  const acciones = conAcciones
    ? `<div class="review-card-actions">
        <button class="btn-approve" data-key="${rk}">✅ Aprobar</button>
        <button class="btn-reject"  data-key="${rk}">❌ Rechazar</button>
        <button class="btn-delete"  data-key="${rk}">🗑</button>
       </div>`
    : `<div class="review-card-actions">
        <span class="review-badge ${badgeClass}">${badgeTexto}</span>
        <button class="btn-delete" data-key="${rk}">🗑 Eliminar</button>
       </div>`;

  return `
    <div class="review-card">
      <div class="review-card-header">
        <span class="review-card-date">${formatearFecha(r.fecha)}</span>
        <span class="review-card-obj">${obj.emoji} ${obj.titulo}</span>
      </div>
      <img src="${r.fotoUrl}" alt="foto" loading="lazy" />
      ${acciones}
    </div>`;
}

async function cambiarEstado(rk, nuevoEstado) {
  if (!registros[rk]) return;
  registros[rk].estado = nuevoEstado;
  try {
    await guardarRegistrosRemotos();
    renderAdminPendientes();
    renderAdminHistorial();
  } catch (e) { alert(`Error al guardar: ${e.message}`); }
}

async function eliminarRegistro(rk) {
  if (!confirm('¿Eliminar este registro?')) return;
  const fotoUrl = registros[rk]?.fotoUrl;
  delete registros[rk];
  try {
    await guardarRegistrosRemotos();
    renderAdminPendientes();
    renderAdminHistorial();
    if (fotoUrl) await eliminarFotoGitHub(fotoUrl);
  } catch (e) { alert(`Error: ${e.message}`); }
}

document.getElementById('logout-admin').addEventListener('click', () => { detenerSync(); cerrarSesion(); });

// ═══════════════════════════════════════════════════════════════
//  PANEL DE CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════

function renderConfigPanel() { renderListaObjetivos(); }

function checkboxesDias(dias) {
  return [[1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[0,'Dom']].map(([v, n]) =>
    `<label class="dia-check"><input type="checkbox" value="${v}" ${dias.includes(v) ? 'checked' : ''}/>${n}</label>`
  ).join('');
}

function renderListaObjetivos() {
  const lista = document.getElementById('cfg-objetivos-lista');
  if (!appConfig.objetivos.length) { lista.innerHTML = '<p class="empty-msg">No hay objetivos.</p>'; return; }
  lista.innerHTML = appConfig.objetivos.map((o, i) => `
    <div class="cfg-obj-item-full">
      <div class="cfg-obj-header">
        <span class="cfg-obj-emoji">${o.emoji}</span>
        <div class="cfg-obj-info"><strong>${o.titulo}</strong><small>${o.descripcion}</small></div>
        <label class="toggle-switch">
          <input type="checkbox" class="cfg-toggle-activo" data-index="${i}" ${o.activo ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
        ${appConfig.objetivos.length > 1 ? `<button class="btn-ghost btn-small cfg-eliminar-obj" data-index="${i}">✕</button>` : ''}
      </div>
      <div class="cfg-obj-horario">
        <!-- Editar título, emoji y descripción -->
        <div class="cfg-inline-row">
          <input type="text" class="cfg-edit-emoji" data-index="${i}" value="${o.emoji}" maxlength="4" style="width:60px;flex-shrink:0" />
          <input type="text" class="cfg-edit-titulo" data-index="${i}" value="${o.titulo}" style="flex:1" />
        </div>
        <textarea class="cfg-edit-desc" data-index="${i}" rows="2">${o.descripcion}</textarea>
        <!-- Horario con minutos -->
        <div class="config-row">
          <div class="config-field">
            <label>Desde</label>
            <input type="number" class="cfg-obj-inicio" data-index="${i}" min="0" max="23" value="${o.horaInicio}" style="width:50px"/>
            <span class="config-unit">h</span>
            <input type="number" class="cfg-obj-min-inicio" data-index="${i}" min="0" max="59" value="${o.minInicio||0}" style="width:50px"/>
            <span class="config-unit">m</span>
          </div>
          <div class="config-field">
            <label>Hasta</label>
            <input type="number" class="cfg-obj-fin" data-index="${i}" min="0" max="23" value="${o.horaFin}" style="width:50px"/>
            <span class="config-unit">h</span>
            <input type="number" class="cfg-obj-min-fin" data-index="${i}" min="0" max="59" value="${o.minFin||0}" style="width:50px"/>
            <span class="config-unit">m</span>
          </div>
        </div>
        <div class="dias-wrap">${checkboxesDias(o.dias)}</div>
        <button class="btn-primary cfg-guardar-obj" data-index="${i}">Guardar cambios</button>
        <p class="config-status hidden" id="cfg-obj-status-${i}"></p>
      </div>
    </div>`).join('');

  lista.querySelectorAll('.cfg-eliminar-obj').forEach(btn => btn.addEventListener('click', () => eliminarObjetivo(parseInt(btn.dataset.index))));
  lista.querySelectorAll('.cfg-guardar-obj').forEach(btn => btn.addEventListener('click', () => guardarCambiosObjetivo(parseInt(btn.dataset.index))));
  lista.querySelectorAll('.cfg-toggle-activo').forEach(cb => cb.addEventListener('change', () => toggleActivo(parseInt(cb.dataset.index), cb.checked)));
}

async function toggleActivo(index, activo) {
  appConfig.objetivos[index].activo = activo;
  try { await guardarConfigRemota(); }
  catch (e) { alert(`Error: ${e.message}`); appConfig.objetivos[index].activo = !activo; renderListaObjetivos(); }
}

async function guardarCambiosObjetivo(index) {
  const obj      = appConfig.objetivos[index];
  const emoji    = document.querySelector(`.cfg-edit-emoji[data-index="${index}"]`).value.trim();
  const titulo   = document.querySelector(`.cfg-edit-titulo[data-index="${index}"]`).value.trim();
  const desc     = document.querySelector(`.cfg-edit-desc[data-index="${index}"]`).value.trim();
  const inicio   = parseInt(document.querySelector(`.cfg-obj-inicio[data-index="${index}"]`).value);
  const minIni   = parseInt(document.querySelector(`.cfg-obj-min-inicio[data-index="${index}"]`).value) || 0;
  const fin      = parseInt(document.querySelector(`.cfg-obj-fin[data-index="${index}"]`).value);
  const minFin   = parseInt(document.querySelector(`.cfg-obj-min-fin[data-index="${index}"]`).value) || 0;
  const items    = document.querySelectorAll('.cfg-obj-item-full');
  const dias     = [...items[index].querySelectorAll('.dias-wrap input:checked')].map(cb => parseInt(cb.value));
  const status   = document.getElementById(`cfg-obj-status-${index}`);

  if (!emoji || !titulo || !desc) { mostrarStatus(status, '❌ Completá título, emoji y descripción.', false); return; }
  const totalInicio = inicio * 60 + minIni;
  const totalFin    = fin    * 60 + minFin;
  if (isNaN(inicio) || isNaN(fin) || totalInicio >= totalFin) { mostrarStatus(status, '❌ Horario inválido.', false); return; }
  if (!dias.length) { mostrarStatus(status, '❌ Seleccioná al menos un día.', false); return; }

  obj.emoji = emoji; obj.titulo = titulo; obj.descripcion = desc;
  obj.horaInicio = inicio; obj.minInicio = minIni;
  obj.horaFin    = fin;    obj.minFin    = minFin;
  obj.dias = dias;

  const btn = document.querySelector(`.cfg-guardar-obj[data-index="${index}"]`);
  btn.disabled = true; btn.textContent = 'Guardando...';
  try { await guardarConfigRemota(); mostrarStatus(status, '✅ Guardado.', true); renderListaObjetivos(); }
  catch (e) { mostrarStatus(status, `❌ ${e.message}`, false); }
  finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
}

document.getElementById('cfg-agregar-obj').addEventListener('click', async () => {
  const emoji  = document.getElementById('cfg-obj-emoji').value.trim();
  const titulo = document.getElementById('cfg-obj-titulo').value.trim();
  const desc   = document.getElementById('cfg-obj-desc').value.trim();
  const inicio  = parseInt(document.getElementById('cfg-obj-inicio').value);
  const minIni  = parseInt(document.getElementById('cfg-obj-min-inicio').value) || 0;
  const fin     = parseInt(document.getElementById('cfg-obj-fin').value);
  const minFin  = parseInt(document.getElementById('cfg-obj-min-fin').value) || 0;
  const dias    = [...document.querySelectorAll('#cfg-nuevo-dias input:checked')].map(cb => parseInt(cb.value));
  const status  = document.getElementById('cfg-obj-status');
  if (!emoji || !titulo || !desc) { mostrarStatus(status, '❌ Completá todos los campos.', false); return; }
  const totalInicio = inicio * 60 + minIni;
  const totalFin    = fin    * 60 + minFin;
  if (isNaN(inicio) || isNaN(fin) || totalInicio >= totalFin) { mostrarStatus(status, '❌ Horario inválido.', false); return; }
  if (!dias.length) { mostrarStatus(status, '❌ Seleccioná al menos un día.', false); return; }
  const id = titulo.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (appConfig.objetivos.find(o => o.id === id)) { mostrarStatus(status, '❌ Ya existe ese objetivo.', false); return; }
  appConfig.objetivos.push({ id, titulo, descripcion: desc, emoji, horaInicio: inicio, minInicio: minIni, horaFin: fin, minFin: minFin, dias, activo: true });
  const btn = document.getElementById('cfg-agregar-obj');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await guardarConfigRemota();
    document.getElementById('cfg-obj-emoji').value = '';
    document.getElementById('cfg-obj-titulo').value = '';
    document.getElementById('cfg-obj-desc').value = '';
    document.getElementById('cfg-obj-inicio').value = '7';
    document.getElementById('cfg-obj-min-inicio').value = '0';
    document.getElementById('cfg-obj-fin').value = '21';
    document.getElementById('cfg-obj-min-fin').value = '0';
    document.querySelectorAll('#cfg-nuevo-dias input').forEach(cb => { cb.checked = [1,2,3,4,5].includes(parseInt(cb.value)); });
    renderListaObjetivos();
    mostrarStatus(status, '✅ Objetivo agregado.', true);
  } catch (e) { appConfig.objetivos.pop(); mostrarStatus(status, `❌ ${e.message}`, false); }
  finally { btn.disabled = false; btn.textContent = 'Agregar objetivo'; }
});

async function eliminarObjetivo(index) {
  if (!confirm(`¿Eliminar "${appConfig.objetivos[index].titulo}"?`)) return;
  const eliminado = appConfig.objetivos.splice(index, 1)[0];
  try { await guardarConfigRemota(); renderListaObjetivos(); }
  catch (e) { appConfig.objetivos.splice(index, 0, eliminado); alert(`Error: ${e.message}`); }
}

document.getElementById('cfg-guardar-token').addEventListener('click', async () => {
  const token  = document.getElementById('cfg-token-input').value.trim();
  const status = document.getElementById('cfg-token-status');
  if (!token) return;
  const btn = document.getElementById('cfg-guardar-token');
  btn.disabled = true; btn.textContent = 'Verificando...';
  if (await validarToken(token)) {
    setToken(token); document.getElementById('cfg-token-input').value = '';
    mostrarStatus(status, '✅ Token actualizado.', true);
  } else { mostrarStatus(status, '❌ Token inválido.', false); }
  btn.disabled = false; btn.textContent = 'Actualizar token';
});

function mostrarStatus(el, msg, ok) {
  el.textContent = msg;
  el.className   = `config-status ${ok ? 'config-status-ok' : 'config-status-err'}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ═══════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════

function cerrarSesion() { rol = null; limpiarTimers(); detenerSync(); mostrarPantalla('screen-login'); }