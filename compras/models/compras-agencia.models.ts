// ============================================================================
// MODELOS — COMPRAS AGENCIA (Flujo 1)
// ============================================================================
//
// Estados (catálogo EstadoCompra del backend):
//   1 Solicitada · 2 Aprobada · 3 Rechazada · 4 Requiere Autorización
//   5 Comprado · 6 Enviado · 7 Registrado · 8 Cancelada
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

// ── Catálogo de productos: modelo compartido (ver producto-catalogo.models.ts) ──
export type { ProductoCatalogo, UnidadProducto, TipoControlProductoId } from './producto-catalogo.models';
export { TIPO_CONTROL_PRODUCTO } from './producto-catalogo.models';

// ── Estado ────────────────────────────────────────────────────────────────────

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

// ── Compra (cabecera, tal como llega de listarBandejaCompraAgencia) ───────────

export interface CompraLineaResumen {
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

export interface Compra {
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
    requiere_autorizacion: 0 | 1;
    created_at: string;
    lineas: CompraLineaResumen[];
    total_lineas: number;
}

export interface ListadoCompras {
    compras: Compra[];
    total: number;
    pagina: number;
    por_pagina: number;
}

export interface FiltrosBandejaCompra {
    busqueda?: string;
    id_estado?: EstadoCompraId | null;
    pagina?: number;
    por_pagina?: number;
}

// ── Formulario de creación ─────────────────────────────────────────────────────

export interface CompraLineaForm {
    id_producto: number | null;
    id_unidad: number | null;
    cantidad: number | null;
    justificacion?: string | null;
    // Opcionales — solo se muestran/envían si el producto es tipo Correlativo (id_tipo=1)
    serie?: string | null;
    resolucion?: string | null;
    fecha_resolucion?: string | null;
    correlativo_inicial?: number | null;
    correlativo_final?: number | null;
}

export interface CompraFormAgencia {
    id_bodega: number;
    lineas: CompraLineaForm[];
}

// ── Gestión (aprobar / rechazar) ───────────────────────────────────────────────

export interface GestionSolicitudPayload {
    id_compra: number;
    aprueba: boolean;
    comentario: string;
}

// ── Mensajes ────────────────────────────────────────────────────────────────────

export const MENSAJES_COMPRAS_AGENCIA = {
    EXITO: {
        CREAR: 'La solicitud de compra fue registrada correctamente',
        APROBAR: 'La solicitud fue aprobada correctamente',
        RECHAZAR: 'La solicitud fue rechazada',
        CANCELAR: 'La solicitud fue cancelada',
    },
    ERROR: {
        CARGAR: 'Error al cargar las solicitudes de compra',
        CREAR: 'Error al registrar la solicitud de compra',
        GESTIONAR: 'Error al gestionar la solicitud',
        CARGAR_PRODUCTOS: 'Error al cargar el catálogo de productos',
        CARGAR_BODEGA: 'Error al obtener la bodega de agencia asignada',
    },
} as const;