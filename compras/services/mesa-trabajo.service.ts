// ============================================================================
// SERVICIO — MESA DE TRABAJO (común a los 4 flujos de Compras)
// ============================================================================

import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, map, catchError, of, finalize } from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

import {
    CompraDetalle,
    ProcesarCompraPayload,
    ResultadoProcesarCompra,
    ApiResponse,
    esExitosa,
    esInfo,
    MENSAJES_MESA_TRABAJO,
} from '../models/mesa-trabajo.models';

@Injectable({ providedIn: 'root' })
export class MesaTrabajoService {

    private readonly api = inject(ServicioGeneralService);

    // ── Estado reactivo ───────────────────────────────────────────────────────

    private readonly _compra$ = new BehaviorSubject<CompraDetalle | null>(null);
    private readonly _cargando$ = new BehaviorSubject<boolean>(false);
    private readonly _guardando$ = new BehaviorSubject<boolean>(false);
    private readonly _error$ = new BehaviorSubject<string | null>(null);

    readonly compra$ = this._compra$.asObservable();
    readonly cargando$ = this._cargando$.asObservable();
    readonly guardando$ = this._guardando$.asObservable();
    readonly error$ = this._error$.asObservable();

    // ── Cargar detalle ────────────────────────────────────────────────────────

    obtenerCompra(idCompra: number): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: `inventario/obtenerCompra?id=${idCompra}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<{ compra: CompraDetalle }>) => {
                if (esExitosa(res)) {
                    this._compra$.next(res.datos?.compra ?? null);
                    return true;
                }
                throw new Error(res.mensaje);
            }),
            catchError(this._manejarError(MENSAJES_MESA_TRABAJO.ERROR.CARGAR)),
            finalize(() => this._cargando$.next(false)),
        );
    }

    // ── Guardar cambios (ajustes + precios + auto-envío) ───────────────────────

    procesarCompra(payload: ProcesarCompraPayload): Observable<ResultadoProcesarCompra | null> {
        this._guardando$.next(true);
        this._error$.next(null);

        return this.api.query({
            ruta: 'inventario/procesarCompra',
            tipo: 'post',
            body: payload,
        }).pipe(
            map((res: ApiResponse<ResultadoProcesarCompra>) => {
                if (esExitosa(res)) {
                    this.api.mensajeServidorGooey('success', res.mensaje ?? MENSAJES_MESA_TRABAJO.EXITO.GUARDAR);
                    return res.datos ?? null;
                }
                if (esInfo(res)) {
                    this.api.mensajeServidorGooey('info', res.mensaje);
                    return null;
                }
                throw new Error(res.mensaje ?? MENSAJES_MESA_TRABAJO.ERROR.GUARDAR);
            }),
            catchError(error => {
                const mensaje = error instanceof Error ? error.message : MENSAJES_MESA_TRABAJO.ERROR.GUARDAR;
                console.error('[MesaTrabajoService]', mensaje, error);
                this._error$.next(mensaje);
                this.api.mensajeServidorGooey('error', mensaje);
                return of(null);
            }),
            finalize(() => this._guardando$.next(false)),
        );
    }

    // ── Getters síncronos ─────────────────────────────────────────────────────

    obtenerCompraActual(): CompraDetalle | null { return this._compra$.value; }
    limpiarError(): void { this._error$.next(null); }

    // ── Auxiliares privados ───────────────────────────────────────────────────

    private _manejarError(mensajeFallback: string) {
        return (error: unknown) => {
            const mensaje = error instanceof Error ? error.message : mensajeFallback;
            console.error('[MesaTrabajoService]', mensaje, error);
            this._error$.next(mensaje);
            this.api.mensajeServidorGooey('error', mensaje);
            return of(false);
        };
    }
}