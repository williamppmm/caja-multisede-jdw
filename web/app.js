const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000];
const CONTRASENA = '1980';
const MAX_ITEMS = 10;

const MODULE_META = {
  caja: { label: 'Caja', panelId: 'panel-caja', dateLabel: 'Fecha del arqueo', defaultDate: () => configDefaultDate === 'yesterday' ? ayerStr() : hoyStr() },
  gastos: { label: 'Gastos', panelId: 'panel-gastos', dateLabel: 'Fecha de gastos', defaultDate: () => hoyStr() },
  bonos: { label: 'Bonos', panelId: 'panel-bonos', dateLabel: 'Fecha de bonos', defaultDate: () => hoyStr() },
};

let configDefaultDate = 'today';
let configModoEntrada = 'cantidad';
let configSede = 'Principal';
let configDataDir = '';
let enabledModules = ['caja', 'gastos'];
let defaultModule = 'caja';
let currentModule = 'caja';
let moduleDates = {};
let adminOverride = { caja: false, gastos: false, bonos: false };
let debounceTimer = null;
let pendingAdminAction = null;
let bonusNames = [];

function fmt(n) {
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

function parsePositivo(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isNaN(v) || v < 0 ? 0 : v;
}

function dateToStr(d) {
  return d.toISOString().slice(0, 10);
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
  const [year, month, day] = fechaIso.split('-');
  if (!year || !month || !day) return fechaIso;
  return `${day}-${month}`;
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
  const modulos = obtenerModulosMarcadosAdmin();
  preview.textContent = modulos.map(modulo => `Hoja ${modulo}: ${MODULE_META[modulo].label}${sede}`).join(' | ');
}

function actualizarEstadoDeportivas() {
  const input = document.getElementById('venta_deportivas');
  const resumenItem = document.getElementById('resumen-deportivas')?.closest('.resumen-informativo');
  if (!input || !resumenItem) return;
  const valor = parseFloat(input.value);
  const esNegativo = !isNaN(valor) && valor < 0;
  input.classList.toggle('valor-negativo', esNegativo);
  resumenItem.classList.toggle('negativo', esNegativo);
}

function mostrarBanner(texto) {
  document.getElementById('banner-texto').textContent = texto;
  document.getElementById('banner-edicion').classList.remove('oculto');
}

function ocultarBanner() {
  document.getElementById('banner-edicion').classList.add('oculto');
}

function buildTablaBilletes() {
  const tbody = document.getElementById('tbody-billetes');
  tbody.innerHTML = '';
  DENOMINACIONES.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>$ ${d.toLocaleString('es-CO')}</td>
      <td><input type="number" id="cant_${d}" min="0" placeholder="0" step="1" class="input-billete" /></td>
      <td><input type="number" id="sub_${d}" min="0" placeholder="0" step="${d}" class="input-billete" /></td>
    `;
    tbody.appendChild(tr);
  });
}

function buildItemsList(modulo) {
  const lista = document.getElementById(`lista-${modulo}`);
  if (!lista) return;
  lista.innerHTML = '';
  for (let i = 0; i < MAX_ITEMS; i++) {
    const row = document.createElement('div');
    row.className = 'gasto-fila';
    row.innerHTML = `
      <input type="text" id="${modulo}_concepto_${i}" placeholder="Descripción" maxlength="80" />
      <input type="number" id="${modulo}_valor_${i}" placeholder="0" min="0" />
    `;
    lista.appendChild(row);
    document.getElementById(`${modulo}_valor_${i}`).addEventListener('input', () => calcularModuloItems(modulo));
  }
}

function camposEditablesBilletes() {
  const prefijo = configModoEntrada === 'cantidad' ? 'cant_' : 'sub_';
  const billetes = DENOMINACIONES.map(d => document.getElementById(prefijo + d));
  const manuales = ['total_monedas', 'billetes_viejos', 'venta_practisistemas', 'venta_deportivas']
    .map(id => document.getElementById(id));
  return [...billetes, ...manuales];
}

function aplicarModoEntrada() {
  const esCantidad = configModoEntrada === 'cantidad';
  document.getElementById('th-cantidad').textContent = esCantidad ? 'Cantidad' : 'Cantidad (calc.)';
  document.getElementById('th-subtotal').textContent = esCantidad ? 'Subtotal' : 'Total denominación';
  DENOMINACIONES.forEach(d => {
    const cant = document.getElementById(`cant_${d}`);
    const sub = document.getElementById(`sub_${d}`);
    cant.readOnly = !esCantidad;
    sub.readOnly = esCantidad;
    cant.tabIndex = esCantidad ? 0 : -1;
    sub.tabIndex = esCantidad ? -1 : 0;
    cant.classList.toggle('input-readonly', !esCantidad);
    sub.classList.toggle('input-readonly', esCantidad);
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
      const cant = parseInt(document.getElementById(`cant_${d}`).value, 10);
      const c = isNaN(cant) || cant < 0 ? 0 : cant;
      const sub = c * d;
      totalBilletes += sub;
      document.getElementById(`sub_${d}`).value = sub > 0 ? sub : '';
    } else {
      const sub = parseFloat(document.getElementById(`sub_${d}`).value) || 0;
      const cant = sub > 0 ? sub / d : 0;
      totalBilletes += sub;
      document.getElementById(`cant_${d}`).value = cant > 0 ? (cant % 1 === 0 ? String(cant) : cant.toFixed(2)) : '';
    }
  });

  const monedas = parsePositivo('total_monedas');
  const viejos = parsePositivo('billetes_viejos');
  const practi = parsePositivo('venta_practisistemas');
  const deport = parseFloat(document.getElementById('venta_deportivas').value) || 0;
  const totalCaja = totalBilletes + monedas + viejos;

  document.getElementById('total-billetes').textContent = fmt(totalBilletes);
  document.getElementById('resumen-billetes').textContent = fmt(totalBilletes);
  document.getElementById('resumen-monedas').textContent = fmt(monedas);
  document.getElementById('resumen-viejos').textContent = fmt(viejos);
  document.getElementById('resumen-total').textContent = fmt(totalCaja);
  document.getElementById('resumen-practisistemas').textContent = fmt(practi);
  document.getElementById('resumen-deportivas').textContent = fmt(deport);
  actualizarEstadoDeportivas();
}

function calcularModuloItems(modulo) {
  let total = 0;
  for (let i = 0; i < MAX_ITEMS; i++) {
    total += parseFloat(document.getElementById(`${modulo}_valor_${i}`).value) || 0;
  }
  document.getElementById(`total-${modulo}`).textContent = fmt(total);
  document.getElementById(`resumen-${modulo}`).textContent = fmt(total);
}

function actualizarBonosVisuales() {
  const fecha = moduleDates.bonos || hoyStr();
  const fechaEl = document.getElementById('bonos-fecha-visual');
  const horaEl = document.getElementById('bonos-hora-visual');
  if (fechaEl) fechaEl.textContent = formatFechaVisual(fecha);
  if (horaEl) horaEl.textContent = formatHoraVisual(new Date());
}

function renderBonusNames() {
  const list = document.getElementById('bonos-clientes-lista');
  if (!list) return;
  list.innerHTML = '';
  bonusNames.forEach(nombre => {
    const option = document.createElement('option');
    option.value = nombre;
    list.appendChild(option);
  });
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

function limpiarFormularioBonos() {
  const cliente = document.getElementById('bono-cliente');
  const valor = document.getElementById('bono-valor');
  if (cliente) cliente.value = '';
  if (valor) valor.value = '';
}

function actualizarAccionesBonos() {
  const esHoy = (moduleDates.bonos || hoyStr()) === hoyStr();
  const hayRegistros = document.getElementById('bonos-registros-body')?.querySelectorAll('tr').length > 0
    && !document.querySelector('#bonos-registros-body .bonos-vacio');
  document.getElementById('btn-bono-editar-ultimo').disabled = !esHoy || !hayRegistros;
  document.getElementById('btn-bono-eliminar-ultimo').disabled = !esHoy || !hayRegistros;
}

function renderBonosRegistros(items = [], total = 0) {
  const tbody = document.getElementById('bonos-registros-body');
  tbody.innerHTML = '';
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="bonos-vacio">Sin registros para esta fecha.</td></tr>';
  } else {
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.fecha_display || formatFechaVisual(item.fecha)}</td>
        <td>${item.hora_display || ''}</td>
        <td>${item.cliente || ''}</td>
        <td>${fmt(item.valor || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-bonos').textContent = fmt(total);
  document.getElementById('resumen-bonos').textContent = fmt(total);
  actualizarAccionesBonos();
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

function validarBono() {
  const cliente = document.getElementById('bono-cliente').value.trim();
  const valorRaw = document.getElementById('bono-valor').value;
  const valor = valorRaw === '' ? 0 : Number(valorRaw);
  if (!cliente) return 'Debes ingresar el nombre del cliente.';
  if (isNaN(valor) || valor <= 0) return 'Debes ingresar un valor de bono mayor que cero.';
  return null;
}

function obtenerItemsModulo(modulo) {
  const items = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const concepto = document.getElementById(`${modulo}_concepto_${i}`).value.trim();
    const valor = parseFloat(document.getElementById(`${modulo}_valor_${i}`).value) || 0;
    if (concepto && valor !== 0) items.push({ concepto, valor });
  }
  return items;
}

function cargarItemsModulo(modulo, items = []) {
  limpiarModuloItems(modulo);
  items.slice(0, MAX_ITEMS).forEach((item, i) => {
    document.getElementById(`${modulo}_concepto_${i}`).value = item.concepto || '';
    document.getElementById(`${modulo}_valor_${i}`).value = item.valor || '';
  });
  calcularModuloItems(modulo);
}

function limpiarModuloItems(modulo) {
  for (let i = 0; i < MAX_ITEMS; i++) {
    document.getElementById(`${modulo}_concepto_${i}`).value = '';
    document.getElementById(`${modulo}_valor_${i}`).value = '';
  }
  calcularModuloItems(modulo);
}

function limpiarCaja() {
  DENOMINACIONES.forEach(d => {
    document.getElementById(`cant_${d}`).value = '';
    document.getElementById(`sub_${d}`).value = '';
  });
  ['total_monedas', 'billetes_viejos', 'venta_practisistemas', 'venta_deportivas']
    .forEach(id => { document.getElementById(id).value = ''; });
  calcularCaja();
}

function limpiarModuloActual() {
  if (currentModule === 'caja') {
    limpiarCaja();
  } else if (currentModule === 'bonos') {
    limpiarFormularioBonos();
  } else {
    limpiarModuloItems(currentModule);
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
  document.getElementById('btn-guardar').classList.toggle('oculto', currentModule === 'bonos');
  document.getElementById('btn-guardar').textContent = 'Guardar';
  actualizarBonosVisuales();
}

function sugerirFechaModulo(modulo) {
  return MODULE_META[modulo].defaultDate();
}

function aplicarFechaModulo(modulo, usarDefault = false) {
  if (usarDefault || !moduleDates[modulo]) {
    moduleDates[modulo] = sugerirFechaModulo(modulo);
  }
  document.getElementById('fecha').value = moduleDates[modulo];
}

function resetOverride(modulo) {
  adminOverride[modulo] = false;
  ocultarBanner();
}

async function activarModulo(modulo) {
  currentModule = modulo;
  if (!enabledModules.includes(modulo)) {
    currentModule = enabledModules[0];
  }
  renderTabs();
  actualizarPaneles();
  aplicarFechaModulo(currentModule);
  if (currentModule === 'bonos') {
    limpiarFormularioBonos();
    actualizarAccionesBonos();
    actualizarBonosVisuales();
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
    return;
  }

  if (fecha > hoyStr()) {
    estado.textContent = 'No es posible guardar una fecha futura.';
    estado.className = 'fecha-estado futura';
    btnGuardar.disabled = true;
    return;
  }

  try {
    const res = await fetch(`/api/modulos/${currentModule}/fecha/${fecha}/estado`);
    const data = await res.json();
    btnGuardar.disabled = false;

    if (currentModule === 'caja') {
      if (data.existe && !adminOverride.caja) {
        estado.innerHTML = `La caja de ${fecha} ya existe. <button class="btn-inline-editar" id="btn-inline-editar">Corregir (admin)</button>`;
        estado.className = 'fecha-estado existe';
        btnGuardar.disabled = true;
        document.getElementById('btn-inline-editar')?.addEventListener('click', () => autorizarModulo());
        return;
      }

      if (adminOverride.caja) {
        estado.textContent = `Corrección de caja autorizada para ${fecha}.`;
        estado.className = 'fecha-estado advertencia-fecha';
        return;
      }

      estado.textContent = fecha === hoyStr() || fecha === ayerStr()
        ? 'Fecha disponible.'
        : `Atención: ${fecha} no es hoy ni ayer. Verifique antes de guardar.`;
      estado.className = fecha === hoyStr() || fecha === ayerStr() ? 'fecha-estado libre' : 'fecha-estado advertencia-fecha';
      return;
    }

    if (fecha === hoyStr()) {
      estado.textContent = data.existe
        ? `Puedes seguir registrando ${MODULE_META[currentModule].label.toLowerCase()} hoy.`
        : `Puedes registrar ${MODULE_META[currentModule].label.toLowerCase()} libremente hoy.`;
      estado.className = 'fecha-estado libre';
      return;
    }

    if (adminOverride[currentModule]) {
      estado.textContent = `Corrección de ${MODULE_META[currentModule].label.toLowerCase()} autorizada para ${fecha}.`;
      estado.className = 'fecha-estado advertencia-fecha';
      return;
    }

    estado.innerHTML = `Para guardar ${MODULE_META[currentModule].label.toLowerCase()} en ${fecha} necesitas admin. <button class="btn-inline-editar" id="btn-inline-editar">Autorizar</button>`;
    estado.className = 'fecha-estado existe';
    btnGuardar.disabled = true;
    document.getElementById('btn-inline-editar')?.addEventListener('click', () => autorizarModulo());
  } catch {
    estado.textContent = '';
  }
}

function abrirModalAdminAccion({ titulo, descripcion, onSuccess }) {
  pendingAdminAction = onSuccess;
  document.getElementById('modal-editar-titulo').textContent = titulo;
  document.getElementById('modal-editar-desc').textContent = descripcion;
  document.getElementById('editar-pass').value = '';
  document.getElementById('editar-pass-error').classList.add('oculto');
  document.getElementById('modal-editar').classList.remove('oculto');
  setTimeout(() => document.getElementById('editar-pass').focus(), 50);
}

function cerrarModalEditar() {
  pendingAdminAction = null;
  document.getElementById('modal-editar').classList.add('oculto');
}

async function confirmarAccionAdmin() {
  if (document.getElementById('editar-pass').value !== CONTRASENA) {
    document.getElementById('editar-pass-error').classList.remove('oculto');
    return;
  }
  const accion = pendingAdminAction;
  cerrarModalEditar();
  if (accion) await accion();
}

async function autorizarModulo() {
  const fecha = document.getElementById('fecha').value;
  const modulo = currentModule;
  const titulo = modulo === 'caja' ? 'Corrección de caja' : `Corrección de ${MODULE_META[modulo].label.toLowerCase()}`;
  const descripcion = modulo === 'caja'
    ? `La caja del ${fecha} ya fue registrada. Ingrese la contraseña para corregirla.`
    : `Ingrese la contraseña para corregir ${MODULE_META[modulo].label.toLowerCase()} del ${fecha}.`;

  abrirModalAdminAccion({
    titulo,
    descripcion,
    onSuccess: async () => {
      adminOverride[modulo] = true;
      mostrarBanner(`${titulo} autorizada: ${fecha}`);
      await cargarVistaModulo(modulo, fecha);
      await verificarFechaActual();
    },
  });
}

async function cargarDatosCaja(fecha) {
  try {
    const res = await fetch(`/api/modulos/caja/fecha/${fecha}/datos`);
    if (!res.ok) {
      limpiarCaja();
      return;
    }
    const data = await res.json();
    DENOMINACIONES.forEach(d => {
      const cantidad = data.billetes?.[String(d)] ?? 0;
      document.getElementById(`cant_${d}`).value = cantidad || '';
      document.getElementById(`sub_${d}`).value = cantidad ? cantidad * d : '';
    });
    document.getElementById('total_monedas').value = data.total_monedas || '';
    document.getElementById('billetes_viejos').value = data.billetes_viejos || '';
    document.getElementById('venta_practisistemas').value = data.venta_practisistemas || '';
    document.getElementById('venta_deportivas').value = data.venta_deportivas || '';
    calcularCaja();
  } catch {
    limpiarCaja();
  }
}

async function cargarDatosModuloItems(modulo, fecha) {
  if (modulo === 'bonos') {
    await cargarBonosDelDia(fecha);
    return;
  }
  try {
    const res = await fetch(`/api/modulos/${modulo}/fecha/${fecha}/datos`);
    if (!res.ok) {
      limpiarModuloItems(modulo);
      return;
    }
    const data = await res.json();
    cargarItemsModulo(modulo, data.items || []);
  } catch {
    limpiarModuloItems(modulo);
  }
}

async function cargarVistaModulo(modulo, fecha) {
  if (!fecha) return;
  if (modulo === 'caja') {
    await cargarDatosCaja(fecha);
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
  const valor = Number(document.getElementById('bono-valor').value);

  const res = await fetch('/api/modulos/bonos/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, cliente, valor, forzar: adminOverride.bonos }),
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
  resetOverride('bonos');
  await verificarFechaActual();
  document.getElementById('bono-cliente').focus();
}

async function editarUltimoBono() {
  const error = validarBono();
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }
  const fecha = document.getElementById('fecha').value;
  const cliente = document.getElementById('bono-cliente').value.trim();
  const valor = Number(document.getElementById('bono-valor').value);
  const confirmar = window.confirm(`Vas a editar el ultimo bono registrado para esta fecha.\n\nCliente: ${cliente}\nValor: ${fmt(valor)}\n\n¿Deseas continuar?`);
  if (!confirmar) return;
  const res = await fetch('/api/modulos/bonos/ultimo/editar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, cliente, valor, forzar: false }),
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
  mostrarMensaje(`✓ ${data.mensaje} — Total día: ${fmt(data.total_dia)}`, 'ok');
  document.getElementById('bono-cliente').focus();
}

async function eliminarUltimoBono() {
  const fecha = document.getElementById('fecha').value;
  const confirmar = window.confirm('Se eliminará el último bono registrado para esta fecha. ¿Deseas continuar?');
  if (!confirmar) return;
  const res = await fetch('/api/modulos/bonos/ultimo/eliminar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }
  await cargarBonosDelDia(fecha);
  mostrarMensaje(`✓ ${data.mensaje} — Total día: ${fmt(data.total_dia)}`, 'ok');
  document.getElementById('bono-cliente').focus();
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
      const val = raw === '' ? 0 : Number(raw);
      if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
        return `Cantidad inválida para $ ${d.toLocaleString('es-CO')}.`;
      }
    } else {
      const raw = document.getElementById(`sub_${d}`).value;
      const val = raw === '' ? 0 : parseFloat(raw);
      if (isNaN(val) || val < 0) {
        return `Total inválido para $ ${d.toLocaleString('es-CO')}.`;
      }
      if (val > 0 && val % d !== 0) {
        return `$ ${val.toLocaleString('es-CO')} no es múltiplo de $ ${d.toLocaleString('es-CO')}.`;
      }
    }
  }

  for (const id of ['total_monedas', 'billetes_viejos', 'venta_practisistemas']) {
    const raw = document.getElementById(id).value;
    const val = raw === '' ? 0 : Number(raw);
    if (isNaN(val) || val < 0) return `Valor inválido en ${id.replace(/_/g, ' ')}.`;
  }

  const vdRaw = document.getElementById('venta_deportivas').value;
  const vd = vdRaw === '' ? 0 : Number(vdRaw);
  if (isNaN(vd)) return 'Valor inválido en venta deportivas.';
  return null;
}

function validarModuloItems(modulo) {
  let tieneItem = false;
  for (let i = 0; i < MAX_ITEMS; i++) {
    const concepto = document.getElementById(`${modulo}_concepto_${i}`).value.trim();
    const raw = document.getElementById(`${modulo}_valor_${i}`).value;
    const valor = raw === '' ? 0 : Number(raw);
    if (raw !== '' && (isNaN(valor) || valor < 0)) {
      return 'Los valores deben ser números mayores o iguales a cero.';
    }
    if (concepto && valor > 0) tieneItem = true;
  }
  if (!tieneItem) {
    return `Debes ingresar al menos un ${MODULE_META[modulo].label.toLowerCase().slice(0, -1)} con valor.`;
  }
  return null;
}

async function guardar() {
  ocultarMensaje();
  const fecha = document.getElementById('fecha').value;
  if (!fecha) {
    mostrarMensaje('Debes seleccionar una fecha.', 'error');
    return;
  }

  const error = currentModule === 'caja'
    ? validarCaja()
    : currentModule === 'bonos'
      ? validarBono()
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
          billetes[String(d)] = parseInt(document.getElementById(`cant_${d}`).value, 10) || 0;
        } else {
          const sub = parseFloat(document.getElementById(`sub_${d}`).value) || 0;
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
          venta_practisistemas: parsePositivo('venta_practisistemas'),
          venta_deportivas: parseFloat(document.getElementById('venta_deportivas').value) || 0,
          forzar: adminOverride.caja,
        }),
      });
    } else if (currentModule === 'bonos') {
      await registrarBono();
      return;
    } else {
      res = await fetch(`/api/modulos/${currentModule}/guardar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          items: obtenerItemsModulo(currentModule),
          forzar: adminOverride[currentModule],
        }),
      });
    }

    const data = await res.json();
    if (!data.ok) {
      mostrarMensaje(data.mensaje, 'advertencia');
      return;
    }

    const dt = new Date(data.fecha_hora_registro);
    const hora12 = dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    if (currentModule === 'caja') {
      resetOverride('caja');
      moduleDates.caja = fecha;
      document.getElementById('fecha').value = fecha;
      await cargarVistaModulo('caja', fecha);
      mostrarMensaje(`✓ ${data.mensaje} — Total caja física: ${fmt(data.total_caja_fisica)} — ${data.fecha_hora_registro.slice(0, 10)} ${hora12}`, 'ok');
    } else if (currentModule === 'bonos') {
      return;
    } else {
      if (adminOverride[currentModule]) resetOverride(currentModule);
      moduleDates[currentModule] = fecha;
      document.getElementById('fecha').value = fecha;
      await cargarVistaModulo(currentModule, fecha);
      mostrarMensaje(`✓ ${data.mensaje} — Total ${MODULE_META[currentModule].label.toLowerCase()}: ${fmt(data.total)} — ${data.fecha_hora_registro.slice(0, 10)} ${hora12}`, 'ok');
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
  if (document.getElementById('admin-pass').value !== CONTRASENA) {
    document.getElementById('admin-pass-error').classList.remove('oculto');
    return;
  }

  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    document.querySelector(`input[name="default_date"][value="${settings.default_date || 'today'}"]`).checked = true;
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
  } catch { /* defaults */ }

  document.getElementById('admin-login-section').classList.add('oculto');
  document.getElementById('admin-config-section').classList.remove('oculto');
}

async function guardarAdmin() {
  const msg = document.getElementById('admin-config-msg');
  const enabled = obtenerModulosMarcadosAdmin();
  const body = {
    default_date: document.querySelector('input[name="default_date"]:checked')?.value || 'today',
    modo_entrada: document.querySelector('input[name="modo_entrada"]:checked')?.value || 'cantidad',
    enabled_modules: enabled,
    default_module: document.getElementById('admin-default-module').value || enabled[0],
    sede: document.getElementById('admin-sede').value.trim(),
    data_dir: document.getElementById('admin-data-dir').value.trim(),
  };

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    configDefaultDate = body.default_date;
    configModoEntrada = body.modo_entrada;
    enabledModules = body.enabled_modules;
    defaultModule = body.default_module;
    configSede = body.sede || 'Principal';
    configDataDir = body.data_dir;

    enabledModules.forEach(modulo => {
      if (!moduleDates[modulo]) moduleDates[modulo] = sugerirFechaModulo(modulo);
    });
    currentModule = enabledModules.includes(currentModule) ? currentModule : defaultModule;
    renderTabs();
    actualizarPaneles();
    aplicarModoEntrada();
    aplicarFechaModulo(currentModule, true);
    await cargarVistaModulo(currentModule, moduleDates[currentModule]);
    await verificarFechaActual();

    msg.textContent = `Configuración guardada. Módulo por defecto: ${MODULE_META[defaultModule].label}.`;
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

async function cerrarAplicacion() {
  const confirmar = window.confirm('La capturadora se cerrará en este equipo. ¿Desea finalizar ahora?');
  if (!confirmar) return;

  try {
    await fetch('/api/app/shutdown', { method: 'POST' });
    mostrarMensaje('La aplicación se está cerrando...', 'ok');
    setTimeout(() => window.close(), 300);
  } catch {
    mostrarMensaje('No se pudo cerrar la aplicación desde la interfaz.', 'error');
  }
}

async function init() {
  buildTablaBilletes();
  buildItemsList('gastos');
  await cargarBonusNames();

  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    configDefaultDate = settings.default_date || 'today';
    configModoEntrada = settings.modo_entrada || 'cantidad';
    configSede = settings.sede || 'Principal';
    configDataDir = settings.data_dir || '';
    enabledModules = settings.enabled_modules || ['caja', 'gastos'];
    defaultModule = settings.default_module || enabledModules[0];
  } catch { /* defaults */ }

  moduleDates = {
    caja: sugerirFechaModulo('caja'),
    gastos: sugerirFechaModulo('gastos'),
    bonos: sugerirFechaModulo('bonos'),
  };
  currentModule = enabledModules.includes(defaultModule) ? defaultModule : enabledModules[0];

  aplicarModoEntrada();
  renderTabs();
  actualizarPaneles();
  aplicarFechaModulo(currentModule);
  actualizarBonosVisuales();
  await cargarVistaModulo(currentModule, moduleDates[currentModule]);
  await verificarFechaActual();

  document.querySelectorAll('.input-billete').forEach(inp => {
    inp.addEventListener('input', calcularCaja);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !inp.readOnly) {
        e.preventDefault();
        moverAlSiguiente(inp);
      }
    });
  });

  ['total_monedas', 'billetes_viejos', 'venta_practisistemas', 'venta_deportivas'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', calcularCaja);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        moverAlSiguiente(el);
      }
    });
  });

  document.getElementById('fecha').addEventListener('change', e => {
    moduleDates[currentModule] = e.target.value;
    if (currentModule !== 'caja') resetOverride(currentModule);
    if (currentModule === 'caja') resetOverride('caja');
    if (currentModule === 'bonos') {
      limpiarFormularioBonos();
      actualizarBonosVisuales();
      actualizarAccionesBonos();
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
  document.getElementById('btn-cancelar-edicion').addEventListener('click', async () => {
    resetOverride(currentModule);
    moduleDates[currentModule] = sugerirFechaModulo(currentModule);
    aplicarFechaModulo(currentModule);
    if (currentModule === 'bonos') limpiarFormularioBonos();
    await cargarVistaModulo(currentModule, moduleDates[currentModule]);
    await verificarFechaActual();
  });

  document.getElementById('btn-admin').addEventListener('click', abrirAdmin);
  document.getElementById('btn-admin-cancelar').addEventListener('click', cerrarAdmin);
  document.getElementById('btn-admin-cerrar').addEventListener('click', cerrarAdmin);
  document.getElementById('btn-admin-ingresar').addEventListener('click', ingresarAdmin);
  document.getElementById('btn-admin-guardar').addEventListener('click', guardarAdmin);
  document.getElementById('btn-admin-buscar-carpeta').addEventListener('click', buscarCarpetaDatos);
  document.getElementById('btn-admin-importar-bonos').addEventListener('click', importarNombresBonos);
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

  document.getElementById('btn-editar-ok').addEventListener('click', confirmarAccionAdmin);
  document.getElementById('btn-editar-cancelar').addEventListener('click', cerrarModalEditar);
  document.getElementById('editar-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmarAccionAdmin();
  });

  document.getElementById('btn-bono-registrar').addEventListener('click', registrarBono);
  document.getElementById('btn-bono-editar-ultimo').addEventListener('click', editarUltimoBono);
  document.getElementById('btn-bono-eliminar-ultimo').addEventListener('click', eliminarUltimoBono);
  document.getElementById('bono-cliente').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('bono-valor').focus();
      document.getElementById('bono-valor').select();
    }
  });
  document.getElementById('bono-valor').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-bono-registrar').focus();
    }
  });
  setInterval(actualizarBonosVisuales, 30000);

  document.getElementById('modal-admin').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarAdmin();
  });
  document.getElementById('modal-editar').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModalEditar();
  });
}

document.addEventListener('DOMContentLoaded', init);
