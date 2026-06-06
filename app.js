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
      dias: [1,2,3,4,5], // lunes a viernes
    }
  ],
  objetivoActivoId: "caminata",
};

let appConfig    = JSON.parse(JSON.stringify(CONFIG_DEFAULT));
let objetivoActivo = appConfig.objetivos[0];

// ═══════════════════════════════════════════════════════════════
//  ESTADO
// ═══════════════════════════════════════════════════════════════

let rol          = null;
let selectedFile = null;
let registros    = cargarRegistros();
let objetivoIdEnProceso = null;

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
    // Migrar objetivos viejos que no tengan días/horario propio
    appConfig.objetivos = appConfig.objetivos.map(o => ({
      dias: [1,2,3,4,5],
      horaInicio: 7,
      horaFin: 21,
      ...o,
    }));
    objetivoActivo = appConfig.objetivos.find(o => o.id === appConfig.objetivoActivoId) || appConfig.objetivos[0];
  } catch (e) {
    console.warn('Config remota no disponible, usando defaults.', e);
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
  // La URL es del tipo: https://raw.githubusercontent.com/user/repo/branch/path
  // Necesitamos el path para la API
  try {
    const match = fotoUrl.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)/);
    if (!match) throw new Error('URL de foto no reconocida');
    const path = match[1];
    const apiUrl = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}`;
    const res = await fetch(apiUrl, { headers: { 'Authorization': `token ${getToken()}` } });
    if (!res.ok) throw new Error('No se pudo obtener el archivo');
    const data = await res.json();
    await fetch(apiUrl, {
      method: 'DELETE',
      headers: { 'Authorization': `token ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `eliminar foto ${path}`, sha: data.sha }),
    });
  } catch (e) {
    console.warn('No se pudo eliminar la foto de GitHub:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS DE FECHA
// ═══════════════════════════════════════════════════════════════

function hoyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function diaSemanaHoy() { return new Date().getDay(); }

function esDiaActivo() {
  return objetivoActivo.dias.includes(diaSemanaHoy());
}

function estaEnHorario() {
  const h = new Date().getHours();
  return h >= objetivoActivo.horaInicio && h < objetivoActivo.horaFin;
}

function formatearFecha(key) {
  const [y,m,d] = key.split('-');
  return `${d}/${m}/${y}`;
}

function nombreDia() { return DIAS_SEMANA[new Date().getDay()]; }

function fechaLarga() {
  const d = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d.getDate()} de ${meses[d.getMonth()]}`;
}

// ═══════════════════════════════════════════════════════════════
//  TEMPORIZADORES EN VIVO (BOMBA 💣)
// ═══════════════════════════════════════════════════════════════

function actualizarTemporizadores() {
  const ahora = new Date();
  
  // Buscamos todos los temporizadores en pantalla
  document.querySelectorAll('.countdown-timer').forEach(el => {
    const finHora = parseInt(el.dataset.fin); // Obtenemos la hora de fin guardada en el HTML
    const fin = new Date();
    fin.setHours(finHora, 0, 0, 0);

    const diff = fin - ahora; // Diferencia en milisegundos

    if (diff <= 0) {
      el.innerHTML = '💣 ¡Tiempo agotado!';
      el.classList.add('countdown-expired');
    } else {
      // Calculamos horas, minutos y segundos restantes
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      // Formateamos para que siempre tenga 2 dígitos (ej: 09:05:02)
      el.innerHTML = `💣 Quedan ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      el.classList.remove('countdown-expired');
    }
  });
}

// Hacemos que la función corra cada 1 segundo (1000 ms)
setInterval(actualizarTemporizadores, 1000);

// ═══════════════════════════════════════════════════════════════
//  PERSISTENCIA LOCAL
// ═══════════════════════════════════════════════════════════════

function cargarRegistros() {
  try { return JSON.parse(localStorage.getItem('habitos_registros')) || {}; }
  catch { return {}; }
}
function guardarRegistros() { localStorage.setItem('habitos_registros', JSON.stringify(registros)); }
function totalPuntos() {
  return Object.values(registros).filter(r => r.estado === 'aprobado').length * CONFIG.PUNTOS_POR_OBJETIVO;
}

// ═══════════════════════════════════════════════════════════════
//  GITHUB — subir foto
// ═══════════════════════════════════════════════════════════════

async function subirFotoGitHub(file, key) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const path   = `fotos/${key}_${objetivoActivo.id}.jpg`;
      const url    = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}`;
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Authorization': `token ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `foto ${key}`, content: base64 }),
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
  const valido = await validarToken(token);
  if (valido) {
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
    rol = 'admin';
    error.classList.add('hidden');
    document.getElementById('login-input').value = '';
    if (getToken()) { iniciarAdmin(); mostrarPantalla('screen-admin'); }
    else { mostrarPantalla('screen-token'); }
  } else if (pass === CONFIG.PASSWORD_USER) {
    rol = 'user';
    error.classList.add('hidden');
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
  document.getElementById('user-objectives-container').classList.add('hidden');
  document.getElementById('user-history-section').classList.add('hidden');

  await cargarConfigRemota();

  document.getElementById('user-loading').classList.add('hidden');
  document.getElementById('user-objectives-container').classList.remove('hidden');
  document.getElementById('user-history-section').classList.remove('hidden');
  document.getElementById('user-points-display').textContent = `${totalPuntos()} pts`;

  // En lugar de actualizar un solo objetivo, llamamos a la función que dibuja la lista
  renderObjetivosUsuario();
  renderHistorialUsuario();
}

function renderObjetivosUsuario() {
  const contenedor = document.getElementById('user-objectives-container');
  const diaHoy = diaSemanaHoy();
  
  // 1. Filtramos los objetivos que incluyen el día de hoy
  const objetivosDeHoy = appConfig.objetivos.filter(obj => obj.dias.includes(diaHoy));

  // 2. Si no hay objetivos para hoy, mostramos un mensaje
  if (objetivosDeHoy.length === 0) {
    contenedor.innerHTML = `
      <div class="status-box status-rest">
        <span class="status-icon">😴</span>
        <p>Día de descanso. ¡No hay objetivos para hoy!</p>
      </div>`;
    return;
  }

  // 3. Si hay objetivos, generamos el HTML para cada uno
  let htmlTarjetas = '';
  objetivosDeHoy.forEach(obj => {
    // Generamos una llave única para este registro (Ej: "2026-06-06_caminata")
    const registroKey = `${hoyKey()}_${obj.id}`;
    const registroGuardado = registros[registroKey];
    
    // Evaluamos el estado (si ya se envió, si se aprobó, etc.) para ver qué botón mostrar
    let estadoHTML = '';
    if (registroGuardado) {
      if (registroGuardado.estado === 'enviado') estadoHTML = `<p class="status-text-sent">⏳ Esperando aprobación...</p>`;
      if (registroGuardado.estado === 'aprobado') estadoHTML = `<p class="status-text-ok">✅ ¡Completado! +${CONFIG.PUNTOS_POR_OBJETIVO} pts</p>`;
      if (registroGuardado.estado === 'rechazado') estadoHTML = `<p class="status-text-bad">❌ Rechazado. ¡Intentá de nuevo!</p>`;
    } else {
      // Si no hay registro, mostramos el botón para subir foto
      estadoHTML = `<button class="btn-primary btn-subir-foto" data-objid="${obj.id}">📷 Subir foto</button>`;
    }

    // Armamos la tarjeta
    htmlTarjetas += `
      <div class="obj-card">
        <div class="obj-tag">OBJETIVO</div>
        <h3 class="obj-title">${obj.emoji} ${obj.titulo}</h3>
        <p class="obj-desc">${obj.descripcion}</p>
        
        <div class="countdown-timer" data-fin="${obj.horaFin}">
          💣 Calculando...
        </div>
        
        <div class="upload-area" style="margin-top: 1rem;">
          ${estadoHTML}
        </div>
      </div>
    `;
  });

  // 4. Inyectamos todo el HTML de golpe en el contenedor
  contenedor.innerHTML = htmlTarjetas;
}

// Delegación de eventos para los botones dinámicos de subir foto
document.getElementById('user-objectives-container').addEventListener('click', (e) => {
  // Verificamos si lo que se clickeó tiene la clase del botón
  if (e.target.classList.contains('btn-subir-foto')) {
    // Guardamos el ID del objetivo que el usuario quiere completar
    objetivoIdEnProceso = e.target.dataset.objid;
    
    // Simulamos un clic en el input de archivo oculto para abrir la cámara/galería
    document.getElementById('photo-input').click();
  }
});




function actualizarEstadoUsuario() {
  const key      = hoyKey();
  const registro = registros[key];

  ['state-pending','state-sent','state-approved','state-rejected','state-out-of-time','state-no-objetivo','state-weekend'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  // Día no activo para este objetivo
  if (!esDiaActivo()) {
    const esFinde = diaSemanaHoy() === 0 || diaSemanaHoy() === 6;
    if (esFinde) {
      document.getElementById('state-weekend').classList.remove('hidden');
    } else {
      document.getElementById('state-no-objetivo').classList.remove('hidden');
    }
    return;
  }

  if (registro) {
    if (registro.estado === 'enviado') {
      document.getElementById('state-sent').classList.remove('hidden');
    } else if (registro.estado === 'aprobado') {
      document.getElementById('state-approved').classList.remove('hidden');
      document.getElementById('state-approved-msg').textContent = `¡Objetivo completado! +${CONFIG.PUNTOS_POR_OBJETIVO} puntos`;
      document.getElementById('user-points-display').textContent = `${totalPuntos()} pts`;
    } else if (registro.estado === 'rechazado') {
      if (estaEnHorario()) document.getElementById('state-pending').classList.remove('hidden');
      else document.getElementById('state-rejected').classList.remove('hidden');
    }
    return;
  }

  if (!estaEnHorario()) {
    const h = new Date().getHours();
    document.getElementById('out-of-time-msg').textContent = h < objetivoActivo.horaInicio
      ? `El horario empieza a las ${objetivoActivo.horaInicio}:00 hs.`
      : `El horario de entrega ya pasó para hoy.`;
    document.getElementById('state-out-of-time').classList.remove('hidden');
    return;
  }

  document.getElementById('state-pending').classList.remove('hidden');
}

document.getElementById('photo-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('photo-preview').src = ev.target.result;
    document.getElementById('preview-wrap').classList.remove('hidden');
    document.getElementById('pick-photo-btn').classList.add('hidden');
    document.querySelector('.upload-hint').classList.add('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('change-photo-btn').addEventListener('click', () => {
  selectedFile = null;
  document.getElementById('photo-input').value = '';
  document.getElementById('preview-wrap').classList.add('hidden');
  document.getElementById('pick-photo-btn').classList.remove('hidden');
  document.querySelector('.upload-hint').classList.remove('hidden');
});

document.getElementById('send-photo-btn').addEventListener('click', async () => {
  if (!selectedFile || !objetivoIdEnProceso) return;
  
  const btn    = document.getElementById('send-photo-btn');
  const status = document.getElementById('upload-status');
  
  btn.disabled = true; 
  btn.textContent = 'Subiendo...';
  status.textContent = 'Subiendo foto...'; 
  status.classList.remove('hidden');
  
  try {
    // Nueva llave: "2026-06-06_caminata"
    const key = `${hoyKey()}_${objetivoIdEnProceso}`;
    
    const url = await subirFotoGitHub(selectedFile, key);
    
    // Guardamos el registro con el objetivo correcto
    registros[key] = { 
      fecha: key, 
      objetivo: objetivoIdEnProceso, 
      estado: 'enviado', 
      fotoUrl: url, 
      timestamp: Date.now() 
    };
    guardarRegistros();
    
    // Limpiamos la vista previa y recargamos la lista
    document.getElementById('preview-wrap').classList.add('hidden');
    selectedFile = null;
    objetivoIdEnProceso = null;
    document.getElementById('photo-input').value = '';
    
    // Volvemos a dibujar las tarjetas para que se actualice el estado a "Enviado"
    renderObjetivosUsuario();
    
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    btn.disabled = false; 
    btn.textContent = 'Reintentar';
  }
});

function renderHistorialUsuario() {
  const lista = document.getElementById('history-list');
  const items = Object.values(registros).sort((a,b) => b.fecha.localeCompare(a.fecha)).slice(0, 7);
  if (items.length === 0) { lista.innerHTML = '<li class="history-empty">Todavía no hay registros.</li>'; return; }
  lista.innerHTML = items.map(r => {
    const estadoTexto = r.estado === 'aprobado' ? '✅ Aprobado' : r.estado === 'rechazado' ? '❌ Rechazado' : '⏳ Pendiente';
    const estadoClass = r.estado === 'aprobado' ? 'status-text-ok' : r.estado === 'rechazado' ? 'status-text-bad' : 'status-text-sent';
    return `<li class="history-item"><span class="history-date">${formatearFecha(r.fecha)}</span><span class="history-status ${estadoClass}">${estadoTexto}</span></li>`;
  }).join('');
}

document.getElementById('logout-user').addEventListener('click', cerrarSesion);

// ═══════════════════════════════════════════════════════════════
//  VISTA ADMIN
// ═══════════════════════════════════════════════════════════════

async function iniciarAdmin() {
  await cargarConfigRemota();
  renderAdminPendientes();
  renderAdminHistorial();
  renderConfigPanel();
}

function renderAdminPendientes() {
  const contenedor = document.getElementById('pending-list');
  const pendientes = Object.values(registros).filter(r => r.estado === 'enviado');
  if (pendientes.length === 0) { contenedor.innerHTML = '<p class="empty-msg">No hay fotos pendientes.</p>'; return; }
  contenedor.innerHTML = pendientes.map(r => tarjetaRevision(r, true)).join('');
  contenedor.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', () => aprobarRegistro(btn.dataset.key)));
  contenedor.querySelectorAll('.btn-reject').forEach(btn  => btn.addEventListener('click', () => rechazarRegistro(btn.dataset.key)));
  contenedor.querySelectorAll('.btn-delete').forEach(btn  => btn.addEventListener('click', () => eliminarRegistro(btn.dataset.key)));
}

function renderAdminHistorial() {
  const contenedor = document.getElementById('admin-history-list');
  const todos = Object.values(registros).filter(r => r.estado !== 'enviado').sort((a,b) => b.fecha.localeCompare(a.fecha));
  if (todos.length === 0) { contenedor.innerHTML = '<p class="empty-msg">Sin registros revisados aún.</p>'; return; }
  contenedor.innerHTML = todos.map(r => tarjetaRevision(r, false)).join('');
  contenedor.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', () => eliminarRegistro(btn.dataset.key)));
}

function tarjetaRevision(r, conAcciones) {
  const obj        = appConfig.objetivos.find(o => o.id === r.objetivo) || objetivoActivo;
  const badgeClass = r.estado === 'aprobado' ? 'badge-ok' : r.estado === 'rechazado' ? 'badge-bad' : 'badge-sent';
  const badgeTexto = r.estado === 'aprobado' ? 'Aprobado'  : r.estado === 'rechazado' ? 'Rechazado' : 'Pendiente';

  const acciones = conAcciones
    ? `<div class="review-card-actions">
        <button class="btn-approve" data-key="${r.fecha}">✅ Aprobar</button>
        <button class="btn-reject"  data-key="${r.fecha}">❌ Rechazar</button>
        <button class="btn-delete"  data-key="${r.fecha}">🗑</button>
       </div>`
    : `<div class="review-card-actions">
        <span class="review-badge ${badgeClass}">${badgeTexto}</span>
        <button class="btn-delete" data-key="${r.fecha}">🗑 Eliminar</button>
       </div>`;

  return `
    <div class="review-card" id="card-${r.fecha}">
      <div class="review-card-header">
        <span class="review-card-date">${formatearFecha(r.fecha)}</span>
        <span class="review-card-obj">${obj.emoji} ${obj.titulo}</span>
      </div>
      <img src="${r.fotoUrl}" alt="foto del objetivo" loading="lazy" />
      ${acciones}
    </div>`;
}

function aprobarRegistro(key) {
  if (!registros[key]) return;
  registros[key].estado = 'aprobado';
  guardarRegistros(); renderAdminPendientes(); renderAdminHistorial();
}

function rechazarRegistro(key) {
  if (!registros[key]) return;
  registros[key].estado = 'rechazado';
  guardarRegistros(); renderAdminPendientes(); renderAdminHistorial();
}

async function eliminarRegistro(key) {
  if (!confirm(`¿Eliminar el registro del ${formatearFecha(key)}?`)) return;
  const fotoUrl = registros[key]?.fotoUrl;
  delete registros[key];
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
  return DIAS_SEMANA.map((nombre, i) => {
    if (i === 0) return ''; // Omitir domingo como opción de inicio (se puede incluir)
    const checked = diasSeleccionados.includes(i) ? 'checked' : '';
    return `<label class="dia-check"><input type="checkbox" value="${i}" ${checked} />${nombre.slice(0,3)}</label>`;
  }).join('');
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
        <p class="config-status hidden cfg-obj-save-status-${i}"></p>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('.cfg-eliminar-obj').forEach(btn => {
    btn.addEventListener('click', () => eliminarObjetivo(parseInt(btn.dataset.index)));
  });

  lista.querySelectorAll('.cfg-guardar-obj').forEach(btn => {
    btn.addEventListener('click', () => guardarCambiosObjetivo(parseInt(btn.dataset.index)));
  });
}

async function guardarCambiosObjetivo(index) {
  const obj    = appConfig.objetivos[index];
  const inicio = parseInt(document.querySelector(`.cfg-obj-inicio[data-index="${index}"]`).value);
  const fin    = parseInt(document.querySelector(`.cfg-obj-fin[data-index="${index}"]`).value);
  const dias   = [...document.querySelectorAll(`.cfg-obj-item-full:nth-child(${index+1}) .dias-wrap input:checked`)].map(cb => parseInt(cb.value));
  const status = document.querySelector(`.cfg-obj-save-status-${index}`);

  if (isNaN(inicio) || isNaN(fin) || inicio >= fin) {
    mostrarStatus(status, '❌ Horario inválido.', false); return;
  }
  if (dias.length === 0) {
    mostrarStatus(status, '❌ Seleccioná al menos un día.', false); return;
  }

  obj.horaInicio = inicio;
  obj.horaFin    = fin;
  obj.dias       = dias;

  const btn = document.querySelector(`.cfg-guardar-obj[data-index="${index}"]`);
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await guardarConfigRemota();
    mostrarStatus(status, '✅ Guardado.', true);
  } catch (e) {
    mostrarStatus(status, `❌ ${e.message}`, false);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar cambios';
  }
}

function renderSelectActivo() {
  const select = document.getElementById('cfg-objetivo-activo');
  select.innerHTML = appConfig.objetivos.map(o =>
    `<option value="${o.id}" ${o.id === appConfig.objetivoActivoId ? 'selected' : ''}>${o.emoji} ${o.titulo}</option>`
  ).join('');
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

  appConfig.objetivos.push({ id, titulo, descripcion: desc, emoji, horaInicio: inicio, horaFin: fin, dias });
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
    renderSelectActivo();
    mostrarStatus(status, '✅ Objetivo agregado.', true);
  } catch (e) {
    appConfig.objetivos.pop();
    mostrarStatus(status, `❌ ${e.message}`, false);
  } finally {
    btn.disabled = false; btn.textContent = 'Agregar objetivo';
  }
});

async function eliminarObjetivo(index) {
  const obj = appConfig.objetivos[index];
  if (obj.id === appConfig.objetivoActivoId) { alert('No podés eliminar el objetivo activo.'); return; }
  if (!confirm(`¿Eliminar "${obj.titulo}"?`)) return;
  const eliminado = appConfig.objetivos.splice(index, 1)[0];
  try { await guardarConfigRemota(); renderListaObjetivos(); renderSelectActivo(); }
  catch (e) { appConfig.objetivos.splice(index, 0, eliminado); alert(`Error: ${e.message}`); }
}

document.getElementById('cfg-guardar-activo').addEventListener('click', async () => {
  const id     = document.getElementById('cfg-objetivo-activo').value;
  const status = document.getElementById('cfg-activo-status');
  appConfig.objetivoActivoId = id;
  objetivoActivo = appConfig.objetivos.find(o => o.id === id) || appConfig.objetivos[0];
  const btn = document.getElementById('cfg-guardar-activo');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try { await guardarConfigRemota(); mostrarStatus(status, `✅ Activo: ${objetivoActivo.emoji} ${objetivoActivo.titulo}`, true); }
  catch (e) { mostrarStatus(status, `❌ ${e.message}`, false); }
  finally { btn.disabled = false; btn.textContent = 'Guardar'; }
});

document.getElementById('cfg-guardar-token').addEventListener('click', async () => {
  const token  = document.getElementById('cfg-token-input').value.trim();
  const status = document.getElementById('cfg-token-status');
  if (!token) return;
  const btn = document.getElementById('cfg-guardar-token');
  btn.disabled = true; btn.textContent = 'Verificando...';
  const valido = await validarToken(token);
  if (valido) { setToken(token); document.getElementById('cfg-token-input').value = ''; mostrarStatus(status, '✅ Token actualizado.', true); }
  else { mostrarStatus(status, '❌ Token inválido.', false); }
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

function cerrarSesion() { rol = null; selectedFile = null; mostrarPantalla('screen-login'); }