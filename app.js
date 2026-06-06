// ═══════════════════════════════════════════════════════════════
//  CONFIGURACIÓN BASE  ← Solo contraseñas y datos de GitHub
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  PASSWORD_USER:  "soyfeliz",
  PASSWORD_ADMIN: "admin",
  GITHUB_USER:    "Nahuel-MRam",
  GITHUB_REPO:    "habitos-storage",
  PUNTOS_POR_OBJETIVO: 10,
};

// ═══════════════════════════════════════════════════════════════
//  TOKEN  — se guarda en localStorage del admin, nunca en GitHub
// ═══════════════════════════════════════════════════════════════

function getToken() {
  return localStorage.getItem('habitos_admin_token') || "";
}

function setToken(token) {
  localStorage.setItem('habitos_admin_token', token);
}

// ═══════════════════════════════════════════════════════════════
//  CONFIG DINÁMICA  (se carga desde GitHub, editable desde admin)
// ═══════════════════════════════════════════════════════════════

const CONFIG_DEFAULT = {
  horaInicio: 7,
  horaFin: 21,
  objetivos: [
    {
      id: "caminata",
      titulo: "Caminata diaria",
      descripcion: "Salí a caminar y sacá una foto del lugar al que llegaste.",
      emoji: "🏃",
    }
  ],
  objetivoActivoId: "caminata",
};

let appConfig = { ...CONFIG_DEFAULT };
let objetivoActivo = appConfig.objetivos[0];

// ═══════════════════════════════════════════════════════════════
//  ESTADO
// ═══════════════════════════════════════════════════════════════

let rol = null;
let selectedFile = null;
let registros = cargarRegistros();

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
    const data = await res.json();
    const texto = atob(data.content.replace(/\n/g, ''));
    const parsed = JSON.parse(texto);
    appConfig = { ...CONFIG_DEFAULT, ...parsed };
    objetivoActivo = appConfig.objetivos.find(o => o.id === appConfig.objetivoActivoId) || appConfig.objetivos[0];
  } catch (e) {
    console.warn('No se pudo cargar config remota, usando defaults.', e);
  }
}

async function guardarConfigRemota() {
  let sha = null;
  try {
    const res = await fetch(CONFIG_URL, {
      headers: { 'Authorization': `token ${getToken()}` }
    });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }
  } catch {}

  const contenido = btoa(unescape(encodeURIComponent(JSON.stringify(appConfig, null, 2))));
  const body = { message: 'actualizar config', content: contenido };
  if (sha) body.sha = sha;

  const res = await fetch(CONFIG_URL, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Error al guardar config');
  }
}

async function validarToken(token) {
  const url = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}`;
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `token ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS DE FECHA
// ═══════════════════════════════════════════════════════════════

function hoyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function esDiaHabil() {
  const dia = new Date().getDay();
  return dia >= 1 && dia <= 5;
}

function estaEnHorario() {
  const h = new Date().getHours();
  return h >= appConfig.horaInicio && h < appConfig.horaFin;
}

function formatearFecha(key) {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

function nombreDia() {
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return dias[new Date().getDay()];
}

function fechaLarga() {
  const d = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d.getDate()} de ${meses[d.getMonth()]}`;
}

// ═══════════════════════════════════════════════════════════════
//  PERSISTENCIA LOCAL
// ═══════════════════════════════════════════════════════════════

function cargarRegistros() {
  try { return JSON.parse(localStorage.getItem('habitos_registros')) || {}; }
  catch { return {}; }
}

function guardarRegistros() {
  localStorage.setItem('habitos_registros', JSON.stringify(registros));
}

function totalPuntos() {
  return Object.values(registros)
    .filter(r => r.estado === 'aprobado')
    .length * CONFIG.PUNTOS_POR_OBJETIVO;
}

// ═══════════════════════════════════════════════════════════════
//  GITHUB — subir foto
// ═══════════════════════════════════════════════════════════════

async function subirFotoGitHub(file, key) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const path = `fotos/${key}_${objetivoActivo.id}.jpg`;
      const url = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}`;

      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${getToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: `foto ${key}`, content: base64 }),
        });

        if (!res.ok) {
          const err = await res.json();
          reject(new Error(err.message || 'Error al subir'));
          return;
        }

        const data = await res.json();
        resolve(data.content.download_url);
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
//  SETUP TOKEN (primera vez como admin)
// ═══════════════════════════════════════════════════════════════

document.getElementById('token-btn').addEventListener('click', guardarTokenInicial);
document.getElementById('token-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') guardarTokenInicial();
});

async function guardarTokenInicial() {
  const token = document.getElementById('token-input').value.trim();
  const error = document.getElementById('token-error');
  const btn   = document.getElementById('token-btn');

  if (!token) return;

  btn.disabled = true;
  btn.textContent = 'Verificando...';

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

  btn.disabled = false;
  btn.textContent = 'Guardar token';
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════

document.getElementById('login-btn').addEventListener('click', hacerLogin);
document.getElementById('login-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') hacerLogin();
});

function hacerLogin() {
  const pass  = document.getElementById('login-input').value.trim();
  const error = document.getElementById('login-error');

  if (pass === CONFIG.PASSWORD_ADMIN) {
    rol = 'admin';
    error.classList.add('hidden');
    document.getElementById('login-input').value = '';

    // Si ya tiene token guardado, va directo al panel
    if (getToken()) {
      iniciarAdmin();
      mostrarPantalla('screen-admin');
    } else {
      mostrarPantalla('screen-token');
    }

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
  document.getElementById('user-day-label').textContent = nombreDia();
  document.getElementById('user-date-title').textContent = fechaLarga();
  document.getElementById('user-loading').classList.remove('hidden');
  document.getElementById('objective-card').classList.add('hidden');
  document.getElementById('user-history-section').classList.add('hidden');

  await cargarConfigRemota();

  document.getElementById('user-loading').classList.add('hidden');
  document.getElementById('objective-card').classList.remove('hidden');
  document.getElementById('user-history-section').classList.remove('hidden');

  document.getElementById('obj-title').textContent = objetivoActivo.titulo;
  document.getElementById('obj-desc').textContent  = objetivoActivo.descripcion;
  document.getElementById('obj-time').textContent  = `⏰ Horario: ${appConfig.horaInicio}:00 – ${appConfig.horaFin}:00 hs`;
  document.getElementById('user-points-display').textContent = `${totalPuntos()} pts`;

  actualizarEstadoUsuario();
  renderHistorialUsuario();
}

function actualizarEstadoUsuario() {
  const key      = hoyKey();
  const registro = registros[key];

  ['state-pending','state-sent','state-approved','state-rejected','state-out-of-time','state-weekend'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  if (!esDiaHabil()) {
    document.getElementById('state-weekend').classList.remove('hidden');
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
      if (estaEnHorario()) {
        document.getElementById('state-pending').classList.remove('hidden');
      } else {
        document.getElementById('state-rejected').classList.remove('hidden');
      }
    }
    return;
  }

  if (!estaEnHorario()) {
    const msg = document.getElementById('out-of-time-msg');
    const h   = new Date().getHours();
    msg.textContent = h < appConfig.horaInicio
      ? `El horario de entrega empieza a las ${appConfig.horaInicio}:00 hs.`
      : `El horario de entrega ya pasó para hoy.`;
    document.getElementById('state-out-of-time').classList.remove('hidden');
    return;
  }

  document.getElementById('state-pending').classList.remove('hidden');
}

document.getElementById('pick-photo-btn').addEventListener('click', () => {
  document.getElementById('photo-input').click();
});

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
  if (!selectedFile) return;

  const btn    = document.getElementById('send-photo-btn');
  const status = document.getElementById('upload-status');

  btn.disabled    = true;
  btn.textContent = 'Subiendo...';
  status.textContent = 'Subiendo foto a GitHub...';
  status.classList.remove('hidden');

  try {
    const key = hoyKey();
    const url = await subirFotoGitHub(selectedFile, key);

    registros[key] = {
      fecha: key,
      objetivo: objetivoActivo.id,
      estado: 'enviado',
      fotoUrl: url,
      timestamp: Date.now(),
    };
    guardarRegistros();
    actualizarEstadoUsuario();
    renderHistorialUsuario();
  } catch (err) {
    status.textContent  = `Error: ${err.message}`;
    btn.disabled        = false;
    btn.textContent     = 'Reintentar';
  }
});

function renderHistorialUsuario() {
  const lista = document.getElementById('history-list');
  const items = Object.values(registros).sort((a,b) => b.fecha.localeCompare(a.fecha)).slice(0, 7);

  if (items.length === 0) {
    lista.innerHTML = '<li class="history-empty">Todavía no hay registros.</li>';
    return;
  }

  lista.innerHTML = items.map(r => {
    const estadoTexto = r.estado === 'aprobado' ? '✅ Aprobado'
                      : r.estado === 'rechazado' ? '❌ Rechazado'
                      : '⏳ Pendiente';
    const estadoClass = r.estado === 'aprobado' ? 'status-text-ok'
                      : r.estado === 'rechazado' ? 'status-text-bad'
                      : 'status-text-sent';
    return `
      <li class="history-item">
        <span class="history-date">${formatearFecha(r.fecha)}</span>
        <span class="history-status ${estadoClass}">${estadoTexto}</span>
      </li>`;
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

  if (pendientes.length === 0) {
    contenedor.innerHTML = '<p class="empty-msg">No hay fotos pendientes.</p>';
    return;
  }

  contenedor.innerHTML = pendientes.map(r => tarjetaRevision(r, true)).join('');
  contenedor.querySelectorAll('.btn-approve').forEach(btn => {
    btn.addEventListener('click', () => aprobarRegistro(btn.dataset.key));
  });
  contenedor.querySelectorAll('.btn-reject').forEach(btn => {
    btn.addEventListener('click', () => rechazarRegistro(btn.dataset.key));
  });
}

function renderAdminHistorial() {
  const contenedor = document.getElementById('admin-history-list');
  const todos = Object.values(registros)
    .filter(r => r.estado !== 'enviado')
    .sort((a,b) => b.fecha.localeCompare(a.fecha));

  if (todos.length === 0) {
    contenedor.innerHTML = '<p class="empty-msg">Sin registros revisados aún.</p>';
    return;
  }

  contenedor.innerHTML = todos.map(r => tarjetaRevision(r, false)).join('');
}

function tarjetaRevision(r, conAcciones) {
  const obj       = appConfig.objetivos.find(o => o.id === r.objetivo) || objetivoActivo;
  const badgeClass = r.estado === 'aprobado' ? 'badge-ok' : r.estado === 'rechazado' ? 'badge-bad' : 'badge-sent';
  const badgeTexto = r.estado === 'aprobado' ? 'Aprobado'  : r.estado === 'rechazado' ? 'Rechazado' : 'Pendiente';

  const acciones = conAcciones ? `
    <div class="review-card-actions">
      <button class="btn-approve" data-key="${r.fecha}">✅ Aprobar</button>
      <button class="btn-reject"  data-key="${r.fecha}">❌ Rechazar</button>
    </div>` : `
    <div class="review-card-actions">
      <span class="review-badge ${badgeClass}">${badgeTexto}</span>
    </div>`;

  return `
    <div class="review-card">
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
  guardarRegistros();
  renderAdminPendientes();
  renderAdminHistorial();
}

function rechazarRegistro(key) {
  if (!registros[key]) return;
  registros[key].estado = 'rechazado';
  guardarRegistros();
  renderAdminPendientes();
  renderAdminHistorial();
}

document.getElementById('logout-admin').addEventListener('click', cerrarSesion);

// ═══════════════════════════════════════════════════════════════
//  PANEL DE CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════

function renderConfigPanel() {
  document.getElementById('cfg-hora-inicio').value = appConfig.horaInicio;
  document.getElementById('cfg-hora-fin').value    = appConfig.horaFin;
  renderListaObjetivos();
  renderSelectActivo();
}

function renderListaObjetivos() {
  const lista = document.getElementById('cfg-objetivos-lista');
  if (appConfig.objetivos.length === 0) {
    lista.innerHTML = '<p class="empty-msg">No hay objetivos cargados.</p>';
    return;
  }

  lista.innerHTML = appConfig.objetivos.map((o, i) => `
    <div class="cfg-obj-item">
      <span class="cfg-obj-emoji">${o.emoji}</span>
      <div class="cfg-obj-info">
        <strong>${o.titulo}</strong>
        <small>${o.descripcion}</small>
      </div>
      ${appConfig.objetivos.length > 1
        ? `<button class="btn-ghost btn-small cfg-eliminar-obj" data-index="${i}">✕</button>`
        : ''}
    </div>
  `).join('');

  lista.querySelectorAll('.cfg-eliminar-obj').forEach(btn => {
    btn.addEventListener('click', () => eliminarObjetivo(parseInt(btn.dataset.index)));
  });
}

function renderSelectActivo() {
  const select = document.getElementById('cfg-objetivo-activo');
  select.innerHTML = appConfig.objetivos.map(o =>
    `<option value="${o.id}" ${o.id === appConfig.objetivoActivoId ? 'selected' : ''}>${o.emoji} ${o.titulo}</option>`
  ).join('');
}

document.getElementById('cfg-guardar-horario').addEventListener('click', async () => {
  const inicio = parseInt(document.getElementById('cfg-hora-inicio').value);
  const fin    = parseInt(document.getElementById('cfg-hora-fin').value);
  const status = document.getElementById('cfg-horario-status');

  if (isNaN(inicio) || isNaN(fin) || inicio >= fin || inicio < 0 || fin > 23) {
    mostrarStatus(status, '❌ Horario inválido. Inicio debe ser menor que fin (0-23).', false);
    return;
  }

  appConfig.horaInicio = inicio;
  appConfig.horaFin    = fin;

  try {
    document.getElementById('cfg-guardar-horario').disabled    = true;
    document.getElementById('cfg-guardar-horario').textContent = 'Guardando...';
    await guardarConfigRemota();
    mostrarStatus(status, `✅ Horario guardado: ${inicio}:00 – ${fin}:00 hs`, true);
  } catch (e) {
    mostrarStatus(status, `❌ Error: ${e.message}`, false);
  } finally {
    document.getElementById('cfg-guardar-horario').disabled    = false;
    document.getElementById('cfg-guardar-horario').textContent = 'Guardar horario';
  }
});

document.getElementById('cfg-agregar-obj').addEventListener('click', async () => {
  const emoji  = document.getElementById('cfg-obj-emoji').value.trim();
  const titulo = document.getElementById('cfg-obj-titulo').value.trim();
  const desc   = document.getElementById('cfg-obj-desc').value.trim();
  const status = document.getElementById('cfg-obj-status');

  if (!emoji || !titulo || !desc) {
    mostrarStatus(status, '❌ Completá todos los campos.', false);
    return;
  }

  const id = titulo.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (appConfig.objetivos.find(o => o.id === id)) {
    mostrarStatus(status, '❌ Ya existe un objetivo con ese nombre.', false);
    return;
  }

  appConfig.objetivos.push({ id, titulo, descripcion: desc, emoji });

  try {
    document.getElementById('cfg-agregar-obj').disabled    = true;
    document.getElementById('cfg-agregar-obj').textContent = 'Guardando...';
    await guardarConfigRemota();
    document.getElementById('cfg-obj-emoji').value  = '';
    document.getElementById('cfg-obj-titulo').value = '';
    document.getElementById('cfg-obj-desc').value   = '';
    renderListaObjetivos();
    renderSelectActivo();
    mostrarStatus(status, '✅ Objetivo agregado.', true);
  } catch (e) {
    appConfig.objetivos.pop();
    mostrarStatus(status, `❌ Error: ${e.message}`, false);
  } finally {
    document.getElementById('cfg-agregar-obj').disabled    = false;
    document.getElementById('cfg-agregar-obj').textContent = 'Agregar objetivo';
  }
});

async function eliminarObjetivo(index) {
  const obj = appConfig.objetivos[index];
  if (obj.id === appConfig.objetivoActivoId) {
    alert('No podés eliminar el objetivo activo. Cambiá el activo primero.');
    return;
  }
  if (!confirm(`¿Eliminar "${obj.titulo}"?`)) return;

  const eliminado = appConfig.objetivos.splice(index, 1)[0];
  try {
    await guardarConfigRemota();
    renderListaObjetivos();
    renderSelectActivo();
  } catch (e) {
    appConfig.objetivos.splice(index, 0, eliminado);
    alert(`Error al eliminar: ${e.message}`);
  }
}

document.getElementById('cfg-guardar-activo').addEventListener('click', async () => {
  const id     = document.getElementById('cfg-objetivo-activo').value;
  const status = document.getElementById('cfg-activo-status');

  appConfig.objetivoActivoId = id;
  objetivoActivo = appConfig.objetivos.find(o => o.id === id) || appConfig.objetivos[0];

  try {
    document.getElementById('cfg-guardar-activo').disabled    = true;
    document.getElementById('cfg-guardar-activo').textContent = 'Guardando...';
    await guardarConfigRemota();
    mostrarStatus(status, `✅ Objetivo activo: ${objetivoActivo.emoji} ${objetivoActivo.titulo}`, true);
  } catch (e) {
    mostrarStatus(status, `❌ Error: ${e.message}`, false);
  } finally {
    document.getElementById('cfg-guardar-activo').disabled    = false;
    document.getElementById('cfg-guardar-activo').textContent = 'Guardar';
  }
});

document.getElementById('cfg-guardar-token').addEventListener('click', async () => {
  const token  = document.getElementById('cfg-token-input').value.trim();
  const status = document.getElementById('cfg-token-status');

  if (!token) return;

  document.getElementById('cfg-guardar-token').disabled    = true;
  document.getElementById('cfg-guardar-token').textContent = 'Verificando...';

  const valido = await validarToken(token);

  if (valido) {
    setToken(token);
    document.getElementById('cfg-token-input').value = '';
    mostrarStatus(status, '✅ Token actualizado.', true);
  } else {
    mostrarStatus(status, '❌ Token inválido o sin acceso al repo.', false);
  }

  document.getElementById('cfg-guardar-token').disabled    = false;
  document.getElementById('cfg-guardar-token').textContent = 'Actualizar token';
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

function cerrarSesion() {
  rol          = null;
  selectedFile = null;
  mostrarPantalla('screen-login');
}