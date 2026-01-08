// ============================================================================
// FORMULARIO PAGO CHEQUE - REFACTORIZADO
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-form-pago-cheque-presupuesto',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './pago-cheque-form.component.html',
})
export class PagoChequeFormComponentpresupuesto implements OnInit, OnDestroy {
  @Input() data: any | null = null;
  @Input() agencias: any[] = [];
  @Output() guardar = new EventEmitter<any>();

  form: FormGroup;

  // Subject para manejo de suscripciones
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      nombre_beneficiario: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      consignacion: ['Negociable', Validators.required],
      observaciones: ['', [Validators.maxLength(500)]]
    });
  }

  ngOnInit() {
    this.cargarDatosExistentes();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private cargarDatosExistentes(): void {
    if (!this.data) return;

    // Para la consignación, si viene no_negociable=true, ponemos "No Negociable"
    let consignacion = this.data.consignacion || 'Negociable';
    if (this.data.no_negociable === true) {
      consignacion = 'No Negociable';
    }

    this.form.patchValue({
      nombre_beneficiario: this.data.nombre_beneficiario || '',
      consignacion: consignacion,
      observaciones: this.data.observaciones || ''
    });
  }

  // === VALIDACIONES ===

  campoInvalido(campo: string): boolean {
    const control = this.form.get(campo);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  obtenerErrorMensaje(campo: string): string {
    const control = this.form.get(campo);
    if (!control || !control.errors) return '';

    const errores = control.errors;

    if (errores['required']) {
      switch (campo) {
        case 'nombre_beneficiario': return 'El nombre del beneficiario es obligatorio';
        case 'consignacion': return 'Debe seleccionar el tipo de consignación';
        default: return 'Este campo es obligatorio';
      }
    }

    if (errores['minlength']) {
      const requiredLength = errores['minlength'].requiredLength;
      return `Mínimo ${requiredLength} caracteres`;
    }

    if (errores['maxlength']) {
      const requiredLength = errores['maxlength'].requiredLength;
      return `Máximo ${requiredLength} caracteres`;
    }

    return 'Campo inválido';
  }

  // === ACCIONES ===

  submit() {
    if (this.form.invalid) {
      // Marcar todos los campos como tocados para mostrar errores
      this.marcarCamposComoTocados();
      return;
    }

    const formData = this.form.value;

    // Combinar con datos base del formulario principal
    const payload = {
      ...this.data, // Datos del formulario principal (monto, descripcion, etc.)
      ...formData,  // Datos específicos del formulario de cheque
      forma_pago: 'cheque',
      no_negociable: formData.consignacion === 'No Negociable',
      // Información adicional para el registro
      tipo_pago_especifico: {
        nombre_beneficiario: formData.nombre_beneficiario,
        consignacion: formData.consignacion,
        no_negociable: formData.consignacion === 'No Negociable',
        observaciones: formData.observaciones || null
      }
    };

    this.guardar.emit(payload);
  }

  // === UTILIDADES ===

  private marcarCamposComoTocados(): void {
    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      if (control) {
        control.markAsTouched();
        control.markAsDirty();
      }
    });
  }

  // === GETTERS PARA EL TEMPLATE ===

  get formularioValido(): boolean {
    return this.form.valid;
  }

  get datosResumen() {
    if (!this.form.valid) return null;

    return {
      beneficiario: this.form.get('nombre_beneficiario')?.value,
      consignacion: this.form.get('consignacion')?.value,
      observaciones: this.form.get('observaciones')?.value
    };
  }

  get caracteresObservaciones(): number {
    return this.form.get('observaciones')?.value?.length || 0;
  }
}
