// ============================================================================
// MODAL CONFIRMAR ELIMINACIÓN - REFACTORIZADO CON ESTILO LIQUIDACIÓN VERIFICACIÓN
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';

@Component({
  selector: 'app-modal-confirmar-eliminacion-presupuesto',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal-confirmar-eliminacion.component.html',
})
export class ModalConfirmarEliminacionComponentpresupuesto {
  @Input() titulo = 'Confirmar eliminación';
  @Input() mensaje = '¿Está seguro que desea eliminar este elemento?';

  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  /**
   * Manejar clic en el backdrop para cerrar modal
   */
  @HostListener('click', ['$event'])
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelar.emit();
    }
  }

  /**
   * Cerrar con Escape
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    this.cancelar.emit();
  }
}