// =============================================================================
// COMPONENTE — SOLICITUDES DE ÁREA (Sprint 3)
// solicitudes-area.component.ts
// =============================================================================
//
// Dos vistas en el mismo componente:
//   'bodegas'  → grid de bodegas de área disponibles
//   'catalogo' → catálogo + mis solicitudes de la bodega seleccionada
//
// Reutiliza SolicitudesService y ModalCrearSolicitudComponent de Sprint 1-2.
// =============================================================================

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    Component, OnInit, inject,
    signal, computed, DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import {
    LucideAngularModule,
    Warehouse, Package, PackageSearch, ClipboardList,
    RefreshCw, Search, ChevronLeft, ChevronRight,
    ShoppingCart, ArrowLeft, Lock, Unlock,
    Ban, Eye, XCircle, Inbox, AlertCircle,
    CheckCircle,
} from 'lucide-angular';

import Swal from 'sweetalert2';

import {
    BodegaArea, ProductoDisponible, Solicitud,
    Paginacion, EstadoSolicitudId,
    FormatSolicitudes, TipoProductoId,
} from '../models/solicitudes.models';
import {
    SolicitudesService, ParamsProductos, ParamsSolicitudes,
} from '../services/solicitudes.service';
import { ModalCrearSolicitudComponent } from '../modal-crear-solicitud/modal-crear-solicitud.component';

const SWAL = {
    dangerColor: '#ef4444', cancelColor: '#6b7280',
    customClass: { popup: 'rounded-lg' },
} as const;

type Vista = 'bodegas' | 'catalogo';
type TabActiva = 'catalogo' | 'solicitudes';


@Component({
    selector: 'app-solicitudes-area',
    standalone: true,
    imports: [
        CommonModule, FormsModule, LucideAngularModule,
        ModalCrearSolicitudComponent,
    ],
    templateUrl: './solicitudes-area.component.html',
})
export class SolicitudesAreaComponent implements OnInit {

    private readonly service = inject(SolicitudesService);
    private readonly destroyRef = inject(DestroyRef);

    // ── Iconos ───────────────────────────────────────────────────────────────
    readonly Warehouse = Warehouse;
    readonly Package = Package;
    readonly PackageSearch = PackageSearch;
    readonly ClipboardList = ClipboardList;
    readonly RefreshCw = RefreshCw;
    readonly Search = Search;
    readonly ChevronLeft = ChevronLeft;
    readonly ChevronRight = ChevronRight;
    readonly ShoppingCart = ShoppingCart;
    readonly ArrowLeft = ArrowLeft;
    readonly Lock = Lock;
    readonly Unlock = Unlock;
    readonly Ban = Ban;
    readonly Eye = Eye;
    readonly XCircle = XCircle;
    readonly Inbox = Inbox;
    readonly AlertCircle = AlertCircle;
    readonly CheckCircle = CheckCircle;

    // ── Estado del servicio ──────────────────────────────────────────────────
    readonly bodegasArea = toSignal(this.service.bodegasArea$, { initialValue: [] as BodegaArea[] });
    readonly productos = toSignal(this.service.productos$, { initialValue: [] as ProductoDisponible[] });
    readonly paginacionProd = toSignal(this.service.paginacionProductos$, { initialValue: null as Paginacion | null });
    readonly solicitudes = toSignal(this.service.solicitudes$, { initialValue: [] as Solicitud[] });
    readonly paginacionSol = toSignal(this.service.paginacionSolicitudes$, { initialValue: null as Paginacion | null });
    readonly cargando = toSignal(this.service.cargando$, { initialValue: false });
    readonly nombreBodega = toSignal(this.service.nombreBodegaActual$, { initialValue: '' });

    // ── Estado local ─────────────────────────────────────────────────────────
    readonly vista = signal<Vista>('bodegas');
    readonly tabActiva = signal<TabActiva>('catalogo');
    readonly bodegaSeleccionada = signal<BodegaArea | null>(null);
    readonly bodegasCargadas = signal<boolean>(false);
    readonly busquedaTexto = signal<string>('');
    readonly paginaProductos = signal<number>(1);
    readonly filtroEstado = signal<number | null>(null);
    readonly paginaSolicitudes = signal<number>(1);
    readonly mostrarModalSolicitar = signal<boolean>(false);
    readonly productoSeleccionado = signal<ProductoDisponible | null>(null);

    // ── Computed ─────────────────────────────────────────────────────────────
    readonly bodegasConAcceso = computed(() =>
        this.bodegasArea().filter(b => b.tiene_acceso)
    );

    readonly pagsCatalogo = computed<number[]>(() => {
        const p = this.paginacionProd();
        return p && p.paginas > 1 ? this._pags(p.pagina, p.paginas) : [];
    });

    readonly pagsSolicitudes = computed<number[]>(() => {
        const p = this.paginacionSol();
        return p && p.paginas > 1 ? this._pags(p.pagina, p.paginas) : [];
    });

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnInit(): void {
        this.service.listarBodegasArea()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.bodegasCargadas.set(true));
    }

    // ========================================================================
    // SELECCIÓN DE BODEGA
    // ========================================================================

    seleccionarBodega(bodega: BodegaArea): void {
        if (!bodega.tiene_acceso) return;
        this.bodegaSeleccionada.set(bodega);
        this.vista.set('catalogo');
        this.tabActiva.set('catalogo');
        this.busquedaTexto.set('');
        this.paginaProductos.set(1);
        this._cargarCatalogo(bodega.id);
        this._cargarMisSolicitudes(bodega.id);
    }

    volverABodegas(): void {
        this.vista.set('bodegas');
        this.bodegaSeleccionada.set(null);
    }

    refrescar(): void {
        if (this.vista() === 'bodegas') {
            this.service.listarBodegasArea()
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe();
        } else {
            const b = this.bodegaSeleccionada();
            if (b) {
                this._cargarCatalogo(b.id);
                this._cargarMisSolicitudes(b.id);
            }
        }
    }

    // ========================================================================
    // CATÁLOGO
    // ========================================================================

    private _cargarCatalogo(idBodega: number): void {
        this.service.listarProductosDisponibles(idBodega, {
            busqueda: this.busquedaTexto() || undefined,
            pagina: this.paginaProductos(),
            por_pagina: 20,
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }

    private _cargarMisSolicitudes(idBodega: number): void {
        this.service.listarMisSolicitudes({
            id_bodega: idBodega,
            estado: this.filtroEstado() ?? undefined,
            pagina: this.paginaSolicitudes(),
            por_pagina: 20,
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }

    cambiarTab(tab: TabActiva): void {
        if (this.tabActiva() === tab) return;
        this.tabActiva.set(tab);
        if (tab === 'solicitudes') {
            const b = this.bodegaSeleccionada();
            if (b) this._cargarMisSolicitudes(b.id);
        }
    }

    onBusquedaInput(e: Event): void {
        this.busquedaTexto.set((e.target as HTMLInputElement).value);
        this.paginaProductos.set(1);
        const b = this.bodegaSeleccionada();
        if (b) this._cargarCatalogo(b.id);
    }

    limpiarBusqueda(): void {
        this.busquedaTexto.set('');
        this.paginaProductos.set(1);
        const b = this.bodegaSeleccionada();
        if (b) this._cargarCatalogo(b.id);
    }

    irPaginaProductos(pagina: number): void {
        const p = this.paginacionProd();
        if (!p || pagina < 1 || pagina > p.paginas) return;
        this.paginaProductos.set(pagina);
        const b = this.bodegaSeleccionada();
        if (b) this._cargarCatalogo(b.id);
    }

    onFiltroEstadoChange(e: Event): void {
        const v = (e.target as HTMLSelectElement).value;
        this.filtroEstado.set(v === '' ? null : parseInt(v, 10));
        this.paginaSolicitudes.set(1);
        const b = this.bodegaSeleccionada();
        if (b) this._cargarMisSolicitudes(b.id);
    }

    irPaginaSolicitudes(pagina: number): void {
        const p = this.paginacionSol();
        if (!p || pagina < 1 || pagina > p.paginas) return;
        this.paginaSolicitudes.set(pagina);
        const b = this.bodegaSeleccionada();
        if (b) this._cargarMisSolicitudes(b.id);
    }

    // ========================================================================
    // MODAL SOLICITAR
    // ========================================================================

    abrirModalSolicitar(producto: ProductoDisponible): void {
        this.productoSeleccionado.set(producto);
        this.mostrarModalSolicitar.set(true);
    }

    cerrarModalSolicitar(): void {
        this.mostrarModalSolicitar.set(false);
        this.productoSeleccionado.set(null);
    }

    onSolicitudGuardada(): void {
        this.cerrarModalSolicitar();
        const b = this.bodegaSeleccionada();
        if (b) { this._cargarCatalogo(b.id); this._cargarMisSolicitudes(b.id); }
        this.tabActiva.set('solicitudes');
    }

    // ========================================================================
    // CANCELAR
    // ========================================================================

    cancelarSolicitud(solicitud: Solicitud): void {
        Swal.fire({
            title: '¿Cancelar solicitud?',
            html: `Solicitud <strong>#${solicitud.id}</strong>.<br>
                   <span class="text-sm text-gray-500">La reserva de stock se liberará.</span>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: SWAL.dangerColor,
            cancelButtonColor: SWAL.cancelColor,
            confirmButtonText: 'Sí, cancelar',
            cancelButtonText: 'No',
            customClass: SWAL.customClass,
        }).then(r => {
            if (!r.isConfirmed) return;
            this.service.cancelarSolicitud(solicitud.id)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(ok => {
                    if (ok) {
                        const b = this.bodegaSeleccionada();
                        if (b) { this._cargarCatalogo(b.id); this._cargarMisSolicitudes(b.id); }
                    }
                });
        });
    }

    verDetalle(solicitud: Solicitud): void {
        console.log('Ver detalle solicitud:', solicitud.id); // TODO Sprint 5
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    readonly trackByBodega = (_: number, b: BodegaArea) => b.id;
    readonly trackByProducto = (_: number, p: ProductoDisponible) => p.id;
    readonly trackBySolicitud = (_: number, s: Solicitud) => s.id;

    claseTipo(id: TipoProductoId) { return FormatSolicitudes.claseTipoProducto(id); }
    claseDisponible(c: number | string) { return FormatSolicitudes.claseDisponibilidad(c); }
    claseEstado(id: EstadoSolicitudId) { return FormatSolicitudes.claseEstado(id); }
    cantidadNum(v: number | string) { return FormatSolicitudes.cantidad(v); }
    fecha(f: string) { return FormatSolicitudes.fechaHora(f); }
    puedeCancelar(s: Solicitud) { return s.id_estado === EstadoSolicitudId.RESERVADA; }

    private _pags(actual: number, total: number): number[] {
        const ini = Math.max(1, actual - 2);
        const fin = Math.min(total, actual + 2);
        return Array.from({ length: fin - ini + 1 }, (_, i) => ini + i);
    }
}