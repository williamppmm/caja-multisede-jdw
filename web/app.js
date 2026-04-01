// ─── Constantes y estado ──────────────────────────────────────────────────────

const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000];
const CONTRASENA = '1980';

let modoEdicion        = false;
let fechaPendienteEdicion = null;
let configDefaultDate  = 'today';
let configModoEntrada  = 'cantidad';
let configSede         = 'Principal';
let configDataDir      = '';
let debounceTimer      = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function hoyStr()  { return dateToStr(new Date()); }
function ayerStr() {
  const d = new Date();
  return dateToStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

function fechaDefault() {
  return configDefaultDate === 'yesterday' ? ayerStr() : hoyStr();
}

function mostrarMensaje(texto, tipo) {
  const el = document.getElementById('mensaje');
  el.textContent = texto;
  el.className = 'mensaje ' + tipo;
}

function ocultarMensaje() {
  document.getElementById('mensaje').className = 'mensaje oculto';
}

function previewExcelAnual() {
  const year = new Date().getFullYear();
  return `Caja_${year}.xlsx`;
}

function actualizarPreviewRutaAdmin() {
  const input = document.getElementById('admin-data-dir');
  const preview = document.getElementById('admin-excel-preview');
  if (!input || !preview) return;
  const dir = input.value.trim();
  preview.textContent = dir ? `${dir}\\${previewExcelAnual()}` : previewExcelAnual();
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

// ─── Tabla de billetes ────────────────────────────────────────────────────────

function buildTablaBilletes() {
  const tbody = document.getElementById('tbody-billetes');
  DENOMINACIONES.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>$ ${d.toLocaleString('es-CO')}</td>
      <td><input type="number" id="cant_${d}" min="0" placeholder="0" step="1" class="input-billete" /></td>
      <td><input type="number" id="sub_${d}"  min="0" placeholder="0" step="${d}" class="input-billete" /></td>
    `;
    tbody.appendChild(tr);
  });
}

function camposEditablesBilletes() {
  // Devuelve los inputs editables de la tabla en orden, más los campos manuales
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
    const sub  = document.getElementById(`sub_${d}`);
    cant.readOnly  = !esCantidad;
    sub.readOnly   =  esCantidad;
    cant.tabIndex  = esCantidad ? 0 : -1;
    sub.tabIndex   = esCantidad ? -1 : 0;
    cant.classList.toggle('input-readonly', !esCantidad);
    sub.classList.toggle('input-readonly',   esCantidad);
  });
}

function moverAlSiguiente(inputActual) {
  const campos = camposEditablesBilletes();
  const idx    = campos.indexOf(inputActual);
  if (idx !== -1 && idx < campos.length - 1) {
    campos[idx + 1].focus();
    campos[idx + 1].select();
  }
}

function calcular() {
  let totalBilletes = 0;
  DENOMINACIONES.forEach(d => {
    if (configModoEntrada === 'cantidad') {
      const cant = parseInt(document.getElementById(`cant_${d}`).value, 10);
      const c    = isNaN(cant) || cant < 0 ? 0 : cant;
      const sub  = c * d;
      totalBilletes += sub;
      document.getElementById(`sub_${d}`).value = sub > 0 ? sub : '';
    } else {
      const sub  = parseFloat(document.getElementById(`sub_${d}`).value) || 0;
      const cant = sub > 0 ? sub / d : 0;
      totalBilletes += sub;
      const cantStr = cant > 0 ? (cant % 1 === 0 ? String(cant) : cant.toFixed(2)) : '';
      document.getElementById(`cant_${d}`).value = cantStr;
    }
  });

  const monedas  = parsePositivo('total_monedas');
  const viejos   = parsePositivo('billetes_viejos');
  const practi   = parsePositivo('venta_practisistemas');
  const deport   = parseFloat(document.getElementById('venta_deportivas').value) || 0;
  const totalCaja = totalBilletes + monedas + viejos;

  document.getElementById('total-billetes').textContent         = '$ ' + totalBilletes.toLocaleString('es-CO');
  document.getElementById('resumen-billetes').textContent       = fmt(totalBilletes);
  document.getElementById('resumen-monedas').textContent        = fmt(monedas);
  document.getElementById('resumen-viejos').textContent         = fmt(viejos);
  document.getElementById('resumen-total').textContent          = fmt(totalCaja);
  document.getElementById('resumen-practisistemas').textContent = fmt(practi);
  document.getElementById('resumen-deportivas').textContent     = fmt(deport);
  actualizarEstadoDeportivas();
}

// ─── Verificar fecha ──────────────────────────────────────────────────────────

async function verificarFecha(fecha) {
  const estado     = document.getElementById('fecha-estado');
  const btnGuardar = document.getElementById('btn-guardar');

  if (!fecha) {
    estado.textContent = '';
    estado.className   = 'fecha-estado';
    return;
  }

  const hoy  = hoyStr();
  const ayer = ayerStr();

  // Fecha futura — bloquear
  if (fecha > hoy) {
    estado.textContent = 'Esta fecha aún no ha llegado. No es posible registrar una caja futura.';
    estado.className   = 'fecha-estado futura';
    if (!modoEdicion) btnGuardar.disabled = true;
    return;
  }

  btnGuardar.disabled = false;

  // Consultar si ya tiene datos
  try {
    const res  = await fetch(`/api/caja/fecha/${fecha}`);
    const data = await res.json();

    if (data.existe) {
      if (modoEdicion) {
        // Ya estamos en modo edición — mostrar aviso suave
        estado.textContent = 'Modo edición activo — los datos actuales serán reemplazados al guardar.';
        estado.className   = 'fecha-estado advertencia-fecha';
      } else {
        // Bloquear y ofrecer corrección con contraseña
        estado.innerHTML = 'El arqueo de este día ya fue realizado. '
          + '<button class="btn-inline-editar" id="btn-inline-editar">Corregir (admin)</button>';
        estado.className = 'fecha-estado existe';
        btnGuardar.disabled = true;
        document.getElementById('btn-inline-editar')
          ?.addEventListener('click', () => abrirModalEditar(fecha));
      }
    } else {
      // Sin datos — advertir si no es hoy ni ayer
      if (fecha === hoy || fecha === ayer) {
        estado.textContent = 'Fecha disponible.';
        estado.className   = 'fecha-estado libre';
      } else {
        estado.textContent = `Atención: ${fecha} no es hoy ni ayer. Verifique antes de guardar.`;
        estado.className   = 'fecha-estado advertencia-fecha';
      }
    }
  } catch {
    estado.textContent = '';
  }
}

// ─── Modo edición ─────────────────────────────────────────────────────────────

function exitarEdicion() {
  modoEdicion = false;
  document.getElementById('banner-edicion').classList.add('oculto');
  document.getElementById('btn-guardar').textContent = 'Guardar';
  document.getElementById('btn-guardar').disabled    = false;
}

async function activarEdicion(fecha) {
  modoEdicion = true;
  document.getElementById('banner-fecha').textContent = fecha;
  document.getElementById('banner-edicion').classList.remove('oculto');
  document.getElementById('btn-guardar').textContent  = 'Actualizar';
  document.getElementById('btn-guardar').disabled     = false;
  document.getElementById('fecha').value = fecha;
  limpiarCampos();
  await cargarDatosExistentes(fecha);
  verificarFecha(fecha);
}

function cancelarEdicion() {
  exitarEdicion();
  limpiar();
  const fd = fechaDefault();
  document.getElementById('fecha').value = fd;
  verificarFecha(fd);
}

async function cargarDatosExistentes(fecha) {
  try {
    const res = await fetch(`/api/caja/fecha/${fecha}/datos`);
    if (!res.ok) return;
    const data = await res.json();
    DENOMINACIONES.forEach(d => {
      const cantidad = data.billetes?.[String(d)] ?? 0;
      document.getElementById(`cant_${d}`).value = cantidad || '';
      document.getElementById(`sub_${d}`).value  = cantidad ? cantidad * d : '';
    });

    const v = (x) => x || '';
    document.getElementById('total_monedas').value        = v(data.total_monedas);
    document.getElementById('billetes_viejos').value      = v(data.billetes_viejos);
    document.getElementById('venta_practisistemas').value = v(data.venta_practisistemas);
    document.getElementById('venta_deportivas').value     = data.venta_deportivas !== 0 ? data.venta_deportivas : '';
    calcular();
  } catch { /* ignorar */ }
}

// ─── Modal: corrección de arqueo existente ────────────────────────────────────

function abrirModalEditar(fecha) {
  fechaPendienteEdicion = fecha;
  document.getElementById('modal-editar-fecha').textContent = fecha;
  document.getElementById('editar-pass').value = '';
  document.getElementById('editar-pass-error').classList.add('oculto');
  document.getElementById('modal-editar').classList.remove('oculto');
  setTimeout(() => document.getElementById('editar-pass').focus(), 50);
}

function cerrarModalEditar() {
  fechaPendienteEdicion = null;
  document.getElementById('modal-editar').classList.add('oculto');
}

function confirmarEdicion() {
  if (document.getElementById('editar-pass').value !== CONTRASENA) {
    document.getElementById('editar-pass-error').classList.remove('oculto');
    return;
  }
  const fecha = fechaPendienteEdicion;
  cerrarModalEditar();
  ocultarMensaje();
  activarEdicion(fecha);
}

// ─── Modal: admin ─────────────────────────────────────────────────────────────

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
    const res      = await fetch('/api/settings');
    const settings = await res.json();

    const radioFecha = document.querySelector(`input[name="default_date"][value="${settings.default_date || 'today'}"]`);
    if (radioFecha) radioFecha.checked = true;

    const radioModo = document.querySelector(`input[name="modo_entrada"][value="${settings.modo_entrada || 'cantidad'}"]`);
    if (radioModo) radioModo.checked = true;

    document.getElementById('admin-sede').value = settings.sede || '';
    document.getElementById('admin-data-dir').value = settings.data_dir || '';
    actualizarPreviewRutaAdmin();
  } catch { /* usar defaults */ }

  document.getElementById('admin-login-section').classList.add('oculto');
  document.getElementById('admin-config-section').classList.remove('oculto');
}

async function guardarAdmin() {
  const valFecha = document.querySelector('input[name="default_date"]:checked')?.value || 'today';
  const valModo  = document.querySelector('input[name="modo_entrada"]:checked')?.value  || 'cantidad';
  const valSede  = document.getElementById('admin-sede').value.trim();
  const valDataDir = document.getElementById('admin-data-dir').value.trim();
  const msg      = document.getElementById('admin-config-msg');
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_date: valFecha, modo_entrada: valModo, sede: valSede, data_dir: valDataDir }),
    });
    configDefaultDate = valFecha;
    configModoEntrada = valModo;
    configSede = valSede || 'Principal';
    configDataDir = valDataDir;
    aplicarModoEntrada();
    calcular();
    actualizarPreviewRutaAdmin();
    msg.textContent = `Configuración guardada. Hoja activa: ${configSede}`;
    msg.className   = 'config-msg ok';
    msg.classList.remove('oculto');
    setTimeout(() => msg.classList.add('oculto'), 2000);
  } catch {
    msg.textContent = 'Error al guardar.';
    msg.className   = 'config-msg error';
    msg.classList.remove('oculto');
  }
}

async function buscarCarpetaExcel() {
  const msg = document.getElementById('admin-config-msg');
  try {
    const res = await fetch('/api/settings/browse-folder', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) return;
    document.getElementById('admin-data-dir').value = data.data_dir || '';
    actualizarPreviewRutaAdmin();
  } catch {
    msg.textContent = 'No se pudo abrir el selector de carpetas.';
    msg.className   = 'config-msg error';
    msg.classList.remove('oculto');
  }
}

async function buscarDesdeExcel() {
  const msg = document.getElementById('admin-config-msg');
  try {
    const res = await fetch('/api/settings/browse-excel', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) return;
    document.getElementById('admin-data-dir').value = data.data_dir || '';
    actualizarPreviewRutaAdmin();
  } catch {
    msg.textContent = 'No se pudo abrir el selector de archivos Excel.';
    msg.className   = 'config-msg error';
    msg.classList.remove('oculto');
  }
}

async function cerrarAplicacion() {
  const confirmar = window.confirm('La capturadora se cerrará en este equipo. ¿Desea finalizar ahora?');
  if (!confirmar) return;

  const msg = document.getElementById('admin-config-msg');
  const msgPrincipal = document.getElementById('mensaje');
  try {
    await fetch('/api/app/shutdown', { method: 'POST' });
    msg.textContent = 'La aplicación se está cerrando.';
    msg.className   = 'config-msg ok';
    msg.classList.remove('oculto');
    msgPrincipal.textContent = 'La aplicación se está cerrando...';
    msgPrincipal.className = 'mensaje ok';
    setTimeout(() => { window.close(); }, 300);
  } catch {
    msg.textContent = 'No se pudo cerrar la aplicación desde la interfaz.';
    msg.className   = 'config-msg error';
    msg.classList.remove('oculto');
    msgPrincipal.textContent = 'No se pudo cerrar la aplicación desde la interfaz.';
    msgPrincipal.className = 'mensaje error';
  }
}

// ─── Validación ───────────────────────────────────────────────────────────────

function validarFormulario() {
  if (!document.getElementById('fecha').value) return 'Debe seleccionar una fecha.';

  for (const d of DENOMINACIONES) {
    if (configModoEntrada === 'cantidad') {
      const raw = document.getElementById(`cant_${d}`).value;
      const val = raw === '' ? 0 : Number(raw);
      if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
        return `Cantidad inválida para $ ${d.toLocaleString('es-CO')}. Debe ser un entero >= 0.`;
      }
    } else {
      const raw = document.getElementById(`sub_${d}`).value;
      const val = raw === '' ? 0 : parseFloat(raw);
      if (isNaN(val) || val < 0) {
        return `Total inválido para $ ${d.toLocaleString('es-CO')}. Debe ser >= 0.`;
      }
      if (val > 0 && val % d !== 0) {
        return `$ ${val.toLocaleString('es-CO')} no es múltiplo de $ ${d.toLocaleString('es-CO')}.`;
      }
    }
  }

  for (const id of ['total_monedas', 'billetes_viejos', 'venta_practisistemas']) {
    const raw = document.getElementById(id).value;
    const val = raw === '' ? 0 : Number(raw);
    if (isNaN(val) || val < 0) {
      return `Valor inválido en "${id.replace(/_/g, ' ')}". Debe ser >= 0.`;
    }
  }

  const vdRaw = document.getElementById('venta_deportivas').value;
  const vd = vdRaw === '' ? 0 : Number(vdRaw);
  if (isNaN(vd)) return 'Valor inválido en "venta deportivas".';

  return null;
}

// ─── Guardar ──────────────────────────────────────────────────────────────────

async function guardar() {
  ocultarMensaje();
  const error = validarFormulario();
  if (error) { mostrarMensaje(error, 'error'); return; }

  const fecha    = document.getElementById('fecha').value;
  const billetes = {};
  DENOMINACIONES.forEach(d => {
    if (configModoEntrada === 'cantidad') {
      billetes[String(d)] = parseInt(document.getElementById(`cant_${d}`).value, 10) || 0;
    } else {
      const sub = parseFloat(document.getElementById(`sub_${d}`).value) || 0;
      billetes[String(d)] = Math.round(sub / d);
    }
  });

  const payload = {
    fecha,
    billetes,
    total_monedas:        parsePositivo('total_monedas'),
    billetes_viejos:      parsePositivo('billetes_viejos'),
    venta_practisistemas: parsePositivo('venta_practisistemas'),
    venta_deportivas:     parseFloat(document.getElementById('venta_deportivas').value) || 0,
    forzar: modoEdicion,
  };

  const btn = document.getElementById('btn-guardar');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    const res  = await fetch('/api/caja/guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.ok) {
      const dt     = new Date(data.fecha_hora_registro);
      const hora12 = dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      const resumen = `✓ ${data.mensaje} — Total caja física: ${fmt(data.total_caja_fisica)} — ${data.fecha_hora_registro.slice(0,10)} ${hora12}`;
      if (modoEdicion) exitarEdicion();
      limpiar();
      mostrarMensaje(resumen, 'ok'); // limpiar() llama ocultarMensaje, así que va después
      verificarFecha(fecha);
    } else {
      mostrarMensaje(data.mensaje, 'advertencia');
    }
  } catch {
    mostrarMensaje('Error de conexión con el servidor.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = modoEdicion ? 'Actualizar' : 'Guardar';
  }
}

// ─── Limpiar ──────────────────────────────────────────────────────────────────

function limpiarCampos() {
  DENOMINACIONES.forEach(d => {
    document.getElementById(`cant_${d}`).value = '';
    document.getElementById(`sub_${d}`).value  = '';
  });
  ['total_monedas', 'billetes_viejos', 'venta_practisistemas', 'venta_deportivas']
    .forEach(id => { document.getElementById(id).value = ''; });
}

function limpiar() {
  limpiarCampos();
  calcular();
  ocultarMensaje();
}

// ─── Último registro ──────────────────────────────────────────────────────────

async function ultimoRegistro() {
  try {
    const res  = await fetch('/api/caja/ultima');
    const data = await res.json();
    mostrarMensaje(
      data.fecha ? `Último registro guardado: ${data.fecha}` : 'Sin registros guardados este año.',
      data.fecha ? 'ok' : 'advertencia'
    );
  } catch {
    mostrarMensaje('Error al consultar el último registro.', 'error');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  buildTablaBilletes();

  try {
    const res      = await fetch('/api/settings');
    const settings = await res.json();
    configDefaultDate = settings.default_date || 'today';
    configModoEntrada = settings.modo_entrada  || 'cantidad';
    configSede = settings.sede || 'Principal';
    configDataDir = settings.data_dir || '';
  } catch { /* usar defaults */ }

  aplicarModoEntrada();

  const fd = fechaDefault();
  document.getElementById('fecha').value = fd;
  verificarFecha(fd);

  // Inputs de cálculo + Enter para avanzar
  document.querySelectorAll('.input-billete').forEach(inp => {
    inp.addEventListener('input', calcular);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !inp.readOnly) {
        e.preventDefault();
        moverAlSiguiente(inp);
      }
    });
  });
  ['total_monedas', 'billetes_viejos', 'venta_practisistemas', 'venta_deportivas']
    .forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', calcular);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); moverAlSiguiente(el); }
      });
    });

  // Cambio manual de fecha
  document.getElementById('fecha').addEventListener('change', e => {
    if (modoEdicion) exitarEdicion();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => verificarFecha(e.target.value), 300);
  });

  // Acciones principales
  document.getElementById('btn-guardar').addEventListener('click', guardar);
  document.getElementById('btn-limpiar').addEventListener('click', limpiar);
  document.getElementById('btn-ultima').addEventListener('click', ultimoRegistro);
  document.getElementById('btn-finalizar').addEventListener('click', cerrarAplicacion);
  document.getElementById('btn-cancelar-edicion').addEventListener('click', cancelarEdicion);

  // Admin
  document.getElementById('btn-admin').addEventListener('click', abrirAdmin);
  document.getElementById('btn-admin-cancelar').addEventListener('click', cerrarAdmin);
  document.getElementById('btn-admin-cerrar').addEventListener('click', cerrarAdmin);
  document.getElementById('btn-admin-ingresar').addEventListener('click', ingresarAdmin);
  document.getElementById('btn-admin-guardar').addEventListener('click', guardarAdmin);
  document.getElementById('btn-admin-buscar-carpeta').addEventListener('click', buscarCarpetaExcel);
  document.getElementById('btn-admin-buscar-excel').addEventListener('click', buscarDesdeExcel);
  document.getElementById('admin-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') ingresarAdmin();
  });
  document.getElementById('admin-data-dir').addEventListener('input', actualizarPreviewRutaAdmin);

  // Modal corrección
  document.getElementById('btn-editar-ok').addEventListener('click', confirmarEdicion);
  document.getElementById('btn-editar-cancelar').addEventListener('click', cerrarModalEditar);
  document.getElementById('editar-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmarEdicion();
  });

  // Cerrar modales al hacer clic fuera
  document.getElementById('modal-admin').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarAdmin();
  });
  document.getElementById('modal-editar').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModalEditar();
  });

  calcular();
  actualizarPreviewRutaAdmin();
}

document.addEventListener('DOMContentLoaded', init);
