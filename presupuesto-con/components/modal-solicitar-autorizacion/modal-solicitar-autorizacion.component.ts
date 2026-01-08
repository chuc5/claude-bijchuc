// ============================================================================
// MODAL SOLICITAR AUTORIZACIÓN - REFACTORIZADO CON ESTILO LIQUIDACIÓN VERIFICACIÓN
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit, HostListener, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { FacturasPlanEmpresarialService } from '../../services/facturas-presupuesto.service';
import {
    SolicitarAutorizacionPayload,
    validarAutorizacion,
    formatearFecha
} from '../../models/facturas-presupuesto.models';

@Component({
    selector: 'app-modal-solicitar-autorizacion-presupuesto',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './modal-solicitar-autorizacion.component.html',
})
export class ModalSolicitarAutorizacionComponentpresupuesto implements OnInit {

    private readonly service = inject(FacturasPlanEmpresarialService);

    // ============================================================================
    // INPUTS Y OUTPUTS
    // ============================================================================

    @Input() numeroDte = '';
    @Input() fechaEmision = '';
    @Input() diasTranscurridos = 0;

    @Output() cerrar = new EventEmitter<void>();
    @Output() solicitudEnviada = new EventEmitter<void>();

    // ============================================================================
    // ESTADO DEL COMPONENTE
    // ============================================================================

    enviando = false;
    erroresValidacion: string[] = [];

    // Utilidades
    readonly formatearFecha = formatearFecha;

    // Formulario
    form!: FormGroup;

    ngOnInit(): void {
        this.inicializarFormulario();
    }

    // ============================================================================
    // INICIALIZACIÓN
    // ============================================================================

    private inicializarFormulario(): void {
        this.form = new FormGroup({
            motivo: new FormControl('', [
                Validators.required,
                Validators.minLength(10),
                Validators.maxLength(500)
            ])
        });
    }

    // ============================================================================
    // MANEJO DE EVENTOS
    // ============================================================================

    /**
     * Manejar clic en el backdrop para cerrar modal
     */
    @HostListener('click', ['$event'])
    onBackdropClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.cerrar.emit();
        }
    }

    /**
     * Cerrar con Escape
     */
    @HostListener('document:keydown.escape', ['$event'])
    onEscapeKey(event: KeyboardEvent): void {
        if (!this.form.dirty || confirm('¿Está seguro que desea cerrar sin enviar la solicitud?')) {
            this.cerrar.emit();
        }
    }

    // ============================================================================
    // ACCIONES PRINCIPALES
    // ============================================================================

    /**
     * Enviar solicitud de autorización
     */
    enviar(): void {
        if (this.enviando || this.form.invalid) return;

        // Limpiar errores previos
        this.erroresValidacion = [];

        // Preparar payload
        const payload: SolicitarAutorizacionPayload = {
            numero_dte: this.numeroDte,
            motivo: this.form.get('motivo')?.value?.trim() || '',
            dias_transcurridos: this.diasTranscurridos
        };

        // Validar payload
        const validacion = validarAutorizacion(payload);
        if (!validacion.valido) {
            this.erroresValidacion = validacion.errores;
            return;
        }

        // Enviar al servicio
        this.enviando = true;
        this.service.solicitarAutorizacion(payload).subscribe({
            next: (exito) => {
                if (exito) {
                    this.solicitudEnviada.emit();
                    this.cerrar.emit();
                }
            },
            error: (error) => {
                console.error('Error al enviar solicitud:', error);
                this.erroresValidacion = ['Error inesperado al enviar la solicitud'];
            },
            complete: () => {
                this.enviando = false;
            }
        });
    }

    // ============================================================================
    // UTILIDADES
    // ============================================================================

    /**
     * Verificar si un campo tiene errores y ha sido tocado
     */
    isFieldInvalid(fieldName: string): boolean {
        const field = this.form.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    /**
     * Obtener mensaje de error específico para un campo
     */
    getFieldError(fieldName: string): string {
        const field = this.form.get(fieldName);
        if (!field || !field.errors || !this.isFieldInvalid(fieldName)) {
            return '';
        }

        const errors = field.errors;
        if (errors['required']) return 'El motivo es requerido';
        if (errors['minlength']) {
            const min = errors['minlength'].requiredLength;
            const actual = errors['minlength'].actualLength;
            return `Mínimo ${min} caracteres (actual: ${actual})`;
        }
        if (errors['maxlength']) {
            const max = errors['maxlength'].requiredLength;
            return `Máximo ${max} caracteres`;
        }

        return 'Campo inválido';
    }

    /**
     * Obtener información de urgencia basada en días transcurridos
     */
    obtenerInfoUrgencia(): { mensaje: string; clase: string } {
        if (this.diasTranscurridos <= 30) {
            return {
                mensaje: 'Solicitud normal',
                clase: 'text-blue-600'
            };
        } else if (this.diasTranscurridos <= 60) {
            return {
                mensaje: 'Solicitud urgente',
                clase: 'text-orange-600'
            };
        } else {
            return {
                mensaje: 'Solicitud muy urgente',
                clase: 'text-red-600'
            };
        }
    }

    /**
     * Verificar si el formulario tiene cambios sin guardar
     */
    tieneParaGuardar(): boolean {
        return this.form.dirty && this.form.valid;
    }
}