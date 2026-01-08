import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators, FormGroup } from '@angular/forms';
import { ServicioGeneralService } from '../../../../../servicios/servicio-general.service';
import { Socio, CuentaSocio } from '../../../../solicitudes-anticipo-ordenes/solicitud-anticipo/models/anticipo.model';
import { distinctUntilChanged, catchError, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-form-pago-deposito-presupuesto',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './pago-deposito-form.component.html'
})
export class PagoDepositoFormComponentpresupuesto implements OnInit {
  @Input() data: any | null = null;
  @Input() agencias: any[] = [];
  @Output() guardar = new EventEmitter<any>();
  // Removido @Output() cancelar

  form: FormGroup;

  // Control para la búsqueda de socios
  buscadorSocio = new FormControl('');

  // Lista de socios encontrados en la búsqueda
  sociosEncontrados: Socio[] = [];

  // Socio actualmente seleccionado
  socioSeleccionado: Socio | null = null;

  // Cuentas del socio seleccionado
  cuentasSocio: CuentaSocio[] = [];

  // Estados de carga
  buscandoSocios = false;
  cargandoCuentas = false;

  // Flags para mostrar/ocultar elementos
  mostrarResultadosBusqueda = false;
  mostrarDetallesSocio = false;

  // Mensaje de error
  mensajeError = '';

  constructor(
    private fb: FormBuilder,
    private servicio: ServicioGeneralService
  ) {
    this.form = this.fb.group({
      id_socio: ['', Validators.required],
      id_cuenta: ['', Validators.required],
      observaciones: ['']
    });
  }

  ngOnInit() {
    this.configurarBuscadorSocios();

    // Cargar datos existentes si los hay
    if (this.data) {
      this.cargarDatosExistentes();
    }
  }

  private configurarBuscadorSocios(): void {
    // Solo limpiamos resultados cuando se borra el campo
    this.buscadorSocio.valueChanges.pipe(
      distinctUntilChanged()
    ).subscribe(termino => {
      // Si el campo se vacía, limpiar resultados
      if (!termino || termino.length === 0) {
        this.sociosEncontrados = [];
        this.mostrarResultadosBusqueda = false;
        this.limpiarMensajeError();
      }
    });
  }

  private cargarDatosExistentes(): void {
    if (this.data.id_socio) {
      // Cargar datos del socio seleccionado
      this.cargarSocioPorId(this.data.id_socio);
    }

    this.form.patchValue({
      observaciones: this.data.observaciones || ''
    });
  }

  /**
   * Realiza búsqueda manual de socios
   */
  buscarManualmente(): void {
    const termino = this.buscadorSocio.value?.trim();

    if (!termino || termino.length < 2) {
      this.mensajeError = 'Debe escribir al menos 2 caracteres para buscar';
      return;
    }

    this.buscandoSocios = true;
    this.limpiarMensajeError();
    this.sociosEncontrados = [];
    this.mostrarResultadosBusqueda = false;

    this.buscarSocios(termino).subscribe({
      next: (socios) => {
        this.buscandoSocios = false;
        this.sociosEncontrados = socios || [];
        this.mostrarResultadosBusqueda = this.sociosEncontrados.length > 0;

        if (this.sociosEncontrados.length === 0) {
          this.mensajeError = 'No se encontraron socios con ese ID o DPI';
        }
      },
      error: (error) => {
        console.error('Error al buscar socios:', error);
        this.buscandoSocios = false;
        this.mensajeError = 'Error al buscar socios. Inténtelo nuevamente.';
        this.sociosEncontrados = [];
        this.mostrarResultadosBusqueda = false;
      }
    });
  }

  private buscarSocios(termino: string) {
    return this.servicio.query({
      ruta: 'contabilidad/buscar_socios',
      tipo: 'post',
      body: { termino }
    }).pipe(
      switchMap(res => {
        if (res.respuesta === 'success') {
          return of(res.datos || []);
        } else {
          throw new Error(res.mensaje || 'Error al buscar socios');
        }
      }),
      catchError(error => {
        console.error('Error en buscarSocios:', error);
        throw error;
      })
    );
  }

  /**
   * Selecciona un socio de los resultados de búsqueda
   */
  seleccionarSocio(socio: Socio): void {
    this.socioSeleccionado = socio;
    this.mostrarResultadosBusqueda = false;
    this.mostrarDetallesSocio = true;
    this.limpiarMensajeError();

    // Actualizar el campo de búsqueda con el socio seleccionado
    this.buscadorSocio.setValue(`${socio.id_socio} - ${socio.nombre}`, { emitEvent: false });

    // Actualizar el formulario
    this.form.patchValue({
      id_socio: socio.id_socio,
      id_cuenta: '' // Limpiar cuenta seleccionada al cambiar socio
    });

    // Cargar las cuentas del socio
    this.cargarCuentasSocio(socio.id_socio);
  }

  /**
   * Carga las cuentas de un socio específico
   */
  private cargarCuentasSocio(idSocio: number): void {
    this.cargandoCuentas = true;
    this.cuentasSocio = [];
    this.limpiarMensajeError();

    this.servicio.query({
      ruta: 'contabilidad/buscar_cuentas',
      tipo: 'post',
      body: { id_socio: idSocio }
    }).subscribe({
      next: res => {
        this.cargandoCuentas = false;
        if (res.respuesta === 'success') {
          this.cuentasSocio = res.datos || [];
          if (this.cuentasSocio.length === 0) {
            this.mensajeError = 'Este socio no tiene cuentas disponibles';
          }
        } else {
          this.mensajeError = res.mensaje || 'Error al cargar las cuentas del socio';
        }
      },
      error: error => {
        this.cargandoCuentas = false;
        console.error('Error al cargar cuentas:', error);
        this.mensajeError = 'Error al cargar las cuentas del socio. Inténtelo nuevamente.';
      }
    });
  }

  /**
   * Carga un socio por su ID (usado en modo edición)
   */
  private cargarSocioPorId(idSocio: number): void {
    this.servicio.query({
      ruta: 'contabilidad/obtener_socio',
      tipo: 'post',
      body: { id_socio: idSocio }
    }).subscribe({
      next: res => {
        if (res.respuesta === 'success' && res.datos) {
          this.seleccionarSocio(res.datos);
        } else {
          this.mensajeError = 'Error al cargar los datos del socio';
        }
      },
      error: error => {
        console.error('Error al cargar socio:', error);
        this.mensajeError = 'Error al cargar los datos del socio';
      }
    });
  }

  /**
   * Limpia la selección de socio y resetea el formulario
   */
  limpiarSeleccionSocio(): void {
    this.socioSeleccionado = null;
    this.cuentasSocio = [];
    this.mostrarDetallesSocio = false;
    this.mostrarResultadosBusqueda = false;
    this.sociosEncontrados = [];
    this.limpiarMensajeError();
    this.buscadorSocio.setValue('');

    this.form.patchValue({
      id_socio: '',
      id_cuenta: ''
    });
  }

  /**
   * Limpia el mensaje de error
   */
  private limpiarMensajeError(): void {
    this.mensajeError = '';
  }

  /**
   * Obtiene el nombre del producto de manera más legible
   */
  obtenerNombreProducto(producto: string): string {
    if (!producto) return 'Cuenta';

    // Convertir "114A.AHORRO.DISPONIBLE" a "Ahorro Disponible"
    const partes = producto.split('.');
    if (partes.length >= 2) {
      return partes.slice(1).join(' ').toLowerCase()
        .replace(/\b\w/g, l => l.toUpperCase());
    }

    return producto;
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

    // Buscar la cuenta seleccionada por NumeroCuenta
    const cuentaSeleccionada = this.cuentasSocio.find(c =>
      c.NumeroCuenta === Number(this.form.value.id_cuenta)
    );

    // Emitir los datos del formulario específico combinados con datos del socio
    const payload = {
      ...this.data, // Datos del formulario principal
      ...this.form.value,  // Datos específicos del formulario de depósito
      forma_pago: 'deposito',
      // Información adicional del socio y cuenta
      nombre_socio: this.socioSeleccionado?.nombre || '',
      numero_cuenta_deposito: cuentaSeleccionada?.NumeroCuenta?.toString() || '',
      producto_cuenta: cuentaSeleccionada?.Producto || ''
    };

    this.guardar.emit(payload);
  }
}
