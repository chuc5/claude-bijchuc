-- =====================================================
-- MIGRACIÓN: SISTEMA DE ROLES Y PERMISOS
-- Fecha: 2026-01-17
-- Descripción: Agrega sistema de roles (Administrador/Usuario)
--              con permisos diferenciados
-- =====================================================

-- 1. Agregar campo usuario_tipo a la tabla usuario
ALTER TABLE `usuario`
ADD COLUMN `usuario_tipo` ENUM('Administrador','Usuario') NOT NULL DEFAULT 'Usuario'
AFTER `usuario_clave`;

-- 2. Actualizar usuario existente como Administrador
UPDATE `usuario`
SET `usuario_tipo` = 'Administrador'
WHERE `usuario_id` = 1 OR `usuario_usuario` = 'Administrador';

-- 3. Agregar índice para mejorar rendimiento en consultas por tipo
ALTER TABLE `usuario`
ADD INDEX `idx_usuario_tipo` (`usuario_tipo`);

-- =====================================================
-- NOTAS IMPORTANTES:
-- =====================================================
--
-- ROLES Y PERMISOS:
--
-- ADMINISTRADOR puede:
-- - Crear, editar y eliminar usuarios
-- - Crear, editar y eliminar cajas
-- - Ver TODAS las ventas del sistema
-- - Eliminar ventas
-- - Editar datos de la empresa
-- - Todas las funcionalidades del sistema
--
-- USUARIO puede:
-- - Ver solo SUS ventas del día actual
-- - Realizar ventas en su caja asignada (no puede cambiarla)
-- - Ver productos, categorías, clientes (solo lectura en algunos casos)
-- - NO puede eliminar ventas
-- - NO puede editar cajas, usuarios ni datos de empresa
--
-- CAJA ASIGNADA:
-- - Cada usuario tiene una caja asignada (campo caja_id ya existe)
-- - Los usuarios normales NO pueden cambiar de caja al vender
-- - Solo administradores pueden vender en cualquier caja
--
-- =====================================================

-- Verificar migración
SELECT
    usuario_id,
    usuario_nombre,
    usuario_usuario,
    usuario_tipo,
    caja_id
FROM usuario;
