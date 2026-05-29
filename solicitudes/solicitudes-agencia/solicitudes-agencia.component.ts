// ============================================================================
// COMPONENTE — SOLICITUDES DE AGENCIA (Sprint 2 — actualizado)
// ============================================================================
//
// Cambios respecto a Sprint 1:
//   - Importa ModalCrearSolicitudComponent
//   - abrirModalSolicitar() abre el modal real
//   - cancelarSolicitud()   usa SweetAlert2 + servicio
//   - onSolicitudGuardada() refresca catálogo y solicitudes
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
    Package, PackageSearch, ClipboardList,
    RefreshCw, Search, ChevronLeft, ChevronRight,
    ShoppingCart, Building2, Clock,
    CheckCircle, XCircle, Ban, Eye,
    AlertCircle, Inbox,
} from 'lucide-angular';

import Swal from 'sweetalert2';

import {
    ProductoDisponible, Solicitud, BodegaAgencia,
    Paginacion, EstadoSolicitudId,
    FormatSolicitudes, TipoProductoId,
} from '../models/solicitudes.models';
import {
    SolicitudesService, ParamsProductos, ParamsSolicitudes,
} from '../services/solicitudes.service';
import { ModalCrearSolicitudComponent } from '../modal-crear-solicitud/modal-crear-solicitud.component';

import { ModalVerSolicitudComponent } from '../modal-ver-solicitud/modal-ver-solicitud.component';
import { DetalleSolicitud } from '../services/encargado-solicitudes.service';

// ── Configuración centralizada de SweetAlert (igual que presupuesto-general) ─
const SWAL = {
    confirmColor: '#6366f1',
    dangerColor: '#ef4444',
    cancelColor: '#6b7280',
    customClass: { popup: 'rounded-lg' },
} as const;

type TabActiva = 'catalogo' | 'solicitudes';


@Component({
    selector: 'app-solicitudes-agencia',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        LucideAngularModule,
        ModalCrearSolicitudComponent,  // ← Sprint 2
        ModalVerSolicitudComponent,
    ],
    templateUrl: './solicitudes-agencia.component.html',
    styleUrls: ['./solicitudes-agencia.component.css'],
})
export class SolicitudesAgenciaComponent implements OnInit {

    private readonly service = inject(SolicitudesService);
    private readonly destroyRef = inject(DestroyRef);

    // ── Iconos ───────────────────────────────────────────────────────────────
    readonly Package = Package;
    readonly PackageSearch = PackageSearch;
    readonly ClipboardList = ClipboardList;
    readonly RefreshCw = RefreshCw;
    readonly Search = Search;
    readonly ChevronLeft = ChevronLeft;
    readonly ChevronRight = ChevronRight;
    readonly ShoppingCart = ShoppingCart;
    readonly Building2 = Building2;
    readonly Clock = Clock;
    readonly CheckCircle = CheckCircle;
    readonly XCircle = XCircle;
    readonly Ban = Ban;
    readonly Eye = Eye;
    readonly AlertCircle = AlertCircle;
    readonly Inbox = Inbox;

    // ── Estado del servicio → signals ────────────────────────────────────────
    readonly bodegaAgencia = toSignal(this.service.bodegaAgencia$, { initialValue: null as BodegaAgencia | null });
    readonly productos = toSignal(this.service.productos$, { initialValue: [] as ProductoDisponible[] });
    readonly paginacionProd = toSignal(this.service.paginacionProductos$, { initialValue: null as Paginacion | null });
    readonly solicitudes = toSignal(this.service.solicitudes$, { initialValue: [] as Solicitud[] });
    readonly paginacionSol = toSignal(this.service.paginacionSolicitudes$, { initialValue: null as Paginacion | null });
    readonly cargando = toSignal(this.service.cargando$, { initialValue: false });
    readonly nombreBodega = toSignal(this.service.nombreBodegaActual$, { initialValue: '' });

    // ── Estado local ─────────────────────────────────────────────────────────
    readonly tabActiva = signal<TabActiva>('catalogo');
    readonly busquedaTexto = signal<string>('');
    readonly paginaProductos = signal<number>(1);
    readonly filtroEstado = signal<number | null>(null);
    readonly paginaSolicitudes = signal<number>(1);
    readonly bodegaCargada = signal<boolean>(false);

    readonly mostrarModalVer = signal<boolean>(false);
    readonly detalleVer = signal<DetalleSolicitud | null>(null);
    readonly cargandoDetalle = signal<boolean>(false);

    // ── Modal crear solicitud (Sprint 2) ─────────────────────────────────────
    readonly mostrarModalSolicitar = signal<boolean>(false);
    readonly productoSeleccionado = signal<ProductoDisponible | null>(null);

    // ── Computed: paginadores ────────────────────────────────────────────────
    readonly pagsCatalogo = computed<number[]>(() => {
        const p = this.paginacionProd();
        return p && p.paginas > 1 ? this._calcularPaginas(p.pagina, p.paginas) : [];
    });

    readonly pagsSolicitudes = computed<number[]>(() => {
        const p = this.paginacionSol();
        return p && p.paginas > 1 ? this._calcularPaginas(p.pagina, p.paginas) : [];
    });

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnInit(): void {
        this._cargarBodegaYCatalogo();
        this._cargarMisSolicitudes();
    }

    // ========================================================================
    // CARGA DE DATOS
    // ========================================================================

    private _cargarBodegaYCatalogo(): void {
        this.service.obtenerBodegaAgencia()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(bodega => {
                this.bodegaCargada.set(true);
                if (bodega) this._cargarCatalogo(bodega.id);
            });
    }

    private _cargarCatalogo(idBodega: number): void {
        const params: ParamsProductos = {
            busqueda: this.busquedaTexto() || undefined,
            pagina: this.paginaProductos(),
            por_pagina: 20,
        };
        this.service.listarProductosDisponibles(idBodega, params)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    private _cargarMisSolicitudes(idBodega?: number): void {
        const params: ParamsSolicitudes = {
            id_bodega: idBodega,
            estado: this.filtroEstado() ?? undefined,
            pagina: this.paginaSolicitudes(),
            por_pagina: 20,
        };
        this.service.listarMisSolicitudes(params)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    refrescar(): void {
        const b = this.bodegaAgencia();
        if (b) {
            this._cargarCatalogo(b.id);
            this._cargarMisSolicitudes(b.id);
        }
    }

    // ========================================================================
    // TABS
    // ========================================================================

    cambiarTab(tab: TabActiva): void {
        if (this.tabActiva() === tab) return;
        this.tabActiva.set(tab);
        if (tab === 'solicitudes') {
            const b = this.bodegaAgencia();
            this._cargarMisSolicitudes(b?.id);
        }
    }

    // ========================================================================
    // CATÁLOGO — FILTROS Y PAGINACIÓN
    // ========================================================================

    onBusquedaInput(event: Event): void {
        this.busquedaTexto.set((event.target as HTMLInputElement).value);
        this.paginaProductos.set(1);
        const b = this.bodegaAgencia();
        if (b) this._cargarCatalogo(b.id);
    }

    limpiarBusqueda(): void {
        this.busquedaTexto.set('');
        this.paginaProductos.set(1);
        const b = this.bodegaAgencia();
        if (b) this._cargarCatalogo(b.id);
    }

    irPaginaProductos(pagina: number): void {
        const p = this.paginacionProd();
        if (!p || pagina < 1 || pagina > p.paginas) return;
        this.paginaProductos.set(pagina);
        const b = this.bodegaAgencia();
        if (b) this._cargarCatalogo(b.id);
    }

    // ========================================================================
    // MIS SOLICITUDES — FILTROS Y PAGINACIÓN
    // ========================================================================

    onFiltroEstadoChange(event: Event): void {
        const valor = (event.target as HTMLSelectElement).value;
        this.filtroEstado.set(valor === '' ? null : parseInt(valor, 10));
        this.paginaSolicitudes.set(1);
        const b = this.bodegaAgencia();
        this._cargarMisSolicitudes(b?.id);
    }

    irPaginaSolicitudes(pagina: number): void {
        const p = this.paginacionSol();
        if (!p || pagina < 1 || pagina > p.paginas) return;
        this.paginaSolicitudes.set(pagina);
        const b = this.bodegaAgencia();
        this._cargarMisSolicitudes(b?.id);
    }

    // ========================================================================
    // MODAL CREAR SOLICITUD (Sprint 2)
    // ========================================================================

    abrirModalSolicitar(producto: ProductoDisponible): void {
        this.productoSeleccionado.set(producto);
        this.mostrarModalSolicitar.set(true);
    }

    cerrarModalSolicitar(): void {
        this.mostrarModalSolicitar.set(false);
        this.productoSeleccionado.set(null);
    }

    /** Se llama cuando el modal confirma la solicitud exitosamente */
    onSolicitudGuardada(): void {
        this.cerrarModalSolicitar();
        // Refrescar catálogo (disponibilidad baja) y mis solicitudes (aparece la nueva)
        const b = this.bodegaAgencia();
        if (b) {
            this._cargarCatalogo(b.id);
            this._cargarMisSolicitudes(b.id);
        }
        // Si el usuario estaba en el catálogo, llevarlo a "Mis solicitudes"
        if (this.tabActiva() === 'catalogo') {
            this.tabActiva.set('solicitudes');
        }
    }

    // ========================================================================
    // CANCELAR SOLICITUD (Sprint 2)
    // ========================================================================

    cancelarSolicitud(solicitud: Solicitud): void {
        Swal.fire({
            title: '¿Cancelar solicitud?',
            html: `Solicitud <strong>#${solicitud.id}</strong> en <strong>${solicitud.bodega}</strong>.<br>
                   <span class="text-sm text-gray-500">La reserva de stock se liberará inmediatamente.</span>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: SWAL.dangerColor,
            cancelButtonColor: SWAL.cancelColor,
            confirmButtonText: 'Sí, cancelar',
            cancelButtonText: 'No, conservar',
            customClass: SWAL.customClass,
        }).then(result => {
            if (!result.isConfirmed) return;

            this.service.cancelarSolicitud(solicitud.id)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(exito => {
                    if (exito) {
                        const b = this.bodegaAgencia();
                        if (b) {
                            this._cargarCatalogo(b.id);
                            this._cargarMisSolicitudes(b.id);
                        }
                    }
                });
        });
    }

    // ========================================================================
    // VER DETALLE (Sprint 5)
    // ========================================================================

    verDetalle(solicitud: Solicitud): void {
        this.cargandoDetalle.set(true);
        this.service.obtenerDetalleSolicitud(solicitud.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(detalle => {
                this.cargandoDetalle.set(false);
                if (detalle) {
                    this.detalleVer.set(detalle);
                    this.mostrarModalVer.set(true);
                }
            });
    }

    // 5. Agregar método:
    cerrarModalVer(): void {
        this.mostrarModalVer.set(false);
        this.detalleVer.set(null);
    }
    // ========================================================================
    // HELPERS DEL TEMPLATE
    // ========================================================================

    readonly trackByProducto = (_: number, p: ProductoDisponible) => p.id;
    readonly trackBySolicitud = (_: number, s: Solicitud) => s.id;

    claseTipo(idTipo: TipoProductoId) { return FormatSolicitudes.claseTipoProducto(idTipo); }
    claseDisponible(c: number | string) { return FormatSolicitudes.claseDisponibilidad(c); }
    claseEstado(id: EstadoSolicitudId) { return FormatSolicitudes.claseEstado(id); }
    cantidadNum(v: number | string): number { return FormatSolicitudes.cantidad(v); }
    fecha(f: string): string { return FormatSolicitudes.fechaHora(f); }
    minVal(a: number, b: number): number { return Math.min(a, b); }

    puedeCancelar(s: Solicitud): boolean { return s.id_estado === EstadoSolicitudId.RESERVADA; }

    private _calcularPaginas(actual: number, total: number): number[] {
        const inicio = Math.max(1, actual - 2);
        const fin = Math.min(total, actual + 2);
        return Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i);
    }
}