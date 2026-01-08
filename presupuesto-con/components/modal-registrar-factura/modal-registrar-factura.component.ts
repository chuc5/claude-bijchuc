import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, HostListener, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { FacturasPlanEmpresarialService } from '../../services/facturas-presupuesto.service';
import {
    RegistrarFacturaPayload,
    AUTORIZACIONES,
    validarFactura
} from '../../models/facturas-presupuesto.models';

@Component({
    selector: 'app-modal-registrar-factura-presupuesto',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './modal-registrar-factura.component.html',
})
export class ModalRegistrarFacturaComponentpresupuesto {

    private readonly service = inject(FacturasPlanEmpresarialService);

    @Output() cerrar = new EventEmitter<void>();
    @Output() facturaRegistrada = new EventEmitter<void>();

    guardando = false;
    erroresValidacion: string[] = [];

    // Catálogos
    readonly autorizaciones = AUTORIZACIONES;

    // Formulario (sin tipo_dte ni moneda)
    readonly form = new FormGroup({
        numero_dte: new FormControl('', [
            Validators.required,
            Validators.pattern(/^[A-Za-z0-9\-]{1,25}$/)
        ]),
        fecha_emision: new FormControl(new Date().toISOString().split('T')[0], [
            Validators.required
        ]),
        numero_autorizacion: new FormControl('', [Validators.required]),
        nombre_emisor: new FormControl('', [
            Validators.required,
            Validators.minLength(3),
            Validators.maxLength(200)
        ]),
        monto_total: new FormControl<number | null>(null, [
            Validators.required,
            Validators.min(0.01)
        ])
    });

    @HostListener('click', ['$event'])
    onBackdropClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.cerrar.emit();
        }
    }

    @HostListener('document:keydown.escape', ['$event'])
    onEscapeKey(event: KeyboardEvent): void {
        if (!this.form.dirty || confirm('¿Está seguro que desea cerrar sin guardar?')) {
            this.cerrar.emit();
        }
    }

    guardar(): void {
        if (this.guardando || this.form.invalid) return;

        this.erroresValidacion = [];

        const formValue = this.form.value;
        const payload: RegistrarFacturaPayload = {
            numero_dte: (formValue.numero_dte || '').toUpperCase().trim(),
            fecha_emision: formValue.fecha_emision!,
            numero_autorizacion: formValue.numero_autorizacion!,
            tipo_dte: '1',       // ✅ Siempre se manda RECIBO
            nombre_emisor: (formValue.nombre_emisor || '').toUpperCase().trim(),
            monto_total: Number(formValue.monto_total),
            moneda: 'GTQ'             // ✅ Siempre se manda GTQ
        };

        const validacion = validarFactura(payload);
        if (!validacion.valido) {
            this.erroresValidacion = validacion.errores;
            return;
        }

        this.guardando = true;
        this.service.registrarFactura(payload).subscribe({
            next: (exito) => {
                if (exito) {
                    this.facturaRegistrada.emit();
                    this.cerrar.emit();
                }
            },
            error: (error) => {
                console.error('Error al registrar factura:', error);
                this.erroresValidacion = ['Error inesperado al registrar la factura'];
            },
            complete: () => {
                this.guardando = false;
            }
        });
    }

    isFieldInvalid(fieldName: string): boolean {
        const field = this.form.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    getFieldError(fieldName: string): string {
        const field = this.form.get(fieldName);
        if (!field || !field.errors || !this.isFieldInvalid(fieldName)) {
            return '';
        }

        const errors = field.errors;
        if (errors['required']) return 'Este campo es requerido';
        if (errors['pattern']) return 'Formato inválido';
        if (errors['minlength']) return `Mínimo ${errors['minlength'].requiredLength} caracteres`;
        if (errors['maxlength']) return `Máximo ${errors['maxlength'].requiredLength} caracteres`;
        if (errors['min']) return 'El valor debe ser mayor a 0';

        return 'Campo inválido';
    }

    resetearFormulario(): void {
        this.form.reset({
            fecha_emision: new Date().toISOString().split('T')[0]
        });
        this.erroresValidacion = [];
    }

    tieneParaGuardar(): boolean {
        return this.form.dirty && this.form.valid;
    }
}