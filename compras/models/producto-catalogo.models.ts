// ============================================================================
// MODELO COMPARTIDO — CATÁLOGO DE PRODUCTOS
// ============================================================================
//
// id_tipo no es una "categoría": es el TIPO DE CONTROL de inventario del
// producto (mismo catálogo tipos_producto que usa inventarioApiClass):
//   1 = Correlativo  (series numeradas — lotes_correlativo)
//   2 = Expiración    (fecha de vencimiento — lotes_expiracion, PEPS)
//   3 = Normal        (FIFO simple — lotes_normal)
// Cuando se solicita un producto tipo 1, se puede indicar OPCIONALMENTE el
// rango de correlativo deseado (serie/resolución/rango) — si no se llena,
// el encargado lo completa al recibir el lote físico.
// ============================================================================

export const TIPO_CONTROL_PRODUCTO = {
    CORRELATIVO: 1,
    EXPIRACION: 2,
    NORMAL: 3,
} as const;

export type TipoControlProductoId = typeof TIPO_CONTROL_PRODUCTO[keyof typeof TIPO_CONTROL_PRODUCTO];

export interface UnidadProducto {
    id: number;
    nombre: string;
    abreviatura: string;
    es_default: boolean;
}

export interface ProductoCatalogo {
    id: number;
    nombre: string;
    id_tipo: TipoControlProductoId;
    tipo: string;
    unidades: UnidadProducto[];
}

/** Campos opcionales de correlativo — solo se envían si el producto es tipo Correlativo. */
export interface CorrelativoOpcional {
    serie?: string | null;
    resolucion?: string | null;
    fecha_resolucion?: string | null;
    correlativo_inicial?: number | null;
    correlativo_final?: number | null;
}