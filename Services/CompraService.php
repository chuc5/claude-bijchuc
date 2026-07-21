<?php

declare(strict_types=1);

namespace App\inventarioApi\Services;

use App\inventarioApi\Enums\EstadoCompra;
use App\inventarioApi\Enums\TipoBodega;
use App\inventarioApi\Enums\TipoOrigenCompra;
use App\inventarioApi\Repositories\CompraRepository;
use Exception;

/**
 * CompraService
 *
 * Máquina de estados ÚNICA para toda compra, sin importar su origen
 * (Agencia, Área, Trimestral, Extraordinaria). Reemplaza:
 *   - SolicitudCompraHelper (crear + decidir)
 *   - OrdenCompraHelper     (ajustar/autorizar/comprar/enviar/registrar/cancelar)
 *   - OrdenCompraAreaHelper (auto-envío para bodega de área)
 *   - CompraHelper          (duplicado sin uso real, eliminado)
 *
 * El auto-envío para bodegas de Área ya no es una subclase: es una regla
 * de negocio explícita (`tipoBodegaGestion === AREA`) evaluada dentro de
 * marcarLineaComprada(). Composición sobre herencia: un solo camino de
 * código, más fácil de auditar y de testear.
 *
 * Convención: no abre ni hace commit/rollback de transacciones — eso es
 * responsabilidad del controlador que invoca.
 */
final class CompraService
{
    public function __construct(private CompraRepository $repo)
    {
    }

    // =====================================================================
    // CREACIÓN
    // =====================================================================

    /**
     * @param array<array{id_producto:int,id_unidad:int,cantidad:float,justificacion?:?string}> $lineas
     */
    public function crear(
        int $idBodega,
        TipoOrigenCompra $tipoOrigen,
        EstadoCompra $estadoInicial,
        array $lineas,
        ?string $idUsuarioSolicitante = null,
        ?string $idUsuarioAdmin = null,
        bool $requiereAutorizacion = false,
    ): int {
        if (empty($lineas)) {
            throw new Exception('Debe indicar al menos una línea de producto');
        }

        $idCompra = $this->repo->crearCompra([
            'id_bodega'               => $idBodega,
            'id_tipo_origen'          => $tipoOrigen->value,
            'id_estado'               => $estadoInicial->value,
            'id_usuario_solicitante'  => $idUsuarioSolicitante,
            'id_usuario_admin'        => $idUsuarioAdmin,
            'requiere_autorizacion'   => $requiereAutorizacion ? 1 : 0,
        ]);

        $this->repo->agregarLineas($idCompra, array_map(
            static fn (array $l) => [
                'id_producto'         => $l['id_producto'],
                'id_unidad'           => $l['id_unidad'],
                'id_bodega_destino'   => $idBodega,
                'cantidad_solicitada' => $l['cantidad'],
                'justificacion'       => $l['justificacion'] ?? null,
                // Opcionales — solo aplican si el producto es de control Correlativo;
                // si el usuario no los llenó, quedan NULL y se completan al recibir el lote.
                'serie'               => $l['serie'] ?? null,
                'resolucion'          => $l['resolucion'] ?? null,
                'fecha_resolucion'    => $l['fecha_resolucion'] ?? null,
                'correlativo_inicial' => $l['correlativo_inicial'] ?? null,
                'correlativo_final'   => $l['correlativo_final'] ?? null,
            ],
            $lineas
        ));

        return $idCompra;
    }

    // =====================================================================
    // DECISIÓN DEL GESTOR (aprobar / rechazar) — flujos Agencia y Área
    // =====================================================================
    /** json_decode entrega cada línea del payload como stdClass, no como array. */
    private function normalizarLinea($linea): array
    {
        return is_array($linea) ? $linea : (array) $linea;
    }
    /**
     * @param array<array{id_linea:int,cantidad_ajustada:float}> $lineasAjuste Solo líneas que el gestor decide bajar/ajustar
     */
    public function decidirSolicitud(int $idCompra, bool $aprueba, string $idUsuarioGestor, string $comentario, array $lineasAjuste = []): void
    {
        $compra = $this->obtenerCompraOFallar($idCompra);
        $this->exigirEstado($compra, EstadoCompra::SOLICITADA);

        if (!$aprueba) {
            $this->repo->registrarGestion($idCompra, EstadoCompra::RECHAZADA, $idUsuarioGestor, $comentario);
            return;
        }

        foreach ($lineasAjuste as $i => $linea) {
            $linea    = $this->normalizarLinea($linea);
            $idLinea  = (int) ($linea['id_linea'] ?? 0);
            $cantidad = (float) ($linea['cantidad_ajustada'] ?? 0);

            if ($idLinea < 1 || $cantidad <= 0) {
                throw new Exception('Error de consistencia: la línea #' . ($i + 1) . ' tiene datos de ajuste inválidos');
            }

            $this->repo->ajustarCantidadLinea($idLinea, $cantidad);
        }

        $this->repo->registrarGestion($idCompra, EstadoCompra::APROBADA, $idUsuarioGestor, $comentario);
    }

    public function cancelarSolicitud(int $idCompra, string $idUsuarioSesion): void
    {
        $compra = $this->obtenerCompraOFallar($idCompra);

        if ($compra->id_usuario_solicitante !== $idUsuarioSesion) {
            throw new Exception('Solo el usuario que creó la solicitud puede cancelarla');
        }

        $this->exigirEstado($compra, EstadoCompra::SOLICITADA);
        $this->repo->registrarGestion($idCompra, EstadoCompra::CANCELADA, $idUsuarioSesion, 'Cancelada por el solicitante');
    }

    // =====================================================================
    // AUTORIZACIÓN DE GERENCIA/FINANCIERO
    // =====================================================================

    public function autorizar(int $idCompra, bool $autoriza, string $idUsuarioAutorizador, string $comentario): void
    {
        $compra = $this->obtenerCompraOFallar($idCompra);
        $this->exigirEstado($compra, EstadoCompra::REQUIERE_AUTORIZACION);

        $nuevoEstado = $autoriza ? EstadoCompra::APROBADA : EstadoCompra::RECHAZADA;
        $this->repo->registrarAutorizacion($idCompra, $nuevoEstado, $idUsuarioAutorizador, $comentario);
    }

    // =====================================================================
    // MESA DE TRABAJO — ajuste de cantidad
    // =====================================================================

    public function ajustarCantidadLinea(int $idCompra, int $idLinea, float $cantidadAjustada): void
    {
        $compra = $this->obtenerCompraOFallar($idCompra);
        $this->exigirEstado($compra, EstadoCompra::APROBADA);

        $linea = $this->obtenerLineaOFallar($idCompra, $idLinea);

        if ((bool) $linea->comprado_con_precio) {
            throw new Exception('No se puede ajustar la cantidad de una línea que ya fue comprada');
        }

        if ($cantidadAjustada <= 0) {
            throw new Exception('La cantidad ajustada debe ser mayor a cero');
        }

        $tipoBodegaDestino = TipoBodega::from((int) $linea->tipo_bodega_destino);
        $esAlza = $cantidadAjustada > (float) $linea->cantidad_solicitada;

        if ($esAlza && !$tipoBodegaDestino->permiteAlza()) {
            throw new Exception('Para bodegas de agencia solo se permite ajustar la cantidad a la baja, no incrementarla');
        }

        $this->repo->ajustarCantidadLinea($idLinea, $cantidadAjustada);
        $this->recalcularRequiereAutorizacion($idCompra);
    }

    private function recalcularRequiereAutorizacion(int $idCompra): void
    {
        $compra = $this->obtenerCompraOFallar($idCompra);

        if (EstadoCompra::from((int) $compra->id_estado)->esFinal()) {
            return;
        }

        $hayAlza = $this->repo->hayLineasEnAlza($idCompra);
        $this->repo->actualizarRequiereAutorizacion($idCompra, $hayAlza);
        $this->repo->actualizarEstado($idCompra, $hayAlza ? EstadoCompra::REQUIERE_AUTORIZACION : EstadoCompra::APROBADA);
    }

    // =====================================================================
    // MESA DE TRABAJO — precio y paso a "Comprado" (+ auto-envío de Área)
    // =====================================================================

    /** @return array<int>|null IDs de alta si la compra quedó completa y se auto-envió (bodega de Área); null en cualquier otro caso */
    public function marcarLineaComprada(int $idCompra, int $idLinea, float $precioUnitario, string $idUsuarioSesion): ?array
    {
        if ($precioUnitario <= 0) {
            throw new Exception('El precio unitario debe ser mayor a cero');
        }

        $compra = $this->obtenerCompraOFallar($idCompra);
        $this->exigirEstado($compra, EstadoCompra::APROBADA);

        $linea = $this->obtenerLineaOFallar($idCompra, $idLinea);
        if ((bool) $linea->comprado_con_precio) {
            return null; // ya estaba comprada, no reprocesar (protege el precio histórico)
        }

        $this->repo->marcarLineaComprada($idLinea, $precioUnitario);

        if ($this->repo->contarLineasSinComprar($idCompra) > 0) {
            return null; // aún faltan líneas por fijar precio
        }

        $this->repo->actualizarEstado($idCompra, EstadoCompra::COMPRADA);

        // Regla de negocio (antes vivía en OrdenCompraAreaHelper): si quien
        // GESTIONA la compra es una bodega de Área, el encargado que aprueba
        // es el mismo que recibe físicamente, así que se envía de inmediato.
        if (TipoBodega::from((int) $compra->tipo_bodega_gestion) === TipoBodega::AREA) {
            return $this->enviar($idCompra, $compra->id_usuario_admin ?? $idUsuarioSesion);
        }

        return null;
    }

    // =====================================================================
    // PROCESAMIENTO EN LOTE (ajustes + precios + auto-envío, una sola transacción)
    // =====================================================================

    /**
     * @param array<array{id_linea:int,cantidad_ajustada?:?float,precio_unitario?:?float}> $lineas
     * @return array{lineas_ajustadas:int,lineas_compradas:int,requiere_autorizacion:bool,altas_generadas:bool,ids_altas:array<int>}
     */
    public function procesarLineas(int $idCompra, array $lineas, string $idUsuarioSesion): array
    {
        if (empty($lineas)) {
            throw new Exception('No se recibió ningún cambio para procesar');
        }

        $compra = $this->obtenerCompraOFallar($idCompra);
        $this->exigirEstado($compra, EstadoCompra::APROBADA);

        $ajustadas = 0;
        foreach ($lineas as $i => $linea) {
            $linea   = $this->normalizarLinea($linea);
            $idLinea = (int) ($linea['id_linea'] ?? 0);
            if ($idLinea < 1) {
                throw new Exception('Error de consistencia: la línea #' . ($i + 1) . ' no incluye id_linea');
            }

            if (isset($linea['cantidad_ajustada']) && $linea['cantidad_ajustada'] !== null && $linea['cantidad_ajustada'] !== '') {
                $this->ajustarCantidadLinea($idCompra, $idLinea, (float) $linea['cantidad_ajustada']);
                $ajustadas++;
            }
        }

        // Un alza pudo haber movido la compra a REQUIERE_AUTORIZACION: cortar aquí.
        $compra = $this->obtenerCompraOFallar($idCompra);
        if (EstadoCompra::from((int) $compra->id_estado) === EstadoCompra::REQUIERE_AUTORIZACION) {
            return [
                'lineas_ajustadas' => $ajustadas, 'lineas_compradas' => 0,
                'requiere_autorizacion' => true, 'altas_generadas' => false, 'ids_altas' => [],
            ];
        }

        $compradas = 0;
        $idsAltas  = null; // null = aún no se envía; array = auto-enviada (bodega de Área)

        foreach ($lineas as $linea) {
            $linea  = $this->normalizarLinea($linea);
            $precio = isset($linea['precio_unitario']) ? (float) $linea['precio_unitario'] : 0.0;
            if ($precio <= 0) {
                continue;
            }

            $resultadoEnvio = $this->marcarLineaComprada($idCompra, (int) $linea['id_linea'], $precio, $idUsuarioSesion);
            $compradas++;

            if ($resultadoEnvio !== null) {
                $idsAltas = $resultadoEnvio;
            }
        }

        // Bodegas distintas de Área requieren el envío explícito (mismo comportamiento anterior).
        if ($idsAltas === null) {
            $compra = $this->obtenerCompraOFallar($idCompra);
            if (EstadoCompra::from((int) $compra->id_estado) === EstadoCompra::COMPRADA) {
                $idsAltas = $this->enviar($idCompra, $idUsuarioSesion);
            }
        }

        return [
            'lineas_ajustadas' => $ajustadas, 'lineas_compradas' => $compradas,
            'requiere_autorizacion' => false, 'altas_generadas' => $idsAltas !== null, 'ids_altas' => $idsAltas ?? [],
        ];
    }

    // =====================================================================
    // ENVÍO — genera las altas físicas
    // =====================================================================

    /** @return array<int> IDs de las altas generadas */
    public function enviar(int $idCompra, string $idUsuarioAdmin): array
    {
        $compra = $this->obtenerCompraOFallar($idCompra);
        $this->exigirEstado($compra, EstadoCompra::COMPRADA);

        $lineas = $this->repo->obtenerLineasParaAlta($idCompra);
        if (empty($lineas)) {
            throw new Exception('No hay líneas pendientes de generar alta en esta compra');
        }

        $idsAltas = [];
        foreach ($lineas as $linea) {
            $idAlta = $this->repo->insertarAlta($idCompra, $linea, $idUsuarioAdmin);
            $this->repo->vincularAlta((int) $linea->id, $idAlta);
            $idsAltas[] = $idAlta;
        }

        $this->repo->actualizarEstado($idCompra, EstadoCompra::ENVIADA);

        return $idsAltas;
    }

    // =====================================================================
    // CIERRE Y CANCELACIÓN
    // =====================================================================

    public function registrar(int $idCompra): void
    {
        $compra = $this->obtenerCompraOFallar($idCompra);
        $this->exigirEstado($compra, EstadoCompra::ENVIADA);
        $this->repo->actualizarEstado($idCompra, EstadoCompra::REGISTRADA);
    }

    public function cancelar(int $idCompra): void
    {
        $compra = $this->obtenerCompraOFallar($idCompra);
        $estado = EstadoCompra::from((int) $compra->id_estado);

        if (!$estado->esCancelable()) {
            throw new Exception('Solo se pueden cancelar compras que aún no tienen ninguna línea comprada');
        }

        $this->repo->actualizarEstado($idCompra, EstadoCompra::CANCELADA);
    }

    // =====================================================================
    // Utilidades internas
    // =====================================================================

    private function obtenerCompraOFallar(int $idCompra): object
    {
        $compra = $this->repo->obtenerCompraConBloqueo($idCompra);
        if (!$compra) {
            throw new Exception('La compra indicada no existe');
        }

        return $compra;
    }

    private function obtenerLineaOFallar(int $idCompra, int $idLinea): object
    {
        $linea = $this->repo->obtenerLineaConBloqueo($idCompra, $idLinea);
        if (!$linea) {
            throw new Exception('La línea indicada no existe en esta compra');
        }

        return $linea;
    }

    private function exigirEstado(object $compra, EstadoCompra $esperado): void
    {
        $actual = EstadoCompra::from((int) $compra->id_estado);
        if ($actual !== $esperado) {
            throw new Exception("Esta operación requiere que la compra esté en estado '{$esperado->nombre()}' (estado actual: '{$actual->nombre()}')");
        }
    }
}