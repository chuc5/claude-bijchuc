<?php

declare(strict_types=1);

namespace App\inventarioApi\Services;

use App\inventarioApi\Enums\EstadoCompra;
use App\inventarioApi\Enums\TipoOrigenCompra;
use App\inventarioApi\Helpers\RolCompraHelper;
use App\inventarioApi\Repositories\CompraRepository;
use Exception;
use PDO;

/**
 * FLUJO 4 — Compra extraordinaria directa creada por el Administrador,
 * sin solicitud previa. Por regla de negocio, SIEMPRE nace en
 * REQUIERE_AUTORIZACION: cambia REQUIERE_AUTORIZACION_GERENCIA si esa
 * regla cambia; el resto del ciclo de vida no se toca porque vive en
 * CompraService.
 */
final class CompraExtraordinariaService
{
    public const REQUIERE_AUTORIZACION_GERENCIA = true;

    public function __construct(
        private PDO $connect,
        private CompraRepository $repo,
        private CompraService $compraService,
    ) {
    }

    /** @param array<array{id_producto:int,id_unidad:int,cantidad:float}> $lineas */
    public function crearOrden(int $idBodega, string $idUsuarioAdmin, ?int $idPuestoSesion, array $lineas): int
    {
        if (!RolCompraHelper::esAdministradorBodegas($idPuestoSesion)) {
            throw new Exception('Solo el Administrador de Bodegas puede crear compras extraordinarias');
        }

        $bodega = $this->repo->obtenerBodegaActiva($idBodega);
        if (!$bodega) {
            throw new Exception('La bodega destino seleccionada no existe o se encuentra inactiva');
        }

        $this->validarLineas($lineas);

        $estadoInicial = self::REQUIERE_AUTORIZACION_GERENCIA
            ? EstadoCompra::REQUIERE_AUTORIZACION
            : EstadoCompra::APROBADA;

        return $this->compraService->crear(
            idBodega: $idBodega,
            tipoOrigen: TipoOrigenCompra::EXTRAORDINARIA,
            estadoInicial: $estadoInicial,
            lineas: $lineas,
            idUsuarioAdmin: $idUsuarioAdmin,
            requiereAutorizacion: self::REQUIERE_AUTORIZACION_GERENCIA,
        );
    }

    private function validarLineas(array $lineas): void
    {
        if (empty($lineas)) {
            throw new Exception('Debe indicar al menos una línea de producto para la compra extraordinaria');
        }

        $stmt = $this->connect->prepare(
            'SELECT COUNT(*) FROM bodega_inventario.productos_unidades WHERE id_producto = ? AND id_unidad = ? AND activo = 1'
        );

        foreach ($lineas as $i => $linea) {
            $idProducto = (int) ($linea['id_producto'] ?? 0);
            $idUnidad   = (int) ($linea['id_unidad'] ?? 0);
            $cantidad   = (float) ($linea['cantidad'] ?? 0);

            if ($idProducto < 1 || $idUnidad < 1 || $cantidad <= 0) {
                throw new Exception('Error de consistencia: la línea #' . ($i + 1) . ' tiene campos obligatorios vacíos o una cantidad inválida');
            }

            $stmt->execute([$idProducto, $idUnidad]);
            if ((int) $stmt->fetchColumn() === 0) {
                throw new Exception('La línea #' . ($i + 1) . ' tiene una combinación de producto/unidad no válida o inactiva');
            }
        }
    }
}