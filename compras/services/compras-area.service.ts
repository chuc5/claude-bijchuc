// ============================================================================
// SERVICIO — COMPRAS ÁREA (Flujo 2)
// ============================================================================

import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, map, catchError, of, finalize } from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

import {
    Compra,
    ListadoCompras,
    FiltrosBandejaCompra,
    CompraFormArea,
    AreaDisponible,
    CatalogoPermitido,
    ApiResponse,
    esExitosa,
    esInfo,
    MENSAJES_COMPRAS_AREA,
} from '../models/compras-area.models';

@Injectable({ providedIn: 'root' })
export class ComprasAreaService {

    private readonly api = inject(ServicioGeneralService);

    // ── Estado reactivo ───────────────────────────────────────────────────────

    private readonly _compras$ = new BehaviorSubject<Compra[]>([]);
    private readonly _total$ = new BehaviorSubject<number>(0);
    private readonly _areasDisponibles$ = new BehaviorSubject<AreaDisponible[]>([]);
    private readonly _catalogo$ = new BehaviorSubject<CatalogoPermitido>({ restringida: false, productos: [] });
    private readonly _cargando$ = new BehaviorSubject<boolean>(false);
    private readonly _error$ = new BehaviorSubject<string | null>(null);

    readonly compras$ = this._compras$.asObservable();
    readonly total$ = this._total$.asObservable();
    readonly areasDisponibles$ = this._areasDisponibles$.asObservable();
    readonly catalogo$ = this._catalogo$.asObservable();
    readonly cargando$ = this._cargando$.asObservable();
    readonly error$ = this._error$.asObservable();

    // ── Listar (bandeja del encargado de la bodega de área en sesión) ─────────

    listarBandeja(filtros: FiltrosBandejaCompra = {}): Observable<boolean> {
        this._cargando$.next(true);
        this._error$.next(null);

        const qs = this._construirQueryString(filtros);

        return this.api.query({
            ruta: `inventario/listarBandejaCompraArea${qs}`,
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
            catchError(this._manejarError(MENSAJES_COMPRAS_AREA.ERROR.CARGAR)),
            finalize(() => this._cargando$.next(false)),
        );
    }

    // ── Paso 1: áreas disponibles para el usuario en sesión ─────────────────────

    listarAreasDisponibles(): Observable<boolean> {
        return this.api.query({
            ruta: 'inventario/listarAreasDisponiblesCompra',
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<{ areas: AreaDisponible[] }>) => {
                if (esExitosa(res)) {
                    this._areasDisponibles$.next(res.datos?.areas ?? []);
                    return true;
                }
                this._areasDisponibles$.next([]);
                return esInfo(res);
            }),
            catchError(() => {
                this._areasDisponibles$.next([]);
                this.api.mensajeServidorGooey('error', MENSAJES_COMPRAS_AREA.ERROR.CARGAR_AREAS);
                return of(false);
            }),
        );
    }

    // ── Paso 2: catálogo filtrado por la matriz de acceso de la bodega elegida ──

    cargarProductosPermitidos(idBodega: number): Observable<boolean> {
        return this.api.query({
            ruta: `inventario/listarProductosPermitidosArea?id_bodega=${idBodega}`,
            tipo: 'get',
        }).pipe(
            map((res: ApiResponse<CatalogoPermitido>) => {
                if (esExitosa(res) && res.datos) {
                    this._catalogo$.next(res.datos);
                    return true;
                }
                this._catalogo$.next({ restringida: false, productos: [] });
                return esInfo(res);
            }),
            catchError(() => {
                this._catalogo$.next({ restringida: false, productos: [] });
                this.api.mensajeServidorGooey('error', MENSAJES_COMPRAS_AREA.ERROR.CARGAR_PRODUCTOS);
                return of(false);
            }),
        );
    }

    // ── Crear solicitud ────────────────────────────────────────────────────────

    crearSolicitud(datos: CompraFormArea): Observable<boolean> {
        return this._ejecutarAccion(
            'inventario/crearSolicitudCompraArea', datos,
            MENSAJES_COMPRAS_AREA.EXITO.CREAR,
            MENSAJES_COMPRAS_AREA.ERROR.CREAR,
        );
    }

    // ── Gestionar (aprobar / rechazar) ─────────────────────────────────────────

    gestionarSolicitud(idCompra: number, aprueba: boolean, comentario: string): Observable<boolean> {
        return this._ejecutarAccion(
            'inventario/gestionarSolicitudCompraArea',
            { id_compra: idCompra, aprueba, comentario },
            aprueba ? MENSAJES_COMPRAS_AREA.EXITO.APROBAR : MENSAJES_COMPRAS_AREA.EXITO.RECHAZAR,
            MENSAJES_COMPRAS_AREA.ERROR.GESTIONAR,
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
            console.error('[ComprasAreaService]', mensaje, error);
            this._error$.next(mensaje);
            this.api.mensajeServidorGooey('error', mensaje);
            return of(false);
        };
    }
}