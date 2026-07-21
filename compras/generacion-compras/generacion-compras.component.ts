// ============================================================================
// COMPONENTE — GENERACIÓN DE COMPRAS (Trimestral + Extraordinaria)
// ============================================================================

import { CommonModule } from '@angular/common';
import { Component, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import {
    LucideAngularModule,
    CalendarClock, Zap, Info, PackageSearch, ArrowRight,
} from 'lucide-angular';

import Swal from 'sweetalert2';

import { CompraGeneradaTrimestral } from '../models/compras-generacion.models';
import { ComprasGeneracionService } from '../services/compras-generacion.service';
import { ModalCrearExtraordinariaComponent } from './modal-crear-extraordinaria/modal-crear-extraordinaria.component';

@Component({
    selector: 'app-generacion-compras',
    standalone: true,
    imports: [CommonModule, LucideAngularModule, ModalCrearExtraordinariaComponent],
    templateUrl: './generacion-compras.component.html',
    styleUrls: ['./generacion-compras.component.css'],
})
export class GeneracionComprasComponent {

    // ── Dependencias ──────────────────────────────────────────────────────────
    private readonly service = inject(ComprasGeneracionService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly router = inject(Router);

    // ── Iconos ────────────────────────────────────────────────────────────────
    readonly CalendarClock = CalendarClock;
    readonly Zap = Zap;
    readonly Info = Info;
    readonly PackageSearch = PackageSearch;
    readonly ArrowRight = ArrowRight;

    // ── Estado ────────────────────────────────────────────────────────────────
    readonly generandoTrimestral = toSignal(this.service.generandoTrimestral$, { initialValue: false });
    readonly ultimoResultado = signal<CompraGeneradaTrimestral[] | null>(null);
    readonly mostrarModalExtraordinaria = signal<boolean>(false);

    // ── Trimestral ────────────────────────────────────────────────────────────

    confirmarGenerarTrimestral(): void {
        Swal.fire({
            title: '¿Generar compras trimestrales?',
            html: `Se calculará el consumo promedio de los últimos 3 meses por bodega
                   y se creará una compra por cada bodega con necesidad detectada.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#6366f1',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Sí, generar',
            cancelButtonText: 'Cancelar',
            customClass: { popup: 'rounded-lg' },
        }).then(r => {
            if (r.isConfirmed) this._generarTrimestral();
        });
    }

    private _generarTrimestral(): void {
        this.service.generarTrimestrales()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(resultado => {
                this.ultimoResultado.set(resultado?.ordenes ?? null);
            });
    }

    irAMesaTrabajo(idCompra: number): void {
        this.router.navigate(['/inventario/compras/mesa-trabajo', idCompra]);
    }

    // ── Extraordinaria ────────────────────────────────────────────────────────

    abrirModalExtraordinaria(): void {
        this.mostrarModalExtraordinaria.set(true);
    }

    cerrarModalExtraordinaria(): void {
        this.mostrarModalExtraordinaria.set(false);
    }

    onExtraordinariaCreada(): void {
        this.cerrarModalExtraordinaria();
        Swal.fire({
            icon: 'info',
            title: 'Compra registrada',
            text: 'La compra extraordinaria quedó a la espera de autorización de Gerencia/Financiero.',
        });
    }

    // ── Helpers del template ──────────────────────────────────────────────────

    trackByCompraGenerada = (_: number, c: CompraGeneradaTrimestral) => c.id_compra;
}