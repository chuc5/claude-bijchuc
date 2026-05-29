// ============================================================================
// COMPONENTE — BANDEJA DEL ENCARGADO (Sprint 4)
// ============================================================================

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    Component, OnInit, inject,
    signal, computed, DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import {
    LucideAngularModule,
    Building2, RefreshCw, Search,
    ChevronLeft, ChevronRight,
    ClipboardCheck, CheckCircle2,
    XCircle, Eye, AlertCircle, Inbox,
    Package,
} from 'lucide-angular';

import Swal from 'sweetalert2';

import {
    FormatSolicitudes, EstadoSolicitudId,
    Paginacion, TipoProductoId,
} from '../models/solicitudes.models';
import {
    EncargadoSolicitudesService,
    BodegaEncargado, SolicitudEncargado,
    DetalleSolicitud, ParamsBandeja,
} from '../services/encargado-solicitudes.service';
import { ModalEntregarComponent } from '../modal-entregar/modal-entregar.component';
import { ModalRechazarComponent } from '../modal-rechazar/modal-rechazar.component';
import { ModalVerSolicitudComponent } from '../modal-ver-solicitud/modal-ver-solicitud.component';

const SWAL = {
    confirmColor: '#6366f1',
    dangerColor: '#ef4444',
    cancelColor: '#6b7280',
    customClass: { popup: 'rounded-lg' },
} as const;


@Component({
    selector: 'app-encargado-solicitudes',
    standalone: true,
    imports: [
        CommonModule, FormsModule,
        LucideAngularModule,
        ModalEntregarComponent,
        ModalRechazarComponent,
        ModalVerSolicitudComponent,
    ],
    templateUrl: './encargado-solicitudes.component.html',
})
export class EncargadoSolicitudesComponent implements OnInit {

    private readonly service = inject(EncargadoSolicitudesService);
    private readonly destroyRef = inject(DestroyRef);

    // ── Iconos ───────────────────────────────────────────────────────────────
    readonly Building2 = Building2;
    readonly RefreshCw = RefreshCw;
    readonly Search = Search;
    readonly ChevronLeft = ChevronLeft;
    readonly ChevronRight = ChevronRight;
    readonly ClipboardCheck = ClipboardCheck;
    readonly CheckCircle2 = CheckCircle2;
    readonly XCircle = XCircle;
    readonly Eye = Eye;
    readonly AlertCircle = AlertCircle;
    readonly Inbox = Inbox;
    readonly Package = Package;

    // ── Estado del servicio → signals ────────────────────────────────────────
    readonly bodega = toSignal(this.service.bodega$, { initialValue: null as BodegaEncargado | null });
    readonly solicitudes = toSignal(this.service.solicitudes$, { initialValue: [] as SolicitudEncargado[] });
    readonly paginacion = toSignal(this.service.paginacion$, { initialValue: null as Paginacion | null });
    readonly cargando = toSignal(this.service.cargando$, { initialValue: false });

    // ── Estado local ─────────────────────────────────────────────────────────
    readonly bodegaCargada = signal<boolean>(false);
    readonly filtroEstado = signal<number | null>(null);
    readonly filtroBusqueda = signal<string>('');
    readonly filtroFechaDesde = signal<string>('');
    readonly filtroFechaHasta = signal<string>('');
    readonly pagina = signal<number>(1);

    // ── Modales ──────────────────────────────────────────────────────────────
    readonly mostrarModalEntregar = signal<boolean>(false);
    readonly mostrarModalRechazar = signal<boolean>(false);
    readonly detalleActivo = signal<DetalleSolicitud | null>(null);
    readonly cargandoDetalle = signal<boolean>(false);

    readonly mostrarModalVer = signal<boolean>(false);

    // ── Computed ─────────────────────────────────────────────────────────────
    readonly paginas = computed<number[]>(() => {
        const p = this.paginacion();
        if (!p || p.paginas <= 1) return [];
        const ini = Math.max(1, p.pagina - 2);
        const fin = Math.min(p.paginas, p.pagina + 2);
        return Array.from({ length: fin - ini + 1 }, (_, i) => ini + i);
    });

    // Estadísticas rápidas de la bandeja actual
    readonly totalReservadas = computed(() =>
        this.solicitudes().filter(s => s.id_estado === EstadoSolicitudId.RESERVADA).length
    );

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnInit(): void {
        this.service.obtenerBodegaEncargado()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(b => {
                this.bodegaCargada.set(true);
                if (b) this._cargar();
            });
    }

    // ========================================================================
    // CARGA DE DATOS
    // ========================================================================

    private _cargar(): void {
        const params: ParamsBandeja = {
            estado: this.filtroEstado() ?? undefined,
            busqueda: this.filtroBusqueda() || undefined,
            fecha_desde: this.filtroFechaDesde() || undefined,
            fecha_hasta: this.filtroFechaHasta() || undefined,
            pagina: this.pagina(),
            por_pagina: 20,
        };
        this.service.listarSolicitudesEncargado(params)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    refrescar(): void { this._cargar(); }

    // ========================================================================
    // FILTROS
    // ========================================================================

    onEstadoChange(event: Event): void {
        const v = (event.target as HTMLSelectElement).value;
        this.filtroEstado.set(v === '' ? null : parseInt(v, 10));
        this.pagina.set(1);
        this._cargar();
    }

    onBusquedaInput(event: Event): void {
        this.filtroBusqueda.set((event.target as HTMLInputElement).value);
        this.pagina.set(1);
        this._cargar();
    }

    onFechaDesdeChange(event: Event): void {
        this.filtroFechaDesde.set((event.target as HTMLInputElement).value);
        this.pagina.set(1);
        this._cargar();
    }

    onFechaHastaChange(event: Event): void {
        this.filtroFechaHasta.set((event.target as HTMLInputElement).value);
        this.pagina.set(1);
        this._cargar();
    }

    limpiarFiltros(): void {
        this.filtroEstado.set(null);
        this.filtroBusqueda.set('');
        this.filtroFechaDesde.set('');
        this.filtroFechaHasta.set('');
        this.pagina.set(1);
        this._cargar();
    }

    irPagina(p: number): void {
        const pag = this.paginacion();
        if (!pag || p < 1 || p > pag.paginas) return;
        this.pagina.set(p);
        this._cargar();
    }

    // ========================================================================
    // ACCIONES — VER DETALLE
    // ========================================================================

    verDetalle(solicitud: SolicitudEncargado): void {
        this.cargandoDetalle.set(true);
        this.service.obtenerDetalle(solicitud.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(detalle => {
                this.cargandoDetalle.set(false);
                if (detalle) {
                    this.detalleActivo.set(detalle);
                    // Reservada → modal de entrega; el resto → solo ver
                    if (solicitud.id_estado === EstadoSolicitudId.RESERVADA) {
                        this.mostrarModalEntregar.set(true);
                    } else {
                        this.mostrarModalVer.set(true);
                    }
                }
            });
    }

    // 5. Agregar método:
    cerrarModalVer(): void {
        this.mostrarModalVer.set(false);
        this.detalleActivo.set(null);
    }

    // ========================================================================
    // ACCIONES — ENTREGAR (confirmar desde modal)
    // ========================================================================

    onConfirmarEntrega(idSolicitud: number): void {
        this.mostrarModalEntregar.set(false);
        this.service.entregarSolicitud(idSolicitud)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(exito => { if (exito) this._cargar(); });
    }

    // ========================================================================
    // ACCIONES — RECHAZAR (abre modal con motivo)
    // ========================================================================

    abrirModalRechazar(solicitud: SolicitudEncargado): void {
        this.cargandoDetalle.set(true);
        this.service.obtenerDetalle(solicitud.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(detalle => {
                this.cargandoDetalle.set(false);
                if (detalle) {
                    this.detalleActivo.set(detalle);
                    this.mostrarModalRechazar.set(true);
                }
            });
    }

    onConfirmarRechazo(payload: { idSolicitud: number; motivo: string }): void {
        this.mostrarModalRechazar.set(false);
        this.service.rechazarSolicitud(payload.idSolicitud, payload.motivo)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(exito => { if (exito) this._cargar(); });
    }

    // ========================================================================
    // CERRAR MODALES
    // ========================================================================

    cerrarModalEntregar(): void {
        this.mostrarModalEntregar.set(false);
        this.detalleActivo.set(null);
    }

    cerrarModalRechazar(): void {
        this.mostrarModalRechazar.set(false);
        this.detalleActivo.set(null);
    }

    // ========================================================================
    // HELPERS DEL TEMPLATE
    // ========================================================================

    readonly trackBySolicitud = (_: number, s: SolicitudEncargado) => s.id;

    claseEstado(id: number): string {
        return FormatSolicitudes.claseEstado(id as EstadoSolicitudId);
    }
    fecha(f: string): string { return FormatSolicitudes.fechaHora(f); }
    esReservada(id: number) { return id === EstadoSolicitudId.RESERVADA; }
}