// ═══════════════════════════════════════════════════════════════
//  CONFIGURACIÓN  ← Editá estos valores antes de usar la app
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Contraseñas de acceso
  PASSWORD_USER:  "soyadulto",       // Contraseña del usuario (tu amigo)
  PASSWORD_ADMIN: "admin2026", // Contraseña del admin (vos)

  // GitHub storage
  GITHUB_TOKEN: "%%GITHUB_TOKEN%%",  // ← placeholder, se reemplaza en el deploy  GITHUB_USER:    "Nahuel-MRam",       // Tu usuario de GitHub
  GITHUB_REPO:    "habitos-storage",   // Nombre del repo que creaste

  // Horario permitido para subir la foto (formato 24hs)
  HORA_INICIO: 9,   // 9:00 hs
  HORA_FIN:    24,  //  10:00 hs  ← ajustá al horario real cuando quieras

  // Puntos por objetivo aprobado
  PUNTOS_POR_OBJETIVO: 10,
};

// ═══════════════════════════════════════════════════════════════
//  OBJETIVOS  ← Acá agregás más a medida que pase el tiempo
// ═══════════════════════════════════════════════════════════════

const OBJETIVOS = [
  {
    id: "caminata",
    titulo: "Caminata diaria",
    descripcion: "Salí a caminar y sacá una foto del árbol de tu casa.",
    horario: `${CONFIG.HORA_INICIO}:00 – ${CONFIG.HORA_FIN}:00 hs`,
    emoji: "🏃",
  },
  // Ejemplo de cómo agregar más objetivos en el futuro:
  // {
  //   id: "lectura",
  //   titulo: "Leer 20 minutos",
  //   descripcion: "Leé algo y sacá una foto del libro o la pantalla.",
  //   horario: "20:00 – 23:00 hs",
  //   emoji: "📖",
  // },
];

// Objetivo activo (por ahora siempre es el primero)
const OBJETIVO_ACTIVO = OBJETIVOS[0];

// ═══════════════════════════════════════════════════════════════
//  ESTADO DE LA APP
// ═══════════════════════════════════════════════════════════════

let rol = null; // "user" | "admin"
let selectedFile = null;
let registros = cargarRegistros();

// ═══════════════════════════════════════════════════════════════
//  HELPERS DE FECHA
// ═══════════════════════════════════════════════════════════════

function hoyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function esDiaHabil() {
  const dia = new Date().getDay(); // 0=Dom, 6=Sab
  return dia >= 1 && dia <= 5;
}

function estaEnHorario() {
  const h = new Date().getHours();
  return h >= CONFIG.HORA_INICIO && h < CONFIG.HORA_FIN;
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
//  GITHUB API
// ═══════════════════════════════════════════════════════════════

async function subirFotoGitHub(file, key) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const path = `fotos/${key}_${OBJETIVO_ACTIVO.id}.jpg`;
      const url = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}`;

      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${CONFIG.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `foto ${key}`,
            content: base64,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          reject(new Error(err.message || 'Error al subir'));
          return;
        }

        const data = await res.json();
        resolve(data.content.download_url);
      } catch (e) {
        reject(e);
      }
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
//  LOGIN
// ═══════════════════════════════════════════════════════════════

document.getElementById('login-btn').addEventListener('click', hacerLogin);
document.getElementById('login-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') hacerLogin();
});

function hacerLogin() {
  const pass = document.getElementById('login-input').value.trim();
  const error = document.getElementById('login-error');

  if (pass === CONFIG.PASSWORD_ADMIN) {
    rol = 'admin';
    error.classList.add('hidden');
    iniciarAdmin();
    mostrarPantalla('screen-admin');
  } else if (pass === CONFIG.PASSWORD_USER) {
    rol = 'user';
    error.classList.add('hidden');
    iniciarUsuario();
    mostrarPantalla('screen-user');
  } else {
    error.classList.remove('hidden');
  }

  document.getElementById('login-input').value = '';
}

// ═══════════════════════════════════════════════════════════════
//  VISTA USUARIO
// ═══════════════════════════════════════════════════════════════

function iniciarUsuario() {
  // Fecha
  document.getElementById('user-day-label').textContent = nombreDia();
  document.getElementById('user-date-title').textContent = fechaLarga();

  // Objetivo
  document.getElementById('obj-title').textContent = OBJETIVO_ACTIVO.titulo;
  document.getElementById('obj-desc').textContent = OBJETIVO_ACTIVO.descripcion;
  document.getElementById('obj-time').textContent = `⏰ Horario: ${OBJETIVO_ACTIVO.horario}`;

  // Puntos
  document.getElementById('user-points-display').textContent = `${totalPuntos()} pts`;

  // Estado del día
  actualizarEstadoUsuario();

  // Historial
  renderHistorialUsuario();
}

function actualizarEstadoUsuario() {
  const key = hoyKey();
  const registro = registros[key];

  // Ocultar todos los estados
  ['state-pending','state-sent','state-approved','state-rejected','state-out-of-time','state-weekend'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  // Fin de semana
  if (!esDiaHabil()) {
    document.getElementById('state-weekend').classList.remove('hidden');
    return;
  }

  // Ya tiene registro
  if (registro) {
    if (registro.estado === 'enviado') {
      document.getElementById('state-sent').classList.remove('hidden');
    } else if (registro.estado === 'aprobado') {
      document.getElementById('state-approved').classList.remove('hidden');
      document.getElementById('user-points-display').textContent = `${totalPuntos()} pts`;
    } else if (registro.estado === 'rechazado') {
      // Si fue rechazado puede volver a intentarlo si está en horario
      if (estaEnHorario()) {
        document.getElementById('state-pending').classList.remove('hidden');
      } else {
        document.getElementById('state-rejected').classList.remove('hidden');
      }
    }
    return;
  }

  // Sin registro: verificar horario
  if (!estaEnHorario()) {
    const msg = document.getElementById('out-of-time-msg');
    const h = new Date().getHours();
    if (h < CONFIG.HORA_INICIO) {
      msg.textContent = `El horario de entrega empieza a las ${CONFIG.HORA_INICIO}:00 hs.`;
    } else {
      msg.textContent = `El horario de entrega ya pasó para hoy.`;
    }
    document.getElementById('state-out-of-time').classList.remove('hidden');
    return;
  }

  // Pendiente — puede subir
  document.getElementById('state-pending').classList.remove('hidden');
}

// Subida de foto
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

  const btn = document.getElementById('send-photo-btn');
  const status = document.getElementById('upload-status');

  btn.disabled = true;
  btn.textContent = 'Subiendo...';
  status.textContent = 'Subiendo foto a GitHub...';
  status.classList.remove('hidden');

  try {
    const key = hoyKey();
    const url = await subirFotoGitHub(selectedFile, key);

    registros[key] = {
      fecha: key,
      objetivo: OBJETIVO_ACTIVO.id,
      estado: 'enviado',
      fotoUrl: url,
      timestamp: Date.now(),
    };
    guardarRegistros();

    actualizarEstadoUsuario();
    renderHistorialUsuario();
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    btn.disabled = false;
    btn.textContent = 'Reintentar';
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

function iniciarAdmin() {
  renderAdminPendientes();
  renderAdminHistorial();
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
  const badgeClass = r.estado === 'aprobado' ? 'badge-ok'
                   : r.estado === 'rechazado' ? 'badge-bad'
                   : 'badge-sent';
  const badgeTexto = r.estado === 'aprobado' ? 'Aprobado'
                   : r.estado === 'rechazado' ? 'Rechazado'
                   : 'Pendiente';

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
        <span class="review-card-obj">${OBJETIVO_ACTIVO.emoji} ${OBJETIVO_ACTIVO.titulo}</span>
      </div>
      <img src="${r.fotoUrl}" alt="foto del objetivo" loading="lazy" />
      ${acciones}
    </div>`;
}

function aprobarRegistro(key) {
  if (!registros[key]) return;
  registros[key].estado = 'aprobado';
  guardarRegistros();
  iniciarAdmin();
}

function rechazarRegistro(key) {
  if (!registros[key]) return;
  registros[key].estado = 'rechazado';
  guardarRegistros();
  iniciarAdmin();
}

document.getElementById('logout-admin').addEventListener('click', cerrarSesion);

// ═══════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════

function cerrarSesion() {
  rol = null;
  selectedFile = null;
  mostrarPantalla('screen-login');
}