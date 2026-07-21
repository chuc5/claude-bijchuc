// ============================================================================
// MODAL — CREAR SOLICITUD DE COMPRA (Agencia)
// ============================================================================
//
// La bodega se resuelve sola (obtenerBodegaAgencia — la del encargado en
// sesión), igual que hace CompraAgenciaService::validarBodegaYEncargado en
// el backend: no tiene sentido pedir al usuario que elija una bodega
// distinta a la suya.
//
// Líneas dinámicas: cada fila es producto + unidad (dependiente del
// producto) + cantidad + justificación opcional.
// ============================================================================

import { CommonModule } from '@angular/common';
import {
    Component,
    Output,
    EventEmitter,
    OnInit,
    inject,
    signal,
    computed,
    DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    FormBuilder,
    FormGroup,
    FormArray,
    Validators,
    ReactiveFormsModule,
} from '@angular/forms';

import { LucideAngularModule, X, Save, AlertCircle, Plus, Trash2 } from 'lucide-angular';
import { NgSelectModule } from '@ng-select/ng-select';
import { overlayAnimation, modalAnimation } from '../../../../animations/modal.animations';

import { ProductoCatalogo, CompraFormAgencia, UnidadProducto } from '../../models/compras-agencia.models';
import { TIPO_CONTROL_PRODUCTO } from '../../models/producto-catalogo.models';
import { ComprasAgenciaService } from '../../services/compras-agencia.service';
import { BuscadorProductoComponent } from '../../buscador-producto/buscador-producto.component';

@Component({
    selector: 'app-modal-crear-solicitud-agencia',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        LucideAngularModule,
        NgSelectModule,
        BuscadorProductoComponent,
    ],
    templateUrl: './modal-crear-solicitud-agencia.component.html',
    styleUrls: ['./modal-crear-solicitud-agencia.component.css'],
    animations: [overlayAnimation, modalAnimation],
})
export class ModalCrearSolicitudAgenciaComponent implements OnInit {

    private readonly fb = inject(FormBuilder);
    private readonly service = inject(ComprasAgenciaService);
    private readonly destroyRef = inject(DestroyRef);

    // ── Outputs ───────────────────────────────────────────────────────────────
    @Output() cerrar = new EventEmitter<void>();
    @Output() creada = new EventEmitter<void>();

    // ── Iconos ────────────────────────────────────────────────────────────────
    readonly X = X;
    readonly Save = Save;
    readonly AlertCircle = AlertCircle;
    readonly Plus = Plus;
    readonly Trash2 = Trash2;

    readonly TIPO_CONTROL_PRODUCTO = TIPO_CONTROL_PRODUCTO;

    // ── Estado local ──────────────────────────────────────────────────────────
    readonly guardando = signal<boolean>(false);
    readonly cargandoBodega = signal<boolean>(true);
    readonly cargandoProductos = signal<boolean>(true);
    readonly error = signal<string | null>(null);
    readonly productos = signal<ProductoCatalogo[]>([]);
    readonly bodega = signal<{ id: number; nombre: string } | null>(null);

    form!: FormGroup;

    // ── Computed ──────────────────────────────────────────────────────────────

    get lineas(): FormArray {
        return this.form.get('lineas') as FormArray;
    }

    readonly cargandoDatos = computed(() => this.cargandoBodega() || this.cargandoProductos());
    readonly puedeGuardar = computed(() => !!this.bodega() && !this.cargandoDatos());

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    ngOnInit(): void {
        this._inicializarFormulario();
        this._cargarDatosIniciales();
    }

    private _inicializarFormulario(): void {
        this.form = this.fb.group({
            lineas: this.fb.array([this._crearLinea()]),
        });
    }

    private _cargarDatosIniciales(): void {
        // Bodega y catálogo son independientes entre sí — se cargan en paralelo,
        // no hace falta esperar la bodega para pedir el catálogo.
        this.service.obtenerMiBodegaAgencia()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(bodega => {
                this.cargandoBodega.set(false);
                if (!bodega) {
                    this.error.set('No se pudo determinar su bodega de agencia asignada');
                    return;
                }
                this.bodega.set(bodega);
            });

        this.service.cargarProductosDisponibles()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.cargandoProductos.set(false));

        this.service.productos$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(productos => this.productos.set(productos));
    }

    // ── Líneas dinámicas ──────────────────────────────────────────────────────

    private _crearLinea(): FormGroup {
        return this.fb.group({
            id_producto: [null, [Validators.required]],
            id_unidad: [{ value: null, disabled: true }, [Validators.required]],
            cantidad: [null, [Validators.required, Validators.min(0.01)]],
            justificacion: [''],
            // Opcionales — solo aplican si el producto es tipo Correlativo
            serie: [''],
            resolucion: [''],
            fecha_resolucion: [''],
            correlativo_inicial: [null],
            correlativo_final: [null],
        });
    }

    agregarLinea(): void {
        this.lineas.push(this._crearLinea());
    }

    quitarLinea(index: number): void {
        if (this.lineas.length > 1) {
            this.lineas.removeAt(index);
        }
    }

    /** Unidades disponibles para el producto seleccionado en esa línea */
    unidadesDeLinea(index: number): UnidadProducto[] {
        const idProducto = this.lineas.at(index).get('id_producto')?.value;
        return this.productos().find(p => p.id === idProducto)?.unidades ?? [];
    }

    /** true si el producto seleccionado en esa línea es de control Correlativo (id_tipo=1) */
    esCorrelativo(index: number): boolean {
        const idProducto = this.lineas.at(index).get('id_producto')?.value;
        return this.productos().find(p => p.id === idProducto)?.id_tipo === TIPO_CONTROL_PRODUCTO.CORRELATIVO;
    }

    /** Emitido por app-buscador-producto al elegir un producto de la lista */
    onProductoSeleccionado(index: number, producto: ProductoCatalogo): void {
        const grupo = this.lineas.at(index);
        const ctrlProducto = grupo.get('id_producto');
        const ctrlUnidad = grupo.get('id_unidad');

        ctrlProducto?.setValue(producto.id);
        ctrlProducto?.markAsDirty();
        ctrlProducto?.markAsTouched();

        if (producto.unidades.length > 0) {
            ctrlUnidad?.enable();
            const porDefecto = producto.unidades.find(u => u.es_default) ?? producto.unidades[0];
            ctrlUnidad?.setValue(porDefecto.id);
        } else {
            ctrlUnidad?.reset();
            ctrlUnidad?.disable();
        }

        // Si el producto nuevo ya no es Correlativo, limpiar cualquier dato que quedara cargado.
        if (producto.id_tipo !== TIPO_CONTROL_PRODUCTO.CORRELATIVO) {
            grupo.patchValue({
                serie: '', resolucion: '', fecha_resolucion: '',
                correlativo_inicial: null, correlativo_final: null,
            });
        }
    }

    // ── Guardar ───────────────────────────────────────────────────────────────

    guardar(): void {
        if (this.form.invalid || !this.bodega()) {
            this.form.markAllAsTouched();
            return;
        }

        this.guardando.set(true);
        this.error.set(null);

        const payload: CompraFormAgencia = {
            id_bodega: this.bodega()!.id,
            lineas: this.lineas.getRawValue().map((l: any, i: number) => ({
                id_producto: Number(l.id_producto),
                id_unidad: Number(l.id_unidad),
                cantidad: Number(l.cantidad),
                justificacion: l.justificacion?.trim() || null,
                ...(this.esCorrelativo(i) ? {
                    serie: l.serie?.trim() || null,
                    resolucion: l.resolucion?.trim() || null,
                    fecha_resolucion: l.fecha_resolucion || null,
                    correlativo_inicial: l.correlativo_inicial ? Number(l.correlativo_inicial) : null,
                    correlativo_final: l.correlativo_final ? Number(l.correlativo_final) : null,
                } : {}),
            })),
        };

        this.service.crearSolicitud(payload)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: exito => {
                    if (exito) { this.creada.emit(); }
                    this.guardando.set(false);
                },
                error: () => {
                    this.error.set('Ocurrió un error al registrar la solicitud');
                    this.guardando.set(false);
                },
            });
    }

    cerrarModal(): void {
        if (!this.guardando()) { this.cerrar.emit(); }
    }

    // ── Helpers de validación ─────────────────────────────────────────────────

    esInvalido(index: number, campo: string): boolean {
        const control = this.lineas.at(index).get(campo);
        return !!(control?.invalid && (control.dirty || control.touched));
    }

    // ── Computed del template ─────────────────────────────────────────────────

    get textoBoton(): string {
        return this.guardando() ? 'Enviando...' : 'Enviar solicitud';
    }
}