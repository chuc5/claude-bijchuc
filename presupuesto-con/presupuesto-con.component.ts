
// ============================================================================
// PLAN EMPRESARIAL CONTENEDOR - COMPLETO Y ACTUALIZADO SIN DÍAS HÁBILES SERVICE
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import { OrdenesPlanEmpresarialSimpleComponentpresupuesto } from './components/ordenes-plan-empresarial/ordenes-plan-empresarial.component';
import { FacturasGestionComponentpresupuesto } from './components/facturas-gestion/facturas-gestion.component';
import { DetalleLiquidizacionesPlanEmpresarialComponentpresupuesto } from './components/detalle-liquidaciones-pe/detalle-liquidaciones-pe.component';

import { OrdenesPlanEmpresarialService } from './services/ordenes-presupuesto.service';
import { FacturasPlanEmpresarialService } from './services/facturas-presupuesto.service';
import { FacturaPE, DetalleLiquidacionPE } from './models/facturas-presupuesto.models';

@Component({
  selector: 'app-presupuesto-con',
  standalone: true,
  imports: [
    CommonModule,
    OrdenesPlanEmpresarialSimpleComponentpresupuesto,
    FacturasGestionComponentpresupuesto,
    DetalleLiquidizacionesPlanEmpresarialComponentpresupuesto
  ],
  templateUrl: './presupuesto-con.component.html',
})
export class presupuestoConComponent implements OnInit, OnDestroy {

  private readonly ordenesService = inject(OrdenesPlanEmpresarialService);
  private readonly facturasService = inject(FacturasPlanEmpresarialService);
  private readonly destroy$ = new Subject<void>();

  // ============================================================================
  // ESTADO DEL CONTENEDOR - USANDO SIGNALS REACTIVOS
  // ============================================================================

  readonly fechaUltimaActualizacion = signal<Date>(new Date());
  readonly facturaActual = signal<FacturaPE | null>(null);
  readonly detallesLiquidacion = signal<DetalleLiquidacionPE[]>([]);

  // Estados de carga como signals separados
  private readonly cargandoOrdenes = signal<boolean>(false);
  private readonly cargandoFacturas = signal<boolean>(false);

  // Signal computado para el estado general de carga
  readonly estaOcupado = computed(() =>
    this.cargandoOrdenes() || this.cargandoFacturas()
  );

  // Signal computado para resumen de liquidaciones (solo para header)
  readonly resumenLiquidaciones = computed(() => {
    const detalles = this.detallesLiquidacion();
    const cantidad = detalles.length;
    const total = detalles.reduce((sum, d) => sum + d.monto, 0);
    return { cantidad, total };
  });

  ngOnInit(): void {
    this.inicializarSuscripciones();
    this.cargarDatosIniciales();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================================
  // INICIALIZACIÓN
  // ============================================================================

  private inicializarSuscripciones(): void {
    // Suscribirse a cambios en la factura actual
    this.facturasService.facturaActual$
      .pipe(takeUntil(this.destroy$))
      .subscribe(factura => {
        this.facturaActual.set(factura);
        this.actualizarFechaActualizacion();
      });

    // Suscribirse a cambios en detalles de liquidación
    this.facturasService.detallesLiquidacion$
      .pipe(takeUntil(this.destroy$))
      .subscribe(detalles => {
        this.detallesLiquidacion.set(detalles);
        this.actualizarFechaActualizacion();
      });

    // Suscripciones para estados de carga
    this.ordenesService.cargando$
      .pipe(takeUntil(this.destroy$))
      .subscribe(cargando => {
        this.cargandoOrdenes.set(cargando);
        if (!cargando) {
          this.actualizarFechaActualizacion();
        }
      });

    this.facturasService.cargando$
      .pipe(takeUntil(this.destroy$))
      .subscribe(cargando => {
        this.cargandoFacturas.set(cargando);
        if (!cargando) {
          this.actualizarFechaActualizacion();
        }
      });
  }

  private cargarDatosIniciales(): void {
    // Solo cargar una vez al inicializar el contenedor
    this.ordenesService.cargarOrdenes().subscribe();
    // Ya no es necesario cargar catálogos aquí - se hace automáticamente en FacturasService
  }

  private actualizarFechaActualizacion(): void {
    this.fechaUltimaActualizacion.set(new Date());
  }

  // ============================================================================
  // ACCIONES DEL CONTENEDOR
  // ============================================================================

  /**
   * Refrescar todos los datos del módulo - OPTIMIZADO
   */
  refrescarTodo(): void {
    // Verificar que no se esté cargando ya
    if (this.estaOcupado()) {
      return;
    }

    // Solo refrescar órdenes, las facturas se manejan independientemente
    this.ordenesService.refrescarDatos().subscribe(() => {
      // Recargar detalles si hay factura actual
      const factura = this.facturaActual();
      if (factura) {
        this.facturasService.cargarDetallesLiquidacion(factura.numero_dte).subscribe();
      }
      this.actualizarFechaActualizacion();
    });
  }

  /**
   * Obtener resumen de órdenes para mostrar en el header
   */
  resumenOrdenes(): { totalOrdenes: number; ordenesConPendientes: number } {
    return this.ordenesService.obtenerResumen();
  }

  // ============================================================================
  // MÉTODOS DE ESTILO Y UI PARA EL HEADER PRINCIPAL
  // ============================================================================

  /**
   * Obtener clase CSS para el estado de liquidación (solo para resumen en header)
   */
  obtenerClaseEstadoLiquidacion(): string {
    const factura = this.facturaActual();
    if (!factura) return 'text-gray-400';

    const resumen = this.resumenLiquidaciones();
    const diferencia = Math.abs(resumen.total - factura.monto_total);
    const baseClasses = 'text-lg font-semibold';

    if (diferencia < 0.00) {
      return `${baseClasses} text-green-600 dark:text-green-400`;
    } else if (resumen.total > factura.monto_total) {
      return `${baseClasses} text-red-600 dark:text-red-400`;
    } else {
      return `${baseClasses} text-yellow-600 dark:text-yellow-400`;
    }
  }

  // ============================================================================
  // MÉTODOS PÚBLICOS PARA CONTROL EXTERNO
  // ============================================================================

  /**
   * Limpiar todo el estado del módulo
   */
  limpiarEstado(): void {
    this.ordenesService.limpiarEstado();
    this.facturasService.limpiarEstado();
  }

  /**
   * Buscar factura desde el contenedor
   */
  buscarFactura(numeroDte: string): void {
    this.facturasService.buscarFactura(numeroDte).subscribe();
  }

  /**
   * Obtener información de la factura actual - ACTUALIZADO CON DÍAS HÁBILES
   */
  obtenerInfoFacturaActual(): {
    existe: boolean;
    numero: string | null;
    estado: string | null;
    monto: number;
    detalles: number;
    diasHabiles?: {
      diasTranscurridos: number;
      totalPermitido: number;
      estadoTiempo: string;
      excedeLimite: boolean;
    };
  } {
    const factura = this.facturaActual();

    const info = {
      existe: !!factura,
      numero: factura?.numero_dte || null,
      estado: factura?.estado_liquidacion || null,
      monto: factura?.monto_total || 0,
      detalles: this.facturasService.obtenerDetallesActuales().length,
    };

    // Agregar información de días hábiles si está disponible
    if (factura?.dias_habiles) {
      (info as any).diasHabiles = {
        diasTranscurridos: factura.dias_habiles.dias_transcurridos,
        totalPermitido: factura.dias_habiles.total_permitido,
        estadoTiempo: factura.dias_habiles.estado_tiempo,
        excedeLimite: factura.dias_habiles.excede_limite
      };
    }

    return info;
  }

  /**
   * Verificar si hay una factura cargada
   */
  tieneFacturaCargada(): boolean {
    return this.facturaActual() !== null;
  }

  /**
   * Obtener estado completo para debugging - ACTUALIZADO
   */
  obtenerEstadoCompleto(): {
    ordenes: {
      total: number;
      cargando: boolean;
      ultimaActualizacion: Date;
    };
    facturas: {
      facturaActual: FacturaPE | null;
      detallesCount: number;
      cargando: boolean;
      diasHabiles?: any;
    };
    contenedor: {
      ultimaActualizacion: Date;
      ocupado: boolean;
    };
  } {
    const factura = this.facturasService.obtenerFacturaActual();

    return {
      ordenes: {
        total: this.ordenesService.obtenerOrdenesActuales().length,
        cargando: this.cargandoOrdenes(),
        ultimaActualizacion: this.fechaUltimaActualizacion()
      },
      facturas: {
        facturaActual: factura,
        detallesCount: this.facturasService.obtenerDetallesActuales().length,
        cargando: this.cargandoFacturas(),
        // Incluir información de días hábiles si está disponible
        diasHabiles: factura?.dias_habiles || null
      },
      contenedor: {
        ultimaActualizacion: this.fechaUltimaActualizacion(),
        ocupado: this.estaOcupado()
      }
    };
  }

  /**
   * NUEVO MÉTODO: Obtener información específica de días hábiles
   */
  obtenerInfoDiasHabiles(): any {
    const factura = this.facturaActual();
    if (!factura?.dias_habiles) return null;

    return {
      fechaEmision: factura.dias_habiles.fecha_emision,
      fechaInicioCalculo: factura.dias_habiles.fecha_inicio_calculo,
      diasTranscurridos: factura.dias_habiles.dias_transcurridos,
      diasPermitidos: factura.dias_habiles.dias_permitidos,
      totalPermitido: factura.dias_habiles.total_permitido,
      excedeLimite: factura.dias_habiles.excede_limite,
      requiereAutorizacion: factura.dias_habiles.requiere_autorizacion,
      estadoTiempo: factura.dias_habiles.estado_tiempo,
      progresoDias: factura.dias_habiles.total_permitido > 0
        ? (factura.dias_habiles.dias_transcurridos / factura.dias_habiles.total_permitido) * 100
        : 0
    };
  }

  /**
   * NUEVO MÉTODO: Verificar si la factura actual requiere autorización
   */
  requiereAutorizacion(): boolean {
    const factura = this.facturaActual();
    return factura?.dias_habiles?.requiere_autorizacion || false;
  }

  /**
   * NUEVO MÉTODO: Verificar si la factura actual está vencida
   */
  estaVencida(): boolean {
    const factura = this.facturaActual();
    return factura?.dias_habiles?.excede_limite || false;
  }
}