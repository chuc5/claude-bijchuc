// modal-crear-solicitud.component.ts — REEMPLAZAR COMPLETO
// FIX PRINCIPAL: unidadActiva ahora es computed sobre signal (idUnidadSeleccionada)
// en lugar de leer form.value directamente — esto resuelve que el campo cantidad
// no se habilitaba en productos normales y de expiración.

import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
    Component, Input, Output, EventEmitter,
    OnInit, inject, signal, computed, DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    LucideAngularModule,
    X, ShoppingCart, AlertCircle, Package, Calendar, Tag,
} from 'lucide-angular';
import { NgSelectModule } from '@ng-select/ng-select';
import { overlayAnimation, modalAnimation } from '../../../animations/modal.animations';

import {
    ProductoDisponible, UnidadConStock, LoteCorrelativo,
    TipoProductoId, FormatSolicitudes, RespuestaUnidades,
} from '../models/solicitudes.models';
import { SolicitudesService } from '../services/solicitudes.service';

@Component({
    selector: 'app-modal-crear-solicitud',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, LucideAngularModule, NgSelectModule],
    templateUrl: './modal-crear-solicitud.component.html',
    animations: [overlayAnimation, modalAnimation],
})
export class ModalCrearSolicitudComponent implements OnInit {

    private readonly fb = inject(FormBuilder);
    private readonly service = inject(SolicitudesService);
    private readonly destroyRef = inject(DestroyRef);

    @Input() producto!: ProductoDisponible;
    @Input() idBodega!: number;
    @Output() cerrar = new EventEmitter<void>();
    @Output() guardado = new EventEmitter<void>();

    // ── Iconos ────────────────────────────────────────────────────────────────
    readonly X = X; readonly ShoppingCart = ShoppingCart;
    readonly AlertCircle = AlertCircle; readonly Package = Package;
    readonly Calendar = Calendar; readonly Tag = Tag;
    readonly TipoProductoId = TipoProductoId;

    // ── Estado ────────────────────────────────────────────────────────────────
    readonly guardando = signal<boolean>(false);
    readonly error = signal<string | null>(null);
    readonly cargandoUnidades = signal<boolean>(false);

    readonly tipoProducto = signal<TipoProductoId>(TipoProductoId.NORMAL);
    readonly unidades = signal<UnidadConStock[]>([]);
    readonly lotesCorrelativo = signal<LoteCorrelativo[]>([]);
    readonly totalDisponibleCorr = signal<number>(0);

    // ── SEÑAL CLAVE: resuelve el bug donde computed no se actualizaba ─────────
    // El error: leer this.form.get('id_unidad')?.value dentro de computed()
    // NO reactivo porque el form control no es un signal. La solución es
    // mantener una señal separada que se actualiza en el valueChanges callback.
    readonly idUnidadSeleccionada = signal<number | null>(null);

    form!: FormGroup;

    // ── Computed (todos dependen de signals, nunca de form.value directo) ─────

    readonly unidadActiva = computed<UnidadConStock | null>(() => {
        const id = this.idUnidadSeleccionada(); // signal ✓
        return id ? (this.unidades().find(u => u.id_unidad === id) ?? null) : null;
    });

    readonly esTalla = computed<boolean>(() =>
        this.unidades().some(u => (u as any).es_talla === true || (u as any).es_talla === 1)
    );

    readonly maxCantidad = computed<number>(() => {
        if (this.tipoProducto() === TipoProductoId.CORRELATIVO) {
            return this.totalDisponibleCorr();
        }
        return FormatSolicitudes.cantidad(this.unidadActiva()?.cantidad_disponible);
    });

    readonly disponible = computed<number>(() => this.maxCantidad());
    readonly claseDisponible = computed<string>(() =>
        FormatSolicitudes.claseDisponibilidad(this.disponible())
    );
    readonly esCorrelativo = computed<boolean>(() =>
        this.tipoProducto() === TipoProductoId.CORRELATIVO
    );
    readonly esExpiracion = computed<boolean>(() =>
        this.tipoProducto() === TipoProductoId.EXPIRACION
    );
    readonly claseTipo = computed<string>(() =>
        FormatSolicitudes.claseTipoProducto(this.producto?.id_tipo)
    );

    // ── Getters ───────────────────────────────────────────────────────────────

    get proximoCorrelativo(): number {
        const lote = this.lotesCorrelativo()[0];
        if (!lote) return 0;
        return lote.correlativo_inicial + lote.ya_asignados;
    }

    get labelUnidad(): string {
        return this.esTalla() ? 'Talla' : 'Unidad de medida';
    }

    get placeholderUnidad(): string {
        return this.esTalla() ? 'Seleccionar talla...' : 'Seleccionar unidad...';
    }

    get textoBoton(): string {
        return this.guardando() ? 'Confirmando...' : 'Confirmar solicitud';
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    ngOnInit(): void {
        this._inicializarFormulario();
        this._cargarUnidades();

        // Suscribir al valueChanges del form y actualizar la señal
        this.form.get('id_unidad')!.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((id: number | null) => this._onUnidadChange(id));
    }

    // ========================================================================
    // PRIVADOS
    // ========================================================================

    private _inicializarFormulario(): void {
        this.form = this.fb.group({
            id_unidad: [null, [Validators.required]],
            cantidad: [{ value: null, disabled: true },
            [Validators.required, Validators.min(1)]],
            observaciones: ['', [Validators.maxLength(500)]],
        });
    }

    private _cargarUnidades(): void {
        this.cargandoUnidades.set(true);

        this.service.obtenerUnidadesProducto(this.producto.id, this.idBodega)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((resp: RespuestaUnidades) => {
                this.tipoProducto.set(resp.tipo);
                this.unidades.set(resp.unidades ?? []);
                this.cargandoUnidades.set(false);

                if (resp.tipo === TipoProductoId.CORRELATIVO) {
                    this.lotesCorrelativo.set(resp.lotes_correlativo ?? []);
                    this.totalDisponibleCorr.set(resp.cantidad_disponible ?? 0);
                    // Auto-seleccionar la única unidad (siempre UND para correlativos)
                    const und = resp.unidades[0] ?? null;
                    if (und) {
                        this.idUnidadSeleccionada.set(und.id_unidad);
                        this.form.patchValue({ id_unidad: und.id_unidad });
                        // Habilitar cantidad si hay disponibles
                        if (this.totalDisponibleCorr() > 0) {
                            this._habilitarCantidad(this.totalDisponibleCorr());
                        }
                    }
                } else {
                    // Normal o Expiración: seleccionar unidad default
                    const def = this.unidades().find(u => u.es_default)
                        ?? this.unidades()[0]
                        ?? null;
                    if (def) {
                        this.form.patchValue({ id_unidad: def.id_unidad });
                        // valueChanges dispara _onUnidadChange automáticamente
                    }
                }
            });
    }

    private _onUnidadChange(idUnidad: number | null): void {
        // 1. Actualizar señal PRIMERO — los computed se recalculan al leer
        this.idUnidadSeleccionada.set(idUnidad);

        // 2. Ahora maxCantidad() refleja la unidad recién seleccionada
        const max = this.maxCantidad();

        if (max > 0) {
            this._habilitarCantidad(max);
        } else {
            this.form.get('cantidad')!.disable({ emitEvent: false });
            this.form.get('cantidad')!.setValue(null, { emitEvent: false });
        }
    }

    private _habilitarCantidad(max: number): void {
        const ctrl = this.form.get('cantidad')!;
        ctrl.setValidators([Validators.required, Validators.min(1), Validators.max(max)]);
        ctrl.enable({ emitEvent: false });
        ctrl.updateValueAndValidity({ emitEvent: false });

        const actual = ctrl.value as number | null;
        if (actual !== null && actual > max) {
            ctrl.setValue(null, { emitEvent: false });
        }
    }

    // ========================================================================
    // ACCIONES
    // ========================================================================

    confirmar(): void {
        if (this.form.invalid || this.maxCantidad() === 0) {
            this.form.markAllAsTouched();
            return;
        }

        this.guardando.set(true);
        this.error.set(null);
        const raw = this.form.getRawValue();

        this.service.crearSolicitud({
            id_bodega: this.idBodega,
            id_producto: this.producto.id,
            id_unidad: Number(raw.id_unidad),
            cantidad: parseInt(String(raw.cantidad), 10),
            observaciones: raw.observaciones?.trim() || undefined,
        }).pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: id => {
                    this.guardando.set(false);
                    if (id !== null) this.guardado.emit();
                },
                error: () => {
                    this.error.set('Error al confirmar la solicitud. Intenta de nuevo.');
                    this.guardando.set(false);
                },
            });
    }

    cerrarModal(): void { if (!this.guardando()) this.cerrar.emit(); }

    // ========================================================================
    // HELPERS DE VALIDACIÓN
    // ========================================================================

    esInvalido(campo: string): boolean {
        const c = this.form.get(campo);
        return !!(c?.invalid && (c.dirty || c.touched));
    }

    obtenerError(campo: string): string {
        const c = this.form.get(campo);
        if (!c) return '';
        if (c.hasError('required')) return 'Este campo es requerido';
        if (c.hasError('min')) return 'El mínimo es 1';
        if (c.hasError('max')) return `Máximo disponible: ${c.getError('max').max}`;
        if (c.hasError('maxlength')) return `Máximo ${c.getError('maxlength').requiredLength} caracteres`;
        return '';
    }

    fmtFecha(f: string | null | undefined): string {
        if (!f) return '';
        const [y, m, d] = f.split('-');
        return `${d}/${m}/${y}`;
    }
}