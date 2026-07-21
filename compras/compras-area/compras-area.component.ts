// ============================================================================
// COMPONENTE — COMPRAS ÁREA (bandeja del encargado de bodega de área)
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
import { Router } from '@angular/router';

import {
    LucideAngularModule,
    RefreshCw, Plus, Filter, ShoppingCart, Info, Check, X, Eye,
} from 'lucide-angular';

import Swal from 'sweetalert2';

import { Compra, ESTADO_COMPRA, EstadoCompraId } from '../models/compras-area.models';
import { ComprasAreaService } from '../services/compras-area.service';
import { ModalCrearSolicitudAreaComponent } from './modal-crear-solicitud-area/modal-crear-solicitud-area.component';

const SWAL = {
    dangerColor: '#ef4444',
    successColor: '#10b981',
    cancelColor: '#6b7280',
    customClass: { popup: 'rounded-lg' },
} as const;

const CLASE_ESTADO: Record<EstadoCompraId, string> = {
    [ESTADO_COMPRA.SOLICITADA]: 'bg-amber-100 text-amber-800',
    [ESTADO_COMPRA.APROBADA]: 'bg-blue-100 text-blue-800',
    [ESTADO_COMPRA.RECHAZADA]: 'bg-red-100 text-red-800',
    [ESTADO_COMPRA.REQUIERE_AUTORIZACION]: 'bg-purple-100 text-purple-800',
    [ESTADO_COMPRA.COMPRADA]: 'bg-cyan-100 text-cyan-800',
    [ESTADO_COMPRA.ENVIADA]: 'bg-indigo-100 text-indigo-800',
    [ESTADO_COMPRA.REGISTRADA]: 'bg-green-100 text-green-800',
    [ESTADO_COMPRA.CANCELADA]: 'bg-gray-100 text-gray-800',
};

@Component({
    selector: 'app-compras-area',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        LucideAngularModule,
        ModalCrearSolicitudAreaComponent,
    ],
    templateUrl: './compras-area.component.html',
    styleUrls: ['./compras-area.component.css'],
})
export class ComprasAreaComponent implements OnInit {

    // ── Dependencias ──────────────────────────────────────────────────────────
    private readonly service = inject(ComprasAreaService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly router = inject(Router);

    // ── Iconos ────────────────────────────────────────────────────────────────
    readonly RefreshCw = RefreshCw;
    readonly Plus = Plus;
    readonly Filter = Filter;
    readonly ShoppingCart = ShoppingCart;
    readonly Info = Info;
    readonly Check = Check;
    readonly X = X;
    readonly Eye = Eye;

    readonly ESTADO_COMPRA = ESTADO_COMPRA;
    readonly opcionesEstado = [
        { id: ESTADO_COMPRA.SOLICITADA, nombre: 'Solicitada' },
        { id: ESTADO_COMPRA.APROBADA, nombre: 'Aprobada' },
        { id: ESTADO_COMPRA.RECHAZADA, nombre: 'Rechazada' },
        { id: ESTADO_COMPRA.REQUIERE_AUTORIZACION, nombre: 'Requiere Autorización' },
        { id: ESTADO_COMPRA.COMPRADA, nombre: 'Comprado' },
        { id: ESTADO_COMPRA.ENVIADA, nombre: 'Enviado' },
        { id: ESTADO_COMPRA.REGISTRADA, nombre: 'Registrado' },
        { id: ESTADO_COMPRA.CANCELADA, nombre: 'Cancelada' },
    ];

    // ── Estado del servicio ───────────────────────────────────────────────────
    readonly compras = toSignal(this.service.compras$, { initialValue: [] as Compra[] });
    readonly cargando = toSignal(this.service.cargando$, { initialValue: false });

    // ── Filtros ───────────────────────────────────────────────────────────────
    readonly filtroTexto = signal<string>('');
    readonly filtroEstado = signal<EstadoCompraId | null>(null);

    // ── Modal ─────────────────────────────────────────────────────────────────
    readonly mostrarModal = signal<boolean>(false);

    // ── Computed ──────────────────────────────────────────────────────────────

    readonly totalCompras = computed(() => this.compras().length);
    readonly totalSolicitadas = computed(() =>
        this.compras().filter(c => c.id_estado === ESTADO_COMPRA.SOLICITADA).length,
    );

    readonly hayFiltrosActivos = computed(() =>
        !!this.filtroTexto() || this.filtroEstado() !== null,
    );

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    ngOnInit(): void {
        this._cargarDatos();
    }

    private _cargarDatos(): void {
        this.service.listarBandeja({
            busqueda: this.filtroTexto() || undefined,
            id_estado: this.filtroEstado(),
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    refrescarDatos(): void { this._cargarDatos(); }

    // ── Filtros ───────────────────────────────────────────────────────────────

    actualizarFiltroTexto(event: Event): void {
        this.filtroTexto.set((event.target as HTMLInputElement).value);
        this._cargarDatos();
    }

    actualizarFiltroEstado(event: Event): void {
        const val = (event.target as HTMLSelectElement).value;
        this.filtroEstado.set(val ? (Number(val) as EstadoCompraId) : null);
        this._cargarDatos();
    }

    limpiarFiltros(): void {
        this.filtroTexto.set('');
        this.filtroEstado.set(null);
        this._cargarDatos();
    }

    // ── Gestión (aprobar / rechazar) ────────────────────────────────────────────

    confirmarAprobar(compra: Compra): void {
        Swal.fire({
            title: '¿Aprobar solicitud?',
            html: `Se aprobarán las <strong>${compra.total_lineas}</strong> línea(s) solicitadas
                   para <strong>${this._escapar(compra.bodega)}</strong>.`,
            icon: 'question',
            input: 'textarea',
            inputPlaceholder: 'Comentario (opcional)',
            showCancelButton: true,
            confirmButtonColor: SWAL.successColor,
            cancelButtonColor: SWAL.cancelColor,
            confirmButtonText: 'Sí, aprobar',
            cancelButtonText: 'Cancelar',
            customClass: SWAL.customClass,
        }).then(r => {
            if (r.isConfirmed) this._gestionar(compra.id, true, r.value ?? '');
        });
    }

    confirmarRechazar(compra: Compra): void {
        Swal.fire({
            title: '¿Rechazar solicitud?',
            html: `Solicitud para <strong>${this._escapar(compra.bodega)}</strong>.`,
            icon: 'warning',
            input: 'textarea',
            inputPlaceholder: 'Motivo del rechazo (requerido)',
            inputValidator: (value) => !value ? 'El comentario es obligatorio al rechazar' : undefined,
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

    private _gestionar(idCompra: number, aprueba: boolean, comentario: string): void {
        this.service.gestionarSolicitud(idCompra, aprueba, comentario)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(exito => { if (exito) this.refrescarDatos(); });
    }

    puedeGestionar(compra: Compra): boolean {
        return compra.id_estado === ESTADO_COMPRA.SOLICITADA;
    }

    /** En Área, al completar precio en la mesa de trabajo se auto-envía: Comprado ya no tiene nada que hacer aquí. */
    puedeVerMesaTrabajo(compra: Compra): boolean {
        const estadosConMesaTrabajo: EstadoCompraId[] = [
            ESTADO_COMPRA.APROBADA,
            ESTADO_COMPRA.REQUIERE_AUTORIZACION,
        ];
        return estadosConMesaTrabajo.includes(compra.id_estado);
    }

    /** Ajusta la ruta al path real donde montes MesaTrabajoComponent */
    irAMesaTrabajo(compra: Compra): void {
        this.router.navigate(['/inventario/compras/mesa-trabajo', compra.id]);
    }

    // ── Modal ─────────────────────────────────────────────────────────────────

    abrirModalCrear(): void {
        this.mostrarModal.set(true);
    }

    cerrarModal(): void {
        this.mostrarModal.set(false);
    }

    onSolicitudCreada(): void {
        this.cerrarModal();
        this.refrescarDatos();
    }

    // ── Helpers del template ──────────────────────────────────────────────────

    trackByCompra = (_: number, c: Compra) => c.id;

    getEstadoClase(idEstado: EstadoCompraId): string {
        return CLASE_ESTADO[idEstado] ?? 'bg-gray-100 text-gray-800';
    }

    private _escapar(texto: string): string {
        return texto
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}