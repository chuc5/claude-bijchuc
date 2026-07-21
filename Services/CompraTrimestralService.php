<?php

declare(strict_types=1);

namespace App\inventarioApi\Services;

use App\inventarioApi\Enums\EstadoCompra;
use App\inventarioApi\Enums\TipoOrigenCompra;
use App\inventarioApi\Helpers\RolCompraHelper;
use Exception;
use PDO;

/**
 * FLUJO 3 — Sugerencia automática de compra por consumo promedio de los
 * últimos N meses, una compra por bodega. Nace directo en APROBADA (sin
 * paso de solicitud/gestor) porque no hay un solicitante humano.
 */
final class CompraTrimestralService
{
    private const MESES_CONSUMO = 3;

    /** Ajustar si el nombre exacto en tu catálogo `tipos_movimiento` difiere. */
    private const NOMBRES_MOVIMIENTO_CONSUMO = [
        'Baja por entrega',
        'Baja por entrega directa',
    ];

    public function __construct(
        private PDO $connect,
        private CompraService $compraService,
    ) {
    }

    /**
     * @return array{ordenes: array<array{id_compra:int,id_bodega:int,lineas:int}>, lineas_sin_necesidad:int}
     */
    public function generarSugerencias(string $idUsuarioAdmin, ?int $idPuestoSesion): array
    {
        if (!RolCompraHelper::esAdministradorBodegas($idPuestoSesion)) {
            throw new Exception('Solo el Administrador de Bodegas puede generar las compras trimestrales');
        }

        $idsMovimiento = $this->resolverIdsTipoMovimiento();
        $porBodega     = [];
        $sinNecesidad  = 0;

        foreach ($this->calcularSugeridaPorLinea($idsMovimiento) as $fila) {
            $sugerida = (float) $fila->consumo_promedio - (float) $fila->cantidad_total;

            if ($sugerida <= 0) {
                $sinNecesidad++;
                continue;
            }

            $porBodega[(int) $fila->id_bodega][] = [
                'id_producto' => (int) $fila->id_producto,
                'id_unidad'   => (int) $fila->id_unidad,
                'cantidad'    => round($sugerida, 2),
            ];
        }

        $comprasGeneradas = [];
        foreach ($porBodega as $idBodega => $lineas) {
            $idCompra = $this->compraService->crear(
                idBodega: $idBodega,
                tipoOrigen: TipoOrigenCompra::TRIMESTRAL,
                estadoInicial: EstadoCompra::APROBADA,
                lineas: $lineas,
                idUsuarioAdmin: $idUsuarioAdmin,
            );

            $comprasGeneradas[] = ['id_compra' => $idCompra, 'id_bodega' => $idBodega, 'lineas' => count($lineas)];
        }

        return ['ordenes' => $comprasGeneradas, 'lineas_sin_necesidad' => $sinNecesidad];
    }

    /** @return array<int> */
    private function resolverIdsTipoMovimiento(): array
    {
        $placeholders = implode(',', array_fill(0, count(self::NOMBRES_MOVIMIENTO_CONSUMO), '?'));
        $stmt = $this->connect->prepare(
            "SELECT id FROM bodega_inventario.tipos_movimiento WHERE nombre IN ({$placeholders})"
        );
        $stmt->execute(self::NOMBRES_MOVIMIENTO_CONSUMO);
        $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

        if (empty($ids)) {
            throw new Exception('No se encontraron en el catálogo los tipos de movimiento configurados para el cálculo trimestral (' . implode(', ', self::NOMBRES_MOVIMIENTO_CONSUMO) . ')');
        }

        return $ids;
    }

    private function calcularSugeridaPorLinea(array $idsMovimiento): array
    {
        $placeholders = implode(',', array_fill(0, count($idsMovimiento), '?'));

        $stmt = $this->connect->prepare(
            "SELECT s.id_bodega, s.id_producto, s.id_unidad, s.cantidad_total,
                    COALESCE(consumo.total_consumido, 0) / ? AS consumo_promedio
             FROM bodega_inventario.stock s
             INNER JOIN bodega_inventario.bodegas b ON b.id = s.id_bodega AND b.activo = 1
             LEFT JOIN (
                 SELECT id_bodega, id_producto, id_unidad, SUM(cantidad) AS total_consumido
                 FROM bodega_inventario.movimientos_stock
                 WHERE id_tipo_movimiento IN ({$placeholders})
                   AND created_at >= (CURRENT_DATE - INTERVAL " . self::MESES_CONSUMO . " MONTH)
                 GROUP BY id_bodega, id_producto, id_unidad
             ) consumo
                 ON consumo.id_bodega = s.id_bodega
                AND consumo.id_producto = s.id_producto
                AND consumo.id_unidad = s.id_unidad"
        );
        $stmt->execute(array_merge([self::MESES_CONSUMO], $idsMovimiento));

        return $stmt->fetchAll(PDO::FETCH_OBJ);
    }
}