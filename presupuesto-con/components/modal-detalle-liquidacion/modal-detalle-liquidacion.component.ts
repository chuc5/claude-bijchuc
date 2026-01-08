// ============================================================================
// MODAL DETALLE LIQUIDACIÓN - COMPONENTE COMPLETO DESDE CERO
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy, inject, Input, Output, EventEmitter, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

// IMPORTS PARA LOS FORMULARIOS DE TIPOS DE PAGO
import { PagoDepositoFormComponentpresupuesto } from '../pago-forms/pago-deposito-form/pago-deposito-form.component';
import { PagoTransferenciaFormComponentpresupuesto } from '../pago-forms/pago-transferencia-form/pago-transferencia-form.component';
import { PagoChequeFormComponentpresupuesto } from '../pago-forms/pago-cheque-form/pago-cheque-form.component';
import { PagoTarjetaSelectComponentpresupuesto } from '../pago-forms/pago-tarjeta-select/pago-tarjeta-select.component';
import { PagoAnticipoSelectComponentpresupuesto } from '../pago-forms/pago-anticipo-select/pago-anticipo-select.component';
import { NgSelectModule } from '@ng-select/ng-select';

import { FacturasPlanEmpresarialService } from '../../services/facturas-presupuesto.service';
import { DetalleLiquidacionPE, FORMAS_PAGO, AgenciaPE, BancoPE, TipoCuentaPE, OrdenPE, GuardarDetalleLiquidacionPayload, AreaPresupuestoPE } from '../../models/facturas-presupuesto.models';

@Component({
    selector: 'app-modal-detalle-liquidacion-presupuesto',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        NgSelectModule,
        PagoDepositoFormComponentpresupuesto,
        PagoTransferenciaFormComponentpresupuesto,
        PagoChequeFormComponentpresupuesto,
        PagoTarjetaSelectComponentpresupuesto,
        PagoAnticipoSelectComponentpresupuesto
    ],
    templateUrl: './modal-detalle-liquidacion.component.html',
    styleUrls: ['./modal-detalle-liquidacion.component.scss']
})
export class ModalDetalleLiquidacionNuevoComponentpresupuesto implements OnInit, OnDestroy, AfterViewInit {

    @Input() visible = false;
    @Input() modo: 'crear' | 'editar' = 'crear';
    @Input() registro: DetalleLiquidacionPE | null = null;
    @Output() visibleChange = new EventEmitter<boolean>();

    private readonly service = inject(FacturasPlanEmpresarialService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly destroy$ = new Subject<void>();

    // ============================================================================
    // ESTADO DEL COMPONENTE
    // ============================================================================

    formularioPrincipal!: FormGroup;
    tipoSeleccionado = signal<string>('');
    mostrarFormularioEspecifico = signal(false);
    datosFormularioCompletos: any = null;

    submitting = false;

    // Datos del servicio
    facturaActual = signal<any>(null);
    agenciasDisponibles = signal<AgenciaPE[]>([]);
    areasDisponibles = signal<AreaPresupuestoPE[]>([]);
    bancosDisponibles = signal<BancoPE[]>([]);
    tiposCuentaDisponibles = signal<TipoCuentaPE[]>([]);
    ordenesDisponibles = signal<OrdenPE[]>([]);
    tiposPago = signal<any[]>(FORMAS_PAGO);

    // Estados de carga
    cargandoBancos = signal<boolean>(false);
    cargandoTiposCuenta = signal<boolean>(false);
    cargandoOrdenesAutorizadas = signal<boolean>(false);
    cargandoDatos = false;
    cargandoOrdenes = false;
    cargandoAgencias = false;

    public math = Math;
    facturaActualId: number | null = null;
    totalMontoRegistros: number = 0;

    ngOnInit() {
        this.inicializarFormulario();
        this.configurarSuscripciones();
        this.sincronizarDatosConServicio();
        this.service.cargarCatalogos().subscribe();
    }

    ngAfterViewInit() {
        this.cdr.detectChanges();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ============================================================================
    // INICIALIZACIÓN
    // ============================================================================

    inicializarFormulario() {
        this.formularioPrincipal = new FormGroup({
            numero_orden: new FormControl('', [Validators.required]),
            agencia: new FormControl('', [Validators.required]),
            descripcion: new FormControl('', [
                Validators.required,
                Validators.minLength(5),
                Validators.maxLength(800)
            ]),
            monto: new FormControl(null, [
                Validators.required,
                Validators.min(0.01)
            ]),
            correo_proveedor: new FormControl('', [Validators.email]),
            forma_pago: new FormControl('', [Validators.required]),
            banco: new FormControl(''),
            cuenta: new FormControl(''),
            area_presupuesto: new FormControl('', [Validators.required])
        });

        if (this.registro) {
            this.cargarDatosParaEdicion();
        }
    }

    configurarSuscripciones() {
        this.formularioPrincipal.get('forma_pago')?.valueChanges
            .pipe(takeUntil(this.destroy$))
            .subscribe(value => {
                setTimeout(() => {
                    this.tipoSeleccionado.set(value);
                    this.manejarCambiosFormaPago(value);
                    this.actualizarValidacionOrden(value); // Nueva función
                    this.cdr.markForCheck();
                }, 0);
            });

        this.formularioPrincipal.get('monto')?.valueChanges
            .pipe(takeUntil(this.destroy$))
            .subscribe(monto => {
                setTimeout(() => {
                    this.validarMontoConServicio(monto);
                }, 0);
            });
        this.service.areasPresupuesto$
            .pipe(takeUntil(this.destroy$))
            .subscribe(areas => {
                setTimeout(() => {
                    this.areasDisponibles.set(areas);
                    this.cdr.markForCheck();
                }, 0);
            });
    }

    
    // Agrega este nuevo método:
    private actualizarValidacionOrden(formaPago: string) {
        const ordenControl = this.formularioPrincipal.get('numero_orden');
        const areaControl = this.formularioPrincipal.get('area_presupuesto');

        if (!ordenControl) return;

        if (formaPago === 'costoasumido') {
            // Para costo asumido: orden NO es requerida, área SÍ es requerida
            ordenControl.clearValidators();
            ordenControl.setValue('0');
            ordenControl.disable(); // ✅ Deshabilitar desde código

            if (areaControl) {
                areaControl.setValidators([Validators.required]);
                areaControl.enable(); // ✅ Habilitar desde código
            }
        } else {
            // Para otros tipos: orden SÍ es requerida, área NO es requerida
            ordenControl.setValidators([Validators.required]);
            ordenControl.enable(); // ✅ Habilitar desde código

            if (areaControl) {
                areaControl.clearValidators();
                areaControl.setValue('');
                // Opcional: deshabilitar el campo cuando no sea costo asumido
                // areaControl.disable();
            }
        }

        ordenControl.updateValueAndValidity();
        if (areaControl) {
            areaControl.updateValueAndValidity();
        }
    }

    sincronizarDatosConServicio() {
        this.service.facturaActual$
            .pipe(takeUntil(this.destroy$))
            .subscribe(factura => {
                setTimeout(() => {
                    this.facturaActual.set(factura);
                    this.facturaActualId = factura?.id || null;
                    this.cdr.markForCheck();
                }, 0);
            });

        this.service.agencias$
            .pipe(takeUntil(this.destroy$))
            .subscribe(agencias => {
                setTimeout(() => {
                    this.agenciasDisponibles.set(agencias);
                    this.cdr.markForCheck();
                }, 0);
            });

        this.service.bancos$
            .pipe(takeUntil(this.destroy$))
            .subscribe(bancos => {
                setTimeout(() => {
                    this.bancosDisponibles.set(bancos);
                    this.cdr.markForCheck();
                }, 0);
            });

        this.service.tiposCuenta$
            .pipe(takeUntil(this.destroy$))
            .subscribe(tipos => {
                setTimeout(() => {
                    this.tiposCuentaDisponibles.set(tipos);
                    this.cdr.markForCheck();
                }, 0);
            });

        this.service.ordenes$
            .pipe(takeUntil(this.destroy$))
            .subscribe(ordenes => {
                setTimeout(() => {
                    this.ordenesDisponibles.set(ordenes);
                    this.cdr.markForCheck();
                }, 0);
            });

        this.service.cargandoCatalogos$
            .pipe(takeUntil(this.destroy$))
            .subscribe(loading => {
                setTimeout(() => {
                    this.cargandoBancos.set(loading);
                    this.cargandoTiposCuenta.set(loading);
                    this.cargandoDatos = loading;
                    this.cdr.markForCheck();
                }, 0);
            });

        if (this.modo === 'editar' && this.registro) {
            setTimeout(() => {
                this.evaluarFormularioEspecificoParaEdicion();
            }, 200);
        }
    }

    cargarDatosParaEdicion() {
        if (!this.registro || !this.formularioPrincipal) return;
        const areaPresupuestoId = this.registro.area_presupuesto
            ? Number(this.registro.area_presupuesto)
            : null;

        this.formularioPrincipal.patchValue({
            numero_orden: this.registro.numero_orden || '',
            agencia: this.registro.agencia || '',
            descripcion: this.registro.descripcion || '',
            monto: this.registro.monto || null,
            correo_proveedor: this.registro.correo_proveedor || '',
            forma_pago: this.registro.forma_pago || '',
            banco: this.registro.banco || '',
            cuenta: this.registro.cuenta || '',
            area_presupuesto: areaPresupuestoId // NUEVO
        });

        setTimeout(() => {
            this.tipoSeleccionado.set(this.registro?.forma_pago || '');
            this.cdr.markForCheck();
        }, 0);
    }

    // ============================================================================
    // MANEJO DE FORMULARIOS ESPECÍFICOS
    // ============================================================================

    private evaluarFormularioEspecificoParaEdicion() {
        if (!this.registro) return;

        const formaPago = this.registro.forma_pago;
        if (!formaPago) return;

        if (this.requiereFormularioEspecifico(formaPago)) {
            console.log(`[EDICIÓN] Mostrando formulario específico para: ${formaPago}`);

            setTimeout(() => {
                this.mostrarFormularioEspecifico.set(true);

                const bancoControl = this.formularioPrincipal.get('banco');
                const cuentaControl = this.formularioPrincipal.get('cuenta');

                if (bancoControl && cuentaControl) {
                    bancoControl.clearValidators();
                    cuentaControl.clearValidators();
                    bancoControl.updateValueAndValidity();
                    cuentaControl.updateValueAndValidity();
                }

                this.cdr.markForCheck();
            }, 0);
        } else {
            setTimeout(() => {
                this.mostrarFormularioEspecifico.set(false);
                this.cdr.markForCheck();
            }, 0);
        }
    }

    manejarCambiosFormaPago(forma_pago: string) {
        const bancoControl = this.formularioPrincipal.get('banco');
        const cuentaControl = this.formularioPrincipal.get('cuenta');

        if (!bancoControl || !cuentaControl) return;

        if (this.requiereFormularioEspecifico(forma_pago)) {
            bancoControl.clearValidators();
            cuentaControl.clearValidators();
            bancoControl.setValue('');
            cuentaControl.setValue('');

            setTimeout(() => {
                this.mostrarFormularioEspecifico.set(true);
                console.log(`[CAMBIO] Mostrando formulario específico para: ${forma_pago}`);
                this.cdr.markForCheck();
            }, 0);
        } else {
            bancoControl.clearValidators();
            cuentaControl.clearValidators();
            bancoControl.setValue('');
            cuentaControl.setValue('');

            setTimeout(() => {
                this.mostrarFormularioEspecifico.set(false);
                console.log(`[CAMBIO] Ocultando formulario específico para: ${forma_pago}`);
                this.cdr.markForCheck();
            }, 0);
        }

        bancoControl.updateValueAndValidity();
        cuentaControl.updateValueAndValidity();
    }

    requiereFormularioEspecifico(formaPago?: string): boolean {
        if (!formaPago) return false;
        return ['deposito', 'transferencia', 'cheque'].includes(formaPago);
    }

    // ============================================================================
    // VALIDACIONES
    // ============================================================================

    validarMontoConServicio(monto: number | null) {
        if (!this.facturaActual() || monto === null || monto === undefined) return;

        const montoControl = this.formularioPrincipal.get('monto');
        if (!montoControl) return;

        const factura = this.facturaActual();

        // Calcular total de detalles EXCLUYENDO el registro actual en edición
        const totalDetallesActuales = this.service.obtenerDetallesActuales()
            .filter(d => {
                // En modo edición, excluir el registro que se está editando
                if (this.modo === 'editar' && this.registro) {
                    return d.id !== this.registro.id;
                }
                return true;
            })
            .reduce((sum, d) => sum + d.monto, 0);

        const montoDisponible = factura.monto_total - totalDetallesActuales;

        // REDONDEAR A 2 DECIMALES para evitar problemas de precisión
        const montoRedondeado = Math.round(monto * 100) / 100;
        const montoDisponibleRedondeado = Math.round(montoDisponible * 100) / 100;

        const errores = montoControl.errors || {};
        delete errores['montoExcedido'];
        delete errores['montoInsuficiente'];

        if (montoRedondeado <= 0) {
            errores['montoInsuficiente'] = true;
        } else if (montoRedondeado > montoDisponibleRedondeado) {
            errores['montoExcedido'] = {
                montoDisponible: montoDisponibleRedondeado,
                montoIngresado: montoRedondeado
            };
        }

        const tieneErrores = Object.keys(errores).length > 0;
        montoControl.setErrors(tieneErrores ? errores : null);
    }

    calcularMontoDisponible(): number {
        const factura = this.facturaActual();
        if (!factura) return 0;

        const totalDetalles = this.service.obtenerDetallesActuales()
            .filter(d => {
                if (this.modo === 'editar' && this.registro) {
                    return d.id !== this.registro.id;
                }
                return true;
            })
            .reduce((sum, d) => sum + d.monto, 0);

        const disponible = factura.monto_total - totalDetalles;
        // Redondear a 2 decimales
        return Math.round(disponible * 100) / 100;
    }

    calcularMontoPendiente(): number {
        return this.calcularMontoDisponible();
    }

    calcularMontoPendienteOrden(orden: OrdenPE): number {
        return orden.monto_pendiente || (orden.total - (orden.monto_liquidado || 0));
    }

    // ============================================================================
    // MÉTODOS DE GUARDADO
    // ============================================================================

    onGuardarDesdeForm(datosEspecificos: any) {
        this.datosFormularioCompletos = {
            ...this.formularioPrincipal.value,
            ...datosEspecificos,
            forma_pago: this.tipoSeleccionado(),
            factura_id: this.facturaActualId
        };

        this.completarGuardado();
    }

    onGuardarBasico() {
        if (!this.formularioPrincipal.valid) {
            this.marcarCamposComoTocados();
            return;
        }

        const formaPago = this.formularioPrincipal.get('forma_pago')?.value;

        if (this.requiereFormularioEspecifico(formaPago)) {
            return; // El formulario específico se muestra automáticamente
        } else {
            this.datosFormularioCompletos = {
                ...this.formularioPrincipal.value,
                forma_pago: this.tipoSeleccionado(),
                factura_id: this.facturaActualId
            };
            this.completarGuardado();
        }
    }

    completarGuardado() {
        if (!this.datosFormularioCompletos) return;

        this.submitting = true;

        const payload: GuardarDetalleLiquidacionPayload = {
            id: this.registro?.id,
            numero_factura: this.facturaActual()?.numero_dte || '',
            numero_orden: this.datosFormularioCompletos.numero_orden,
            agencia: this.datosFormularioCompletos.agencia,
            descripcion: this.datosFormularioCompletos.descripcion,
            monto: parseFloat(this.datosFormularioCompletos.monto),
            correo_proveedor: this.datosFormularioCompletos.correo_proveedor || '',
            forma_pago: this.datosFormularioCompletos.forma_pago,
            banco: this.datosFormularioCompletos.banco || '',
            cuenta: this.datosFormularioCompletos.cuenta || '',
            area_presupuesto: this.datosFormularioCompletos.area_presupuesto || '', // NUEVO
            datos_especificos: this.extraerDatosEspecificos(this.datosFormularioCompletos)
        };

        this.service.guardarDetalle(payload).pipe(
            takeUntil(this.destroy$)
        ).subscribe({
            next: (success: boolean) => {
                this.submitting = false;
                if (success) {
                    this.cerrarModal();
                }
            },
            error: () => {
                this.submitting = false;
            }
        });
    }

    private extraerDatosEspecificos(datos: any): any {
        const especificos: any = {};

        switch (datos.forma_pago) {
            case 'deposito':
                if (datos.id_socio) especificos.id_socio = datos.id_socio;
                if (datos.nombre_socio) especificos.nombre_socio = datos.nombre_socio;
                if (datos.numero_cuenta_deposito) especificos.numero_cuenta_deposito = datos.numero_cuenta_deposito;
                if (datos.producto_cuenta) especificos.producto_cuenta = datos.producto_cuenta;
                if (datos.observaciones) especificos.observaciones = datos.observaciones;
                break;

            case 'cheque':
                if (datos.nombre_beneficiario) especificos.nombre_beneficiario = datos.nombre_beneficiario;
                if (datos.consignacion) especificos.consignacion = datos.consignacion;
                if (datos.no_negociable !== undefined) especificos.no_negociable = datos.no_negociable;
                if (datos.observaciones) especificos.observaciones = datos.observaciones;
                break;

            case 'transferencia':
                if (datos.nombre_cuenta) especificos.nombre_cuenta = datos.nombre_cuenta;
                if (datos.numero_cuenta) especificos.numero_cuenta = datos.numero_cuenta;
                if (datos.banco) especificos.banco = datos.banco;
                if (datos.tipo_cuenta) especificos.tipo_cuenta = datos.tipo_cuenta;
                if (datos.observaciones) especificos.observaciones = datos.observaciones;
                break;

            case 'tarjeta':
            case 'anticipo':
                if (datos.nota) especificos.nota = datos.nota;
                break;
        }

        return especificos;
    }

    // ============================================================================
    // MÉTODOS DE UI
    // ============================================================================

    onCancelar() {
        this.cerrarModal();
    }

    private cerrarModal() {
        this.resetearFormulario();
        this.visible = false;
        this.visibleChange.emit(false);

        setTimeout(() => {
            this.mostrarFormularioEspecifico.set(false);
            this.tipoSeleccionado.set('');
            this.datosFormularioCompletos = null;
            this.cdr.markForCheck();
        }, 0);
    }

    marcarCamposComoTocados() {
        Object.keys(this.formularioPrincipal.controls).forEach(key => {
            this.formularioPrincipal.get(key)?.markAsTouched();
        });
    }

    resetearFormulario() {
        this.formularioPrincipal.reset();
        this.formularioPrincipal.get('forma_pago')?.setValue('');
        this.submitting = false;
    }

    // ============================================================================
    // GETTERS Y UTILIDADES
    // ============================================================================

    get esFormularioValido(): boolean {
        return this.formularioPrincipal.valid;
    }

    get montoDisponible(): number {
        return this.calcularMontoDisponible();
    }

    // MÉTODO PRINCIPAL: Obtener órdenes disponibles para el select (SIN anticipos pendientes)
    obtenerOrdenesDisponibles(): OrdenPE[] {
        return this.ordenesDisponibles().filter(orden => {
            // En modo edición, permitir la orden actual aunque tenga anticipos
            if (this.modo === 'editar' && this.registro) {
                const esOrdenActual = orden.numero_orden.toString() === this.registro.numero_orden.toString();
                if (esOrdenActual) return true;
            }

            // Solo permitir órdenes sin anticipos pendientes
            return !orden.anticipos_pendientes || orden.anticipos_pendientes === 0;
        });
    }

    get ordenSeleccionadaInfo(): OrdenPE | undefined {
        const no = this.formularioPrincipal.get('numero_orden')?.value;
        return this.ordenesDisponibles().find(o => o.numero_orden.toString() === no);
    }

    campoInvalido(nombreCampo: string): boolean {
        const control = this.formularioPrincipal.get(nombreCampo);
        return !!(control && control.touched && control.errors);
    }

    obtenerErrorMensaje(nombreCampo: string): string | null {
        const control = this.formularioPrincipal.get(nombreCampo);

        if (!control || !control.touched || !control.errors) {
            return null;
        }

        const errores = control.errors;

        if (errores['required']) return 'Este campo es obligatorio';
        if (errores['email']) return 'Ingrese un correo electrónico válido';
        if (errores['minlength']) return `Mínimo ${errores['minlength'].requiredLength} caracteres`;
        if (errores['maxlength']) return `Máximo ${errores['maxlength'].requiredLength} caracteres`;
        if (errores['min']) return `El valor mínimo es ${errores['min'].min}`;
        if (errores['montoExcedido']) return `El monto excede el disponible (Q${errores['montoExcedido'].montoDisponible.toFixed(2)})`;
        if (errores['montoInsuficiente']) return 'El monto debe ser mayor a 0';

        return 'Campo inválido';
    }

    onModalClick(event: Event) {
        event.stopPropagation();
    }

    onOverlayClick() {
        this.onCancelar();
    }

    formatearMonto(monto: number): string {
        return new Intl.NumberFormat('es-GT', {
            style: 'currency',
            currency: 'GTQ',
            minimumFractionDigits: 2
        }).format(monto);
    }

    obtenerTextoFormaPago(formaPago: string): string {
        const forma = FORMAS_PAGO.find(f => f.id === formaPago);
        return forma?.nombre || formaPago || 'Sin especificar';
    }

    // Métodos de track para ngFor
    trackByOrden(index: number, orden: OrdenPE): number {
        return orden.numero_orden;
    }

    trackByTipoPago(index: number, tipo: any): string {
        return tipo.id;
    }

    trackByAgencia(index: number, agencia: AgenciaPE): number {
        return agencia.id;
    }
    trackByArea(index: number, area: AreaPresupuestoPE): number {
        return area.id;
    }

    trackByBanco(index: number, banco: BancoPE): number {
        return banco.id_banco;
    }
}