// ============================================================================
// SERVICIO — ENCARGADO DE SOLICITUDES (Sprint 4)
// ============================================================================
//
// Servicio completamente separado del SolicitudesService (solicitante).
// Maneja exclusivamente las operaciones del encargado de bodega:
//   - Obtener su bodega asignada
//   - Listar y filtrar solicitudes de su bandeja
//   - Ver detalle completo de una solicitud
//   - Entregar y rechazar
// ============================================================================

import { Injectable, inject } from '@angular/core';
import {
    Observable, BehaviorSubject,
    map, catchError, of, finalize,
} from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

import {
    ApiResponse, esExitosa, esInfo,
    Paginacion,
} from '../models/solicitudes.models';

// ── Interfaces propias del encargado ────────────────────────────────────────

export interface BodegaEncargado {
    id: number;
    nombre: string;
    id_tipo: number;
    tipo_bodega: string;
    restriccion_acceso_activa: boolean;
    activo: boolean;
}

export interface SolicitudEncargado {
    id: number;
    solicitante: string;          // idUsuario raw
    nombre_solicitante: string;   // ← NUEVO: de datospersonales.nombres
    id_bodega: number;
    id_estado: number;
    estado: string;
    primer_producto: string | null;
    observaciones: string | null;
    created_at: string;
    updated_at: string;
    total_renglones: number;
    renglones_gestionados: number;
}

export interface RenglonDetalle {
    id: number;
    id_producto: number;
    producto: string;
    id_tipo_producto: number;
    tipo_producto: string;
    id_unidad: number;
    unidad: string;
    abreviatura_unidad: string;
    cantidad_solicitada: number | string;
    cantidad_entregada: number | string | null;
    correlativo_inicial_asignado: number | null;
    correlativo_final_asignado: number | null;
    id_usuario_gestion: string | null;
    fecha_gestion: string | null;
    motivo_rechazo: string | null;
}

export interface DetalleSolicitud {
    cabecera: {
        id: number;
        solicitante: string;
        id_bodega: number;
        bodega: string;
        tipo_bodega: string;
        id_estado: number;
        estado: string;
        observaciones: string | null;
        created_at: string;
        updated_at: string;
    };
    renglones: RenglonDetalle[];
}

export interface ParamsBandeja {
    estado?: number | null;
    busqueda?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    pagina?: number;
    por_pagina?: number;
}

// ── Mensajes ─────────────────────────────────────────────────────────────────
const MENSAJES = {
    EXITO: {
        ENTREGAR: 'Solicitud entregada correctamente',
        RECHAZAR: 'Solicitud rechazada y reserva liberada',
    },
    ERROR: {
        BODEGA: 'Error al obtener tu bodega asignada',
        SOLICITUDES: 'Error al cargar la bandeja de solicitudes',
        DETALLE: 'Error al cargar el detalle de la solicitud',
        ENTREGAR: 'Error al procesar la entrega',
        RECHAZAR: 'Error al rechazar la solicitud',
    },
} as const;


@Injectable({ providedIn: 'root' })
export class EncargadoSolicitudesService {

    private readonly api = inject(ServicioGeneralService);

    // ── Estado reactivo ──────────────────────────────────────────────────────

    private readonly _bodega$ = new BehaviorSubject<BodegaEncargado | null>(null);
    private readonly _solicitudes$ = new BehaviorSubject<SolicitudEncargado[]>([]);
    private readonly _paginacion$ = new BehaviorSubject<Paginacion | null>(null);
    private readonly _cargando$ = new BehaviorSubject<boolean>(false);
    private readonly _error$ = new BehaviorSubject<string | null>(null);

    readonly bodega$ = this._bodega$.asObservable();
    readonly solicitudes$ = this._solicitudes$.asObservable();
    readonly paginacion$ = this._paginacion$.asObservable();
    readonly cargando$ = this._cargando$.asObservable();
    readonly error$ = this._error$.asObservable();


    // ========================================================================
    // BODEGA DEL ENCARGADO
    // ========================================================================

    obtenerBodegaEncargado(): Observable<BodegaEncargado | null> {
        const actual = this._bodega$.value;
        if (actual !== null) return of(actual);

        this._cargando$.next(true);

        return this.api.query({
            ruta: 'inventario/obtenerBodegaEncargado',
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<{ bodega: BodegaEncargado }>) => {
                if (esExitosa(res) && res.datos?.bodega) {
                    this._bodega$.next(res.datos.bodega);
                    return res.datos.bodega;
                }
                if (esInfo(res)) {
                    this.api.mensajeServidorGooey('info', res.mensaje);
                    return null;
                }
                throw new Error(res.mensaje);
            }),
            catchError(error => {
                const msg = error instanceof Error ? error.message : MENSAJES.ERROR.BODEGA;
                this._error$.next(msg);
                this.api.mensajeServidorGooey('error', msg);
                return of(null);
            }),
            finalize(() => this._cargando$.next(false)),
        );
    }


    // ========================================================================
    // BANDEJA DEL ENCARGADO
    // ========================================================================

    listarSolicitudesEncargado(params: ParamsBandeja = {}): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        const query = this._buildQuery({
            estado: params.estado ?? undefined,
            busqueda: params.busqueda || undefined,
            fecha_desde: params.fecha_desde || undefined,
            fecha_hasta: params.fecha_hasta || undefined,
            pagina: params.pagina ?? 1,
            por_pagina: params.por_pagina ?? 20,
        });

        return this.api.query({
            ruta: `inventario/listarSolicitudesEncargado${query}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<{
                solicitudes: SolicitudEncargado[];
            } & Paginacion>) => {
                if (esExitosa(res) && res.datos) {
                    this._solicitudes$.next(res.datos.solicitudes ?? []);
                    this._paginacion$.next({
                        total: res.datos.total,
                        pagina: res.datos.pagina,
                        por_pagina: res.datos.por_pagina,
                        paginas: res.datos.paginas,
                    });
                    return true;
                }
                throw new Error(res.mensaje);
            }),
            catchError(this._manejarError(MENSAJES.ERROR.SOLICITUDES)),
            finalize(() => this._cargando$.next(false)),
        );
    }


    // ========================================================================
    // DETALLE DE SOLICITUD
    // ========================================================================

    obtenerDetalle(idSolicitud: number): Observable<DetalleSolicitud | null> {
        this._cargando$.next(true);

        return this.api.query({
            ruta: `inventario/obtenerDetalleSolicitud?id=${idSolicitud}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<DetalleSolicitud>) => {
                if (esExitosa(res) && res.datos) return res.datos;
                throw new Error(res.mensaje);
            }),
            catchError(error => {
                const msg = error instanceof Error ? error.message : MENSAJES.ERROR.DETALLE;
                this.api.mensajeServidorGooey('error', msg);
                return of(null);
            }),
            finalize(() => this._cargando$.next(false)),
        );
    }


    // ========================================================================
    // ENTREGAR SOLICITUD
    // ========================================================================

    entregarSolicitud(idSolicitud: number): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: 'inventario/entregarSolicitud',
            tipo: 'post',
            body: { id_solicitud: idSolicitud },
        }).pipe(
            map((res: ApiResponse) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey('success', MENSAJES.EXITO.ENTREGAR);
                    return true;
                }
                throw new Error(res.mensaje ?? MENSAJES.ERROR.ENTREGAR);
            }),
            catchError(this._manejarError(MENSAJES.ERROR.ENTREGAR)),
            finalize(() => this._cargando$.next(false)),
        );
    }


    // ========================================================================
    // RECHAZAR SOLICITUD
    // ========================================================================

    rechazarSolicitud(idSolicitud: number, motivo: string): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: 'inventario/rechazarSolicitud',
            tipo: 'post',
            body: { id_solicitud: idSolicitud, motivo_rechazo: motivo },
        }).pipe(
            map((res: ApiResponse) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey('success', MENSAJES.EXITO.RECHAZAR);
                    return true;
                }
                throw new Error(res.mensaje ?? MENSAJES.ERROR.RECHAZAR);
            }),
            catchError(this._manejarError(MENSAJES.ERROR.RECHAZAR)),
            finalize(() => this._cargando$.next(false)),
        );
    }


    // ========================================================================
    // GETTERS SÍNCRONOS
    // ========================================================================

    obtenerBodegaActual(): BodegaEncargado | null { return this._bodega$.value; }
    obtenerSolicitudesActuales(): SolicitudEncargado[] { return this._solicitudes$.value; }
    limpiarError(): void { this._error$.next(null); }
    invalidarBodega(): void { this._bodega$.next(null); }


    // ========================================================================
    // AUXILIARES PRIVADOS
    // ========================================================================

    private _buildQuery(params: Record<string, unknown>): string {
        const entries = Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== '');
        if (!entries.length) return '';
        return '?' + entries
            .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
            .join('&');
    }

    private _manejarError(fallback: string) {
        return (error: unknown) => {
            const msg = error instanceof Error ? error.message : fallback;
            console.error(`[EncargadoSolicitudesService] ${msg}:`, error);
            this._error$.next(msg);
            this.api.mensajeServidorGooey('error', msg);
            return of(false);
        };
    }
}