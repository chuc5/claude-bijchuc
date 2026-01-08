// ============================================================================
// DETALLE LIQUIDACIONES COMPONENT - ACTUALIZADO SIN DÍAS HÁBILES SERVICE
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import { TablaDetalleLiquidacionesComponentpresupuesto } from '../tabla-detalle-liquidaciones/tabla-detalle-liquidaciones-presupuesto.component';
import { ResumenLiquidacionComponentpresupuesto } from '../resumen-liquidacion/resumen-liquidacion.component';

import { FacturasPlanEmpresarialService } from '../../services/facturas-presupuesto.service';
import {
    FacturaPE,
    DetalleLiquidacionPE,
    PermisosEdicion,
    validarPermisosEdicion
} from '../../models/facturas-presupuesto.models';

@Component({
    selector: 'app-detalle-liquidizaciones-pe-presupuesto',
    standalone: true,
    imports: [
        CommonModule,
        TablaDetalleLiquidacionesComponentpresupuesto,
        ResumenLiquidacionComponentpresupuesto
    ],
    templateUrl: './detalle-liquidaciones-pe.component.html',
})
export class DetalleLiquidizacionesPlanEmpresarialComponentpresupuesto implements OnInit, OnDestroy {

    private readonly service = inject(FacturasPlanEmpresarialService);
    private readonly destroy$ = new Subject<void>();

    // ============================================================================
    // ESTADO DEL COMPONENTE CON SIGNALS
    // ============================================================================

    readonly facturaActual = signal<FacturaPE | null>(null);
    readonly detallesLiquidacion = signal<DetalleLiquidacionPE[]>([]);
    readonly cargandoDetalles = signal<boolean>(false);
    readonly procesandoLiquidacion = signal<boolean>(false);

    // Computed signals para permisos - SIMPLIFICADO SIN DÍAS HÁBILES SERVICE
    readonly permisos = computed(() => this.calcularPermisosEdicion());

    readonly datosResumen = signal<{
        cantidad: number;
        total: number;
        montoFactura: number;
        montoRetencion: number;
        estadoMonto: 'completo' | 'incompleto' | 'excedido';
    }>({
        cantidad: 0,
        total: 0,
        montoFactura: 0,
        montoRetencion: 0,
        estadoMonto: 'incompleto'
    });

    ngOnInit(): void {
        this.inicializarSuscripciones();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ============================================================================
    // INICIALIZACIÓN
    // ============================================================================

    private inicializarSuscripciones(): void {
        // Suscripción a la factura actual
        this.service.facturaActual$
            .pipe(takeUntil(this.destroy$))
            .subscribe(factura => {
                this.facturaActual.set(factura);
                this.actualizarResumen();
            });

        // Suscripción a los detalles de liquidación
        this.service.detallesLiquidacion$
            .pipe(takeUntil(this.destroy$))
            .subscribe(detalles => {
                this.detallesLiquidacion.set(detalles);
                this.actualizarResumen();
            });

        // Suscripción a estados de carga
        this.service.cargandoDetalles$
            .pipe(takeUntil(this.destroy$))
            .subscribe(cargando => this.cargandoDetalles.set(cargando));

        this.service.procesandoLiquidacion$
            .pipe(takeUntil(this.destroy$))
            .subscribe(procesando => this.procesandoLiquidacion.set(procesando));
    }

    // ============================================================================
    // CÁLCULO DE PERMISOS - SIMPLIFICADO USANDO DÍAS HÁBILES DEL BACKEND
    // ============================================================================

    private calcularPermisosEdicion(): PermisosEdicion {
        const factura = this.facturaActual();

        console.log('CALCULANDO PERMISOS EN DETALLE LIQUIDACIONES:', {
            factura: factura,
            diasHabiles: factura?.dias_habiles
        });

        // Usar la función validarPermisosEdicion que ya maneja los días hábiles del backend
        const permisos = validarPermisosEdicion(factura);
        console.log('PERMISOS CALCULADOS EN DETALLE LIQUIDACIONES:', permisos);

        return permisos;
    }

    // ============================================================================
    // MÉTODOS PRIVADOS
    // ============================================================================

    private actualizarResumen(): void {
        const factura = this.facturaActual();
        const detalles = this.detallesLiquidacion();

        const total = detalles.reduce((sum, detalle) => sum + (detalle.monto || 0), 0);
        const montoFactura = factura?.monto_total || 0;
        const montoRetencion = factura?.monto_retencion || 0;
        const estadoMonto = this.calcularEstadoMonto(factura, total);

        this.datosResumen.set({
            cantidad: detalles.length,
            total,
            montoFactura,
            montoRetencion,
            estadoMonto
        });
    }

    private calcularEstadoMonto(factura: FacturaPE | null, total: number): 'completo' | 'incompleto' | 'excedido' {
        if (!factura || total <= 0) return 'incompleto';

        const diferencia = Math.abs(total - factura.monto_total);
        if (diferencia < 0.00) return 'completo'; // Tolerancia de 1 centavo
        if (total > factura.monto_total) return 'excedido';

        return 'incompleto';
    }

    // ============================================================================
    // MÉTODOS DE ESTILO Y UI
    // ============================================================================

    /**
     * Obtener clase CSS para el estado de la factura
     */
    obtenerClaseEstadoFactura(): string {
        const estado = this.facturaActual()?.estado_liquidacion;

        switch (estado) {
            case 'Liquidado':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'Pagado':
                return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300';
            case 'Verificado':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'En Revisión':
                return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
            default:
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        }
    }

    /**
     * Obtener clase CSS para el progreso
     */
    obtenerClaseProgreso(): string {
        const resumen = this.datosResumen();

        switch (resumen.estadoMonto) {
            case 'completo':
                return 'text-green-600 dark:text-green-400';
            case 'excedido':
                return 'text-red-600 dark:text-red-400';
            default:
                return 'text-gray-900 dark:text-gray-100';
        }
    }

    // ============================================================================
    // MÉTODOS PÚBLICOS
    // ============================================================================

    /**
     * Verificar si hay una factura cargada
     */
    tieneFactura(): boolean {
        return this.facturaActual() !== null;
    }

    /**
     * Métodos para permisos
     */
    puedeEditarDetalles(): boolean {
        return this.permisos().puedeEditar;
    }

    puedeAgregarDetalles(): boolean {
        return this.permisos().puedeAgregar;
    }

    puedeEliminarDetalles(): boolean {
        return this.permisos().puedeEliminar;
    }

    obtenerMensajePermisos(): string {
        return this.permisos().razon;
    }

    /**
     * Obtener total de detalles
     */
    getTotalDetalles(): number {
        return this.datosResumen().total;
    }

    /**
     * Verificar si los montos cuadran
     */
    montosCuadran(): boolean {
        return this.datosResumen().estadoMonto === 'completo';
    }

    /**
     * Obtener diferencia de montos
     */
    getDiferenciaMontos(): number {
        const datos = this.datosResumen();
        return Math.abs(datos.total - datos.montoFactura);
    }

    /**
     * Obtener porcentaje de progreso
     */
    obtenerPorcentajeProgreso(): number {
        const datos = this.datosResumen();
        return datos.montoFactura > 0 ? (datos.total / datos.montoFactura) * 100 : 0;
    }

    /**
     * Obtener texto de progreso formateado
     */
    obtenerTextoProgreso(): string {
        const datos = this.datosResumen();
        const porcentaje = this.obtenerPorcentajeProgreso();
        return `Q${datos.total.toFixed(2)} / Q${datos.montoFactura.toFixed(2)} (${porcentaje.toFixed(1)}%)`;
    }

    // ============================================================================
    // INFORMACIÓN SOBRE RETENCIONES
    // ============================================================================

    tieneRetencion(): boolean {
        const factura = this.facturaActual();
        return !!(factura?.monto_retencion && factura.monto_retencion > 0);
    }

    obtenerMontoRetencion(): number {
        return this.facturaActual()?.monto_retencion || 0;
    }

    obtenerTipoRetencion(): string {
        const factura = this.facturaActual();
        if (!factura?.tipo_retencion) return 'Sin especificar';

        const tipos = {
            1: 'Retención por servicios',
            2: 'Retención por bienes',
            3: 'Retención especial'
        };

        return tipos[factura.tipo_retencion as keyof typeof tipos] || `Tipo ${factura.tipo_retencion}`;
    }

    // ============================================================================
    // ALERTAS Y VALIDACIONES
    // ============================================================================

    mostrarAlertaDiferencias(): boolean {
        const datos = this.datosResumen();
        return datos.estadoMonto === 'excedido' ||
            (datos.estadoMonto === 'incompleto' && datos.total > 0);
    }

    obtenerMensajeAlerta(): string {
        const datos = this.datosResumen();
        const diferencia = this.getDiferenciaMontos();

        if (datos.estadoMonto === 'excedido') {
            return `El monto liquidado excede la factura por Q${diferencia.toFixed(2)}`;
        }

        if (datos.estadoMonto === 'incompleto' && datos.total > 0) {
            return `Faltan Q${diferencia.toFixed(2)} por liquidar`;
        }

        return '';
    }

    // ============================================================================
    // INFORMACIÓN COMPLETA PARA TEMPLATES - ACTUALIZADA CON DÍAS HÁBILES
    // ============================================================================

    obtenerResumenCompleto(): any {
        const factura = this.facturaActual();
        const datos = this.datosResumen();
        const permisos = this.permisos();

        if (!factura) return null;

        return {
            montoTotal: datos.montoFactura,
            montoLiquidado: datos.total,
            montoRetencion: datos.montoRetencion,
            montoPendiente: datos.montoFactura - datos.total,
            cantidadDetalles: datos.cantidad,
            cantidadLiquidacionesRegistradas: factura.cantidad_liquidaciones || 0,
            porcentajeLiquidado: this.obtenerPorcentajeProgreso(),
            tieneRetencion: this.tieneRetencion(),
            tipoRetencion: this.obtenerTipoRetencion(),
            puedeEditar: permisos.puedeEditar,
            mensajePermisos: permisos.razon,
            estadoFactura: factura.estado_factura || 'vigente',
            fechaUltimaActualizacion: factura.fecha_actualizacion,
            estadoMonto: datos.estadoMonto,

            // NUEVA información de días hábiles del backend
            diasHabiles: factura.dias_habiles ? {
                diasTranscurridos: factura.dias_habiles.dias_transcurridos,
                diasPermitidos: factura.dias_habiles.total_permitido,
                estadoTiempo: factura.dias_habiles.estado_tiempo,
                excedeLimite: factura.dias_habiles.excede_limite,
                requiereAutorizacion: factura.dias_habiles.requiere_autorizacion,
                fechaEmision: factura.dias_habiles.fecha_emision,
                fechaInicioCalculo: factura.dias_habiles.fecha_inicio_calculo,
                progresoDias: factura.dias_habiles.total_permitido > 0
                    ? (factura.dias_habiles.dias_transcurridos / factura.dias_habiles.total_permitido) * 100
                    : 0
            } : null
        };
    }

    // ============================================================================
    // NUEVOS MÉTODOS PARA INFORMACIÓN DE DÍAS HÁBILES
    // ============================================================================

    /**
     * Obtener información de estado de tiempo de la factura
     */
    obtenerEstadoTiempo(): string {
        const factura = this.facturaActual();
        return factura?.dias_habiles?.estado_tiempo || 'No disponible';
    }

    /**
     * Verificar si la factura está vencida
     */
    estaVencida(): boolean {
        const factura = this.facturaActual();
        return factura?.dias_habiles?.excede_limite || false;
    }

    /**
     * Obtener progreso de días hábiles transcurridos
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
     * Obtener mensaje descriptivo del estado de tiempo
     */
    obtenerMensajeEstadoTiempo(): string {
        const factura = this.facturaActual();
        if (!factura?.dias_habiles) return 'Estado de tiempo no disponible';

        const dh = factura.dias_habiles;
        return `${dh.estado_tiempo} - ${dh.dias_transcurridos}/${dh.total_permitido} días hábiles transcurridos`;
    }
}