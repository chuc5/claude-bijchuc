
// ============================================================================
// FORMULARIO PAGO TRANSFERENCIA - REFACTORIZADO
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { ServicioGeneralService } from '../../../../../servicios/servicio-general.service';

interface Banco {
  id_banco: number;
  nombre: string;
}

interface TipoCuenta {
  id_tipo_cuenta: number;
  nombre: string;
}

@Component({
  selector: 'app-form-pago-transferencia-presupuesto',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './pago-transferencia-form.component.html'
})
export class PagoTransferenciaFormComponentpresupuesto implements OnInit {
  @Input() data: any | null = null;
  @Input() agencias: any[] = [];
  @Output() guardar = new EventEmitter<any>();

  form: FormGroup;

  // Catálogos
  bancos: Banco[] = [];
  tiposCuenta: TipoCuenta[] = [];

  // Estados de carga
  cargandoBancos = false;
  cargandoTiposCuenta = false;

  constructor(
    private fb: FormBuilder,
    private servicio: ServicioGeneralService
  ) {
    this.form = this.fb.group({
      nombre_cuenta: ['', [Validators.required, Validators.minLength(3)]],
      numero_cuenta: ['', [Validators.required, Validators.minLength(8)]],
      banco: ['', Validators.required],
      tipo_cuenta: ['', Validators.required],
      observaciones: ['']
    });
  }

  ngOnInit() {
    this.cargarCatalogos();

    // Cargar datos existentes si los hay
    if (this.data) {
      this.form.patchValue({
        nombre_cuenta: this.data.nombre_cuenta || '',
        numero_cuenta: this.data.numero_cuenta || '',
        banco: this.data.banco || '',
        tipo_cuenta: this.data.tipo_cuenta || '',
        observaciones: this.data.observaciones || ''
      });
    }
  }

  private cargarCatalogos(): void {
    // Cargar bancos
    this.cargandoBancos = true;
    this.servicio.query({
      ruta: 'facturas/bancos/lista',
      tipo: 'get',
      body: {}
    }).subscribe({
      next: res => {
        if (res.respuesta === 'success') {
          this.bancos = res.datos || [];
        }
        this.cargandoBancos = false;
      },
      error: () => {
        this.cargandoBancos = false;
        console.error('Error al cargar bancos');
      }
    });

    // Cargar tipos de cuenta
    this.cargandoTiposCuenta = true;
    this.servicio.query({
      ruta: 'facturas/tiposCuenta/lista',
      tipo: 'get',
      body: {}
    }).subscribe({
      next: res => {
        if (res.respuesta === 'success') {
          this.tiposCuenta = res.datos || [];
        }
        this.cargandoTiposCuenta = false;
      },
      error: () => {
        this.cargandoTiposCuenta = false;
        console.error('Error al cargar tipos de cuenta');
      }
    });
  }

  // Método para verificar si un campo es inválido
  campoInvalido(campo: string): boolean {
    const control = this.form.get(campo);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  // Método para obtener mensaje de error
  obtenerErrorMensaje(campo: string): string {
    const control = this.form.get(campo);
    if (!control) return '';

    if (control.hasError('required')) return 'Este campo es obligatorio';
    if (control.hasError('minlength')) {
      const requiredLength = control.errors?.['minlength'].requiredLength;
      return `Mínimo ${requiredLength} caracteres`;
    }
    if (control.hasError('maxlength')) {
      const requiredLength = control.errors?.['maxlength'].requiredLength;
      return `Máximo ${requiredLength} caracteres`;
    }

    return 'Campo inválido';
  }

  submit() {
    if (this.form.invalid) {
      // Marcar todos los campos como tocados para mostrar errores
      Object.keys(this.form.controls).forEach(key => {
        this.form.get(key)?.markAsTouched();
      });
      return;
    }

    // Emitir los datos del formulario específico
    const formData = this.form.value;

    // Combinar con datos base si existen
    const payload = {
      ...this.data, // Datos del formulario principal
      ...formData,  // Datos específicos del formulario de transferencia
      forma_pago: 'transferencia'
    };

    this.guardar.emit(payload);
  }
}