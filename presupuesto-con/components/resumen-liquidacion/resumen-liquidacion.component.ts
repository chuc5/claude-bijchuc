import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-resumen-liquidacion-presupuesto',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './resumen-liquidacion.component.html',
})
export class ResumenLiquidacionComponentpresupuesto {
    @Input() count = 0;
    @Input() total = 0;
    @Input() montoFactura = 0;
    @Input() estadoMonto: 'completo' | 'incompleto' | 'excedido' = 'incompleto';

    claseEstado(): string {
        const clases = {
            'completo': 'bg-green-100 text-green-800',
            'incompleto': 'bg-yellow-100 text-yellow-800',
            'excedido': 'bg-red-100 text-red-800'
        };
        return clases[this.estadoMonto] || 'bg-gray-100 text-gray-800';
    }
}