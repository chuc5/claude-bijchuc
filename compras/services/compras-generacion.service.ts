// ============================================================================
// SERVICIO — GENERACIÓN DE COMPRAS (Trimestral + Extraordinaria)
// ============================================================================

import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, map, catchError, of, finalize } from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

import {
    ResultadoTrimestral,
    BodegaOpcion,
    ProductoCatalogo,
    CompraFormExtraordinaria,
    ApiResponse,
    esExitosa,
    esInfo,
    MENSAJES_GENERACION,
} from '../models/compras-generacion.models';

@Injectable({ providedIn: 'root' })
export class ComprasGeneracionService {

    private readonly api = inject(ServicioGeneralService);

    // ── Estado reactivo ───────────────────────────────────────────────────────

    private readonly _bodegas$ = new BehaviorSubject<BodegaOpcion[]>([]);
    private readonly _productos$ = new BehaviorSubject<ProductoCatalogo[]>([]);
    private readonly _generandoTrimestral$ = new BehaviorSubject<boolean>(false);
    private readonly _guardandoExtraordinaria$ = new BehaviorSubject<boolean>(false);

    readonly bodegas$ = this._bodegas$.asObservable();
    readonly productos$ = this._productos$.asObservable();
    readonly generandoTrimestral$ = this._generandoTrimestral$.asObservable();
    readonly guardandoExtraordinaria$ = this._guardandoExtraordinaria$.asObservable();

    // ── Trimestral ────────────────────────────────────────────────────────────

    generarTrimestrales(): Observable<ResultadoTrimestral | null> {
        this._generandoTrimestral$.next(true);

        return this.api.query({
            ruta: 'inventario/generarComprasTrimestrales',
            tipo: 'post',
            body: {},
        }).pipe(
            map((res: ApiResponse<ResultadoTrimestral>) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey('success', res.mensaje ?? MENSAJES_GENERACION.EXITO.TRIMESTRAL);
                    return res.datos ?? null;
                }
                if (esInfo(res)) {
                    this.api.mensajeServidorGooey('info', res.mensaje ?? MENSAJES_GENERACION.INFO.SIN_NECESIDAD);
                    return null;
                }
                throw new Error(res.mensaje ?? MENSAJES_GENERACION.ERROR.TRIMESTRAL);
            }),
            catchError(error => {
                const mensaje = error instanceof Error ? error.message : MENSAJES_GENERACION.ERROR.TRIMESTRAL;
                console.error('[ComprasGeneracionService]', mensaje, error);
                this.api.mensajeServidorGooey('error', mensaje);
                return of(null);
            }),
            finalize(() => this._generandoTrimestral$.next(false)),
        );
    }

    // ── Extraordinaria: catálogo de apoyo ───────────────────────────────────────

    cargarBodegasActivas(): Observable<boolean> {
        return this.api.query({
            ruta: 'inventario/listarBodegas',
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<{ bodegas: BodegaOpcion[] }>) => {
                if (esExitosa(res)) {
                    const activas = (res.datos?.bodegas ?? []).filter(b => b.activo === 1);
                    this._bodegas$.next(activas);
                    return true;
                }
                this._bodegas$.next([]);
                return esInfo(res);
            }),
            catchError(() => {
                this._bodegas$.next([]);
                this.api.mensajeServidorGooey('error', MENSAJES_GENERACION.ERROR.CARGAR_BODEGAS);
                return of(false);
            }),
        );
    }

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
                this.api.mensajeServidorGooey('error', MENSAJES_GENERACION.ERROR.CARGAR_PRODUCTOS);
                return of(false);
            }),
        );
    }

    // ── Extraordinaria: creación ────────────────────────────────────────────────

    crearExtraordinaria(datos: CompraFormExtraordinaria): Observable<boolean> {
        this._guardandoExtraordinaria$.next(true);

        return this.api.query({
            ruta: 'inventario/crearCompraExtraordinaria',
            tipo: 'post',
            body: datos,
        }).pipe(
            map((res: ApiResponse) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey('success', res.mensaje ?? MENSAJES_GENERACION.EXITO.EXTRAORDINARIA);
                    return true;
                }
                throw new Error(res.mensaje ?? MENSAJES_GENERACION.ERROR.EXTRAORDINARIA);
            }),
            catchError(error => {
                const mensaje = error instanceof Error ? error.message : MENSAJES_GENERACION.ERROR.EXTRAORDINARIA;
                console.error('[ComprasGeneracionService]', mensaje, error);
                this.api.mensajeServidorGooey('error', mensaje);
                return of(false);
            }),
            finalize(() => this._guardandoExtraordinaria$.next(false)),
        );
    }
}