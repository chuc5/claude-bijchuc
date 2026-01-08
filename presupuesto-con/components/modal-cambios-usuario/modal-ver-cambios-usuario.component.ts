// ============================================================================
// COMPONENTE: MODAL VER CAMBIOS USUARIO - VERSIÓN CORREGIDA
// Archivo: modal-ver-cambios-usuario.component.ts
// ============================================================================

import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import { CambioSolicitadoUsuario, CambiosUsuarioHelper, EstadisticasCambiosUsuario } from '../../models/cambios-usuario.models';
import { DetalleLiquidacionPE } from '../../models/facturas-presupuesto.models';
import { CambiosUsuarioService } from '../../services/cambios-solicitados-usuario.service';

@Component({
    selector: 'app-modal-ver-cambios-usuario',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './modal-ver-cambios-usuario.component.html'
})
export class ModalVerCambiosUsuarioComponent implements OnInit {

    // ============================================================================
    // INYECCIÓN DE DEPENDENCIAS
    // ============================================================================

    private readonly cambiosService = inject(CambiosUsuarioService);

    // ============================================================================
    // INPUTS Y OUTPUTS
    // ============================================================================

    @Input() detalle: DetalleLiquidacionPE | null = null;
    @Output() cerrar = new EventEmitter<void>();
    @Output() cambiosActualizados = new EventEmitter<void>();

    // ============================================================================
    // SEÑALES (SIGNALS) - ESTADO REACTIVO
    // ============================================================================

    cambios = signal<CambioSolicitadoUsuario[]>([]);
    cargando = signal<boolean>(true);
    procesando = signal<boolean>(false);

    // ============================================================================
    // LIFECYCLE HOOKS
    // ============================================================================

    ngOnInit(): void {
        console.log('🚀 Modal inicializado con detalle:', this.detalle);
        this.cargarCambios();
    }

    // ============================================================================
    // MÉTODOS PRINCIPALES
    // ============================================================================

    /**
     * Cargar cambios del detalle
     */
    private cargarCambios(): void {
        if (!this.detalle?.id) {
            console.warn('⚠️ No hay ID de detalle para cargar cambios');
            this.cargando.set(false);
            return;
        }

        console.log('🔄 Cargando cambios para detalle ID:', this.detalle.id);
        this.cargando.set(true);

        this.cambiosService.obtenerCambiosDetalle(this.detalle.id).subscribe({
            next: (cambios) => {
                console.log('✅ Cambios recibidos:', cambios);
                const cambiosOrdenados = CambiosUsuarioHelper.ordenarCambios(cambios);
                this.cambios.set(cambiosOrdenados);
                this.cargando.set(false);
                console.log('📊 Cambios ordenados y establecidos:', cambiosOrdenados.length);
            },
            error: (error) => {
                console.error('❌ Error al cargar cambios:', error);
                this.cambios.set([]);
                this.cargando.set(false);
            }
        });
    }

    /**
     * Marcar un cambio como realizado
     */
    marcarComoRealizado(cambio: CambioSolicitadoUsuario): void {
        console.log('🔄 Intentando marcar cambio como realizado:', cambio);

        // Validar que el cambio pueda ser marcado
        const validacion = this.validarCambio(cambio);
        if (!validacion.valido) {
            Swal.fire({
                icon: 'warning',
                title: 'No se puede marcar',
                text: validacion.mensaje || 'Este cambio no puede ser marcado como realizado',
                confirmButtonText: 'Entendido'
            });
            return;
        }

        // Confirmar acción
        Swal.fire({
            title: '¿Marcar como realizado?',
            html: `
                <p class="text-sm text-gray-600 mb-3">
                    ¿Confirma que ya realizó el cambio solicitado?
                </p>
                <div class="text-left bg-gray-50 p-3 rounded-lg text-sm">
                    <strong>Tipo:</strong> ${this.getTextoTipoCambio(cambio.tipo_cambio)}<br>
                    <strong>Cambio:</strong> ${cambio.descripcion_cambio}
                </div>
                <p class="text-xs text-gray-500 mt-3">
                    Esta acción no se puede deshacer
                </p>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, marcar como realizado',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#6b7280',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                this.ejecutarMarcarRealizado(cambio.id);
            }
        });
    }

    /**
     * Ejecutar el marcado como realizado
     */
    private ejecutarMarcarRealizado(cambioId: number): void {
        console.log('🔄 Ejecutando marcado como realizado para ID:', cambioId);
        this.procesando.set(true);

        this.cambiosService.marcarCambioComoRealizado(cambioId).subscribe({
            next: (success) => {
                console.log('✅ Resultado de marcar realizado:', success);
                this.procesando.set(false);

                if (success) {
                    // Recargar cambios para reflejar el cambio de estado
                    this.cargarCambios();

                    // Emitir evento de actualización
                    this.cambiosActualizados.emit();

                    console.log('🎉 Cambio marcado exitosamente');
                }
            },
            error: (error) => {
                console.error('❌ Error al marcar cambio:', error);
                this.procesando.set(false);
            }
        });
    }

    /**
     * Cerrar el modal
     */
    cerrarModal(): void {
        if (!this.procesando()) {
            console.log('🔚 Cerrando modal');
            this.cerrar.emit();
        }
    }

    // ============================================================================
    // MÉTODOS DE UTILIDAD Y HELPERS
    // ============================================================================

    /**
     * Validar si un cambio puede ser marcado como realizado
     */
    validarCambio(cambio: CambioSolicitadoUsuario): { valido: boolean; mensaje?: string } {
        return CambiosUsuarioHelper.validarCambio(cambio);
    }

    /**
     * Verificar si un cambio puede ser marcado como realizado
     */
    puedeMarcarRealizado(cambio: CambioSolicitadoUsuario): boolean {
        return CambiosUsuarioHelper.puedeMarcarRealizado(cambio);
    }

    /**
     * Obtener resumen de cambios
     */
    obtenerResumenCambios(): EstadisticasCambiosUsuario {
        return CambiosUsuarioHelper.obtenerResumen(this.cambios());
    }

    /**
     * Formatear monto
     */
    formatMonto(monto: number): string {
        return CambiosUsuarioHelper.formatMonto(monto);
    }

    /**
     * Formatear fecha y hora
     */
    formatFechaHora(fecha: string): string {
        return CambiosUsuarioHelper.formatFechaHora(fecha);
    }

    /**
     * Obtener texto del tipo de cambio
     */
    getTextoTipoCambio(tipo: string): string {
        return CambiosUsuarioHelper.getTextoTipoCambio(tipo as any);
    }

    /**
     * Obtener color del tipo de cambio
     */
    getColorTipoCambio(tipo: string): string {
        return CambiosUsuarioHelper.getColorTipoCambio(tipo as any);
    }

    /**
     * Obtener texto del estado del cambio
     */
    getTextoEstadoCambio(estado: string): string {
        return CambiosUsuarioHelper.getTextoEstadoCambio(estado as any);
    }

    /**
     * Obtener color del estado del cambio
     */
    getColorEstadoCambio(estado: string): string {
        return CambiosUsuarioHelper.getColorEstadoCambio(estado as any);
    }

    /**
     * TrackBy para optimización de renderizado
     */
    trackByCambio(index: number, cambio: CambioSolicitadoUsuario): number {
        return cambio.id;
    }
}