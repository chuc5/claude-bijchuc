// ============================================================================
// MODELOS — GENERACIÓN DE COMPRAS (Flujos 3 y 4, solo Administrador)
// ============================================================================
//
// Ninguno de los dos tiene bandeja propia: Trimestral genera compras
// directo en estado Aprobada (van a la Mesa de trabajo); Extraordinaria
// nace en Requiere Autorización (va a la cola de Autorización). Por eso
// esta pantalla es solo un panel de acciones, no un listado persistente.
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

// ── Trimestral ────────────────────────────────────────────────────────────────

export interface CompraGeneradaTrimestral {
    id_compra: number;
    id_bodega: number;
    lineas: number;
}

export interface ResultadoTrimestral {
    ordenes: CompraGeneradaTrimestral[];
    lineas_sin_necesidad: number;
}

// ── Extraordinaria ───────────────────────────────────────────────────────────

export interface BodegaOpcion {
    id: number;
    nombre: string;
    id_tipo: 1 | 2;
    activo: 0 | 1;
}

export interface CompraLineaForm {
    id_producto: number | null;
    id_unidad: number | null;
    cantidad: number | null;
    // Opcionales — solo se muestran/envían si el producto es tipo Correlativo (id_tipo=1)
    serie?: string | null;
    resolucion?: string | null;
    fecha_resolucion?: string | null;
    correlativo_inicial?: number | null;
    correlativo_final?: number | null;
}

export interface CompraFormExtraordinaria {
    id_bodega: number;
    lineas: CompraLineaForm[];
}

// ── Mensajes ────────────────────────────────────────────────────────────────────

export const MENSAJES_GENERACION = {
    EXITO: {
        TRIMESTRAL: 'Se generaron las compras trimestrales',
        EXTRAORDINARIA: 'La compra extraordinaria fue creada correctamente',
    },
    INFO: {
        SIN_NECESIDAD: 'Existencia suficiente para cubrir el próximo trimestre. No se requiere compra.',
    },
    ERROR: {
        TRIMESTRAL: 'Error al generar las compras trimestrales',
        EXTRAORDINARIA: 'Error al crear la compra extraordinaria',
        CARGAR_BODEGAS: 'Error al cargar las bodegas',
        CARGAR_PRODUCTOS: 'Error al cargar el catálogo de productos',
    },
} as const;