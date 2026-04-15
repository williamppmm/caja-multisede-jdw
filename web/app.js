const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000];
const CONTRASENA = '1980';
const ADMIN_CONTRASENA = '190380';
const OBSERVACION_CRITICA_DEFAULT = 'reinicio técnico';
const MODULE_META = {
  caja: { label: 'Caja', panelId: 'panel-caja', dateLabel: 'Fecha del arqueo' },
  plataformas: { label: 'Plataformas', panelId: 'panel-plataformas', dateLabel: 'Fecha de plataformas' },
  gastos: { label: 'Gastos', panelId: 'panel-gastos', dateLabel: 'Fecha de gastos' },
  bonos: { label: 'Bonos', panelId: 'panel-bonos', dateLabel: 'Fecha de bonos' },
  prestamos: { label: 'Prestamos', panelId: 'panel-prestamos', dateLabel: 'Fecha de préstamos' },
  movimientos: { label: 'Movimientos', panelId: 'panel-movimientos', dateLabel: 'Fecha de movimientos' },
  contadores: { label: 'Contadores', panelId: 'panel-contadores', dateLabel: 'Fecha de contadores' },
  cuadre: { label: 'Cuadre', panelId: 'panel-cuadre', dateLabel: 'Fecha del cuadre' },
};

let configModoEntrada = 'cantidad';
let configSede = 'Principal';
let configDataDir = '';
let enabledModules = ['caja', 'gastos'];
let defaultModule = 'caja';
let configSuperAdminMode = false;
let configSuperAdminBuild = false;   // true cuando el proceso es CajaSuperAdmin.exe
let configRemoteSites = [];
let configActiveSite = null;
let currentModule = 'caja';
const cajaInputSessionToken = `caja_${Date.now().toString(36)}`;
let moduleDates = {};
let adminOverride = { caja: null, plataformas: null, gastos: null, bonos: null, prestamos: null, movimientos: null, contadores: null, cuadre: null };
let cuadreDatos = null;
let debounceTimer = null;
let pendingAdminAction = null;
let pendingAuthContext = null;
let pendingAuthFocusSelector = null;
let pendingAuthAnchorSelector = null;
let pendingAuthPoint = null;
let moduleStatusCache = {};
let bonusNames = [];
let loanNames = [];
let expenseConcepts = [];
let movementConcepts = [];
let bonusDayItems = [];
let gastosItems = [];
let loanItems = [];
let loanSaldos = {};
let movementItems = [];
let cajaLocked = false;
let _cerrando = false;
let cajaDrafts = {};
let contadorCatalog = [];
let contadoresDrafts = {};
let contadoresLocked = false;

function fmt(n) {
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

function esSuperAdminActivo() {
  return Boolean(configSuperAdminMode && configActiveSite);
}

function limpiarNumeroTexto(valor, allowNegative = false) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';
  const negativo = allowNegative && texto.startsWith('-');
  const digitos = texto.replace(/[^\d]/g, '');
  if (!digitos) return negativo ? '-' : '';
  return `${negativo ? '-' : ''}${digitos}`;
}

function formatNumeroTexto(valor, allowNegative = false) {
  const limpio = limpiarNumeroTexto(valor, allowNegative);
  if (!limpio || limpio === '-') return limpio;
  const negativo = limpio.startsWith('-');
  const digitos = negativo ? limpio.slice(1) : limpio;
  const normalizado = digitos.replace(/^0+(?=\d)/, '') || '0';
  const conMiles = normalizado.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${conMiles}`;
}

function parseNumeroTexto(valor, allowNegative = false) {
  const limpio = limpiarNumeroTexto(valor, allowNegative);
  if (!limpio || limpio === '-') return NaN;
  return Number(limpio);
}

function parseNumeroInput(id, allowNegative = false) {
  return parseNumeroTexto(document.getElementById(id)?.value, allowNegative);
}

function setNumeroInputValue(id, valor, allowNegative = false) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = valor === '' || valor === null || typeof valor === 'undefined'
    ? ''
    : formatNumeroTexto(valor, allowNegative);
}

function formatearInputNumerico(input, allowNegative = false, useThousands = true) {
  if (!input) return;
  if (!useThousands) {
    input.value = limpiarNumeroTexto(input.value, allowNegative);
    return;
  }
  const valorAnterior = String(input.value ?? '');
  const start = input.selectionStart ?? valorAnterior.length;
  const estabaNegativo = allowNegative && limpiarNumeroTexto(valorAnterior, allowNegative).startsWith('-');
  const digitosAntes = valorAnterior
    .slice(0, start)
    .replace(/[^\d]/g, '')
    .length;
  input.value = formatNumeroTexto(valorAnterior, allowNegative);
  if (document.activeElement !== input) return;
  let vistos = 0;
  let nuevaPos = estabaNegativo && digitosAntes === 0 ? 1 : input.value.length;
  for (let i = 0; i < input.value.length; i += 1) {
    if (/\d/.test(input.value[i])) {
      vistos += 1;
      if (vistos >= digitosAntes) {
        nuevaPos = i + 1;
        break;
      }
    }
  }
  if (digitosAntes === 0 && !estabaNegativo) nuevaPos = 0;
  input.setSelectionRange(nuevaPos, nuevaPos);
}

function limpiarFormatoInputNumerico(input, allowNegative = false) {
  if (!input) return;
  input.value = limpiarNumeroTexto(input.value, allowNegative);
}

function parsePositivo(id) {
  const v = parseNumeroInput(id);
  return isNaN(v) || v < 0 ? 0 : v;
}

function esTextoSoloNumeros(texto) {
  return /^\d+$/.test(String(texto || '').trim());
}

function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hoyStr() {
  return dateToStr(new Date());
}

function ayerStr() {
  const d = new Date();
  return dateToStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

function mostrarMensaje(texto, tipo) {
  const el = document.getElementById('mensaje');
  el.textContent = texto;
  el.className = 'mensaje ' + tipo;
}

function formatFechaVisual(fechaIso) {
  if (!fechaIso) return '--';
  const match = String(fechaIso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
  }
  const matchSlash = String(fechaIso).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchSlash) {
    const [, day, month, year] = matchSlash;
    return `${day}-${month}-${year}`;
  }
  return fechaIso;
}

function obtenerNombreDia(fechaIso) {
  const match = String(fechaIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  const fecha = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-CO', { weekday: 'long' });
}

function capitalizarTexto(texto) {
  const valor = String(texto || '').trim();
  return valor ? valor.charAt(0).toUpperCase() + valor.slice(1) : '';
}

function actualizarDiaFecha(fechaIso) {
  const el = document.getElementById('fecha-dia');
  if (!el) return;
  const nombreDia = capitalizarTexto(obtenerNombreDia(fechaIso));
  el.textContent = nombreDia || 'Sin fecha';
  el.classList.toggle('oculto', !nombreDia);
}

function formatFechaHoraVisual(valor) {
  if (!valor) return '';
  const texto = String(valor);
  const fechaMatch = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!fechaMatch) return texto;
  const [, year, month, day] = fechaMatch;
  const fecha = `${day}-${month}-${year}`;
  const horaMatch = texto.match(/(\d{2}:\d{2}:\d{2})/);
  return horaMatch ? `${fecha} ${horaMatch[1]}` : fecha;
}

function formatHoraVisual(dateObj = new Date()) {
  return dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function ocultarMensaje() {
  document.getElementById('mensaje').className = 'mensaje oculto';
}

function previewExcelAnual() {
  const year = new Date().getFullYear();
  const sede = normalizarSedePreview()
    .replace(/\s+/g, '_')
    .replace(/[<>:"/\\|?*]+/g, '') || 'Principal';
  return `Contadores_${sede}_${year}.xlsx`;
}

function normalizarSedePreview() {
  return document.getElementById('admin-sede')?.value.trim() || 'Principal';
}

function actualizarPreviewRutaAdmin() {
  const input = document.getElementById('admin-data-dir');
  const preview = document.getElementById('admin-excel-preview');
  if (!input || !preview) return;
  const dir = input.value.trim();
  preview.textContent = dir ? `${dir}\\${previewExcelAnual()}` : previewExcelAnual();
}

function actualizarPreviewHojasAdmin() {
  const preview = document.getElementById('admin-sheet-preview');
  if (!preview) return;
  const sede = normalizarSedePreview();
  const modulos = obtenerModulosMarcadosAdmin().filter(modulo => ['caja', 'plataformas', 'gastos', 'bonos', 'prestamos', 'movimientos', 'contadores', 'cuadre'].includes(modulo));
  preview.textContent = modulos.length
    ? modulos.map(modulo => `Hoja ${modulo}: ${MODULE_META[modulo].label}${sede}`).join(' | ')
    : 'Sin módulos Excel habilitados';
}

function actualizarEstadoDeportivas() {
  const input = document.getElementById('venta_deportivas');
  const resumenItem = document.getElementById('resumen-deportivas')?.closest('.resumen-item');
  if (!input || !resumenItem) return;
  const valor = parseNumeroTexto(input.value, true);
  const esNegativo = !isNaN(valor) && valor < 0;
  input.classList.toggle('valor-negativo', esNegativo);
  resumenItem.classList.toggle('negativo', esNegativo);
}

function mostrarBannerActivo(texto, titulo = 'Edición autorizada') {
  const banner = document.getElementById('banner-edicion');
  document.body.classList.remove('auth-banner-open');
  document.getElementById('auth-card').classList.add('oculto');
  document.getElementById('banner-titulo').textContent = titulo;
  document.getElementById('banner-texto').textContent = texto;
  banner.classList.remove('oculto');
  banner.classList.add('banner-edicion-active');
  pendingAdminAction = null;
  pendingAuthContext = null;
}

function mostrarBannerAutorizacion({ titulo, descripcion, onSuccess, focusSelector = null }) {
  const card = document.getElementById('auth-card');
  document.getElementById('banner-edicion').classList.add('oculto');
  pendingAdminAction = onSuccess;
  pendingAuthContext = { titulo, descripcion };
  pendingAuthFocusSelector = focusSelector;
  pendingAuthAnchorSelector = focusSelector;
  document.getElementById('auth-card-texto').textContent = `Estás en el día ${formatFechaVisual(document.getElementById('fecha')?.value || '')}`;
  document.getElementById('auth-card-pass').value = '';
  document.getElementById('auth-card-error').classList.add('oculto');
  document.body.classList.add('auth-banner-open');
  card.classList.remove('oculto');
  card.dataset.titulo = titulo;
  card.dataset.descripcion = descripcion;
  posicionarTarjetaAuth();
  setTimeout(() => {
    posicionarTarjetaAuth();
    document.getElementById('auth-card-pass')?.focus();
  }, 30);
}

function ocultarBanner() {
  pendingAuthContext = null;
  pendingAuthFocusSelector = null;
  pendingAuthAnchorSelector = null;
  pendingAuthPoint = null;
  document.body.classList.remove('auth-banner-open');
  document.getElementById('auth-card').classList.add('oculto');
  document.getElementById('auth-card').style.removeProperty('position');
  document.getElementById('auth-card').style.removeProperty('top');
  document.getElementById('auth-card').style.removeProperty('left');
  document.getElementById('auth-card').style.removeProperty('transform');
  document.getElementById('auth-card').style.removeProperty('z-index');
  document.getElementById('banner-edicion').classList.add('oculto');
  document.getElementById('banner-edicion').classList.remove('banner-edicion-active');
}

function guardarEstadoModulo(modulo, fecha, data) {
  moduleStatusCache[modulo] = { fecha, data };
}

function obtenerEstadoModulo(modulo, fecha) {
  const guardado = moduleStatusCache[modulo];
  if (!guardado || guardado.fecha !== fecha) return null;
  return guardado.data || null;
}

function requiereAutorizacionParaFecha(modulo, fecha, data = null) {
  if (configSuperAdminMode && configActiveSite) return false;
  if (!modulo || !fecha || fecha > hoyStr() || isOverrideActive(modulo, fecha)) return false;
  if (modulo === 'caja') {
    const fechaLibre = fecha === hoyStr() || fecha === ayerStr();
    if (fechaLibre && !data?.existe) return false;
    return true;
  }
  if (modulo === 'contadores' || modulo === 'cuadre') {
    return Boolean(data?.existe);
  }
  return fecha !== hoyStr();
}

function obtenerMensajeAutorizacion(modulo, fecha) {
  const label = MODULE_META[modulo]?.label || modulo;
  return {
    titulo: `Editar ${label.toLowerCase()}`,
    descripcion: `Estás en el día ${formatFechaVisual(fecha)}. Si de verdad requieres editar ${label.toLowerCase()}, ingresa la contraseña.`,
  };
}

function obtenerSelectorReanudacion(control) {
  if (!control) return null;
  if (control.id) return `#${control.id}`;
  if (control.matches('input[name][value]')) {
    return `input[name="${control.name}"][value="${control.value}"]`;
  }
  if (control.matches('.contador-campo, .btn-confirmar-critica, .btn-toggle-pausa')) {
    const row = control.closest('tr');
    if (row?.dataset.itemId) {
      if (control.matches('.btn-confirmar-critica')) return `tr[data-item-id="${row.dataset.itemId}"] .btn-confirmar-critica`;
      if (control.matches('.btn-toggle-pausa')) return `tr[data-item-id="${row.dataset.itemId}"] .btn-toggle-pausa`;
      const role = control.dataset.role || '';
      return role
        ? `tr[data-item-id="${row.dataset.itemId}"] [data-role="${role}"]`
        : `tr[data-item-id="${row.dataset.itemId}"] .contador-campo`;
    }
  }
  return null;
}

function restaurarFocoDespuesAutorizacion() {
  if (!pendingAuthFocusSelector) return;
  const selector = pendingAuthFocusSelector;
  pendingAuthFocusSelector = null;
  setTimeout(() => {
    const target = document.querySelector(selector);
    if (!target) return;
    target.focus?.();
    target.select?.();
  }, 80);
}

function posicionarTarjetaAuth() {
  const card = document.getElementById('auth-card');
  if (!card || card.classList.contains('oculto')) return;

  card.style.setProperty('position', 'fixed', 'important');
  card.style.setProperty('z-index', '220', 'important');
  card.style.setProperty('left', '50vw', 'important');
  card.style.setProperty('top', '50vh', 'important');
  card.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
}

function esControlEdicionActual(control) {
  if (!control || control.closest('#banner-edicion, #modal-admin')) return false;
  if (control.id === 'fecha' || control.id === 'btn-admin') return false;
  if (control.closest('#modal-admin')) return false;
  const panel = document.getElementById(MODULE_META[currentModule]?.panelId);
  if (currentModule === 'caja' || currentModule === 'plataformas') {
    if (control.id === 'btn-guardar') return true;
  }
  if (!panel || !panel.contains(control)) return false;

  if (currentModule === 'caja' || currentModule === 'plataformas') {
    return control.matches('input, textarea, select');
  }
  if (currentModule === 'gastos') {
    return control.matches('#gasto-concepto, #gasto-valor, #btn-gasto-registrar');
  }
  if (currentModule === 'bonos') {
    return control.matches('#bono-cliente, #bono-valor, #btn-bono-registrar');
  }
  if (currentModule === 'prestamos') {
    return control.matches('#prestamo-persona, #prestamo-valor, #btn-prestamo-registrar, input[name="prestamo-tipo"]');
  }
  if (currentModule === 'movimientos') {
    return control.matches('#movimiento-concepto, #movimiento-valor, #btn-movimiento-registrar, input[name="movimiento-tipo"]');
  }
  if (currentModule === 'contadores') {
    return control.matches('.contador-campo, .btn-confirmar-critica, .btn-toggle-pausa, summary, .contador-critica input, .contador-pausa input');
  }
  if (currentModule === 'cuadre') {
    return control.matches('#cuadre-base-input, #btn-cuadre-guardar');
  }
  return false;
}

function bloquearIntentoEdicion(control, evento = null) {
  const fecha = document.getElementById('fecha')?.value || '';
  pendingAuthPoint = evento && typeof evento.clientX === 'number' && typeof evento.clientY === 'number'
    ? { x: evento.clientX, y: evento.clientY }
    : null;
  if (!fecha) return false;
  if (fecha > hoyStr()) {
    if (evento?.type !== 'focusin') {
      evento?.preventDefault?.();
      evento?.stopPropagation?.();
      evento?.stopImmediatePropagation?.();
    }
    control.blur?.();
    mostrarMensaje('No es posible editar una fecha futura.', 'advertencia');
    return true;
  }

  const estado = obtenerEstadoModulo(currentModule, fecha);
  if (!requiereAutorizacionParaFecha(currentModule, fecha, estado)) return false;

  if (evento?.type !== 'focusin') {
    evento?.preventDefault?.();
    evento?.stopPropagation?.();
    evento?.stopImmediatePropagation?.();
  }
  control.blur?.();

  const { titulo, descripcion } = obtenerMensajeAutorizacion(currentModule, fecha);
  mostrarBannerAutorizacion({
    titulo,
    descripcion,
    focusSelector: obtenerSelectorReanudacion(control),
    onSuccess: async () => {
      setOverride(currentModule, fecha);
      mostrarBannerActivo(`${MODULE_META[currentModule].label} autorizada para ${formatFechaVisual(fecha)}.`);
      await cargarVistaModulo(currentModule, fecha);
      await verificarFechaActual();
      restaurarFocoDespuesAutorizacion();
    },
  });
  return true;
}

function buildTablaBilletes() {
  const tbody = document.getElementById('tbody-billetes');
  tbody.innerHTML = '';
  DENOMINACIONES.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>$ ${d.toLocaleString('es-CO')}</td>
      <td><input type="text" inputmode="numeric" id="cant_${d}" placeholder="0" class="input-billete" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" /></td>
      <td><input type="text" inputmode="numeric" id="sub_${d}" placeholder="0" class="input-billete" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" /></td>
    `;
    tbody.appendChild(tr);
  });
}

function configurarCajaSinAutocompletar() {
  const ids = [
    ...DENOMINACIONES.flatMap(d => [`cant_${d}`, `sub_${d}`]),
    'total_monedas',
    'billetes_viejos',
  ];

  ids.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.autocomplete = 'off';
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-form-type', 'other');
    input.name = `${id}_${cajaInputSessionToken}`;
  });
}

function desactivarSugerenciasFormulario() {
  const campos = [...document.querySelectorAll('input, textarea')];
  campos.forEach((input, index) => {
    const tipo = (input.type || '').toLowerCase();
    if (['hidden', 'radio', 'checkbox', 'button', 'submit'].includes(tipo)) return;

    input.autocomplete = 'off';
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-form-type', 'other');

    if (tipo !== 'date') {
      const base = input.id || input.name || `field_${index}`;
      input.name = `${base}_${cajaInputSessionToken}`;
    }
  });
}

function observarNuevosCamposFormulario() {
  const observer = new MutationObserver(() => {
    desactivarSugerenciasFormulario();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function camposEditablesBilletes() {
  const prefijo = configModoEntrada === 'cantidad' ? 'cant_' : 'sub_';
  const billetes = DENOMINACIONES.map(d => document.getElementById(prefijo + d));
  const manuales = ['total_monedas', 'billetes_viejos']
    .map(id => document.getElementById(id));
  return [...billetes, ...manuales];
}

function setCajaEditable(editable) {
  cajaLocked = !editable;
  const esCantidad = configModoEntrada === 'cantidad';

  DENOMINACIONES.forEach(d => {
    const cant = document.getElementById(`cant_${d}`);
    const sub = document.getElementById(`sub_${d}`);
    if (!cant || !sub) return;

    cant.readOnly = cajaLocked || !esCantidad;
    sub.readOnly = cajaLocked || esCantidad;
    cant.tabIndex = cajaLocked ? -1 : (esCantidad ? 0 : -1);
    sub.tabIndex = cajaLocked ? -1 : (esCantidad ? -1 : 0);
    cant.classList.toggle('input-readonly', cajaLocked || !esCantidad);
    sub.classList.toggle('input-readonly', cajaLocked || esCantidad);
  });

  ['total_monedas', 'billetes_viejos'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.readOnly = cajaLocked;
    input.tabIndex = cajaLocked ? -1 : 0;
    input.classList.toggle('input-readonly', cajaLocked);
  });
}

function aplicarModoEntrada() {
  const esCantidad = configModoEntrada === 'cantidad';
  document.getElementById('th-cantidad').textContent = esCantidad ? 'Cantidad' : 'Cantidad (calc.)';
  document.getElementById('th-subtotal').textContent = esCantidad ? 'Subtotal' : 'Total denominación';
  setCajaEditable(!cajaLocked);
  DENOMINACIONES.forEach(d => {
    formatearInputNumerico(document.getElementById(`cant_${d}`), false, true);
    formatearInputNumerico(document.getElementById(`sub_${d}`), false, true);
  });
}

function moverAlSiguiente(inputActual) {
  const campos = camposEditablesBilletes();
  const idx = campos.indexOf(inputActual);
  if (idx !== -1 && idx < campos.length - 1) {
    campos[idx + 1].focus();
    campos[idx + 1].select();
  }
}

function calcularCaja() {
  let totalBilletes = 0;
  DENOMINACIONES.forEach(d => {
    if (configModoEntrada === 'cantidad') {
      const cant = parseNumeroInput(`cant_${d}`);
      const c = isNaN(cant) || cant < 0 ? 0 : cant;
      const sub = c * d;
      totalBilletes += sub;
      setNumeroInputValue(`sub_${d}`, sub > 0 ? sub : '');
    } else {
      const sub = parseNumeroInput(`sub_${d}`) || 0;
      const cant = sub > 0 ? sub / d : 0;
      totalBilletes += sub;
      setNumeroInputValue(`cant_${d}`, cant > 0 ? Math.round(cant) : '');
    }
  });

  const monedas = parsePositivo('total_monedas');
  const viejos = parsePositivo('billetes_viejos');
  const totalCaja = totalBilletes + monedas + viejos;

  document.getElementById('total-billetes').textContent = fmt(totalBilletes);
  document.getElementById('resumen-billetes').textContent = fmt(totalBilletes);
  document.getElementById('resumen-monedas').textContent = fmt(monedas);
  document.getElementById('resumen-viejos').textContent = fmt(viejos);
  document.getElementById('resumen-total').textContent = fmt(totalCaja);
}

function calcularPlataformas() {
  const practi = parsePositivo('venta_practisistemas');
  const deport = parseNumeroInput('venta_deportivas', true) || 0;
  document.getElementById('resumen-practisistemas').textContent = fmt(practi);
  document.getElementById('resumen-deportivas').textContent = fmt(deport);
  document.getElementById('resumen-plataformas-total').textContent = fmt(practi + deport);
  actualizarEstadoDeportivas();
}

function renderGastosRegistros(items = [], total = 0) {
  const tbody = document.getElementById('gastos-registros-body');
  if (!tbody) return;
  gastosItems = Array.isArray(items) ? [...items] : [];
  tbody.innerHTML = '';
  if (!gastosItems.length) {
    tbody.innerHTML = `<tr><td colspan="${esSuperAdminActivo() ? 4 : 3}" class="bonos-vacio">Sin registros para esta fecha.</td></tr>`;
  } else {
    [...gastosItems].reverse().forEach(item => {
      const tr = document.createElement('tr');
      const ts = item.fecha_hora_registro || '';
      if (ts) tr.dataset.ts = ts;
      tr.innerHTML = `
        <td>${item.hora_display || ''}</td>
        <td>${item.concepto || ''}</td>
        <td>${fmt(item.valor || 0)}</td>
        ${esSuperAdminActivo() ? `
          <td class="td-acciones">
            <button type="button" class="btn-tabla-accion btn-tabla-editar" data-modulo="gastos" data-ts="${ts}">✎</button>
            <button type="button" class="btn-tabla-accion btn-tabla-eliminar" data-modulo="gastos" data-ts="${ts}">✕</button>
          </td>
        ` : ''}
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-gastos').textContent = fmt(total);
  const detGastos = document.getElementById('gastos-detalle-dia');
  if (detGastos) detGastos.open = items.length > 0;
}

function actualizarBonosVisuales() {
  const fecha = moduleDates.bonos || hoyStr();
  const fechaEl = document.getElementById('bonos-fecha-visual');
  const horaEl = document.getElementById('bonos-hora-visual');
  if (fechaEl) fechaEl.textContent = formatFechaVisual(fecha);
  if (horaEl) horaEl.textContent = formatHoraVisual(new Date());
}

function actualizarPrestamosVisuales() {
  const fecha = moduleDates.prestamos || hoyStr();
  const fechaEl = document.getElementById('prestamos-fecha-visual');
  if (fechaEl) fechaEl.textContent = formatFechaVisual(fecha);
}

function actualizarMovimientosVisuales() {
  const fecha = moduleDates.movimientos || hoyStr();
  const fechaEl = document.getElementById('movimientos-fecha-visual');
  if (fechaEl) fechaEl.textContent = formatFechaVisual(fecha);
}

function renderBonusNames() {
  const lista = document.getElementById('bonos-clientes-lista');
  if (!lista) return;
  lista.innerHTML = bonusNames
    .map(nombre => `<option value="${String(nombre).replace(/"/g, '&quot;')}"></option>`)
    .join('');
}

function renderExpenseConcepts() {
  const lista = document.getElementById('gastos-conceptos-lista');
  if (!lista) return;
  lista.innerHTML = expenseConcepts
    .map(concepto => `<option value="${String(concepto).replace(/"/g, '&quot;')}"></option>`)
    .join('');
}

function renderMovementConcepts() {
  const lista = document.getElementById('movimientos-conceptos-lista');
  if (!lista) return;
  lista.innerHTML = movementConcepts
    .map(concepto => `<option value="${String(concepto).replace(/"/g, '&quot;')}"></option>`)
    .join('');
}

function renderLoanNames() {
  const lista = document.getElementById('prestamos-personas-lista');
  if (!lista) return;
  lista.innerHTML = loanNames
    .map(nombre => `<option value="${String(nombre).replace(/"/g, '&quot;')}"></option>`)
    .join('');
}

async function cargarBonusNames() {
  try {
    const res = await fetch('/api/modulos/bonos/nombres');
    const data = await res.json();
    bonusNames = data.nombres || [];
    renderBonusNames();
  } catch {
    bonusNames = [];
    renderBonusNames();
  }
}

async function cargarExpenseConcepts() {
  try {
    const res = await fetch('/api/modulos/gastos/conceptos');
    const data = await res.json();
    expenseConcepts = data.conceptos || [];
    renderExpenseConcepts();
  } catch {
    expenseConcepts = [];
    renderExpenseConcepts();
  }
}

async function cargarMovementConcepts() {
  try {
    const res = await fetch('/api/modulos/movimientos/conceptos');
    const data = await res.json();
    movementConcepts = data.conceptos || [];
    renderMovementConcepts();
  } catch {
    movementConcepts = [];
    renderMovementConcepts();
  }
}

async function cargarLoanNames() {
  try {
    const res = await fetch('/api/modulos/prestamos/personas');
    const data = await res.json();
    loanNames = data.personas || [];
    renderLoanNames();
  } catch {
    loanNames = [];
    renderLoanNames();
  }
}

async function cargarContadoresCatalogo() {
  try {
    const res = await fetch('/api/modulos/catalogos/contadores');
    const data = await res.json();
    contadorCatalog = data.items || [];
  } catch {
    contadorCatalog = [];
  }
}

function limpiarFormularioContadores() {
  document.getElementById('contadores-body').innerHTML = '<tr><td colspan="9" class="bonos-vacio">Sin ítems configurados.</td></tr>';
  document.getElementById('contadores-total').textContent = fmt(0);
}

function getContadoresInputs() {
  return [...document.querySelectorAll('.contador-campo, .contador-critica input')];
}

function setContadoresEditable(editable) {
  contadoresLocked = !editable;
  getContadoresInputs().forEach(input => {
    const row = input.closest('tr[data-item-id]');
    const filaPausada = row?.dataset.pausado === '1' && input.matches('.contador-campo');
    input.readOnly = contadoresLocked || filaPausada;
    if (input.tagName === 'INPUT') input.disabled = false;
    // Crítica inputs are always excluded from tab order; only .contador-campo fields navigate with Tab/Enter
    const esCritica = input.closest('.contador-critica');
    input.tabIndex = (contadoresLocked || esCritica || filaPausada) ? -1 : 0;
    input.classList.toggle('input-readonly', contadoresLocked || filaPausada);
  });
  document.querySelectorAll('.btn-confirmar-critica').forEach(btn => {
    btn.disabled = contadoresLocked;
  });
}

function marcarFilaContadorDirty(row) {
  if (!row?.dataset?.itemId) return;
  row.dataset.draftDirty = '1';
}

function limpiarDirtyFilaContador(row) {
  if (!row?.dataset?.itemId) return;
  row.dataset.draftDirty = '0';
}

function filaDesdeDataset(row) {
  return {
    item_id: row.dataset.itemId,
    nombre: row.dataset.nombre,
    denominacion: Number(row.dataset.denominacion || 0),
    refEntradas: Number(row.dataset.refEntradas || 0),
    refSalidas: Number(row.dataset.refSalidas || 0),
    refJackpot: Number(row.dataset.refJackpot || 0),
    refYield: Number(row.dataset.refYield || 0),
    refFecha: row.dataset.refFecha || '',
    refTipo: row.dataset.refTipo || 'sin_referencia',
  };
}

function leerContadoresDraftActual() {
  const fecha = document.getElementById('fecha')?.value;
  if (!fecha) return null;
  const rows = [...document.querySelectorAll('#contadores-body tr[data-item-id]')]
    .filter(row => row.dataset.draftDirty === '1')
    .map(row => {
    const itemId = row.dataset.itemId;
    return {
      item_id: itemId,
      entradas: row.querySelector(`[data-role="entradas"]`)?.value || '',
      salidas: row.querySelector(`[data-role="salidas"]`)?.value || '',
      jackpot: row.querySelector(`[data-role="jackpot"]`)?.value || '',
      critica_autorizada: row.dataset.criticaAutorizada === '1',
      ref_entradas: row.querySelector(`[data-role="critica-entradas"]`)?.value || '',
      ref_salidas: row.querySelector(`[data-role="critica-salidas"]`)?.value || '',
      ref_jackpot: row.querySelector(`[data-role="critica-jackpot"]`)?.value || '',
      produccion_pre_reset: row.querySelector(`[data-role="critica-pre-reset"]`)?.value || '',
    };
  });
  return rows.length ? { items: rows } : null;
}

function guardarDraftContadores(fechaOverride = null) {
  const fecha = fechaOverride || document.getElementById('fecha')?.value;
  if (!fecha || contadoresLocked) return;
  const draft = leerContadoresDraftActual();
  if (draft?.items?.length) {
    contadoresDrafts[fecha] = draft;
  } else {
    delete contadoresDrafts[fecha];
  }
  try { sessionStorage.setItem('contadoresDrafts', JSON.stringify(contadoresDrafts)); } catch {}
}

function eliminarDraftContadores(fecha) {
  if (!fecha) return;
  delete contadoresDrafts[fecha];
  try { sessionStorage.setItem('contadoresDrafts', JSON.stringify(contadoresDrafts)); } catch {}
}

function applyContadoresDraft(fecha) {
  const draft = contadoresDrafts[fecha];
  if (!draft?.items?.length) return false;
  draft.items.forEach(item => {
    const row = document.querySelector(`#contadores-body tr[data-item-id="${item.item_id}"]`);
    if (!row) return;
    ['entradas', 'salidas', 'jackpot'].forEach(role => {
      const input = row.querySelector(`[data-role="${role}"]`);
      if (input && !input.readOnly) input.value = item[role] || '';
    });
    row.dataset.criticaAutorizada = item.critica_autorizada ? '1' : '0';
    actualizarSummaryCritica(row);
    const mapaCritica = {
      'critica-entradas': item.ref_entradas,
      'critica-salidas': item.ref_salidas,
      'critica-jackpot': item.ref_jackpot,
      'critica-pre-reset': item.produccion_pre_reset,
    };
    Object.entries(mapaCritica).forEach(([role, value]) => {
      const input = row.querySelector(`[data-role="${role}"]`);
      if (input) input.value = value || '';
    });
    marcarFilaContadorDirty(row);
  });
  recalcularContadores();
  return true;
}

function crearInputContador(role, value = '', refPlaceholder = null, readonly = false) {
  const limpio = limpiarNumeroTexto(value);
  const usaReferenciaVisual = (role === 'entradas' || role === 'salidas');
  const placeholder = usaReferenciaVisual && refPlaceholder != null && Number(refPlaceholder) > 0
    ? limpiarNumeroTexto(refPlaceholder)
    : '0';
  if (readonly) {
    const valorRo = limpio !== '' ? limpio : '0';
    return `<input type="text" inputmode="numeric" class="contador-campo input-pausa-readonly" data-role="${role}" value="${valorRo}" placeholder="${placeholder}" readonly tabindex="-1" />`;
  }
  if (limpio === '') {
    return `<input type="text" inputmode="numeric" class="contador-campo" data-role="${role}" value="" placeholder="${placeholder}" />`;
  }
  const numero = Number(limpio);
  // Entradas y salidas deben arrancar visualmente vacias cuando su valor es 0.
  // Jackpot, en cambio, puede venir heredado del ultimo registro y debe mostrarse
  // siempre que traiga un valor real distinto de 0.
  const valor = numero === 0 ? '' : limpio;
  return `<input type="text" inputmode="numeric" class="contador-campo" data-role="${role}" value="${valor}" placeholder="${placeholder}" />`;
}

function valorTextoContador(row, role) {
  return row.querySelector(`[data-role="${role}"]`)?.value?.trim() || '';
}

function filaContadorTieneCaptura(row) {
  return ['entradas', 'salidas', 'jackpot'].some(role => valorTextoContador(row, role) !== '');
}

function filaContadorCompleta(row) {
  return ['entradas', 'salidas'].every(role => valorTextoContador(row, role) !== '');
}

function camposPrincipalesContadores() {
  const selector = [
    '#contadores-body tr[data-item-id] [data-role="entradas"]',
    '#contadores-body tr[data-item-id] [data-role="salidas"]',
    '#contadores-body tr[data-item-id] [data-role="jackpot"]',
  ].join(', ');
  return [...document.querySelectorAll(selector)];
}

function moverSiguienteCampoContador(inputActual) {
  const campos = camposPrincipalesContadores().filter(input => !input.readOnly);
  const idx = campos.indexOf(inputActual);
  if (idx !== -1 && idx < campos.length - 1) {
    campos[idx + 1].focus();
    campos[idx + 1].select();
  }
}


function renderContadores(items = [], total = 0) {
  const tbody = document.getElementById('contadores-body');
  const empty = document.getElementById('contadores-empty');
  tbody.innerHTML = '';

  if (!items.length) {
    empty.classList.remove('oculto');
    limpiarFormularioContadores();
    return;
  }

  empty.classList.add('oculto');
  items.forEach(fila => {
    const tr = document.createElement('tr');
    tr.dataset.itemId = fila.item_id;
    tr.dataset.nombre = fila.nombre;
    tr.dataset.denominacion = String(fila.denominacion || 0);
    tr.dataset.guardado = fila.fecha_hora_registro ? '1' : '0';
    tr.dataset.refEntradas = String(fila.referencia?.entradas || 0);
    tr.dataset.refSalidas = String(fila.referencia?.salidas || 0);
    tr.dataset.refJackpot = String(fila.referencia?.jackpot || 0);
    tr.dataset.refYield = String(fila.referencia?.yield || 0);
    tr.dataset.refFecha = fila.referencia?.fecha || '';
    tr.dataset.refTipo = fila.referencia?.tipo || 'sin_referencia';
    tr.dataset.criticaAutorizada = fila.usar_referencia_critica ? '1' : '0';
    tr.dataset.pausado = fila.pausado ? '1' : '0';
    tr.dataset.draftDirty = '0';
    tr.className = fila.pausado ? 'contador-pausado' : '';

    const refFechaTitle = fila.referencia?.fecha || 'Base 0';
    const tieneRef = fila.referencia?.tipo !== 'sin_referencia';
    const entradasReadonly = fila.pausado && tieneRef;
    const pausaTitle = fila.pausado ? 'Reactivar máquina' : 'Pausar máquina';
    const pausaLabel = fila.pausado ? '▶' : '⏸';
    const pausaAviso = fila.pausado ? '¿Reactivar esta máquina?' : '¿Pausar esta máquina?';
    const sinRefAviso = fila.pausado && !tieneRef
      ? '<span class="pausa-sin-ref-aviso" title="Sin referencia para congelar">·</span>'
      : '';
    tr.innerHTML = `
      <td>
        <div class="contador-fila-nombre">
          <span class="contador-item-nombre"><span class="contador-item-id-inline">${fila.item_id}</span> ${fila.nombre}${sinRefAviso}</span>
          <details class="contador-critica-detalle oculto" ${fila.usar_referencia_critica ? 'open' : ''}>
            <summary class="critica-summary ${fila.usar_referencia_critica ? 'autorizado' : ''}" title="${fila.usar_referencia_critica ? 'Autorizado' : 'Ref. crítica'}">${fila.usar_referencia_critica ? '✓' : '⚠'}</summary>
            <div class="contador-critica">
              <div class="contador-critica-grid">
                <input type="text" inputmode="numeric" data-role="critica-entradas" placeholder="E" value="${limpiarNumeroTexto((fila.ref_entradas_guardada ?? fila.referencia?.entradas) || 0)}" />
                <input type="text" inputmode="numeric" data-role="critica-salidas" placeholder="S" value="${limpiarNumeroTexto((fila.ref_salidas_guardada ?? fila.referencia?.salidas) || 0)}" />
                <input type="text" inputmode="numeric" data-role="critica-jackpot" placeholder="J" value="${limpiarNumeroTexto((fila.ref_jackpot_guardada ?? fila.referencia?.jackpot) || 0)}" />
              </div>
              <div class="contador-critica-pre-reset">
                <label class="critica-pre-reset-label">Pre-reset</label>
                <input type="text" inputmode="numeric" data-role="critica-pre-reset" placeholder="0" value="${limpiarNumeroTexto(fila.produccion_pre_reset_guardada || 0)}" />
              </div>
              <div class="contador-critica-confirm">
                <span class="critica-aviso">Los valores ingresados se usarán como referencia de corrección.</span>
                <button type="button" class="btn-confirmar-critica">OK</button>
              </div>
            </div>
          </details>
          <details class="contador-pausa-detalle">
            <summary title="${pausaTitle}">${pausaLabel}</summary>
            <div class="contador-pausa-accion">
              <span class="pausa-aviso">${pausaAviso}</span>
              <button type="button" class="btn-toggle-pausa" data-pausado="${fila.pausado ? '1' : '0'}" tabindex="-1">OK</button>
            </div>
          </details>
        </div>
      </td>
      <td>${fmt(fila.denominacion || 0)}</td>
      <td>${crearInputContador('entradas', fila.entradas, fila.referencia?.entradas, entradasReadonly)}</td>
      <td>${crearInputContador('salidas', fila.salidas, fila.referencia?.salidas, entradasReadonly)}</td>
      <td>${crearInputContador('jackpot', fila.jackpot)}</td>
      <td class="contador-yield" data-role="yield-actual">${limpiarNumeroTexto(fila.yield_actual || 0, true)}</td>
      <td data-role="yield-ref">${limpiarNumeroTexto(fila.referencia?.yield || 0, true)}<span class="yield-ref-fecha" title="${refFechaTitle}">·</span></td>
      <td class="contador-resultado ${fila.resultado_monetario < 0 ? 'negativo' : ''}" data-role="resultado">${fmt(fila.resultado_monetario || 0)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('contadores-total').textContent = fmt(total);
  bindContadoresInputs();
  recalcularContadores();
  setTimeout(recalcularContadores, 0);
}

function valorContadorRow(row, role) {
  const input = row.querySelector(`[data-role="${role}"]`);
  const valor = input ? parseNumeroTexto(input.value) : 0;
  return isNaN(valor) || valor < 0 ? 0 : valor;
}

function recalcularFilaContador(row) {
  const fila = filaDesdeDataset(row);
  const guardado = row.dataset.guardado === '1';
  const tieneCaptura = guardado || filaContadorTieneCaptura(row);
  const completa = guardado || filaContadorCompleta(row);
  const entradas = valorContadorRow(row, 'entradas');
  const salidas = valorContadorRow(row, 'salidas');
  const jackpot = valorContadorRow(row, 'jackpot');
  const usaCritica = row.dataset.criticaAutorizada === '1';
  const detalleCritica = row.querySelector('.contador-critica-detalle');

  const alerta = completa && (
    entradas < fila.refEntradas
    || salidas < fila.refSalidas
    || jackpot < fila.refJackpot
  );
  row.classList.remove('contador-alerta');
  if (detalleCritica) {
    // Mostrar cuando: hay alerta, está autorizado, o el panel ya está abierto (el usuario lo expandió para editar).
    detalleCritica.classList.toggle('oculto', !(alerta || usaCritica || detalleCritica.open));
    // Si ya está guardado, mantener colapsado (solo summary visible), no expandido automáticamente.
    if (row.dataset.guardado === '1') detalleCritica.open = false;
  }

  if (!tieneCaptura && !usaCritica) {
    row.querySelector('[data-role="yield-actual"]').textContent = '';
    row.querySelector('[data-role="yield-ref"]').innerHTML = `${limpiarNumeroTexto(fila.refYield, true)}<span class="yield-ref-fecha" title="${fila.refFecha || 'Base 0'}">·</span>`;
    row.querySelector('[data-role="resultado"]').textContent = '';
    row.querySelector('[data-role="resultado"]').classList.remove('negativo');
    return;
  }

  if (!completa && !usaCritica) {
    row.querySelector('[data-role="yield-actual"]').textContent = '';
    row.querySelector('[data-role="yield-ref"]').innerHTML = `${limpiarNumeroTexto(fila.refYield, true)}<span class="yield-ref-fecha" title="${fila.refFecha || 'Base 0'}">·</span>`;
    row.querySelector('[data-role="resultado"]').textContent = '';
    row.querySelector('[data-role="resultado"]').classList.remove('negativo');
    return;
  }

  const refYield = usaCritica
    ? (
      valorContadorRow(row, 'critica-entradas')
      - valorContadorRow(row, 'critica-salidas')
      - valorContadorRow(row, 'critica-jackpot')
    )
    : fila.refYield;

  const yieldActual = entradas - salidas - jackpot;
  const preReset = usaCritica ? (valorContadorRow(row, 'critica-pre-reset') || 0) : 0;
  const resultado = (yieldActual - refYield) * fila.denominacion + preReset;
  row.querySelector('[data-role="yield-actual"]').textContent = limpiarNumeroTexto(yieldActual, true);
  row.querySelector('[data-role="yield-ref"]').innerHTML = `${limpiarNumeroTexto(refYield, true)}<span class="yield-ref-fecha" title="${usaCritica ? 'Autorizado' : (fila.refFecha || 'Base 0')}">·</span>`;
  const resultadoEl = row.querySelector('[data-role="resultado"]');
  resultadoEl.textContent = fmt(resultado);
  resultadoEl.classList.toggle('negativo', resultado < 0);
}

function recalcularContadores() {
  let total = 0;
  document.querySelectorAll('#contadores-body tr[data-item-id]').forEach(row => {
    recalcularFilaContador(row);
    if (!(row.dataset.guardado === '1' || filaContadorTieneCaptura(row))) return;
    const texto = row.querySelector('[data-role="resultado"]')?.textContent || '';
    const numero = Number(texto.replace(/[^\d-]/g, ''));
    total += isNaN(numero) ? 0 : numero;
  });
  document.getElementById('contadores-total').textContent = fmt(total);
}

function bindContadoresInputs() {
  getContadoresInputs().forEach(input => {
    if (input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    if (input.tagName === 'INPUT' && input.type === 'text') {
      formatearInputNumerico(input, false, false);
      const refrescar = () => {
        formatearInputNumerico(input, false, false);
        marcarFilaContadorDirty(input.closest('tr[data-item-id]'));
        recalcularContadores();
        guardarDraftContadores();
      };
      input.addEventListener('input', refrescar);
      input.addEventListener('change', refrescar);
      input.addEventListener('focus', () => limpiarFormatoInputNumerico(input));
      input.addEventListener('blur', () => {
        formatearInputNumerico(input, false, false);
        recalcularContadores();
        guardarDraftContadores();
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          moverSiguienteCampoContador(input);
        }
      });
    } else {
      input.addEventListener('input', () => {
        recalcularContadores();
        guardarDraftContadores();
      });
    }
  });

}

function manejarEventoContadores(target) {
  if (!target) return;
  if (target.matches('.contador-campo')) {
    formatearInputNumerico(target, false, false);
  }
  // Al editar cualquier campo de referencia crítica, se pierde la autorización y hay que reconfirmar
  if (target.matches('[data-role="critica-entradas"],[data-role="critica-salidas"],[data-role="critica-jackpot"],[data-role="critica-pre-reset"]')) {
    const row = target.closest('tr');
    marcarFilaContadorDirty(row);
    if (row && row.dataset.criticaAutorizada === '1') {
      row.dataset.criticaAutorizada = '0';
      actualizarSummaryCritica(row);
    }
  }
  recalcularContadores();
  guardarDraftContadores();
}

function actualizarSummaryCritica(row) {
  const summary = row.querySelector('.contador-critica-detalle summary');
  if (!summary) return;
  const autorizado = row.dataset.criticaAutorizada === '1';
  summary.textContent = autorizado ? '✓' : '⚠';
  summary.title = autorizado ? 'Autorizado' : 'Ref. crítica';
  summary.className = `critica-summary${autorizado ? ' autorizado' : ''}`;
}

function confirmarReferenciaCritica(row) {
  const defaults = {
    'critica-entradas': row.dataset.refEntradas || '0',
    'critica-salidas': row.dataset.refSalidas || '0',
    'critica-jackpot': row.dataset.refJackpot || '0',
  };
  Object.entries(defaults).forEach(([role, value]) => {
    const input = row.querySelector(`[data-role="${role}"]`);
    if (input && !input.value.trim()) input.value = limpiarNumeroTexto(value);
  });
  row.dataset.criticaAutorizada = '1';
  marcarFilaContadorDirty(row);
  const detalle = row.querySelector('.contador-critica-detalle');
  if (detalle) detalle.open = false;
  actualizarSummaryCritica(row);
  recalcularContadores();
  guardarDraftContadores();
}

async function togglePausaContador(btn) {
  const row = btn.closest('tr');
  if (!row) return;
  const pausado = btn.dataset.pausado === '1';
  const itemId = row.dataset.itemId;
  const fecha = document.getElementById('fecha')?.value;

  // No permitir pausar si no hay referencia vigente (no hay base para congelar)
  if (!pausado && row.dataset.refTipo === 'sin_referencia') {
    mostrarMensaje(`${row.dataset.nombre}: no hay referencia vigente para congelar esta máquina.`, 'error');
    return;
  }

  try {
    const res = await fetch(`/api/modulos/contadores/catalogo/${encodeURIComponent(itemId)}/pausar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pausado: !pausado, fecha }),
    });
    const data = await res.json();
    if (!data.ok) { mostrarMensaje(data.mensaje || 'Error al cambiar estado.', 'error'); return; }
    // Limpiar draft de la fecha antes de recargar para evitar reinyectar foto vieja
    eliminarDraftContadores(fecha);
    await cargarDatosContadores(fecha);
    mostrarMensaje(`${row.dataset.nombre}: ${!pausado ? 'máquina pausada' : 'máquina reactivada'}.`, 'ok');
  } catch {
    mostrarMensaje('Error de conexión al cambiar estado de pausa.', 'error');
  }
}

function limpiarFormularioBonos() {
  const cliente = document.getElementById('bono-cliente');
  const valor = document.getElementById('bono-valor');
  if (cliente) cliente.value = '';
  if (valor) valor.value = '';
  actualizarAcumuladoBonoCliente();
}

function limpiarFormularioPrestamos() {
  const persona = document.getElementById('prestamo-persona');
  const valor = document.getElementById('prestamo-valor');
  if (persona) persona.value = '';
  if (valor) valor.value = '';
  actualizarResumenPersonaPrestamo();
}

function limpiarFormularioGastos() {
  const concepto = document.getElementById('gasto-concepto');
  const valor = document.getElementById('gasto-valor');
  if (concepto) concepto.value = '';
  if (valor) valor.value = '';
}

function limpiarFormularioMovimientos() {
  const concepto = document.getElementById('movimiento-concepto');
  const valor = document.getElementById('movimiento-valor');
  if (concepto) concepto.value = '';
  if (valor) valor.value = '';
}

function obtenerAcumuladoClienteBonos(cliente) {
  const nombre = String(cliente || '').trim().toLocaleLowerCase('es-CO');
  if (!nombre) return 0;
  return bonusDayItems.reduce((acc, item) => {
    const actual = String(item.cliente || '').trim().toLocaleLowerCase('es-CO');
    return acc + (actual === nombre ? Number(item.valor || 0) : 0);
  }, 0);
}

function actualizarAcumuladoBonoCliente() {
  const hint = document.getElementById('bono-acumulado-hint');
  const cliente = document.getElementById('bono-cliente')?.value.trim() || '';
  if (!hint) return;
  if (!cliente) {
    hint.textContent = 'Sin bonos previos para este cliente en la fecha actual.';
    return;
  }
  const acumulado = obtenerAcumuladoClienteBonos(cliente);
  hint.textContent = acumulado > 0
    ? `Este cliente ya acumula ${fmt(acumulado)} en bonos durante esta fecha.`
    : 'Sin bonos previos para este cliente en la fecha actual.';
}

function autocompletarClienteBono() {
  const input = document.getElementById('bono-cliente');
  const texto = input?.value.trim() || '';
  if (!texto) return false;

  const exacta = bonusNames.find(nombre => nombre.toLocaleLowerCase('es-CO') === texto.toLocaleLowerCase('es-CO'));
  if (exacta) {
    input.value = exacta;
    actualizarAcumuladoBonoCliente();
    return true;
  }

  const coincidencia = bonusNames.find(nombre => nombre.toLocaleLowerCase('es-CO').startsWith(texto.toLocaleLowerCase('es-CO')));
  if (!coincidencia) return false;

  input.value = coincidencia;
  actualizarAcumuladoBonoCliente();
  return true;
}

function autocompletarPersonaPrestamo() {
  const input = document.getElementById('prestamo-persona');
  const texto = input?.value.trim() || '';
  if (!texto) return false;

  const exacta = loanNames.find(nombre => nombre.toLocaleLowerCase('es-CO') === texto.toLocaleLowerCase('es-CO'));
  if (exacta) {
    input.value = exacta;
    return true;
  }

  const coincidencia = loanNames.find(nombre => nombre.toLocaleLowerCase('es-CO').startsWith(texto.toLocaleLowerCase('es-CO')));
  if (!coincidencia) return false;

  input.value = coincidencia;
  return true;
}

function obtenerTipoPrestamoSeleccionado() {
  return document.querySelector('input[name="prestamo-tipo"]:checked')?.value || 'prestamo';
}

function obtenerResumenPersonaPrestamo(persona) {
  const nombre = String(persona || '').trim().toLocaleLowerCase('es-CO');
  if (!nombre) {
    return { totalPrestado: 0, totalPagado: 0, saldoPendiente: 0 };
  }
  const resumenDia = loanItems.reduce((acc, item) => {
    const actual = String(item.persona || '').trim().toLocaleLowerCase('es-CO');
    if (actual !== nombre) return acc;
    const valor = Number(item.valor || 0);
    if (item.tipo_movimiento === 'pago') acc.totalPagado += valor;
    else acc.totalPrestado += valor;
    return acc;
  }, { totalPrestado: 0, totalPagado: 0, saldoPendiente: 0 });
  resumenDia.saldoPendiente = Number(loanSaldos[nombre] || 0);
  return resumenDia;
}

function actualizarResumenPersonaPrestamo() {
  const hint = document.getElementById('prestamo-resumen-hint');
  const persona = document.getElementById('prestamo-persona')?.value.trim() || '';
  if (!hint) return;
  if (!persona) {
    hint.textContent = 'Sin movimientos previos para esta persona.';
    return;
  }
  const resumen = obtenerResumenPersonaPrestamo(persona);
  if (!resumen.totalPrestado && !resumen.totalPagado && !resumen.saldoPendiente) {
    hint.textContent = 'Sin deuda registrada para esta persona.';
    return;
  }
  hint.textContent = `Prestado: ${fmt(resumen.totalPrestado)} | Pagado: ${fmt(resumen.totalPagado)} | Saldo: ${fmt(resumen.saldoPendiente)}`;
}

function autocompletarConceptoGasto() {
  const input = document.getElementById('gasto-concepto');
  const texto = input?.value.trim() || '';
  if (!texto) return false;

  const exacta = expenseConcepts.find(concepto => concepto.toLocaleLowerCase('es-CO') === texto.toLocaleLowerCase('es-CO'));
  if (exacta) {
    input.value = exacta;
    return true;
  }

  const coincidencia = expenseConcepts.find(concepto => concepto.toLocaleLowerCase('es-CO').startsWith(texto.toLocaleLowerCase('es-CO')));
  if (!coincidencia) return false;

  input.value = coincidencia;
  return true;
}

function autocompletarConceptoMovimiento() {
  const input = document.getElementById('movimiento-concepto');
  const texto = input?.value.trim() || '';
  if (!texto) return false;

  const exacta = movementConcepts.find(concepto => concepto.toLocaleLowerCase('es-CO') === texto.toLocaleLowerCase('es-CO'));
  if (exacta) {
    input.value = exacta;
    return true;
  }

  const coincidencia = movementConcepts.find(concepto => concepto.toLocaleLowerCase('es-CO').startsWith(texto.toLocaleLowerCase('es-CO')));
  if (!coincidencia) return false;

  input.value = coincidencia;
  return true;
}

function obtenerTipoMovimientoSeleccionado() {
  return document.querySelector('input[name="movimiento-tipo"]:checked')?.value || 'salida';
}

function renderBonosRegistros(items = [], total = 0) {
  const tbody = document.getElementById('bonos-registros-body');
  bonusDayItems = Array.isArray(items) ? [...items] : [];
  tbody.innerHTML = '';
  if (!bonusDayItems.length) {
    tbody.innerHTML = `<tr><td colspan="${esSuperAdminActivo() ? 5 : 4}" class="bonos-vacio">Sin registros para esta fecha.</td></tr>`;
  } else {
    const acumuladosPorCliente = new Map();
    const itemsAsc = [...bonusDayItems];
    itemsAsc.forEach(item => {
      const cliente = (item.cliente || '').trim();
      const valor = Number(item.valor || 0);
      const acumuladoCliente = (acumuladosPorCliente.get(cliente) || 0) + valor;
      item.acumulado_cliente = acumuladoCliente;
      acumuladosPorCliente.set(cliente, acumuladoCliente);
    });

    [...itemsAsc].reverse().forEach(item => {
      const cliente = (item.cliente || '').trim();
      const valor = Number(item.valor || 0);
      const ts = item.fecha_hora_registro || '';
      const tr = document.createElement('tr');
      if (ts) tr.dataset.ts = ts;
      tr.innerHTML = `
        <td>${item.hora_display || ''}</td>
        <td>${cliente}</td>
        <td>${fmt(valor)}</td>
        <td>${fmt(item.acumulado_cliente || 0)}</td>
        ${esSuperAdminActivo() ? `
          <td class="td-acciones">
            <button type="button" class="btn-tabla-accion btn-tabla-editar" data-modulo="bonos" data-ts="${ts}">✎</button>
            <button type="button" class="btn-tabla-accion btn-tabla-eliminar" data-modulo="bonos" data-ts="${ts}">✕</button>
          </td>
        ` : ''}
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-bonos').textContent = fmt(total);
  actualizarAcumuladoBonoCliente();
  const detBonos = document.getElementById('bonos-detalle-dia');
  if (detBonos) detBonos.open = bonusDayItems.length > 0;
}

function renderPrestamosRegistros(items = [], resumen = {}) {
  const tbody = document.getElementById('prestamos-registros-body');
  loanItems = Array.isArray(items) ? [...items] : [];
  loanSaldos = resumen?.saldos_por_persona && typeof resumen.saldos_por_persona === 'object'
    ? { ...resumen.saldos_por_persona }
    : {};
  tbody.innerHTML = '';
  if (!loanItems.length) {
    tbody.innerHTML = `<tr><td colspan="${esSuperAdminActivo() ? 6 : 5}" class="bonos-vacio">Sin movimientos de préstamos para esta fecha.</td></tr>`;
  } else {
    [...loanItems].reverse().forEach(item => {
      const ts = item.fecha_hora_registro || '';
      const tr = document.createElement('tr');
      if (ts) tr.dataset.ts = ts;
      tr.innerHTML = `
        <td>${item.hora_display || ''}</td>
        <td>${item.persona || ''}</td>
        <td>${item.tipo_movimiento === 'pago' ? 'Pago' : 'Préstamo'}</td>
        <td>${fmt(item.valor || 0)}</td>
        <td>${fmt(item.saldo_pendiente || 0)}</td>
        ${esSuperAdminActivo() ? `
          <td class="td-acciones">
            <button type="button" class="btn-tabla-accion btn-tabla-editar" data-modulo="prestamos" data-ts="${ts}">✎</button>
            <button type="button" class="btn-tabla-accion btn-tabla-eliminar" data-modulo="prestamos" data-ts="${ts}">✕</button>
          </td>
        ` : ''}
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-prestado').textContent = fmt(resumen.total_prestado || 0);
  document.getElementById('total-pagado').textContent = fmt(resumen.total_pagado || 0);
  document.getElementById('saldo-prestamos').textContent = fmt(resumen.deuda_total_activa || 0);
  actualizarResumenPersonaPrestamo();
  const detPrestamos = document.getElementById('prestamos-detalle-dia');
  if (detPrestamos) detPrestamos.open = loanItems.length > 0;
}

function renderMovimientosRegistros(items = [], resumen = {}) {
  const tbody = document.getElementById('movimientos-registros-body');
  movementItems = Array.isArray(items) ? [...items] : [];
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!movementItems.length) {
    tbody.innerHTML = `<tr><td colspan="${esSuperAdminActivo() ? 5 : 4}" class="bonos-vacio">Sin registros para esta fecha.</td></tr>`;
  } else {
    [...movementItems].reverse().forEach(item => {
      const ts = item.fecha_hora_registro || '';
      const tr = document.createElement('tr');
      if (ts) tr.dataset.ts = ts;
      tr.innerHTML = `
        <td>${item.hora_display || ''}</td>
        <td>${item.tipo_movimiento === 'ingreso' ? 'Ingreso' : 'Salida'}</td>
        <td>${item.concepto || ''}</td>
        <td>${fmt(item.valor || 0)}</td>
        ${esSuperAdminActivo() ? `
          <td class="td-acciones">
            <button type="button" class="btn-tabla-accion btn-tabla-editar" data-modulo="movimientos" data-ts="${ts}">✎</button>
            <button type="button" class="btn-tabla-accion btn-tabla-eliminar" data-modulo="movimientos" data-ts="${ts}">✕</button>
          </td>
        ` : ''}
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-movimientos-ingresos').textContent = fmt(resumen.total_ingresos || 0);
  document.getElementById('total-movimientos-salidas').textContent = fmt(resumen.total_salidas || 0);
  document.getElementById('total-movimientos-neto').textContent = fmt(resumen.neto || 0);
  const detMovimientos = document.getElementById('movimientos-detalle-dia');
  if (detMovimientos) detMovimientos.open = movementItems.length > 0;
}

async function cargarBonosDelDia(fecha) {
  try {
    const res = await fetch(`/api/modulos/bonos/fecha/${fecha}/datos?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      renderBonosRegistros([], 0);
      return;
    }
    const data = await res.json();
    renderBonosRegistros(data.items || [], data.total || 0);
  } catch {
    renderBonosRegistros([], 0);
  }
}

async function cargarGastosDelDia(fecha) {
  try {
    const res = await fetch(`/api/modulos/gastos/fecha/${fecha}/registros?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      renderGastosRegistros([], 0);
      return;
    }
    const data = await res.json();
    renderGastosRegistros(data.items || [], data.total || 0);
  } catch {
    renderGastosRegistros([], 0);
  }
}

async function cargarPrestamosDelDia(fecha) {
  try {
    const res = await fetch(`/api/modulos/prestamos/fecha/${fecha}/datos?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      renderPrestamosRegistros([], {});
      return;
    }
    const data = await res.json();
    renderPrestamosRegistros(data.items || [], data);
  } catch {
    renderPrestamosRegistros([], {});
  }
}

function obtenerRegistroPorTs(modulo, ts) {
  const itemsByModulo = {
    bonos: bonusDayItems,
    gastos: gastosItems,
    prestamos: loanItems,
    movimientos: movementItems,
  };
  return (itemsByModulo[modulo] || []).find(item => (item.fecha_hora_registro || '') === ts) || null;
}

async function recargarModuloPorFecha(modulo, fecha) {
  if (modulo === 'bonos') return cargarBonosDelDia(fecha);
  if (modulo === 'gastos') return cargarGastosDelDia(fecha);
  if (modulo === 'prestamos') return cargarPrestamosDelDia(fecha);
  if (modulo === 'movimientos') return cargarMovimientosDelDia(fecha);
}

async function editarRegistroPorTs(modulo, ts) {
  const fecha = document.getElementById('fecha')?.value;
  const item = obtenerRegistroPorTs(modulo, ts);
  if (!fecha || !item) {
    mostrarMensaje('No se encontró el registro a editar.', 'advertencia');
    return;
  }

  let endpoint = '';
  let payload = { fecha, ts };
  let resumen = '';

  if (modulo === 'bonos') {
    const cliente = window.prompt('Cliente', item.cliente || '');
    if (cliente === null) return;
    const valorTexto = window.prompt('Valor del bono', String(Number(item.valor || 0)));
    if (valorTexto === null) return;
    const valor = Number(String(valorTexto).replace(/[^\d]/g, ''));
    if (!cliente.trim() || !Number.isFinite(valor) || valor <= 0) {
      mostrarMensaje('Debes ingresar un cliente y un valor válido.', 'advertencia');
      return;
    }
    endpoint = '/api/modulos/bonos/registro/editar';
    payload = { ...payload, cliente: cliente.trim(), valor };
    resumen = `Cliente: ${cliente.trim()}\nValor: ${fmt(valor)}`;
  } else if (modulo === 'gastos') {
    const concepto = window.prompt('Concepto', item.concepto || '');
    if (concepto === null) return;
    const valorTexto = window.prompt('Valor del gasto', String(Number(item.valor || 0)));
    if (valorTexto === null) return;
    const valor = Number(String(valorTexto).replace(/[^\d]/g, ''));
    if (!concepto.trim() || !Number.isFinite(valor) || valor <= 0) {
      mostrarMensaje('Debes ingresar un concepto y un valor válido.', 'advertencia');
      return;
    }
    endpoint = '/api/modulos/gastos/registro/editar';
    payload = { ...payload, concepto: concepto.trim(), valor };
    resumen = `Concepto: ${concepto.trim()}\nValor: ${fmt(valor)}`;
  } else if (modulo === 'prestamos') {
    const persona = window.prompt('Persona', item.persona || '');
    if (persona === null) return;
    const tipoActual = item.tipo_movimiento === 'pago' ? 'pago' : 'prestamo';
    const tipoPrompt = window.prompt('Tipo (prestamo o pago)', tipoActual);
    if (tipoPrompt === null) return;
    const tipo_movimiento = String(tipoPrompt).trim().toLowerCase();
    const valorTexto = window.prompt('Valor', String(Number(item.valor || 0)));
    if (valorTexto === null) return;
    const valor = Number(String(valorTexto).replace(/[^\d]/g, ''));
    if (!persona.trim() || !['prestamo', 'pago'].includes(tipo_movimiento) || !Number.isFinite(valor) || valor <= 0) {
      mostrarMensaje('Debes ingresar persona, tipo y valor válidos.', 'advertencia');
      return;
    }
    endpoint = '/api/modulos/prestamos/registro/editar';
    payload = { ...payload, persona: persona.trim(), tipo_movimiento, valor };
    resumen = `Persona: ${persona.trim()}\nTipo: ${tipo_movimiento}\nValor: ${fmt(valor)}`;
  } else if (modulo === 'movimientos') {
    const tipoActual = item.tipo_movimiento === 'ingreso' ? 'ingreso' : 'salida';
    const tipoPrompt = window.prompt('Tipo (ingreso o salida)', tipoActual);
    if (tipoPrompt === null) return;
    const tipo_movimiento = String(tipoPrompt).trim().toLowerCase();
    const concepto = window.prompt('Concepto', item.concepto || '');
    if (concepto === null) return;
    const valorTexto = window.prompt('Valor', String(Number(item.valor || 0)));
    if (valorTexto === null) return;
    const observacion = window.prompt('Observación', item.observacion || '');
    if (observacion === null) return;
    const valor = Number(String(valorTexto).replace(/[^\d]/g, ''));
    if (!concepto.trim() || !['ingreso', 'salida'].includes(tipo_movimiento) || !Number.isFinite(valor) || valor <= 0) {
      mostrarMensaje('Debes ingresar tipo, concepto y valor válidos.', 'advertencia');
      return;
    }
    endpoint = '/api/modulos/movimientos/registro/editar';
    payload = { ...payload, tipo_movimiento, concepto: concepto.trim(), valor, observacion: observacion.trim() };
    resumen = `Tipo: ${tipo_movimiento}\nConcepto: ${concepto.trim()}\nValor: ${fmt(valor)}`;
  } else {
    return;
  }

  const confirmar = window.confirm(`Vas a editar un registro de ${modulo} en ${formatFechaVisual(fecha)}.\n\n${resumen}\n\n¿Deseas continuar?`);
  if (!confirmar) return;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      mostrarMensaje(data.mensaje || 'No se pudo editar el registro.', 'advertencia');
      return;
    }
    await recargarModuloPorFecha(modulo, fecha);
    mostrarMensaje(data.mensaje || 'Registro actualizado correctamente.', 'ok');
  } catch {
    mostrarMensaje('Error de conexión al editar el registro.', 'error');
  }
}

async function eliminarRegistroPorTs(modulo, ts) {
  const fecha = document.getElementById('fecha')?.value;
  const item = obtenerRegistroPorTs(modulo, ts);
  if (!fecha || !item) {
    mostrarMensaje('No se encontró el registro a eliminar.', 'advertencia');
    return;
  }
  const confirmar = window.confirm(`Vas a eliminar un registro de ${modulo} en ${formatFechaVisual(fecha)}.\n\nEsta acción no se puede deshacer.\n\n¿Deseas continuar?`);
  if (!confirmar) return;
  try {
    const res = await fetch(`/api/modulos/${modulo}/registro/eliminar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, ts }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      mostrarMensaje(data.mensaje || 'No se pudo eliminar el registro.', 'advertencia');
      return;
    }
    await recargarModuloPorFecha(modulo, fecha);
    mostrarMensaje(data.mensaje || 'Registro eliminado correctamente.', 'ok');
  } catch {
    mostrarMensaje('Error de conexión al eliminar el registro.', 'error');
  }
}

async function cargarMovimientosDelDia(fecha) {
  try {
    const res = await fetch(`/api/modulos/movimientos/fecha/${fecha}/datos?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      renderMovimientosRegistros([], {});
      return;
    }
    const data = await res.json();
    renderMovimientosRegistros(data.items || [], data);
  } catch {
    renderMovimientosRegistros([], {});
  }
}

function validarBono() {
  const cliente = document.getElementById('bono-cliente').value.trim();
  const valorRaw = document.getElementById('bono-valor').value;
  const valor = valorRaw === '' ? 0 : Number(valorRaw);
  if (!cliente) return 'Debes ingresar el nombre del cliente.';
  if (esTextoSoloNumeros(cliente)) return 'El nombre del cliente no puede ser solo números.';
  if (isNaN(valor) || valor <= 0) return 'Debes ingresar un valor de bono mayor que cero.';
  return null;
}

function validarPrestamo() {
  const persona = document.getElementById('prestamo-persona').value.trim();
  const valor = parseNumeroInput('prestamo-valor');
  if (!persona) return 'Debes ingresar el nombre de la persona.';
  if (esTextoSoloNumeros(persona)) return 'El nombre de la persona no puede ser solo números.';
  if (isNaN(valor) || valor <= 0) return 'Debes ingresar un valor de préstamo mayor que cero.';
  if (obtenerTipoPrestamoSeleccionado() === 'pago') {
    const resumen = obtenerResumenPersonaPrestamo(persona);
    if (resumen.saldoPendiente <= 0) return 'Esa persona no tiene saldo pendiente para registrar un pago.';
    if (valor > resumen.saldoPendiente) return `El pago supera el saldo pendiente de ${fmt(resumen.saldoPendiente)}.`;
  }
  return null;
}

function validarMovimiento() {
  const concepto = document.getElementById('movimiento-concepto').value.trim();
  const valor = parseNumeroInput('movimiento-valor');
  if (!concepto) return 'Debes ingresar el concepto del movimiento.';
  if (esTextoSoloNumeros(concepto)) return 'El concepto del movimiento no puede ser solo números.';
  if (isNaN(valor) || valor <= 0) return 'Debes ingresar un valor de movimiento mayor que cero.';
  return null;
}

function validarPlataformas() {
  const practi = parseNumeroInput('venta_practisistemas');
  const deport = parseNumeroInput('venta_deportivas', true);
  const practiVal = isNaN(practi) ? 0 : practi;
  const deportVal = isNaN(deport) ? 0 : deport;
  if (practiVal < 0) return 'La venta de Practisistemas no puede ser negativa.';
  const fecha = document.getElementById('fecha')?.value || '';
  const correccionAutorizada = esSuperAdminActivo() || isOverrideActive('plataformas', fecha);
  if (practiVal === 0 && deportVal === 0 && !correccionAutorizada) {
    return 'Debes ingresar al menos un valor en Plataformas.';
  }
  return null;
}

function cajaDraftTieneContenido(draft) {
  if (!draft) return false;
  if (String(draft.total_monedas || '').trim()) return true;
  if (String(draft.billetes_viejos || '').trim()) return true;
  return Object.values(draft.billetes || {}).some(item =>
    String(item?.cantidad || '').trim() !== '' || String(item?.subtotal || '').trim() !== ''
  );
}

function contadoresDraftTieneContenido(draft) {
  if (!draft?.items?.length) return false;
  return draft.items.some(item => [
    item.entradas,
    item.salidas,
    item.jackpot,
    item.ref_entradas,
    item.ref_salidas,
    item.ref_jackpot,
    item.produccion_pre_reset,
  ].some(valor => String(valor || '').trim() !== ''));
}

function sincronizarDraftsActualesParaAviso() {
  if (currentModule === 'caja') guardarDraftCaja();
  if (currentModule === 'contadores') guardarDraftContadores();
}

function obtenerModulosConCambiosSinGuardar() {
  sincronizarDraftsActualesParaAviso();
  const modulos = [];
  if (Object.values(cajaDrafts).some(cajaDraftTieneContenido)) modulos.push('Caja');
  if (Object.values(contadoresDrafts).some(contadoresDraftTieneContenido)) modulos.push('Contadores');
  return modulos;
}

function cambiarFechaPorDelta(deltaDias) {
  const fechaInput = document.getElementById('fecha');
  if (!fechaInput?.value) return;
  const actual = new Date(`${fechaInput.value}T00:00:00`);
  if (Number.isNaN(actual.getTime())) return;
  actual.setDate(actual.getDate() + deltaDias);
  const nuevaFecha = dateToStr(actual);
  fechaInput.value = nuevaFecha;
  fechaInput.dispatchEvent(new Event('change', { bubbles: true }));
}

function limpiarCaja() {
  DENOMINACIONES.forEach(d => {
    document.getElementById(`cant_${d}`).value = '';
    document.getElementById(`sub_${d}`).value = '';
  });
  ['total_monedas', 'billetes_viejos']
    .forEach(id => { document.getElementById(id).value = ''; });
  calcularCaja();
}

function limpiarPlataformas() {
  setNumeroInputValue('venta_practisistemas', '');
  setNumeroInputValue('venta_deportivas', '', true);
  calcularPlataformas();
}

function obtenerDraftCajaActual() {
  const fecha = document.getElementById('fecha')?.value;
  if (!fecha) return null;

  const billetes = {};
  DENOMINACIONES.forEach(d => {
    billetes[String(d)] = {
      cantidad: document.getElementById(`cant_${d}`).value || '',
      subtotal: document.getElementById(`sub_${d}`).value || '',
    };
  });

  return {
    billetes,
    total_monedas: document.getElementById('total_monedas').value || '',
    billetes_viejos: document.getElementById('billetes_viejos').value || '',
  };
}

function guardarDraftCaja(fechaOverride = null) {
  const fecha = fechaOverride || document.getElementById('fecha')?.value;
  if (!fecha || cajaLocked) return;
  cajaDrafts[fecha] = obtenerDraftCajaActual();
  try { sessionStorage.setItem('cajaDrafts', JSON.stringify(cajaDrafts)); } catch {}
}

function eliminarDraftCaja(fecha) {
  if (!fecha) return;
  delete cajaDrafts[fecha];
  try { sessionStorage.setItem('cajaDrafts', JSON.stringify(cajaDrafts)); } catch {}
}

function aplicarDraftCaja(fecha) {
  const draft = cajaDrafts[fecha];
  if (!draft) return false;

  DENOMINACIONES.forEach(d => {
    const item = draft.billetes?.[String(d)] || {};
    setNumeroInputValue(`cant_${d}`, item.cantidad || '');
    setNumeroInputValue(`sub_${d}`, item.subtotal || '');
  });
  setNumeroInputValue('total_monedas', draft.total_monedas || '');
  setNumeroInputValue('billetes_viejos', draft.billetes_viejos || '');
  calcularCaja();
  return true;
}

function limpiarModuloActual() {
  if (currentModule === 'caja') {
    eliminarDraftCaja(document.getElementById('fecha').value);
    limpiarCaja();
  } else if (currentModule === 'plataformas') {
    limpiarPlataformas();
  } else if (currentModule === 'contadores') {
    eliminarDraftContadores(document.getElementById('fecha').value);
    renderContadores(contadorCatalog.map(item => ({
      item_id: item.item_id,
      nombre: item.nombre,
      denominacion: item.denominacion,
      entradas: 0,
      salidas: 0,
      jackpot: 0,
      yield_actual: 0,
      referencia: { tipo: 'sin_referencia', fecha: '', entradas: 0, salidas: 0, jackpot: 0, yield: 0 },
      resultado_monetario: 0,
      alerta: false,
    })), 0);
  } else if (currentModule === 'bonos') {
    limpiarFormularioBonos();
  } else if (currentModule === 'prestamos') {
    limpiarFormularioPrestamos();
  } else if (currentModule === 'movimientos') {
    limpiarFormularioMovimientos();
    renderMovimientosRegistros([], {});
  } else {
    limpiarFormularioGastos();
  }
  ocultarMensaje();
}

function renderTabs() {
  const cont = document.getElementById('modulo-tabs');
  cont.innerHTML = '';
  enabledModules.forEach(modulo => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tab-modulo ${modulo === currentModule ? 'activo' : ''}`;
    btn.textContent = MODULE_META[modulo].label;
    btn.addEventListener('click', () => activarModulo(modulo));
    cont.appendChild(btn);
  });
}

function actualizarPaneles() {
  Object.entries(MODULE_META).forEach(([modulo, meta]) => {
    document.getElementById(meta.panelId).classList.toggle('oculto', modulo !== currentModule);
  });
  document.getElementById('fecha-label').textContent = MODULE_META[currentModule].dateLabel;
  document.getElementById('btn-guardar').classList.toggle('oculto', ['bonos', 'gastos', 'prestamos', 'movimientos', 'cuadre'].includes(currentModule));
  document.getElementById('btn-guardar').textContent = 'Guardar';
  document.getElementById('btn-ir-cuadre').classList.toggle('oculto', currentModule === 'cuadre' || !enabledModules.includes('cuadre'));
  actualizarBonosVisuales();
  actualizarPrestamosVisuales();
  actualizarMovimientosVisuales();
  actualizarBotonAbrirXlsx();
}

function sugerirFechaModulo() {
  return hoyStr();
}

function _persistirFechasModulo() {
  try { sessionStorage.setItem('moduleDates', JSON.stringify(moduleDates)); } catch {}
}

function setSharedModuleDate(fecha) {
  const activa = fecha || hoyStr();
  Object.keys(MODULE_META).forEach(modulo => {
    moduleDates[modulo] = activa;
  });
  _persistirFechasModulo();
}

function aplicarFechaModulo(modulo, usarDefault = false) {
  if (usarDefault || !moduleDates[modulo]) {
    setSharedModuleDate(sugerirFechaModulo(modulo));
  }
  document.getElementById('fecha').value = moduleDates[modulo];
  actualizarDiaFecha(moduleDates[modulo]);
  actualizarBotonAbrirXlsx();
}

function obtenerFechaModuloActual() {
  return document.getElementById('fecha')?.value || moduleDates[currentModule] || hoyStr();
}

function obtenerAnioModuloActual() {
  const fecha = obtenerFechaModuloActual();
  const match = String(fecha || '').match(/^(\d{4})-/);
  return Number(match?.[1] || new Date().getFullYear());
}

function actualizarBotonAbrirXlsx() {
  const btn = document.getElementById('btn-abrir-xlsx');
  if (!btn) return;
  const visible = esSuperAdminActivo() && Boolean(MODULE_META[currentModule]);
  btn.classList.toggle('oculto', !visible);
  if (!visible) return;
  const anio = obtenerAnioModuloActual();
  const sedeLibro = configActiveSite?.sede || configSede || 'Principal';
  const usaConsolidado = currentModule === 'contadores' || currentModule === 'cuadre';
  const libro = usaConsolidado
    ? `Consolidado_${sedeLibro}_${anio}.xlsx`
    : `Contadores_${sedeLibro}_${anio}.xlsx`;
  btn.title = `Abrir ${libro} en la hoja de ${MODULE_META[currentModule].label}`;
}

async function abrirXlsxModuloActual() {
  if (!esSuperAdminActivo()) {
    mostrarMensaje('Esta acción solo está disponible en super admin.', 'advertencia');
    return;
  }
  try {
    const res = await fetch('/api/settings/open-module-xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modulo: currentModule,
        year: obtenerAnioModuloActual(),
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      mostrarMensaje(data.mensaje || 'No se pudo abrir el Excel del módulo.', 'error');
      return;
    }
    mostrarMensaje(data.mensaje || 'Abriendo Excel...', 'ok');
  } catch {
    mostrarMensaje('No se pudo abrir el Excel del módulo.', 'error');
  }
}

function resetOverride(modulo) {
  adminOverride[modulo] = null;
  ocultarBanner();
}

function isOverrideActive(modulo, fecha = null) {
  const fechaObjetivo = fecha || document.getElementById('fecha')?.value || '';
  return Boolean(adminOverride[modulo] && adminOverride[modulo] === fechaObjetivo);
}

function setOverride(modulo, fecha) {
  adminOverride[modulo] = fecha || document.getElementById('fecha')?.value || null;
}

function puedeForzarModulo(modulo, fecha = null) {
  return esSuperAdminActivo() || isOverrideActive(modulo, fecha);
}

async function activarModulo(modulo) {
  if (currentModule === 'caja') guardarDraftCaja();
  if (currentModule === 'contadores') guardarDraftContadores();
  currentModule = modulo;
  if (!enabledModules.includes(modulo)) {
    currentModule = enabledModules[0];
  }
  sessionStorage.setItem('lastModule', currentModule);
  renderTabs();
  actualizarPaneles();
  aplicarFechaModulo(currentModule);
  if (currentModule === 'bonos') {
    limpiarFormularioBonos();
    actualizarBonosVisuales();
  }
  if (currentModule === 'plataformas') {
    calcularPlataformas();
  }
  if (currentModule === 'prestamos') {
    limpiarFormularioPrestamos();
    actualizarPrestamosVisuales();
  }
  if (currentModule === 'movimientos') {
    limpiarFormularioMovimientos();
    actualizarMovimientosVisuales();
  }
  if (currentModule === 'contadores') {
    resetOverride('contadores');
  }
  if (currentModule !== 'caja') resetOverride(currentModule);
  await cargarVistaModulo(currentModule, moduleDates[currentModule]);
  await verificarFechaActual();
}

async function verificarFechaActual() {
  const fecha = document.getElementById('fecha').value;
  const estado = document.getElementById('fecha-estado');
  const btnGuardar = document.getElementById('btn-guardar');

  if (!fecha) {
    estado.textContent = '';
    estado.className = 'fecha-estado';
    guardarEstadoModulo(currentModule, '', null);
    return;
  }

  if (fecha > hoyStr()) {
    estado.textContent = 'No es posible editar una fecha futura.';
    estado.className = 'fecha-estado futura';
    btnGuardar.disabled = true;
    guardarEstadoModulo(currentModule, fecha, { existe: false, futura: true });
    return;
  }

  try {
    const res = await fetch(`/api/modulos/${currentModule}/fecha/${fecha}/estado`);
    const data = await res.json();
    guardarEstadoModulo(currentModule, fecha, data);
    btnGuardar.disabled = false;

    if (currentModule === 'cuadre') {
      if (data.existe && !isOverrideActive('cuadre', fecha)) {
        estado.textContent = `El Cuadre de ${formatFechaVisual(fecha)} ya existe.`;
        estado.className = 'fecha-estado existe';
        return;
      }
      if (isOverrideActive('cuadre', fecha)) {
        estado.textContent = `Corrección de Cuadre autorizada para ${formatFechaVisual(fecha)}.`;
        estado.className = 'fecha-estado advertencia-fecha';
        return;
      }
      if (!data.ok) {
        estado.textContent = data.mensaje;
        estado.className = 'fecha-estado existe';
        return;
      }
      const dias = data.periodo?.length ?? 1;
      estado.textContent = dias > 1
        ? `Período: ${formatFechaVisual(data.periodo[0])} → ${formatFechaVisual(fecha)} (${dias} días del período)`
        : 'Fecha disponible para cuadre.';
      estado.className = 'fecha-estado libre';
      return;
    }

    if (currentModule === 'plataformas') {
      if (fecha === hoyStr()) {
        estado.textContent = data.existe
          ? 'Puedes seguir corrigiendo plataformas hoy.'
          : 'Puedes registrar plataformas libremente hoy.';
        estado.className = 'fecha-estado libre';
        return;
      }

      if (isOverrideActive('plataformas', fecha)) {
        estado.textContent = `Corrección de plataformas autorizada para ${formatFechaVisual(fecha)}.`;
        estado.className = 'fecha-estado advertencia-fecha';
        return;
      }

      estado.textContent = `Plataformas en ${formatFechaVisual(fecha)} requiere admin.`;
      estado.className = 'fecha-estado existe';
      return;
    }

    if (currentModule === 'contadores') {
      if (data.existe && !isOverrideActive('contadores', fecha)) {
        estado.textContent = `Contadores de ${formatFechaVisual(fecha)} ya existen.`;
        estado.className = 'fecha-estado existe';
        return;
      }

      if (isOverrideActive('contadores', fecha)) {
        estado.textContent = `Corrección de contadores autorizada para ${formatFechaVisual(fecha)}.`;
        estado.className = 'fecha-estado advertencia-fecha';
        return;
      }

      estado.textContent = 'Fecha disponible para capturar contadores.';
      estado.className = 'fecha-estado libre';
      return;
    }

    if (currentModule === 'caja') {
      const cajaLibre = fecha === hoyStr() || fecha === ayerStr();
      if (data.existe && !isOverrideActive('caja', fecha)) {
        estado.textContent = `La caja de ${formatFechaVisual(fecha)} ya existe y requiere admin para corregirse.`;
        estado.className = 'fecha-estado existe';
        return;
      }

      if (isOverrideActive('caja', fecha)) {
        estado.textContent = `Corrección de caja autorizada para ${formatFechaVisual(fecha)}.`;
        estado.className = 'fecha-estado advertencia-fecha';
        return;
      }

      estado.textContent = cajaLibre
        ? 'Fecha disponible para capturar caja.'
        : `Caja en ${formatFechaVisual(fecha)} requiere admin.`;
      estado.className = cajaLibre ? 'fecha-estado libre' : 'fecha-estado existe';
      return;
    }

    if (fecha === hoyStr()) {
      estado.textContent = data.existe
        ? `Puedes seguir registrando ${MODULE_META[currentModule].label.toLowerCase()} hoy.`
        : `Puedes registrar ${MODULE_META[currentModule].label.toLowerCase()} libremente hoy.`;
      estado.className = 'fecha-estado libre';
      return;
    }

    if (isOverrideActive(currentModule, fecha)) {
      estado.textContent = `Corrección de ${MODULE_META[currentModule].label.toLowerCase()} autorizada para ${formatFechaVisual(fecha)}.`;
      estado.className = 'fecha-estado advertencia-fecha';
      return;
    }

    estado.textContent = `${MODULE_META[currentModule].label} en ${formatFechaVisual(fecha)} requiere admin.`;
    estado.className = 'fecha-estado existe';
  } catch {
    estado.textContent = '';
    guardarEstadoModulo(currentModule, fecha, null);
  }
}

function abrirModalAdminAccion({ titulo, descripcion, onSuccess }) {
  mostrarBannerAutorizacion({ titulo, descripcion, onSuccess });
}

function cerrarModalEditar() {
  pendingAdminAction = null;
  ocultarBanner();
}

async function confirmarAccionAdmin() {
  if (document.getElementById('auth-card-pass').value !== CONTRASENA) {
    document.getElementById('auth-card-error').classList.remove('oculto');
    document.getElementById('auth-card-pass').value = '';
    document.getElementById('auth-card-pass').focus();
    return;
  }
  const accion = pendingAdminAction;
  document.getElementById('auth-card-pass').value = '';
  cerrarModalEditar();
  if (accion) await accion();
}

async function cargarDatosCaja(fecha) {
  const cajaLibre = (configSuperAdminMode && !!configActiveSite) || fecha === hoyStr() || fecha === ayerStr();
  try {
    const estadoRes = await fetch(`/api/modulos/caja/fecha/${fecha}/estado`);
    const estado = estadoRes.ok ? await estadoRes.json() : { existe: false };

    if (!estado.existe) {
      setCajaEditable(cajaLibre || isOverrideActive('caja', fecha));
      if (!aplicarDraftCaja(fecha)) limpiarCaja();
      return;
    }

    // La caja existe: siempre cargar y mostrar los datos guardados.
    const res = await fetch(`/api/modulos/caja/fecha/${fecha}/datos`);
    if (!res.ok) {
      limpiarCaja();
      setCajaEditable(cajaLibre || isOverrideActive('caja', fecha));
      return;
    }
    const data = await res.json();
    DENOMINACIONES.forEach(d => {
      const cantidad = data.billetes?.[String(d)] ?? 0;
      setNumeroInputValue(`cant_${d}`, cantidad || '');
      setNumeroInputValue(`sub_${d}`, cantidad ? cantidad * d : '');
    });
    setNumeroInputValue('total_monedas', data.total_monedas || '');
    setNumeroInputValue('billetes_viejos', data.billetes_viejos || '');
    calcularCaja();
    eliminarDraftCaja(fecha);
    setCajaEditable(cajaLibre || isOverrideActive('caja', fecha));
  } catch {
    if (!aplicarDraftCaja(fecha)) limpiarCaja();
    setCajaEditable(cajaLibre || isOverrideActive('caja', fecha));
  }
}

async function cargarDatosPlataformas(fecha) {
  try {
    const res = await fetch(`/api/modulos/plataformas/fecha/${fecha}/datos`);
    if (!res.ok) {
      limpiarPlataformas();
    } else {
      const data = await res.json();
      setNumeroInputValue('venta_practisistemas', data.venta_practisistemas || '');
      setNumeroInputValue('venta_deportivas', data.venta_deportivas || '', true);
      calcularPlataformas();
    }
  } catch {
    limpiarPlataformas();
  }
  if (configSuperAdminMode && configActiveSite) {
    cargarReferenciasPlataformas(fecha);
  } else {
    document.getElementById('plataformas-ref-panel').classList.add('oculto');
  }
}

async function cargarReferenciasPlataformas(fecha) {
  const panel = document.getElementById('plataformas-ref-panel');
  try {
    const res = await fetch(`/api/modulos/plataformas/fecha/${fecha}/referencias`);
    if (!res.ok) { panel.classList.add('oculto'); return; }
    const data = await res.json();
    panel.classList.remove('oculto');
    document.getElementById('plataformas-ref-sede').textContent = data.sede ? `— ${data.sede}` : '';
    _renderRefItem('plataformas-ref-practi', data.practisistemas, parsePositivo('venta_practisistemas'));
    _renderRefItem('plataformas-ref-bet', data.deportivas, parseNumeroInput('venta_deportivas', true) || 0);
  } catch {
    panel.classList.add('oculto');
  }
}

function _renderRefItem(prefix, ref, valorIngresado) {
  const valorEl = document.getElementById(`${prefix}-valor`);
  const estadoEl = document.getElementById(`${prefix}-estado`);
  if (!valorEl || !estadoEl) return;
  estadoEl.className = 'plataformas-ref-estado';

  if (!ref || ref.status === 'sin_ruta' || ref.status === 'sin_mapeo') {
    valorEl.textContent = '—';
    estadoEl.textContent = ref?.status === 'sin_mapeo' ? 'Sin columna configurada' : 'Sin ruta configurada';
    estadoEl.classList.add('sin-dato');
    return;
  }
  if (ref.status === 'archivo_no_encontrado') {
    valorEl.textContent = '—';
    estadoEl.textContent = 'Archivo no encontrado';
    estadoEl.classList.add('sin-dato');
    return;
  }
  if (ref.status === 'fecha_no_encontrada') {
    valorEl.textContent = '—';
    estadoEl.textContent = 'Sin dato para esta fecha';
    estadoEl.classList.add('sin-dato');
    return;
  }
  if (ref.status === 'sin_dato' || ref.status === 'vacio') {
    valorEl.textContent = '—';
    estadoEl.textContent = 'Sin datos';
    estadoEl.classList.add('sin-dato');
    return;
  }
  if (ref.status === 'ok' && ref.valor !== null) {
    valorEl.textContent = fmt(ref.valor);
    const diff = Math.abs((valorIngresado || 0) - ref.valor);
    if (valorIngresado === 0 || isNaN(valorIngresado)) {
      estadoEl.textContent = '';
    } else if (diff <= 1) {
      estadoEl.textContent = 'Coincide';
      estadoEl.classList.add('coincide');
    } else {
      estadoEl.textContent = `Difiere ${fmt(diff)}`;
      estadoEl.classList.add('difiere');
    }
    return;
  }
  // error u otro estado
  valorEl.textContent = '—';
  estadoEl.textContent = ref.status || 'Error';
  estadoEl.classList.add('sin-dato');
}

async function cargarDatosModuloItems(modulo, fecha) {
  if (modulo === 'contadores') {
    await cargarDatosContadores(fecha);
    return;
  }
  if (modulo === 'gastos') {
    await cargarGastosDelDia(fecha);
    return;
  }
  if (modulo === 'bonos') {
    await cargarBonosDelDia(fecha);
    return;
  }
  if (modulo === 'prestamos') {
    await cargarPrestamosDelDia(fecha);
    return;
  }
  if (modulo === 'movimientos') {
    await cargarMovimientosDelDia(fecha);
    return;
  }
  try {
    const res = await fetch(`/api/modulos/${modulo}/fecha/${fecha}/datos`);
    if (!res.ok) {
      renderGastosRegistros([], 0);
      return;
    }
    const data = await res.json();
    renderGastosRegistros(data.items || [], data.total || 0);
  } catch {
    renderGastosRegistros([], 0);
  }
}

async function cargarDatosContadores(fecha) {
  try {
    const res = await fetch(`/api/modulos/contadores/fecha/${fecha}/datos?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      limpiarFormularioContadores();
      return;
    }
    const data = await res.json();
    renderContadores(data.items || [], data.total_resultado || 0);
    const editable = esSuperAdminActivo() || Boolean(isOverrideActive('contadores', fecha)) || !data.existe;
    setContadoresEditable(editable);
    if (!data.existe) applyContadoresDraft(fecha);
  } catch {
    limpiarFormularioContadores();
    setContadoresEditable(true);
    applyContadoresDraft(fecha);
  }
}

async function cargarVistaModulo(modulo, fecha) {
  if (!fecha) return;
  if (modulo === 'caja') {
    await cargarDatosCaja(fecha);
    return;
  }
  if (modulo === 'plataformas') {
    await cargarDatosPlataformas(fecha);
    return;
  }
  if (modulo === 'cuadre') {
    await cargarDatosCuadre(fecha);
    return;
  }
  await cargarDatosModuloItems(modulo, fecha);
}

async function registrarBono() {
  const error = validarBono();
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }
  const fecha = document.getElementById('fecha').value;
  const cliente = document.getElementById('bono-cliente').value.trim();
  const valor = parseNumeroInput('bono-valor');

  const res = await fetch('/api/modulos/bonos/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, cliente, valor, forzar: puedeForzarModulo('bonos', fecha) }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }
  limpiarFormularioBonos();
  bonusNames = Array.from(new Set([...bonusNames, cliente])).sort((a, b) => a.localeCompare(b, 'es'));
  renderBonusNames();
  await cargarBonosDelDia(fecha);
  actualizarBonosVisuales();
  mostrarMensaje(`✓ ${data.mensaje} — ${data.cliente}: ${fmt(data.valor)} — Total día: ${fmt(data.total_dia)}`, 'ok');
  await verificarFechaActual();
  document.getElementById('bono-cliente').focus();
}

async function registrarPrestamo() {
  const error = validarPrestamo();
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }
  const fecha = document.getElementById('fecha').value;
  const persona = document.getElementById('prestamo-persona').value.trim();
  const tipo_movimiento = obtenerTipoPrestamoSeleccionado();
  const valor = parseNumeroInput('prestamo-valor');

  const res = await fetch('/api/modulos/prestamos/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, persona, tipo_movimiento, valor, forzar: puedeForzarModulo('prestamos', fecha) }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }
  limpiarFormularioPrestamos();
  loanNames = Array.from(new Set([...loanNames, persona])).sort((a, b) => a.localeCompare(b, 'es'));
  renderLoanNames();
  await cargarPrestamosDelDia(fecha);
  actualizarPrestamosVisuales();
  mostrarMensaje(`✓ ${data.mensaje} — ${data.persona}: ${fmt(data.valor)} — Saldo pendiente: ${fmt(data.saldo_pendiente)}`, 'ok');
  await verificarFechaActual();
  document.getElementById('prestamo-persona').focus();
}

async function registrarMovimiento() {
  const error = validarMovimiento();
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }
  const fecha = document.getElementById('fecha').value;
  const tipo_movimiento = obtenerTipoMovimientoSeleccionado();
  const concepto = document.getElementById('movimiento-concepto').value.trim();
  const valor = parseNumeroInput('movimiento-valor');

  const res = await fetch('/api/modulos/movimientos/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, tipo_movimiento, concepto, valor, observacion: '', forzar: puedeForzarModulo('movimientos', fecha) }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }
  limpiarFormularioMovimientos();
  movementConcepts = Array.from(new Set([...movementConcepts, concepto])).sort((a, b) => a.localeCompare(b, 'es'));
  renderMovementConcepts();
  await cargarMovimientosDelDia(fecha);
  actualizarMovimientosVisuales();
  mostrarMensaje(`✓ ${data.mensaje} — ${data.concepto}: ${fmt(data.valor)} — Neto día: ${fmt(data.neto)}`, 'ok');
  await verificarFechaActual();
  document.getElementById('movimiento-concepto').focus();
}

function validarGasto() {
  const concepto = document.getElementById('gasto-concepto').value.trim();
  const valorRaw = document.getElementById('gasto-valor').value;
  const valor = valorRaw === '' ? 0 : parseNumeroTexto(valorRaw);
  if (!concepto) return 'Debes ingresar la descripción del gasto.';
  if (esTextoSoloNumeros(concepto)) return 'La descripción del gasto no puede ser solo números.';
  if (isNaN(valor) || valor <= 0) return 'Debes ingresar un valor de gasto mayor que cero.';
  return null;
}

async function registrarGasto() {
  const error = validarGasto();
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }
  const fecha = document.getElementById('fecha').value;
  const concepto = document.getElementById('gasto-concepto').value.trim();
  const valor = parseNumeroInput('gasto-valor');

  const res = await fetch('/api/modulos/gastos/guardar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, items: [{ concepto, valor }], forzar: puedeForzarModulo('gastos', fecha) }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }
  limpiarFormularioGastos();
  expenseConcepts = Array.from(new Set([...expenseConcepts, concepto])).sort((a, b) => a.localeCompare(b, 'es'));
  renderExpenseConcepts();
  await cargarDatosModuloItems('gastos', fecha);
  mostrarMensaje(`✓ ${data.mensaje} — ${concepto}: ${fmt(valor)} — Total día: ${fmt(data.total)}`, 'ok');
  await verificarFechaActual();
  document.getElementById('gasto-concepto').focus();
}

function validarContadores() {
  const rows = [...document.querySelectorAll('#contadores-body tr[data-item-id]')];
  if (!rows.length) return 'No hay ítems configurados en Contadores.';

  for (const row of rows) {
    const tieneCaptura = filaContadorTieneCaptura(row);
    const completa = filaContadorCompleta(row);

    if (!tieneCaptura) {
      return `Debes completar los contadores de ${row.dataset.nombre}.`;
    }

    if (!completa) {
      return `Completa Entradas y Salidas para ${row.dataset.nombre}.`;
    }

    for (const role of ['entradas', 'salidas', 'jackpot']) {
      const value = row.querySelector(`[data-role="${role}"]`)?.value || '';
      const num = value === '' ? 0 : parseNumeroTexto(value);
      if (isNaN(num) || num < 0) {
        return `Valor inválido en ${role} para ${row.dataset.nombre}.`;
      }
    }

    const entradas = valorContadorRow(row, 'entradas');
    const salidas = valorContadorRow(row, 'salidas');
    const jackpot = valorContadorRow(row, 'jackpot');
    const alerta = entradas < Number(row.dataset.refEntradas || 0)
      || salidas < Number(row.dataset.refSalidas || 0)
      || jackpot < Number(row.dataset.refJackpot || 0);
    const usaCritica = row.dataset.criticaAutorizada === '1';

    if (alerta && !usaCritica) {
      return `${row.dataset.nombre}: hay valores menores a la referencia en Entradas, Salidas o Jackpot. Abre "Referencia crítica", ajusta los valores y confirma con OK.`;
    }

  }

  return null;
}

async function guardarContadores() {
  const error = validarContadores();
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }

  const fecha = document.getElementById('fecha').value;
  const items = [...document.querySelectorAll('#contadores-body tr[data-item-id]')]
    .map(row => {
    const usarReferenciaCritica = row.dataset.criticaAutorizada === '1';
    const item = {
      item_id: row.dataset.itemId,
      entradas: valorContadorRow(row, 'entradas'),
      salidas: valorContadorRow(row, 'salidas'),
      jackpot: valorContadorRow(row, 'jackpot'),
      usar_referencia_critica: usarReferenciaCritica,
      referencia_critica: usarReferenciaCritica ? {
        entradas: valorContadorRow(row, 'critica-entradas'),
        salidas: valorContadorRow(row, 'critica-salidas'),
        jackpot: valorContadorRow(row, 'critica-jackpot'),
        observacion: OBSERVACION_CRITICA_DEFAULT,
      } : null,
      produccion_pre_reset: usarReferenciaCritica ? (valorContadorRow(row, 'critica-pre-reset') || 0) : 0,
    };
    return item;
  });

  const res = await fetch('/api/modulos/contadores/guardar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, items, forzar: puedeForzarModulo('contadores', fecha) || items.some(i => i.usar_referencia_critica) }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }

  eliminarDraftContadores(fecha);
  await cargarDatosContadores(fecha);
  await verificarFechaActual();
  mostrarMensaje(`✓ ${data.mensaje} — Resultado total: ${fmt(data.total_resultado || 0)}`, 'ok');
}

function parseCatalogoTextarea(id) {
  return (document.getElementById(id)?.value || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

// ── Catálogo contadores — grid ─────────────────────────────────────

function _crearFilaCatalogoContadores(item = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="admin-grid-input" data-field="item_id" value="${item.item_id || ''}" placeholder="M01" maxlength="20" /></td>
    <td><input type="text" class="admin-grid-input" data-field="nombre" value="${item.nombre || ''}" placeholder="Ruleta 1" maxlength="50" /></td>
    <td><input type="text" inputmode="numeric" class="admin-grid-input admin-grid-num" data-field="denominacion" value="${limpiarNumeroTexto(item.denominacion) || ''}" placeholder="100" /></td>
    <td><button type="button" class="btn-admin-grid-remove" tabindex="-1" title="Eliminar">×</button></td>
  `;
  tr.querySelector('.btn-admin-grid-remove').addEventListener('click', () => tr.remove());
  return tr;
}

function renderContadoresCatalogoGrid(items = []) {
  const body = document.getElementById('admin-contadores-grid-body');
  if (!body) return;
  body.innerHTML = '';
  (items || []).forEach(item => body.appendChild(_crearFilaCatalogoContadores(item)));
}

function parseContadoresCatalogoGrid() {
  return [...document.querySelectorAll('#admin-contadores-grid-body tr')].flatMap(tr => {
    const item_id = tr.querySelector('[data-field="item_id"]')?.value.trim();
    const nombre = tr.querySelector('[data-field="nombre"]')?.value.trim();
    const denominacion = Number(limpiarNumeroTexto(tr.querySelector('[data-field="denominacion"]')?.value || '')) || 0;
    if (!item_id || !nombre || denominacion <= 0) return [];
    return [{ item_id, nombre, denominacion, activo: true }];
  });
}

// ── Startup referencias — grid ──────────────────────────────────────

function renderStartupContadoresGrid(refs = {}, catalogItems = []) {
  const body = document.getElementById('admin-startup-grid-body');
  const tabla = document.getElementById('admin-startup-grid-tabla');
  const sinItems = document.getElementById('admin-startup-sin-items');
  if (!body) return;
  body.innerHTML = '';
  if (!catalogItems.length) {
    tabla?.classList.add('oculto');
    sinItems?.classList.remove('oculto');
    return;
  }
  tabla?.classList.remove('oculto');
  sinItems?.classList.add('oculto');

  const _fila = (id, nombre, ref, huerfano = false) => {
    const tr = document.createElement('tr');
    tr.dataset.itemId = id;
    if (huerfano) tr.className = 'admin-grid-huerfano';
    tr.innerHTML = `
      <td class="admin-grid-id-cell">${id}${huerfano ? ' <span class="admin-grid-huerfano-label">(sin ítem)</span>' : ''}</td>
      <td class="admin-grid-nombre-cell">${nombre}</td>
      <td><input type="text" inputmode="numeric" class="admin-grid-input admin-grid-num" data-field="entradas" value="${ref.entradas ?? 0}" /></td>
      <td><input type="text" inputmode="numeric" class="admin-grid-input admin-grid-num" data-field="salidas" value="${ref.salidas ?? 0}" /></td>
      <td><input type="text" inputmode="numeric" class="admin-grid-input admin-grid-num" data-field="jackpot" value="${ref.jackpot ?? 0}" /></td>
    `;
    return tr;
  };

  const idsEnCatalogo = new Set(catalogItems.map(i => i.item_id));
  catalogItems.forEach(item => body.appendChild(_fila(item.item_id, item.nombre, refs[item.item_id] || {})));
  Object.entries(refs).forEach(([id, ref]) => {
    if (!idsEnCatalogo.has(id)) body.appendChild(_fila(id, '—', ref, true));
  });
}

function parseStartupContadoresGrid() {
  const result = {};
  document.querySelectorAll('#admin-startup-grid-body tr[data-item-id]').forEach(tr => {
    result[tr.dataset.itemId] = {
      entradas: Number(limpiarNumeroTexto(tr.querySelector('[data-field="entradas"]')?.value || '')) || 0,
      salidas:  Number(limpiarNumeroTexto(tr.querySelector('[data-field="salidas"]')?.value  || '')) || 0,
      jackpot:  Number(limpiarNumeroTexto(tr.querySelector('[data-field="jackpot"]')?.value  || '')) || 0,
    };
  });
  return result;
}

function sincronizarReferenciasCatalogo() {
  const itemsCatalogo = parseContadoresCatalogoGrid();
  const refActual = parseStartupContadoresGrid();
  const idsEnCatalogo = new Set(itemsCatalogo.map(i => i.item_id));
  const nuevas = {};
  for (const item of itemsCatalogo) {
    nuevas[item.item_id] = refActual[item.item_id] || { entradas: 0, salidas: 0, jackpot: 0 };
  }
  for (const [id, ref] of Object.entries(refActual)) {
    if (!idsEnCatalogo.has(id)) nuevas[id] = ref;
  }
  const agregados = itemsCatalogo.filter(i => !refActual[i.item_id]).length;
  renderStartupContadoresGrid(nuevas, itemsCatalogo);
  return agregados;
}

function setCatalogoTextarea(id, items = []) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = (items || []).join('\n');
}

async function cargarCatalogosAdmin() {
  const [bonosRes, gastosRes, prestamosRes, movimientosRes, contadoresRes] = await Promise.all([
    fetch('/api/modulos/catalogos/bonos'),
    fetch('/api/modulos/catalogos/gastos'),
    fetch('/api/modulos/catalogos/prestamos'),
    fetch('/api/modulos/catalogos/movimientos'),
    fetch('/api/modulos/catalogos/contadores'),
  ]);
  const bonosData = bonosRes.ok ? await bonosRes.json() : { nombres: [] };
  const gastosData = gastosRes.ok ? await gastosRes.json() : { conceptos: [] };
  const prestamosData = prestamosRes.ok ? await prestamosRes.json() : { nombres: [] };
  const movimientosData = movimientosRes.ok ? await movimientosRes.json() : { conceptos: [] };
  const contadoresData = contadoresRes.ok ? await contadoresRes.json() : { items: [] };
  setCatalogoTextarea('admin-bonos-catalogo', bonosData.nombres || []);
  setCatalogoTextarea('admin-gastos-catalogo', gastosData.conceptos || []);
  setCatalogoTextarea('admin-prestamos-catalogo', prestamosData.nombres || []);
  setCatalogoTextarea('admin-movimientos-catalogo', movimientosData.conceptos || []);
  renderContadoresCatalogoGrid(contadoresData.items || []);
}

async function cargarStartupAdmin() {
  const res = await fetch('/api/settings/startup');
  const data = res.ok ? await res.json() : { enabled: false, fecha_inicio: '', caja_inicial: 0, contadores: {} };
  const enabledEl = document.getElementById('admin-startup-enabled');
  const dateEl = document.getElementById('admin-startup-date');
  const cashEl = document.getElementById('admin-startup-cash');
  if (enabledEl) enabledEl.checked = Boolean(data.enabled);
  if (dateEl) dateEl.value = data.fecha_inicio || '';
  if (cashEl) cashEl.value = data.caja_inicial ? formatNumeroTexto(data.caja_inicial) : '';
  renderStartupContadoresGrid(data.contadores || {}, parseContadoresCatalogoGrid());
}



async function importarNombresBonos() {
  const msg = document.getElementById('admin-config-msg');
  try {
    const res = await fetch('/api/modulos/bonos/nombres/importar', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) return;
    await cargarBonusNames();
    msg.textContent = `Clientes de bonos importados: ${data.agregados}.`;
    msg.className = 'config-msg ok';
    msg.classList.remove('oculto');
  } catch {
    msg.textContent = 'No se pudo importar el archivo TXT de clientes.';
    msg.className = 'config-msg error';
    msg.classList.remove('oculto');
  }
}

function validarCaja() {
  for (const d of DENOMINACIONES) {
    if (configModoEntrada === 'cantidad') {
      const raw = document.getElementById(`cant_${d}`).value;
      const val = raw === '' ? 0 : parseNumeroTexto(raw);
      if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
        return `Cantidad inválida para $ ${d.toLocaleString('es-CO')}.`;
      }
    } else {
      const raw = document.getElementById(`sub_${d}`).value;
      const val = raw === '' ? 0 : parseNumeroTexto(raw);
      if (isNaN(val) || val < 0) {
        return `Total inválido para $ ${d.toLocaleString('es-CO')}.`;
      }
      if (val > 0 && val % d !== 0) {
        return `$ ${val.toLocaleString('es-CO')} no es múltiplo de $ ${d.toLocaleString('es-CO')}.`;
      }
    }
  }

  for (const id of ['total_monedas', 'billetes_viejos']) {
    const raw = document.getElementById(id).value;
    const val = raw === '' ? 0 : parseNumeroTexto(raw);
    if (isNaN(val) || val < 0) return `Valor inválido en ${id.replace(/_/g, ' ')}.`;
  }
  return null;
}

function validarModuloItems(modulo) {
  if (modulo === 'plataformas') return validarPlataformas();
  if (modulo === 'gastos') return validarGasto();
  if (modulo === 'prestamos') return validarPrestamo();
  if (modulo === 'movimientos') return validarMovimiento();
  if (modulo === 'contadores') return validarContadores();
  return null;
}

async function guardar() {
  ocultarMensaje();
  const fecha = document.getElementById('fecha').value;
  if (!fecha) {
    mostrarMensaje('Debes seleccionar una fecha.', 'error');
    return;
  }

  // Super admin: confirmación mínima antes de sobrescribir
  if (configSuperAdminMode && !configActiveSite) {
    mostrarMensaje('Selecciona una sede remota activa antes de guardar.', 'error');
    return;
  }
  if (configSuperAdminMode) {
    const estado = obtenerEstadoModulo(currentModule, fecha);
    const sede = configActiveSite ? configActiveSite.label : configSede;
    if (estado?.existe) {
      const label = MODULE_META[currentModule]?.label || currentModule;
      const ok = confirm(`⚠ Vas a sobrescribir ${label} del ${formatFechaVisual(fecha)} en "${sede}".\n¿Confirmar corrección?`);
      if (!ok) return;
    } else if (fecha !== hoyStr() && fecha !== ayerStr()) {
      const label = MODULE_META[currentModule]?.label || currentModule;
      const ok = confirm(`Estás guardando ${label} en una fecha anterior (${formatFechaVisual(fecha)}) en "${sede}".\n¿Continuar?`);
      if (!ok) return;
    }
  }

  const error = currentModule === 'caja'
    ? validarCaja()
    : currentModule === 'plataformas'
      ? validarPlataformas()
    : currentModule === 'contadores'
      ? validarContadores()
    : currentModule === 'bonos'
      ? validarBono()
      : currentModule === 'prestamos'
        ? validarPrestamo()
      : validarModuloItems(currentModule);
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }

  const btn = document.getElementById('btn-guardar');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    let res;
    if (currentModule === 'caja') {
      const billetes = {};
      DENOMINACIONES.forEach(d => {
        if (configModoEntrada === 'cantidad') {
          billetes[String(d)] = parseNumeroInput(`cant_${d}`) || 0;
        } else {
          const sub = parseNumeroInput(`sub_${d}`) || 0;
          billetes[String(d)] = Math.round(sub / d);
        }
      });

      res = await fetch('/api/modulos/caja/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          billetes,
          total_monedas: parsePositivo('total_monedas'),
          billetes_viejos: parsePositivo('billetes_viejos'),
          forzar: puedeForzarModulo('caja', fecha),
        }),
      });
    } else if (currentModule === 'plataformas') {
      res = await fetch('/api/modulos/plataformas/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          venta_practisistemas: parsePositivo('venta_practisistemas'),
          venta_deportivas: parseNumeroInput('venta_deportivas', true) || 0,
          forzar: puedeForzarModulo('plataformas', fecha),
        }),
      });
    } else if (currentModule === 'contadores') {
      await guardarContadores();
      return;
    } else if (currentModule === 'bonos') {
      await registrarBono();
      return;
    } else if (currentModule === 'prestamos') {
      await registrarPrestamo();
      return;
    } else if (currentModule === 'movimientos') {
      await registrarMovimiento();
      return;
    } else if (currentModule === 'gastos') {
      await registrarGasto();
      return;
    } else {
      throw new Error('Modulo no soportado');
    }

    const data = await res.json();
    if (!data.ok) {
      mostrarMensaje(data.mensaje, 'advertencia');
      return;
    }

    const dt = new Date(data.fecha_hora_registro);
    const hora12 = dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    if (currentModule === 'caja') {
      setSharedModuleDate(fecha);
      document.getElementById('fecha').value = fecha;
      eliminarDraftCaja(fecha);
      limpiarCaja();
      setCajaEditable(false);
      mostrarMensaje(`✓ ${data.mensaje} — Total caja física: ${fmt(data.total_caja_fisica)} — ${formatFechaHoraVisual(data.fecha_hora_registro) || `${formatFechaVisual(fecha)} ${hora12}`}`, 'ok');
    } else if (currentModule === 'plataformas') {
      setSharedModuleDate(fecha);
      document.getElementById('fecha').value = fecha;
      await cargarVistaModulo('plataformas', fecha);
      mostrarMensaje(`✓ ${data.mensaje} — Total plataformas: ${fmt(data.total_plataformas)} — ${formatFechaHoraVisual(data.fecha_hora_registro) || `${formatFechaVisual(fecha)} ${hora12}`}`, 'ok');
    } else {
      setSharedModuleDate(fecha);
      document.getElementById('fecha').value = fecha;
      await cargarVistaModulo(currentModule, fecha);
      mostrarMensaje(`✓ ${data.mensaje} — Total ${MODULE_META[currentModule].label.toLowerCase()}: ${fmt(data.total)} — ${formatFechaHoraVisual(data.fecha_hora_registro) || `${formatFechaVisual(fecha)} ${hora12}`}`, 'ok');
    }

    await verificarFechaActual();
  } catch {
    mostrarMensaje('Error de conexión con el servidor.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

async function ultimoRegistro() {
  try {
    const res = await fetch(`/api/modulos/${currentModule}/ultima`);
    const data = await res.json();
    mostrarMensaje(
      data.fecha ? `Último registro de ${MODULE_META[currentModule].label}: ${data.fecha}` : `Sin registros en ${MODULE_META[currentModule].label}.`,
      data.fecha ? 'ok' : 'advertencia'
    );
  } catch {
    mostrarMensaje('Error al consultar el último registro.', 'error');
  }
}

function obtenerModulosMarcadosAdmin() {
  const marcados = [...document.querySelectorAll('input[name="enabled_modules"]:checked')]
    .map(el => el.value);
  return marcados.length ? marcados : ['caja'];
}

function actualizarSelectModuloDefault() {
  const select = document.getElementById('admin-default-module');
  const prev = select.value;
  const modulos = obtenerModulosMarcadosAdmin();
  select.innerHTML = '';
  modulos.forEach(modulo => {
    const opt = document.createElement('option');
    opt.value = modulo;
    opt.textContent = MODULE_META[modulo].label;
    select.appendChild(opt);
  });
  select.value = modulos.includes(prev) ? prev : modulos[0];
  actualizarPreviewHojasAdmin();
}

function abrirAdmin() {
  if (configSuperAdminMode) {
    document.getElementById('modal-admin').classList.remove('oculto');
    ingresarAdmin();
    return;
  }
  document.getElementById('admin-pass').value = '';
  document.getElementById('admin-pass-error').classList.add('oculto');
  document.getElementById('admin-login-section').classList.remove('oculto');
  document.getElementById('admin-config-section').classList.add('oculto');
  document.getElementById('modal-admin').classList.remove('oculto');
  setTimeout(() => document.getElementById('admin-pass').focus(), 50);
}

function cerrarAdmin() {
  document.getElementById('modal-admin').classList.add('oculto');
}

async function ingresarAdmin() {
  if (!configSuperAdminMode && document.getElementById('admin-pass').value !== ADMIN_CONTRASENA) {
    document.getElementById('admin-pass-error').classList.remove('oculto');
    return;
  }

  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    document.querySelector(`input[name="modo_entrada"][value="${settings.modo_entrada || 'cantidad'}"]`).checked = true;
    document.querySelectorAll('input[name="enabled_modules"]').forEach(el => {
      el.checked = (settings.enabled_modules || ['caja']).includes(el.value);
    });
    actualizarSelectModuloDefault();
    document.getElementById('admin-default-module').value = settings.default_module || 'caja';
    document.getElementById('admin-sede').value = settings.sede || '';
    document.getElementById('admin-data-dir').value = settings.data_dir || '';
    actualizarPreviewRutaAdmin();
    actualizarPreviewHojasAdmin();
    document.getElementById('admin-super-admin-mode').checked = !!settings.super_admin_mode;
    toggleSedesPanel(!!settings.super_admin_mode);
    document.getElementById('admin-practi-path').value = settings.plataformas_ref_practi_path || '';
    document.getElementById('admin-bet-path').value = settings.plataformas_ref_bet_path || '';
    document.getElementById('admin-backup-enabled').checked = !!settings.backup_enabled;
    document.getElementById('admin-backup-root').value = settings.backup_root || '';
    toggleBackupRootCampo(!!settings.backup_enabled);
  } catch { /* defaults */ }

  // En el build dedicado: ocultar secciones irrelevantes y el toggle de activación
  const esBuildSA = configSuperAdminBuild;
  document.getElementById('admin-section-archivo-anual').classList.toggle('oculto', configSuperAdminMode);
  document.getElementById('admin-section-startup').classList.toggle('oculto', configSuperAdminMode);
  document.getElementById('admin-super-admin-toggle').classList.toggle('oculto', esBuildSA);
  document.getElementById('admin-section-plataformas-ref').classList.toggle('oculto', !configSuperAdminMode);
  document.getElementById('admin-section-backup').classList.toggle('oculto', !configSuperAdminMode);
  if (configSuperAdminMode) cargarBackupStatus();
  // Módulos habilitados no aplica en build SA (siempre todos); catálogos locales tampoco
  document.getElementById('admin-enabled-modules').classList.toggle('oculto', esBuildSA);
  ['admin-cat-bonos', 'admin-cat-gastos', 'admin-cat-prestamos', 'admin-cat-movimientos', 'admin-cat-contadores']
    .forEach(id => document.getElementById(id).classList.toggle('oculto', esBuildSA));

  try {
    await cargarCatalogosAdmin();
  } catch { /* ignore */ }
  if (!configSuperAdminMode) {
    try {
      await cargarStartupAdmin();
    } catch { /* ignore */ }
  }
  try {
    await cargarSedesAdmin();
  } catch { /* ignore */ }

  document.getElementById('admin-login-section').classList.add('oculto');
  document.getElementById('admin-config-section').classList.remove('oculto');
}

async function guardarAdmin() {
  const msg = document.getElementById('admin-config-msg');
  const enabled = obtenerModulosMarcadosAdmin();
  const body = {
    modo_entrada: document.querySelector('input[name="modo_entrada"]:checked')?.value || 'cantidad',
    enabled_modules: enabled,
    default_module: document.getElementById('admin-default-module').value || enabled[0],
    sede: document.getElementById('admin-sede').value.trim(),
    data_dir: document.getElementById('admin-data-dir').value.trim(),
    super_admin_mode: document.getElementById('admin-super-admin-mode')?.checked || false,
    plataformas_ref_practi_path: document.getElementById('admin-practi-path').value.trim(),
    plataformas_ref_bet_path: document.getElementById('admin-bet-path').value.trim(),
    backup_enabled: document.getElementById('admin-backup-enabled')?.checked || false,
    backup_root: document.getElementById('admin-backup-root')?.value.trim() || '',
  };

  try {
    const settingsRes = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const settingsData = await settingsRes.json();
    configActiveSite = settingsData.active_site || null;
    await fetch('/api/modulos/catalogos/bonos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: parseCatalogoTextarea('admin-bonos-catalogo') }),
    });
    await fetch('/api/modulos/catalogos/gastos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: parseCatalogoTextarea('admin-gastos-catalogo') }),
    });
    await fetch('/api/modulos/catalogos/prestamos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: parseCatalogoTextarea('admin-prestamos-catalogo') }),
    });
    await fetch('/api/modulos/catalogos/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: parseCatalogoTextarea('admin-movimientos-catalogo') }),
    });
    await fetch('/api/modulos/catalogos/contadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: parseContadoresCatalogoGrid() }),
    });
    const itemsAgregados = sincronizarReferenciasCatalogo();
    if (!body.super_admin_mode) {
      await fetch('/api/settings/startup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: document.getElementById('admin-startup-enabled')?.checked || false,
          fecha_inicio: document.getElementById('admin-startup-date')?.value || '',
          caja_inicial: parseNumeroTexto(document.getElementById('admin-startup-cash')?.value || '') || 0,
          contadores: parseStartupContadoresGrid(),
        }),
      });
    }
    configModoEntrada = body.modo_entrada;
    enabledModules = body.enabled_modules;
    defaultModule = body.default_module;
    configSede = body.sede || 'Principal';
    configDataDir = body.data_dir;
    configSuperAdminMode = !!body.super_admin_mode;
    renderSuperAdminSedeBanner();
    await cargarBonusNames();
    await cargarLoanNames();
    await cargarExpenseConcepts();
    await cargarMovementConcepts();
    await cargarContadoresCatalogo();

    enabledModules.forEach(modulo => {
      if (!moduleDates[modulo]) moduleDates[modulo] = sugerirFechaModulo(modulo);
    });
    _persistirFechasModulo();
    currentModule = enabledModules.includes(currentModule) ? currentModule : defaultModule;
    renderTabs();
    actualizarPaneles();
    aplicarModoEntrada();
    aplicarFechaModulo(currentModule);
    await cargarVistaModulo(currentModule, moduleDates[currentModule]);
    await verificarFechaActual();

    msg.textContent = `Configuración guardada. Módulo por defecto: ${MODULE_META[defaultModule].label}.`
      + (itemsAgregados > 0 ? ` Se agregaron ${itemsAgregados} ítem(s) nuevo(s) a Referencias iniciales con valores en 0.` : '');
    msg.className = 'config-msg ok';
    msg.classList.remove('oculto');
    setTimeout(() => msg.classList.add('oculto'), 2500);
  } catch {
    msg.textContent = 'Error al guardar.';
    msg.className = 'config-msg error';
    msg.classList.remove('oculto');
  }
}

async function buscarCarpetaDatos() {
  const msg = document.getElementById('admin-config-msg');
  try {
    const res = await fetch('/api/settings/browse-directory', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) return;
    document.getElementById('admin-data-dir').value = data.data_dir || '';
    actualizarPreviewRutaAdmin();
  } catch {
    msg.textContent = 'No se pudo abrir el selector de carpetas.';
    msg.className = 'config-msg error';
    msg.classList.remove('oculto');
  }
}

async function buscarCarpetaPracti() {
  try {
    const res = await fetch('/api/settings/browse-directory', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) return;
    document.getElementById('admin-practi-path').value = data.data_dir || '';
  } catch { /* ignore */ }
}

async function buscarCarpetaBet() {
  try {
    const res = await fetch('/api/settings/browse-directory', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) return;
    document.getElementById('admin-bet-path').value = data.data_dir || '';
  } catch { /* ignore */ }
}

// ── Super Admin — Sedes remotas ───────────────────────────────────────────────

function renderSuperAdminSedeBanner() {
  const banner = document.getElementById('super-admin-sede-banner');
  if (!banner) return;
  if (!configSuperAdminMode) {
    banner.classList.add('oculto');
    document.body.classList.remove('super-admin-active');
    document.title = 'ContabilidadJDW';
    return;
  }
  banner.classList.remove('oculto');
  document.body.classList.add('super-admin-active');
  document.title = '⚙ SUPER ADMIN — ContabilidadJDW';
  const sel = document.getElementById('super-admin-sede-select');
  const pathEl = document.getElementById('super-admin-sede-path');
  sel.innerHTML = '';
  if (!configRemoteSites.length) {
    sel.innerHTML = '<option value="">Sin sedes configuradas</option>';
    pathEl.textContent = '';
    return;
  }
  configRemoteSites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site.id;
    opt.textContent = site.label;
    if (configActiveSite && site.id === configActiveSite.id) opt.selected = true;
    sel.appendChild(opt);
  });
  pathEl.textContent = configActiveSite ? configActiveSite.data_dir : '';
}

async function cambiarSedeActiva(siteId) {
  try {
    const res = await fetch('/api/settings/active-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId }),
    });
    const data = await res.json();
    if (!data.ok) { mostrarMensaje(data.mensaje || 'No se pudo cambiar la sede.', 'error'); return; }
    configActiveSite = data.active_site;
    const pathEl = document.getElementById('super-admin-sede-path');
    if (pathEl) pathEl.textContent = configActiveSite ? configActiveSite.data_dir : '';
    actualizarBotonAbrirXlsx();
    // Limpiar borradores para que no se inyecten datos de la sede anterior
    cajaDrafts = {};
    contadoresDrafts = {};
    try { sessionStorage.removeItem('cajaDrafts'); } catch {}
    try { sessionStorage.removeItem('contadoresDrafts'); } catch {}
    await cargarVistaModulo(currentModule, moduleDates[currentModule]);
    await verificarFechaActual();
    mostrarMensaje(`Sede activa: ${configActiveSite?.label || siteId}`, 'ok');
  } catch {
    mostrarMensaje('Error al cambiar de sede.', 'error');
  }
}

function toggleSedesPanel(visible) {
  const panel = document.getElementById('admin-sedes-panel');
  if (panel) panel.classList.toggle('oculto', !visible);
}

function toggleBackupRootCampo(visible) {
  document.getElementById('admin-backup-root-campo')?.classList.toggle('oculto', !visible);
}

async function validarRutaBackup() {
  const ruta = document.getElementById('admin-backup-root').value.trim();
  const msg = document.getElementById('admin-backup-validate-msg');
  msg.classList.remove('oculto');
  msg.textContent = 'Verificando…';
  try {
    const res = await fetch('/api/backup/validate-root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruta }),
    });
    const data = await res.json();
    msg.textContent = data.mensaje || (data.ok ? 'Carpeta válida.' : 'Error al verificar.');
    msg.className = `modal-desc ${data.ok ? '' : 'config-msg error'}`;
    msg.classList.remove('oculto');
  } catch {
    msg.textContent = 'No se pudo verificar la carpeta.';
    msg.classList.remove('oculto');
  }
}

async function ejecutarBackupAhora() {
  const btn = document.getElementById('btn-admin-backup-now');
  btn.disabled = true;
  btn.textContent = 'Respaldando…';
  try {
    const res = await fetch('/api/backup/run-now', { method: 'POST' });
    const data = await res.json();
    mostrarMensajeAdmin(data.resumen || data.mensaje || 'Respaldo completado.', data.ok ? 'ok' : 'error');
    if (data.ok) cargarBackupStatus();
  } catch {
    mostrarMensajeAdmin('No se pudo ejecutar el respaldo.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Respaldar ahora';
  }
}

async function cargarBackupStatus() {
  try {
    const res = await fetch('/api/backup/status');
    const data = await res.json();
    const contenedor = document.getElementById('admin-backup-status');
    const log = document.getElementById('admin-backup-log');
    if (!data.log?.length) {
      contenedor.classList.add('oculto');
      return;
    }
    contenedor.classList.remove('oculto');
    const ultima = data.log[0];
    log.innerHTML = (ultima.resultados || []).map(r => {
      const icono = r.omitido ? '⊙' : r.valido ? '✓' : '✗';
      const clase = r.valido ? 'backup-ok' : 'backup-fallo';
      return `<span class="backup-sede-estado ${clase}">${icono} ${r.sede}: ${r.mensaje}</span>`;
    }).join('');
  } catch { /* no mostrar error */ }
}

async function cargarSedesAdmin() {
  const res = await fetch('/api/settings/remote-sites');
  const data = await res.json();
  configRemoteSites = data.sites || [];
  renderSedesAdminTable();
}

function renderSedesAdminTable() {
  const tbody = document.getElementById('admin-sedes-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!configRemoteSites.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="bonos-vacio">Sin sedes configuradas.</td></tr>';
    return;
  }
  configRemoteSites.forEach(site => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${site.label}</td>
      <td>${site.sede}</td>
      <td class="admin-sede-dir-cell" title="${site.data_dir}">${site.data_dir}</td>
      <td class="admin-grid-acciones">
        <button class="btn btn-secondary btn-xs" data-action="edit-site" data-id="${site.id}">Editar</button>
        <button class="btn btn-secondary btn-xs btn-danger-subtle" data-action="delete-site" data-id="${site.id}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function abrirFormularioSede(site = null) {
  const form = document.getElementById('admin-sede-form');
  form.classList.remove('oculto');
  document.querySelector('.admin-sede-form-titulo').textContent = site ? 'Editar sede' : 'Nueva sede';
  document.getElementById('admin-sede-form-id').value = site?.id || '';
  document.getElementById('admin-sede-form-label').value = site?.label || '';
  document.getElementById('admin-sede-form-sede').value = site?.sede || '';
  document.getElementById('admin-sede-form-dir').value = site?.data_dir || '';
  document.getElementById('admin-sede-form-practi-header').value = site?.plataformas_ref?.practi_header || '';
  document.getElementById('admin-sede-form-bet-header').value = site?.plataformas_ref?.bet_header || '';
  actualizarPreviewSedeForm();
  document.getElementById('admin-sede-form-validate-msg').classList.add('oculto');
  document.getElementById('admin-sede-form-label').focus();
}

function cerrarFormularioSede() {
  document.getElementById('admin-sede-form').classList.add('oculto');
}

function actualizarPreviewSedeForm() {
  const sede = document.getElementById('admin-sede-form-sede').value.trim() || 'Sede';
  const year = new Date().getFullYear();
  const preview = document.getElementById('admin-sede-form-preview');
  if (preview) preview.textContent = `Contadores_${sede}_${year}.xlsx`;
}

async function guardarSedeForm() {
  const id = document.getElementById('admin-sede-form-id').value.trim();
  const label = document.getElementById('admin-sede-form-label').value.trim();
  const sede = document.getElementById('admin-sede-form-sede').value.trim();
  const data_dir = document.getElementById('admin-sede-form-dir').value.trim();
  if (!label || !data_dir) {
    mostrarMensajeAdmin('El nombre y la carpeta son obligatorios.', 'error');
    return;
  }
  const practi_header = document.getElementById('admin-sede-form-practi-header').value.trim();
  const bet_header = document.getElementById('admin-sede-form-bet-header').value.trim();
  const sitesActualizados = configRemoteSites.filter(s => s.id !== id);
  sitesActualizados.push({
    id: id || undefined,
    label,
    sede: sede || label,
    data_dir,
    plataformas_ref: { practi_header, bet_header },
  });
  try {
    const res = await fetch('/api/settings/remote-sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sites: sitesActualizados }),
    });
    const data = await res.json();
    configRemoteSites = data.sites || [];
    configActiveSite = data.active_site || null;
    renderSedesAdminTable();
    renderSuperAdminSedeBanner();
    cerrarFormularioSede();
    mostrarMensajeAdmin('Sede guardada.', 'ok');
  } catch {
    mostrarMensajeAdmin('Error al guardar la sede.', 'error');
  }
}

async function eliminarSede(siteId) {
  if (!confirm('¿Eliminar esta sede?')) return;
  const sitesActualizados = configRemoteSites.filter(s => s.id !== siteId);
  try {
    const res = await fetch('/api/settings/remote-sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sites: sitesActualizados }),
    });
    const data = await res.json();
    configRemoteSites = data.sites || [];
    configActiveSite = data.active_site || null;
    renderSedesAdminTable();
    renderSuperAdminSedeBanner();
  } catch {
    mostrarMensajeAdmin('Error al eliminar la sede.', 'error');
  }
}

async function validarRutaSedeForm() {
  const data_dir = document.getElementById('admin-sede-form-dir').value.trim();
  const msgEl = document.getElementById('admin-sede-form-validate-msg');
  if (!data_dir) { msgEl.textContent = 'Ingresa una carpeta primero.'; msgEl.className = 'modal-desc error-text'; msgEl.classList.remove('oculto'); return; }
  try {
    const res = await fetch('/api/settings/remote-sites/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_dir }),
    });
    const data = await res.json();
    if (data.ok) {
      // Auto-rellenar sede y etiqueta desde el nombre del xlsx detectado
      if (data.sede_detectada) {
        const sedeField = document.getElementById('admin-sede-form-sede');
        const labelField = document.getElementById('admin-sede-form-label');
        if (!sedeField.value.trim()) sedeField.value = data.sede_detectada;
        if (!labelField.value.trim()) labelField.value = data.sede_detectada;
        actualizarPreviewSedeForm();
      }
      const sedeMsg = data.sede_detectada ? ` Sede detectada: "${data.sede_detectada}".` : ' No se detectó sede en los archivos.';
      msgEl.textContent = `✓ Carpeta accesible.${sedeMsg} ${data.archivos_encontrados} archivo(s) Excel encontrado(s).`;
      msgEl.className = 'modal-desc ok-text';
    } else {
      msgEl.textContent = `✗ ${data.mensaje}`;
      msgEl.className = 'modal-desc error-text';
    }
    msgEl.classList.remove('oculto');
  } catch {
    msgEl.textContent = 'Error al verificar la carpeta.';
    msgEl.className = 'modal-desc error-text';
    msgEl.classList.remove('oculto');
  }
}

async function browseCarpetaSedeForm() {
  try {
    const res = await fetch('/api/settings/remote-sites/browse', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) return;
    document.getElementById('admin-sede-form-dir').value = data.data_dir || '';
    actualizarPreviewSedeForm();
    // Auto-detectar sede desde los xlsx de la carpeta seleccionada
    await validarRutaSedeForm();
  } catch { /* ignore */ }
}

function mostrarMensajeAdmin(texto, tipo) {
  const msg = document.getElementById('admin-config-msg');
  msg.textContent = texto;
  msg.className = `config-msg ${tipo}`;
  msg.classList.remove('oculto');
  setTimeout(() => msg.classList.add('oculto'), 3000);
}

async function cerrarAplicacion() {
  const modulosPendientes = obtenerModulosConCambiosSinGuardar();
  const mensaje = modulosPendientes.length
    ? `Tienes datos sin guardar en ${modulosPendientes.join(' y ')}.\n\n¿Cerrar sin guardar?`
    : 'La capturadora se cerrará en este equipo. ¿Desea finalizar ahora?';
  if (!window.confirm(mensaje)) return;

  _cerrando = true;
  try {
    await fetch('/api/app/shutdown', { method: 'POST' });
    mostrarMensaje('La aplicación se está cerrando...', 'ok');
    setTimeout(() => window.close(), 300);
  } catch {
    _cerrando = false;
    mostrarMensaje('No se pudo cerrar la aplicación desde la interfaz.', 'error');
  }
}

async function init() {
  buildTablaBilletes();
  desactivarSugerenciasFormulario();
  observarNuevosCamposFormulario();
  configurarCajaSinAutocompletar();
  await cargarBonusNames();
  await cargarLoanNames();
  await cargarExpenseConcepts();
  await cargarMovementConcepts();
  await cargarContadoresCatalogo();

  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    configModoEntrada = settings.modo_entrada || 'cantidad';
    configSede = settings.sede || 'Principal';
    configDataDir = settings.data_dir || '';
    enabledModules = settings.enabled_modules || ['caja', 'gastos'];
    defaultModule = settings.default_module || enabledModules[0];
    configSuperAdminMode = !!settings.super_admin_mode;
    configSuperAdminBuild = !!settings.is_super_admin_build;
    configRemoteSites = settings.remote_sites || [];
    configActiveSite = settings.active_site || null;
  } catch { /* defaults */ }
  renderSuperAdminSedeBanner();

  let _savedDates = null;
  try { _savedDates = JSON.parse(sessionStorage.getItem('moduleDates') || 'null'); } catch {}
  const _isReload = !!_savedDates;
  const savedSharedDate = _savedDates && typeof _savedDates === 'object'
    ? (
      _savedDates.caja
      || _savedDates.plataformas
      || _savedDates.gastos
      || _savedDates.bonos
      || _savedDates.prestamos
      || _savedDates.movimientos
      || _savedDates.contadores
      || _savedDates.cuadre
      || hoyStr()
    )
    : hoyStr();
  moduleDates = {};
  setSharedModuleDate(savedSharedDate);
  if (_isReload) {
    try { cajaDrafts = JSON.parse(sessionStorage.getItem('cajaDrafts') || '{}'); } catch { cajaDrafts = {}; }
    try { contadoresDrafts = JSON.parse(sessionStorage.getItem('contadoresDrafts') || '{}'); } catch { contadoresDrafts = {}; }
  }
  const _savedModule = sessionStorage.getItem('lastModule');
  currentModule = (_savedModule && enabledModules.includes(_savedModule))
    ? _savedModule
    : (enabledModules.includes(defaultModule) ? defaultModule : enabledModules[0]);

  aplicarModoEntrada();
  renderTabs();
  actualizarPaneles();
  aplicarFechaModulo(currentModule);
  actualizarBonosVisuales();
  actualizarPrestamosVisuales();
  actualizarMovimientosVisuales();
  await cargarVistaModulo(currentModule, moduleDates[currentModule]);
  await verificarFechaActual();

  document.querySelectorAll('.input-billete').forEach(inp => {
    formatearInputNumerico(inp, false, true);
    inp.addEventListener('input', calcularCaja);
    inp.addEventListener('input', () => formatearInputNumerico(inp, false, true));
    inp.addEventListener('focus', () => limpiarFormatoInputNumerico(inp));
    inp.addEventListener('blur', () => formatearInputNumerico(inp, false, true));
    inp.addEventListener('input', () => guardarDraftCaja());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !inp.readOnly) {
        e.preventDefault();
        moverAlSiguiente(inp);
      }
    });
  });

  ['total_monedas', 'billetes_viejos'].forEach(id => {
    const el = document.getElementById(id);
    formatearInputNumerico(el, false);
    el.addEventListener('input', calcularCaja);
    el.addEventListener('input', () => formatearInputNumerico(el, false));
    el.addEventListener('focus', () => limpiarFormatoInputNumerico(el, false));
    el.addEventListener('blur', () => formatearInputNumerico(el, false));
    el.addEventListener('input', () => guardarDraftCaja());
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        moverAlSiguiente(el);
      }
    });
  });

  const startupCashInput = document.getElementById('admin-startup-cash');
  if (startupCashInput) {
    formatearInputNumerico(startupCashInput, false, true);
    startupCashInput.addEventListener('focus', () => limpiarFormatoInputNumerico(startupCashInput, false));
    startupCashInput.addEventListener('blur', () => formatearInputNumerico(startupCashInput, false, true));
    startupCashInput.addEventListener('input', () => formatearInputNumerico(startupCashInput, false, true));
  }

  let _refCompareTimer = null;
  ['venta_practisistemas', 'venta_deportivas'].forEach(id => {
    const el = document.getElementById(id);
    const allowNegative = id === 'venta_deportivas';
    formatearInputNumerico(el, allowNegative);
    el.addEventListener('input', calcularPlataformas);
    el.addEventListener('input', () => {
      formatearInputNumerico(el, allowNegative);
      if (configSuperAdminMode && configActiveSite) {
        clearTimeout(_refCompareTimer);
        _refCompareTimer = setTimeout(() => {
          const fecha = moduleDates['plataformas'] || moduleDates[currentModule];
          if (fecha) cargarReferenciasPlataformas(fecha);
        }, 600);
      }
    });
    el.addEventListener('focus', () => limpiarFormatoInputNumerico(el, allowNegative));
    el.addEventListener('blur', () => formatearInputNumerico(el, allowNegative));
  });

  document.getElementById('fecha').addEventListener('change', e => {
    const fechaAnterior = moduleDates[currentModule];
    if (currentModule === 'caja') guardarDraftCaja(fechaAnterior);
    if (currentModule === 'contadores') guardarDraftContadores(fechaAnterior);
    setSharedModuleDate(e.target.value);
    actualizarDiaFecha(e.target.value);
    if (currentModule !== 'caja') resetOverride(currentModule);
    if (currentModule === 'caja') resetOverride('caja');
    if (currentModule === 'bonos') {
      limpiarFormularioBonos();
      actualizarBonosVisuales();
    } else if (currentModule === 'plataformas') {
      limpiarPlataformas();
      calcularPlataformas();
    } else if (currentModule === 'prestamos') {
      limpiarFormularioPrestamos();
      actualizarPrestamosVisuales();
    } else if (currentModule === 'movimientos') {
      limpiarFormularioMovimientos();
      actualizarMovimientosVisuales();
    } else if (currentModule === 'gastos') {
      limpiarFormularioGastos();
    } else if (currentModule === 'contadores') {
      resetOverride('contadores');
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      await cargarVistaModulo(currentModule, e.target.value);
      await verificarFechaActual();
    }, 250);
  });

  document.getElementById('btn-guardar').addEventListener('click', guardar);
  document.getElementById('btn-limpiar').addEventListener('click', limpiarModuloActual);
  document.getElementById('btn-ultima').addEventListener('click', ultimoRegistro);
  document.getElementById('btn-finalizar').addEventListener('click', cerrarAplicacion);
  document.getElementById('btn-abrir-xlsx').addEventListener('click', abrirXlsxModuloActual);
  document.getElementById('btn-fecha-anterior')?.addEventListener('click', () => cambiarFechaPorDelta(-1));
  document.getElementById('btn-fecha-siguiente')?.addEventListener('click', () => cambiarFechaPorDelta(1));
  document.getElementById('btn-cancelar-edicion').addEventListener('click', async () => {
    resetOverride(currentModule);
    aplicarFechaModulo(currentModule);
    if (currentModule === 'bonos') limpiarFormularioBonos();
    if (currentModule === 'prestamos') limpiarFormularioPrestamos();
    if (currentModule === 'movimientos') limpiarFormularioMovimientos();
    await cargarVistaModulo(currentModule, moduleDates[currentModule]);
    await verificarFechaActual();
  });

  document.getElementById('btn-ir-cuadre').addEventListener('click', () => activarModulo('cuadre'));
  document.getElementById('btn-admin').addEventListener('click', abrirAdmin);
  document.getElementById('btn-admin-cancelar').addEventListener('click', cerrarAdmin);
  document.getElementById('btn-admin-cerrar').addEventListener('click', cerrarAdmin);
  document.getElementById('btn-admin-ingresar').addEventListener('click', ingresarAdmin);
  document.getElementById('btn-admin-guardar').addEventListener('click', guardarAdmin);
  document.getElementById('btn-admin-buscar-carpeta').addEventListener('click', buscarCarpetaDatos);
  document.getElementById('btn-admin-practi-browse').addEventListener('click', buscarCarpetaPracti);
  document.getElementById('btn-admin-bet-browse').addEventListener('click', buscarCarpetaBet);
  document.getElementById('btn-admin-contadores-add').addEventListener('click', () => {
    const body = document.getElementById('admin-contadores-grid-body');
    const fila = _crearFilaCatalogoContadores();
    body.appendChild(fila);
    fila.querySelector('[data-field="item_id"]')?.focus();
  });
  document.getElementById('btn-admin-importar-bonos').addEventListener('click', importarNombresBonos);

  // Super admin — sedes remotas
  document.getElementById('admin-super-admin-mode').addEventListener('change', e => toggleSedesPanel(e.target.checked));
  document.getElementById('admin-backup-enabled').addEventListener('change', e => toggleBackupRootCampo(e.target.checked));
  document.getElementById('btn-admin-backup-browse').addEventListener('click', async () => {
    const res = await fetch('/api/settings/browse-directory', { method: 'POST' });
    const data = await res.json();
    if (data.ok) document.getElementById('admin-backup-root').value = data.data_dir;
  });
  document.getElementById('btn-admin-backup-validate').addEventListener('click', validarRutaBackup);
  document.getElementById('btn-admin-backup-now').addEventListener('click', ejecutarBackupAhora);
  document.getElementById('btn-admin-sedes-add').addEventListener('click', () => abrirFormularioSede());
  document.getElementById('btn-admin-sede-form-save').addEventListener('click', guardarSedeForm);
  document.getElementById('btn-admin-sede-form-cancel').addEventListener('click', cerrarFormularioSede);
  document.getElementById('btn-admin-sede-form-browse').addEventListener('click', browseCarpetaSedeForm);
  document.getElementById('btn-admin-sede-form-validate').addEventListener('click', validarRutaSedeForm);
  document.getElementById('admin-sede-form-sede').addEventListener('input', actualizarPreviewSedeForm);
  document.getElementById('admin-sedes-body').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-site') {
      const site = configRemoteSites.find(s => s.id === id);
      if (site) abrirFormularioSede(site);
    } else if (btn.dataset.action === 'delete-site') {
      eliminarSede(id);
    }
  });
  document.getElementById('super-admin-sede-select').addEventListener('change', e => cambiarSedeActiva(e.target.value));

  document.getElementById('admin-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') ingresarAdmin();
  });
  document.getElementById('admin-data-dir').addEventListener('input', actualizarPreviewRutaAdmin);
  document.getElementById('admin-sede').addEventListener('input', () => {
    actualizarPreviewHojasAdmin();
    actualizarPreviewRutaAdmin();
  });
  document.querySelectorAll('input[name="enabled_modules"]').forEach(el => {
    el.addEventListener('change', actualizarSelectModuloDefault);
  });

  document.getElementById('btn-auth-card-ok').addEventListener('click', confirmarAccionAdmin);
  document.getElementById('btn-auth-card-cancel').addEventListener('click', cerrarModalEditar);
  document.getElementById('auth-card-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmarAccionAdmin();
  });

  document.getElementById('btn-bono-registrar').addEventListener('click', registrarBono);
  document.getElementById('btn-prestamo-registrar').addEventListener('click', registrarPrestamo);
  document.getElementById('btn-gasto-registrar').addEventListener('click', registrarGasto);
  document.getElementById('btn-movimiento-registrar').addEventListener('click', registrarMovimiento);
  document.getElementById('btn-cuadre-guardar').addEventListener('click', guardarCuadre);
  const cuadreBaseInput = document.getElementById('cuadre-base-input');
  cuadreBaseInput.addEventListener('input', () => formatearInputNumerico(cuadreBaseInput, false));
  cuadreBaseInput.addEventListener('focus', () => limpiarFormatoInputNumerico(cuadreBaseInput, false));
  cuadreBaseInput.addEventListener('blur', () => formatearInputNumerico(cuadreBaseInput, false));
  document.addEventListener('click', e => {
    const actionBtn = e.target.closest('.btn-tabla-accion');
    if (!actionBtn) return;
    const { modulo, ts } = actionBtn.dataset;
    if (!modulo || !ts) return;
    if (actionBtn.classList.contains('btn-tabla-editar')) {
      editarRegistroPorTs(modulo, ts);
      return;
    }
    if (actionBtn.classList.contains('btn-tabla-eliminar')) {
      eliminarRegistroPorTs(modulo, ts);
    }
  });
  window.addEventListener('beforeunload', e => {
    if (_cerrando) return;
    if (!obtenerModulosConCambiosSinGuardar().length) return;
    e.preventDefault();
    e.returnValue = ''; // requerido por Chromium para mostrar el diálogo nativo
  });
  document.getElementById('panel-cuadre').addEventListener('click', e => {
    const header = e.target.closest('.cuadre-seccion-header[data-goto]');
    if (!header) return;
    activarModulo(header.dataset.goto);
  });
  document.getElementById('contadores-body').addEventListener('click', e => {
    if (e.target.matches('.btn-confirmar-critica')) {
      confirmarReferenciaCritica(e.target.closest('tr'));
    }
    if (e.target.matches('.btn-toggle-pausa')) {
      togglePausaContador(e.target);
    }
  });
  // Al expandir el panel de crítica en una fila ya guardada con override de admin:
  // marcar como no-guardada para que la autorización / re-autorización fluya igual que en una entrada nueva.
  document.getElementById('contadores-body').addEventListener('toggle', e => {
    if (!e.target.matches('.contador-critica-detalle')) return;
    if (!e.target.open) return;
    const row = e.target.closest('tr');
    if (row && row.dataset.guardado === '1' && isOverrideActive('contadores')) {
      row.dataset.guardado = '0';
      recalcularFilaContador(row);
    }
  }, true);
  document.getElementById('contadores-body').addEventListener('input', e => {
    if (e.target.matches('.contador-campo, .contador-critica input')) {
      manejarEventoContadores(e.target);
    }
  });
  document.getElementById('contadores-body').addEventListener('change', e => {
    if (e.target.matches('.contador-campo, .contador-critica input, .contador-critica-check')) {
      manejarEventoContadores(e.target);
    }
  });
  document.getElementById('contadores-body').addEventListener('blur', e => {
    if (e.target.matches('.contador-campo')) {
      formatearInputNumerico(e.target, false, false);
      manejarEventoContadores(e.target);
    }
  }, true);
  document.getElementById('contadores-body').addEventListener('keydown', e => {
    const ROLES_CRITICA = ['critica-entradas', 'critica-salidas', 'critica-jackpot', 'critica-pre-reset'];

    // Enter sobre el botón OK de referencia crítica → confirmar
    if (e.key === 'Enter' && e.target.matches('.btn-confirmar-critica')) {
      e.preventDefault();
      confirmarReferenciaCritica(e.target.closest('tr'));
      return;
    }

    // Tab / Enter dentro del sub-módulo de referencia crítica
    if ((e.key === 'Tab' || e.key === 'Enter') && ROLES_CRITICA.includes(e.target.dataset.role)) {
      e.preventDefault();
      const row = e.target.closest('tr');
      const critica = row?.querySelector('.contador-critica');
      if (!critica) return;
      const orden = ROLES_CRITICA
        .map(r => critica.querySelector(`[data-role="${r}"]`))
        .filter(Boolean);
      const idx = orden.indexOf(e.target);
      if (idx !== -1 && idx < orden.length - 1) {
        orden[idx + 1].focus();
        orden[idx + 1].select?.();
      } else {
        // Último campo + Tab/Enter → botón Confirmar
        row.querySelector('.btn-confirmar-critica')?.focus();
      }
      return;
    }

    // Tab / Enter en campos principales (entradas, salidas, jackpot)
    if ((e.key === 'Enter' || e.key === 'Tab') && e.target.matches('.contador-campo')) {
      e.preventDefault();
      moverSiguienteCampoContador(e.target);
      manejarEventoContadores(e.target);
    }
  });
  ['bono-valor', 'gasto-valor', 'prestamo-valor', 'movimiento-valor'].forEach(id => {
    const el = document.getElementById(id);
    formatearInputNumerico(el);
    el.addEventListener('input', () => formatearInputNumerico(el));
    el.addEventListener('focus', () => limpiarFormatoInputNumerico(el));
    el.addEventListener('blur', () => formatearInputNumerico(el));
  });
  document.getElementById('bono-cliente').addEventListener('input', actualizarAcumuladoBonoCliente);
  document.getElementById('prestamo-persona').addEventListener('input', actualizarResumenPersonaPrestamo);
  document.getElementById('gasto-concepto').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      autocompletarConceptoGasto();
      document.getElementById('gasto-valor').focus();
      document.getElementById('gasto-valor').select();
    }
  });
  document.getElementById('venta_practisistemas').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const siguiente = document.getElementById('venta_deportivas');
      if (siguiente) {
        if (e.key === 'Enter') {
          setTimeout(() => {
            siguiente.focus();
            if (typeof siguiente.select === 'function') siguiente.select();
          }, 0);
        } else {
          siguiente.focus();
          if (typeof siguiente.select === 'function') siguiente.select();
        }
      }
    }
  }, true);
  document.getElementById('venta_deportivas').addEventListener('keydown', e => {
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const guardarBtn = document.getElementById('btn-guardar');
      if (guardarBtn) guardarBtn.focus();
    }
  }, true);
  document.getElementById('gasto-valor').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-gasto-registrar').focus();
    }
  });
  document.getElementById('bono-cliente').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      autocompletarClienteBono();
      document.getElementById('bono-valor').focus();
      document.getElementById('bono-valor').select();
    }
  });
  document.getElementById('prestamo-persona').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      autocompletarPersonaPrestamo();
      actualizarResumenPersonaPrestamo();
      document.getElementById('prestamo-valor').focus();
      document.getElementById('prestamo-valor').select();
    }
  });
  document.getElementById('movimiento-concepto').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      autocompletarConceptoMovimiento();
      document.getElementById('movimiento-valor').focus();
      document.getElementById('movimiento-valor').select();
    }
  });
  document.getElementById('bono-valor').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-bono-registrar').focus();
    }
  });
  document.getElementById('prestamo-valor').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-prestamo-registrar').focus();
    }
  });
  document.getElementById('movimiento-valor').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-movimiento-registrar').focus();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('btn-movimiento-registrar').focus();
    }
  });
  document.querySelectorAll('input[name="prestamo-tipo"]').forEach(el => {
    el.addEventListener('change', actualizarResumenPersonaPrestamo);
  });
  setInterval(() => {
    actualizarBonosVisuales();
    actualizarPrestamosVisuales();
    actualizarMovimientosVisuales();
  }, 30000);

  document.getElementById('modal-admin').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarAdmin();
  });
  window.addEventListener('resize', posicionarTarjetaAuth);
  window.addEventListener('scroll', posicionarTarjetaAuth, true);
  const interceptarIntentoEdicion = e => {
    const control = e.target?.closest?.('input, textarea, select, button, summary');
    if (!control || !esControlEdicionActual(control)) return;
    if (e.type === 'focusin' && control.matches('button, summary')) return;
    bloquearIntentoEdicion(control, e);
  };
  document.addEventListener('pointerdown', interceptarIntentoEdicion, true);
  document.addEventListener('focusin', interceptarIntentoEdicion, true);
  document.addEventListener('click', interceptarIntentoEdicion, true);

  // Heartbeat: mantiene el servidor informado de que hay una pestaña activa.
  // Si el servidor no recibe heartbeat en ~75 s, se apaga automáticamente.
  function enviarHeartbeat() {
    navigator.sendBeacon('/api/app/heartbeat');
  }
  enviarHeartbeat();
  setInterval(enviarHeartbeat, 30000);
}

// ─── CUADRE ──────────────────────────────────────────────────────────────────

async function cargarDatosCuadre(fecha) {
  const contenido = document.getElementById('cuadre-contenido');
  const bloqueado = document.getElementById('cuadre-bloqueado');
  contenido.classList.add('oculto');
  bloqueado.classList.add('oculto');
  cuadreDatos = null;

  try {
    const estadoRes = await fetch(`/api/modulos/cuadre/fecha/${fecha}/estado`);
    const estado = await estadoRes.json();

    // Ya guardado y sin override → vista de solo lectura
    if (estado.existe && !isOverrideActive('cuadre', fecha)) {
      const [datosRes, calcRes] = await Promise.all([
        fetch(`/api/modulos/cuadre/fecha/${fecha}/datos`),
        fetch(`/api/modulos/cuadre/calcular/${fecha}`),
      ]);
      if (datosRes.ok) {
        const guardado = await datosRes.json();
        const calculado = calcRes.ok ? await calcRes.json() : null;
        renderCuadreGuardado(guardado, fecha, calculado);
        contenido.classList.remove('oculto');
        document.getElementById('btn-cuadre-guardar').disabled = true;
        return;
      }
    }

    const calcRes = await fetch(`/api/modulos/cuadre/calcular/${fecha}`);
    if (!calcRes.ok) {
      document.getElementById('cuadre-bloqueado-msg').textContent = 'Error al calcular el cuadre.';
      bloqueado.classList.remove('oculto');
      return;
    }
    const datos = await calcRes.json();

    // Siempre renderizar lo que haya — puede ser vista parcial sin caja/contadores.
    cuadreDatos = datos.puede_guardar ? { ...datos, fecha } : null;
    renderCuadre(datos);
    contenido.classList.remove('oculto');
    document.getElementById('btn-cuadre-guardar').disabled = !datos.puede_guardar;
  } catch {
    document.getElementById('cuadre-bloqueado-msg').textContent = 'Error al cargar los datos del cuadre.';
    bloqueado.classList.remove('oculto');
  }
}

function renderCuadre(datos) {
  // Período
  const periodo = datos.periodo || [];
  const diasAcum = datos.dias_acumulados || [];
  let txtPeriodo;
  if (periodo.length > 1) {
    const extra = diasAcum.length
      ? ` — incluye ${diasAcum.length} día${diasAcum.length > 1 ? 's' : ''} acumulado${diasAcum.length > 1 ? 's' : ''}`
      : '';
    txtPeriodo = `Período: ${formatFechaVisual(periodo[0])} → ${formatFechaVisual(periodo[periodo.length - 1])} (${periodo.length} días${extra})`;
  } else if (periodo.length === 1) {
    txtPeriodo = `Fecha: ${formatFechaVisual(periodo[0])}`;
  } else {
    txtPeriodo = 'Sin días en el período';
  }
  document.getElementById('cuadre-periodo-texto').textContent = txtPeriodo;

  // Aviso días acumulados (informativo)
  const avisoAcum = document.getElementById('cuadre-aviso-acumulados');
  avisoAcum.textContent = datos.mensaje_info || '';
  avisoAcum.classList.toggle('oculto', !datos.mensaje_info);

  // Aviso inconsistencias (bloqueante)
  const avisoIncons = document.getElementById('cuadre-aviso-inconsistencias');
  avisoIncons.textContent = datos.mensaje_error || '';
  avisoIncons.classList.toggle('oculto', !datos.mensaje_error);

  // Base anterior
  const tieneBase = datos.tiene_base_anterior;
  document.getElementById('cuadre-base-display').textContent = tieneBase ? fmt(datos.base_anterior) : '';
  document.getElementById('cuadre-base-display').classList.toggle('oculto', !tieneBase);
  const inputWrap = document.getElementById('cuadre-base-input-wrap');
  inputWrap.classList.toggle('oculto', tieneBase);
  if (!tieneBase) {
    setNumeroInputValue('cuadre-base-input', '');
  }

  // Contadores
  const contBody = document.getElementById('cuadre-contadores-body');
  contBody.innerHTML = '';
  const contItems = datos.contadores?.items || [];
  contItems.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx + 1}</td><td>${item.nombre}</td><td>${item.yield_actual}</td><td>${fmt(item.resultado)}</td>`;
    contBody.appendChild(tr);
  });
  if (!contItems.length) {
    contBody.innerHTML = '<tr><td colspan="4" class="bonos-vacio">Sin datos de Contadores.</td></tr>';
  }
  document.getElementById('cuadre-contadores-total').textContent = fmt(datos.contadores?.total ?? 0);

  // Bonos
  const bonosBody = document.getElementById('cuadre-bonos-body');
  bonosBody.innerHTML = '';
  const top5 = datos.bonos?.top5 || [];
  top5.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${b.cliente}</td><td>${fmt(b.total)}</td>`;
    bonosBody.appendChild(tr);
  });
  if (!top5.length) {
    bonosBody.innerHTML = '<tr><td colspan="2" class="bonos-vacio">Sin bonos en el período.</td></tr>';
  }
  document.getElementById('cuadre-bonos-total').textContent = fmt(datos.bonos?.total ?? 0);

  // Plataformas
  document.getElementById('cuadre-plataformas-practi').textContent = fmt(datos.plataformas?.total_practisistemas ?? 0);
  const cuadrePlatDeport = document.getElementById('cuadre-plataformas-deport');
  const totalDeportivas = datos.plataformas?.total_deportivas ?? 0;
  cuadrePlatDeport.textContent = fmt(totalDeportivas);
  cuadrePlatDeport.className = 'resumen-valor' + (totalDeportivas < 0 ? ' cuadre-negativo' : '');
  document.getElementById('cuadre-plataformas-total').textContent = fmt(datos.plataformas?.total ?? 0);

  // Gastos
  const gastosBody = document.getElementById('cuadre-gastos-body');
  gastosBody.innerHTML = '';
  const gastos = datos.gastos?.items || [];
  gastos.forEach(g => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${g.concepto}</td><td>${fmt(g.valor)}</td>`;
    gastosBody.appendChild(tr);
  });
  if (!gastos.length) {
    gastosBody.innerHTML = '<tr><td colspan="2" class="bonos-vacio">Sin gastos en el período.</td></tr>';
  }
  document.getElementById('cuadre-gastos-total').textContent = fmt(datos.gastos?.total ?? 0);

  // Préstamos
  document.getElementById('cuadre-prestamos-salida').textContent = fmt(datos.prestamos?.total_salida ?? 0);
  document.getElementById('cuadre-prestamos-entrada').textContent = fmt(datos.prestamos?.total_entrada ?? 0);
  const netoPrest = datos.prestamos?.neto ?? 0;
  const netoPrestBadge = document.getElementById('cuadre-prestamos-total');
  netoPrestBadge.textContent = fmt(netoPrest);
  netoPrestBadge.className = 'cuadre-total-badge' + (netoPrest < 0 ? ' cuadre-badge-negativo' : '');
  const resumenPrest = datos.prestamos?.resumen || [];
  const prestBody = document.getElementById('cuadre-prestamos-body');
  const prestDetWrap = document.getElementById('cuadre-prestamos-detalle-wrap');
  prestBody.innerHTML = '';
  if (resumenPrest.length) {
    resumenPrest.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.persona}</td><td>${fmt(p.prestamos)}</td><td>${fmt(p.pagos)}</td><td>${fmt(p.neto)}</td>`;
      prestBody.appendChild(tr);
    });
    prestDetWrap.classList.remove('oculto');
  } else {
    prestDetWrap.classList.add('oculto');
  }

  // Movimientos
  document.getElementById('cuadre-mov-ingresos').textContent = fmt(datos.movimientos?.total_ingresos ?? 0);
  document.getElementById('cuadre-mov-salidas').textContent = fmt(datos.movimientos?.total_salidas ?? 0);
  const netoMov = (datos.movimientos?.neto ?? 0);
  const netoMovBadge = document.getElementById('cuadre-mov-total');
  netoMovBadge.textContent = fmt(netoMov);
  netoMovBadge.className = 'cuadre-total-badge' + (netoMov < 0 ? ' cuadre-badge-negativo' : '');

  // Caja física
  const desg = datos.caja_desglose || {};
  const cajaBody = document.getElementById('cuadre-caja-body');
  cajaBody.innerHTML = '';
  const billetes = desg.billetes || {};
  [100000, 50000, 20000, 10000, 5000, 2000].forEach(d => {
    const b = billetes[String(d)];
    if (!b || b.subtotal === 0) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>$ ${d.toLocaleString('es-CO')}</td><td>${fmt(b.subtotal)}</td>`;
    cajaBody.appendChild(tr);
  });
  document.getElementById('cuadre-caja-monedas').textContent = fmt(desg.total_monedas ?? 0);
  document.getElementById('cuadre-caja-viejos').textContent = fmt(desg.billetes_viejos ?? 0);
  document.getElementById('cuadre-caja-total-badge').textContent = fmt(datos.caja_fisica ?? 0);

  // Balance
  const tieneCierreDia = Boolean(datos.tiene_caja_dia && datos.tiene_contadores_dia);
  document.getElementById('cuadre-balance-base').textContent = fmt(datos.base_anterior ?? 0);
  document.getElementById('cuadre-teorica').textContent = fmt(datos.caja_teorica ?? 0);
  document.getElementById('cuadre-fisica').textContent = tieneCierreDia ? fmt(datos.caja_fisica ?? 0) : 'Pendiente';
  document.getElementById('cuadre-base-nueva').textContent = tieneCierreDia ? fmt(datos.base_nueva ?? 0) : 'Pendiente de cierre';
  const dif = datos.diferencia ?? 0;
  const difEl = document.getElementById('cuadre-diferencia');
  if (tieneCierreDia) {
    difEl.textContent = fmt(dif);
    difEl.className = 'resumen-valor ' + (dif === 0 ? '' : dif > 0 ? 'cuadre-positivo' : 'cuadre-negativo');
    document.getElementById('cuadre-diferencia-label').textContent =
      dif === 0 ? 'CUADRE EXACTO' : dif > 0 ? 'SOBRANTE' : 'FALTANTE';
  } else {
    difEl.textContent = 'No disponible';
    difEl.className = 'resumen-valor';
    document.getElementById('cuadre-diferencia-label').textContent = 'CIERRE PENDIENTE';
  }

  const acciones = document.getElementById('cuadre-acciones');
  const info = document.getElementById('cuadre-guardado-info');
  if (datos.puede_guardar) {
    acciones.classList.remove('oculto');
    info.classList.add('oculto');
  } else {
    acciones.classList.add('oculto');
    // Solo mostrar info genérica si no hay mensaje_error dedicado ya visible
    const msgGenerico = !datos.mensaje_error
      ? (datos.mensaje || 'Vista previa parcial. El guardado se habilita cuando existan Caja y Contadores del día sin inconsistencias.')
      : '';
    info.textContent = msgGenerico;
    info.classList.toggle('oculto', !msgGenerico);
  }

  // Limpiar avisos al entrar al modo guardado
  document.getElementById('cuadre-aviso-acumulados').classList.toggle('oculto', !datos.mensaje_info);
  document.getElementById('cuadre-aviso-inconsistencias').classList.toggle('oculto', !datos.mensaje_error);
}

function renderCuadreGuardado(datos, fecha, calculado = null) {
  document.getElementById('cuadre-periodo-texto').textContent =
    `Período: ${formatFechaVisual(datos.fecha_inicio_periodo)} → ${formatFechaVisual(fecha)} — Guardado: ${formatFechaHoraVisual(datos.fecha_hora_registro)}`;

  document.getElementById('cuadre-base-display').textContent = fmt(datos.base_anterior);
  document.getElementById('cuadre-base-display').classList.remove('oculto');
  document.getElementById('cuadre-base-input-wrap').classList.add('oculto');

  // Contadores — detalle por ítem si hay datos calculados
  const contBody = document.getElementById('cuadre-contadores-body');
  const contItems = calculado?.contadores?.items || [];
  if (contItems.length) {
    contBody.innerHTML = '';
    contItems.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${idx + 1}</td><td>${item.nombre}</td><td>${item.yield_actual}</td><td>${fmt(item.resultado)}</td>`;
      contBody.appendChild(tr);
    });
  } else {
    contBody.innerHTML = `<tr><td colspan="4" class="bonos-vacio cuadre-resumen-guardado">Total: ${fmt(datos.total_contadores)}</td></tr>`;
  }
  document.getElementById('cuadre-contadores-total').textContent = fmt(datos.total_contadores);

  // Bonos — top 5 si hay datos calculados
  const bonosBody = document.getElementById('cuadre-bonos-body');
  const top5 = calculado?.bonos?.top5 || [];
  if (top5.length) {
    bonosBody.innerHTML = '';
    top5.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${b.cliente}</td><td>${fmt(b.total)}</td>`;
      bonosBody.appendChild(tr);
    });
  } else {
    bonosBody.innerHTML = `<tr><td colspan="2" class="bonos-vacio cuadre-resumen-guardado">Total: ${fmt(datos.total_bonos)}</td></tr>`;
  }
  document.getElementById('cuadre-bonos-total').textContent = fmt(datos.total_bonos);

  // Plataformas — desde datos guardados (son totales simples)
  document.getElementById('cuadre-plataformas-practi').textContent = fmt(datos.total_practisistemas);
  const cuadrePlatDeport = document.getElementById('cuadre-plataformas-deport');
  cuadrePlatDeport.textContent = fmt(datos.total_deportivas);
  cuadrePlatDeport.className = 'resumen-valor' + (datos.total_deportivas < 0 ? ' cuadre-negativo' : '');
  document.getElementById('cuadre-plataformas-total').textContent = fmt((datos.total_practisistemas || 0) + (datos.total_deportivas || 0));

  // Gastos — detalle por concepto si hay datos calculados
  const gastosBody = document.getElementById('cuadre-gastos-body');
  const gastos = calculado?.gastos?.items || [];
  if (gastos.length) {
    gastosBody.innerHTML = '';
    gastos.forEach(g => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${g.concepto}</td><td>${fmt(g.valor)}</td>`;
      gastosBody.appendChild(tr);
    });
  } else {
    gastosBody.innerHTML = `<tr><td colspan="2" class="bonos-vacio cuadre-resumen-guardado">Total: ${fmt(datos.total_gastos)}</td></tr>`;
  }
  document.getElementById('cuadre-gastos-total').textContent = fmt(datos.total_gastos);

  // Préstamos — totales desde guardados, detalle por persona si hay calculados
  document.getElementById('cuadre-prestamos-salida').textContent = fmt(datos.total_prestamos_salida);
  document.getElementById('cuadre-prestamos-entrada').textContent = fmt(datos.total_prestamos_entrada);
  const netoPrestBadge = document.getElementById('cuadre-prestamos-total');
  netoPrestBadge.textContent = fmt(datos.neto_prestamos);
  netoPrestBadge.className = 'cuadre-total-badge' + (datos.neto_prestamos < 0 ? ' cuadre-badge-negativo' : '');
  const resumenPrest = calculado?.prestamos?.resumen || [];
  const prestBody = document.getElementById('cuadre-prestamos-body');
  const prestDetWrap = document.getElementById('cuadre-prestamos-detalle-wrap');
  prestBody.innerHTML = '';
  if (resumenPrest.length) {
    resumenPrest.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.persona}</td><td>${fmt(p.prestamos)}</td><td>${fmt(p.pagos)}</td><td>${fmt(p.neto)}</td>`;
      prestBody.appendChild(tr);
    });
    prestDetWrap.classList.remove('oculto');
  } else {
    prestDetWrap.classList.add('oculto');
  }

  // Movimientos — desde datos guardados
  document.getElementById('cuadre-mov-ingresos').textContent = fmt(datos.total_mov_ingresos);
  document.getElementById('cuadre-mov-salidas').textContent = fmt(datos.total_mov_salidas);
  const netoMovBadge = document.getElementById('cuadre-mov-total');
  netoMovBadge.textContent = fmt(datos.neto_movimientos ?? 0);
  netoMovBadge.className = 'cuadre-total-badge' + ((datos.neto_movimientos ?? 0) < 0 ? ' cuadre-badge-negativo' : '');

  // Caja física — desglose de billetes si hay datos calculados
  const cajaBody = document.getElementById('cuadre-caja-body');
  cajaBody.innerHTML = '';
  const desg = calculado?.caja_desglose || {};
  if (desg.billetes) {
    const billetes = desg.billetes;
    [100000, 50000, 20000, 10000, 5000, 2000].forEach(d => {
      const b = billetes[String(d)];
      if (!b || b.subtotal === 0) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>$ ${d.toLocaleString('es-CO')}</td><td>${fmt(b.subtotal)}</td>`;
      cajaBody.appendChild(tr);
    });
    document.getElementById('cuadre-caja-monedas').textContent = fmt(desg.total_monedas ?? 0);
    document.getElementById('cuadre-caja-viejos').textContent = fmt(desg.billetes_viejos ?? 0);
  } else {
    document.getElementById('cuadre-caja-monedas').textContent = '';
    document.getElementById('cuadre-caja-viejos').textContent = '';
  }
  document.getElementById('cuadre-caja-total-badge').textContent = fmt(datos.caja_fisica);

  // Balance — siempre desde datos guardados (fuente de verdad del cuadre)
  document.getElementById('cuadre-balance-base').textContent = fmt(datos.base_anterior);
  document.getElementById('cuadre-teorica').textContent = fmt(datos.caja_teorica);
  document.getElementById('cuadre-fisica').textContent = fmt(datos.caja_fisica);
  document.getElementById('cuadre-base-nueva').textContent = fmt(datos.base_nueva);
  const dif = datos.diferencia;
  const difEl = document.getElementById('cuadre-diferencia');
  difEl.textContent = fmt(dif);
  difEl.className = 'resumen-valor ' + (dif === 0 ? '' : dif > 0 ? 'cuadre-positivo' : 'cuadre-negativo');
  document.getElementById('cuadre-diferencia-label').textContent =
    dif === 0 ? 'CUADRE EXACTO' : dif > 0 ? 'SOBRANTE' : 'FALTANTE';

  document.getElementById('cuadre-acciones').classList.add('oculto');
  const info = document.getElementById('cuadre-guardado-info');
  info.textContent = `Cuadre guardado. Si necesitas corregir edita el módulo correspondiente, luego guarda nuevamente Caja o Contadores.`;
  info.classList.remove('oculto');
}

async function guardarCuadre() {
  if (!cuadreDatos) return;
  const fecha = cuadreDatos.fecha;
  const tieneBase = cuadreDatos.tiene_base_anterior;
  const base_anterior = tieneBase
    ? cuadreDatos.base_anterior
    : (parseNumeroInput('cuadre-base-input') || 0);

  const res = await fetch('/api/modulos/cuadre/guardar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, base_anterior, forzar: puedeForzarModulo('cuadre', fecha) }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }
  await cargarDatosCuadre(fecha);
  await verificarFechaActual();
  const tipo = data.diferencia === 0 ? 'ok' : 'advertencia';
  const label = data.diferencia === 0 ? 'Cuadre exacto' : data.diferencia > 0 ? `Sobrante: ${fmt(data.diferencia)}` : `Faltante: ${fmt(data.diferencia)}`;
  mostrarMensaje(`✓ ${data.mensaje} — ${label}`, tipo);
}

// ─── FIN CUADRE ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
