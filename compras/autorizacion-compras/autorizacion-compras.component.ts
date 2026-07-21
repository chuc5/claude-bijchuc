// ============================================================================
// COMPONENTE — AUTORIZACIÓN GERENCIA/FINANCIERO
// ============================================================================
//
// Cola transversal: alzas de cantidad (Agencia/Área) y compras
// extraordinarias recién creadas. Una sola pantalla para las dos.
// ============================================================================

import { CommonModule } from '@angular/common';
import {
    Component,
    OnInit,
    inject,
    signal,
    computed,
    DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import {
    LucideAngularModule,
    RefreshCw, ShieldCheck, ShieldOff, Info, TrendingUp, ChevronDown, ChevronUp,
} from 'lucide-angular';

import Swal from 'sweetalert2';

import {
    CompraAutorizacion,
    TIPO_ORIGEN,
    NOMBRE_ORIGEN,
    TipoOrigenId,
} from '../models/autorizacion.models';
import { AutorizacionComprasService } from '../services/autorizacion-compras.service';

const SWAL = {
    dangerColor: '#ef4444',
    successColor: '#10b981',
    cancelColor: '#6b7280',
    customClass: { popup: 'rounded-lg' },
} as const;

const CLASE_ORIGEN: Record<TipoOrigenId, string> = {
    [TIPO_ORIGEN.TRIMESTRAL]: 'bg-slate-100 text-slate-700',
    [TIPO_ORIGEN.EXTRAORDINARIA]: 'bg-orange-100 text-orange-800',
    [TIPO_ORIGEN.SOLICITUD_AGENCIA]: 'bg-blue-100 text-blue-800',
    [TIPO_ORIGEN.SOLICITUD_AREA]: 'bg-purple-100 text-purple-800',
};

@Component({
    selector: 'app-autorizacion-compras',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule],
    templateUrl: './autorizacion-compras.component.html',
    styleUrls: ['./autorizacion-compras.component.css'],
})
export class AutorizacionComprasComponent implements OnInit {

    // ── Dependencias ──────────────────────────────────────────────────────────
    private readonly service = inject(AutorizacionComprasService);
    private readonly destroyRef = inject(DestroyRef);

    // ── Iconos ────────────────────────────────────────────────────────────────
    readonly RefreshCw = RefreshCw;
    readonly ShieldCheck = ShieldCheck;
    readonly ShieldOff = ShieldOff;
    readonly Info = Info;
    readonly TrendingUp = TrendingUp;
    readonly ChevronDown = ChevronDown;
    readonly ChevronUp = ChevronUp;

    readonly NOMBRE_ORIGEN = NOMBRE_ORIGEN;
    readonly TIPO_ORIGEN = TIPO_ORIGEN;

    // ── Estado del servicio ───────────────────────────────────────────────────
    readonly compras = toSignal(this.service.compras$, { initialValue: [] as CompraAutorizacion[] });
    readonly cargando = toSignal(this.service.cargando$, { initialValue: false });

    // ── Estado local ──────────────────────────────────────────────────────────
    readonly idExpandido = signal<number | null>(null);

    // ── Computed ──────────────────────────────────────────────────────────────

    readonly totalPendientes = computed(() => this.compras().length);

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    ngOnInit(): void {
        this._cargarDatos();
    }

    private _cargarDatos(): void {
        this.service.listarPendientes()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    refrescarDatos(): void { this._cargarDatos(); }

    // ── Expandir / colapsar líneas ───────────────────────────────────────────

    toggleExpandir(idCompra: number): void {
        this.idExpandido.set(this.idExpandido() === idCompra ? null : idCompra);
    }

    estaExpandido(idCompra: number): boolean {
        return this.idExpandido() === idCompra;
    }

    /** Marca si alguna línea de la compra está al alza (informativo, ya validado en backend) */
    tieneAlza(compra: CompraAutorizacion): boolean {
        return compra.lineas.some(l =>
            l.cantidad_ajustada !== null && l.cantidad_ajustada > l.cantidad_solicitada,
        );
    }

    // ── Autorizar / rechazar ─────────────────────────────────────────────────

    confirmarAutorizar(compra: CompraAutorizacion): void {
        Swal.fire({
            title: '¿Autorizar compra?',
            html: `<strong>${this._escapar(compra.bodega)}</strong> ·
                   ${NOMBRE_ORIGEN[compra.id_tipo_origen]}
                   <br><span class="text-sm text-gray-500">
                   Volverá a estar disponible en la mesa de trabajo.</span>`,
            icon: 'question',
            input: 'textarea',
            inputPlaceholder: 'Comentario (requerido)',
            inputValidator: (value) => !value ? 'El comentario es obligatorio' : undefined,
            showCancelButton: true,
            confirmButtonColor: SWAL.successColor,
            cancelButtonColor: SWAL.cancelColor,
            confirmButtonText: 'Sí, autorizar',
            cancelButtonText: 'Cancelar',
            customClass: SWAL.customClass,
        }).then(r => {
            if (r.isConfirmed) this._gestionar(compra.id, true, r.value);
        });
    }

    confirmarRechazar(compra: CompraAutorizacion): void {
        Swal.fire({
            title: '¿Rechazar compra?',
            html: `<strong>${this._escapar(compra.bodega)}</strong> ·
                   ${NOMBRE_ORIGEN[compra.id_tipo_origen]}
                   <br><span class="text-sm text-gray-500">La compra quedará cerrada como Rechazada.</span>`,
            icon: 'warning',
            input: 'textarea',
            inputPlaceholder: 'Motivo del rechazo (requerido)',
            inputValidator: (value) => !value ? 'El comentario es obligatorio' : undefined,
            showCancelButton: true,
            confirmButtonColor: SWAL.dangerColor,
            cancelButtonColor: SWAL.cancelColor,
            confirmButtonText: 'Sí, rechazar',
            cancelButtonText: 'Cancelar',
            customClass: SWAL.customClass,
        }).then(r => {
            if (r.isConfirmed) this._gestionar(compra.id, false, r.value);
        });
    }

    private _gestionar(idCompra: number, autoriza: boolean, comentario: string): void {
        this.service.autorizar(idCompra, autoriza, comentario)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(exito => { if (exito) this.refrescarDatos(); });
    }

    // ── Helpers del template ──────────────────────────────────────────────────

    trackByCompra = (_: number, c: CompraAutorizacion) => c.id;

    getClaseOrigen(idTipoOrigen: TipoOrigenId): string {
        return CLASE_ORIGEN[idTipoOrigen] ?? 'bg-gray-100 text-gray-700';
    }

    private _escapar(texto: string): string {
        return texto
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}