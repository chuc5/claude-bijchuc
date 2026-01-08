
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-select-pago-anticipo-presupuesto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pago-anticipo-select.component.html',
})
export class PagoAnticipoSelectComponentpresupuesto {
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