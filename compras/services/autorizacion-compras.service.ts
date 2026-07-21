// ============================================================================
// SERVICIO — AUTORIZACIÓN GERENCIA/FINANCIERO
// ============================================================================

import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, map, catchError, of, finalize } from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

import {
    CompraAutorizacion,
    ListadoAutorizacion,
    ApiResponse,
    esExitosa,
    esInfo,
    MENSAJES_AUTORIZACION,
} from '../models/autorizacion.models';

@Injectable({ providedIn: 'root' })
export class AutorizacionComprasService {

    private readonly api = inject(ServicioGeneralService);

    // ── Estado reactivo ───────────────────────────────────────────────────────

    private readonly _compras$ = new BehaviorSubject<CompraAutorizacion[]>([]);
    private readonly _total$ = new BehaviorSubject<number>(0);
    private readonly _cargando$ = new BehaviorSubject<boolean>(false);
    private readonly _error$ = new BehaviorSubject<string | null>(null);

    readonly compras$ = this._compras$.asObservable();
    readonly total$ = this._total$.asObservable();
    readonly cargando$ = this._cargando$.asObservable();
    readonly error$ = this._error$.asObservable();

    // ── Listar cola de autorización ───────────────────────────────────────────

    listarPendientes(pagina = 1, porPagina = 20): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: `inventario/listarComprasAutorizacion?pagina=${pagina}&por_pagina=${porPagina}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<ListadoAutorizacion>) => {
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
            catchError(this._manejarError(MENSAJES_AUTORIZACION.ERROR.CARGAR)),
            finalize(() => this._cargando$.next(false)),
        );
    }

    // ── Autorizar / rechazar ──────────────────────────────────────────────────

    autorizar(idCompra: number, autoriza: boolean, comentario: string): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: 'inventario/autorizarCompra',
            tipo: 'post',
            body: { id_compra: idCompra, autoriza, comentario },
        }).pipe(
            map((res: ApiResponse) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey(
                        'success',
                        autoriza ? MENSAJES_AUTORIZACION.EXITO.AUTORIZAR : MENSAJES_AUTORIZACION.EXITO.RECHAZAR,
                    );
                    return true;
                }
                throw new Error(res.mensaje ?? MENSAJES_AUTORIZACION.ERROR.GESTIONAR);
            }),
            catchError(this._manejarError(MENSAJES_AUTORIZACION.ERROR.GESTIONAR)),
            finalize(() => this._cargando$.next(false)),
        );
    }

    // ── Getters síncronos ─────────────────────────────────────────────────────

    obtenerComprasActuales(): CompraAutorizacion[] { return this._compras$.value; }
    limpiarError(): void { this._error$.next(null); }

    // ── Auxiliares privados ───────────────────────────────────────────────────

    private _manejarError(mensajeFallback: string) {
        return (error: unknown) => {
            const mensaje = error instanceof Error ? error.message : mensajeFallback;
            console.error('[AutorizacionComprasService]', mensaje, error);
            this._error$.next(mensaje);
            this.api.mensajeServidorGooey('error', mensaje);
            return of(false);
        };
    }
}