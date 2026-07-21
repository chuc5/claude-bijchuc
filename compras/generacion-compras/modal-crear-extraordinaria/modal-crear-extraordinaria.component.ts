// ============================================================================
// MODAL — CREAR COMPRA EXTRAORDINARIA
// ============================================================================
//
// A diferencia de Agencia/Área, aquí el Administrador elige libremente
// CUALQUIER bodega activa (no está limitado a la suya ni a una matriz de
// acceso) — coherente con CompraExtraordinariaService::crearOrden, que
// solo exige que la bodega exista y esté activa.
// ============================================================================

import { CommonModule } from '@angular/common';
import {
    Component,
    Output,
    EventEmitter,
    OnInit,
    inject,
    signal,
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

import {
    BodegaOpcion,
    ProductoCatalogo,
    CompraFormExtraordinaria,
    UnidadProducto,
} from '../../models/compras-generacion.models';
import { TIPO_CONTROL_PRODUCTO } from '../../models/producto-catalogo.models';
import { ComprasGeneracionService } from '../../services/compras-generacion.service';
import { BuscadorProductoComponent } from '../../buscador-producto/buscador-producto.component';

@Component({
    selector: 'app-modal-crear-extraordinaria',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        LucideAngularModule,
        NgSelectModule,
        BuscadorProductoComponent,
    ],
    templateUrl: './modal-crear-extraordinaria.component.html',
    styleUrls: ['./modal-crear-extraordinaria.component.css'],
    animations: [overlayAnimation, modalAnimation],
})
export class ModalCrearExtraordinariaComponent implements OnInit {

    private readonly fb = inject(FormBuilder);
    private readonly service = inject(ComprasGeneracionService);
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
    readonly cargandoBodegas = signal<boolean>(true);
    readonly cargandoProductos = signal<boolean>(true);
    readonly error = signal<string | null>(null);

    readonly bodegas = signal<BodegaOpcion[]>([]);
    readonly productos = signal<ProductoCatalogo[]>([]);

    form!: FormGroup;

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    ngOnInit(): void {
        this._inicializarFormulario();
        this._cargarBodegas();

        // El catálogo ya no depende de la bodega (listarProductosParaAlta es
        // global), así que se carga una sola vez en paralelo.
        this.service.cargarProductosDisponibles()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.cargandoProductos.set(false));

        this.service.productos$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(productos => this.productos.set(productos));
    }

    get lineas(): FormArray {
        return this.form.get('lineas') as FormArray;
    }

    private _inicializarFormulario(): void {
        this.form = this.fb.group({
            id_bodega: [null, [Validators.required]],
            lineas: this.fb.array([this._crearLinea()]),
        });
    }

    private _cargarBodegas(): void {
        this.cargandoBodegas.set(true);
        this.service.cargarBodegasActivas()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.cargandoBodegas.set(false));

        this.service.bodegas$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(bodegas => this.bodegas.set(bodegas));
    }

    // ── Líneas dinámicas ──────────────────────────────────────────────────────

    private _crearLinea(): FormGroup {
        return this.fb.group({
            id_producto: [null, [Validators.required]],
            id_unidad: [{ value: null, disabled: true }, [Validators.required]],
            cantidad: [null, [Validators.required, Validators.min(0.01)]],
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

        if (producto.id_tipo !== TIPO_CONTROL_PRODUCTO.CORRELATIVO) {
            grupo.patchValue({
                serie: '', resolucion: '', fecha_resolucion: '',
                correlativo_inicial: null, correlativo_final: null,
            });
        }
    }

    // ── Guardar ───────────────────────────────────────────────────────────────

    guardar(): void {
        if (this.form.invalid || this.lineas.length === 0) {
            this.form.markAllAsTouched();
            return;
        }

        this.guardando.set(true);
        this.error.set(null);

        const payload: CompraFormExtraordinaria = {
            id_bodega: Number(this.form.value.id_bodega),
            lineas: this.lineas.getRawValue().map((l: any, i: number) => ({
                id_producto: Number(l.id_producto),
                id_unidad: Number(l.id_unidad),
                cantidad: Number(l.cantidad),
                ...(this.esCorrelativo(i) ? {
                    serie: l.serie?.trim() || null,
                    resolucion: l.resolucion?.trim() || null,
                    fecha_resolucion: l.fecha_resolucion || null,
                    correlativo_inicial: l.correlativo_inicial ? Number(l.correlativo_inicial) : null,
                    correlativo_final: l.correlativo_final ? Number(l.correlativo_final) : null,
                } : {}),
            })),
        };

        this.service.crearExtraordinaria(payload)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: exito => {
                    if (exito) { this.creada.emit(); }
                    this.guardando.set(false);
                },
                error: () => {
                    this.error.set('Ocurrió un error al registrar la compra extraordinaria');
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

    get textoBoton(): string {
        return this.guardando() ? 'Registrando...' : 'Registrar compra';
    }
}