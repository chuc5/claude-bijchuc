// ============================================================================
// MODELOS — SOLICITUDES (Sprint 1)
// ============================================================================
//
// Patrón idéntico a presupuesto-general.models.ts:
//   - Unión discriminada ApiResponse con type guards
//   - Interfaces de dominio
//   - Constante de mensajes
//   - FormatHelper
// ============================================================================


// ============================================================================
// CONTRATO DE RESPUESTA (reutiliza el patrón de ApiResponder.php)
// ============================================================================

export interface ApiExcepcion {
    mensaje: string;
    trace?: string;
}

interface ApiResponseBase {
    mensaje: string;
    [key: string]: unknown;
}

export interface ApiResponseSuccess<T = unknown> extends ApiResponseBase {
    respuesta: 'success';
    datos?: T;
}

export interface ApiResponseError extends ApiResponseBase {
    respuesta: 'error';
    excepcion?: ApiExcepcion;
}

export interface ApiResponseInfo extends ApiResponseBase {
    respuesta: 'info';
    excepcion?: ApiExcepcion;
}

export interface LoteCorrelativo {
    id: number;
    serie: string | null;
    correlativo_inicial: number;
    correlativo_final: number;
    cantidad_disponible: number;
    ya_asignados: number;
}

export interface RespuestaUnidades {
    tipo: TipoProductoId;
    unidades: UnidadConStock[];
    // solo para tipo 1:
    lotes_correlativo?: LoteCorrelativo[];
    cantidad_disponible?: number;
}

export type ApiResponse<T = unknown> =
    | ApiResponseSuccess<T>
    | ApiResponseError
    | ApiResponseInfo;

// ── Type guards ──────────────────────────────────────────────────────────────

export function esExitosa<T>(res: ApiResponse<T>): res is ApiResponseSuccess<T> {
    return res.respuesta === 'success';
}
export function esError<T>(res: ApiResponse<T>): res is ApiResponseError {
    return res.respuesta === 'error';
}
export function esInfo<T>(res: ApiResponse<T>): res is ApiResponseInfo {
    return res.respuesta === 'info';
}
export function noEsExitosa<T>(res: ApiResponse<T>): res is ApiResponseError | ApiResponseInfo {
    return res.respuesta !== 'success';
}


// ============================================================================
// ENUMS / CONSTANTES DE DOMINIO
// ============================================================================

/**
 * IDs de estados de solicitud — espejo de la tabla `estados_solicitud`.
 * Semilla: (1,'Reservada'),(2,'Entregada'),(3,'Rechazada'),(4,'Cancelada')
 */
export const EstadoSolicitudId = {
    RESERVADA: 1,
    ENTREGADA: 2,
    RECHAZADA: 3,
    CANCELADA: 4,
} as const;
export type EstadoSolicitudId =
    typeof EstadoSolicitudId[keyof typeof EstadoSolicitudId];

/** IDs de tipos de bodega — espejo de la tabla `tipos_bodega`. */
export const TipoBodegaId = {
    AGENCIA: 1,
    AREA: 2,
} as const;
export type TipoBodegaId = typeof TipoBodegaId[keyof typeof TipoBodegaId];

/** IDs de tipos de producto — espejo de la tabla `tipos_producto`. */
export const TipoProductoId = {
    CORRELATIVO: 1,
    EXPIRACION: 2,
    NORMAL: 3,
} as const;
export type TipoProductoId = typeof TipoProductoId[keyof typeof TipoProductoId];


// ============================================================================
// INTERFACES DE DOMINIO
// ============================================================================

/** Bodega de agencia del usuario autenticado */
export interface BodegaAgencia {
    id: number;
    nombre: string;
    id_tipo: number;
    id_agencia: number;
    restriccion_acceso_activa: boolean;
    activo: boolean;
}

/** Bodega de área con flag de acceso del usuario */
export interface BodegaArea {
    id: number;
    nombre: string;
    id_tipo: number;
    id_departamento_cooperativa: number | null;
    restriccion_acceso_activa: boolean;
    activo: boolean;
    /** true si el usuario tiene acceso (calculado en el backend) */
    tiene_acceso: boolean;
}

/** Producto disponible en la bodega con stock en tiempo real */
export interface ProductoDisponible {
    id: number;
    nombre: string;
    descripcion: string | null;
    id_tipo: TipoProductoId;
    tipo: string;
    id_categoria: number;
    categoria: string;
    id_unidad_default: number;
    unidad_default: string;
    abreviatura_unidad: string;
    /** Puede llegar como string desde PDO; usar parseFloat() antes de operar */
    cantidad_total: number | string;
    cantidad_reservada: number | string;
    /** Columna GENERATED en BD; fuente de verdad para disponibilidad */
    cantidad_disponible: number | string;
}

/** Cabecera de solicitud (vista de lista — sin detalle de renglones) */
export interface Solicitud {
    id: number;
    id_bodega: number;
    bodega: string;
    id_tipo_bodega: TipoBodegaId;
    tipo_bodega: string;
    id_estado: EstadoSolicitudId;
    estado: string;
    observaciones: string | null;
    created_at: string;
    updated_at: string;
    /** Total de renglones (productos) en la solicitud */
    total_renglones: number;
    /** Renglones que ya tienen id_usuario_gestion (entregados o rechazados) */
    renglones_gestionados: number;
}

/**
 * Detalle de un renglón de solicitud.
 * Usado en el modal de detalle (Sprint 5).
 */
export interface SolicitudDetalle {
    id: number;
    id_solicitud: number;
    id_producto: number;
    nombre_producto: string;
    id_unidad: number;
    nombre_unidad: string;
    abreviatura_unidad: string;
    cantidad_solicitada: number | string;
    cantidad_entregada: number | string | null;
    /** Rango sugerido al crear — puede diferir del entregado real */
    correlativo_inicial_asignado: number | null;
    correlativo_final_asignado: number | null;
    id_lote_correlativo: number | null;
    id_usuario_gestion: string | null;
    fecha_gestion: string | null;
    motivo_rechazo: string | null;
}

/**
 * Payload para crear una solicitud (Sprint 2).
 * id_bodega + arreglo de renglones.
 */
export interface CrearSolicitudForm {
    id_bodega: number;
    observaciones?: string;
    renglones: RenglonSolicitudForm[];
}

export interface RenglonSolicitudForm {
    id_producto: number;
    id_unidad: number;
    cantidad: number;
}

/**
 * Rango de correlativo sugerido por el backend (Sprint 5).
 */
export interface RangoCorrelativo {
    id_lote: number;
    correlativo_inicial: number;
    correlativo_final: number;
    cantidad_disponible: number;
}

/** Estructura de paginación devuelta por endpoints de lista */
export interface Paginacion {
    total: number;
    pagina: number;
    por_pagina: number;
    paginas: number;
}

export interface UnidadConStock {
    id_unidad: number;
    nombre: string;
    abreviatura: string;
    es_talla: boolean;           // ← NUEVO (viene del PHP ahora)
    es_default: boolean;
    cantidad_total: number;
    cantidad_reservada: number;
    cantidad_disponible: number;
    fecha_expiracion_proxima?: string | null;
}


// ============================================================================
// MENSAJES DEL SISTEMA
// ============================================================================

export const MENSAJES_SOLICITUDES = {
    EXITO: {
        CREAR: 'Solicitud creada y stock reservado correctamente',
        CANCELAR: 'Solicitud cancelada y reserva liberada',
    },
    ERROR: {
        CARGAR_BODEGA: 'Error al obtener la bodega de agencia',
        CARGAR_BODEGAS_AREA: 'Error al obtener las bodegas de área',
        CARGAR_PRODUCTOS: 'Error al cargar los productos disponibles',
        CARGAR_SOLICITUDES: 'Error al cargar tus solicitudes',
        CREAR: 'Error al crear la solicitud',
        CANCELAR: 'Error al cancelar la solicitud',
        SIN_STOCK: 'No hay suficiente stock disponible',
        UNIDADES: 'Error al cargar las unidades del producto'
    },
} as const;


// ============================================================================
// HELPERS DE FORMATO
// ============================================================================

export class FormatSolicitudes {

    /** Formatea fecha ISO a DD/MM/YYYY HH:mm en locale guatemalteco */
    static fechaHora(fecha: string | null | undefined): string {
        if (!fecha) return '—';
        return new Date(fecha).toLocaleString('es-GT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    /** Parsea un valor que puede llegar como string desde PDO */
    static cantidad(valor: number | string | null | undefined): number {
        if (valor === null || valor === undefined || valor === '') return 0;
        const num = typeof valor === 'string' ? parseFloat(valor) : valor;
        return isNaN(num) ? 0 : num;
    }

    /**
     * Clase CSS del badge según el estado de la solicitud.
     * Retorna clases de Tailwind listas para usar con [class].
     */
    static claseEstado(idEstado: EstadoSolicitudId): string {
        const mapa: Record<EstadoSolicitudId, string> = {
            [EstadoSolicitudId.RESERVADA]: 'bg-yellow-100 text-yellow-800',
            [EstadoSolicitudId.ENTREGADA]: 'bg-green-100  text-green-800',
            [EstadoSolicitudId.RECHAZADA]: 'bg-red-100    text-red-800',
            [EstadoSolicitudId.CANCELADA]: 'bg-gray-100   text-gray-600',
        };
        return mapa[idEstado] ?? 'bg-gray-100 text-gray-600';
    }

    /**
     * Clase CSS del badge según el tipo de producto.
     */
    static claseTipoProducto(idTipo: TipoProductoId): string {
        const mapa: Record<TipoProductoId, string> = {
            [TipoProductoId.CORRELATIVO]: 'bg-purple-100 text-purple-700',
            [TipoProductoId.EXPIRACION]: 'bg-amber-100  text-amber-700',
            [TipoProductoId.NORMAL]: 'bg-blue-100   text-blue-700',
        };
        return mapa[idTipo] ?? 'bg-gray-100 text-gray-600';
    }

    /**
     * Clase CSS del indicador de disponibilidad.
     *   > 10  → verde
     *   1-10  → amarillo
     *   0     → rojo
     */
    static claseDisponibilidad(cantidad: number | string): string {
        const n = FormatSolicitudes.cantidad(cantidad);
        if (n > 10) return 'text-green-700 bg-green-50 border-green-200';
        if (n > 0) return 'text-amber-700 bg-amber-50 border-amber-200';
        return 'text-red-700   bg-red-50   border-red-200';
    }
}