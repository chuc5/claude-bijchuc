// ============================================================================
// COMPONENTE DE ÓRDENES - CORREGIDO SIN DUPLICACIONES
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

import { OrdenesPlanEmpresarialService, OrdenPE } from '../../services/ordenes-presupuesto.service';
import { ModalAnticiposComponentpresupuesto } from '../modal-anticipos/modal-anticipos.component';

@Component({
  selector: 'app-ordenes-plan-empresarial-simple-presupuesto',
  standalone: true,
  imports: [CommonModule, ModalAnticiposComponentpresupuesto],
  templateUrl: './ordenes-plan-empresarial.component.html',
})
export class OrdenesPlanEmpresarialSimpleComponentpresupuesto implements OnInit, OnDestroy {

  private readonly service = inject(OrdenesPlanEmpresarialService);
  private readonly destroy$ = new Subject<void>();

  // Estado del componente
  readonly ordenes = signal<OrdenPE[]>([]);
  readonly cargando = signal<boolean>(false);
  readonly modalVisible = signal<boolean>(false);
  readonly ordenSeleccionada = signal<OrdenPE | null>(null);

  ngOnInit(): void {
    this.inicializarSuscripciones();
    // NO cargar datos aquí - el contenedor padre ya los carga
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================================
  // INICIALIZACIÓN
  // ============================================================================

  private inicializarSuscripciones(): void {
    this.service.ordenes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(ordenes => this.ordenes.set(ordenes));

    this.service.cargando$
      .pipe(takeUntil(this.destroy$))
      .subscribe(cargando => this.cargando.set(cargando));
  }

  // ============================================================================
  // ACCIONES DEL COMPONENTE
  // ============================================================================

  refrescar(): void {
    // Solo refrescar si no se está cargando ya
    if (!this.cargando()) {
      this.service.cargarOrdenes().subscribe();
    }
  }

  abrirModalAnticipos(orden: OrdenPE): void {
    this.ordenSeleccionada.set(orden);
    this.modalVisible.set(true);
  }

  cerrarModal(): void {
    this.modalVisible.set(false);
    this.ordenSeleccionada.set(null);
  }

  onSolicitudExitosa(): void {
    // Mantener el modal abierto pero refrescar datos solo si no se está cargando
    if (!this.cargando()) {
      this.service.cargarOrdenes().subscribe();
    }
  }

  // ============================================================================
  // MÉTODOS DE UTILIDAD
  // ============================================================================

  resumen(): { totalOrdenes: number; ordenesConPendientes: number } {
    return this.service.obtenerResumen();
  }

  formatearMonto(monto: number): string {
    return new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: 'GTQ',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(monto);
  }

  trackByOrden(index: number, orden: OrdenPE): number {
    return orden.numero_orden;
  }
}