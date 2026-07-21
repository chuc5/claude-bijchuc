// ============================================================================
// MODELOS — AUTORIZACIÓN GERENCIA/FINANCIERO (transversal a los 4 flujos)
// ============================================================================
//
// Cola de compras en estado REQUIERE_AUTORIZACION: llegan aquí por dos
// caminos distintos —
//   1) un alza de cantidad en la mesa de trabajo (bodega de área)
//   2) una compra extraordinaria recién creada (nace así por regla de negocio)
// El campo id_tipo_origen distingue el camino para mostrarlo en pantalla.
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

// ── Origen de la compra (catálogo TipoOrigenCompra del backend) ────────────────

export const TIPO_ORIGEN = {
    TRIMESTRAL: 1,
    EXTRAORDINARIA: 2,
    SOLICITUD_AGENCIA: 3,
    SOLICITUD_AREA: 4,
} as const;

export type TipoOrigenId = typeof TIPO_ORIGEN[keyof typeof TIPO_ORIGEN];

export const NOMBRE_ORIGEN: Record<TipoOrigenId, string> = {
    [TIPO_ORIGEN.TRIMESTRAL]: 'Trimestral',
    [TIPO_ORIGEN.EXTRAORDINARIA]: 'Extraordinaria',
    [TIPO_ORIGEN.SOLICITUD_AGENCIA]: 'Solicitud de Agencia',
    [TIPO_ORIGEN.SOLICITUD_AREA]: 'Solicitud de Área',
};

// ── Compra en cola de autorización ──────────────────────────────────────────────

export interface LineaAutorizacion {
    id_compra: number;
    id_producto: number;
    producto: string;
    id_unidad: number;
    abreviatura: string;
    cantidad_solicitada: number;
    cantidad_ajustada: number | null;
    cantidad_final: number;
    justificacion: string | null;
}

export interface CompraAutorizacion {
    id: number;
    id_bodega: number;
    bodega: string;
    id_tipo_origen: TipoOrigenId;
    id_estado: number;
    id_usuario_solicitante: string | null;
    nombre_solicitante: string | null;
    id_usuario_gestor: string | null;
    nombre_gestor: string | null;
    comentario_gestor: string | null;
    fecha_gestion: string | null;
    requiere_autorizacion: 0 | 1;
    created_at: string;
    lineas: LineaAutorizacion[];
}

export interface ListadoAutorizacion {
    compras: CompraAutorizacion[];
    total: number;
    pagina: number;
    por_pagina: number;
}

// ── Mensajes ────────────────────────────────────────────────────────────────────

export const MENSAJES_AUTORIZACION = {
    EXITO: {
        AUTORIZAR: 'La compra fue autorizada correctamente',
        RECHAZAR: 'La compra fue rechazada',
    },
    ERROR: {
        CARGAR: 'Error al cargar las compras pendientes de autorización',
        GESTIONAR: 'Error al procesar la autorización',
    },
} as const;