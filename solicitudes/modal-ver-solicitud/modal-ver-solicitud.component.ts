import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, computed } from '@angular/core';
import {
    LucideAngularModule,
    X, Package, CheckCircle2, XCircle, Clock,
    Tag, Calendar, Hash, Building2,
} from 'lucide-angular';
import { overlayAnimation, modalAnimation } from '../../../animations/modal.animations';
import { DetalleSolicitud, RenglonDetalle } from '../services/encargado-solicitudes.service';
import {
    FormatSolicitudes, EstadoSolicitudId, TipoProductoId,
} from '../models/solicitudes.models';

@Component({
    selector: 'app-modal-ver-solicitud',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    templateUrl: './modal-ver-solicitud.component.html',
    animations: [overlayAnimation, modalAnimation],
})
export class ModalVerSolicitudComponent {

    @Input() detalle!: DetalleSolicitud;
    @Output() cerrar = new EventEmitter<void>();

    readonly X = X; readonly Package = Package;
    readonly CheckCircle2 = CheckCircle2; readonly XCircle = XCircle;
    readonly Clock = Clock; readonly Tag = Tag;
    readonly Calendar = Calendar; readonly Hash = Hash;
    readonly Building2 = Building2;

    readonly EstadoSolicitudId = EstadoSolicitudId;
    readonly TipoProductoId = TipoProductoId;

    // ── Helpers ───────────────────────────────────────────────────────────────

    claseEstado(id: number): string {
        return FormatSolicitudes.claseEstado(id as EstadoSolicitudId);
    }

    claseTipo(id: number): string {
        return FormatSolicitudes.claseTipoProducto(id as TipoProductoId);
    }

    fecha(f: string | null | undefined): string {
        return f ? FormatSolicitudes.fechaHora(f) : '—';
    }

    cantidad(v: number | string | null | undefined): number {
        return FormatSolicitudes.cantidad(v as any);
    }

    icono(idEstado: number) {
        if (idEstado === EstadoSolicitudId.ENTREGADA) return this.CheckCircle2;
        if (idEstado === EstadoSolicitudId.RECHAZADA) return this.XCircle;
        if (idEstado === EstadoSolicitudId.CANCELADA) return this.XCircle;
        return this.Clock;
    }

    claseRenglon(r: RenglonDetalle): string {
        if (r.id_usuario_gestion && r.motivo_rechazo) {
            return 'border-red-200 bg-red-50';
        }
        if (r.id_usuario_gestion && r.cantidad_entregada !== null) {
            return 'border-green-200 bg-green-50';
        }
        return 'border-gray-200 bg-white';
    }

    estadoRenglon(r: RenglonDetalle): 'entregado' | 'rechazado' | 'pendiente' {
        if (r.id_usuario_gestion && r.motivo_rechazo) return 'rechazado';
        if (r.id_usuario_gestion) return 'entregado';
        return 'pendiente';
    }

    get totalEntregados(): number {
        return this.detalle?.renglones?.filter(
            r => r.id_usuario_gestion && !r.motivo_rechazo
        ).length ?? 0;
    }
}