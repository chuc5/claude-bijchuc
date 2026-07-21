// ============================================================================
// SERVICIO — COMPRAS AGENCIA (Flujo 1)
// ============================================================================

import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, map, catchError, of, finalize } from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

import {
    Compra,
    ListadoCompras,
    FiltrosBandejaCompra,
    CompraFormAgencia,
    ProductoCatalogo,
    ApiResponse,
    esExitosa,
    esInfo,
    MENSAJES_COMPRAS_AGENCIA,
} from '../models/compras-agencia.models';

@Injectable({ providedIn: 'root' })
export class ComprasAgenciaService {

    private readonly api = inject(ServicioGeneralService);

    // ── Estado reactivo ───────────────────────────────────────────────────────

    private readonly _compras$ = new BehaviorSubject<Compra[]>([]);
    private readonly _total$ = new BehaviorSubject<number>(0);
    private readonly _productos$ = new BehaviorSubject<ProductoCatalogo[]>([]);
    private readonly _cargando$ = new BehaviorSubject<boolean>(false);
    private readonly _error$ = new BehaviorSubject<string | null>(null);

    readonly compras$ = this._compras$.asObservable();
    readonly total$ = this._total$.asObservable();
    readonly productos$ = this._productos$.asObservable();
    readonly cargando$ = this._cargando$.asObservable();
    readonly error$ = this._error$.asObservable();

    // ── Listar (bandeja del Administrador de Bodegas) ─────────────────────────

    listarBandeja(filtros: FiltrosBandejaCompra = {}): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        const qs = this._construirQueryString(filtros);

        return this.api.query({
            ruta: `inventario/listarBandejaCompraAgencia${qs}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<ListadoCompras>) => {
                if (esExitosa(res)) {
                    this._compras$.next(res.datos?.compras ?? []);
                    this._total$.next(res.datos?.total ?? 0);
                    return true;
                }
                if (esInfo(res)) {
                    this._compras$.next([]);
                    this._total$.next(0);
                    return true;
                }
                throw new Error(res.mensaje);
            }),
            catchError(this._manejarError(MENSAJES_COMPRAS_AGENCIA.ERROR.CARGAR)),
            finalize(() => this._cargando$.next(false)),
        );
    }

    // ── Bodega de agencia del usuario en sesión (para preseleccionar en el modal) ──

    obtenerMiBodegaAgencia(): Observable<{ id: number; nombre: string } | null> {
        return this.api.query({
            ruta: 'inventario/obtenerBodegaAgencia',
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<{ bodega: { id: number; nombre: string;[key: string]: unknown } }>) => {
                if (!esExitosa(res) || !res.datos?.bodega) return null;
                return { id: res.datos.bodega.id, nombre: res.datos.bodega.nombre };
            }),
            catchError(() => {
                this.api.mensajeServidorGooey('error', MENSAJES_COMPRAS_AGENCIA.ERROR.CARGAR_BODEGA);
                return of(null);
            }),
        );
    }

    // ── Catálogo de productos para las líneas del modal ────────────────────────
    // Nota: NO es listarProductosDisponibles (ese es del módulo de Solicitudes de
    // stock — paginado, filtrado por existencia física, una sola unidad por
    // producto). El catálogo completo con TODAS las unidades es listarProductosParaAlta.

    cargarProductosDisponibles(): Observable<boolean> {
        return this.api.query({
            ruta: 'inventario/listarProductosParaAlta',
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<{ productos: ProductoCatalogo[] }>) => {
                if (esExitosa(res)) {
                    this._productos$.next(res.datos?.productos ?? []);
                    return true;
                }
                this._productos$.next([]);
                return esInfo(res);
            }),
            catchError(() => {
                this._productos$.next([]);
                this.api.mensajeServidorGooey('error', MENSAJES_COMPRAS_AGENCIA.ERROR.CARGAR_PRODUCTOS);
                return of(false);
            }),
        );
    }

    // ── Crear solicitud ────────────────────────────────────────────────────────

    crearSolicitud(datos: CompraFormAgencia): Observable<boolean> {
        return this._ejecutarAccion(
            'inventario/crearSolicitudCompraAgencia', datos,
            MENSAJES_COMPRAS_AGENCIA.EXITO.CREAR,
            MENSAJES_COMPRAS_AGENCIA.ERROR.CREAR,
        );
    }

    // ── Gestionar (aprobar / rechazar) ─────────────────────────────────────────

    gestionarSolicitud(idCompra: number, aprueba: boolean, comentario: string): Observable<boolean> {
        return this._ejecutarAccion(
            'inventario/gestionarSolicitudCompraAgencia',
            { id_compra: idCompra, aprueba, comentario },
            aprueba ? MENSAJES_COMPRAS_AGENCIA.EXITO.APROBAR : MENSAJES_COMPRAS_AGENCIA.EXITO.RECHAZAR,
            MENSAJES_COMPRAS_AGENCIA.ERROR.GESTIONAR,
        );
    }

    // ── Getters síncronos ─────────────────────────────────────────────────────

    obtenerComprasActuales(): Compra[] { return this._compras$.value; }
    limpiarError(): void { this._error$.next(null); }

    // ── Auxiliares privados ───────────────────────────────────────────────────

    private _ejecutarAccion(
        ruta: string, payload: object,
        mensajeExito: string, mensajeError: string,
    ): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({ ruta, tipo: 'post', body: payload }).pipe(
            map((res: ApiResponse) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey('success', mensajeExito);
                    return true;
                }
                if (esInfo(res)) {
                    this.api.mensajeServidorGooey('info', res.mensaje);
                    return true;
                }
                throw new Error(res.mensaje ?? mensajeError);
            }),
            catchError(this._manejarError(mensajeError)),
            finalize(() => this._cargando$.next(false)),
        );
    }

    private _construirQueryString(filtros: FiltrosBandejaCompra): string {
        const params = new URLSearchParams();
        if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
        if (filtros.id_estado) params.set('id_estado', String(filtros.id_estado));
        if (filtros.pagina) params.set('pagina', String(filtros.pagina));
        if (filtros.por_pagina) params.set('por_pagina', String(filtros.por_pagina));
        const qs = params.toString();
        return qs ? `?${qs}` : '';
    }

    private _manejarError(mensajeFallback: string) {
        return (error: unknown) => {
            const mensaje = error instanceof Error ? error.message : mensajeFallback;
            console.error('[ComprasAgenciaService]', mensaje, error);
            this._error$.next(mensaje);
            this.api.mensajeServidorGooey('error', mensaje);
            return of(false);
        };
    }
}