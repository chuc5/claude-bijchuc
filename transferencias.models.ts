// ============================================================================
// MODELOS PARA SISTEMA DE TRANSFERENCIAS BANCARIAS
// Archivo: src/app/modules/transferencias/models/transferencias.models.ts
// ============================================================================

/**
 * Respuesta estándar del API
 */
export interface ApiResponse<T = any> {
    respuesta: 'success' | 'fail';
    mensajes: string[];
    datos?: T;
}

/**
 * Estados posibles de una solicitud de transferencia (SIMPLIFICADOS)
 */
export type EstadoSolicitud =
    | 'pendiente_aprobacion'  // Enviado a aprobar
    | 'aprobado'              // Aprobado por el área
    | 'rechazado'             // Rechazado por el área
    | 'completado'            // Finalizado
    | 'cancelado';            // Cancelado

/**
 * Áreas que pueden aprobar solicitudes
 */
export type AreaAprobacion = 'gerencia_financiera' | 'jefe_contabilidad';

// ============================================================================
// ENTIDADES PRINCIPALES
// ============================================================================

/**
 * Solicitud de transferencia bancaria
 */
export interface SolicitudTransferencia {
    id: number;
    codigo_solicitud: string;              // ST-2025-0001

    // Facturas asociadas (separadas por comas)
    facturas_numeros: string;              // "FAC-001,FAC-002,FAC-003"
    detalles_liquidacion_ids: string;      // "1,2,3"

    // Datos bancarios
    banco_origen_id: number;
    banco_nombre?: string;                 // Populated desde backend
    banco_cuenta?: string;                 // Populated desde backend

    // Routing
    area_aprobacion: AreaAprobacion;

    // Montos (editable por tesorería)
    monto_total_solicitud: number;

    // Estado actual
    estado: EstadoSolicitud;

    // Datos del comprobante (llenados después de aprobación)
    numero_registro_transferencia?: string;
    fecha_transferencia?: string;          // YYYY-MM-DD
    referencia_bancaria?: string;
    observaciones_transferencia?: string;

    // Auditoría
    creado_por: number;
    fecha_creacion: string;                // ISO DateTime
    actualizado_por?: number;
    fecha_actualizacion?: string;          // ISO DateTime
    activo: boolean;

    // Relaciones (populated desde backend cuando se solicitan)
    aprobacion_id?: number;
    aprobador_id?: number;
    puesto_aprobador?: string;
    aprobacion_accion?: 'aprobado' | 'rechazado';
    aprobacion_comentario?: string;
    fecha_aprobacion?: string;
    cantidad_archivos?: number;
}

/**
 * Detalle completo de una factura asociada
 * (Populated desde facturas_sat y detalle_liquidaciones)
 */
export interface FacturaDetalle {
    numero_factura: string;
    detalle_liquidacion_id: number;

    // Datos de facturas_sat
    fecha_emision?: string;
    tipo_dte?: string;
    nombre_emisor?: string;
    monto_total_factura?: number;
    estado_liquidacion?: string;

    // Datos de detalle_liquidaciones
    numero_orden?: string;
    descripcion?: string;
    monto_detalle?: number;
    forma_pago?: string;
    correo_proveedor?: string;
}

/**
 * Aprobación o rechazo de solicitud
 */
export interface AprobacionTransferencia {
    id: number;
    solicitud_transferencia_id: number;

    // Aprobador
    aprobador_id: number;
    puesto_aprobador: string;
    area_aprobador: AreaAprobacion;

    // Decisión
    accion: 'aprobado' | 'rechazado';
    comentario?: string;                   // Obligatorio si rechazado

    // Timestamp
    fecha_aprobacion: string;              // ISO DateTime
}

/**
 * Archivo almacenado en Google Drive
 */
export interface ArchivoTransferencia {
    id: number;

    // Relación
    solicitud_transferencia_id: number;

    // Google Drive
    drive_id: string;
    nombre_original: string;
    nombre_en_drive: string;
    tipo_mime: string;
    tamano_bytes: number;

    // Metadata
    subido_por: number;
    fecha_subida: string;                  // ISO DateTime

    // Computed (calculados en frontend o backend)
    viewer_url?: string;                   // URL para ver en Drive
}

// ============================================================================
// ENTIDADES DE SOPORTE
// ============================================================================

/**
 * Banco de uso para pagos
 */
export interface BancoUsoPago {
    id: number;
    nombre: string;
    cuenta: string;
    activo: number;                        // 1 = activo, 0 = inactivo
}

/**
 * Información resumida de usuario
 */
export interface UsuarioInfo {
    id: number;
    nombre: string;
    correo: string;
    puesto: string;
}

// ============================================================================
// DTOs Y PAYLOADS PARA EL API
// ============================================================================

/**
 * Payload para crear una nueva solicitud de transferencia
 */
export interface CrearSolicitudPayload {
    facturas: {
        numero_factura: string;
        detalle_liquidacion_id: number;
    }[];
    banco_origen_id: number;
    area_aprobacion: AreaAprobacion;
    monto_total_solicitud: number;
}

/**
 * Payload para editar una solicitud (solo en rechazada)
 */
export interface EditarSolicitudPayload {
    solicitud_id: number;
    facturas?: {
        numero_factura: string;
        detalle_liquidacion_id: number;
    }[];
    banco_origen_id?: number;
    area_aprobacion?: AreaAprobacion;
    monto_total_solicitud?: number;
}

/**
 * Payload para registrar comprobante de transferencia
 */
export interface RegistrarComprobantePayload {
    solicitud_id: number;
    numero_registro_transferencia: string;
    fecha_transferencia: string;           // YYYY-MM-DD
    referencia_bancaria?: string;
    observaciones?: string;
}

/**
 * Payload para aprobar o rechazar solicitud
 */
export interface AprobarRechazarPayload {
    solicitud_id: number;
    accion: 'aprobado' | 'rechazado' | '';
    comentario?: string;                   // Obligatorio si rechazado
}

/**
 * Payload para cancelar solicitud
 */
export interface CancelarSolicitudPayload {
    solicitud_id: number;
    motivo: string;
}

/**
 * Filtros para listar solicitudes
 */
export interface FiltrosSolicitudes {
    estado?: EstadoSolicitud | EstadoSolicitud[];
    area_aprobacion?: AreaAprobacion;
    fecha_desde?: string;                  // YYYY-MM-DD
    fecha_hasta?: string;                  // YYYY-MM-DD
    creado_por?: number;
    numero_factura?: string;
    banco_id?: number;
}

// ============================================================================
// RESPUESTAS DEL API
// ============================================================================

/**
 * Respuesta al listar solicitudes
 */
export interface ListadoSolicitudesResponse {
    solicitudes: SolicitudTransferencia[];
    totales?: {
        total: number;
        por_estado: Partial<Record<EstadoSolicitud, number>>;
        monto_total: number;
    };
}

/**
 * Respuesta al obtener detalle completo de solicitud
 */
export interface DetalleSolicitudResponse {
    solicitud: SolicitudTransferencia;
    facturas_detalle: FacturaDetalle[];
    aprobacion?: AprobacionTransferencia;
    archivos: ArchivoTransferencia[];
    permisos?: {
        puede_editar: boolean;
        puede_aprobar: boolean;
        puede_rechazar: boolean;
        puede_registrar_comprobante: boolean;
        puede_completar: boolean;
        puede_cancelar: boolean;
        puede_subir_archivos: boolean;
    };
}

/**
 * Respuesta al subir archivo
 */
export interface SubirArchivoResponse {
    archivo_id: number;
    drive_id: string;
    nombre: string;
    viewer_url: string;
}

/**
 * Respuesta al listar bancos activos
 */
export interface ListadoBancosResponse {
    bancos: BancoUsoPago[];
}

// ============================================================================
// CONSTANTES Y HELPERS
// ============================================================================

/**
 * Etiquetas de estados en español
 */
export const ETIQUETAS_ESTADO: Record<EstadoSolicitud, string> = {
    pendiente_aprobacion: 'Pendiente de Aprobación',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    completado: 'Completado',
    cancelado: 'Cancelado'
};

/**
 * Colores para badges de estado (Tailwind)
 */
export const COLORES_ESTADO: Record<EstadoSolicitud, { bg: string; text: string }> = {
    pendiente_aprobacion: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    aprobado: { bg: 'bg-green-100', text: 'text-green-800' },
    rechazado: { bg: 'bg-red-100', text: 'text-red-800' },
    completado: { bg: 'bg-blue-100', text: 'text-blue-800' },
    cancelado: { bg: 'bg-gray-100', text: 'text-gray-800' }
};

/**
 * Etiquetas de áreas en español
 */
export const ETIQUETAS_AREA: Record<AreaAprobacion, string> = {
    gerencia_financiera: 'Gerencia Financiera',
    jefe_contabilidad: 'Jefe de Contabilidad'
};

/**
 * Mensajes del sistema
 */
export const MENSAJES_TRANSFERENCIAS = {
    EXITO: {
        CREAR: 'Solicitud creada correctamente',
        EDITAR: 'Solicitud actualizada correctamente',
        APROBAR: 'Solicitud aprobada correctamente',
        RECHAZAR: 'Solicitud rechazada',
        REGISTRAR_COMPROBANTE: 'Comprobante registrado correctamente',
        COMPLETAR: 'Solicitud completada exitosamente',
        CANCELAR: 'Solicitud cancelada',
        SUBIR_ARCHIVO: 'Archivo subido correctamente',
        ELIMINAR_ARCHIVO: 'Archivo eliminado'
    },
    ERROR: {
        CARGAR: 'Error al cargar solicitudes',
        CREAR: 'Error al crear solicitud',
        EDITAR: 'Error al editar solicitud',
        APROBAR: 'Error al aprobar solicitud',
        RECHAZAR: 'Error al rechazar solicitud',
        REGISTRAR_COMPROBANTE: 'Error al registrar comprobante',
        COMPLETAR: 'Error al completar solicitud',
        CANCELAR: 'Error al cancelar solicitud',
        SUBIR_ARCHIVO: 'Error al subir archivo',
        ELIMINAR_ARCHIVO: 'Error al eliminar archivo',
        SIN_PERMISOS: 'No tiene permisos para realizar esta acción',
        ESTADO_INVALIDO: 'No se puede realizar esta acción en el estado actual',
        VALIDACION: 'Error de validación en los datos proporcionados'
    },
    CONFIRMACION: {
        APROBAR: '¿Confirma que desea aprobar esta solicitud de transferencia?',
        RECHAZAR: '¿Confirma que desea rechazar esta solicitud? Debe proporcionar un comentario.',
        COMPLETAR: '¿Confirma que desea marcar esta solicitud como completada?',
        CANCELAR: '¿Confirma que desea cancelar esta solicitud?',
        ELIMINAR_ARCHIVO: '¿Confirma que desea eliminar este archivo?'
    }
} as const;

/**
 * Clase auxiliar para formateo de datos
 */
export class FormatHelper {
    /**
     * Formatea un monto en Quetzales
     */
    static formatMonto(monto: number): string {
        return new Intl.NumberFormat('es-GT', {
            style: 'currency',
            currency: 'GTQ',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(monto);
    }

    /**
     * Formatea una fecha (YYYY-MM-DD -> DD/MM/YYYY)
     */
    static formatFecha(fecha: string | Date): string {
        if (!fecha) return '-';
        const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
        return date.toLocaleDateString('es-GT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    /**
     * Formatea fecha y hora (ISO -> DD/MM/YYYY HH:mm)
     */
    static formatFechaHora(fecha: string | Date): string {
        if (!fecha) return '-';
        const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
        return date.toLocaleString('es-GT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Trunca texto largo
     */
    static truncateText(text: string, length: number = 50): string {
        if (!text) return '';
        return text.length > length ? text.substring(0, length) + '...' : text;
    }

    /**
     * Formatea tamaño de archivo en bytes
     */
    static formatTamano(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Convierte string separado por comas a array
     */
    static stringToArray(str: string): string[] {
        if (!str) return [];
        return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    /**
     * Convierte array a string separado por comas
     */
    static arrayToString(arr: string[]): string {
        if (!arr || arr.length === 0) return '';
        return arr.join(',');
    }

    /**
     * Obtiene etiqueta de estado en español
     */
    static getEtiquetaEstado(estado: EstadoSolicitud): string {
        return ETIQUETAS_ESTADO[estado] || estado;
    }

    /**
     * Obtiene clases de color para badge de estado
     */
    static getColorEstado(estado: EstadoSolicitud): { bg: string; text: string } {
        return COLORES_ESTADO[estado] || { bg: 'bg-gray-100', text: 'text-gray-800' };
    }

    /**
     * Obtiene etiqueta de área en español
     */
    static getEtiquetaArea(area: AreaAprobacion): string {
        return ETIQUETAS_AREA[area] || area;
    }
}

/**
 * Clase auxiliar para validación de permisos según estado
 */
export class PermisosHelper {
    /**
     * Verifica si puede editar según estado
     * Solo se puede editar si está rechazada
     */
    static puedeEditar(estado: EstadoSolicitud): boolean {
        return estado === 'rechazado';
    }

    /**
     * Verifica si puede aprobar/rechazar
     * Solo si está pendiente de aprobación
     */
    static puedeAprobar(estado: EstadoSolicitud): boolean {
        return estado === 'pendiente_aprobacion';
    }

    /**
     * Verifica si puede registrar comprobante
     * Solo si está aprobada
     */
    static puedeRegistrarComprobante(estado: EstadoSolicitud): boolean {
        return estado === 'aprobado';
    }

    /**
     * Verifica si puede completar
     * Solo si está aprobada y tiene datos del comprobante
     */
    static puedeCompletar(
        estado: EstadoSolicitud,
        tieneNumeroRegistro: boolean,
        tieneFechaTransferencia: boolean
    ): boolean {
        return estado === 'aprobado' && tieneNumeroRegistro && tieneFechaTransferencia;
    }

    /**
     * Verifica si puede cancelar
     * Solo si está pendiente de aprobación
     */
    static puedeCancelar(estado: EstadoSolicitud): boolean {
        return estado === 'pendiente_aprobacion' || estado === 'rechazado';
    }

    /**
     * Verifica si puede subir archivos
     * Solo si está aprobada o completada
     */
    static puedeSubirArchivos(estado: EstadoSolicitud): boolean {
        return ['aprobado', 'completado'].includes(estado);
    }
}

// ============================================================================
// TIPOS AUXILIARES
// ============================================================================

/**
 * Tipo para validación de formularios
 */
export interface ValidationErrors {
    [key: string]: string;
}

/**
 * Tipo para opciones de select
 */
export interface SelectOption<T = any> {
    value: T;
    label: string;
    disabled?: boolean;
}

/**
 * Configuración de tabla
 */
export interface TableConfig {
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    pageSize?: number;
    currentPage?: number;
}

// ============================================================================
// FIN DE MODELOS
// ============================================================================