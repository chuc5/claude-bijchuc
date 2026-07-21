// ============================================================================
// MODAL — CREAR SOLICITUD DE COMPRA (Área)
// ============================================================================
//
// Paso 1: el usuario elige la bodega de área (entre las que tiene acceso).
// Paso 2: al elegirla, se carga el catálogo YA filtrado por la matriz de
// acceso de esa bodega (productosPermitidosParaSolicitud en el backend) —
// así nunca se puede armar una línea que el backend rechazaría al guardar.
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

import {
    AreaDisponible,
    ProductoCatalogo,
    CompraFormArea,
    UnidadProducto,
} from '../../models/compras-area.models';
import { TIPO_CONTROL_PRODUCTO } from '../../models/producto-catalogo.models';
import { ComprasAreaService } from '../../services/compras-area.service';
import { BuscadorProductoComponent } from '../../buscador-producto/buscador-producto.component';

@Component({
    selector: 'app-modal-crear-solicitud-area',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        LucideAngularModule,
        NgSelectModule,
        BuscadorProductoComponent,
    ],
    templateUrl: './modal-crear-solicitud-area.component.html',
    styleUrls: ['./modal-crear-solicitud-area.component.css'],
    animations: [overlayAnimation, modalAnimation],
})
export class ModalCrearSolicitudAreaComponent implements OnInit {

    private readonly fb = inject(FormBuilder);
    private readonly service = inject(ComprasAreaService);
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
    readonly cargandoAreas = signal<boolean>(true);
    readonly cargandoProductos = signal<boolean>(false);
    readonly error = signal<string | null>(null);

    readonly areas = signal<AreaDisponible[]>([]);
    readonly productos = signal<ProductoCatalogo[]>([]);
    readonly esRestringida = signal<boolean>(false);
    readonly idBodegaSeleccionada = signal<number | null>(null);

    form!: FormGroup;

    // ── Computed ──────────────────────────────────────────────────────────────

    get lineas(): FormArray {
        return this.form.get('lineas') as FormArray;
    }

    readonly hayBodegaSeleccionada = computed(() => this.idBodegaSeleccionada() !== null);

    readonly sinProductosPermitidos = computed(() =>
        this.hayBodegaSeleccionada() && !this.cargandoProductos() && this.productos().length === 0,
    );

    // ── Ciclo de vida ─────────────────────────────────────────────────────────

    ngOnInit(): void {
        this._inicializarFormulario();
        this._cargarAreas();

        this.service.catalogo$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(catalogo => {
                this.productos.set(catalogo.productos);
                this.esRestringida.set(catalogo.restringida);
            });
    }

    private _inicializarFormulario(): void {
        this.form = this.fb.group({
            id_bodega: [null, [Validators.required]],
            lineas: this.fb.array([]),
        });

        this.form.get('id_bodega')?.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(idBodega => this._onCambioBodega(idBodega));
    }

    private _cargarAreas(): void {
        this.cargandoAreas.set(true);
        this.service.listarAreasDisponibles()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.cargandoAreas.set(false));

        this.service.areasDisponibles$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(areas => this.areas.set(areas));
    }

    private _onCambioBodega(idBodega: number | null): void {
        this.idBodegaSeleccionada.set(idBodega);
        this.lineas.clear();

        if (!idBodega) return;

        this.cargandoProductos.set(true);
        this.service.cargarProductosPermitidos(idBodega)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.cargandoProductos.set(false);
                if (this.productos().length > 0) {
                    this.lineas.push(this._crearLinea());
                }
            });
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

        const payload: CompraFormArea = {
            id_bodega: Number(this.form.value.id_bodega),
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