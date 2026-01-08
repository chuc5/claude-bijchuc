// ============================================================================
// MODELO PARA CAMBIOS DE USUARIO - COMPLETAMENTE INDEPENDIENTE
// Archivo: cambios-usuario.models.ts
// Ubicación sugerida: src/app/modules/liquidaciones/models/
// ============================================================================

/**
 * Respuesta estándar del API
 */
export interface ApiResponseCambiosUsuario<T = any> {
    respuesta: 'success' | 'consulta_ok' | 'operacion_exitosa' | 'operacion_fallida' | 'campo_requerido';
    mensaje?: string | string[];
    datos?: T;
}

/**
 * Estructura de datos de cambios (como la retorna el backend)
 */
export interface DatosCambiosBackend {
    cambios: CambioSolicitadoUsuario[];
    total_cambios: number;
}

/**
 * Cambio solicitado por contabilidad
 */
export interface CambioSolicitadoUsuario {
    id: number;
    detalle_liquidacion_id: number;
    numero_factura: string;
    tipo_cambio: TipoCambioUsuario;
    descripcion_cambio: string;
    valor_anterior: string;
    valor_solicitado: string;
    justificacion: string;
    estado: EstadoCambioUsuario;
    solicitado_por?: string;
    fecha_solicitud?: string;
    aprobado_por?: string | null;
    fecha_aprobacion?: string | null;
    observaciones_aprobacion?: string | null;

    // Datos adicionales del detalle para contexto
    descripcion_detalle?: string;
    monto_detalle?: string | number;
    agencia_detalle?: string;
    numero_orden?: number;
}

/**
 * Tipos de cambio solicitado
 */
export type TipoCambioUsuario =
    | 'monto'
    | 'forma_pago'
    | 'beneficiario'
    | 'cuenta'
    | 'descripcion'
    | 'otros';

/**
 * Estados de cambio
 */
export type EstadoCambioUsuario =
    | 'pendiente'
    | 'aprobado';

/**
 * Estados de verificación
 */
export type EstadoVerificacionUsuario =
    | 'pendiente'
    | 'verificado';

/**
 * Payload para marcar cambio como realizado
 */
export interface MarcarCambioRealizadoPayload {
    id: number;
    observaciones_aprobacion?: string;
}

/**
 * Información mínima del detalle para el modal
 */
export interface DetalleInfoUsuario {
    id: number;
    numero_orden: number;
    descripcion: string;
    agencia_gasto: string;
    monto: number;
    estado_verificacion: EstadoVerificacionUsuario;
}

/**
 * Respuesta al marcar cambio como realizado
 */
export interface RespuestaMarcarRealizado {
    id: number;
    estado: EstadoCambioUsuario;
    fecha_aprobacion: string;
    aprobado_por: string;
}

/**
 * Estadísticas de cambios del usuario
 */
export interface EstadisticasCambiosUsuario {
    total: number;
    pendientes: number;
    realizados: number;
}

// ============================================================================
// CLASE HELPER PARA MANEJO DE ESTADOS Y COLORES
// ============================================================================

export class CambiosUsuarioHelper {

    /**
     * Obtiene el texto legible para el tipo de cambio
     */
    static getTextoTipoCambio(tipo: TipoCambioUsuario): string {
        const textos: Record<TipoCambioUsuario, string> = {
            'monto': 'Monto',
            'forma_pago': 'Forma de Pago',
            'beneficiario': 'Beneficiario',
            'cuenta': 'Cuenta',
            'descripcion': 'Descripción',
            'otros': 'Otro'
        };
        return textos[tipo] || 'Desconocido';
    }

    /**
     * Obtiene el color de badge para el tipo de cambio
     */
    static getColorTipoCambio(tipo: TipoCambioUsuario): string {
        const colores: Record<TipoCambioUsuario, string> = {
            'monto': 'bg-green-100 text-green-700 border-green-200',
            'forma_pago': 'bg-blue-100 text-blue-700 border-blue-200',
            'beneficiario': 'bg-purple-100 text-purple-700 border-purple-200',
            'cuenta': 'bg-indigo-100 text-indigo-700 border-indigo-200',
            'descripcion': 'bg-orange-100 text-orange-700 border-orange-200',
            'otros': 'bg-gray-100 text-gray-700 border-gray-200'
        };
        return colores[tipo] || 'bg-gray-100 text-gray-700 border-gray-200';
    }

    /**
     * Obtiene el texto legible para el estado del cambio
     */
    static getTextoEstadoCambio(estado: EstadoCambioUsuario): string {
        const textos: Record<EstadoCambioUsuario, string> = {
            'pendiente': 'Pendiente',
            'aprobado': 'Realizado'
        };
        return textos[estado] || 'Desconocido';
    }

    /**
     * Obtiene el color de badge para el estado del cambio
     */
    static getColorEstadoCambio(estado: EstadoCambioUsuario): string {
        const colores: Record<EstadoCambioUsuario, string> = {
            'pendiente': 'bg-yellow-100 text-yellow-700 border-yellow-200',
            'aprobado': 'bg-green-100 text-green-700 border-green-200'
        };
        return colores[estado] || 'bg-gray-100 text-gray-700 border-gray-200';
    }

    /**
     * Obtiene el color de badge para el estado de verificación
     */
    static getColorEstadoVerificacion(estado: EstadoVerificacionUsuario): string {
        const colores: Record<EstadoVerificacionUsuario, string> = {
            'pendiente': 'bg-yellow-100 text-yellow-700 border-yellow-200',
            'verificado': 'bg-green-100 text-green-700 border-green-200'
        };
        return colores[estado] || 'bg-gray-100 text-gray-700 border-gray-200';
    }

    /**
     * Verifica si un cambio puede ser marcado como realizado
     */
    static puedeMarcarRealizado(cambio: CambioSolicitadoUsuario): boolean {
        return cambio.estado === 'pendiente' && !!cambio.id;
    }

    /**
     * Formatea un monto a moneda local (Guatemala)
     */
    static formatMonto(monto: number | string): string {
        const montoNumerico = typeof monto === 'string' ? parseFloat(monto) : monto;

        if (isNaN(montoNumerico)) {
            return 'Q 0.00';
        }

        return new Intl.NumberFormat('es-GT', {
            style: 'currency',
            currency: 'GTQ'
        }).format(montoNumerico);
    }

    /**
     * Formatea fecha y hora a formato local
     */
    static formatFechaHora(fecha: string): string {
        if (!fecha) return '—';

        try {
            return new Date(fecha).toLocaleString('es-GT', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Error al formatear fecha:', error);
            return '—';
        }
    }

    /**
     * Formatea solo fecha a formato local
     */
    static formatFecha(fecha: string): string {
        if (!fecha) return '—';

        try {
            return new Date(fecha).toLocaleDateString('es-GT', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch (error) {
            console.error('Error al formatear fecha:', error);
            return '—';
        }
    }

    /**
     * Obtiene la prioridad de un tipo de cambio (para ordenamiento)
     */
    static getPrioridadTipoCambio(tipo: TipoCambioUsuario): number {
        const prioridades: Record<TipoCambioUsuario, number> = {
            'monto': 1,
            'forma_pago': 2,
            'cuenta': 3,
            'beneficiario': 4,
            'descripcion': 5,
            'otros': 6
        };
        return prioridades[tipo] || 99;
    }

    /**
     * Valida si un cambio es válido para ser marcado como realizado
     */
    static validarCambio(cambio: CambioSolicitadoUsuario): { valido: boolean; mensaje?: string } {
        if (!cambio.id) {
            return { valido: false, mensaje: 'El cambio no tiene un ID válido' };
        }

        if (cambio.estado === 'aprobado') {
            return { valido: false, mensaje: 'El cambio ya está marcado como realizado' };
        }

        if (cambio.estado !== 'pendiente') {
            return { valido: false, mensaje: 'Solo se pueden marcar cambios en estado pendiente' };
        }

        return { valido: true };
    }

    /**
     * Obtiene un resumen de cambios
     */
    static obtenerResumen(cambios: CambioSolicitadoUsuario[]): EstadisticasCambiosUsuario {
        return {
            total: cambios.length,
            pendientes: cambios.filter(c => c.estado === 'pendiente').length,
            realizados: cambios.filter(c => c.estado === 'aprobado').length
        };
    }

    /**
     * Ordena cambios por prioridad (pendientes primero, luego por fecha)
     */
    static ordenarCambios(cambios: CambioSolicitadoUsuario[]): CambioSolicitadoUsuario[] {
        return [...cambios].sort((a, b) => {
            // Primero por estado (pendientes primero)
            if (a.estado !== b.estado) {
                return a.estado === 'pendiente' ? -1 : 1;
            }

            // Luego por prioridad de tipo
            const prioridadA = this.getPrioridadTipoCambio(a.tipo_cambio);
            const prioridadB = this.getPrioridadTipoCambio(b.tipo_cambio);

            if (prioridadA !== prioridadB) {
                return prioridadA - prioridadB;
            }

            // Finalmente por fecha (más recientes primero)
            const fechaA = new Date(a.fecha_solicitud || '').getTime();
            const fechaB = new Date(b.fecha_solicitud || '').getTime();
            return fechaB - fechaA;
        });
    }

    /**
     * Filtra cambios por estado
     */
    static filtrarPorEstado(cambios: CambioSolicitadoUsuario[], estado: EstadoCambioUsuario): CambioSolicitadoUsuario[] {
        return cambios.filter(c => c.estado === estado);
    }

    /**
     * Filtra cambios por tipo
     */
    static filtrarPorTipo(cambios: CambioSolicitadoUsuario[], tipo: TipoCambioUsuario): CambioSolicitadoUsuario[] {
        return cambios.filter(c => c.tipo_cambio === tipo);
    }
}

// ============================================================================
// CONSTANTES DE MENSAJES
// ============================================================================

export const MENSAJES_CAMBIOS_USUARIO = {
    EXITO: {
        CAMBIO_MARCADO: 'Cambio marcado como realizado correctamente',
        CAMBIOS_CARGADOS: 'Cambios cargados correctamente'
    },
    ERROR: {
        CARGAR_CAMBIOS: 'Error al cargar los cambios solicitados',
        MARCAR_REALIZADO: 'Error al marcar el cambio como realizado',
        CAMBIO_INVALIDO: 'El cambio seleccionado no es válido',
        SIN_CONEXION: 'No se pudo conectar con el servidor',
        OPERACION_FALLIDA: 'La operación no se pudo completar'
    },
    INFO: {
        SIN_CAMBIOS: 'No hay cambios solicitados para este detalle',
        TODOS_REALIZADOS: 'Todos los cambios han sido realizados',
        CAMBIOS_PENDIENTES: 'Hay cambios pendientes de realizar'
    },
    CONFIRMACION: {
        MARCAR_REALIZADO: '¿Confirma que desea marcar este cambio como realizado?',
        CAMBIO_IRREVERSIBLE: 'Esta acción no se puede deshacer'
    }
} as const;

// ============================================================================
// INTERFACES AUXILIARES
// ============================================================================

/**
 * Filtros para búsqueda de cambios
 */
export interface FiltrosCambiosUsuario {
    estado?: EstadoCambioUsuario;
    tipo_cambio?: TipoCambioUsuario;
    fecha_desde?: string;
    fecha_hasta?: string;
    detalle_id?: number;
}

/**
 * Opciones para visualización de cambios
 */
export interface OpcionesVisualizacion {
    mostrarRealizados: boolean;
    mostrarPendientes: boolean;
    ordenarPor: 'fecha' | 'tipo' | 'estado';
    ordenDescendente: boolean;
}

/**
 * Resultado de operación de marcado
 */
export interface ResultadoMarcado {
    exito: boolean;
    cambioId: number;
    mensaje: string;
    fecha?: string;
}