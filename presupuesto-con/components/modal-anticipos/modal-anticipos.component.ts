// ============================================================================
// MODAL DE ANTICIPOS - DESDE CERO
// components/modal-anticipos/modal-anticipos.component.ts
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal, inject, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';

import {
  OrdenesPlanEmpresarialService,
  AnticipoPE,
  SolicitudAutorizacionPE
} from '../../services/ordenes-presupuesto.service';
import { formatearMonto, formatearFecha } from '../../utils/format.utils';

@Component({
  selector: 'app-modal-anticipos-presupuesto',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal-anticipos.component.html',
})
export class ModalAnticiposComponentpresupuesto implements OnChanges, OnDestroy {
  @Input() numeroOrden: number = 0;
  @Output() cerrar = new EventEmitter<void>();
  @Output() solicitudExitosa = new EventEmitter<void>();

  private readonly service = inject(OrdenesPlanEmpresarialService);
  private readonly destroy$ = new Subject<void>();

  // Estado del componente usando signals
  readonly anticipos = signal<AnticipoPE[]>([]);
  readonly cargando = signal<boolean>(false);
  readonly enviando = signal<boolean>(false);

  // Importar funciones de utilidad
  readonly formatearMonto = formatearMonto;
  readonly formatearFecha = formatearFecha;

  ngOnChanges(changes: SimpleChanges): void {
    if ('numeroOrden' in changes && this.numeroOrden > 0) {
      this.inicializarComponente();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================================
  // INICIALIZACIÓN Y CONFIGURACIÓN
  // ============================================================================

  private inicializarComponente(): void {
    // Suscribirse a los streams del servicio
    this.service.anticipos$
      .pipe(takeUntil(this.destroy$))
      .subscribe(anticipos => this.anticipos.set(anticipos));

    this.service.cargandoAnticipos$
      .pipe(takeUntil(this.destroy$))
      .subscribe(cargando => this.cargando.set(cargando));

    this.service.enviandoSolicitud$
      .pipe(takeUntil(this.destroy$))
      .subscribe(enviando => this.enviando.set(enviando));

    // Cargar anticipos para esta orden
    this.service.cargarAnticipos(this.numeroOrden).subscribe();
  }

  // ============================================================================
  // ACCIONES DEL MODAL
  // ============================================================================

  cerrarModal(): void {
    this.cerrar.emit();
  }

  async solicitarAutorizacion(anticipo: AnticipoPE): Promise<void> {
    if (!this.puedeAutorizar(anticipo)) return;

    const justificacion = await this.solicitarJustificacion(anticipo);
    if (!justificacion) return;

    const payload: SolicitudAutorizacionPE = {
      id_solicitud: anticipo.id_solicitud,
      justificacion: justificacion.trim(),
      tipo: 'autorizacion'
    };

    this.service.solicitarAutorizacion(payload).subscribe(exitoso => {
      if (exitoso) {
        // Recargar anticipos y notificar éxito
        this.service.cargarAnticipos(this.numeroOrden).subscribe();
        this.solicitudExitosa.emit();
      }
    });
  }

  // ============================================================================
  // VALIDACIONES DE NEGOCIO
  // ============================================================================

  puedeAutorizar(anticipo: AnticipoPE): boolean {
    return anticipo.requiere_autorizacion &&
      !this.yaTieneSolicitudEnCurso(anticipo) &&
      this.estaFueraDeTiempo(anticipo);
  }

  yaTieneSolicitudEnCurso(anticipo: AnticipoPE): boolean {
    if (!anticipo.ultimo_seguimiento) return false;

    const estado = (anticipo.ultimo_seguimiento.nombre_estado || '').toLowerCase().trim();
    const estadosEnCurso = ['pendiente', 'en proceso', 'en revisión', 'en revision'];

    return estadosEnCurso.includes(estado) && !anticipo.ultimo_seguimiento.fecha_autorizacion;
  }

  estaFueraDeTiempo(anticipo: AnticipoPE): boolean {
    // Por estado de liquidación
    const estadosTardios = ['EN_TIEMPO', 'FUERA_DE_TIEMPO'];
    if (estadosTardios.includes(anticipo.estado_liquidacion)) {
      return true;
    }

    // Por días transcurridos vs permitidos
    if (anticipo.dias_transcurridos !== null && anticipo.dias_transcurridos !== undefined &&
      anticipo.dias_permitidos !== null && anticipo.dias_permitidos !== undefined) {
      return anticipo.dias_transcurridos > anticipo.dias_permitidos;
    }

    return false;
  }

  obtenerAnticiposParaAutorizar(): AnticipoPE[] {
    return this.anticipos().filter(anticipo => this.estaFueraDeTiempo(anticipo));
  }

  // ============================================================================
  // MÉTODOS DE FORMATEO Y UTILIDADES
  // ============================================================================

  obtenerResumenDias(anticipo: AnticipoPE): string | null {
    const transcurridos = anticipo.dias_transcurridos;
    const permitidos = anticipo.dias_permitidos;

    if (transcurridos === null || transcurridos === undefined ||
      permitidos === null || permitidos === undefined) {
      return null;
    }

    return `${transcurridos}/${permitidos} días`;
  }

  obtenerClaseTipo(tipo: string): string {
    const clases: Record<string, string> = {
      'CHEQUE': 'bg-blue-100 text-blue-800 border-blue-200',
      'EFECTIVO': 'bg-green-100 text-green-800 border-green-200',
      'TRANSFERENCIA': 'bg-purple-100 text-purple-800 border-purple-200'
    };
    return clases[tipo] || 'bg-gray-100 text-gray-700 border-gray-200';
  }

  obtenerClaseEstado(estado: string): string {
    const clases: Record<string, string> = {
      'NO_LIQUIDADO': 'bg-gray-100 text-gray-800',
      'RECIENTE': 'bg-green-100 text-green-800',
      'EN_TIEMPO': 'bg-yellow-100 text-yellow-800',
      'FUERA_DE_TIEMPO': 'bg-red-100 text-red-800',
      'LIQUIDADO': 'bg-emerald-100 text-emerald-800'
    };
    return clases[estado] || 'bg-gray-100 text-gray-700';
  }

  obtenerDotEstado(estado: string): string {
    const dots: Record<string, string> = {
      'NO_LIQUIDADO': 'bg-gray-400',
      'RECIENTE': 'bg-green-500',
      'EN_TIEMPO': 'bg-yellow-500',
      'FUERA_DE_TIEMPO': 'bg-red-500',
      'LIQUIDADO': 'bg-emerald-500'
    };
    return dots[estado] || 'bg-gray-400';
  }

  obtenerTextoEstado(estado: string): string {
    const textos: Record<string, string> = {
      'NO_LIQUIDADO': 'Sin liquidar',
      'RECIENTE': 'Reciente',
      'EN_TIEMPO': 'En tiempo',
      'FUERA_DE_TIEMPO': 'Fuera de tiempo',
      'LIQUIDADO': 'Liquidado'
    };
    return textos[estado] || estado;
  }

  obtenerClaseSeguimiento(estado: string | null): string {
    if (!estado) return 'bg-gray-100 text-gray-700';

    const estadoLower = estado.toLowerCase().trim();
    if (estadoLower === 'pendiente') {
      return 'bg-amber-100 text-amber-800';
    }
    if (['aprobado', 'autorizado'].includes(estadoLower)) {
      return 'bg-green-100 text-green-800';
    }
    if (estadoLower === 'rechazado') {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-gray-100 text-gray-700';
  }

  trackByAnticipo(index: number, anticipo: AnticipoPE): number {
    return anticipo.id_solicitud;
  }

  // ============================================================================
  // MÉTODOS PRIVADOS
  // ============================================================================

  private async solicitarJustificacion(anticipo: AnticipoPE): Promise<string | null> {
    const resultado = await Swal.fire({
      title: 'Justificación Requerida',
      html: `
        <div class="text-left mb-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
            <p class="text-sm text-blue-800">
              <strong>Anticipo:</strong> ${anticipo.tipo_anticipo}<br>
              <strong>Monto:</strong> ${this.formatearMonto(anticipo.monto)}<br>
              <strong>Orden:</strong> #${anticipo.numero_orden}
            </p>
          </div>
          <p class="text-sm text-gray-600">
            Proporcione una justificación detallada para la autorización de este anticipo fuera de tiempo.
          </p>
        </div>
      `,
      input: 'textarea',
      inputPlaceholder: 'Escriba la justificación (mínimo 20 caracteres)...',
      inputAttributes: {
        rows: '4',
        style: 'resize: vertical; min-height: 100px; font-family: inherit;',
        maxlength: '500',
        class: 'text-sm'
      },
      showCancelButton: true,
      confirmButtonText: 'Enviar Solicitud',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      width: '550px',
      preConfirm: (valor) => this.validarJustificacion(valor),
      allowOutsideClick: false,
      allowEscapeKey: false
    });

    return resultado.isConfirmed ? (resultado.value as string) : null;
  }

  private validarJustificacion(valor: string): string | false {
    const texto = (valor || '').trim();

    if (!texto) {
      Swal.showValidationMessage('La justificación es obligatoria');
      return false;
    }

    if (texto.length < 20) {
      Swal.showValidationMessage(`Mínimo 20 caracteres requeridos. Actual: ${texto.length}/20`);
      return false;
    }

    if (texto.length > 500) {
      Swal.showValidationMessage(`Máximo 500 caracteres permitidos. Actual: ${texto.length}/500`);
      return false;
    }

    return texto;
  }
}