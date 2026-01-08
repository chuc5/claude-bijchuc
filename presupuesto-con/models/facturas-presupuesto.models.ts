// ============================================================================
// MODELOS FACTURAS PLAN EMPRESARIAL - ACTUALIZADO CON DÍAS HÁBILES DEL BACKEND
// ============================================================================

// ============================================================================
// INTERFACES PRINCIPALES
// ============================================================================

/**
 * Información de días hábiles que viene directamente del backend
 */
export interface DiasHabilesInfo {
    fecha_emision: string;
    fecha_inicio_calculo: string;
    fecha_fin_calculo: string;
    dias_transcurridos: number;
    dias_permitidos: number;
    dias_gracia: number;
    total_permitido: number;
    excede_limite: boolean;
    requiere_autorizacion: boolean;
    estado_tiempo: 'En tiempo' | 'En plazo';
}

export interface FacturaPE {
    id?: number;
    numero_dte: string;
    fecha_emision: string;
    numero_autorizacion: string;
    tipo_dte: string;
    nombre_emisor: string;
    monto_total: number;
    monto_liquidado: number;
    estado_liquidacion: 'Pendiente' | 'Verificado' | 'Liquidado' | 'Pagado' | 'En Revisión';
    moneda: 'GTQ' | 'USD';

    // Campos de autorización existentes (mantenidos para compatibilidad)
    dias_transcurridos?: number;
    estado_autorizacion?: 'ninguna' | 'pendiente' | 'aprobada' | 'rechazada';
    motivo_autorizacion?: string;
    fecha_solicitud?: string;
    fecha_autorizacion?: string;
    comentarios_autorizacion?: string;

    // Campos del backend existentes
    estado_factura?: 'Vigente' | 'vigente' | 'Anulado' | 'PROCESADO';
    cantidad_liquidaciones?: number;
    monto_retencion?: number;
    tipo_retencion?: number;
    solicitado_por?: string;
    autorizado_por?: string;
    autorizacion_id?: number;
    tiene_autorizacion_tardanza?: number;
    estado?: string;
    estado_id?: number;
    fecha_creacion?: string;
    fecha_actualizacion?: string;

    // NUEVA PROPIEDAD: Información de días hábiles del backend
    dias_habiles?: DiasHabilesInfo;

    // Array de detalles (opcional)
    detalles_liquidacion?: DetalleLiquidacionPE[];
}

export interface DetalleLiquidacionPE {
    id?: number;
    numero_orden: string;
    agencia: string;
    descripcion: string;
    monto: number;
    correo_proveedor: string;
    forma_pago: 'deposito' | 'transferencia' | 'cheque' | 'efectivo' | 'anticipo' | 'tarjeta' | 'contrasena' | 'costoasumido' | string;
    banco?: string;
    cuenta?: string;

    // Estados para edición inline
    editando?: boolean;
    guardando?: boolean;

    // Propiedades temporales para edición inline
    _editandoMonto?: boolean;
    _montoTemp?: number;
    _editandoAgencia?: boolean;
    _agenciaTemp?: string;

    // Campos adicionales
    factura_id?: number;
    fecha_creacion?: string;
    fecha_actualizacion?: string;
    tiene_cambios_pendientes?: number;
    datos_especificos?: any;
    informacion_adicional?: any;
    area_presupuesto?: number | string;
}

export interface OrdenPE {
    numero_orden: number;
    total: number;
    monto_liquidado: number;
    monto_pendiente: number;
    anticipos_pendientes: number;
    area?: string;
    presupuesto?: string;
}

export interface AgenciaPE {
    id: number;
    nombre_liquidacion: string;
}

export interface AreaPresupuestoPE {
    id: number;
    nombre_area: string;
}

export interface BancoPE {
    id_banco: number;
    nombre: string;
}

export interface TipoCuentaPE {
    id_tipo_cuenta: number;
    nombre: string;
}

/**
 * NUEVA interfaz para permisos de edición - ACTUALIZADA
 */
export interface PermisosEdicion {
    puedeVer: boolean;
    puedeEditar: boolean;
    puedeAgregar: boolean;
    puedeEliminar: boolean;
    razon: string;
    claseCSS: string;
}

// ============================================================================
// PAYLOADS PARA API (Sin cambios)
// ============================================================================

export interface BuscarFacturaPayload {
    texto: string;
}

export interface RegistrarFacturaPayload {
    numero_dte: string;
    fecha_emision: string;
    numero_autorizacion: string;
    tipo_dte: string;
    nombre_emisor: string;
    monto_total: number;
    moneda: 'GTQ' | 'USD';
}

export interface SolicitarAutorizacionPayload {
    numero_dte: string;
    motivo: string;
    dias_transcurridos: number;
}

export interface LiquidarFacturaPayload {
    numero_dte: string;
    confirmar: boolean;
}

export interface GuardarDetalleLiquidacionPayload {
    id?: number;
    numero_factura: string;
    numero_orden: string;
    agencia: string;
    descripcion: string;
    monto: number;
    correo_proveedor?: string;
    forma_pago: string;
    banco?: string;
    cuenta?: string;
    area_presupuesto?: string; // NUEVO
    datos_especificos?: any;
}

// ============================================================================
// RESPUESTAS DE API (Sin cambios)
// ============================================================================

export interface ApiResponse<T = any> {
    respuesta: 'success' | 'error';
    datos?: T;
    mensaje?: string | string[];
}

// ============================================================================
// CONSTANTES Y CATÁLOGOS (Sin cambios)
// ============================================================================

export const TIPOS_DTE = [
    { codigo: '1', nombre: 'RECIBO' },
    { codigo: '2', nombre: 'FACT' }
];

export const AUTORIZACIONES = [
    { codigo: '1', nombre: 'COOPERATIVA EL BIENESTAR' },
    { codigo: '2', nombre: 'PEDRO NOE YAC' }
];

export const MONEDAS: Array<'GTQ' | 'USD'> = ['GTQ', 'USD'];

export const FORMAS_PAGO = [
    { id: 'deposito', nombre: 'Depósito' },
    { id: 'transferencia', nombre: 'Transferencia' },
    { id: 'cheque', nombre: 'Cheque' },
    { id: 'anticipo', nombre: 'Anticipo' },
    { id: 'tarjeta', nombre: 'Tarjeta de Credito' },
    { id: 'contrasena', nombre: 'Pago por Contraseña' },
    { id: 'costoasumido', nombre: 'Costo Asumido por el Colaborador' }
];

export const ESTADOS_LIQUIDACION_TODOS = [
    { codigo: 'Pendiente', nombre: 'Pendiente' },
    { codigo: 'En Revisión', nombre: 'En Revisión' },
    { codigo: 'Verificado', nombre: 'Verificado' },
    { codigo: 'Liquidado', nombre: 'Liquidado' },
    { codigo: 'Pagado', nombre: 'Pagado' }
];

export const ESTADOS_FACTURA = [
    { codigo: 'vigente', nombre: 'Vigente' },
    { codigo: 'anulada', nombre: 'Anulada' },
    { codigo: 'suspendida', nombre: 'Suspendida' }
];

export const ENDPOINTS = {
    BUSCAR_FACTURA: 'contabilidad/buscarPorNumeroDtepresupuesto',
    REGISTRAR_FACTURA: 'facturas/registro/facturaManual',
    LIQUIDAR_FACTURA: 'contabilidad/liquidarFactura',
    SOLICITAR_AUTORIZACION: 'facturas/solicitarAutorizacionTardanza',
    OBTENER_DETALLES: 'contabilidad/obtenerDetallesLiquidacionpresupuesto',
    GUARDAR_DETALLE: 'contabilidad/guardarDetalleLiquidacionpresupuesto',
    ELIMINAR_DETALLE: 'contabilidad/eliminarDetalleLiquidacion',
    ACTUALIZAR_DETALLE: 'contabilidad/actualizarDetalleLiquidacion',
    OBTENER_ORDENES: 'contabilidad/obtenerOrdenesAutorizadasPresupuesto',
    OBTENER_AGENCIAS: 'contabilidad/buscarNombreLiquidacion',
    OBTENER_AREAS_PRESUPUESTO: 'contabilidad/obtenerAreasPresupuesto',
    OBTENER_BANCOS: 'facturas/bancos/lista',
    OBTENER_TIPOS_CUENTA: 'facturas/tiposCuenta/lista',
    REALIZAR_COPIA: 'contabilidad/copiarDetalleLiquidacion',
    OBTENER_DETALLE_COMPLETO: 'contabilidad/obtenerDetalleCompleto',
    ACTUALIZAR_MONTO_AGENCIA: 'contabilidad/actualizarMontoAgencia'
} as const;

// ============================================================================
// UTILIDADES DE FORMATO (Sin cambios)
// ============================================================================

export function formatearMonto(monto: number): string {
    return new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(monto);
}
export function formatearFecha(fecha: string | null | undefined): string {
    if (!fecha) return '-';
    try {
        // Añade 'T00:00' para que JavaScript la interprete como fecha local
        const fechaLocal = new Date(`${fecha}T00:00:00`);

        return fechaLocal.toLocaleDateString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch {
        return '-';
    }
}

export function formatearFechaHora(fecha: string | null | undefined): string {
    if (!fecha) return '-';
    try {
        const fechaHora = new Date(fecha);

        return fechaHora.toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch {
        return '-';
    }
}

export function truncarTexto(texto: string, longitud: number = 50): string {
    if (!texto) return '';
    if (texto.length <= longitud) return texto;
    return texto.substring(0, longitud).trim() + '...';
}

// ============================================================================
// UTILIDADES DE COLORES Y ESTILOS (Sin cambios)
// ============================================================================

export function obtenerColorEstadoLiquidacion(estado: string): string {
    const colores = {
        'Pendiente': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'En Revisión': 'bg-blue-100 text-blue-800 border-blue-200',
        'Verificado': 'bg-indigo-100 text-indigo-800 border-indigo-200',
        'Liquidado': 'bg-green-100 text-green-800 border-green-200',
        'Pagado': 'bg-emerald-100 text-emerald-800 border-emerald-200'
    };
    return colores[estado as keyof typeof colores] || 'bg-gray-100 text-gray-800 border-gray-200';
}

export function obtenerColorEstadoAutorizacion(estado: string): string {
    const colores = {
        'aprobada': 'bg-green-100 text-green-800 border-green-200',
        'pendiente': 'bg-amber-100 text-amber-800 border-amber-200',
        'rechazada': 'bg-red-100 text-red-800 border-red-200',
        'ninguna': 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colores[estado as keyof typeof colores] || 'bg-gray-100 text-gray-700 border-gray-200';
}

export function obtenerColorEstadoFactura(estado: string): string {
    const colores = {
        'vigente': 'bg-green-100 text-green-800 border-green-200',
        'Vigente': 'bg-green-100 text-green-800 border-green-200',
        'anulada': 'bg-red-100 text-red-800 border-red-200',
        'suspendida': 'bg-orange-100 text-orange-800 border-orange-200'
    };
    return colores[estado as keyof typeof colores] || 'bg-gray-100 text-gray-800 border-gray-200';
}

export function obtenerColorFormaPago(formaPago: string): string {
    const colores = {
        'deposito': 'bg-blue-100 text-blue-800',
        'transferencia': 'bg-green-100 text-green-800',
        'cheque': 'bg-purple-100 text-purple-800',
        'efectivo': 'bg-orange-100 text-orange-800'
    };
    return colores[formaPago as keyof typeof colores] || 'bg-gray-100 text-gray-800';
}

// ============================================================================
// NUEVA FUNCIÓN PARA OBTENER COLOR DE ESTADO DE TIEMPO
// ============================================================================

export function obtenerColorEstadoTiempo(estadoTiempo: string): string {
    const colores = {
        'En tiempo': 'bg-green-100 text-green-800 border-green-200',
        'Por vencer': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'Vencido': 'bg-red-100 text-red-800 border-red-200',
        'En plazo': 'bg-green-100 text-green-800 border-green-200'
    };
    return colores[estadoTiempo as keyof typeof colores] || 'bg-gray-100 text-gray-800 border-gray-200';
}

// ============================================================================
// FUNCIÓN ACTUALIZADA PARA VALIDAR PERMISOS DE EDICIÓN
// ============================================================================

/**
 * Valida los permisos de edición para una factura PE según las reglas de negocio establecidas
 * @param factura - La factura PE a validar, puede ser null
 * @returns PermisosEdicion - Objeto con los permisos y información adicional
 */
export function validarPermisosEdicion(factura: FacturaPE | null): PermisosEdicion {
    // Configuración inicial de permisos - por defecto solo lectura
    const permisos: PermisosEdicion = {
        puedeVer: true,
        puedeEditar: false,
        puedeAgregar: false,
        puedeEliminar: false,
        razon: 'Sin factura seleccionada',
        claseCSS: 'text-gray-600 bg-gray-50 border-gray-200'
    };

    // Validación inicial: verificar si existe factura
    if (!factura) {
        return permisos;
    }

    // VALIDACIÓN PRINCIPAL: Factura vigente Y liquidación pendiente (SIMULTÁNEA)
    const facturaVigente = factura.estado_factura === 'Vigente' || factura.estado_factura === 'vigente';
    const liquidacionPendiente = factura.estado_liquidacion === 'Pendiente';

    // Si cumple AMBAS condiciones, evaluar criterios de edición
    if (facturaVigente && liquidacionPendiente) {

        // Criterio 1: Verificar si tiene detalles de liquidación registrados
        const tieneDetalles = factura.cantidad_liquidaciones && factura.cantidad_liquidaciones > 0;
        // Criterio 2: Verificar si está en tiempo
        let enTiempo = false;
        if (factura.dias_habiles && !factura.dias_habiles.excede_limite) {
            enTiempo = true;
        }

        // Criterio 3: Verificar si tiene autorización aprobada (para casos fuera de tiempo)
        const tieneAutorizacionAprobada = factura.estado_autorizacion === 'aprobada';

        // Evaluación de criterios para permitir edición
        if (tieneDetalles) {
            // Criterio 1: Tiene detalles - puede editar
            permisos.puedeEditar = true;
            permisos.puedeAgregar = true;
            permisos.puedeEliminar = true;
            permisos.razon = `Edición permitida - ${factura.cantidad_liquidaciones} liquidaciones registradas`;
            permisos.claseCSS = 'text-green-700 bg-green-50 border-green-200';
            return permisos;
        }

        if (enTiempo) {
            // Criterio 2: Está en tiempo - puede editar
            permisos.puedeEditar = true;
            permisos.puedeAgregar = true;
            permisos.puedeEliminar = true;
            const diasHabiles = factura.dias_habiles!;
            permisos.razon = `Edición permitida - ${diasHabiles.estado_tiempo} (${diasHabiles.dias_transcurridos}/${diasHabiles.total_permitido} días)`;
            permisos.claseCSS = 'text-green-700 bg-green-50 border-green-200';
            return permisos;
        }

        if (tieneAutorizacionAprobada) {
            // Criterio 3: Fuera de tiempo pero con autorización - puede editar
            permisos.puedeEditar = true;
            permisos.puedeAgregar = true;
            permisos.puedeEliminar = true;
            permisos.razon = 'Edición permitida - Autorización aprobada para liquidación tardía';
            permisos.claseCSS = 'text-blue-700 bg-blue-50 border-blue-200';
            return permisos;
        }

        // No cumple ningún criterio de edición - Solo lectura (pero factura válida)
        if (!factura.dias_habiles) {
            permisos.razon = 'Validando tiempo de liquidación...';
            permisos.claseCSS = 'text-yellow-700 bg-yellow-50 border-yellow-200';
        } else {
            const diasHabiles = factura.dias_habiles;
            permisos.razon = `${diasHabiles.estado_tiempo} - Requiere autorización especial (${diasHabiles.dias_transcurridos}/${diasHabiles.total_permitido} días)`;
            permisos.claseCSS = 'text-red-700 bg-red-50 border-red-200';
        }
        return permisos;
    }

    // Si NO cumple las condiciones principales (vigente Y pendiente) - Solo lectura
    if (!facturaVigente) {
        permisos.razon = `Factura ${factura.estado_factura || 'no vigente'} - Solo lectura`;
        permisos.claseCSS = 'text-red-700 bg-red-50 border-red-200';
    } else {
        permisos.razon = `Estado '${factura.estado_liquidacion}' - Solo lectura`;
        permisos.claseCSS = 'text-blue-700 bg-blue-50 border-blue-200';
    }
    return permisos;
}

// ============================================================================
// VALIDACIONES (Sin cambios significativos)
// ============================================================================

export function validarFactura(factura: Partial<RegistrarFacturaPayload>): { valido: boolean; errores: string[] } {
    const errores: string[] = [];

    if (!factura.numero_dte?.trim()) {
        errores.push('Número DTE es requerido');
    } else if (factura.numero_dte.trim().length < 3) {
        errores.push('Número DTE debe tener al menos 3 caracteres');
    } else if (factura.numero_dte.trim().length > 25) {
        errores.push('Número DTE no puede exceder 25 caracteres');
    }

    if (!factura.fecha_emision) {
        errores.push('Fecha de emisión es requerida');
    } else {
        const fecha = new Date(factura.fecha_emision);
        const hoy = new Date();
        if (fecha > hoy) {
            errores.push('La fecha de emisión no puede ser futura');
        }
    }

    if (!factura.numero_autorizacion?.trim()) {
        errores.push('Número de autorización es requerido');
    }

    if (!factura.tipo_dte?.trim()) {
        errores.push('Tipo DTE es requerido');
    }

    if (!factura.nombre_emisor?.trim()) {
        errores.push('Nombre del emisor es requerido');
    } else if (factura.nombre_emisor.trim().length < 3) {
        errores.push('Nombre del emisor debe tener al menos 3 caracteres');
    } else if (factura.nombre_emisor.trim().length > 200) {
        errores.push('Nombre del emisor no puede exceder 200 caracteres');
    }

    if (!factura.monto_total || factura.monto_total <= 0) {
        errores.push('Monto total debe ser mayor a 0');
    } else if (factura.monto_total > 999999999.99) {
        errores.push('Monto total excede el límite permitido');
    }

    if (!factura.moneda || !['GTQ', 'USD'].includes(factura.moneda)) {
        errores.push('Moneda debe ser GTQ o USD');
    }

    return { valido: errores.length === 0, errores };
}

export function validarAutorizacion(payload: Partial<SolicitarAutorizacionPayload>): { valido: boolean; errores: string[] } {
    const errores: string[] = [];

    if (!payload.numero_dte?.trim()) {
        errores.push('Número DTE es requerido');
    }

    if (!payload.motivo?.trim()) {
        errores.push('Motivo es requerido');
    } else if (payload.motivo.trim().length < 10) {
        errores.push('Motivo debe tener al menos 10 caracteres');
    } else if (payload.motivo.trim().length > 500) {
        errores.push('Motivo no puede exceder 500 caracteres');
    }

    if (!payload.dias_transcurridos || payload.dias_transcurridos < 0) {
        errores.push('Días transcurridos debe ser un número válido');
    }

    return { valido: errores.length === 0, errores };
}

export function validarDetalleLiquidacion(detalle: Partial<DetalleLiquidacionPE>): { valido: boolean; errores: string[] } {
    const errores: string[] = [];

    if (!detalle.numero_orden?.trim()) {
        errores.push('Número de orden es requerido');
    }

    if (!detalle.agencia?.trim()) {
        errores.push('Agencia es requerida');
    }

    if (!detalle.descripcion?.trim()) {
        errores.push('Descripción es requerida');
    } else if (detalle.descripcion.trim().length < 5) {
        errores.push('Descripción debe tener al menos 5 caracteres');
    }

    if (!detalle.monto || detalle.monto <= 0) {
        errores.push('Monto debe ser mayor a 0');
    }

    if (!detalle.forma_pago?.trim()) {
        errores.push('Forma de pago es requerida');
    }

    return { valido: errores.length === 0, errores };
}

// ============================================================================
// UTILIDADES ADICIONALES (Sin cambios)
// ============================================================================

export function normalizarTexto(texto: string): string {
    if (!texto) return '';
    return texto
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function esNumeroOrdenValido(numeroOrden: string): boolean {
    if (!numeroOrden) return false;
    const numero = parseInt(numeroOrden, 10);
    return !isNaN(numero) && numero > 0 && numero <= 999999999;
}

export function esDteValido(numeroDte: string): boolean {
    if (!numeroDte) return false;
    const dteNormalizado = numeroDte.trim();
    return dteNormalizado.length >= 3 &&
        dteNormalizado.length <= 25 &&
        /^[A-Za-z0-9\-_]+$/.test(dteNormalizado);
}

export function calcularDiferenciaMontos(montoFactura: number, montoDetalles: number): number {
    return Math.abs(montoFactura - montoDetalles);
}

export function hayDiferenciaSignificativa(montoFactura: number, montoDetalles: number, tolerancia: number = 0.01): boolean {
    return calcularDiferenciaMontos(montoFactura, montoDetalles) > tolerancia;
}

// ============================================================================
// NUEVAS UTILIDADES PARA DÍAS HÁBILES
// ============================================================================

/**
 * Obtiene el mensaje de estado de tiempo de la factura
 */
export function obtenerMensajeEstadoTiempo(factura: FacturaPE): string {
    if (!factura.dias_habiles) {
        return 'Estado de tiempo no disponible';
    }

    const dh = factura.dias_habiles;
    return `${dh.estado_tiempo} - ${dh.dias_transcurridos}/${dh.total_permitido} días hábiles transcurridos`;
}

/**
 * Verifica si la factura requiere autorización por tardanza
 */
export function requiereAutorizacionPorTardanza(factura: FacturaPE): boolean {
    return factura.dias_habiles?.requiere_autorizacion || false;
}

/**
 * Verifica si la factura está dentro del tiempo permitido
 */
export function estaEnTiempoPermitido(factura: FacturaPE): boolean {
    return !factura.dias_habiles?.excede_limite;
}

// ============================================================================
// TIPOS AUXILIARES (Sin cambios)
// ============================================================================

export type EstadoLiquidacion = 'Pendiente' | 'En Revisión' | 'Verificado' | 'Liquidado' | 'Pagado';
export type EstadoAutorizacion = 'ninguna' | 'pendiente' | 'aprobada' | 'rechazada';
export type EstadoFactura = 'vigente' | 'Anulado' | 'suspendida';
export type FormaPago = 'deposito' | 'transferencia' | 'cheque' | 'efectivo';
export type Moneda = 'GTQ' | 'USD';
export type EstadoTiempo = 'En tiempo' | 'Vencido' | 'Por vencer';

export interface ResultadoValidacion {
    valido: boolean;
    errores: string[];
}

// ============================================================================
// CONSTANTES DE CONFIGURACIÓN (Sin cambios)
// ============================================================================

export const CONFIGURACION = {
    DTE_MIN_LENGTH: 3,
    DTE_MAX_LENGTH: 25,
    NOMBRE_EMISOR_MIN_LENGTH: 3,
    NOMBRE_EMISOR_MAX_LENGTH: 200,
    MOTIVO_MIN_LENGTH: 10,
    MOTIVO_MAX_LENGTH: 500,
    DESCRIPCION_MIN_LENGTH: 5,
    MONTO_MAX: 999999999.99,
    DEBOUNCE_BUSQUEDA_MS: 1000,
    TOLERANCIA_DIFERENCIA_MONTOS: 0.01,
    ESTADOS_EDITABLES: ['Pendiente'],
    FORMATO_FECHA: 'dd/MM/yyyy',
    FORMATO_FECHA_HORA: 'dd/MM/yyyy HH:mm',
    FORMATO_MONEDA: 'es-GT'
} as const;

export const MENSAJES = {
    EXITO: {
        FACTURA_REGISTRADA: 'Factura registrada correctamente',
        FACTURA_LIQUIDADA: 'Factura liquidada exitosamente',
        AUTORIZACION_ENVIADA: 'Solicitud de autorización enviada correctamente',
        DETALLE_GUARDADO: 'Detalle guardado correctamente'
    },
    ERROR: {
        FACTURA_NO_ENCONTRADA: 'Factura no encontrada',
        ERROR_BUSQUEDA: 'Error al buscar la factura',
        ERROR_REGISTRO: 'Error al registrar la factura',
        ERROR_LIQUIDACION: 'Error al liquidar la factura',
        ERROR_AUTORIZACION: 'Error al enviar la solicitud de autorización',
        ERROR_CONEXION: 'Error de conexión con el servidor'
    },
    INFO: {
        SIN_RESULTADOS: 'No se encontraron resultados',
        CAMPOS_REQUERIDOS: 'Complete todos los campos requeridos',
        DIFERENCIA_MONTOS: 'Hay diferencias en los montos que deben revisarse'
    },
    PERMISOS: {
        SIN_FACTURA: 'Seleccione una factura para comenzar',
        FACTURA_NO_VIGENTE: 'La factura no está vigente - Solo lectura permitida',
        ESTADO_NO_EDITABLE: 'El estado actual no permite modificaciones',
        CON_LIQUIDACIONES: 'Puede editar - Tiene liquidaciones registradas',
        EN_TIEMPO: 'Puede editar - Dentro del tiempo permitido',
        AUTORIZADO: 'Puede editar - Autorización aprobada para liquidación tardía',
        FUERA_TIEMPO: 'No puede editar - Fuera de tiempo sin autorización',
        VALIDANDO: 'Validando permisos...'
    }
} as const;