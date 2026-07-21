// ============================================================================
// MODELOS — MESA DE TRABAJO (común a los 4 flujos de Compras)
// ============================================================================
//
// Reutiliza CompraService::procesarLineas() del backend: ajustes de
// cantidad + precios + auto-envío en una sola llamada. No hay endpoints
// separados por flujo — la mesa de trabajo es idéntica sin importar de
// dónde nació la compra.
// ============================================================================

// ── Contrato ApiResponder ─────────────────────────────────────────────────────

export interface ApiExcepcion { mensaje: string; trace?: string; }

interface ApiResponseBase { mensaje: string;[key: string]: unknown; }

export interface ApiResponseSuccess<T = unknown> extends ApiResponseBase {
    respuesta: 'success'; datos?: T;
}
export interface ApiResponseError extends ApiResponseBase {
    respuesta: 'error'; excepcion?: ApiExcepcion;
}
export interface ApiResponseInfo extends ApiResponseBase {
    respuesta: 'info'; excepcion?: ApiExcepcion;
}

export type ApiResponse<T = unknown> =
    | ApiResponseSuccess<T>
    | ApiResponseError
    | ApiResponseInfo;

export function esExitosa<T>(res: ApiResponse<T>): res is ApiResponseSuccess<T> {
    return res.respuesta === 'success';
}
export function esInfo<T>(res: ApiResponse<T>): res is ApiResponseInfo {
    return res.respuesta === 'info';
}

// ── Estado / tipo de bodega (mismos catálogos del backend) ────────────────────

export const ESTADO_COMPRA = {
    SOLICITADA: 1,
    APROBADA: 2,
    RECHAZADA: 3,
    REQUIERE_AUTORIZACION: 4,
    COMPRADA: 5,
    ENVIADA: 6,
    REGISTRADA: 7,
    CANCELADA: 8,
} as const;

export type EstadoCompraId = typeof ESTADO_COMPRA[keyof typeof ESTADO_COMPRA];

export const TIPO_BODEGA = {
    AGENCIA: 1,
    AREA: 2,
} as const;

export type TipoBodegaId = typeof TIPO_BODEGA[keyof typeof TIPO_BODEGA];

// ── Detalle completo de una compra (obtenerCompra) ─────────────────────────────

export interface CompraLineaDetalle {
    id: number;
    id_producto: number;
    producto: string;
    id_unidad: number;
    unidad: string;
    abreviatura: string;
    id_bodega_destino: number;
    bodega_destino: string;
    tipo_bodega_destino: TipoBodegaId;
    cantidad_solicitada: number;
    cantidad_ajustada: number | null;
    cantidad_final: number;
    precio_unitario: number | null;
    comprado_con_precio: boolean;
    fecha_marcado_comprado: string | null;
    id_factura: number | null;
    id_alta_generada: number | null;
    justificacion: string | null;
}

export interface CompraDetalle {
    id: number;
    id_bodega: number;
    bodega: string;
    id_tipo_origen: number;
    id_estado: EstadoCompraId;
    estado: string;
    id_usuario_solicitante: string | null;
    nombre_solicitante: string | null;
    id_usuario_gestor: string | null;
    nombre_gestor: string | null;
    comentario_gestor: string | null;
    fecha_gestion: string | null;
    id_usuario_admin: string | null;
    nombre_admin: string | null;
    requiere_autorizacion: 0 | 1;
    id_usuario_autorizador: string | null;
    nombre_autorizador: string | null;
    comentario_autorizacion: string | null;
    fecha_autorizacion: string | null;
    created_at: string;
    updated_at: string;
    lineas: CompraLineaDetalle[];
}

// ── Payload de procesarCompra ───────────────────────────────────────────────────

export interface LineaProcesar {
    id_linea: number;
    cantidad_ajustada?: number;
    precio_unitario?: number;
}

export interface ProcesarCompraPayload {
    id_compra: number;
    lineas: LineaProcesar[];
}

export interface ResultadoProcesarCompra {
    lineas_ajustadas: number;
    lineas_compradas: number;
    requiere_autorizacion: boolean;
    altas_generadas: boolean;
    ids_altas: number[];
}

// ── Estado local editable por línea (solo en el front, no viaja tal cual) ──────

export interface LineaEditable {
    id: number;
    producto: string;
    unidad: string;
    tipoBodegaDestino: TipoBodegaId;
    cantidadSolicitada: number;
    cantidadAjustada: number;
    precioUnitario: number | null;
    compradoConPrecio: boolean;
    /** true si el usuario modificó cantidad o precio respecto al valor original */
    tieneCambios: boolean;
    errorCantidad: string | null;
}

// ── Mensajes ────────────────────────────────────────────────────────────────────

export const MENSAJES_MESA_TRABAJO = {
    EXITO: {
        GUARDAR: 'Cambios guardados correctamente',
    },
    ERROR: {
        CARGAR: 'Error al cargar el detalle de la compra',
        GUARDAR: 'Error al guardar los cambios de la mesa de trabajo',
        SIN_CAMBIOS: 'No hay cambios para guardar',
        CANTIDAD_AGENCIA: 'Para bodegas de agencia solo se permite bajar la cantidad, no incrementarla',
    },
} as const;