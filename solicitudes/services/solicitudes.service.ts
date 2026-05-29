// ============================================================================
// SERVICIO — SOLICITUDES (solicitante) — Sprint 1
// ============================================================================
//
// Cubre únicamente los endpoints del solicitante (GET).
// Los métodos de creación y cancelación se agregan en Sprint 2.
// El encargado tiene su propio servicio separado.
// ============================================================================

import { Injectable, inject } from '@angular/core';
import {
    Observable, BehaviorSubject,
    map, catchError, of, finalize, tap,
} from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

import {
    BodegaAgencia,
    BodegaArea,
    ProductoDisponible,
    Solicitud,
    Paginacion,
    ApiResponse,
    esExitosa,
    esInfo,
    MENSAJES_SOLICITUDES,
    UnidadConStock,
    RespuestaUnidades,
    TipoProductoId
} from '../models/solicitudes.models';
import { DetalleSolicitud } from '../services/encargado-solicitudes.service';

// ── Tipos internos de respuesta del backend ──────────────────────────────────

interface RespuestaBodegaAgencia {
    bodega: BodegaAgencia;
}

interface RespuestaBodegasArea {
    bodegas: BodegaArea[];
    total: number;
}

interface RespuestaProductos extends Paginacion {
    productos: ProductoDisponible[];
    bodega: { id: number; nombre: string };
}

interface RespuestaSolicitudes extends Paginacion {
    solicitudes: Solicitud[];
}

// ── Parámetros opcionales de búsqueda ────────────────────────────────────────

export interface ParamsProductos {
    busqueda?: string;
    pagina?: number;
    por_pagina?: number;
}

export interface ParamsSolicitudes {
    id_bodega?: number;
    estado?: number | null;
    pagina?: number;
    por_pagina?: number;
}


// ============================================================================
// SERVICIO
// ============================================================================

@Injectable({ providedIn: 'root' })
export class SolicitudesService {

    private readonly api = inject(ServicioGeneralService);

    // ── Estado reactivo ──────────────────────────────────────────────────────

    private readonly _bodegaAgencia$ = new BehaviorSubject<BodegaAgencia | null>(null);
    private readonly _bodegasArea$ = new BehaviorSubject<BodegaArea[]>([]);
    private readonly _productos$ = new BehaviorSubject<ProductoDisponible[]>([]);
    private readonly _paginacionProductos$ = new BehaviorSubject<Paginacion | null>(null);
    private readonly _solicitudes$ = new BehaviorSubject<Solicitud[]>([]);
    private readonly _paginacionSolicitudes$ = new BehaviorSubject<Paginacion | null>(null);
    private readonly _cargando$ = new BehaviorSubject<boolean>(false);
    private readonly _error$ = new BehaviorSubject<string | null>(null);

    /** Nombre de la bodega del catálogo activo (para mostrar en header) */
    private readonly _nombreBodegaActual$ = new BehaviorSubject<string>('');

    // ── Observables públicos (readonly) ──────────────────────────────────────

    readonly bodegaAgencia$ = this._bodegaAgencia$.asObservable();
    readonly bodegasArea$ = this._bodegasArea$.asObservable();
    readonly productos$ = this._productos$.asObservable();
    readonly paginacionProductos$ = this._paginacionProductos$.asObservable();
    readonly solicitudes$ = this._solicitudes$.asObservable();
    readonly paginacionSolicitudes$ = this._paginacionSolicitudes$.asObservable();
    readonly cargando$ = this._cargando$.asObservable();
    readonly error$ = this._error$.asObservable();
    readonly nombreBodegaActual$ = this._nombreBodegaActual$.asObservable();


    // ========================================================================
    // OBTENER BODEGA DE AGENCIA
    // ========================================================================

    /**
     * Obtiene la bodega de agencia del usuario autenticado.
     * Tiene caché simple: si ya está cargada no vuelve a hacer HTTP.
     *
     * Retorna:
     *   BodegaAgencia | null
     *   null → backend devolvió info() (agencia sin bodega activa)
     */
    obtenerBodegaAgencia(): Observable<BodegaAgencia | null> {
        // Caché: si ya tenemos la bodega, retornar sin HTTP
        const actual = this._bodegaAgencia$.value;
        if (actual !== null) return of(actual);

        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: 'inventario/obtenerBodegaAgencia',
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<RespuestaBodegaAgencia>) => {
                if (esExitosa(res) && res.datos?.bodega) {
                    this._bodegaAgencia$.next(res.datos.bodega);
                    this._nombreBodegaActual$.next(res.datos.bodega.nombre);
                    return res.datos.bodega;
                }
                if (esInfo(res)) {
                    // La agencia no tiene bodega — estado válido, no es error
                    this.api.mensajeServidorGooey('info', res.mensaje);
                    return null;
                }
                throw new Error(res.mensaje);
            }),
            catchError(error => {
                const msg = error instanceof Error
                    ? error.message
                    : MENSAJES_SOLICITUDES.ERROR.CARGAR_BODEGA;
                this._error$.next(msg);
                this.api.mensajeServidorGooey('error', msg);
                return of(null);
            }),
            finalize(() => this._cargando$.next(false)),
        );
    }

    /** Invalida la caché para forzar recarga en la próxima llamada */
    invalidarBodegaAgencia(): void {
        this._bodegaAgencia$.next(null);
        this._nombreBodegaActual$.next('');
    }


    // ========================================================================
    // LISTAR BODEGAS DE ÁREA
    // ========================================================================

    /**
     * Obtiene las bodegas de área activas con el flag de acceso del usuario.
     * Retorna true si la operación fue exitosa (incluso con lista vacía vía info).
     */
    listarBodegasArea(): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: 'inventario/listarBodegasArea',
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<RespuestaBodegasArea>) => {
                if (esExitosa(res)) {
                    this._bodegasArea$.next(res.datos?.bodegas ?? []);
                    return true;
                }
                if (esInfo(res)) {
                    this._bodegasArea$.next([]);
                    this.api.mensajeServidorGooey('info', res.mensaje);
                    return true;
                }
                throw new Error(res.mensaje);
            }),
            catchError(this._manejarError(MENSAJES_SOLICITUDES.ERROR.CARGAR_BODEGAS_AREA)),
            finalize(() => this._cargando$.next(false)),
        );
    }


    // ========================================================================
    // LISTAR PRODUCTOS DISPONIBLES
    // ========================================================================

    /**
     * Catálogo paginado de una bodega con disponibilidad en tiempo real.
     * Actualiza _productos$ y _paginacionProductos$.
     *
     * @param idBodega  ID de la bodega a consultar
     * @param params    Búsqueda, página y por_página opcionales
     */
    listarProductosDisponibles(
        idBodega: number,
        params: ParamsProductos = {},
    ): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        // Construir query string con los parámetros no vacíos
        const query = this._buildQuery({
            id_bodega: idBodega,
            busqueda: params.busqueda || undefined,
            pagina: params.pagina ?? 1,
            por_pagina: params.por_pagina ?? 20,
        });

        return this.api.query({
            ruta: `inventario/listarProductosDisponibles${query}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<RespuestaProductos>) => {
                if (esExitosa(res) && res.datos) {
                    this._productos$.next(res.datos.productos ?? []);
                    this._paginacionProductos$.next({
                        total: res.datos.total,
                        pagina: res.datos.pagina,
                        por_pagina: res.datos.por_pagina,
                        paginas: res.datos.paginas,
                    });
                    if (res.datos.bodega?.nombre) {
                        this._nombreBodegaActual$.next(res.datos.bodega.nombre);
                    }
                    return true;
                }
                if (esInfo(res)) {
                    // Bodega sin productos disponibles — no es error
                    this._productos$.next([]);
                    this._paginacionProductos$.next(null);
                    this.api.mensajeServidorGooey('info', res.mensaje);
                    return true;
                }
                throw new Error(res.mensaje);
            }),
            catchError(this._manejarError(MENSAJES_SOLICITUDES.ERROR.CARGAR_PRODUCTOS)),
            finalize(() => this._cargando$.next(false)),
        );
    }


    // ========================================================================
    // LISTAR MIS SOLICITUDES
    // ========================================================================

    /**
     * Solicitudes paginadas del usuario autenticado.
     * Actualiza _solicitudes$ y _paginacionSolicitudes$.
     */
    listarMisSolicitudes(params: ParamsSolicitudes = {}): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        const query = this._buildQuery({
            id_bodega: params.id_bodega || undefined,
            estado: params.estado ?? undefined,
            pagina: params.pagina ?? 1,
            por_pagina: params.por_pagina ?? 20,
        });

        return this.api.query({
            ruta: `inventario/listarMisSolicitudes${query}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<RespuestaSolicitudes>) => {
                if (esExitosa(res)) {
                    this._solicitudes$.next(res.datos?.solicitudes ?? []);
                    this._paginacionSolicitudes$.next(
                        res.datos
                            ? {
                                total: res.datos.total,
                                pagina: res.datos.pagina,
                                por_pagina: res.datos.por_pagina,
                                paginas: res.datos.paginas,
                            }
                            : null,
                    );
                    return true;
                }
                throw new Error(res.mensaje);
            }),
            catchError(this._manejarError(MENSAJES_SOLICITUDES.ERROR.CARGAR_SOLICITUDES)),
            finalize(() => this._cargando$.next(false)),
        );
    }

    /**
 * Devuelve las unidades activas de un producto en una bodega
 * junto con la disponibilidad de stock de cada una.
 * Retorna el array de unidades o [] si el backend responde info().
 */
    obtenerUnidadesProducto(
        idProducto: number,
        idBodega: number,
    ): Observable<RespuestaUnidades> {
        return this.api.query({
            ruta: `inventario/obtenerUnidadesProducto?id_producto=${idProducto}&id_bodega=${idBodega}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<RespuestaUnidades>) => {
                if (esExitosa(res) && res.datos) return res.datos;
                if (esInfo(res)) return { tipo: TipoProductoId.NORMAL, unidades: [] };
                throw new Error(res.mensaje);
            }),
            catchError(error => {
                const msg = error instanceof Error ? error.message : MENSAJES_SOLICITUDES.ERROR.UNIDADES;
                console.error('[SolicitudesService] obtenerUnidadesProducto:', msg);
                return of({ tipo: TipoProductoId.NORMAL, unidades: [] } as RespuestaUnidades);
            }),
        );
    }


    // ========================================================================
    // CREAR SOLICITUD (Sprint 2)
    // ========================================================================

    /**
     * Crea una solicitud reservando el stock de forma atómica.
     * Retorna el id_solicitud si fue exitoso, null si falló.
     */
    crearSolicitud(payload: {
        id_bodega: number;
        id_producto: number;
        id_unidad: number;
        cantidad: number;
        observaciones?: string;
    }): Observable<number | null> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: 'inventario/crearSolicitud',
            tipo: 'post',
            body: payload,
        }).pipe(
            map((res: ApiResponse) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey(
                        'success', MENSAJES_SOLICITUDES.EXITO.CREAR
                    );
                    // El backend devuelve id_solicitud en los campos extra
                    return (res as any)['id_solicitud'] as number ?? null;
                }
                throw new Error(res.mensaje ?? MENSAJES_SOLICITUDES.ERROR.CREAR);
            }),
            catchError(error => {
                const msg = error instanceof Error
                    ? error.message
                    : MENSAJES_SOLICITUDES.ERROR.CREAR;
                console.error('[SolicitudesService] crearSolicitud:', msg);
                this._error$.next(msg);
                this.api.mensajeServidorGooey('error', msg);
                return of(null);
            }),
            finalize(() => this._cargando$.next(false)),
        );
    }


    // ========================================================================
    // CANCELAR SOLICITUD (Sprint 2)
    // ========================================================================

    /**
     * Cancela una solicitud Reservada y libera el stock reservado.
     * Retorna true si tuvo éxito, false si falló.
     */
    cancelarSolicitud(idSolicitud: number): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: 'inventario/cancelarSolicitud',
            tipo: 'post',
            body: { id_solicitud: idSolicitud },
        }).pipe(
            map((res: ApiResponse) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey(
                        'success', MENSAJES_SOLICITUDES.EXITO.CANCELAR
                    );
                    return true;
                }
                throw new Error(res.mensaje ?? MENSAJES_SOLICITUDES.ERROR.CANCELAR);
            }),
            catchError(this._manejarError(MENSAJES_SOLICITUDES.ERROR.CANCELAR)),
            finalize(() => this._cargando$.next(false)),
        );
    }

    obtenerDetalleSolicitud(idSolicitud: number): Observable<DetalleSolicitud | null> {
        return this.api.query({
            ruta: `inventario/obtenerDetalleSolicitud?id=${idSolicitud}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<DetalleSolicitud>) => {
                if (esExitosa(res) && res.datos) return res.datos;
                throw new Error(res.mensaje);
            }),
            catchError(error => {
                const msg = error instanceof Error ? error.message : 'Error al cargar el detalle';
                this.api.mensajeServidorGooey('error', msg);
                return of(null);
            }),
        );
    }



    // ========================================================================
    // GETTERS SÍNCRONOS
    // ========================================================================

    obtenerBodegaAgenciaActual(): BodegaAgencia | null {
        return this._bodegaAgencia$.value;
    }
    obtenerProductosActuales(): ProductoDisponible[] {
        return this._productos$.value;
    }
    obtenerSolicitudesActuales(): Solicitud[] {
        return this._solicitudes$.value;
    }

    limpiarError(): void {
        this._error$.next(null);
    }


    // ========================================================================
    // AUXILIARES PRIVADOS
    // ========================================================================

    /**
     * Construye un query string a partir de un objeto de parámetros,
     * omitiendo los valores undefined/null/vacíos.
     */
    private _buildQuery(params: Record<string, unknown>): string {
        const entries = Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== '');
        if (!entries.length) return '';
        return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    }

    /** Actualiza el estado de error, muestra toast y retorna of(false) */
    private _manejarError(mensajeFallback: string) {
        return (error: unknown) => {
            const msg = error instanceof Error ? error.message : mensajeFallback;
            console.error(`[SolicitudesService] ${msg}:`, error);
            this._error$.next(msg);
            this.api.mensajeServidorGooey('error', msg);
            return of(false);
        };
    }
}