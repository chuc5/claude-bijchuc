# Guía de Migración: Sistema de Roles y Permisos

**Fecha:** 2026-01-17
**Versión:** 1.0
**Sistema:** BIJCHUC - Inventario y Punto de Venta

---

## 📋 Resumen de Cambios

Se ha implementado un **sistema completo de roles y permisos** que diferencia entre **Administradores** y **Usuarios normales**, con restricciones específicas para cada tipo.

---

## 🔄 PASO 1: Ejecutar Migración de Base de Datos

**IMPORTANTE:** Antes de usar el sistema, debes ejecutar el script de migración SQL.

### Archivo de Migración
```
/SistemaInventario/DB/migration_roles.sql
```

### Pasos para ejecutar:
1. Accede a phpMyAdmin o tu gestor de base de datos MySQL
2. Selecciona la base de datos `inventario_venta`
3. Abre la pestaña "SQL"
4. Copia y pega el contenido de `migration_roles.sql`
5. Ejecuta el script
6. Verifica que se haya agregado la columna `usuario_tipo` a la tabla `usuario`

### ¿Qué hace esta migración?
- ✅ Agrega el campo `usuario_tipo` (ENUM: 'Administrador', 'Usuario')
- ✅ Establece el usuario principal (ID=1) como 'Administrador'
- ✅ Crea índice para mejorar el rendimiento

---

## 🎭 ROLES Y PERMISOS

### 👑 ADMINISTRADOR

**Puede hacer TODO:**
- ✅ Crear, editar y eliminar **usuarios**
- ✅ Crear, editar y eliminar **cajas**
- ✅ Ver **TODAS las ventas** del sistema (sin restricción de fecha ni usuario)
- ✅ **Eliminar ventas**
- ✅ Editar **datos de la empresa**
- ✅ Vender en **cualquier caja** (puede seleccionar la caja al vender)
- ✅ Gestionar productos, categorías y clientes sin restricciones

### 👤 USUARIO NORMAL

**Restricciones:**
- ❌ **NO** puede gestionar usuarios (crear, editar, eliminar)
- ❌ **NO** puede gestionar cajas (crear, editar, eliminar)
- ❌ **NO** puede eliminar ventas
- ❌ **NO** puede editar datos de la empresa
- ❌ **NO** puede cambiar de caja al vender (siempre usa su caja asignada)
- ❌ **NO** puede ver ventas de otros usuarios
- ✅ Solo ve **sus propias ventas del día actual**
- ✅ Puede realizar ventas en su caja asignada
- ✅ Puede ver y buscar productos, categorías, clientes
- ✅ Puede actualizar su propia cuenta (Mi cuenta, Mi foto)

---

## 🛠️ ARCHIVOS MODIFICADOS

### Base de Datos
- ✅ `DB/migration_roles.sql` (NUEVO)

### Modelos
- ✅ `app/models/mainModel.php`
  - Agregadas funciones helper:
    - `esAdministrador()`
    - `verificarPermisoAdmin()`
    - `obtenerTipoUsuario()`
    - `obtenerCajaAsignada()`
    - `obtenerIdUsuario()`

### Controladores
- ✅ `app/controllers/loginController.php`
  - Guarda `usuario_tipo` en sesión

- ✅ `app/controllers/userController.php`
  - Captura y valida campo `usuario_tipo`
  - Solo admin puede crear/eliminar usuarios
  - Los usuarios pueden editar su propio perfil
  - Los usuarios NO pueden cambiar su propio tipo

- ✅ `app/controllers/cashierController.php`
  - Solo admin puede crear/editar/eliminar cajas

- ✅ `app/controllers/companyController.php`
  - Solo admin puede editar datos de empresa

- ✅ `app/controllers/saleController.php`
  - Usuarios normales usan su caja asignada automáticamente
  - Solo admin puede eliminar ventas
  - Filtro de ventas:
    - Admin: ve todas las ventas
    - Usuario: solo sus ventas del día actual

### Vistas
- ✅ `app/views/content/userNew-view.php`
  - Agregado selector de tipo de usuario
  - Agregado campo de caja asignada

- ✅ `app/views/content/userUpdate-view.php`
  - Agregado selector de tipo de usuario
  - Muestra caja asignada

- ✅ `app/views/content/saleNew-view.php`
  - Admin: puede seleccionar cualquier caja
  - Usuario: solo ve su caja asignada (campo readonly)

### Menú de Navegación
- ⚠️ `app/views/inc/navlateral.php` (PENDIENTE DE MODIFICACIÓN MANUAL)

---

## 📝 MODIFICACIÓN MANUAL REQUERIDA

### Archivo: `app/views/inc/navlateral.php`

Debes ocultar las siguientes secciones para usuarios normales:

#### 1. Menú de CAJAS (líneas ~20-64)
```php
<?php if ($_SESSION['tipo'] == 'Administrador') { ?>
<!-- Todo el menú de cajas aquí -->
<li class="full-width divider-menu-h"></li>
<li class="full-width">
    <a href="#" class="full-width btn-subMenu">
        <!-- Menú de Cajas completo -->
    </a>
</li>
<li class="full-width divider-menu-h"></li>
<?php } ?>
```

#### 2. Menú de USUARIOS (líneas ~68-110)
```php
<?php if ($_SESSION['tipo'] == 'Administrador') { ?>
<!-- Todo el menú de usuarios aquí -->
<li class="full-width divider-menu-h"></li>
<li class="full-width">
    <a href="#" class="full-width btn-subMenu">
        <!-- Menú de Usuarios completo -->
    </a>
</li>
<li class="full-width divider-menu-h"></li>
<?php } ?>
```

#### 3. "Datos de Empresa" en Configuraciones (líneas ~319-328)
```php
<ul class="full-width menu-principal sub-menu-options">
    <?php if ($_SESSION['tipo'] == 'Administrador') { ?>
    <li class="full-width">
        <a href="<?php echo APP_URL; ?>companyNew/" class="full-width">
            <div class="navLateral-body-cl">
                <i class="fas tx-white fa-store-alt fa-fw"></i>
            </div>
            <div class="navLateral-body-cr tx-white tx-bold ">
                Datos de empresa
            </div>
        </a>
    </li>
    <?php } ?>

    <!-- Mi cuenta y Mi foto siguen visibles para todos -->
    <li class="full-width">
        <a href="<?php echo APP_URL . "userUpdate/" . $_SESSION['id'] . "/"; ?>">
            <!-- Mi cuenta -->
        </a>
    </li>
    <!-- ... -->
</ul>
```

---

## 🔐 VARIABLES DE SESIÓN

### Variables Disponibles
```php
$_SESSION['id']           // ID del usuario
$_SESSION['nombre']       // Nombre del usuario
$_SESSION['apellido']     // Apellido del usuario
$_SESSION['usuario']      // Username
$_SESSION['foto']         // Ruta de la foto
$_SESSION['caja']         // ID de la caja asignada
$_SESSION['tipo']         // 'Administrador' o 'Usuario' (NUEVO)
```

### Ejemplo de Uso en Vistas
```php
<?php if ($_SESSION['tipo'] == 'Administrador') { ?>
    <!-- Contenido solo para administradores -->
<?php } ?>

<?php if ($_SESSION['tipo'] == 'Usuario') { ?>
    <!-- Contenido solo para usuarios normales -->
<?php } ?>
```

---

## ✅ TESTING / PRUEBAS

### Después de la Migración

1. **Verificar el Usuario Principal**
```sql
SELECT usuario_id, usuario_usuario, usuario_tipo, caja_id
FROM usuario WHERE usuario_id = 1;
```
Debe mostrar `usuario_tipo = 'Administrador'`

2. **Crear un Usuario de Prueba**
- Login como Administrador
- Ir a "Usuarios > Nuevo usuario"
- Crear un usuario con tipo "Usuario"
- Asignarle una caja

3. **Probar Permisos de Usuario Normal**
- Cerrar sesión
- Login con el usuario normal
- Verificar que:
  - ❌ NO vea menú de Cajas
  - ❌ NO vea menú de Usuarios
  - ❌ NO vea "Datos de empresa"
  - ✅ En "Nueva Venta", solo vea su caja (readonly)
  - ✅ En "Lista de Ventas", solo vea sus ventas del día
  - ❌ NO vea botón "Eliminar" en ventas

4. **Probar Permisos de Administrador**
- Login como Administrador
- Verificar acceso completo a todo

---

## 🚨 ERRORES COMUNES

### Error: "Call to undefined method esAdministrador()"
**Causa:** No se ejecutó la migración o el archivo `mainModel.php` no se actualizó.
**Solución:** Asegúrate de tener todas las funciones helper en `mainModel.php`.

### Error: "Unknown column 'usuario_tipo'"
**Causa:** No se ejecutó el script SQL de migración.
**Solución:** Ejecuta `DB/migration_roles.sql` en tu base de datos.

### Error: Usuario normal puede ver todo
**Causa:** No se modificó el archivo `navlateral.php` manualmente.
**Solución:** Agrega las condiciones `if ($_SESSION['tipo'] == 'Administrador')` según se indica arriba.

### Error: Todos los usuarios son "Usuario" por defecto
**Causa:** Normal, así debe ser. El script actualiza el usuario ID=1 como Administrador.
**Solución:** Los nuevos usuarios serán "Usuario" por defecto. El admin puede cambiar el tipo al crearlos.

---

## 📊 USUARIOS EXISTENTES

### ¿Qué pasa con los usuarios existentes?

Después de ejecutar la migración:
- ✅ Usuario con ID=1 se convierte en **Administrador**
- ⚠️ Todos los demás usuarios se quedan como **Usuario** (valor por defecto)
- 📝 El administrador puede cambiar manualmente el tipo de cada usuario desde "Usuarios > Lista de usuarios > Actualizar"

### Cambiar Tipo de Usuario Manualmente

1. Login como Administrador
2. Ir a "Usuarios > Lista de usuarios"
3. Clic en "Actualizar" del usuario deseado
4. Cambiar el "Tipo de usuario" a "Administrador"
5. Guardar

---

## 🔒 SEGURIDAD

### Protecciones Implementadas

1. **Validación en Backend**
   - Todos los controladores verifican permisos antes de ejecutar acciones críticas
   - Los usuarios no pueden cambiar su propio tipo

2. **Validación en Frontend**
   - Los menús y botones se ocultan según el rol
   - Los campos de formulario se bloquean (readonly) cuando es necesario

3. **Validación en Base de Datos**
   - El campo `usuario_tipo` usa ENUM para prevenir valores inválidos

### Recomendaciones

- ⚠️ **NO** eliminar las validaciones del backend confiando solo en el frontend
- ⚠️ **NO** permitir que usuarios cambien su propio tipo de usuario
- ✅ Revisar periódicamente los logs de acciones administrativas
- ✅ Hacer backups regulares de la base de datos

---

## 📞 SOPORTE

Si encuentras problemas:
1. Verifica que ejecutaste el script SQL de migración
2. Revisa que todos los archivos están actualizados
3. Verifica las variables de sesión con `print_r($_SESSION)`
4. Revisa los logs de PHP para errores

---

## 📅 CHANGELOG

### v1.0 - 2026-01-17
- ✅ Implementación inicial del sistema de roles
- ✅ Restricciones para usuarios normales
- ✅ Filtrado de ventas por usuario y fecha
- ✅ Caja asignada automática para usuarios
- ✅ Permisos administrativos completos

---

**Sistema Desarrollado por:** CHASQUISOFT
**Migración de Roles por:** Claude (Anthropic)
