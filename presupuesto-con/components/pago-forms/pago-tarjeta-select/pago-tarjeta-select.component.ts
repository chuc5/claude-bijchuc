
// ============================================================================
// SELECTOR PAGO TARJETA - REFACTORIZADO
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-select-pago-tarjeta-presupuesto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pago-tarjeta-select.component.html',
})
export class PagoTarjetaSelectComponentpresupuesto {
  @Input() data: any | null = null;
  @Output() guardar = new EventEmitter<any>();

  nota = '';

  ngOnInit() {
    if (this.data?.nota) this.nota = this.data.nota;
  }

  submit() {
    this.guardar.emit({ nota: this.nota });
  }
}