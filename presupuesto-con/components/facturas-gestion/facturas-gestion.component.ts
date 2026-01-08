// ============================================================================
// FACTURAS GESTIÓN COMPONENT - COMPLETO SIN DÍAS HÁBILES SERVICE
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';

import { FacturasPlanEmpresarialService } from '../../services/facturas-presupuesto.service';
import { ModalRegistrarFacturaComponentpresupuesto } from '../modal-registrar-factura/modal-registrar-factura.component';
import { ModalSolicitarAutorizacionComponentpresupuesto } from '../modal-solicitar-autorizacion/modal-solicitar-autorizacion.component';

import {
    FacturaPE,
    DetalleLiquidacionPE,
    PermisosEdicion,
    formatearMonto,
    formatearFecha,
    obtenerColorEstadoLiquidacion,
    obtenerColorEstadoAutorizacion,
    obtenerColorEstadoFactura,
    obtenerColorEstadoTiempo,
    validarPermisosEdicion,
    obtenerMensajeEstadoTiempo,
    requiereAutorizacionPorTardanza,
    estaEnTiempoPermitido
} from '../../models/facturas-presupuesto.models';

@Component({
    selector: 'app-facturas-gestion-presupuesto',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ModalRegistrarFacturaComponentpresupuesto,
        ModalSolicitarAutorizacionComponentpresupuesto
    ],
    templateUrl: './facturas-gestion.component.html',
    styleUrls: ['./facturas-gestion.component.css']
})
export class FacturasGestionComponentpresupuesto implements OnInit, OnDestroy {

    private readonly service = inject(FacturasPlanEmpresarialService);
    private readonly destroy$ = new Subject<void>();

    // ============================================================================
    // ESTADO DEL COMPONENTE
    // ============================================================================

    readonly searchControl = new FormControl<string>('');
    readonly cargandoFactura = signal(false);
    readonly facturaActual = signal<FacturaPE | null>(null);
    readonly detallesLiquidacion = signal<DetalleLiquidacionPE[]>([]);

    // Estados de modales
    readonly mostrarModalRegistrar = signal(false);
    readonly mostrarModalAutorizacion = signal(false);

    // Utilidades de formato
    readonly formatearMonto = formatearMonto;
    readonly formatearFecha = formatearFecha;
    readonly obtenerColorEstadoLiquidacion = obtenerColorEstadoLiquidacion;
    readonly obtenerColorEstadoAutorizacion = obtenerColorEstadoAutorizacion;
    readonly obtenerColorEstadoFactura = obtenerColorEstadoFactura;
    readonly obtenerColorEstadoTiempo = obtenerColorEstadoTiempo;

    // Computed para permisos de edición - SIMPLIFICADO SIN DÍAS HÁBILES SERVICE
    readonly permisosEdicion = computed(() => this.calcularPermisosEdicion());

    ngOnInit(): void {
        this.inicializarSuscripciones();
        this.configurarBusquedaAutomatica();
        this.service.cargarCatalogos().subscribe();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ============================================================================
    // INICIALIZACIÓN
    // ============================================================================

    private inicializarSuscripciones(): void {
        this.service.cargandoFactura$
            .pipe(takeUntil(this.destroy$))
            .subscribe(cargando => this.cargandoFactura.set(cargando));

        this.service.facturaActual$
            .pipe(takeUntil(this.destroy$))
            .subscribe(factura => {
                console.log('FACTURA RECIBIDA CON DÍAS HÁBILES:', factura);
                this.facturaActual.set(factura);
                // Ya no necesitamos validar días hábiles aquí - vienen del backend
            });

        this.service.detallesLiquidacion$
            .pipe(takeUntil(this.destroy$))
            .subscribe(detalles => this.detallesLiquidacion.set(detalles));
    }

    private configurarBusquedaAutomatica(): void {
        this.searchControl.valueChanges
            .pipe(
                debounceTime(1000),
                distinctUntilChanged(),
                takeUntil(this.destroy$)
            )
            .subscribe(valor => {
                const termino = (valor || '').trim();
                if (termino.length >= 3) {
                    this.buscarFactura(termino);
                } else if (termino.length === 0) {
                    this.limpiarBusqueda();
                }
            });
    }

    // ============================================================================
    // CÁLCULO DE PERMISOS DE EDICIÓN - SIMPLIFICADO
    // ============================================================================

    private calcularPermisosEdicion(): PermisosEdicion {
        const factura = this.facturaActual();

        console.log('CALCULANDO PERMISOS CON DÍAS HÁBILES DEL BACKEND:', {
            factura: factura,
            diasHabiles: factura?.dias_habiles
        });

        // Usar la nueva función que utiliza días hábiles del backend
        const permisos = validarPermisosEdicion(factura);
        console.log('PERMISOS CALCULADOS:', permisos);

        return permisos;
    }

    // ============================================================================
    // ACCIONES PRINCIPALES
    // ============================================================================

    buscarManual(): void {
        const termino = (this.searchControl.value || '').trim();
        if (termino) {
            this.buscarFactura(termino);
        }
    }

    private buscarFactura(numeroDte: string): void {
        this.service.buscarFactura(numeroDte).subscribe();
    }

    limpiarBusqueda(): void {
        this.searchControl.setValue('', { emitEvent: false });
        this.service.limpiarFactura();
    }

    // ============================================================================
    // GESTIÓN DE MODALES
    // ============================================================================

    abrirModalRegistrar(): void {
        this.mostrarModalRegistrar.set(true);
    }

    cerrarModalRegistrar(): void {
        this.mostrarModalRegistrar.set(false);
    }

    abrirModalAutorizacion(): void {
        this.mostrarModalAutorizacion.set(true);
    }

    cerrarModalAutorizacion(): void {
        this.mostrarModalAutorizacion.set(false);
    }

    // ============================================================================
    // LÓGICA DE VALIDACIÓN Y UTILIDADES - USANDO DÍAS HÁBILES DEL BACKEND
    // ============================================================================

    requiereAutorizacion(factura: FacturaPE): boolean {
        return requiereAutorizacionPorTardanza(factura);
    }

    estaEnTiempo(factura: FacturaPE): boolean {
        return estaEnTiempoPermitido(factura);
    }

    calcularTotalDetalles(): number {
        const total = this.detallesLiquidacion().reduce((total, d) => total + (d.monto || 0), 0);
        return total;
    }

    hayDiferenciaMontos(): boolean {
        const factura = this.facturaActual();
        if (!factura) return false;
        const diferencia = Math.abs(factura.monto_total - this.calcularTotalDetalles());
        return diferencia > 0.01;
    }

    obtenerMensajeEstado(): string {
        const factura = this.facturaActual();
        if (!factura) return '';

        if (factura.estado_liquidacion === 'Liquidado') {
            return 'Factura completamente liquidada';
        }
        if (factura.estado_liquidacion === 'Pagado') {
            return 'Factura liquidada y pagada';
        }
        if (factura.estado_liquidacion === 'Verificado') {
            return 'Factura verificada, pendiente de pago';
        }
        if (this.hayDiferenciaMontos()) {
            const diferencia = Math.abs(factura.monto_total - this.calcularTotalDetalles());
            return `Diferencia de ${this.formatearMonto(diferencia)} entre factura y liquidación`;
        }
        if (this.detallesLiquidacion().length === 0) {
            return 'Sin detalles de liquidación registrados';
        }
        return 'Factura lista para liquidación';
    }

    /**
     * NUEVO MÉTODO: Obtener información de vencimiento usando días hábiles del backend
     */
    obtenerInfoVencimiento(): { mensaje: string; clase: string } {
        const factura = this.facturaActual();
        if (!factura?.dias_habiles) {
            return {
                mensaje: 'Información de tiempo no disponible',
                clase: 'text-gray-600 bg-gray-50 border-gray-200'
            };
        }

        const mensaje = obtenerMensajeEstadoTiempo(factura);
        const clase = obtenerColorEstadoTiempo(factura.dias_habiles.estado_tiempo);

        return { mensaje, clase };
    }

    /**
     * NUEVO MÉTODO: Obtener días transcurridos desde el backend
     */
    obtenerDiasTranscurridos(): number {
        const factura = this.facturaActual();
        return factura?.dias_habiles?.dias_transcurridos || 0;
    }

    /**
     * NUEVO MÉTODO: Obtener días permitidos desde el backend
     */
    obtenerDiasPermitidos(): number {
        const factura = this.facturaActual();
        return factura?.dias_habiles?.total_permitido || 0;
    }

    obtenerMontoRetencion(): number {
        const factura = this.facturaActual();
        return factura?.monto_retencion || 0;
    }

    // ============================================================================
    // MÉTODOS PARA PERMISOS DE EDICIÓN
    // ============================================================================

    puedeEditarDetalles(): boolean {
        return this.permisosEdicion().puedeEditar;
    }

    puedeAgregarDetalles(): boolean {
        return this.permisosEdicion().puedeAgregar;
    }

    puedeEliminarDetalles(): boolean {
        return this.permisosEdicion().puedeEliminar;
    }

    obtenerMensajePermisos(): string {
        return this.permisosEdicion().razon;
    }

    obtenerClasePermisos(): string {
        return this.permisosEdicion().claseCSS;
    }

    // ============================================================================
    // EVENTOS DE COMPONENTES HIJOS
    // ============================================================================

    onFacturaRegistrada(): void {
        this.cerrarModalRegistrar();
    }

    onSolicitudEnviada(): void {
        this.cerrarModalAutorizacion();
        const factura = this.facturaActual();
        if (factura?.numero_dte) {
            this.buscarFactura(factura.numero_dte);
        }
    }

    // ============================================================================
    // INFORMACIÓN ADICIONAL DE LA FACTURA - ACTUALIZADA
    // ============================================================================

    obtenerEstadisticasFactura(): any {
        const factura = this.facturaActual();
        const detalles = this.detallesLiquidacion();

        if (!factura) return null;

        const totalLiquidado = this.calcularTotalDetalles();
        const montoRetencion = this.obtenerMontoRetencion();
        const montoPendiente = factura.monto_total - totalLiquidado;

        return {
            montoTotal: factura.monto_total || 0,
            montoLiquidado: totalLiquidado || 0,
            totalLiquidado: totalLiquidado || 0,
            montoRetencion: montoRetencion || 0,
            montoPendiente: montoPendiente || 0,
            cantidadDetalles: detalles.length || 0,
            cantidadLiquidacionesRegistradas: factura.cantidad_liquidaciones || 0,
            porcentajeLiquidado: factura.monto_total > 0 ? (totalLiquidado / factura.monto_total) * 100 : 0,

            // NUEVA información de días hábiles del backend
            diasTranscurridos: factura.dias_habiles?.dias_transcurridos || 0,
            diasPermitidos: factura.dias_habiles?.total_permitido || 0,
            estadoTiempo: factura.dias_habiles?.estado_tiempo || 'No disponible',
            excedeLimite: factura.dias_habiles?.excede_limite || false,
            requiereAutorizacion: factura.dias_habiles?.requiere_autorizacion || false
        };
    }

    /**
     * NUEVO MÉTODO: Obtener información completa de días hábiles
     */
    obtenerInfoDiasHabiles(): any {
        const factura = this.facturaActual();
        if (!factura?.dias_habiles) return null;

        return {
            fechaEmision: factura.dias_habiles.fecha_emision,
            fechaInicioCalculo: factura.dias_habiles.fecha_inicio_calculo,
            fechaFinCalculo: factura.dias_habiles.fecha_fin_calculo,
            diasTranscurridos: factura.dias_habiles.dias_transcurridos,
            diasPermitidos: factura.dias_habiles.dias_permitidos,
            diasGracia: factura.dias_habiles.dias_gracia,
            totalPermitido: factura.dias_habiles.total_permitido,
            excedeLimite: factura.dias_habiles.excede_limite,
            requiereAutorizacion: factura.dias_habiles.requiere_autorizacion,
            estadoTiempo: factura.dias_habiles.estado_tiempo
        };
    }

    /**
     * NUEVO MÉTODO: Verificar si hay información de autorización
     */
    tieneAutorizacion(): boolean {
        const factura = this.facturaActual();
        return !!(factura?.estado_autorizacion && factura.estado_autorizacion !== 'ninguna');
    }

    /**
     * NUEVO MÉTODO: Obtener progreso de días hábiles
     */
    obtenerProgresoDias(): number {
        const factura = this.facturaActual();
        if (!factura?.dias_habiles || factura.dias_habiles.total_permitido === 0) return 0;

        return Math.min(
            (factura.dias_habiles.dias_transcurridos / factura.dias_habiles.total_permitido) * 100,
            100
        );
    }

    /**
     * NUEVO MÉTODO: Verificar si la factura está vencida
     */
    estaVencida(): boolean {
        const factura = this.facturaActual();
        return factura?.dias_habiles?.excede_limite || false;
    }

    /**
     * NUEVO MÉTODO: Obtener mensaje descriptivo de estado de tiempo
     */
    obtenerMensajeEstadoTiempo(): string {
        const factura = this.facturaActual();
        if (!factura?.dias_habiles) return 'Estado de tiempo no disponible';

        return obtenerMensajeEstadoTiempo(factura);
    }

    /**
     * NUEVO MÉTODO: Obtener clase CSS para el estado de tiempo
     */
    obtenerClaseEstadoTiempo(): string {
        const factura = this.facturaActual();
        if (!factura?.dias_habiles) return 'text-gray-600 bg-gray-50 border-gray-200';

        return obtenerColorEstadoTiempo(factura.dias_habiles.estado_tiempo);
    }
    /**
 * Determina si debe mostrarse el botón de solicitar autorización
 * @param factura - La factura a evaluar
 * @returns true si debe mostrar el botón, false en caso contrario
 */
    mostrarBotonAutorizacion(factura: FacturaPE): boolean {
        // 1) Si la factura está anulada, nunca mostrar el botón
        if (factura.estado_factura === 'Anulado') return false;

        // Normaliza el estado por si viene en mayúsculas/mixto
        const estado = (factura.estado_autorizacion || 'ninguna').toLowerCase() as
            'ninguna' | 'pendiente' | 'aprobada' | 'rechazada';

        // 2) Si la autorización fue RECHAZADA, permitir reintentar
        if (estado === 'rechazada') return true;

        // 3) Lógica original: mostrar solo si requiere autorización y aún no la tiene procesada
        const requiereAutorizacion = !!(factura.dias_habiles?.requiere_autorizacion);
        if (!requiereAutorizacion) return false;

        // Considera "procesada" cuando ya hay una en curso o aprobada
        const tieneAutorizacionProcesada = !!(
            factura.autorizacion_id && (estado === 'pendiente' || estado === 'aprobada')
        );

        return requiereAutorizacion && !tieneAutorizacionProcesada;
    }

    /**
     * Método alternativo más explícito para verificar el estado de autorización
     */
    detalleEstadoAutorizacion(factura: FacturaPE): {
        requiere: boolean;
        tieneAutorizacion: boolean;
        estadoAutorizacion: string | null;
        mostrarBoton: boolean;
    } {
        const requiere = factura.dias_habiles?.requiere_autorizacion || false;
        const tieneAutorizacion = !!(factura.autorizacion_id && factura.estado_autorizacion);
        const estadoAutorizacion = factura.estado_autorizacion || null;

        return {
            requiere,
            tieneAutorizacion,
            estadoAutorizacion,
            mostrarBoton: requiere && !tieneAutorizacion
        };
    }
}