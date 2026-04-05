const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000];
const CONTRASENA = '1980';
const OBSERVACION_CRITICA_DEFAULT = 'reinicio técnico';
const MODULE_META = {
  caja: { label: 'Caja', panelId: 'panel-caja', dateLabel: 'Fecha del arqueo', defaultDate: () => configDefaultDate === 'yesterday' ? ayerStr() : hoyStr() },
  plataformas: { label: 'Plataformas', panelId: 'panel-plataformas', dateLabel: 'Fecha de plataformas', defaultDate: () => hoyStr() },
  gastos: { label: 'Gastos', panelId: 'panel-gastos', dateLabel: 'Fecha de gastos', defaultDate: () => hoyStr() },
  bonos: { label: 'Bonos', panelId: 'panel-bonos', dateLabel: 'Fecha de bonos', defaultDate: () => hoyStr() },
  prestamos: { label: 'Prestamos', panelId: 'panel-prestamos', dateLabel: 'Fecha de préstamos', defaultDate: () => hoyStr() },
  movimientos: { label: 'Movimientos', panelId: 'panel-movimientos', dateLabel: 'Fecha de movimientos', defaultDate: () => hoyStr() },
  contadores: { label: 'Contadores', panelId: 'panel-contadores', dateLabel: 'Fecha de contadores', defaultDate: () => hoyStr() },
  cuadre: { label: 'Cuadre', panelId: 'panel-cuadre', dateLabel: 'Fecha del cuadre', defaultDate: () => hoyStr() },
};

let configDefaultDate = 'today';
let configModoEntrada = 'cantidad';
let configSede = 'Principal';
let configDataDir = '';
let enabledModules = ['caja', 'gastos'];
let defaultModule = 'caja';
let currentModule = 'caja';
let moduleDates = {};
let adminOverride = { caja: false, plataformas: false, gastos: false, bonos: false, prestamos: false, movimientos: false, contadores: false, cuadre: false };
let cuadreDatos = null;
let debounceTimer = null;
let pendingAdminAction = null;
let bonusNames = [];
let loanNames = [];
let expenseConcepts = [];
let movementConcepts = [];
let bonusDayItems = [];
let loanItems = [];
let movementItems = [];
let cajaLocked = false;
let cajaDrafts = {};
let contadorCatalog = [];
let contadoresDrafts = {};
let contadoresLocked = false;

function fmt(n) {
  return '$ ' + Math.round(n).toLocaleString('es-CO');
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
  input.value = formatNumeroTexto(input.value, allowNegative);
}

function limpiarFormatoInputNumerico(input, allowNegative = false) {
  if (!input) return;
  input.value = limpiarNumeroTexto(input.value, allowNegative);
}

function parsePositivo(id) {
  const v = parseNumeroInput(id);
  return isNaN(v) || v < 0 ? 0 : v;
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
      <td><input type="text" inputmode="numeric" id="cant_${d}" placeholder="0" class="input-billete" /></td>
      <td><input type="text" inputmode="numeric" id="sub_${d}" placeholder="0" class="input-billete" /></td>
    `;
    tbody.appendChild(tr);
  });
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
  tbody.innerHTML = '';
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="bonos-vacio">Sin registros para esta fecha.</td></tr>';
  } else {
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.concepto || ''}</td>
        <td>${fmt(item.valor || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-gastos').textContent = fmt(total);
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
  const list = document.getElementById('bonos-clientes-lista');
  if (!list) return;
  list.innerHTML = '';
  bonusNames.forEach(nombre => {
    const option = document.createElement('option');
    option.value = nombre;
    list.appendChild(option);
  });
}

function renderExpenseConcepts() {
  const list = document.getElementById('gastos-conceptos-lista');
  if (!list) return;
  list.innerHTML = '';
  expenseConcepts.forEach(concepto => {
    const option = document.createElement('option');
    option.value = concepto;
    list.appendChild(option);
  });
}

function renderMovementConcepts() {
  const list = document.getElementById('movimientos-conceptos-lista');
  if (!list) return;
  list.innerHTML = '';
  movementConcepts.forEach(concepto => {
    const option = document.createElement('option');
    option.value = concepto;
    list.appendChild(option);
  });
}

function renderLoanNames() {
  const list = document.getElementById('prestamos-personas-lista');
  if (!list) return;
  list.innerHTML = '';
  loanNames.forEach(nombre => {
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
  return [...document.querySelectorAll('.contador-campo, .contador-critica input, .contador-critica textarea')];
}

function setContadoresEditable(editable) {
  contadoresLocked = !editable;
  getContadoresInputs().forEach(input => {
    input.readOnly = contadoresLocked;
    if (input.tagName === 'INPUT') input.disabled = false;
    input.tabIndex = contadoresLocked ? -1 : 0;
    input.classList.toggle('input-readonly', contadoresLocked);
  });
  document.querySelectorAll('.btn-confirmar-critica').forEach(btn => {
    btn.disabled = contadoresLocked;
  });
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
  const rows = [...document.querySelectorAll('#contadores-body tr[data-item-id]')].map(row => {
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
      observacion: row.querySelector(`[data-role="critica-observacion"]`)?.value || '',
    };
  });
  return { items: rows };
}

function guardarDraftContadores(fechaOverride = null) {
  const fecha = fechaOverride || document.getElementById('fecha')?.value;
  if (!fecha || contadoresLocked) return;
  contadoresDrafts[fecha] = leerContadoresDraftActual();
}

function eliminarDraftContadores(fecha) {
  if (!fecha) return;
  delete contadoresDrafts[fecha];
}

function applyContadoresDraft(fecha) {
  const draft = contadoresDrafts[fecha];
  if (!draft?.items?.length) return false;
  draft.items.forEach(item => {
    const row = document.querySelector(`#contadores-body tr[data-item-id="${item.item_id}"]`);
    if (!row) return;
    ['entradas', 'salidas', 'jackpot'].forEach(role => {
      const input = row.querySelector(`[data-role="${role}"]`);
      if (input) input.value = item[role] || '';
    });
    row.dataset.criticaAutorizada = item.critica_autorizada ? '1' : '0';
    actualizarSummaryCritica(row);
    const mapaCritica = {
      'critica-entradas': item.ref_entradas,
      'critica-salidas': item.ref_salidas,
      'critica-jackpot': item.ref_jackpot,
      'critica-observacion': item.observacion,
    };
    Object.entries(mapaCritica).forEach(([role, value]) => {
      const input = row.querySelector(`[data-role="${role}"]`);
      if (input) input.value = value || '';
    });
  });
  recalcularContadores();
  return true;
}

function crearInputContador(role, value = '') {
  return `<input type="text" inputmode="numeric" class="contador-campo" data-role="${role}" value="${value ?? value === 0 ? limpiarNumeroTexto(value) : ''}" placeholder="0" />`;
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

function formatRefTexto(fila) {
  if (!fila.referencia || fila.referencia.tipo === 'sin_referencia') {
    return 'Sin referencia previa';
  }
  const tipo = fila.referencia.tipo === 'referencia_critica'
    ? 'Crítica'
    : fila.referencia.tipo === 'referencia_inicial'
      ? 'Inicial'
      : 'Normal';
  const fecha = fila.referencia.fecha || '--';
  return `${tipo}: ${fecha}`;
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
    tr.className = fila.pausado ? 'contador-pausado' : '';

    const refTexto = formatRefTexto(fila);
    const refVisible = fila.referencia && fila.referencia.tipo !== 'sin_referencia';

    if (fila.pausado) {
      tr.innerHTML = `
        <td>
          <span class="contador-item-nombre"><span class="contador-item-id-inline">${fila.item_id}</span> ${fila.nombre}</span>
          <div class="contador-controles-inline">
            <details class="contador-pausa-detalle">
              <summary title="Reactivar máquina">▶</summary>
              <div class="contador-pausa-accion">
                <input type="password" data-role="pausa-password" placeholder="Contraseña admin" autocomplete="off" tabindex="-1" />
                <button type="button" class="btn-toggle-pausa" data-pausado="1" tabindex="-1">Confirmar reactivación</button>
                <span class="pausa-pass-error oculto"></span>
              </div>
            </details>
          </div>
        </td>
        <td>${fmt(fila.denominacion || 0)}</td>
        <td colspan="7" class="contador-pausa-celdas">— en pausa —</td>
      `;
    } else {
      tr.innerHTML = `
        <td>
          <span class="contador-item-nombre"><span class="contador-item-id-inline">${fila.item_id}</span> ${fila.nombre}</span>
          <div class="contador-controles-inline">
            ${refVisible ? `<span class="contador-ref-texto">${refTexto}</span>` : ''}
            <details class="contador-critica-detalle oculto" ${fila.usar_referencia_critica ? 'open' : ''}>
              <summary class="${fila.usar_referencia_critica ? 'autorizado' : ''}">${fila.usar_referencia_critica ? 'Autorizado' : 'Referencia crítica'}</summary>
              <div class="contador-critica">
                <div class="contador-critica-grid">
                  <input type="text" inputmode="numeric" data-role="critica-entradas" placeholder="Ref. Entradas" value="${limpiarNumeroTexto((fila.ref_entradas_guardada ?? fila.referencia?.entradas) || 0)}" />
                  <input type="text" inputmode="numeric" data-role="critica-salidas" placeholder="Ref. Salidas" value="${limpiarNumeroTexto((fila.ref_salidas_guardada ?? fila.referencia?.salidas) || 0)}" />
                  <input type="text" inputmode="numeric" data-role="critica-jackpot" placeholder="Ref. Jackpot" value="${limpiarNumeroTexto((fila.ref_jackpot_guardada ?? fila.referencia?.jackpot) || 0)}" />
                </div>
                <textarea data-role="critica-observacion" class="oculto" aria-hidden="true" tabindex="-1" readonly>${fila.observacion_referencia || fila.motivo_referencia || OBSERVACION_CRITICA_DEFAULT}</textarea>
                <div class="contador-critica-confirm">
                  <input type="password" data-role="critica-password" placeholder="Contraseña admin" autocomplete="off" />
                  <button type="button" class="btn-confirmar-critica">Confirmar</button>
                </div>
                <span class="critica-pass-error oculto"></span>
              </div>
            </details>
            <details class="contador-pausa-detalle">
              <summary title="Pausar máquina">⏸</summary>
              <div class="contador-pausa-accion">
                <input type="password" data-role="pausa-password" placeholder="Contraseña admin" autocomplete="off" tabindex="-1" />
                <button type="button" class="btn-toggle-pausa" data-pausado="0" tabindex="-1">Confirmar pausa</button>
                <span class="pausa-pass-error oculto"></span>
              </div>
            </details>
          </div>
        </td>
        <td>${fmt(fila.denominacion || 0)}</td>
        <td>${crearInputContador('entradas', fila.entradas)}</td>
        <td>${crearInputContador('salidas', fila.salidas)}</td>
        <td>${crearInputContador('jackpot', fila.jackpot)}</td>
        <td class="contador-yield" data-role="yield-actual">${limpiarNumeroTexto(fila.yield_actual || 0, true)}</td>
        <td data-role="yield-ref">${limpiarNumeroTexto(fila.referencia?.yield || 0, true)}<span class="contador-ref-texto">${fila.referencia?.fecha || 'Base 0'}</span></td>
        <td class="contador-resultado ${fila.resultado_monetario < 0 ? 'negativo' : ''}" data-role="resultado">${fmt(fila.resultado_monetario || 0)}</td>
      `;
    }
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
    // Mostrar la sección solo cuando hay alerta activa o cuando aún no se ha guardado y ya fue autorizada.
    detalleCritica.classList.toggle('oculto', !(alerta || (usaCritica && row.dataset.guardado !== '1')));
    if (row.dataset.guardado === '1') detalleCritica.open = false;
  }

  if (!tieneCaptura && !usaCritica) {
    row.querySelector('[data-role="yield-actual"]').textContent = '';
    row.querySelector('[data-role="yield-ref"]').innerHTML = `${limpiarNumeroTexto(fila.refYield, true)}<span class="contador-ref-texto">${fila.refFecha || 'Base 0'}</span>`;
    row.querySelector('[data-role="resultado"]').textContent = '';
    row.querySelector('[data-role="resultado"]').classList.remove('negativo');
    return;
  }

  if (!completa && !usaCritica) {
    row.querySelector('[data-role="yield-actual"]').textContent = '';
    row.querySelector('[data-role="yield-ref"]').innerHTML = `${limpiarNumeroTexto(fila.refYield, true)}<span class="contador-ref-texto">${fila.refFecha || 'Base 0'}</span>`;
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
  const resultado = (yieldActual - refYield) * fila.denominacion;
  row.querySelector('[data-role="yield-actual"]').textContent = limpiarNumeroTexto(yieldActual, true);
  row.querySelector('[data-role="yield-ref"]').innerHTML = `${limpiarNumeroTexto(refYield, true)}<span class="contador-ref-texto">${usaCritica ? 'Autorizado' : (fila.refFecha || 'Base 0')}</span>`;
  const resultadoEl = row.querySelector('[data-role="resultado"]');
  resultadoEl.textContent = fmt(resultado);
  resultadoEl.classList.toggle('negativo', resultado < 0);
}

function recalcularContadores() {
  let total = 0;
  document.querySelectorAll('#contadores-body tr[data-item-id]').forEach(row => {
    if (row.dataset.pausado === '1') return;
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
  // Al editar campos de referencia crítica, se pierde la autorización previa
  if (target.matches('[data-role="critica-entradas"],[data-role="critica-salidas"],[data-role="critica-jackpot"]')) {
    const row = target.closest('tr');
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
  summary.textContent = autorizado ? 'Autorizado' : 'Referencia crítica';
  summary.className = autorizado ? 'autorizado' : '';
}

function confirmarReferenciaCritica(row) {
  const passField = row.querySelector('[data-role="critica-password"]');
  const passError = row.querySelector('.critica-pass-error');
  const pass = (passField?.value || '').trim();
  const ok = adminOverride.contadores || pass === CONTRASENA;
  if (!ok) {
    if (passError) { passError.textContent = 'Contraseña incorrecta.'; passError.classList.remove('oculto'); }
    if (passField) { passField.value = ''; passField.focus(); }
    return;
  }
  if (passError) { passError.textContent = ''; passError.classList.add('oculto'); }
  if (passField) passField.value = '';
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
  const detalle = btn.closest('.contador-pausa-detalle');
  const passField = detalle?.querySelector('[data-role="pausa-password"]');
  const passError = detalle?.querySelector('.pausa-pass-error');
  const pass = (passField?.value || '').trim();
  const ok = adminOverride.contadores || pass === CONTRASENA;
  if (!ok) {
    if (passError) { passError.textContent = 'Contraseña incorrecta.'; passError.classList.remove('oculto'); }
    if (passField) { passField.value = ''; passField.focus(); }
    return;
  }
  const itemId = row.dataset.itemId;
  try {
    const res = await fetch(`/api/modulos/contadores/catalogo/${encodeURIComponent(itemId)}/pausar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pausado: !pausado }),
    });
    const data = await res.json();
    if (!data.ok) { mostrarMensaje(data.mensaje || 'Error al cambiar estado.', 'error'); return; }
    const fecha = document.getElementById('fecha')?.value;
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
  const observacion = document.getElementById('movimiento-observacion');
  if (concepto) concepto.value = '';
  if (valor) valor.value = '';
  if (observacion) observacion.value = '';
}

function actualizarAccionesBonos() {
  const esHoy = (moduleDates.bonos || hoyStr()) === hoyStr();
  const hayRegistros = document.getElementById('bonos-registros-body')?.querySelectorAll('tr').length > 0
    && !document.querySelector('#bonos-registros-body .bonos-vacio');
  document.getElementById('btn-bono-editar-ultimo').disabled = !esHoy || !hayRegistros;
  document.getElementById('btn-bono-eliminar-ultimo').disabled = !esHoy || !hayRegistros;
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
  return loanItems.reduce((acc, item) => {
    const actual = String(item.persona || '').trim().toLocaleLowerCase('es-CO');
    if (actual !== nombre) return acc;
    const valor = Number(item.valor || 0);
    if (item.tipo_movimiento === 'pago') acc.totalPagado += valor;
    else acc.totalPrestado += valor;
    acc.saldoPendiente = acc.totalPrestado - acc.totalPagado;
    return acc;
  }, { totalPrestado: 0, totalPagado: 0, saldoPendiente: 0 });
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
  if (!resumen.totalPrestado && !resumen.totalPagado) {
    hint.textContent = 'Sin movimientos previos para esta persona.';
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
    tbody.innerHTML = '<tr><td colspan="5" class="bonos-vacio">Sin registros para esta fecha.</td></tr>';
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
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.fecha_display || formatFechaVisual(item.fecha)}</td>
        <td>${item.hora_display || ''}</td>
        <td>${cliente}</td>
        <td>${fmt(valor)}</td>
        <td>${fmt(item.acumulado_cliente || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-bonos').textContent = fmt(total);
  actualizarAccionesBonos();
  actualizarAcumuladoBonoCliente();
}

function renderPrestamosRegistros(items = [], resumen = {}) {
  const tbody = document.getElementById('prestamos-registros-body');
  loanItems = Array.isArray(items) ? [...items] : [];
  tbody.innerHTML = '';
  if (!loanItems.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="bonos-vacio">Sin movimientos registrados.</td></tr>';
  } else {
    [...loanItems].reverse().forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.fecha_display || formatFechaVisual(item.fecha)}</td>
        <td>${item.hora_display || ''}</td>
        <td>${item.persona || ''}</td>
        <td>${item.tipo_movimiento === 'pago' ? 'Pago' : 'Préstamo'}</td>
        <td>${fmt(item.valor || 0)}</td>
        <td>${fmt(item.saldo_pendiente || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-prestado').textContent = fmt(resumen.total_prestado || 0);
  document.getElementById('total-pagado').textContent = fmt(resumen.total_pagado || 0);
  document.getElementById('saldo-prestamos').textContent = fmt(resumen.saldo_pendiente || 0);
  actualizarResumenPersonaPrestamo();
}

function renderMovimientosRegistros(items = [], resumen = {}) {
  const tbody = document.getElementById('movimientos-registros-body');
  movementItems = Array.isArray(items) ? [...items] : [];
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!movementItems.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="bonos-vacio">Sin registros para esta fecha.</td></tr>';
  } else {
    movementItems.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.fecha_display || formatFechaVisual(item.fecha)}</td>
        <td>${item.hora_display || ''}</td>
        <td>${item.tipo_movimiento === 'ingreso' ? 'Ingreso' : 'Salida'}</td>
        <td>${item.concepto || ''}</td>
        <td>${fmt(item.valor || 0)}</td>
        <td>${item.observacion || ''}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('total-movimientos-ingresos').textContent = fmt(resumen.total_ingresos || 0);
  document.getElementById('total-movimientos-salidas').textContent = fmt(resumen.total_salidas || 0);
  document.getElementById('total-movimientos-neto').textContent = fmt(resumen.neto || 0);
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

async function cargarPrestamosDelDia(_fecha) {
  try {
    const res = await fetch(`/api/modulos/prestamos/datos?t=${Date.now()}`, { cache: 'no-store' });
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
  if (/^\d+$/.test(cliente)) return 'El nombre del cliente no puede ser solo números.';
  if (isNaN(valor) || valor <= 0) return 'Debes ingresar un valor de bono mayor que cero.';
  return null;
}

function validarPrestamo() {
  const persona = document.getElementById('prestamo-persona').value.trim();
  const valor = parseNumeroInput('prestamo-valor');
  if (!persona) return 'Debes ingresar el nombre de la persona.';
  if (/^\d+$/.test(persona)) return 'El nombre de la persona no puede ser solo números.';
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
  if (isNaN(valor) || valor <= 0) return 'Debes ingresar un valor de movimiento mayor que cero.';
  return null;
}

function validarPlataformas() {
  const practi = parseNumeroInput('venta_practisistemas');
  const deport = parseNumeroInput('venta_deportivas', true);
  const practiVal = isNaN(practi) ? 0 : practi;
  const deportVal = isNaN(deport) ? 0 : deport;
  if (practiVal < 0) return 'La venta de Practisistemas no puede ser negativa.';
  if (practiVal === 0 && deportVal === 0) return 'Debes ingresar al menos un valor en Plataformas.';
  return null;
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
}

function eliminarDraftCaja(fecha) {
  if (!fecha) return;
  delete cajaDrafts[fecha];
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
  actualizarBonosVisuales();
  actualizarPrestamosVisuales();
  actualizarMovimientosVisuales();
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
    actualizarAccionesBonos();
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

    if (currentModule === 'cuadre') {
      if (data.existe && !adminOverride.cuadre) {
        estado.innerHTML = `El Cuadre de ${fecha} ya existe. <button class="btn-inline-editar" id="btn-inline-editar">Corregir (admin)</button>`;
        estado.className = 'fecha-estado existe';
        document.getElementById('btn-inline-editar')?.addEventListener('click', () => autorizarModulo());
        return;
      }
      if (adminOverride.cuadre) {
        estado.textContent = `Corrección de Cuadre autorizada para ${fecha}.`;
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
        ? `Período: ${data.periodo[0]} → ${fecha} (${dias} días del período)`
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

      if (adminOverride.plataformas) {
        estado.textContent = `Corrección de plataformas autorizada para ${fecha}.`;
        estado.className = 'fecha-estado advertencia-fecha';
        return;
      }

      estado.innerHTML = `Para guardar plataformas en ${fecha} necesitas admin. <button class="btn-inline-editar" id="btn-inline-editar">Autorizar</button>`;
      estado.className = 'fecha-estado existe';
      btnGuardar.disabled = true;
      document.getElementById('btn-inline-editar')?.addEventListener('click', () => autorizarModulo());
      return;
    }

    if (currentModule === 'contadores') {
      if (data.existe && !adminOverride.contadores) {
        estado.innerHTML = `Contadores de ${fecha} ya existen. <button class="btn-inline-editar" id="btn-inline-editar">Corregir (admin)</button>`;
        estado.className = 'fecha-estado existe';
        btnGuardar.disabled = true;
        document.getElementById('btn-inline-editar')?.addEventListener('click', () => autorizarModulo());
        return;
      }

      if (adminOverride.contadores) {
        estado.textContent = `Corrección de contadores autorizada para ${fecha}.`;
        estado.className = 'fecha-estado advertencia-fecha';
        return;
      }

      estado.textContent = 'Fecha disponible para capturar contadores.';
      estado.className = 'fecha-estado libre';
      return;
    }

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
    : modulo === 'contadores'
      ? `Los contadores del ${fecha} ya fueron registrados. Ingrese la contraseña para corregirlos o aplicar referencias críticas.`
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
    const estadoRes = await fetch(`/api/modulos/caja/fecha/${fecha}/estado`);
    const estado = estadoRes.ok ? await estadoRes.json() : { existe: false };

    if (!estado.existe) {
      setCajaEditable(true);
      if (!aplicarDraftCaja(fecha)) limpiarCaja();
      return;
    }

    // La caja existe: siempre cargar y mostrar los datos guardados.
    // Si hay override de admin se habilita edición; si no, solo lectura.
    const res = await fetch(`/api/modulos/caja/fecha/${fecha}/datos`);
    if (!res.ok) {
      limpiarCaja();
      setCajaEditable(adminOverride.caja);
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
    setCajaEditable(adminOverride.caja);
  } catch {
    if (!aplicarDraftCaja(fecha)) limpiarCaja();
    setCajaEditable(true);
  }
}

async function cargarDatosPlataformas(fecha) {
  try {
    const res = await fetch(`/api/modulos/plataformas/fecha/${fecha}/datos`);
    if (!res.ok) {
      limpiarPlataformas();
      return;
    }
    const data = await res.json();
    setNumeroInputValue('venta_practisistemas', data.venta_practisistemas || '');
    setNumeroInputValue('venta_deportivas', data.venta_deportivas || '', true);
    calcularPlataformas();
  } catch {
    limpiarPlataformas();
  }
}

async function cargarDatosModuloItems(modulo, fecha) {
  if (modulo === 'contadores') {
    await cargarDatosContadores(fecha);
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
    if (!data.existe && !adminOverride.contadores) {
      setContadoresEditable(true);
      applyContadoresDraft(fecha);
    } else {
      setContadoresEditable(Boolean(adminOverride.contadores) || !data.existe);
      if (!data.existe) applyContadoresDraft(fecha);
    }
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
    body: JSON.stringify({ fecha, persona, tipo_movimiento, valor, forzar: adminOverride.prestamos }),
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
  resetOverride('prestamos');
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
  const observacion = document.getElementById('movimiento-observacion').value.trim();

  const res = await fetch('/api/modulos/movimientos/registrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, tipo_movimiento, concepto, valor, observacion, forzar: adminOverride.movimientos }),
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
  resetOverride('movimientos');
  await verificarFechaActual();
  document.getElementById('movimiento-concepto').focus();
}

function validarGasto() {
  const concepto = document.getElementById('gasto-concepto').value.trim();
  const valorRaw = document.getElementById('gasto-valor').value;
  const valor = valorRaw === '' ? 0 : parseNumeroTexto(valorRaw);
  if (!concepto) return 'Debes ingresar la descripción del gasto.';
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
    body: JSON.stringify({ fecha, items: [{ concepto, valor }], forzar: adminOverride.gastos }),
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
  resetOverride('gastos');
  await verificarFechaActual();
  document.getElementById('gasto-concepto').focus();
}

function validarContadores() {
  const rows = [...document.querySelectorAll('#contadores-body tr[data-item-id]')];
  if (!rows.length) return 'No hay ítems configurados en Contadores.';

  for (const row of rows) {
    if (row.dataset.pausado === '1') continue;
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
      return `${row.dataset.nombre}: hay valores menores a la referencia en Entradas, Salidas o Jackpot. Abre "Referencia crítica", ajusta los valores y confirma con la contraseña.`;
    }

    if (usaCritica) {
      const observacion = row.querySelector('[data-role="critica-observacion"]');
      if (observacion && !observacion.value.trim()) observacion.value = OBSERVACION_CRITICA_DEFAULT;
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
    .filter(row => row.dataset.pausado !== '1')
    .map(row => {
    const usarReferenciaCritica = row.dataset.criticaAutorizada === '1';
    const observacionCritica = usarReferenciaCritica
      ? (row.querySelector('[data-role="critica-observacion"]')?.value.trim() || OBSERVACION_CRITICA_DEFAULT)
      : null;
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
        observacion: observacionCritica,
      } : null,
    };
    return item;
  });

  const res = await fetch('/api/modulos/contadores/guardar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fecha, items, forzar: adminOverride.contadores || items.some(i => i.usar_referencia_critica) }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }

  eliminarDraftContadores(fecha);
  resetOverride('contadores');
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

async function editarUltimoBono() {
  const error = validarBono();
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }
  const fecha = document.getElementById('fecha').value;
  const cliente = document.getElementById('bono-cliente').value.trim();
  const valor = parseNumeroInput('bono-valor');
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
          forzar: adminOverride.caja,
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
          forzar: adminOverride.plataformas,
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
      resetOverride('caja');
      moduleDates.caja = fecha;
      document.getElementById('fecha').value = fecha;
      eliminarDraftCaja(fecha);
      limpiarCaja();
      setCajaEditable(false);
      mostrarMensaje(`✓ ${data.mensaje} — Total caja física: ${fmt(data.total_caja_fisica)} — ${data.fecha_hora_registro.slice(0, 10)} ${hora12}`, 'ok');
    } else if (currentModule === 'plataformas') {
      resetOverride('plataformas');
      moduleDates.plataformas = fecha;
      document.getElementById('fecha').value = fecha;
      await cargarVistaModulo('plataformas', fecha);
      mostrarMensaje(`✓ ${data.mensaje} — Total plataformas: ${fmt(data.total_plataformas)} — ${data.fecha_hora_registro.slice(0, 10)} ${hora12}`, 'ok');
    } else if (currentModule === 'bonos' || currentModule === 'prestamos') {
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

  try {
    await cargarCatalogosAdmin();
  } catch { /* ignore */ }
  try {
    await cargarStartupAdmin();
  } catch { /* ignore */ }

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
    configDefaultDate = body.default_date;
    configModoEntrada = body.modo_entrada;
    enabledModules = body.enabled_modules;
    defaultModule = body.default_module;
    configSede = body.sede || 'Principal';
    configDataDir = body.data_dir;
    await cargarBonusNames();
    await cargarLoanNames();
    await cargarExpenseConcepts();
    await cargarMovementConcepts();
    await cargarContadoresCatalogo();

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
  await cargarBonusNames();
  await cargarLoanNames();
  await cargarExpenseConcepts();
  await cargarMovementConcepts();
  await cargarContadoresCatalogo();

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
    plataformas: sugerirFechaModulo('plataformas'),
    gastos: sugerirFechaModulo('gastos'),
    bonos: sugerirFechaModulo('bonos'),
    prestamos: sugerirFechaModulo('prestamos'),
    movimientos: sugerirFechaModulo('movimientos'),
    contadores: sugerirFechaModulo('contadores'),
    cuadre: sugerirFechaModulo('cuadre'),
  };
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

  ['venta_practisistemas', 'venta_deportivas'].forEach(id => {
    const el = document.getElementById(id);
    const allowNegative = id === 'venta_deportivas';
    formatearInputNumerico(el, allowNegative);
    el.addEventListener('input', calcularPlataformas);
    el.addEventListener('input', () => formatearInputNumerico(el, allowNegative));
    el.addEventListener('focus', () => limpiarFormatoInputNumerico(el, allowNegative));
    el.addEventListener('blur', () => formatearInputNumerico(el, allowNegative));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-guardar').focus();
      }
    });
  });

  document.getElementById('fecha').addEventListener('change', e => {
    const fechaAnterior = moduleDates[currentModule];
    if (currentModule === 'caja') guardarDraftCaja(fechaAnterior);
    if (currentModule === 'contadores') guardarDraftContadores(fechaAnterior);
    moduleDates[currentModule] = e.target.value;
    if (currentModule !== 'caja') resetOverride(currentModule);
    if (currentModule === 'caja') resetOverride('caja');
    if (currentModule === 'bonos') {
      limpiarFormularioBonos();
      actualizarBonosVisuales();
      actualizarAccionesBonos();
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
  document.getElementById('btn-cancelar-edicion').addEventListener('click', async () => {
    resetOverride(currentModule);
    moduleDates[currentModule] = sugerirFechaModulo(currentModule);
    aplicarFechaModulo(currentModule);
    if (currentModule === 'bonos') limpiarFormularioBonos();
    if (currentModule === 'prestamos') limpiarFormularioPrestamos();
    if (currentModule === 'movimientos') limpiarFormularioMovimientos();
    await cargarVistaModulo(currentModule, moduleDates[currentModule]);
    await verificarFechaActual();
  });

  document.getElementById('btn-admin').addEventListener('click', abrirAdmin);
  document.getElementById('btn-admin-cancelar').addEventListener('click', cerrarAdmin);
  document.getElementById('btn-admin-cerrar').addEventListener('click', cerrarAdmin);
  document.getElementById('btn-admin-ingresar').addEventListener('click', ingresarAdmin);
  document.getElementById('btn-admin-guardar').addEventListener('click', guardarAdmin);
  document.getElementById('btn-admin-buscar-carpeta').addEventListener('click', buscarCarpetaDatos);
  document.getElementById('btn-admin-contadores-add').addEventListener('click', () => {
    const body = document.getElementById('admin-contadores-grid-body');
    const fila = _crearFilaCatalogoContadores();
    body.appendChild(fila);
    fila.querySelector('[data-field="item_id"]')?.focus();
  });
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
  document.getElementById('btn-prestamo-registrar').addEventListener('click', registrarPrestamo);
  document.getElementById('btn-gasto-registrar').addEventListener('click', registrarGasto);
  document.getElementById('btn-movimiento-registrar').addEventListener('click', registrarMovimiento);
  document.getElementById('btn-cuadre-guardar').addEventListener('click', guardarCuadre);
  const cuadreBaseInput = document.getElementById('cuadre-base-input');
  cuadreBaseInput.addEventListener('input', () => formatearInputNumerico(cuadreBaseInput, false));
  cuadreBaseInput.addEventListener('focus', () => limpiarFormatoInputNumerico(cuadreBaseInput, false));
  cuadreBaseInput.addEventListener('blur', () => formatearInputNumerico(cuadreBaseInput, false));
  document.getElementById('btn-bono-editar-ultimo').addEventListener('click', editarUltimoBono);
  document.getElementById('btn-bono-eliminar-ultimo').addEventListener('click', eliminarUltimoBono);
  document.getElementById('contadores-body').addEventListener('click', e => {
    if (e.target.matches('.btn-confirmar-critica')) {
      confirmarReferenciaCritica(e.target.closest('tr'));
    }
    if (e.target.matches('.btn-toggle-pausa')) {
      togglePausaContador(e.target);
    }
  });
  document.getElementById('contadores-body').addEventListener('input', e => {
    if (e.target.matches('.contador-campo, .contador-critica input, .contador-critica textarea')) {
      manejarEventoContadores(e.target);
    }
  });
  document.getElementById('contadores-body').addEventListener('change', e => {
    if (e.target.matches('.contador-campo, .contador-critica input, .contador-critica textarea, .contador-critica-check')) {
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
    if (e.key === 'Enter' && e.target.matches('[data-role="critica-password"]')) {
      e.preventDefault();
      confirmarReferenciaCritica(e.target.closest('tr'));
      return;
    }
    if (e.key === 'Enter' && e.target.matches('.contador-campo')) {
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
      document.getElementById('movimiento-observacion').focus();
      document.getElementById('movimiento-observacion').select();
    }
  });
  document.getElementById('movimiento-observacion').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
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
  document.getElementById('modal-editar').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModalEditar();
  });
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
    if (estado.existe && !adminOverride.cuadre) {
      const datosRes = await fetch(`/api/modulos/cuadre/fecha/${fecha}/datos`);
      if (datosRes.ok) {
        renderCuadreGuardado(await datosRes.json(), fecha);
        contenido.classList.remove('oculto');
        return;
      }
    }

    // Precondiciones no cumplidas → bloquear
    if (!estado.ok) {
      document.getElementById('cuadre-bloqueado-msg').textContent = estado.mensaje;
      bloqueado.classList.remove('oculto');
      return;
    }

    // Calcular
    const calcRes = await fetch(`/api/modulos/cuadre/calcular/${fecha}`);
    const datos = await calcRes.json();
    if (!datos.ok) {
      document.getElementById('cuadre-bloqueado-msg').textContent = datos.mensaje;
      bloqueado.classList.remove('oculto');
      return;
    }

    cuadreDatos = { ...datos, fecha };
    renderCuadre(datos, estado.existe && adminOverride.cuadre);
    contenido.classList.remove('oculto');
  } catch {
    document.getElementById('cuadre-bloqueado-msg').textContent = 'Error al cargar los datos del cuadre.';
    bloqueado.classList.remove('oculto');
  }
}

function renderCuadre(datos, esOverride) {
  // Período
  const periodo = datos.periodo || [];
  const txtPeriodo = periodo.length > 1
    ? `Período: ${periodo[0]} → ${periodo[periodo.length - 1]} (${periodo.length} días del período)`
    : periodo.length === 1 ? `Fecha: ${periodo[0]}` : 'Sin días en el período';
  document.getElementById('cuadre-periodo-texto').textContent = txtPeriodo;

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
  const netoPrestEl = document.getElementById('cuadre-prestamos-neto');
  netoPrestEl.textContent = fmt(netoPrest);
  netoPrestEl.className = 'resumen-valor ' + (netoPrest >= 0 ? 'cuadre-positivo' : 'cuadre-negativo');
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
  const netoMovEl = document.getElementById('cuadre-mov-neto');
  netoMovEl.textContent = fmt(netoMov);
  netoMovEl.className = 'resumen-valor ' + (netoMov >= 0 ? 'cuadre-positivo' : 'cuadre-negativo');

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
  document.getElementById('cuadre-caja-total').textContent = fmt(datos.caja_fisica ?? 0);

  // Balance
  document.getElementById('cuadre-balance-base').textContent = fmt(datos.base_anterior ?? 0);
  document.getElementById('cuadre-teorica').textContent = fmt(datos.caja_teorica ?? 0);
  document.getElementById('cuadre-fisica').textContent = fmt(datos.caja_fisica ?? 0);
  document.getElementById('cuadre-base-nueva').textContent = fmt(datos.base_nueva ?? 0);
  const dif = datos.diferencia ?? 0;
  const difEl = document.getElementById('cuadre-diferencia');
  difEl.textContent = fmt(dif);
  difEl.className = 'resumen-valor ' + (dif === 0 ? '' : dif > 0 ? 'cuadre-positivo' : 'cuadre-negativo');
  document.getElementById('cuadre-diferencia-label').textContent =
    dif === 0 ? 'CUADRE EXACTO' : dif > 0 ? 'SOBRANTE' : 'FALTANTE';

  // Botones
  document.getElementById('cuadre-acciones').classList.remove('oculto');
  document.getElementById('cuadre-guardado-info').classList.add('oculto');
}

function renderCuadreGuardado(datos, fecha) {
  document.getElementById('cuadre-periodo-texto').textContent =
    `Período: ${datos.fecha_inicio_periodo} → ${fecha} — Guardado: ${datos.fecha_hora_registro}`;

  document.getElementById('cuadre-base-display').textContent = fmt(datos.base_anterior);
  document.getElementById('cuadre-base-display').classList.remove('oculto');
  document.getElementById('cuadre-base-input-wrap').classList.add('oculto');

  // Secciones simplificadas con totales guardados
  document.getElementById('cuadre-contadores-body').innerHTML =
    `<tr><td colspan="4" class="bonos-vacio cuadre-resumen-guardado">Total: ${fmt(datos.total_contadores)}</td></tr>`;
  document.getElementById('cuadre-contadores-total').textContent = fmt(datos.total_contadores);

  document.getElementById('cuadre-bonos-body').innerHTML =
    `<tr><td colspan="2" class="bonos-vacio cuadre-resumen-guardado">Total: ${fmt(datos.total_bonos)}</td></tr>`;
  document.getElementById('cuadre-bonos-total').textContent = fmt(datos.total_bonos);

  document.getElementById('cuadre-plataformas-practi').textContent = fmt(datos.total_practisistemas);
  const cuadrePlatDeport = document.getElementById('cuadre-plataformas-deport');
  cuadrePlatDeport.textContent = fmt(datos.total_deportivas);
  cuadrePlatDeport.className = 'resumen-valor' + (datos.total_deportivas < 0 ? ' cuadre-negativo' : '');
  document.getElementById('cuadre-plataformas-total').textContent = fmt((datos.total_practisistemas || 0) + (datos.total_deportivas || 0));

  document.getElementById('cuadre-gastos-body').innerHTML =
    `<tr><td colspan="2" class="bonos-vacio cuadre-resumen-guardado">Total: ${fmt(datos.total_gastos)}</td></tr>`;
  document.getElementById('cuadre-gastos-total').textContent = fmt(datos.total_gastos);

  document.getElementById('cuadre-prestamos-salida').textContent = fmt(datos.total_prestamos_salida);
  document.getElementById('cuadre-prestamos-entrada').textContent = fmt(datos.total_prestamos_entrada);
  document.getElementById('cuadre-prestamos-neto').textContent = fmt(datos.neto_prestamos);
  document.getElementById('cuadre-prestamos-detalle-wrap').classList.add('oculto');

  document.getElementById('cuadre-mov-ingresos').textContent = fmt(datos.total_mov_ingresos);
  document.getElementById('cuadre-mov-salidas').textContent = fmt(datos.total_mov_salidas);
  document.getElementById('cuadre-mov-neto').textContent = fmt(datos.neto_movimientos ?? 0);

  document.getElementById('cuadre-caja-body').innerHTML = '';
  document.getElementById('cuadre-caja-monedas').textContent = '';
  document.getElementById('cuadre-caja-viejos').textContent = '';
  document.getElementById('cuadre-caja-total').textContent = fmt(datos.caja_fisica);

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
  info.textContent = `Cuadre guardado. Para corregir usa el botón admin.`;
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
    body: JSON.stringify({ fecha, base_anterior, forzar: adminOverride.cuadre }),
  });
  const data = await res.json();
  if (!data.ok) {
    mostrarMensaje(data.mensaje, 'advertencia');
    return;
  }
  resetOverride('cuadre');
  await cargarDatosCuadre(fecha);
  await verificarFechaActual();
  const tipo = data.diferencia === 0 ? 'ok' : 'advertencia';
  const label = data.diferencia === 0 ? 'Cuadre exacto' : data.diferencia > 0 ? `Sobrante: ${fmt(data.diferencia)}` : `Faltante: ${fmt(data.diferencia)}`;
  mostrarMensaje(`✓ ${data.mensaje} — ${label}`, tipo);
}

// ─── FIN CUADRE ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
