// ============================================================================
// SERVICIO PARA CAMBIOS DE USUARIO - COMPLETAMENTE INDEPENDIENTE
// Archivo: cambios-usuario.service.ts
// Ubicación sugerida: src/app/modules/liquidaciones/services/
// ============================================================================

import { Injectable, inject } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ServicioGeneralService } from '../../../servicios/servicio-general.service';

import {
    CambioSolicitadoUsuario,
    ApiResponseCambiosUsuario,
    MarcarCambioRealizadoPayload,
    MENSAJES_CAMBIOS_USUARIO,
    CambiosUsuarioHelper
} from '../models/cambios-usuario.models';

@Injectable({
    providedIn: 'root'
})
export class CambiosUsuarioService {

    private readonly api = inject(ServicioGeneralService);

    // ============================================================================
    // MÉTODOS PRINCIPALES
    // ============================================================================

    /**
     * Obtener cambios solicitados para un detalle específico
     * @param detalleId ID del detalle de liquidación
     * @returns Observable con array de cambios
     */
    obtenerCambiosDetalle(detalleId: number): Observable<CambioSolicitadoUsuario[]> {
        console.log('🔍 Solicitando cambios para detalle:', detalleId);

        return this.api.query({
            ruta: 'contabilidad/obtenerCambiosSolicitadosPorDetalle',
            tipo: 'post',
            body: { detalle_liquidacion_id: detalleId }
        }).pipe(
            map((response: any) => {
                console.log('📦 Respuesta recibida:', response);

                // Validar que la respuesta sea exitosa
                if (response.respuesta !== 'success') {
                    console.warn('⚠️ Respuesta no exitosa:', response);
                    return [];
                }

                // SOLUCIÓN: Manejar la estructura correcta del backend
                // El backend retorna: { datos: { cambios: [...], total_cambios: 1 } }
                let cambios: any[] = [];

                if (response.datos) {
                    // Si datos.cambios existe, usarlo
                    if (response.datos.cambios && Array.isArray(response.datos.cambios)) {
                        cambios = response.datos.cambios;
                        console.log('✅ Cambios encontrados en datos.cambios:', cambios.length);
                    }
                    // Si datos es directamente un array, usarlo
                    else if (Array.isArray(response.datos)) {
                        cambios = response.datos;
                        console.log('✅ Cambios encontrados en datos (array directo):', cambios.length);
                    }
                    // Si hay un solo cambio en datos
                    else if (typeof response.datos === 'object') {
                        cambios = [response.datos];
                        console.log('✅ Cambio único encontrado en datos:', cambios.length);
                    }
                }

                console.log('📊 Total de cambios procesados:', cambios.length);
                return cambios;
            }),
            catchError((error) => {
                console.error('❌ Error al obtener cambios del detalle:', error);
                this.api.mensajeServidor('error', MENSAJES_CAMBIOS_USUARIO.ERROR.CARGAR_CAMBIOS);
                return of([]);
            })
        );
    }

    /**
     * Marcar un cambio como realizado (desde el usuario)
     * @param cambioId ID del cambio a marcar como realizado
     * @param observaciones Observaciones opcionales sobre la realización
     * @returns Observable con resultado de la operación
     */
    marcarCambioComoRealizado(cambioId: number, observaciones?: string): Observable<boolean> {
        console.log('🔄 Marcando cambio como realizado:', cambioId);

        const payload: MarcarCambioRealizadoPayload = {
            id: cambioId,
            observaciones_aprobacion: observaciones
        };

        return this.api.query({
            ruta: 'contabilidad/marcarCambioRealizadoUsuarioN',
            tipo: 'post',
            body: payload
        }).pipe(
            map((response: any) => {
                console.log('📦 Respuesta marcar realizado:', response);

                if (response.respuesta === 'success' || response.respuesta === 'operacion_exitosa') {
                    const mensaje = Array.isArray(response.mensaje)
                        ? response.mensaje[0]
                        : response.mensaje || MENSAJES_CAMBIOS_USUARIO.EXITO.CAMBIO_MARCADO;

                    this.api.mensajeServidor('success', mensaje);
                    console.log('✅ Cambio marcado exitosamente');
                    return true;
                } else {
                    const mensajeError = Array.isArray(response.mensaje)
                        ? response.mensaje[0]
                        : response.mensaje || MENSAJES_CAMBIOS_USUARIO.ERROR.MARCAR_REALIZADO;
                    throw new Error(mensajeError);
                }
            }),
            catchError((error) => {
                console.error('❌ Error al marcar cambio como realizado:', error);

                const mensajeError = error.error?.mensaje
                    ? (Array.isArray(error.error.mensaje) ? error.error.mensaje[0] : error.error.mensaje)
                    : MENSAJES_CAMBIOS_USUARIO.ERROR.MARCAR_REALIZADO;

                this.api.mensajeServidor('error', mensajeError);
                return of(false);
            })
        );
    }

    // ============================================================================
    // MÉTODOS DE CONSULTA Y FILTRADO
    // ============================================================================

    /**
     * Verificar si un detalle tiene cambios pendientes
     * @param detalleId ID del detalle
     * @returns Observable con boolean
     */
    tieneChangesPendientes(detalleId: number): Observable<boolean> {
        return this.obtenerCambiosDetalle(detalleId).pipe(
            map((cambios: CambioSolicitadoUsuario[]) => {
                return cambios.some(cambio => cambio.estado === 'pendiente');
            }),
            catchError(() => of(false))
        );
    }

    /**
     * Contar cambios pendientes de un detalle
     * @param detalleId ID del detalle
     * @returns Observable con el conteo
     */
    contarCambiosPendientes(detalleId: number): Observable<number> {
        return this.obtenerCambiosDetalle(detalleId).pipe(
            map((cambios: CambioSolicitadoUsuario[]) => {
                return CambiosUsuarioHelper.filtrarPorEstado(cambios, 'pendiente').length;
            }),
            catchError(() => of(0))
        );
    }

    /**
     * Obtener solo cambios pendientes de un detalle
     * @param detalleId ID del detalle
     * @returns Observable con array de cambios pendientes
     */
    obtenerCambiosPendientes(detalleId: number): Observable<CambioSolicitadoUsuario[]> {
        return this.obtenerCambiosDetalle(detalleId).pipe(
            map((cambios: CambioSolicitadoUsuario[]) => {
                return CambiosUsuarioHelper.filtrarPorEstado(cambios, 'pendiente');
            })
        );
    }

    /**
     * Obtener solo cambios realizados de un detalle
     * @param detalleId ID del detalle
     * @returns Observable con array de cambios realizados
     */
    obtenerCambiosRealizados(detalleId: number): Observable<CambioSolicitadoUsuario[]> {
        return this.obtenerCambiosDetalle(detalleId).pipe(
            map((cambios: CambioSolicitadoUsuario[]) => {
                return CambiosUsuarioHelper.filtrarPorEstado(cambios, 'aprobado');
            })
        );
    }

    // ============================================================================
    // MÉTODOS DE VALIDACIÓN
    // ============================================================================

    /**
     * Validar si un cambio puede ser marcado como realizado
     * @param cambio Cambio a validar
     * @returns Objeto con resultado de validación y mensaje
     */
    validarCambio(cambio: CambioSolicitadoUsuario): { valido: boolean; mensaje?: string } {
        return CambiosUsuarioHelper.validarCambio(cambio);
    }

    /**
     * Verificar si un cambio puede ser marcado como realizado (método simple)
     * @param cambio Cambio a verificar
     * @returns Boolean indicando si puede marcarse
     */
    puedeMarcarRealizado(cambio: CambioSolicitadoUsuario): boolean {
        return CambiosUsuarioHelper.puedeMarcarRealizado(cambio);
    }

    // ============================================================================
    // MÉTODOS DE UTILIDAD
    // ============================================================================

    /**
     * Ordenar cambios por prioridad (pendientes primero, luego por fecha)
     * @param cambios Array de cambios a ordenar
     * @returns Array ordenado
     */
    ordenarCambios(cambios: CambioSolicitadoUsuario[]): CambioSolicitadoUsuario[] {
        return CambiosUsuarioHelper.ordenarCambios(cambios);
    }

    /**
     * Obtener resumen estadístico de cambios
     * @param cambios Array de cambios
     * @returns Objeto con estadísticas
     */
    obtenerResumen(cambios: CambioSolicitadoUsuario[]) {
        return CambiosUsuarioHelper.obtenerResumen(cambios);
    }

    /**
     * Formatear monto a moneda local
     * @param monto Monto a formatear
     * @returns String formateado
     */
    formatMonto(monto: number): string {
        return CambiosUsuarioHelper.formatMonto(monto);
    }

    /**
     * Formatear fecha y hora
     * @param fecha Fecha a formatear
     * @returns String formateado
     */
    formatFechaHora(fecha: string): string {
        return CambiosUsuarioHelper.formatFechaHora(fecha);
    }
}