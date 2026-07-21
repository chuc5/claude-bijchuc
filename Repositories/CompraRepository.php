<?php

declare(strict_types=1);

namespace App\inventarioApi\Repositories;

use App\inventarioApi\Enums\EstadoCompra;
use App\inventarioApi\Enums\TipoOrigenCompra;
use PDO;

/**
 * CompraRepository
 *
 * Único punto de acceso SQL a `compras` / `compras_detalle`. Los
 * servicios de dominio nunca escriben SQL directamente: piden datos u
 * ordenan cambios de estado a través de este repositorio. Esto hace que
 * un cambio de esquema (ej. renombrar una columna) se resuelva en un solo
 * archivo.
 */
final class CompraRepository
{
    public function __construct(private PDO $connect)
    {
    }

    // ---------------------------------------------------------------
    // Bodegas
    // ---------------------------------------------------------------

    public function obtenerBodegaActiva(int $idBodega): ?object
    {
        $stmt = $this->connect->prepare(
            'SELECT id, id_tipo, id_agencia, restriccion_acceso_activa
             FROM bodega_inventario.bodegas
             WHERE id = ? AND activo = 1
             LIMIT 1'
        );
        $stmt->execute([$idBodega]);

        return $stmt->fetch(PDO::FETCH_OBJ) ?: null;
    }

    // ---------------------------------------------------------------
    // Creación
    // ---------------------------------------------------------------

    /**
     * @param array{
     *   id_bodega:int, id_tipo_origen:int, id_estado:int,
     *   id_usuario_solicitante?:?string, id_usuario_admin?:?string,
     *   requiere_autorizacion?:int
     * } $cabecera
     */
    public function crearCompra(array $cabecera): int
    {
        $stmt = $this->connect->prepare(
            'INSERT INTO bodega_inventario.compras
                (id_bodega, id_tipo_origen, id_estado, id_usuario_solicitante,
                 id_usuario_admin, requiere_autorizacion)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $cabecera['id_bodega'],
            $cabecera['id_tipo_origen'],
            $cabecera['id_estado'],
            $cabecera['id_usuario_solicitante'] ?? null,
            $cabecera['id_usuario_admin'] ?? null,
            $cabecera['requiere_autorizacion'] ?? 0,
        ]);

        return (int) $this->connect->lastInsertId();
    }

    /** @param array<array{id_producto:int,id_unidad:int,id_bodega_destino:int,cantidad_solicitada:float,justificacion?:?string,serie?:?string,resolucion?:?string,fecha_resolucion?:?string,correlativo_inicial?:?int,correlativo_final?:?int}> $lineas */
    public function agregarLineas(int $idCompra, array $lineas): void
    {
        $stmt = $this->connect->prepare(
            'INSERT INTO bodega_inventario.compras_detalle
                (id_compra, id_producto, id_unidad, id_bodega_destino, cantidad_solicitada, justificacion,
                 serie, resolucion, fecha_resolucion, correlativo_inicial, correlativo_final)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        foreach ($lineas as $linea) {
            $stmt->execute([
                $idCompra,
                $linea['id_producto'],
                $linea['id_unidad'],
                $linea['id_bodega_destino'],
                $linea['cantidad_solicitada'],
                $linea['justificacion'] ?? null,
                $linea['serie'] ?? null,
                $linea['resolucion'] ?? null,
                $linea['fecha_resolucion'] ?? null,
                $linea['correlativo_inicial'] ?? null,
                $linea['correlativo_final'] ?? null,
            ]);
        }
    }

    // ---------------------------------------------------------------
    // Lectura con bloqueo (para transiciones de estado)
    // ---------------------------------------------------------------

    public function obtenerCompraConBloqueo(int $idCompra): ?object
    {
        $stmt = $this->connect->prepare(
            'SELECT c.id, c.id_bodega, c.id_tipo_origen, c.id_estado,
                    c.id_usuario_solicitante, c.id_usuario_gestor,
                    c.id_usuario_admin, c.requiere_autorizacion,
                    b.id_tipo AS tipo_bodega_gestion
             FROM bodega_inventario.compras c
             INNER JOIN bodega_inventario.bodegas b ON b.id = c.id_bodega
             WHERE c.id = ?
             FOR UPDATE'
        );
        $stmt->execute([$idCompra]);

        return $stmt->fetch(PDO::FETCH_OBJ) ?: null;
    }

    public function obtenerLineaConBloqueo(int $idCompra, int $idLinea): ?object
    {
        $stmt = $this->connect->prepare(
            'SELECT d.id, d.id_compra, d.id_producto, d.id_unidad, d.id_bodega_destino,
                    d.cantidad_solicitada, d.cantidad_ajustada, d.cantidad_final,
                    d.precio_unitario, d.comprado_con_precio, d.id_alta_generada,
                    b.id_tipo AS tipo_bodega_destino
             FROM bodega_inventario.compras_detalle d
             INNER JOIN bodega_inventario.bodegas b ON b.id = d.id_bodega_destino
             WHERE d.id = ? AND d.id_compra = ?
             FOR UPDATE'
        );
        $stmt->execute([$idLinea, $idCompra]);

        return $stmt->fetch(PDO::FETCH_OBJ) ?: null;
    }

    /** @return object[] */
    public function obtenerLineas(int $idCompra): array
    {
        $stmt = $this->connect->prepare(
            'SELECT d.id, d.id_producto, p.nombre AS producto, d.id_unidad, u.nombre AS unidad, u.abreviatura,
                    d.id_bodega_destino, bd.nombre AS bodega_destino, bd.id_tipo AS tipo_bodega_destino,
                    d.cantidad_solicitada, d.cantidad_ajustada, d.cantidad_final,
                    d.precio_unitario, d.comprado_con_precio, d.fecha_marcado_comprado,
                    d.id_factura, d.id_alta_generada, d.justificacion,
                    d.serie, d.resolucion, d.fecha_resolucion, d.correlativo_inicial, d.correlativo_final
             FROM bodega_inventario.compras_detalle d
             INNER JOIN bodega_inventario.productos p ON p.id = d.id_producto
             INNER JOIN bodega_inventario.unidades_medida u ON u.id = d.id_unidad
             INNER JOIN bodega_inventario.bodegas bd ON bd.id = d.id_bodega_destino
             WHERE d.id_compra = ?
             ORDER BY d.id ASC'
        );
        $stmt->execute([$idCompra]);

        return $stmt->fetchAll(PDO::FETCH_OBJ);
    }

    // ---------------------------------------------------------------
    // Escritura — transiciones de estado
    // ---------------------------------------------------------------

    public function actualizarEstado(int $idCompra, EstadoCompra $estado): void
    {
        $this->connect->prepare(
            'UPDATE bodega_inventario.compras SET id_estado = ? WHERE id = ?'
        )->execute([$estado->value, $idCompra]);
    }

    public function registrarGestion(int $idCompra, EstadoCompra $estado, string $idUsuarioGestor, string $comentario): void
    {
        $this->connect->prepare(
            'UPDATE bodega_inventario.compras
             SET id_estado = ?, id_usuario_gestor = ?, comentario_gestor = ?, fecha_gestion = CURRENT_TIMESTAMP
             WHERE id = ?'
        )->execute([$estado->value, $idUsuarioGestor, $comentario, $idCompra]);
    }

    public function registrarAutorizacion(int $idCompra, EstadoCompra $estado, string $idUsuarioAutorizador, string $comentario): void
    {
        $this->connect->prepare(
            'UPDATE bodega_inventario.compras
             SET id_estado = ?, id_usuario_autorizador = ?, comentario_autorizacion = ?, fecha_autorizacion = CURRENT_TIMESTAMP
             WHERE id = ?'
        )->execute([$estado->value, $idUsuarioAutorizador, $comentario, $idCompra]);
    }

    public function actualizarRequiereAutorizacion(int $idCompra, bool $requiere): void
    {
        $this->connect->prepare(
            'UPDATE bodega_inventario.compras SET requiere_autorizacion = ? WHERE id = ?'
        )->execute([$requiere ? 1 : 0, $idCompra]);
    }

    // ---------------------------------------------------------------
    // Escritura — líneas
    // ---------------------------------------------------------------

    public function ajustarCantidadLinea(int $idLinea, float $cantidad): void
    {
        $this->connect->prepare(
            'UPDATE bodega_inventario.compras_detalle SET cantidad_ajustada = ? WHERE id = ?'
        )->execute([$cantidad, $idLinea]);
    }

    public function marcarLineaComprada(int $idLinea, float $precioUnitario): void
    {
        $this->connect->prepare(
            'UPDATE bodega_inventario.compras_detalle
             SET precio_unitario = ?, comprado_con_precio = 1, fecha_marcado_comprado = CURRENT_TIMESTAMP
             WHERE id = ?'
        )->execute([$precioUnitario, $idLinea]);
    }

    public function vincularAlta(int $idLinea, int $idAlta): void
    {
        $this->connect->prepare(
            'UPDATE bodega_inventario.compras_detalle SET id_alta_generada = ? WHERE id = ?'
        )->execute([$idAlta, $idLinea]);
    }

    /**
     * Inserta el registro físico en `altas` a partir de una línea de
     * compra ya comprada. Vive en este repositorio (y no en un
     * AltaRepository) porque generar el alta es la última transición del
     * ciclo de vida de la compra, no una operación independiente.
     */
    public function insertarAlta(int $idCompra, object $linea, string $idUsuarioAdmin): int
    {
        $stmt = $this->connect->prepare(
            'INSERT INTO bodega_inventario.altas
                (id_bodega_destino, id_producto, id_unidad, cantidad_enviada,
                 cantidad_ingresada, id_estado, id_usuario_admin, id_compra, precio_unitario)
             VALUES (?, ?, ?, ?, 0.00, 1, ?, ?, ?)'
        );
        $stmt->execute([
            (int) $linea->id_bodega_destino,
            (int) $linea->id_producto,
            (int) $linea->id_unidad,
            (float) $linea->cantidad_final,
            $idUsuarioAdmin,
            $idCompra,
            (float) $linea->precio_unitario,
        ]);

        return (int) $this->connect->lastInsertId();
    }


    // ---------------------------------------------------------------
    // Consultas agregadas de apoyo a las transiciones
    // ---------------------------------------------------------------

    public function contarLineasSinComprar(int $idCompra): int
    {
        $stmt = $this->connect->prepare(
            'SELECT COUNT(*) FROM bodega_inventario.compras_detalle
             WHERE id_compra = ? AND comprado_con_precio = 0'
        );
        $stmt->execute([$idCompra]);

        return (int) $stmt->fetchColumn();
    }

    public function hayLineasEnAlza(int $idCompra): bool
    {
        $stmt = $this->connect->prepare(
            'SELECT COUNT(*) FROM bodega_inventario.compras_detalle
             WHERE id_compra = ? AND cantidad_ajustada IS NOT NULL AND cantidad_ajustada > cantidad_solicitada'
        );
        $stmt->execute([$idCompra]);

        return (int) $stmt->fetchColumn() > 0;
    }

    /** Líneas compradas y sin alta generada todavía, listas para pasar a `altas`. */
    public function obtenerLineasParaAlta(int $idCompra): array
    {
        $stmt = $this->connect->prepare(
            'SELECT id, id_producto, id_unidad, id_bodega_destino, cantidad_final, precio_unitario
             FROM bodega_inventario.compras_detalle
             WHERE id_compra = ? AND comprado_con_precio = 1 AND id_alta_generada IS NULL'
        );
        $stmt->execute([$idCompra]);

        return $stmt->fetchAll(PDO::FETCH_OBJ);
    }

    // ---------------------------------------------------------------
    // Listados / bandejas
    // ---------------------------------------------------------------

    /**
     * Consulta genérica para bandejas: aplica un WHERE arbitrario ya
     * armado por el llamador (cada servicio de flujo conoce su propio
     * filtro de acceso) y devuelve cabecera + total, paginado.
     */
    public function listar(string $whereSql, array $params, int $pagina, int $porPagina): array
    {
        $pagina    = max(1, $pagina);
        $porPagina = min(50, max(1, $porPagina));
        $offset    = ($pagina - 1) * $porPagina;

        // LEFT JOIN (no INNER): un usuario dado de baja en dbintranet no debe
        // ocultar la compra — en ese caso el nombre queda NULL y el front cae
        // de vuelta al id crudo (ver COALESCE más abajo).
        $sqlBase = "FROM bodega_inventario.compras c
            INNER JOIN bodega_inventario.bodegas b ON b.id = c.id_bodega
            LEFT JOIN dbintranet.usuarios us ON us.idUsuarios = c.id_usuario_solicitante
            LEFT JOIN dbintranet.datospersonales dps ON dps.idDatosPersonales = us.idDatosPersonales
            LEFT JOIN dbintranet.usuarios ug ON ug.idUsuarios = c.id_usuario_gestor
            LEFT JOIN dbintranet.datospersonales dpg ON dpg.idDatosPersonales = ug.idDatosPersonales
            WHERE {$whereSql}";

        $stmtCount = $this->connect->prepare("SELECT COUNT(*) AS total {$sqlBase}");
        $stmtCount->execute($params);
        $total = (int) ($stmtCount->fetch(PDO::FETCH_OBJ)->total ?? 0);

        $stmt = $this->connect->prepare(
            "SELECT c.id, c.id_bodega, b.nombre AS bodega, c.id_tipo_origen, c.id_estado,
                    c.id_usuario_solicitante, COALESCE(dps.nombres, c.id_usuario_solicitante) AS nombre_solicitante,
                    c.id_usuario_gestor, COALESCE(dpg.nombres, c.id_usuario_gestor) AS nombre_gestor,
                    c.comentario_gestor, c.fecha_gestion,
                    c.requiere_autorizacion, c.created_at
             {$sqlBase}
             ORDER BY c.created_at DESC
             LIMIT {$porPagina} OFFSET {$offset}"
        );
        $stmt->execute($params);

        return [
            'compras'    => $stmt->fetchAll(PDO::FETCH_OBJ),
            'total'      => $total,
            'pagina'     => $pagina,
            'por_pagina' => $porPagina,
        ];
    }

    /** Líneas resumidas de varias compras a la vez, para preview en bandejas (evita N+1). */
    public function obtenerLineasResumenPorCompras(array $idsCompras): array
    {
        if (empty($idsCompras)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($idsCompras), '?'));
        $stmt = $this->connect->prepare(
            "SELECT d.id_compra, d.id_producto, p.nombre AS producto, d.id_unidad, u.abreviatura,
                    d.cantidad_solicitada, d.cantidad_ajustada, d.cantidad_final, d.justificacion
             FROM bodega_inventario.compras_detalle d
             INNER JOIN bodega_inventario.productos p ON p.id = d.id_producto
             INNER JOIN bodega_inventario.unidades_medida u ON u.id = d.id_unidad
             WHERE d.id_compra IN ({$placeholders})
             ORDER BY d.id ASC"
        );
        $stmt->execute($idsCompras);

        $porCompra = [];
        foreach ($stmt->fetchAll(PDO::FETCH_OBJ) as $l) {
            $porCompra[(int) $l->id_compra][] = $l;
        }

        return $porCompra;
    }
}