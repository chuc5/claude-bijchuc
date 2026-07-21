// ============================================================================
// COMPONENTE — MESA DE TRABAJO
// ============================================================================
//
// Página ruteada por :id (ej. compras/mesa-trabajo/:id). Común a los 4
// flujos: agencia, área, trimestral, extraordinaria — todas llegan aquí
// una vez la compra está en estado APROBADA.
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
import { ActivatedRoute, Router } from '@angular/router';

import {
    LucideAngularModule,
    RefreshCw, Save, ArrowLeft, AlertTriangle, CheckCircle2, Info, PackageCheck,
} from 'lucide-angular';

import Swal from 'sweetalert2';

import {
    CompraDetalle,
    LineaEditable,
    ESTADO_COMPRA,
    TIPO_BODEGA,
    MENSAJES_MESA_TRABAJO,
} from '../models/mesa-trabajo.models';
import { MesaTrabajoService } from '../services/mesa-trabajo.service';

@Component({
    selector: 'app-mesa-trabajo',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule],
    templateUrl: './mesa-trabajo.component.html',
    styleUrls: ['./mesa-trabajo.component.css'],
})
export class MesaTrabajoComponent implements OnInit {

    // ── Dependencias ──────────────────────────────────────────────────────────
    private readonly service = inject(MesaTrabajoService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);

    // ── Iconos ────────────────────────────────────────────────────────────────
    readonly RefreshCw = RefreshCw;
    readonly Save = Save;
    readonly ArrowLeft = ArrowLeft;
    readonly AlertTriangle = AlertTriangle;
    readonly CheckCircle2 = CheckCircle2;
    readonly Info = Info;
    readonly PackageCheck = PackageCheck;

    readonly ESTADO_COMPRA = ESTADO_COMPRA;
    readonly TIPO_BODEGA = TIPO_BODEGA;

    // ── Estado del servicio ───────────────────────────────────────────────────
    readonly compra = toSignal(this.service.compra$, { initialValue: null as CompraDetalle | null });
    readonly cargando = toSignal(this.service.cargando$, { initialValue: false });
    readonly guardando = toSignal(this.service.guardando$, { initialValue: false });

    // ── Estado local editable ────────────────────────────────────────────────
    readonly lineasEditables = signal<LineaEditable[]>([]);
    readonly idCompra = signal<number>(0);

    // ── Computed ──────────────────────────────────────────────────────────────

    readonly puedeEditar = computed(() =>
        this.compra()?.id_estado === ESTADO_COMPRA.APROBADA,
    );

    readonly hayCambios = computed(() =>
        this.lineasEditables().some(l => l.tieneCambios),
    );

    readonly hayErrores = computed(() =>
        this.lineasEditables().some(l => l.errorCantidad !== null),
    );

    readonly totalLineas = computed(() => this.lineasEditables().length);
    readonly totalCompradas = computed(() =>
        this.lineasEditables().filter(l => l.compradoConPrecio).length,
    );

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    ngOnInit(): void {
        this.route.paramMap
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(params => {
                const id = Number(params.get('id'));
                if (id > 0) {
                    this.idCompra.set(id);
                    this._cargarCompra(id);
                }
            });
    }

    private _cargarCompra(id: number): void {
        this.service.obtenerCompra(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(exito => { if (exito) this._reconstruirLineasEditables(); });
    }

    refrescar(): void {
        this._cargarCompra(this.idCompra());
    }

    private _reconstruirLineasEditables(): void {
        const compra = this.compra();
        if (!compra) { this.lineasEditables.set([]); return; }

        this.lineasEditables.set(compra.lineas.map(l => ({
            id: l.id,
            producto: l.producto,
            unidad: l.abreviatura || l.unidad,
            tipoBodegaDestino: l.tipo_bodega_destino,
            cantidadSolicitada: l.cantidad_solicitada,
            cantidadAjustada: l.cantidad_ajustada ?? l.cantidad_solicitada,
            precioUnitario: l.precio_unitario,
            compradoConPrecio: l.comprado_con_precio,
            tieneCambios: false,
            errorCantidad: null,
        })));
    }

    // ── Edición de líneas ─────────────────────────────────────────────────────

    actualizarCantidad(index: number, event: Event): void {
        const valor = Number((event.target as HTMLInputElement).value);
        this.lineasEditables.update(lineas => {
            const copia = [...lineas];
            const linea = { ...copia[index], cantidadAjustada: valor };

            linea.errorCantidad = this._validarCantidad(linea);
            linea.tieneCambios = this._lineaTieneCambios(linea);

            copia[index] = linea;
            return copia;
        });
    }

    actualizarPrecio(index: number, event: Event): void {
        const valor = Number((event.target as HTMLInputElement).value);
        this.lineasEditables.update(lineas => {
            const copia = [...lineas];
            const linea = { ...copia[index], precioUnitario: valor > 0 ? valor : null };
            linea.tieneCambios = this._lineaTieneCambios(linea);
            copia[index] = linea;
            return copia;
        });
    }

    private _validarCantidad(linea: LineaEditable): string | null {
        if (linea.cantidadAjustada <= 0) {
            return 'La cantidad debe ser mayor a cero';
        }
        const esAlza = linea.cantidadAjustada > linea.cantidadSolicitada;
        if (esAlza && linea.tipoBodegaDestino === TIPO_BODEGA.AGENCIA) {
            return MENSAJES_MESA_TRABAJO.ERROR.CANTIDAD_AGENCIA;
        }
        return null;
    }

    private _lineaTieneCambios(linea: LineaEditable): boolean {
        const original = this.compra()?.lineas.find(l => l.id === linea.id);
        if (!original) return false;

        const cantidadOriginal = original.cantidad_ajustada ?? original.cantidad_solicitada;
        const cambioCantidad = linea.cantidadAjustada !== cantidadOriginal;
        const cambioPrecio = !original.comprado_con_precio
            && linea.precioUnitario !== null
            && linea.precioUnitario !== original.precio_unitario;

        return cambioCantidad || cambioPrecio;
    }

    // ── Guardar ───────────────────────────────────────────────────────────────

    guardar(): void {
        if (this.hayErrores()) {
            Swal.fire('Revise los datos', 'Hay líneas con cantidades inválidas para el tipo de bodega destino', 'warning');
            return;
        }

        const lineasConCambios = this.lineasEditables().filter(l => l.tieneCambios);
        if (lineasConCambios.length === 0) {
            Swal.fire('Sin cambios', MENSAJES_MESA_TRABAJO.ERROR.SIN_CAMBIOS, 'info');
            return;
        }

        const payload = {
            id_compra: this.idCompra(),
            lineas: lineasConCambios.map(l => {
                const linea: { id_linea: number; cantidad_ajustada?: number; precio_unitario?: number } = {
                    id_linea: l.id,
                };
                const original = this.compra()!.lineas.find(o => o.id === l.id)!;
                if (l.cantidadAjustada !== (original.cantidad_ajustada ?? original.cantidad_solicitada)) {
                    linea.cantidad_ajustada = l.cantidadAjustada;
                }
                if (l.precioUnitario !== null && l.precioUnitario !== original.precio_unitario) {
                    linea.precio_unitario = l.precioUnitario;
                }
                return linea;
            }),
        };

        this.service.procesarCompra(payload)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(resultado => {
                if (!resultado) return;

                if (resultado.requiere_autorizacion) {
                    Swal.fire({
                        icon: 'info',
                        title: 'Requiere autorización',
                        text: 'Un alza de cantidad envió la compra a Gerencia/Financiero. Podrá continuar cuando la autoricen.',
                    }).then(() => this.volver());
                    return;
                }

                if (resultado.altas_generadas) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Compra completada',
                        html: `Se generaron <strong>${resultado.ids_altas.length}</strong> alta(s) automáticamente.
                               El encargado de bodega ya puede recibir el ingreso físico.`,
                    }).then(() => this.volver());
                    return;
                }

                this.refrescar();
            });
    }

    volver(): void {
        this.router.navigate(['..'], { relativeTo: this.route });
    }

    // ── Helpers del template ──────────────────────────────────────────────────

    trackByLinea = (_: number, l: LineaEditable) => l.id;

    getEstadoClase(idEstado: number): string {
        const clases: Record<number, string> = {
            [ESTADO_COMPRA.APROBADA]: 'bg-blue-100 text-blue-800',
            [ESTADO_COMPRA.REQUIERE_AUTORIZACION]: 'bg-purple-100 text-purple-800',
            [ESTADO_COMPRA.COMPRADA]: 'bg-cyan-100 text-cyan-800',
            [ESTADO_COMPRA.ENVIADA]: 'bg-indigo-100 text-indigo-800',
        };
        return clases[idEstado] ?? 'bg-gray-100 text-gray-800';
    }
}