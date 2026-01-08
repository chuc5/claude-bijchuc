// ============================================================================
// MODELOS SIMPLIFICADOS PARA ÓRDENES PLAN EMPRESARIAL
// ============================================================================

/**
 * Orden del plan empresarial
 */
export interface OrdenPE {
    numero_orden: number;
    total: number;
    monto_liquidado: number;
    monto_pendiente: number;
    total_anticipos: number;
    anticipos_pendientes: number;
    area?: string;
    presupuesto?: string;
}

/**
 * Anticipo pendiente de una orden
 */
export interface AnticipoPE {
    id_solicitud: number;
    numero_orden: number;
    tipo_anticipo: string;
    monto: number;
    fecha_liquidacion?: string | null;
    estado_liquidacion: string;
    requiere_autorizacion: boolean;
    dias_transcurridos?: number | null;
    dias_permitidos?: number | null;
    ultimo_seguimiento?: UltimoSeguimientoPE | null;
}

/**
 * Información del último seguimiento de un anticipo
 */
export interface UltimoSeguimientoPE {
    nombre_estado?: string;
    descripcion_estado?: string;
    comentario_solicitante?: string;
    fecha_seguimiento?: string;
    fecha_autorizacion?: string;
    comentario_autorizador?: string;
}

/**
 * Payload para solicitar autorización de anticipo
 */
export interface SolicitudAutorizacionPE {
    id_solicitud: number;
    justificacion: string;
    tipo: 'autorizacion';
}

/**
 * Respuesta estándar de la API
 */
export interface ApiResponse<T = any> {
    respuesta: 'success' | 'error';
    mensaje?: string | string[];
    datos?: T;
}

/**
 * Resumen de órdenes para UI
 */
export interface ResumenOrdenes {
    totalOrdenes: number;
    ordenesConPendientes: number;
}

// ============================================================================
// UTILIDADES DE FORMATO
// ============================================================================

/**
 * Formatea un monto como moneda guatemalteca
 */
export function formatearMonto(monto: number): string {
    return new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(monto);
}

/**
 * Formatea una fecha en formato local guatemalteco
 */
export function formatearFecha(fecha: string | null | undefined): string {
    if (!fecha) return '-';
    try {
        return new Date(fecha).toLocaleDateString('es-GT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch {
        return '-';
    }
}

/**
 * Convierte un valor a número de forma segura
 */
export function toNumber(value: any, defaultValue: number = 0): number {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? defaultValue : num;
}

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Estados de liquidación de anticipos
 */
export const ESTADOS_LIQUIDACION = {
    NO_LIQUIDADO: 'Sin liquidar',
    RECIENTE: 'Reciente',
    EN_TIEMPO: 'En tiempo',
    FUERA_DE_TIEMPO: 'Fuera de tiempo',
    LIQUIDADO: 'Liquidado'
} as const;

/**
 * Tipos de anticipos
 */
export const TIPOS_ANTICIPO = {
    CHEQUE: 'Cheque',
    EFECTIVO: 'Efectivo',
    TRANSFERENCIA: 'Transferencia'
} as const;

/**
 * Colores para tipos de anticipo
 */
export const COLORES_TIPO_ANTICIPO: Record<string, string> = {
    'CHEQUE': 'bg-blue-100 text-blue-800',
    'EFECTIVO': 'bg-green-100 text-green-800',
    'TRANSFERENCIA': 'bg-purple-100 text-purple-800'
};

/**
 * Colores para estados de liquidación
 */
export const COLORES_ESTADO_LIQUIDACION: Record<string, string> = {
    'NO_LIQUIDADO': 'bg-gray-100 text-gray-800',
    'RECIENTE': 'bg-green-100 text-green-800',
    'EN_TIEMPO': 'bg-yellow-100 text-yellow-800',
    'FUERA_DE_TIEMPO': 'bg-red-100 text-red-800',
    'LIQUIDADO': 'bg-emerald-100 text-emerald-800'
};

/**
 * Endpoints para la API
 */
export const ENDPOINTS_ORDENES = {
    CARGAR_ORDENES: 'contabilidad/obtenerOrdenesAutorizadasPresupuesto',
    CARGAR_ANTICIPOS: 'contabilidad/obtenerSolicitudesPendientesAnticipos',
    SOLICITAR_AUTORIZACION: 'contabilidad/solicitarAutorizacionAnticiposPendientes'
} as const;