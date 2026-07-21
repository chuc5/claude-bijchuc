// ============================================================================
// COMPONENTE — BUSCADOR DE PRODUCTO (combobox con búsqueda interactiva)
//
// Reemplaza al <select>/<ng-select> de producto en los 3 modales de
// creación de compra (Agencia, Área, Extraordinaria). Con catálogos
// grandes, filtra mientras se escribe (client-side, instantáneo, sin
// viajes al servidor) y soporta teclado (↑ ↓ Enter Esc).
//
// USO (dentro de cada línea del FormArray, reemplaza el selector de producto):
//
//   <app-buscador-producto
//       [productos]="productos()"
//       [seleccionadoId]="linea.get('id_producto')?.value"
//       [invalido]="esInvalido(i, 'id_producto')"
//       (seleccionado)="onProductoSeleccionado(i, $event)">
//   </app-buscador-producto>
//
// Es un componente de presentación puro: no conoce el servicio ni el
// formulario padre, solo recibe el catálogo y emite la selección.
// ============================================================================

import { CommonModule } from '@angular/common';
import {
    Component, Input, Output, EventEmitter, OnChanges, SimpleChanges,
    signal, computed, ElementRef, inject, HostListener,
} from '@angular/core';
import { LucideAngularModule, Search, ChevronDown, XCircle } from 'lucide-angular';

import { ProductoCatalogo } from '../models/producto-catalogo.models';

@Component({
    selector: 'app-buscador-producto',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    template: `
    <div class="relative">
        <!-- Campo de búsqueda / valor seleccionado -->
        <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                <lucide-icon [img]="Search" class="w-3 h-3 text-gray-400"></lucide-icon>
            </div>
            <input type="text"
                [value]="abierto() ? textoBusqueda() : (productoSeleccionado()?.nombre ?? '')"
                (focus)="abrir()"
                (input)="onBusqueda($any($event.target).value)"
                (keydown)="onTecla($event)"
                [placeholder]="placeholder"
                class="w-full pl-7 pr-12 text-xs border rounded px-2 py-1.5 bg-white text-gray-700
                       focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
                [ngClass]="invalido ? 'border-red-300' : 'border-gray-300'" />
            <div class="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
                <button type="button" *ngIf="productoSeleccionado()" (click)="limpiar($event)"
                    class="text-gray-300 hover:text-gray-500 transition" tabindex="-1">
                    <lucide-icon [img]="XCircle" class="w-3 h-3"></lucide-icon>
                </button>
                <lucide-icon [img]="ChevronDown" class="w-3 h-3 text-gray-400 pointer-events-none"
                    [class.rotate-180]="abierto()"></lucide-icon>
            </div>
        </div>

        <!-- Lista filtrada -->
        <div *ngIf="abierto()"
            class="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200
                   rounded-lg shadow-lg divide-y divide-gray-50">
            <p *ngIf="filtrados().length === 0" class="px-3 py-2.5 text-xs text-gray-400">
                Ningún producto coincide con "{{ textoBusqueda() }}".
            </p>
            <button type="button" *ngFor="let p of filtrados(); let i = index"
                (mousedown)="seleccionar(p, $event)"
                class="w-full text-left px-3 py-2 text-xs transition"
                [ngClass]="i === indiceActivo()
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'text-gray-700 hover:bg-gray-50'">
                <span class="font-medium">{{ p.nombre }}</span>
                <span class="text-gray-400 ml-1.5">{{ p.tipo }}</span>
            </button>
        </div>
    </div>
    `,
})
export class BuscadorProductoComponent implements OnChanges {

    /** Catálogo completo a filtrar */
    @Input({ required: true }) productos: ProductoCatalogo[] = [];
    /** id del producto ya seleccionado (para precargar al editar) */
    @Input() seleccionadoId: number | null = null;
    /** Pinta el borde rojo (misma convención que el resto de formularios) */
    @Input() invalido = false;
    @Input() placeholder = 'Buscar producto...';

    @Output() seleccionado = new EventEmitter<ProductoCatalogo>();

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    readonly Search = Search;
    readonly ChevronDown = ChevronDown;
    readonly XCircle = XCircle;

    readonly abierto = signal<boolean>(false);
    readonly textoBusqueda = signal<string>('');
    readonly indiceActivo = signal<number>(0);
    readonly productoSeleccionado = signal<ProductoCatalogo | null>(null);

    /** Filtrado instantáneo en el cliente mientras se escribe */
    readonly filtrados = computed<ProductoCatalogo[]>(() => {
        const q = this.textoBusqueda().trim().toLowerCase();
        if (!q) return this.productos;
        return this.productos.filter(p =>
            p.nombre.toLowerCase().includes(q) || p.tipo.toLowerCase().includes(q));
    });

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['seleccionadoId'] || changes['productos']) {
            const p = this.productos.find(x => x.id === Number(this.seleccionadoId)) ?? null;
            this.productoSeleccionado.set(p);
        }
    }

    /** Cierra la lista al hacer clic fuera del componente */
    @HostListener('document:mousedown', ['$event'])
    onClickFuera(e: MouseEvent): void {
        if (this.abierto() && !this.host.nativeElement.contains(e.target as Node)) {
            this.cerrar();
        }
    }

    abrir(): void {
        this.textoBusqueda.set('');
        this.indiceActivo.set(0);
        this.abierto.set(true);
    }

    cerrar(): void { this.abierto.set(false); }

    onBusqueda(valor: string): void {
        this.textoBusqueda.set(valor);
        this.indiceActivo.set(0);
        if (!this.abierto()) this.abierto.set(true);
    }

    onTecla(e: KeyboardEvent): void {
        const lista = this.filtrados();
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.indiceActivo.update(i => Math.min(i + 1, lista.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.indiceActivo.update(i => Math.max(i - 1, 0));
                break;
            case 'Enter': {
                e.preventDefault();
                const p = lista[this.indiceActivo()];
                if (p) this.seleccionar(p);
                break;
            }
            case 'Escape':
                this.cerrar();
                break;
        }
    }

    seleccionar(p: ProductoCatalogo, e?: Event): void {
        e?.preventDefault(); // mousedown: evita perder el foco antes de seleccionar
        this.productoSeleccionado.set(p);
        this.cerrar();
        this.seleccionado.emit(p);
    }

    limpiar(e: Event): void {
        e.stopPropagation();
        this.productoSeleccionado.set(null);
        this.abrir();
    }
}