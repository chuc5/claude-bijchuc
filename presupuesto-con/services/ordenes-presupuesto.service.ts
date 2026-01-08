// ============================================================================
// SERVICIO DE ÓRDENES PLAN EMPRESARIAL - CON PREVENCIÓN DE DUPLICACIONES
// ============================================================================

import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, map, catchError, of, tap, finalize } from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

// Modelos simplificados para órdenes
export interface OrdenPE {
    numero_orden: number;
    total: number;
    monto_liquidado: number;
    monto_pendiente: number;
    total_anticipos: number;
    anticipos_pendientes: number;
    area?: string | null;
    presupuesto?: string | null;
    anticipos_declarados?: number; // Nuevo campo agregado
}

export interface UltimoSeguimientoPE {
    nombre_estado?: string | null;
    descripcion_estado?: string | null;
    comentario_solicitante?: string | null;
    fecha_seguimiento?: string | null;
    fecha_autorizacion?: string | null;
    comentario_autorizador?: string | null;
}

export interface AnticipoPE {
    id_solicitud: number;
    numero_orden: number;
    tipo_anticipo: string;
    monto: number;
    fecha_liquidacion?: string | null;
    estado_liquidacion: string;
    requiere_autorizacion: boolean;
    dias_transcurridos?: number | null;
    dias_permitidos?: number | null;
    ultimo_seguimiento?: UltimoSeguimientoPE | null;
}

export interface SolicitudAutorizacionPE {
    id_solicitud: number;
    justificacion: string;
    tipo: 'autorizacion';
}

export interface ApiResponse<T = any> {
    respuesta: 'success' | 'error';
    mensaje?: string | string[];
    datos?: T;
}

@Injectable({
    providedIn: 'root'
})
export class OrdenesPlanEmpresarialService {

    private readonly api = inject(ServicioGeneralService);

    // ============================================================================
    // ESTADO DEL SERVICIO
    // ============================================================================

    private readonly _ordenes$ = new BehaviorSubject<OrdenPE[]>([]);
    private readonly _anticipos$ = new BehaviorSubject<AnticipoPE[]>([]);
    private readonly _cargando$ = new BehaviorSubject<boolean>(false);
    private readonly _cargandoAnticipos$ = new BehaviorSubject<boolean>(false);
    private readonly _enviandoSolicitud$ = new BehaviorSubject<boolean>(false);

    // Observables públicos
    readonly ordenes$ = this._ordenes$.asObservable();
    readonly anticipos$ = this._anticipos$.asObservable();
    readonly cargando$ = this._cargando$.asObservable();
    readonly cargandoAnticipos$ = this._cargandoAnticipos$.asObservable();
    readonly enviandoSolicitud$ = this._enviandoSolicitud$.asObservable();

    // ============================================================================
    // MÉTODOS PRINCIPALES
    // ============================================================================

    /**
     * Cargar todas las órdenes del plan empresarial - CON PREVENCIÓN DE DUPLICACIONES
     */
    cargarOrdenes(): Observable<boolean> {
        // SOLUCIÓN: Prevenir duplicaciones - no cargar si ya se está cargando
        if (this._cargando$.value) {
            console.warn('🚫 Órdenes: Evitando duplicación - ya se está cargando');
            return of(false);
        }
        this._cargando$.next(true);

        return this.api.query({
            ruta: 'contabilidad/obtenerOrdenesAutorizadasPresupuesto',
            tipo: 'get'
        }).pipe(
            map((response: ApiResponse<any[]>) => {
                if (response.respuesta === 'success' && response.datos) {
                    const ordenes = this.mapearOrdenes(response.datos);
                    this._ordenes$.next(ordenes);
                    return true;
                } else {
                    throw new Error('Error en la respuesta del servidor');
                }
            }),
            catchError((error) => {
                console.error('❌ Órdenes: Error al cargar:', error);
                this.api.mensajeServidor('error', 'No se pudieron cargar las órdenes');
                return of(false);
            }),
            finalize(() => {
                this._cargando$.next(false);
            })
        );
    }

    /**
     * Cargar anticipos pendientes de una orden específica
     */
    cargarAnticipos(numeroOrden: number): Observable<boolean> {
        if (!numeroOrden || numeroOrden <= 0) {
            this._anticipos$.next([]);
            return of(true);
        }

        // Prevenir duplicaciones también en anticipos
        if (this._cargandoAnticipos$.value) {
            console.warn('🚫 Anticipos: Evitando duplicación - ya se está cargando');
            return of(false);
        }

        this._cargandoAnticipos$.next(true);

        return this.api.query({
            ruta: `contabilidad/obtenerSolicitudesPendientesAnticiposPresupuesto?numeroOrden=${numeroOrden}`,
            tipo: 'get'
        }).pipe(
            map((response: ApiResponse<any[]>) => {
                if (response.respuesta === 'success') {
                    const anticipos = this.mapearAnticipos(response.datos || []);
                    this._anticipos$.next(anticipos);
                    return true;
                } else {
                    throw new Error('Error al obtener anticipos');
                }
            }),
            catchError((error) => {
                console.error('Error al cargar anticipos:', error);
                this.api.mensajeServidor('error', 'No se pudieron cargar los anticipos');
                return of(false);
            }),
            finalize(() => this._cargandoAnticipos$.next(false))
        );
    }

    /**
     * Solicitar autorización para un anticipo
     */
    solicitarAutorizacion(payload: SolicitudAutorizacionPE): Observable<boolean> {
        if (this._enviandoSolicitud$.value) {
            console.warn('🚫 Solicitud: Evitando duplicación - ya se está enviando');
            return of(false);
        }

        this._enviandoSolicitud$.next(true);

        return this.api.query({
            ruta: 'contabilidad/solicitarAutorizacionAnticiposPendientes',
            tipo: 'post',
            body: payload
        }).pipe(
            map((response: ApiResponse) => {
                if (response.respuesta === 'success') {
                    this.api.mensajeServidor('success', 'Solicitud de autorización enviada correctamente');
                    return true;
                } else {
                    throw new Error('Error al enviar solicitud');
                }
            }),
            catchError((error) => {
                console.error('Error al solicitar autorización:', error);
                this.api.mensajeServidor('error', 'Error al enviar la solicitud de autorización');
                return of(false);
            }),
            finalize(() => this._enviandoSolicitud$.next(false))
        );
    }

    // ============================================================================
    // MÉTODOS DE UTILIDAD
    // ============================================================================

    obtenerOrdenesActuales(): OrdenPE[] {
        return this._ordenes$.value;
    }

    obtenerAnticiposActuales(): AnticipoPE[] {
        return this._anticipos$.value;
    }

    estaOcupado(): boolean {
        return this._cargando$.value || this._cargandoAnticipos$.value || this._enviandoSolicitud$.value;
    }

    limpiarEstado(): void {
        this._ordenes$.next([]);
        this._anticipos$.next([]);
    }

    obtenerResumen(): { totalOrdenes: number; ordenesConPendientes: number } {
        const ordenes = this._ordenes$.value;
        return {
            totalOrdenes: ordenes.length,
            ordenesConPendientes: ordenes.filter(o => o.anticipos_pendientes > 0).length
        };
    }

    refrescarDatos(): Observable<boolean> {
        // SOLUCIÓN: Usar el mismo método con protección contra duplicaciones
        return this.cargarOrdenes();
    }

    // ============================================================================
    // MÉTODOS PRIVADOS - MAPEO DE DATOS
    // ============================================================================

    private mapearOrdenes(data: any[]): OrdenPE[] {
        return data
            .map(item => ({
                numero_orden: this.toNumber(item?.numero_orden),
                total: this.toNumber(item?.total),
                monto_liquidado: this.toNumber(item?.monto_liquidado),
                monto_pendiente: this.toNumber(item?.monto_pendiente || (item?.total - item?.monto_liquidado)),
                total_anticipos: this.toNumber(item?.total_anticipos),
                anticipos_pendientes: this.toNumber(item?.anticipos_pendientes_o_tardios),
                area: item?.area || null,
                presupuesto: item?.presupuesto || null,
                anticipos_declarados: this.toNumber(item?.anticipos_declarados, 0) // Nuevo campo mapeado
            }))
            .filter(orden => orden.numero_orden > 0);
    }

    private mapearAnticipos(data: any[]): AnticipoPE[] {
        return data
            .map(item => ({
                id_solicitud: this.toNumber(item?.id_solicitud),
                numero_orden: this.toNumber(item?.numero_orden),
                tipo_anticipo: item?.tipo_anticipo || 'CHEQUE',
                monto: this.toNumber(item?.monto),
                fecha_liquidacion: item?.fecha_liquidacion || null,
                estado_liquidacion: item?.estado_liquidacion || 'NO_LIQUIDADO',
                requiere_autorizacion: this.toBoolean(item?.requiere_autorizacion, false),
                dias_transcurridos: item?.dias_transcurridos !== undefined ? this.toNumber(item.dias_transcurridos) : null,
                dias_permitidos: item?.dias_permitidos !== undefined ? this.toNumber(item.dias_permitidos) : null,
                ultimo_seguimiento: item?.ultimo_seguimiento ? {
                    nombre_estado: item.ultimo_seguimiento.nombre_estado || null,
                    descripcion_estado: item.ultimo_seguimiento.descripcion_estado || null,
                    comentario_solicitante: item.ultimo_seguimiento.comentario_solicitante || null,
                    fecha_seguimiento: item.ultimo_seguimiento.fecha_seguimiento || null,
                    fecha_autorizacion: item.ultimo_seguimiento.fecha_autorizacion || null,
                    comentario_autorizador: item.ultimo_seguimiento.comentario_autorizador || null
                } : null
            }))
            .filter(anticipo => anticipo.id_solicitud > 0);
    }

    private toNumber(value: any, defaultValue: number = 0): number {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        const num = typeof value === 'string' ? parseFloat(value) : Number(value);
        return isNaN(num) ? defaultValue : num;
    }

    private toBoolean(value: any, defaultValue: boolean = false): boolean {
        if (value === null || value === undefined) {
            return defaultValue;
        }

        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string') {
            const lower = value.toLowerCase();
            return ['true', '1', 'yes', 'si', 'sí'].includes(lower);
        }

        if (typeof value === 'number') {
            return value !== 0;
        }

        return defaultValue;
    }
}