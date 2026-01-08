// ============================================================================
// UTILIDADES DE FORMATO - PLAN EMPRESARIAL CON
// utils/format.utils.ts
// ============================================================================

/**
 * Formatea un monto como moneda guatemalteca
 */
export function formatearMonto(monto: number): string {
    return new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(monto);
}

/**
 * Formatea una fecha en formato local guatemalteco
 */
export function formatearFecha(fecha: string | null | undefined): string {
    if (!fecha) return '-';
    try {
        return new Date(fecha).toLocaleDateString('es-GT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch {
        return '-';
    }
}

/**
 * Formatea fecha y hora completa
 */
export function formatearFechaHora(fecha: string | Date | null | undefined): string {
    if (!fecha) return '-';
    try {
        const fechaObj = typeof fecha === 'string' ? new Date(fecha) : fecha;
        return fechaObj.toLocaleString('es-GT', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch {
        return '-';
    }
}

/**
 * Convierte un valor a número de forma segura
 */
export function toNumber(value: any, defaultValue: number = 0): number {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }

    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? defaultValue : num;
}

/**
 * Convierte un valor a string de forma segura
 */
export function toString(value: any, defaultValue: string = ''): string {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    return String(value);
}

/**
 * Convierte un valor a boolean de forma segura
 */
export function toBoolean(value: any, defaultValue: boolean = false): boolean {
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

/**
 * Trunca un texto con elipsis
 */
export function truncarTexto(texto: string | null | undefined, longitud: number = 50): string {
    if (!texto) return '';
    if (texto.length <= longitud) return texto;
    return texto.substring(0, longitud).trim() + '...';
}

/**
 * Capitaliza la primera letra de cada palabra
 */
export function capitalizarPalabras(texto: string | null | undefined): string {
    if (!texto) return '';
    return texto.replace(/\w\S*/g, (txt) =>
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
}

/**
 * Normaliza texto para búsqueda (sin acentos, minúsculas)
 */
export function normalizarTexto(texto: string | null | undefined): string {
    if (!texto) return '';
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remover acentos
        .replace(/[^\w\s]/g, ' ') // Remover caracteres especiales
        .replace(/\s+/g, ' ') // Normalizar espacios
        .trim();
}

/**
 * Valida si un número está dentro de un rango
 */
export function validarRango(valor: number, min: number, max: number): boolean {
    return valor >= min && valor <= max;
}

/**
 * Calcula el porcentaje de un valor respecto a un total
 */
export function calcularPorcentaje(valor: number, total: number): number {
    if (total === 0) return 0;
    return (valor / total) * 100;
}

/**
 * Formatea un número como porcentaje
 */
export function formatearPorcentaje(valor: number, decimales: number = 1): string {
    return new Intl.NumberFormat('es-GT', {
        style: 'percent',
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales
    }).format(valor / 100);
}

/**
 * Genera un ID único simple
 */
export function generarId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Debounce para funciones
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout>;

    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Verifica si un valor es null, undefined o string vacío
 */
export function esVacio(valor: any): boolean {
    return valor === null || valor === undefined ||
        (typeof valor === 'string' && valor.trim() === '');
}

/**
 * Obtiene un valor anidado de un objeto de forma segura
 */
export function obtenerValorAnidado(obj: any, path: string, defaultValue: any = null): any {
    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
        if (result == null || typeof result !== 'object') {
            return defaultValue;
        }
        result = result[key];
    }

    return result != null ? result : defaultValue;
}

/**
 * Formatea bytes a formato legible
 */
export function formatearTamano(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Formatea tiempo transcurrido de forma relativa
 */
export function formatearTiempoRelativo(fecha: string | Date): string {
    const ahora = new Date();
    const fechaObj = typeof fecha === 'string' ? new Date(fecha) : fecha;
    const diferencia = ahora.getTime() - fechaObj.getTime();

    const minutos = Math.floor(diferencia / (1000 * 60));
    const horas = Math.floor(diferencia / (1000 * 60 * 60));
    const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    if (minutos < 1) return 'hace un momento';
    if (minutos < 60) return `hace ${minutos} minuto${minutos !== 1 ? 's' : ''}`;
    if (horas < 24) return `hace ${horas} hora${horas !== 1 ? 's' : ''}`;
    if (dias < 30) return `hace ${dias} día${dias !== 1 ? 's' : ''}`;

    return formatearFecha(fechaObj.toISOString());
}

/**
 * Valida formato de texto con longitud
 */
export function validarTexto(texto: string, minLength: number = 0, maxLength: number = 500): { valido: boolean; mensaje?: string } {
    if (!texto || texto.trim().length === 0) {
        return { valido: false, mensaje: 'El texto es requerido' };
    }

    const longitud = texto.trim().length;

    if (longitud < minLength) {
        return { valido: false, mensaje: `Mínimo ${minLength} caracteres. Actual: ${longitud}/${minLength}` };
    }

    if (longitud > maxLength) {
        return { valido: false, mensaje: `Máximo ${maxLength} caracteres. Actual: ${longitud}/${maxLength}` };
    }

    return { valido: true };
}

/**
 * Formatea diferencia de tiempo en palabras
 */
export function formatearDiferenciaTiempo(fechaInicio: Date, fechaFin: Date): string {
    const diferencia = fechaFin.getTime() - fechaInicio.getTime();
    const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));

    if (dias > 0) return `${dias} día${dias !== 1 ? 's' : ''}`;
    if (horas > 0) return `${horas} hora${horas !== 1 ? 's' : ''}`;
    if (minutos > 0) return `${minutos} minuto${minutos !== 1 ? 's' : ''}`;
    return 'menos de un minuto';
}

/**
 * Limpia y normaliza un número de teléfono
 */
export function normalizarTelefono(telefono: string): string {
    if (!telefono) return '';
    return telefono.replace(/[^\d]/g, '');
}

/**
 * Valida un email básico
 */
export function validarEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

/**
 * Capitaliza solo la primera letra
 */
export function capitalizar(texto: string): string {
    if (!texto) return '';
    return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

/**
 * Convierte texto a slug (URL-friendly)
 */
export function toSlug(texto: string): string {
    return normalizarTexto(texto)
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}