// =============================================================================
// MODAL ENTREGAR — modal-entregar.component.ts
// =============================================================================

import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, computed } from '@angular/core';
import { LucideAngularModule, X, CheckCircle2, Package, AlertCircle } from 'lucide-angular';
import { overlayAnimation, modalAnimation } from '../../../animations/modal.animations';
import { DetalleSolicitud, RenglonDetalle } from '../services/encargado-solicitudes.service';
import { FormatSolicitudes, TipoProductoId, EstadoSolicitudId } from '../models/solicitudes.models';

@Component({
    selector: 'app-modal-entregar',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    templateUrl: './modal-entregar.component.html',
    animations: [overlayAnimation, modalAnimation],
})
export class ModalEntregarComponent {

    @Input() detalle!: DetalleSolicitud;
    @Output() cerrar = new EventEmitter<void>();
    @Output() confirmar = new EventEmitter<number>(); // emite id_solicitud

    readonly X = X;
    readonly CheckCircle2 = CheckCircle2;
    readonly Package = Package;
    readonly AlertCircle = AlertCircle;

    // ── Solo lectura si no está Reservada ────────────────────────────────────
    get puedeEntregar(): boolean {
        return this.detalle?.cabecera?.id_estado === EstadoSolicitudId.RESERVADA;
    }

    get tieneCorrelativo(): boolean {
        return this.detalle?.renglones?.some(
            r => r.id_tipo_producto === TipoProductoId.CORRELATIVO
        ) ?? false;
    }

    get tituloModal(): string {
        return this.puedeEntregar ? 'Confirmar Entrega' : 'Detalle de Solicitud';
    }

    cantidad(v: number | string | null): number {
        return FormatSolicitudes.cantidad(v as any);
    }

    fecha(f: string | null): string {
        return FormatSolicitudes.fechaHora(f ?? '');
    }

    onConfirmar(): void {
        this.confirmar.emit(this.detalle.cabecera.id);
    }
}