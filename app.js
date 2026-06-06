// ═══════════════════════════════════════════════════════════════
//  CONFIGURACIÓN BASE
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  PASSWORD_USER:  "soyfeliz",
  PASSWORD_ADMIN: "admin",
  GITHUB_USER:    "Nahuel-MRam",
  GITHUB_REPO:    "habitos-storage",
  PUNTOS_POR_OBJETIVO: 10,
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
      horaInicio: 7,
      horaFin: 21,
      dias: [1,2,3,4,5],
      activo: true,
    }
  ],
};

let appConfig = JSON.parse(JSON.stringify(CONFIG_DEFAULT));

// Objetivos activos hoy
function objetivosDeHoy() {
  const dia = new Date().getDay();
  return appConfig.objetivos.filter(o => o.activo && o.dias.includes(dia));
}

// ═══════════════════════════════════════════════════════════════
//  ESTADO
// ═══════════════════════════════════════════════════════════════

let rol          = null;
let timers       = {}; // intervalos de cuenta regresiva por objetivo id
let uploadingId  = null; // qué objetivo se está subiendo

// ═══════════════════════════════════════════════════════════════
//  REGISTROS  — clave: "YYYY-MM-DD_objId"
// ═══════════════════════════════════════════════════════════════

function cargarRegistros() {
  try { return JSON.parse(localStorage.getItem('habitos_registros')) || {}; }
  catch { return {}; }
}
function guardarRegistros() { localStorage.setItem('habitos_registros', JSON.stringify(registros)); }

let registros = cargarRegistros();

function registroKey(fecha, objId) { return `${fecha}_${objId}`; }
function hoyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function totalPuntos() {
  return Object.values(registros).filter(r => r.estado === 'aprobado').length * CONFIG.PUNTOS_POR_OBJETIVO;
}

// ═══════════════════════════════════════════════════════════════
//  GITHUB CONFIG
// ═══════════════════════════════════════════════════════════════

const CONFIG_PATH = "config.json";
const CONFIG_URL  = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${CONFIG_PATH}`;

async function cargarConfigRemota() {
  try {
    const res = await fetch(CONFIG_URL, {
      headers: { 'Authorization': `token ${getToken()}` }
    });
    if (!res.ok) return;
    const data   = await res.json();
    const texto  = atob(data.content.replace(/\n/g, ''));
    const parsed = JSON.parse(texto);
    appConfig = { ...CONFIG_DEFAULT, ...parsed };
    appConfig.objetivos = appConfig.objetivos.map(o => ({
      dias: [1,2,3,4,5], horaInicio: 7, horaFin: 21, activo: true, ...o
    }));
  } catch (e) {
    console.warn('Config remota no disponible.', e);
  }
}

async function guardarConfigRemota() {
  let sha = null;
  try {
    const res = await fetch(CONFIG_URL, { headers: { 'Authorization': `token ${getToken()}` } });
    if (res.ok) sha = (await res.json()).sha;
  } catch {}
  const contenido = btoa(unescape(encodeURIComponent(JSON.stringify(appConfig, null, 2))));
  const body = { message: 'actualizar config', content: contenido };
  if (sha) body.sha = sha;
  const res = await fetch(CONFIG_URL, {
    method: 'PUT',
    headers: { 'Authorization': `token ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Error al guardar');
}

async function validarToken(token) {
  try {
    const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    return res.ok;
  } catch { return false; }
}

async function eliminarFotoGitHub(fotoUrl) {
  try {
    const match = fotoUrl.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)/);
    if (!match) return;
    const path   = match[1];
    const apiUrl = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}`;
    const res    = await fetch(apiUrl, { headers: { 'Authorization': `token ${getToken()}` } });
    if (!res.ok) return;
    const data = await res.json();
    await fetch(apiUrl, {
      method: 'DELETE',
      headers: { 'Authorization': `token ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `eliminar foto`, sha: data.sha }),
    });
  } catch (e) { console.warn('No se pudo eliminar la foto:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS DE FECHA / TIEMPO
// ═══════════════════════════════════════════════════════════════

function nombreDia()  { return DIAS_SEMANA[new Date().getDay()]; }
function fechaLarga() {
  const d = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d.getDate()} de ${meses[d.getMonth()]}`;
}
function formatearFecha(key) {
  const partes = key.split('_')[0].split('-');
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function tiempoRestante(obj) {
  const ahora  = new Date();
  const finHoy = new Date();
  finHoy.setHours(obj.horaFin, 0, 0, 0);
  const diff = finHoy - ahora;
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function estaEnHorario(obj) {
  const h = new Date().getHours();
  return h >= obj.horaInicio && h < obj.horaFin;
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
      const url    = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}`;
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Authorization': `token ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `foto ${key} ${objId}`, content: base64 }),
        });
        if (!res.ok) { reject(new Error((await res.json()).message || 'Error al subir')); return; }
        resolve((await res.json()).content.download_url);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsDataURL(file);
  });
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
    setToken(token);
    document.getElementById('token-input').value = '';
    error.classList.add('hidden');
    iniciarAdmin();
    mostrarPantalla('screen-admin');
  } else {
    error.classList.remove('hidden');
  }
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
    mostrarPantalla('screen-user');
    iniciarUsuario();
  } else {
    error.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════
//  VISTA USUARIO
// ═══════════════════════════════════════════════════════════════

async function iniciarUsuario() {
  document.getElementById('user-day-chip').textContent = nombreDia() + ", " + fechaLarga();
  document.getElementById('user-loading').classList.remove('hidden');
  document.getElementById('objectives-list').classList.add('hidden');
  document.getElementById('user-history-section').classList.add('hidden');

  await cargarConfigRemota();

  document.getElementById('user-loading').classList.add('hidden');
  document.getElementById('user-points-display').textContent = `${totalPuntos()} pts`;

  renderObjetivosUsuario();
  renderHistorialUsuario();
}

function limpiarTimers() {
  Object.values(timers).forEach(t => clearInterval(t));
  timers = {};
}

function renderObjetivosUsuario() {
  limpiarTimers();
  const lista     = document.getElementById('objectives-list');
  const hoy       = hoyKey();
  const objs      = objetivosDeHoy();
  const diaActual = new Date().getDay();

  lista.classList.remove('hidden');

  if (objs.length === 0) {
    const esFinde = diaActual === 0 || diaActual === 6;
    lista.innerHTML = esFinde
      ? `<div class="obj-card"><div class="status-box status-rest"><span class="status-icon">😴</span><p>Día de descanso. ¡Volvé el lunes!</p></div></div>`
      : `<div class="obj-card"><div class="status-box status-rest"><span class="status-icon">📅</span><p>Hoy no tenés objetivos asignados.</p></div></div>`;
    return;
  }

  lista.innerHTML = objs.map(obj => renderTarjetaObjetivo(obj, hoy)).join('');

  // Iniciar timers de cuenta regresiva
  objs.forEach(obj => {
    const rk      = registroKey(hoy, obj.id);
    const registro = registros[rk];
    const enHorario = estaEnHorario(obj);

    // Solo mostrar timer si está en horario y no completado/aprobado
    if (enHorario && (!registro || registro.estado === 'rechazado')) {
      timers[obj.id] = setInterval(() => {
        const el = document.getElementById(`timer-${obj.id}`);
        if (!el) { clearInterval(timers[obj.id]); return; }
        const t = tiempoRestante(obj);
        if (!t) {
          clearInterval(timers[obj.id]);
          renderObjetivosUsuario(); // refrescar cuando venció el horario
        } else {
          el.textContent = `⏱ ${t} restantes`;
        }
      }, 1000);
    }
  });

  // Eventos de upload por objetivo
  objs.forEach(obj => {
    const pickBtn  = document.getElementById(`pick-${obj.id}`);
    const fileInput = document.getElementById(`file-${obj.id}`);
    const sendBtn  = document.getElementById(`send-${obj.id}`);
    const changeBtn = document.getElementById(`change-${obj.id}`);

    if (!pickBtn) return;

    pickBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
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
      const file = fileInput.files[0];
      if (!file) return;
      const statusEl = document.getElementById(`upload-status-${obj.id}`);
      sendBtn.disabled = true; sendBtn.textContent = 'Subiendo...';
      statusEl.textContent = 'Subiendo foto...'; statusEl.classList.remove('hidden');
      try {
        const key = hoyKey();
        const url = await subirFotoGitHub(file, key, obj.id);
        const rk  = registroKey(key, obj.id);
        registros[rk] = { fecha: key, objetivo: obj.id, estado: 'enviado', fotoUrl: url, timestamp: Date.now() };
        guardarRegistros();
        renderObjetivosUsuario();
        renderHistorialUsuario();
        document.getElementById('user-points-display').textContent = `${totalPuntos()} pts`;
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        sendBtn.disabled = false; sendBtn.textContent = 'Enviar foto ✓';
      }
    });
  });
}

function renderTarjetaObjetivo(obj, hoy) {
  const rk       = registroKey(hoy, obj.id);
  const registro = registros[rk];
  const enHorario = estaEnHorario(obj);
  const tiempo   = tiempoRestante(obj);

  const horarioStr = `${obj.horaInicio}:00 – ${obj.horaFin}:00 hs`;
  const timerStr   = (enHorario && tiempo) ? `<span class="obj-timer" id="timer-${obj.id}">⏱ ${tiempo} restantes</span>` : '';
  const vencido    = !enHorario && new Date().getHours() >= obj.horaFin;

  let contenido = '';

  if (registro) {
    if (registro.estado === 'enviado') {
      contenido = `<div class="status-box status-sent"><span class="status-icon">⏳</span><p>Foto enviada. Esperando aprobación...</p></div>`;
    } else if (registro.estado === 'aprobado') {
      contenido = `<div class="status-box status-ok"><span class="status-icon">✅</span><p>¡Completado! +${CONFIG.PUNTOS_POR_OBJETIVO} pts</p></div>`;
    } else if (registro.estado === 'rechazado') {
      if (enHorario) {
        contenido = uploadAreaHTML(obj.id);
      } else {
        contenido = `<div class="status-box status-bad"><span class="status-icon">❌</span><p>Rechazado. El tiempo venció.</p></div>`;
      }
    }
  } else if (!enHorario) {
    const h = new Date().getHours();
    const msg = h < obj.horaInicio
      ? `El horario empieza a las ${obj.horaInicio}:00 hs.`
      : `El tiempo para este objetivo venció.`;
    const tipo = vencido ? 'status-warn' : 'status-rest';
    const icon = vencido ? '🕐' : '🕐';
    contenido = `<div class="status-box ${tipo}"><span class="status-icon">${icon}</span><p>${msg}</p></div>`;
  } else {
    contenido = uploadAreaHTML(obj.id);
  }

  return `
    <div class="obj-card" id="obj-card-${obj.id}">
      <div class="obj-tag">${obj.emoji} OBJETIVO</div>
      <h3 class="obj-title">${obj.titulo}</h3>
      <p class="obj-desc">${obj.descripcion}</p>
      <div class="obj-time-row">
        <span class="obj-time">⏰ ${horarioStr}</span>
        ${timerStr}
      </div>
      ${contenido}
    </div>`;
}

function uploadAreaHTML(objId) {
  return `
    <div class="upload-area" id="upload-area-${objId}">
      <p class="upload-hint">📷 Subí tu foto para completar el objetivo</p>
      <input type="file" id="file-${objId}" accept="image/*" capture="environment" hidden />
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
  const lista = document.getElementById('history-list');
  const section = document.getElementById('user-history-section');
  const items = Object.values(registros).sort((a,b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
  section.classList.remove('hidden');
  if (items.length === 0) { lista.innerHTML = '<li class="history-empty">Todavía no hay registros.</li>'; return; }
  const objMap = {};
  appConfig.objetivos.forEach(o => { objMap[o.id] = o; });
  lista.innerHTML = items.map(r => {
    const obj = objMap[r.objetivo] || { emoji: '🎯', titulo: r.objetivo };
    const estadoTexto = r.estado === 'aprobado' ? '✅' : r.estado === 'rechazado' ? '❌' : '⏳';
    const estadoClass = r.estado === 'aprobado' ? 'status-text-ok' : r.estado === 'rechazado' ? 'status-text-bad' : 'status-text-sent';
    return `
      <li class="history-item">
        <span class="history-obj">${obj.emoji} ${obj.titulo}</span>
        <div class="history-right">
          <span class="history-date">${formatearFecha(r.fecha)}</span>
          <span class="history-status ${estadoClass}">${estadoTexto}</span>
        </div>
      </li>`;
  }).join('');
}

document.getElementById('logout-user').addEventListener('click', () => {
  limpiarTimers(); cerrarSesion();
});

// ═══════════════════════════════════════════════════════════════
//  VISTA ADMIN
// ═══════════════════════════════════════════════════════════════

async function iniciarAdmin() {
  await cargarConfigRemota();
  renderAdminPendientes();
  renderAdminHistorial();
  renderConfigPanel();
}

function todosLosRegistros() { return Object.values(registros).sort((a,b) => b.fecha.localeCompare(a.fecha)); }

function renderAdminPendientes() {
  const contenedor = document.getElementById('pending-list');
  const pendientes = todosLosRegistros().filter(r => r.estado === 'enviado');
  if (pendientes.length === 0) { contenedor.innerHTML = '<p class="empty-msg">No hay fotos pendientes.</p>'; return; }
  contenedor.innerHTML = pendientes.map(r => tarjetaRevision(r, true)).join('');
  bindAdminCards(contenedor);
}

function renderAdminHistorial() {
  const contenedor = document.getElementById('admin-history-list');
  const revisados  = todosLosRegistros().filter(r => r.estado !== 'enviado');
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
  const badgeTexto = r.estado === 'aprobado' ? 'Aprobado'  : r.estado === 'rechazado' ? 'Rechazado' : 'Pendiente';

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

function cambiarEstado(rk, nuevoEstado) {
  if (!registros[rk]) return;
  registros[rk].estado = nuevoEstado;
  guardarRegistros();
  renderAdminPendientes();
  renderAdminHistorial();
}

async function eliminarRegistro(rk) {
  if (!confirm(`¿Eliminar este registro?`)) return;
  const fotoUrl = registros[rk]?.fotoUrl;
  delete registros[rk];
  guardarRegistros();
  renderAdminPendientes();
  renderAdminHistorial();
  if (fotoUrl) await eliminarFotoGitHub(fotoUrl);
}

document.getElementById('logout-admin').addEventListener('click', cerrarSesion);

// ═══════════════════════════════════════════════════════════════
//  PANEL DE CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════

function renderConfigPanel() {
  renderListaObjetivos();
  renderSelectActivo();
}

function checkboxesDias(diasSeleccionados) {
  return [
    [1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[0,'Dom']
  ].map(([val, nombre]) =>
    `<label class="dia-check"><input type="checkbox" value="${val}" ${diasSeleccionados.includes(val) ? 'checked' : ''} />${nombre}</label>`
  ).join('');
}

function renderListaObjetivos() {
  const lista = document.getElementById('cfg-objetivos-lista');
  if (appConfig.objetivos.length === 0) { lista.innerHTML = '<p class="empty-msg">No hay objetivos.</p>'; return; }

  lista.innerHTML = appConfig.objetivos.map((o, i) => `
    <div class="cfg-obj-item-full">
      <div class="cfg-obj-header">
        <span class="cfg-obj-emoji">${o.emoji}</span>
        <div class="cfg-obj-info">
          <strong>${o.titulo}</strong>
          <small>${o.descripcion}</small>
        </div>
        <label class="toggle-switch" title="${o.activo ? 'Activo' : 'Inactivo'}">
          <input type="checkbox" class="cfg-toggle-activo" data-index="${i}" ${o.activo ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
        ${appConfig.objetivos.length > 1 ? `<button class="btn-ghost btn-small cfg-eliminar-obj" data-index="${i}">✕</button>` : ''}
      </div>
      <div class="cfg-obj-horario">
        <div class="config-row">
          <div class="config-field">
            <label>Desde</label>
            <input type="number" class="cfg-obj-inicio" data-index="${i}" min="0" max="23" value="${o.horaInicio}" />
            <span class="config-unit">hs</span>
          </div>
          <div class="config-field">
            <label>Hasta</label>
            <input type="number" class="cfg-obj-fin" data-index="${i}" min="0" max="23" value="${o.horaFin}" />
            <span class="config-unit">hs</span>
          </div>
        </div>
        <div class="dias-wrap">${checkboxesDias(o.dias)}</div>
        <button class="btn-primary cfg-guardar-obj" data-index="${i}">Guardar cambios</button>
        <p class="config-status hidden" id="cfg-obj-status-${i}"></p>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('.cfg-eliminar-obj').forEach(btn => {
    btn.addEventListener('click', () => eliminarObjetivo(parseInt(btn.dataset.index)));
  });
  lista.querySelectorAll('.cfg-guardar-obj').forEach(btn => {
    btn.addEventListener('click', () => guardarCambiosObjetivo(parseInt(btn.dataset.index)));
  });
  lista.querySelectorAll('.cfg-toggle-activo').forEach(cb => {
    cb.addEventListener('change', () => toggleActivo(parseInt(cb.dataset.index), cb.checked));
  });
}

async function toggleActivo(index, activo) {
  appConfig.objetivos[index].activo = activo;
  try { await guardarConfigRemota(); }
  catch (e) { alert(`Error: ${e.message}`); appConfig.objetivos[index].activo = !activo; renderListaObjetivos(); }
}

async function guardarCambiosObjetivo(index) {
  const obj    = appConfig.objetivos[index];
  const inicio = parseInt(document.querySelector(`.cfg-obj-inicio[data-index="${index}"]`).value);
  const fin    = parseInt(document.querySelector(`.cfg-obj-fin[data-index="${index}"]`).value);
  const items  = document.querySelectorAll('.cfg-obj-item-full');
  const dias   = [...items[index].querySelectorAll('.dias-wrap input:checked')].map(cb => parseInt(cb.value));
  const status = document.getElementById(`cfg-obj-status-${index}`);

  if (isNaN(inicio) || isNaN(fin) || inicio >= fin) { mostrarStatus(status, '❌ Horario inválido.', false); return; }
  if (dias.length === 0) { mostrarStatus(status, '❌ Seleccioná al menos un día.', false); return; }

  obj.horaInicio = inicio; obj.horaFin = fin; obj.dias = dias;
  const btn = document.querySelector(`.cfg-guardar-obj[data-index="${index}"]`);
  btn.disabled = true; btn.textContent = 'Guardando...';
  try { await guardarConfigRemota(); mostrarStatus(status, '✅ Guardado.', true); }
  catch (e) { mostrarStatus(status, `❌ ${e.message}`, false); }
  finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
}

function renderSelectActivo() {
  // Ya no hay "objetivo activo único" — se usan los toggles por objetivo
  // Esta sección queda vacía pero el elemento HTML puede quedar oculto
  const card = document.getElementById('cfg-card-activo');
  if (card) card.style.display = 'none';
}

document.getElementById('cfg-agregar-obj').addEventListener('click', async () => {
  const emoji  = document.getElementById('cfg-obj-emoji').value.trim();
  const titulo = document.getElementById('cfg-obj-titulo').value.trim();
  const desc   = document.getElementById('cfg-obj-desc').value.trim();
  const inicio = parseInt(document.getElementById('cfg-obj-inicio').value);
  const fin    = parseInt(document.getElementById('cfg-obj-fin').value);
  const dias   = [...document.querySelectorAll('#cfg-nuevo-dias input:checked')].map(cb => parseInt(cb.value));
  const status = document.getElementById('cfg-obj-status');

  if (!emoji || !titulo || !desc) { mostrarStatus(status, '❌ Completá todos los campos.', false); return; }
  if (isNaN(inicio) || isNaN(fin) || inicio >= fin) { mostrarStatus(status, '❌ Horario inválido.', false); return; }
  if (dias.length === 0) { mostrarStatus(status, '❌ Seleccioná al menos un día.', false); return; }

  const id = titulo.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (appConfig.objetivos.find(o => o.id === id)) { mostrarStatus(status, '❌ Ya existe ese objetivo.', false); return; }

  appConfig.objetivos.push({ id, titulo, descripcion: desc, emoji, horaInicio: inicio, horaFin: fin, dias, activo: true });
  const btn = document.getElementById('cfg-agregar-obj');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await guardarConfigRemota();
    document.getElementById('cfg-obj-emoji').value  = '';
    document.getElementById('cfg-obj-titulo').value = '';
    document.getElementById('cfg-obj-desc').value   = '';
    document.getElementById('cfg-obj-inicio').value = '7';
    document.getElementById('cfg-obj-fin').value    = '21';
    document.querySelectorAll('#cfg-nuevo-dias input').forEach(cb => { cb.checked = [1,2,3,4,5].includes(parseInt(cb.value)); });
    renderListaObjetivos();
    mostrarStatus(status, '✅ Objetivo agregado.', true);
  } catch (e) {
    appConfig.objetivos.pop();
    mostrarStatus(status, `❌ ${e.message}`, false);
  } finally { btn.disabled = false; btn.textContent = 'Agregar objetivo'; }
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
    setToken(token);
    document.getElementById('cfg-token-input').value = '';
    mostrarStatus(status, '✅ Token actualizado.', true);
  } else {
    mostrarStatus(status, '❌ Token inválido.', false);
  }
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

function cerrarSesion() { rol = null; limpiarTimers(); mostrarPantalla('screen-login'); }