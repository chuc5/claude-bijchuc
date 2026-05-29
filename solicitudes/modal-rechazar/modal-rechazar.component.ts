// =============================================================================
// MODAL RECHAZAR — modal-rechazar.component.ts
// =============================================================================
// (Archivo separado: modal-rechazar/modal-rechazar.component.ts)

import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X, XCircle as XCircleIcon } from 'lucide-angular';
import { overlayAnimation as overlayAnim, modalAnimation as modalAnim }
    from '../../../animations/modal.animations';
import { DetalleSolicitud } from '../services/encargado-solicitudes.service';

@Component({
    selector: 'app-modal-rechazar',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule],
    templateUrl: './modal-rechazar.component.html',
    animations: [overlayAnim, modalAnim],
})
export class ModalRechazarComponent {

    @Input() detalle!: DetalleSolicitud;
    @Output() cerrar = new EventEmitter<void>();
    @Output() confirmar = new EventEmitter<{ idSolicitud: number; motivo: string }>();

    readonly X = X;
    readonly XCircleIcon = XCircleIcon;

    motivo = '';
    readonly errorMotivo = signal<string>('');

    onConfirmar(): void {
        if (!this.motivo.trim()) {
            this.errorMotivo.set('El motivo de rechazo es obligatorio');
            return;
        }
        this.errorMotivo.set('');
        this.confirmar.emit({
            idSolicitud: this.detalle.cabecera.id,
            motivo: this.motivo.trim(),
        });
    }
}