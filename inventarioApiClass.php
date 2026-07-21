<?php

namespace App\inventarioApi;

use App\Core\ApiResponder;
use App\Core\MailerService;
use App\Core\DriveService;
use App\inventarioApi\Helpers\AltaHelper;
use App\inventarioApi\Helpers\BodegaHelper;
use App\inventarioApi\Helpers\CierreHelper;
use App\inventarioApi\Helpers\LotesHelper;
use App\inventarioApi\Helpers\MovimientoHelper;
use App\inventarioApi\Helpers\StockHelper;
use App\inventarioApi\Helpers\ReversaHelper;
use App\inventarioApi\Helpers\TrasladoHelper;
use App\inventarioApi\Helpers\CompraHelper;

use App\inventarioApi\Enums\EstadoCompra;
use App\inventarioApi\Enums\TipoBodega;
use App\inventarioApi\Enums\TipoOrigenCompra;
use App\inventarioApi\Helpers\RolCompraHelper;
use App\inventarioApi\Repositories\CompraRepository;
use App\inventarioApi\Services\CompraService;
use App\inventarioApi\Services\CompraAgenciaService;
use App\inventarioApi\Services\CompraAreaService;
use App\inventarioApi\Services\CompraTrimestralService;
use App\inventarioApi\Services\CompraExtraordinariaService;

use ConexionBD;
use Exception;
use PDO;

/**
 * inventarioApiClass
 *
 * Clase principal del módulo de Inventario de Bodega.
 * Expone los endpoints GET/POST y delega la lógica pesada a helpers.
 *
 * Helpers disponibles (lazy-loading):
 *   - BodegaHelper     → resolución de bodegas y acceso por matriz
 *   - MovimientoHelper → registro de movimientos de stock
 *   - CierreHelper     → consultas de cierres mensuales
 *   - StockHelper      → operaciones sobre la tabla stock
 *   - LotesHelper      → FIFO, PEPS y correlativo
 *   - AltaHelper       → lógica interna del módulo de altas
 *
 * Convenciones:
 *   - GET: leen parámetros de $_GET / filter_input(INPUT_GET).
 *   - POST: reciben $datos y lo sanitizan con limpiarDatos().
 *   - Todos devuelven array vía ApiResponder (ok | info | fail).
 *   - Operaciones multi-tabla abren su propia transacción y hacen rollback ante excepción.
 *
 * @version 4.1 — Documentado + limpieza de duplicados y bugs
 */
final class inventarioApiClass extends ConexionBD
{
    // =========================================================================
    // PROPIEDADES DE SESIÓN
    // =========================================================================

    /** @var string ID del usuario autenticado (de $_SESSION). */
    protected $idUsuario;
    /** @var int ID de la agencia del usuario (de $_SESSION). */
    protected $idAgencia;
    /** @var int|null ID del puesto del usuario (de $_SESSION). */
    protected $puesto;
    /** @var int|null Área del usuario, resuelta de forma perezosa. */
    protected $area;
    /** @var array<int> Puestos con permiso sobre el módulo. */
    protected $puestosValidos = [];

    // =========================================================================
    // SERVICIOS CORE
    // =========================================================================

    protected ApiResponder $res;
    protected MailerService $mailer;
    protected DriveService $drive;

    // =========================================================================
    // HELPERS (lazy-loading — se instancian una sola vez al primer uso)
    // =========================================================================

    private ?BodegaHelper $bodegaHelper = null;
    private ?MovimientoHelper $movimientoHelper = null;
    private ?CierreHelper $cierreHelper = null;
    private ?StockHelper $stockHelper = null;
    private ?LotesHelper $lotesHelper = null;
    private ?AltaHelper $altaHelper = null;
    private ?ReversaHelper $reversaHelper = null;
    private ?TrasladoHelper $trasladoHelper = null;

    private ?CompraRepository $compraRepo = null;
    private ?CompraService $compraService = null;
    private ?CompraAgenciaService $compraAgenciaService = null;
    private ?CompraAreaService $compraAreaService = null;
    private ?CompraTrimestralService $compraTrimestralService = null;
    private ?CompraExtraordinariaService $compraExtraordinariaService = null;

    // =========================================================================
    // CONSTANTES DE NEGOCIO
    // =========================================================================

    /** Tipo de producto: numeración correlativa. */
    private const TIPO_CORRELATIVO = 1;
    /** Tipo de producto: con fecha de expiración (PEPS). */
    private const TIPO_EXPIRACION = 2;
    /** Tipo de producto: normal (FIFO). */
    private const TIPO_NORMAL = 3;
    /** Unidad fija para productos correlativos ('Unidad' / UND). */
    private const UNIDAD_CORRELATIVO = 1;

    // =========================================================================
    // ENRUTAMIENTO
    // =========================================================================

    /** @var array<string> Métodos expuestos como GET. */
    private array $metodosGet = [
        'listarItems', 'obtenerItem', 'descargarPlantilla', 'obtenerMiArea',
        'listarTipos', 'obtenerTipo',
        'listarCategorias', 'obtenerCategoria',
        'listarUnidades', 'obtenerUnidad',
        'listarProductos', 'obtenerProducto',
        'listarBodegas', 'obtenerBodega', 'listarAgenciasBodega', 'listarDepartamentosBodega',
        'listarEncargados', 'buscarUsuarios',
        'obtenerMiBodega',
        'obtenerMiMatriz', 'obtenerProductosCelda',
        'obtenerMatrizProductos',
        'obtenerBodegaAgencia', 'listarBodegasArea', 'listarProductosDisponibles',
        'listarMisSolicitudes', 'obtenerUnidadesProducto',
        'obtenerBodegaEncargado', 'obtenerDetalleSolicitud',
        'obtenerAltaDetalle', 'listarBodegasParaAlta', 'listarProductosParaAlta',
        'listarAltasAdmin', 'listarAgenciasAdmin',
        'listarCierres',
        // Traslados entre bodegas
        'listarTrasladosAdmin', 'obtenerDetalleTraslado', 'listarBodegasDestinoTraslado',
        // Compras de bodegas (unificado)
        'listarAreasDisponiblesCompra', 'listarProductosPermitidosArea',
        'listarBandejaCompraAgencia', 'listarBandejaCompraArea',
        'misComprasSolicitadas', 'obtenerCompra', 'listarComprasAutorizacion',

    ];

    /** @var array<string> Métodos expuestos como POST. */
    private array $metodosPost = [
        'crearItem', 'editarItem', 'eliminarItem', 'subirArchivo', 'enviarCorreoPrueba',
        'editarTipo',
        'crearCategoria', 'editarCategoria', 'toggleCategoria',
        'crearUnidad', 'editarUnidad', 'toggleUnidad',
        'crearProducto', 'editarProducto', 'toggleProducto',
        'crearBodega', 'editarBodega', 'toggleBodega', 'toggleRestriccionAcceso',
        'asignarEncargado', 'toggleEncargado',
        'toggleMiRestriccion',
        'toggleCelda', 'toggleFilaPuesto', 'toggleColumnaAgencia', 'limpiarMatriz',
        'agregarProductoCelda', 'agregarCategoriaCelda', 'eliminarProductoCelda',
        'asignarProductoACeldas',
        'sincronizarProductoAgencia', 'toggleFilaProducto', 'asignarProductoMultiplesAgencias',
        'crearSolicitud', 'cancelarSolicitud',
        'entregarSolicitud', 'rechazarSolicitud', 'simularEntrega',
        'listarSolicitudesEncargado',
        'listarAltas', 'crearAlta', 'ingresarCorrelativo', 'ingresarExpiracion',
        'ingresarNormal', 'ajustarCantidadAlta', 'eliminarLote', 'editarAlta',
        'obtenerCierre', 'crearCierre', 'editarCierre', 'eliminarCierre',
        // Reversa de Entregas
        'revertirEntrega', 'listarReversas',
        // Traslados entre bodegas
        'crearTraslado', 'cancelarTraslado', 'aprobarTraslado', 'rechazarTraslado',
        'confirmarRecepcionTraslado', 'listarTrasladosOrigen', 'listarTrasladosDestino',
        'listarLotesOrigenParaTraslado', 'listarProductosParaTraslado',
        // Compras de bodegas (unificado)
        'crearSolicitudCompraAgencia', 'gestionarSolicitudCompraAgencia',
        'crearSolicitudCompraArea', 'gestionarSolicitudCompraArea',
        'cancelarSolicitudCompra',
        'procesarCompra', 'autorizarCompra', 'registrarCompra', 'cancelarCompra',
        'generarComprasTrimestrales', 'crearCompraExtraordinaria',
    ];

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * Inicializa sesión, servicios core y la constante de tipo de movimiento.
     * Los helpers NO se instancian aquí: se cargan de forma perezosa.
     *
     * NOTA: se eliminó el método monolítico _inicializarHelpers() que existía
     * aquí por ser código muerto (ningún endpoint lo invocaba; todos usan los
     * inicializadores individuales del final de la clase).
     */
    public function __construct()
    {
        parent::__construct();

        $this->idUsuario = $_SESSION['idUsuario'] ?? '';
        $this->idAgencia = $_SESSION['idAgencia'] ?? 0;
        $this->puesto = $_SESSION['idPuesto'] ?? null;

        $this->puestosValidos = [1, 2, 3];

        $this->res = new ApiResponder();
        $this->mailer = new MailerService();
        $this->drive = new DriveService();

        define('TM_ALTA_COMPRA', 1);
    }

    // =========================================================================
    // ENRUTAMIENTO Y PERMISOS
    // =========================================================================

    /**
     * Indica si un método está registrado como endpoint GET.
     */
    public function esMetodoGet(string $m): bool
    {
        return in_array($m, $this->metodosGet, true);
    }

    /**
     * Indica si un método está registrado como endpoint POST.
     */
    public function esMetodoPost(string $m): bool
    {
        return in_array($m, $this->metodosPost, true);
    }

    /**
     * Valida si el puesto en sesión tiene permiso para la operación.
     * Si no hay lista de puestos válidos, concede acceso por defecto.
     *
     * @param string $operacion Nombre lógico de la operación (auditoría futura)
     */
    protected function validarPermisos(string $operacion): bool
    {
        if (!empty($this->puestosValidos)) {
            return in_array($this->puesto, $this->puestosValidos, true);
        }

        return true;
    }

// =========================================================================
// HELPERS GENÉRICOS DE LA CLASE PRINCIPAL
// =========================================================================

    /**
     * Normaliza el payload: convierte arrays a objeto y aplica
     * trim + htmlspecialchars a cada campo string (anti-XSS).
     *
     * @param array|object $data
     * @return object Objeto saneado
     */
    protected function limpiarDatos($data): object
    {
        if (is_array($data)) {
            $data = (object)$data;
        }

        foreach ($data as $k => $v) {
            if (is_string($v)) {
                $data->$k = trim(htmlspecialchars($v, ENT_QUOTES, 'UTF-8'));
            }
        }

        return $data;
    }

    /**
     * Resuelve el área asociada a un puesto desde compras.puesto_areas.
     *
     * @param int|null $puesto
     * @return int ID del área, o 0 si no tiene o si ocurre un error
     */
    private function _obtenerArea($puesto): int
    {
        try {
            $sqlArea = "SELECT COALESCE((
            SELECT area 
            FROM compras.puesto_areas 
            WHERE puesto = ?
        ), 0) AS area_id";

            $stmt = $this->connect->prepare($sqlArea);
            $stmt->execute([$puesto]);

            $res = $stmt->fetch(PDO::FETCH_OBJ);

            return (int)($res->area_id ?? 0);

        } catch (Exception $e) {
            error_log("Error obteniendo área corporativa: " . $e->getMessage());
            return 0;
        }
    }

// =========================================================================
// GET: obtenerMiArea
// =========================================================================

    /**
     * Recupera los datos de identidad corporativa en sesión del usuario y su área resuelta.
     *
     * GET: modulo/obtenerMiArea
     */
    public function obtenerMiArea(): array
    {
        try {
            if ($this->area === null || (int)$this->area === 0) {
                $this->area = $this->_obtenerArea($this->puesto);
            }

            return $this->res->ok('Datos de identidad y área de sesión recuperados correctamente', [
                'idUsuario' => $this->idUsuario,
                'idAgencia' => (int)$this->idAgencia,
                'puesto'    => (int)$this->puesto,
                'area'      => (int)$this->area,
                'timestamp' => date('Y-m-d H:i:s'),
            ]);

        } catch (Exception $e) {
            error_log("Error en obtenerMiArea: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar el área de sesión', $e);
        }
    }

// =========================================================================
// POST: subirArchivo / enviarCorreoPrueba
// =========================================================================

    /**
     * Sube un archivo binario a Google Drive y asienta sus metadatos en la base de datos.
     * Restringe por listas blancas (PDF/JPEG/PNG) y controla pesos de hasta 10 MB.
     *
     * POST: modulo/subirArchivo
     * * @param object $datos Payload de entrada (Los archivos binarios viajan directo en $_FILES)
     */
    public function subirArchivo($datos): array
    {
        try {
            if (!$this->validarPermisos('subir')) {
                return $this->res->fail('Acceso denegado: Su puesto no cuenta con permisos para cargar archivos al servidor');
            }

            // Ejecutar el almacenamiento en Google Drive mediante el servicio core
            $resultado = $this->drive->subirArchivo(
                'mi_modulo',
                ['documentos', date('Y'), date('m')],
                null,
                ['application/pdf', 'image/jpeg', 'image/png'],
                10 * 1024 * 1024
            );

            if (!isset($resultado['exito']) || !$resultado['exito']) {
                return $this->res->fail($resultado['mensaje'] ?? 'Error desconocido en el almacenamiento en Drive');
            }

            // Isolar la inserción y persistencia de auditoría del archivo
            $sqlInsertArchivo = "INSERT INTO archivos_subidos (
                drive_id, 
                nombre_original, 
                nombre_drive, 
                tipo_mime, 
                tamano, 
                subido_por,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)";

            $stmt = $this->connect->prepare($sqlInsertArchivo);
            $stmt->execute([
                $resultado['drive_id'],
                $resultado['metadata']['nombre_original'] ?? 'Sin nombre',
                $resultado['nombre_archivo'],
                $resultado['metadata']['tipo_mime'] ?? 'application/octet-stream',
                (int)($resultado['metadata']['tamaño_bytes'] ?? 0),
                $this->idUsuario,
            ]);

            return $this->res->ok('Archivo cargado y auditado correctamente en el servidor', $resultado);

        } catch (Exception $e) {
            error_log("Error en subirArchivo: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al procesar la carga del archivo binario', $e);
        }
    }

    /**
     * Despacha un correo electrónico de prueba utilizando la infraestructura de MailerService.
     *
     * POST: modulo/enviarCorreoPrueba
     * * @param object $datos {
     * destinatario: string,
     * asunto: ?string,
     * mensaje: ?string
     * }
     */
    public function enviarCorreoPrueba($datos): array
    {
        try {
            $datos = $this->limpiarDatos($datos);
            $destinatario = trim($datos->destinatario ?? '');

            if ($destinatario === '') {
                return $this->res->fail('El campo destinatario es estrictamente mandatorio');
            }

            $asunto = !empty($datos->asunto) ? $datos->asunto : 'Notificación de prueba desde el módulo de inventarios';
            $cuerpo = "<h1>Control de Notificaciones</h1><p>" . ($datos->mensaje ?? 'Cuerpo de mensaje vacío') . "</p>";

            // Despacho del Mailer a través del helper core
            $resultado = $this->mailer->enviar($destinatario, $asunto, $cuerpo);

            if (!isset($resultado['respuesta']) || $resultado['respuesta'] !== 'success') {
                return $this->res->fail($resultado['mensaje'] ?? 'Fallo de conexión con el servidor de correos (SMTP)');
            }

            return $this->res->ok('El correo electrónico de prueba ha sido encolado y enviado con éxito');

        } catch (Exception $e) {
            error_log("Error en enviarCorreoPrueba: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar despachar la notificación por correo', $e);
        }
    }
    


    // =========================================================================
    // SOLICITUDES — GESTIÓN DEL ENCARGADO (rechazo / simulación)
    // =========================================================================

    /**
     * Rechaza una solicitud en estado Reservada: libera la reserva de cada renglón,
     * registra el movimiento de liberación y marca la solicitud como Rechazada (3).
     *
     * POST: bodega_inventario/rechazarSolicitud
     *
     * @param object $datos {
     * id_solicitud: int,
     * motivo_rechazo: string,
     * contexto: string (area|agencia)
     * }
     */
    public function rechazarSolicitud($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();

            $datos = $this->limpiarDatos($datos);
            $idSolicitud = (int)($datos->id_solicitud ?? 0);
            $motivo = trim($datos->motivo_rechazo ?? '');
            $contexto = trim($datos->contexto ?? 'area');

            // 1. Validaciones estructurales básicas
            if ($idSolicitud < 1) {
                return $this->res->fail('El campo id_solicitud es requerido y debe ser un entero positivo');
            }

            if (empty($motivo)) {
                return $this->res->fail('El motivo de rechazo es obligatorio');
            }

            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            // Resolver la bodega del encargado según el contexto del flujo
            $idBodegaEncargado = $this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodegaEncargado) {
                return $this->res->fail(
                    $contexto === 'agencia'
                        ? 'No tienes una bodega de agencia asignada en el sistema'
                        : 'No tienes una bodega de área asignada en el sistema'
                );
            }

            // 2. Inicio del bloque transaccional con concurrencia protegida
            $this->connect->beginTransaction();

            // Consulta A: Obtener y bloquear la solicitud con FOR UPDATE para prevenir condiciones de carrera
            $sqlSolicitud = "SELECT id, id_estado, id_bodega
            FROM bodega_inventario.solicitudes
            WHERE id = ? 
              AND id_bodega = ? 
            FOR UPDATE";

            $stmtSol = $this->connect->prepare($sqlSolicitud);
            $stmtSol->execute([$idSolicitud, $idBodegaEncargado]);
            $solicitud = $stmtSol->fetch(PDO::FETCH_OBJ);

            if (!$solicitud) {
                $this->connect->rollBack();
                return $this->res->fail('La solicitud especificada no fue encontrada en tu bodega asignada');
            }

            if ((int)$solicitud->id_estado !== 1) {
                $this->connect->rollBack();
                return $this->res->fail('Operación inválida: Solo se pueden rechazar solicitudes en estado Reservada');
            }

            // Consulta B: Obtener las celdas de detalle de la solicitud
            $sqlDetalle = "SELECT id, id_producto, id_unidad, cantidad_solicitada
            FROM bodega_inventario.solicitudes_detalle 
            WHERE id_solicitud = ?";

            $stmtDet = $this->connect->prepare($sqlDetalle);
            $stmtDet->execute([$idSolicitud]);
            $renglones = $stmtDet->fetchAll(PDO::FETCH_OBJ);

            $idBodega = (int)$solicitud->id_bodega;

            // Declaración previa de consultas para optimizar la ejecución dentro del bucle
            $sqlUpdateRenglon = "UPDATE bodega_inventario.solicitudes_detalle
            SET motivo_rechazo = ?,
                id_usuario_gestion = ?,
                fecha_gestion = CURRENT_TIMESTAMP
            WHERE id = ?";

            $stmtUpdateRenglon = $this->connect->prepare($sqlUpdateRenglon);

            // 3. Procesamiento por renglón: Liberar existencias y registrar kardex
            foreach ($renglones as $renglon) {
                $idProducto = (int)$renglon->id_producto;
                $idUnidad = (int)$renglon->id_unidad;
                $cantidad = (float)$renglon->cantidad_solicitada;
                $idDetalle = (int)$renglon->id;

                // Invocar lógica de negocio externa mapeada en los helpers del core
                $this->stockHelper->liberarReserva($idBodega, $idProducto, $idUnidad, $cantidad);
                $this->movimientoHelper->registrarLiberacion($idBodega, $idProducto, $idUnidad, $cantidad, $idDetalle);

                // Actualizar auditoría del renglón rechazado
                $stmtUpdateRenglon->execute([$motivo, $this->idUsuario, $idDetalle]);
            }

            // Consulta C: Actualizar el encabezado de la solicitud a estado Rechazada (3)
            $sqlUpdateSolicitud = "UPDATE bodega_inventario.solicitudes
            SET id_estado = 3, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?";

            $this->connect->prepare($sqlUpdateSolicitud)->execute([$idSolicitud]);

            $this->connect->commit();

            return $this->res->ok('La solicitud ha sido rechazada y las reservas de inventario se liberaron correctamente');

        } catch (Exception $e) {
            // Control y reversión atómica completa de todos los cambios si ocurre un fallo
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }

            error_log("Error en rechazarSolicitud: " . $e->getMessage());
            return $this->res->fail('Error interno al procesar el rechazo de la solicitud', $e);
        }
    }

    /**
     * Simula (dry-run) la entrega de una solicitud Reservada sin alterar stock ni persistir lotes.
     * Calcula renglón por renglón el consumo proyectado según la regla del producto (Correlativo / PEPS / FIFO).
     *
     * POST: bodega_inventario/simularEntrega
     *
     * @param object|null $datos {
     * id_solicitud: int,
     * contexto: string (area|agencia)
     * }
     */
    public function simularEntrega($datos = null): array
    {
        try {
            $this->_inicializarBodegaHelper();
            $datos = $this->limpiarDatos($datos ?? new \stdClass());
            $id = (int)($datos->id_solicitud ?? 0);
            $contexto = trim($datos->contexto ?? 'area');

            // 1. Validaciones estructurales y de identidad básicas
            if ($id < 1) {
                return $this->res->fail('El campo id_solicitud es requerido y debe ser un entero positivo');
            }

            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            // Resolver la bodega según el contexto operativo
            $idBodega = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodega || $idBodega < 1) {
                return $this->res->fail(
                    $contexto === 'agencia'
                        ? 'No tienes una bodega de agencia asignada en el sistema'
                        : 'No tienes una bodega de área asignada en el sistema'
                );
            }

            // Consulta A: Verificar existencia y estado actual de la solicitud
            $sqlSolicitud = "SELECT id, id_estado, id_bodega 
            FROM bodega_inventario.solicitudes
            WHERE id = ? 
              AND id_bodega = ? 
            LIMIT 1";

            $stmtSol = $this->connect->prepare($sqlSolicitud);
            $stmtSol->execute([$id, $idBodega]);
            $solicitud = $stmtSol->fetch(PDO::FETCH_OBJ);

            if (!$solicitud) {
                return $this->res->fail('La solicitud especificada no fue encontrada en tu bodega asignada');
            }

            if ((int)$solicitud->id_estado !== 1) {
                return $this->res->fail('Operación inválida: Solo se puede simular solicitudes en estado Reservada');
            }

            // Consulta B: Obtener el detalle estructurado de renglones de la solicitud
            $sqlDetalle = "SELECT 
                sd.id, 
                sd.id_producto, 
                p.nombre AS producto,
                tp.id AS id_tipo_producto, 
                tp.nombre AS tipo_producto,
                sd.id_unidad, 
                um.abreviatura AS abreviatura_unidad,
                sd.cantidad_solicitada
            FROM bodega_inventario.solicitudes_detalle sd
            INNER JOIN bodega_inventario.productos p ON p.id = sd.id_producto
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = sd.id_unidad
            WHERE sd.id_solicitud = ? 
            ORDER BY sd.id ASC";

            $stmtDet = $this->connect->prepare($sqlDetalle);
            $stmtDet->execute([$id]);
            $renglones = $stmtDet->fetchAll(PDO::FETCH_OBJ);

            $resultado = [];
            $errores = [];

            // Declaración previa de las consultas de lotes para optimizar su preparación en el ciclo
            $sqlCorrelativo = "SELECT id, correlativo_siguiente, correlativo_final,
                (cantidad_disponible - cantidad_reservada) AS cantidad_disponible,
                resolucion, serie
            FROM bodega_inventario.lotes_correlativo
            WHERE id_bodega = ? 
              AND id_producto = ? 
              AND (cantidad_disponible - cantidad_reservada) > 0
            ORDER BY correlativo_inicial ASC";

            $sqlExpiracion = "SELECT id, (cantidad_disponible - cantidad_reservada) AS cantidad_disponible, fecha_expiracion
            FROM bodega_inventario.lotes_expiracion
            WHERE id_bodega = ? 
              AND id_producto = ? 
              AND id_unidad = ?
              AND (cantidad_disponible - cantidad_reservada) > 0
            ORDER BY fecha_expiracion ASC";

            $sqlNormal = "SELECT id, cantidad_disponible, fecha_ingreso
            FROM bodega_inventario.lotes_normal
            WHERE id_bodega = ? 
              AND id_producto = ? 
              AND id_unidad = ?
              AND cantidad_disponible > 0
            ORDER BY fecha_ingreso ASC";

            $stmtCorr = $this->connect->prepare($sqlCorrelativo);
            $stmtExp = $this->connect->prepare($sqlExpiracion);
            $stmtNorm = $this->connect->prepare($sqlNormal);

            // 2. Procesamiento y proyección dinámica de existencias
            foreach ($renglones as $renglon) {
                $idProducto = (int)$renglon->id_producto;
                $idUnidad = (int)$renglon->id_unidad;
                $cantidad = (float)$renglon->cantidad_solicitada;
                $idTipo = (int)$renglon->id_tipo_producto;
                $lotesSimulados = [];
                $stockSuficiente = true;
                $mensajeError = null;

                // ── ESCENARIO 1: PRODUCTO CONTROLADO POR CORRELATIVO ─────────────────
                if ($idTipo === 1) {
                    $stmtCorr->execute([$idBodega, $idProducto]);
                    $lotes = $stmtCorr->fetchAll(PDO::FETCH_OBJ);

                    $totalDisponible = (float)array_sum(array_column($lotes, 'cantidad_disponible'));

                    if ($totalDisponible < $cantidad) {
                        $stockSuficiente = false;
                        $mensajeError = "Stock insuficiente. Disponible: {$totalDisponible}, solicitado: {$cantidad}";
                    } else {
                        $pendiente = (int)$cantidad;

                        foreach ($lotes as $lote) {
                            if ($pendiente <= 0) {
                                break;
                            }

                            $consumir = min($pendiente, (int)$lote->cantidad_disponible);
                            $corrIni = (int)$lote->correlativo_siguiente;
                            $corrFin = $corrIni + $consumir - 1;

                            $lotesSimulados[] = [
                                'id_lote' => (int)$lote->id,
                                'cantidad' => (float)$consumir,
                                'corr_ini_lote' => $corrIni,
                                'corr_fin_lote' => $corrFin,
                                'resolucion' => $lote->resolucion ?? null,
                                'serie' => $lote->serie ?? null,
                                'disponible_en_lote' => (float)$lote->cantidad_disponible,
                                'id_lote_corr' => (int)$lote->id,
                                'id_lote_exp' => null,
                                'id_lote_normal' => null,
                                'fecha_expiracion_lote' => null,
                                'restante_lote_exp' => null,
                                'fecha_ingreso_lote' => null,
                            ];

                            $pendiente -= $consumir;
                        }
                    }

                    // ── ESCENARIO 2: PRODUCTO CONTROLADO POR EXPIRACIÓN (PEPS / FEFO) ───
                } elseif ($idTipo === 2) {
                    $stmtExp->execute([$idBodega, $idProducto, $idUnidad]);
                    $lotes = $stmtExp->fetchAll(PDO::FETCH_OBJ);

                    $totalDisponible = (float)array_sum(array_column($lotes, 'cantidad_disponible'));

                    if ($totalDisponible < $cantidad) {
                        $stockSuficiente = false;
                        $mensajeError = "Stock insuficiente. Disponible: {$totalDisponible}, solicitado: {$cantidad}";
                    } else {
                        $pendiente = $cantidad;

                        foreach ($lotes as $lote) {
                            if ($pendiente <= 0) {
                                break;
                            }

                            $consumir = min($pendiente, (float)$lote->cantidad_disponible);

                            $lotesSimulados[] = [
                                'id_lote' => (int)$lote->id,
                                'cantidad' => $consumir,
                                'fecha_expiracion_lote' => $lote->fecha_expiracion,
                                'restante_lote_exp' => (float)$lote->cantidad_disponible,
                                'disponible_en_lote' => (float)$lote->cantidad_disponible,
                                'id_lote_exp' => (int)$lote->id,
                                'id_lote_normal' => null,
                                'id_lote_corr' => null,
                                'corr_ini_lote' => null,
                                'corr_fin_lote' => null,
                                'resolucion' => null,
                                'serie' => null,
                                'fecha_ingreso_lote' => null,
                            ];

                            $pendiente -= $consumir;
                        }
                    }

                    // ── ESCENARIO 3: PRODUCTO CONTROLADO POR INGRESO (FIFO / PEPS NORMAL) ─
                } else {
                    $stmtNorm->execute([$idBodega, $idProducto, $idUnidad]);
                    $lotes = $stmtNorm->fetchAll(PDO::FETCH_OBJ);

                    $totalDisponible = (float)array_sum(array_column($lotes, 'cantidad_disponible'));

                    if ($totalDisponible < $cantidad) {
                        $stockSuficiente = false;
                        $mensajeError = "Stock insuficiente. Disponible: {$totalDisponible}, solicitado: {$cantidad}";
                    } else {
                        $pendiente = $cantidad;

                        foreach ($lotes as $lote) {
                            if ($pendiente <= 0) {
                                break;
                            }

                            $consumir = min($pendiente, (float)$lote->cantidad_disponible);

                            $lotesSimulados[] = [
                                'id_lote' => (int)$lote->id,
                                'cantidad' => $consumir,
                                'fecha_ingreso_lote' => $lote->fecha_ingreso,
                                'disponible_en_lote' => (float)$lote->cantidad_disponible,
                                'id_lote_normal' => (int)$lote->id,
                                'id_lote_exp' => null,
                                'id_lote_corr' => null,
                                'corr_ini_lote' => null,
                                'corr_fin_lote' => null,
                                'resolucion' => null,
                                'serie' => null,
                                'fecha_expiracion_lote' => null,
                                'restante_lote_exp' => null,
                            ];

                            $pendiente -= $consumir;
                        }
                    }
                }

                // Consolidar la simulación estructural del renglón actual
                $resultado[] = [
                    'id_renglon' => (int)$renglon->id,
                    'id_producto' => $idProducto,
                    'producto' => $renglon->producto,
                    'id_tipo_producto' => $idTipo,
                    'tipo_producto' => $renglon->tipo_producto,
                    'abreviatura_unidad' => $renglon->abreviatura_unidad,
                    'cantidad_solicitada' => $cantidad,
                    'stock_suficiente' => $stockSuficiente,
                    'mensaje_error' => $mensajeError,
                    'lotes' => $lotesSimulados,
                ];

                if (!$stockSuficiente) {
                    $errores[] = $mensajeError;
                }
            }

            // 3. Retorno del reporte consolidado de simulación
            return $this->res->ok('Simulación de asignación de lotes para entrega calculada correctamente', [
                'renglones' => $resultado,
                'tiene_errores' => count($errores) > 0,
                'errores' => $errores,
            ]);

        } catch (Exception $e) {
            error_log("Error masivo en simularEntrega: " . $e->getMessage());
            return $this->res->fail('Error al proyectar la simulación de entrega de mercancías', $e);
        }
    }

    // =========================================================================
    // ALTAS DE BODEGAS
    // =========================================================================

    /**
     * Normaliza (castea) los campos comunes de un objeto de alta a sus tipos correctos.
     * Extraído para centralizar la lógica y evitar duplicidades en consultas de catálogos.
     *
     * @param object $a Objeto de alta mapeado desde la base de datos
     */
    private function _normalizarFilaAlta(object $a): void
    {
        $a->id = (int)$a->id;
        $a->id_bodega_destino = (int)$a->id_bodega_destino;
        $a->id_producto = (int)$a->id_producto;
        $a->id_tipo_producto = (int)$a->id_tipo_producto;
        $a->id_unidad = (int)$a->id_unidad;
        $a->id_estado = (int)$a->id_estado;
        $a->cantidad_enviada = (float)$a->cantidad_enviada;
        $a->cantidad_ingresada = (float)$a->cantidad_ingresada;
        $a->cantidad_pendiente = (float)$a->cantidad_pendiente;
        $a->precio_unitario = $a->precio_unitario !== null ? (float)$a->precio_unitario : null;
        $a->id_compra = $a->id_compra !== null ? (int)$a->id_compra : null;
    }

    /**
     * Obtiene el listado de altas destinadas a la bodega del encargado actual,
     * aplicando filtros dinámicos de búsqueda, estado y paginación estructurada.
     *
     * POST: bodega_inventario/listarAltas
     *
     * @param object $datos {
     * contexto: string (area|agencia),
     * busqueda: string,
     * estado: int|null,
     * pagina: int,
     * por_pagina: int
     * }
     */
    public function listarAltas($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();
            $datos = $this->limpiarDatos($datos);
            $contexto = trim($datos->contexto ?? '');

            // 1. Validaciones estructurales y de identidad básicas
            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            // Resolver la bodega de destino mediante el helper según el flujo
            $idBodega = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodega || $idBodega < 1) {
                return $this->res->fail(
                    $contexto === 'agencia'
                        ? 'No tienes una bodega de agencia asignada en el sistema'
                        : 'No tienes una bodega de área asignada en el sistema'
                );
            }

            // 2. Preparación y sanitización de parámetros de paginación y filtrado
            $busqueda = trim($datos->busqueda ?? '');
            $estado = isset($datos->estado) && $datos->estado !== '' && $datos->estado !== null
                ? (int)$datos->estado
                : null;

            $pagina = max(1, (int)($datos->pagina ?? 1));
            $porPagina = min(50, max(1, (int)($datos->por_pagina ?? 20)));
            $offset = ($pagina - 1) * $porPagina;

            $params = [];
            $whereExtra = ' AND a.id_bodega_destino = ?';
            $params[] = $idBodega;

            if ($estado !== null) {
                $whereExtra .= ' AND a.id_estado = ?';
                $params[] = $estado;
            }

            if ($busqueda !== '') {
                $whereExtra .= ' AND (p.nombre LIKE ? OR b.nombre LIKE ?)';
                $params[] = "%{$busqueda}%";
                $params[] = "%{$busqueda}%";
            }

            // 3. Estructuración y aislamiento de las consultas SQL
            $sqlBase = "FROM bodega_inventario.altas a
            INNER JOIN bodega_inventario.bodegas b ON b.id = a.id_bodega_destino
            INNER JOIN bodega_inventario.productos p ON p.id = a.id_producto
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = a.id_unidad
            INNER JOIN bodega_inventario.estados_ingreso ei ON ei.id = a.id_estado
            WHERE 1=1 {$whereExtra}";

            // Ejecutar conteo total de registros coincidentes
            $sqlCount = "SELECT COUNT(*) AS total_registros {$sqlBase}";
            $stmtCount = $this->connect->prepare($sqlCount);
            $stmtCount->execute($params);
            $resCount = $stmtCount->fetch(PDO::FETCH_OBJ);
            $total = (int)($resCount->total_registros ?? 0);

            if ($total === 0) {
                return $this->res->info('No se encontraron registros de altas que coincidan con los filtros aplicados');
            }

            // Consulta de extracción de datos con ordenamiento y límites dinámicos
            $sqlData = "SELECT
                a.id, 
                a.id_bodega_destino, 
                b.nombre AS bodega,
                a.id_producto, 
                p.nombre AS producto,
                p.id_tipo AS id_tipo_producto, 
                tp.nombre AS tipo_producto,
                a.id_unidad, 
                um.nombre AS unidad, 
                um.abreviatura AS abreviatura_unidad,
                a.cantidad_enviada, 
                a.cantidad_ingresada,
                (a.cantidad_enviada - a.cantidad_ingresada) AS cantidad_pendiente,
                a.id_estado, 
                ei.nombre AS estado,
                a.precio_unitario, 
                a.id_compra,
                a.id_usuario_admin, 
                a.created_at, 
                a.updated_at
            {$sqlBase}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT {$porPagina} OFFSET {$offset}";

            $stmtData = $this->connect->prepare($sqlData);
            $stmtData->execute($params);

            // Mapeo estricto utilizando objetos limpios standard
            $altas = $stmtData->fetchAll(PDO::FETCH_OBJ);

            // 4. Recorrido y tipificación fuerte de las propiedades de cada objeto
            foreach ($altas as $a) {
                $this->_normalizarFilaAlta($a);
            }

            return $this->res->ok('Listado de altas obtenido correctamente', [
                'altas' => $altas,
                'total' => $total,
                'pagina' => $pagina,
                'por_pagina' => $porPagina,
                'paginas' => (int)ceil($total / $porPagina),
            ]);

        } catch (Exception $e) {
            error_log("Error en listarAltas: " . $e->getMessage());
            return $this->res->fail('Error en el servidor al recuperar el catálogo de altas', $e);
        }
    }

    /**
     * Obtiene la información detallada de un alta específica junto con sus lotes relacionados
     * estructurados dinámicamente según el tipo de control de inventario del producto.
     *
     * GET: bodega_inventario/obtenerAltaDetalle
     */
    public function obtenerAltaDetalle(): array
    {
        try {
            // Capturar y validar el parámetro desde la URL
            $idAlta = (int)filter_input(INPUT_GET, 'id_alta', FILTER_VALIDATE_INT);

            if ($idAlta < 1) {
                return $this->res->fail('El parámetro id_alta es requerido y debe ser un entero positivo');
            }

            // 1. Consulta A: Extraer la información base del encabezado del alta
            $sqlAlta = "SELECT 
                a.id, 
                a.id_bodega_destino, 
                b.nombre AS bodega,
                a.id_producto, 
                p.nombre AS producto,
                p.id_tipo AS id_tipo_producto, 
                tp.nombre AS tipo_producto,
                a.id_unidad, 
                um.nombre AS unidad, 
                um.abreviatura AS abreviatura_unidad,
                a.cantidad_enviada, 
                a.cantidad_ingresada,
                (a.cantidad_enviada - a.cantidad_ingresada) AS cantidad_pendiente,
                a.id_estado, 
                ei.nombre AS estado,
                a.precio_unitario, 
                a.id_compra,
                a.id_usuario_admin, 
                a.created_at, 
                a.updated_at
            FROM bodega_inventario.altas a
            INNER JOIN bodega_inventario.bodegas b ON b.id = a.id_bodega_destino
            INNER JOIN bodega_inventario.productos p ON p.id = a.id_producto
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = a.id_unidad
            INNER JOIN bodega_inventario.estados_ingreso ei ON ei.id = a.id_estado
            WHERE a.id = ? 
            LIMIT 1";

            $stmt = $this->connect->prepare($sqlAlta);
            $stmt->execute([$idAlta]);
            $alta = $stmt->fetch(PDO::FETCH_OBJ);

            if (!$alta) {
                return $this->res->fail('El registro de alta especificado no existe en el sistema');
            }

            // Aplicar el método de normalización centralizado para castear propiedades del objeto base
            $this->_normalizarFilaAlta($alta);

            $idTipo = (int)$alta->id_tipo_producto;

            // Inicialización de colecciones anidadas en el objeto contenedor
            $alta->lotes_correlativo = [];
            $alta->lotes_expiracion = [];
            $alta->lotes_normal = [];

            // 2. Extracción condicional y tipado fuerte de lotes según la naturaleza del producto

            // ── ESCENARIO 1: LOTES CONTROLADOS POR CORRELATIVO ─────────────────
            if ($idTipo === 1) {
                $sqlCorrelativo = "SELECT 
                    id, 
                    serie, 
                    resolucion, 
                    fecha_resolucion,
                    correlativo_inicial, 
                    correlativo_final,
                    correlativo_siguiente, 
                    cantidad_disponible, 
                    created_at
                FROM bodega_inventario.lotes_correlativo
                WHERE id_alta = ? 
                ORDER BY correlativo_inicial ASC";

                $stmtCorr = $this->connect->prepare($sqlCorrelativo);
                $stmtCorr->execute([$idAlta]);
                $lotes = $stmtCorr->fetchAll(PDO::FETCH_OBJ);

                foreach ($lotes as $l) {
                    $l->id = (int)$l->id;
                    $l->correlativo_inicial = (int)$l->correlativo_inicial;
                    $l->correlativo_final = (int)$l->correlativo_final;
                    $l->correlativo_siguiente = (int)$l->correlativo_siguiente;
                    $l->cantidad_disponible = (int)$l->cantidad_disponible;
                }
                $alta->lotes_correlativo = $lotes;

                // ── ESCENARIO 2: LOTES CONTROLADOS POR FECHA DE EXPIRACIÓN (PEPS) ───
            } elseif ($idTipo === 2) {
                $sqlExpiracion = "SELECT 
                    id, 
                    fecha_expiracion, 
                    cantidad_disponible, 
                    created_at
                FROM bodega_inventario.lotes_expiracion
                WHERE id_alta = ? 
                ORDER BY fecha_expiracion ASC";

                $stmtExp = $this->connect->prepare($sqlExpiracion);
                $stmtExp->execute([$idAlta]);
                $lotes = $stmtExp->fetchAll(PDO::FETCH_OBJ);

                foreach ($lotes as $l) {
                    $l->id = (int)$l->id;
                    $l->cantidad_disponible = (float)$l->cantidad_disponible;
                }
                $alta->lotes_expiracion = $lotes;

                // ── ESCENARIO 3: LOTES BAJO FLUJO NORMAL (FIFO) ─────────────────────
            } elseif ($idTipo === 3) {
                $sqlNormal = "SELECT 
                    id, 
                    cantidad_disponible, 
                    fecha_ingreso
                FROM bodega_inventario.lotes_normal
                WHERE id_alta = ? 
                ORDER BY fecha_ingreso ASC";

                $stmtNorm = $this->connect->prepare($sqlNormal);
                $stmtNorm->execute([$idAlta]);
                $lotes = $stmtNorm->fetchAll(PDO::FETCH_OBJ);

                foreach ($lotes as $l) {
                    $l->id = (int)$l->id;
                    $l->cantidad_disponible = (float)$l->cantidad_disponible;
                }
                $alta->lotes_normal = $lotes;
            }

            return $this->res->ok('Detalle del alta e inventario asociado recuperado correctamente', [
                'alta' => $alta
            ]);

        } catch (Exception $e) {
            error_log("Error en obtenerAltaDetalle: " . $e->getMessage());
            return $this->res->fail('Error en el servidor al recuperar el detalle técnico del alta', $e);
        }
    }

    /**
     * Recupera el catálogo de bodegas activas y habilitadas para recibir asignaciones de altas.
     *
     * GET: bodega_inventario/listarBodegasParaAlta
     */
    public function listarBodegasParaAlta(): array
    {
        try {
            $sqlBodegas = "SELECT b.id, b.nombre 
            FROM bodega_inventario.bodegas b
            WHERE b.activo = 1 
            ORDER BY b.nombre ASC";

            $stmt = $this->connect->query($sqlBodegas);
            $bodegas = $stmt->fetchAll(PDO::FETCH_OBJ);

            if (empty($bodegas)) {
                return $this->res->info('No se encontraron bodegas operativas y activas disponibles');
            }

            // Forzar el casteo estricto de identificadores sobre las instancias stdClass
            foreach ($bodegas as $b) {
                $b->id = (int)$b->id;
            }

            return $this->res->ok('Listado de bodegas operativas obtenido correctamente', [
                'bodegas' => $bodegas
            ]);

        } catch (Exception $e) {
            error_log("Error en listarBodegasParaAlta: " . $e->getMessage());
            return $this->res->fail('Error en el servidor al recuperar el catálogo de bodegas', $e);
        }
    }

    /**
     * Lista los productos activos estructurando sus respectivas unidades de medida válidas.
     *
     * GET: bodega_inventario/listarProductosParaAlta
     */
    public function listarProductosParaAlta(): array
    {
        try {
            // Consulta A: Catálogo global de productos comerciales activos
            $sqlProductos = "SELECT p.id, p.nombre, p.id_tipo, tp.nombre AS tipo
            FROM bodega_inventario.productos p
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            WHERE p.activo = 1 
            ORDER BY p.nombre ASC";

            $stmtP = $this->connect->query($sqlProductos);
            $productos = $stmtP->fetchAll(PDO::FETCH_OBJ);

            if (empty($productos)) {
                return $this->res->info('No hay productos activos registrados en el catálogo general');
            }

            // Consulta B: Relación cruzada de unidades de medida asignadas a los productos
            $sqlUnidades = "SELECT pu.id_producto, um.id, um.nombre, um.abreviatura, pu.es_default
            FROM bodega_inventario.productos_unidades pu
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = pu.id_unidad
            WHERE pu.activo = 1 
            ORDER BY pu.es_default DESC, um.nombre ASC";

            $stmtU = $this->connect->query($sqlUnidades);
            $unidades = $stmtU->fetchAll(PDO::FETCH_OBJ);

            $unidadesPorProducto = [];

            // Agrupar las unidades indexadas por el identificador del producto
            foreach ($unidades as $u) {
                $idP = (int)$u->id_producto;
                $unidadesPorProducto[$idP][] = (object)[
                    'id' => (int)$u->id,
                    'nombre' => $u->nombre,
                    'abreviatura' => $u->abreviatura,
                    'es_default' => (bool)$u->es_default,
                ];
            }

            // Consolidar e inyectar las colecciones de objetos anidadas
            foreach ($productos as $p) {
                $p->id = (int)$p->id;
                $p->id_tipo = (int)$p->id_tipo;
                $p->unidades = $unidadesPorProducto[$p->id] ?? [];
            }

            return $this->res->ok('Catálogo parametrizado de productos obtenido correctamente', [
                'productos' => $productos
            ]);

        } catch (Exception $e) {
            error_log("Error en listarProductosParaAlta: " . $e->getMessage());
            return $this->res->fail('Error en el servidor al recuperar el catálogo parametrizado', $e);
        }
    }

    /**
     * Registra un nuevo encabezado de alta de mercancía en estado inicial Pendiente (1).
     * Valida la vigencia de la bodega y la asociación reglamentaria unidad-producto.
     *
     * POST: bodega_inventario/crearAlta
     *
     * @param object $datos {
     * id_bodega_destino: int,
     * id_producto: int,
     * id_unidad: int,
     * cantidad_enviada: float,
     * precio_unitario: float|null
     * }
     */
    public function crearAlta($datos): array
    {
        try {
            $datos = $this->limpiarDatos($datos);
            $idBodega = (int)($datos->id_bodega_destino ?? 0);
            $idProd = (int)($datos->id_producto ?? 0);
            $idUnidad = (int)($datos->id_unidad ?? 0);
            $cantidad = (float)($datos->cantidad_enviada ?? 0);
            $precioUnitario = isset($datos->precio_unitario) && $datos->precio_unitario !== ''
                ? (float)$datos->precio_unitario
                : null;

            if ($idBodega < 1 || $idProd < 1 || $idUnidad < 1 || $cantidad <= 0) {
                return $this->res->fail('Estructura inválida: Todos los campos son requeridos y la cantidad debe ser mayor a cero');
            }

            // Seguridad: Validar que la bodega destino exista y opere de forma activa
            $sqlCheckBodega = "SELECT id FROM bodega_inventario.bodegas WHERE id = ? AND activo = 1 LIMIT 1";
            $stmtB = $this->connect->prepare($sqlCheckBodega);
            $stmtB->execute([$idBodega]);

            if (!$stmtB->fetch(PDO::FETCH_OBJ)) {
                return $this->res->fail('La bodega de destino seleccionada no existe o se encuentra inactiva');
            }

            // Integridad: Validar compatibilidad reglamentaria entre producto y la unidad elegida
            $sqlCheckRelacion = "SELECT pu.id
            FROM bodega_inventario.productos_unidades pu
            INNER JOIN bodega_inventario.productos p ON p.id = pu.id_producto
            WHERE pu.id_producto = ? 
              AND pu.id_unidad = ?
              AND pu.activo = 1 
              AND p.activo = 1 
            LIMIT 1";

            $stmtPU = $this->connect->prepare($sqlCheckRelacion);
            $stmtPU->execute([$idProd, $idUnidad]);

            if (!$stmtPU->fetch(PDO::FETCH_OBJ)) {
                return $this->res->fail('Inconsistencia: El producto o la unidad de medida no son válidos o se encuentran inactivos');
            }

            // Operación: Registrar el alta en estado Pendiente (1)
            $sqlInsertAlta = "INSERT INTO bodega_inventario.altas
                (id_bodega_destino, id_producto, id_unidad, cantidad_enviada,
                 cantidad_ingresada, id_estado, id_usuario_admin, precio_unitario)
            VALUES (?, ?, ?, ?, 0.00, 1, ?, ?)";

            $stmt = $this->connect->prepare($sqlInsertAlta);
            $stmt->execute([$idBodega, $idProd, $idUnidad, $cantidad, $this->idUsuario, $precioUnitario]);

            return $this->res->ok('El registro de alta ha sido creado correctamente en estado pendiente', [
                'id_alta' => (int)$this->connect->lastInsertId(),
            ]);

        } catch (Exception $e) {
            error_log("Error en crearAlta: " . $e->getMessage());
            return $this->res->fail('Error crítico al intentar asentar el alta de mercancía', $e);
        }
    }

    /**
     * Registra lotes controlados por rangos numéricos correlativos vinculados a una orden de alta.
     * Incrementa inventarios físicos y asienta movimientos en el Kardex de forma atómica.
     *
     * POST: bodega_inventario/ingresarCorrelativo
     *
     * @param object $datos {
     * id_alta: int,
     * rangos: array [{ serie: string, resolucion: string, fecha_resolucion: string, correlativo_inicial: int, cantidad: int }]
     * }
     */
    public function ingresarCorrelativo($datos): array
    {
        try {
            $this->_inicializarAltaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();

            $datos = $this->limpiarDatos($datos);
            $idAlta = (int)($datos->id_alta ?? 0);
            $rangos = $datos->rangos ?? [];

            // 1. Validaciones estructurales del lote entrante
            if ($idAlta < 1 || empty($rangos) || !is_array($rangos)) {
                return $this->res->fail('Estructura incompleta: Se requiere el id_alta y un listado válido de rangos a procesar');
            }

            // Obtener el registro del alta mapeándolo estrictamente a objeto stdClass mediante el Helper
            $altaRaw = $this->altaHelper->verificarAltaEditable($idAlta, 1);

            if (!$altaRaw) {
                return $this->res->fail('Acceso denegado: El alta no existe, se encuentra bloqueada o el producto no requiere series correlativas');
            }

            // Conversión a objeto limpio para mantener homogeneidad
            $alta = (object)$altaRaw;

            $pendiente = (float)$alta->cantidad_enviada - (float)$alta->cantidad_ingresada;
            $sumaRangos = 0;

            // Validar exhaustivamente las propiedades internas de cada rango enviado
            foreach ($rangos as $i => $r) {
                $r = (object)$r;
                $serie = trim($r->serie ?? '');
                $resol = trim($r->resolucion ?? '');
                $fecha = trim($r->fecha_resolucion ?? '');
                $ini = (int)($r->correlativo_inicial ?? 0);
                $cant = (int)($r->cantidad ?? 0);

                if (empty($serie) || empty($resol) || empty($fecha) || $ini < 1 || $cant < 1) {
                    return $this->res->fail("Error de consistencia: El renglón #" . ($i + 1) . " contiene campos obligatorios vacíos o numéricos inválidos");
                }
                $sumaRangos += $cant;
            }

            if ($sumaRangos > $pendiente) {
                return $this->res->fail("Operación rechazada: La sumatoria de las cantidades de los rangos ({$sumaRangos}) excede el saldo pendiente actual del alta ({$pendiente})");
            }

            // 2. Ejecución y persistencia atómica transaccional
            $this->connect->beginTransaction();

            $lotesCreados = 0;

            $sqlInsertLote = "INSERT INTO bodega_inventario.lotes_correlativo
                (id_bodega, id_producto, serie, resolucion, fecha_resolucion,
                 correlativo_inicial, correlativo_final, correlativo_siguiente,
                 cantidad_disponible, id_alta, id_usuario_encargado, precio_unitario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

            $stmtInsertLote = $this->connect->prepare($sqlInsertLote);

            foreach ($rangos as $r) {
                $r = (object)$r;
                $serie = trim($r->serie);
                $resol = trim($r->resolucion);
                $fecha = trim($r->fecha_resolucion);
                $ini = (int)$r->correlativo_inicial;
                $cantRango = (int)$r->cantidad;
                $fin = $ini + $cantRango - 1;

                $stmtInsertLote->execute([
                    (int)$alta->id_bodega_destino,
                    (int)$alta->id_producto,
                    $serie,
                    $resol,
                    $fecha,
                    $ini,
                    $fin,
                    $ini,
                    $cantRango,
                    $idAlta,
                    $this->idUsuario,
                    $alta->precio_unitario !== null ? (float)$alta->precio_unitario : null
                ]);

                $idLote = (int)$this->connect->lastInsertId();

                // Afectar de forma segura inventarios e histórico (Helpers Core)
                $this->stockHelper->incrementarPorAlta(
                    (int)$alta->id_bodega_destino,
                    (int)$alta->id_producto,
                    (int)$alta->id_unidad,
                    (float)$cantRango
                );

                $this->movimientoHelper->registrarAltaCompra(
                    (int)$alta->id_bodega_destino,
                    (int)$alta->id_producto,
                    (int)$alta->id_unidad,
                    (float)$cantRango,
                    'lotes_correlativo',
                    $idLote
                );

                $lotesCreados++;
            }

            // Recalcular saldos del documento base y resolver el nuevo estado resultante
            $nuevoEstado = $this->altaHelper->actualizarTotalesAlta(
                $idAlta,
                (float)$alta->cantidad_ingresada,
                (float)$alta->cantidad_enviada,
                (float)$sumaRangos
            );

            $this->connect->commit();

            return $this->res->ok('Los lotes de tipo correlativo e inventarios se han asentado correctamente', [
                'id_alta' => $idAlta,
                'id_estado' => (int)$nuevoEstado,
                'lotes_creados' => $lotesCreados,
            ]);

        } catch (Exception $e) {
            // Garantizar el rollback inmediato e integridad total ante excepciones
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }

            error_log("Error en ingresarCorrelativo: " . $e->getMessage());
            return $this->res->fail($e->getMessage());
        }
    }

    /**
     * Registra lotes controlados por fechas de vencimiento/expiración vinculados a una orden de alta (Tipo 2).
     * Valida de forma estricta el formato temporal YYYY-MM-DD, incrementa existencias físicas
     * y asienta los movimientos en el Kardex de manera atómica.
     *
     * POST: bodega_inventario/ingresarExpiracion
     *
     * @param object $datos {
     * id_alta: int,
     * lotes: array [{ fecha_expiracion: string, cantidad: float }]
     * }
     */
    public function ingresarExpiracion($datos): array
    {
        try {
            $this->_inicializarAltaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();

            $datos = $this->limpiarDatos($datos);
            $idAlta = (int)($datos->id_alta ?? 0);
            $lotes = $datos->lotes ?? [];

            // 1. Validaciones estructurales del lote entrante
            if ($idAlta < 1 || empty($lotes) || !is_array($lotes)) {
                return $this->res->fail('Estructura incompleta: Se requiere el id_alta y un listado válido de lotes a procesar');
            }

            // Obtener el registro del alta mapeándolo estrictamente a objeto stdClass mediante el Helper
            $altaRaw = $this->altaHelper->verificarAltaEditable($idAlta, 2);

            if (!$altaRaw) {
                return $this->res->fail('Acceso denegado: El alta no existe, se encuentra bloqueada o el producto no requiere fechas de expiración');
            }

            // Conversión a objeto limpio para mantener homogeneidad orientada a objetos
            $alta = (object)$altaRaw;

            $pendiente = (float)$alta->cantidad_enviada - (float)$alta->cantidad_ingresada;
            $sumaCantidades = 0;

            // Validar exhaustivamente las propiedades internas de cada lote enviado
            foreach ($lotes as $i => $l) {
                $l = (object)$l;
                $fecha = trim($l->fecha_expiracion ?? '');
                $cantidad = (float)($l->cantidad ?? 0);

                if (empty($fecha) || $cantidad <= 0) {
                    return $this->res->fail("Error de consistencia: El lote #" . ($i + 1) . " tiene una fecha vacía o una cantidad menor o igual a cero");
                }

                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
                    return $this->res->fail("Error de formato: El lote #" . ($i + 1) . " presenta una fecha inválida (Debe utilizar el formato estricto YYYY-MM-DD)");
                }

                $sumaCantidades += $cantidad;
            }

            if ($sumaCantidades > $pendiente) {
                return $this->res->fail("Operación rechazada: La sumatoria de las cantidades ingresadas ({$sumaCantidades}) excede el saldo pendiente actual del alta ({$pendiente})");
            }

            // 2. Ejecución y persistencia atómica transaccional
            $this->connect->beginTransaction();

            $lotesCreados = 0;

            $sqlInsertLote = "INSERT INTO bodega_inventario.lotes_expiracion
                (id_bodega, id_producto, id_unidad, fecha_expiracion,
                 cantidad_disponible, id_alta, id_usuario_encargado, precio_unitario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

            $stmtInsertLote = $this->connect->prepare($sqlInsertLote);

            foreach ($lotes as $l) {
                $l = (object)$l;
                $fecha = trim($l->fecha_expiracion);
                $cantidad = (float)$l->cantidad;

                $stmtInsertLote->execute([
                    (int)$alta->id_bodega_destino,
                    (int)$alta->id_producto,
                    (int)$alta->id_unidad,
                    $fecha,
                    $cantidad,
                    $idAlta,
                    $this->idUsuario,
                    $alta->precio_unitario !== null ? (float)$alta->precio_unitario : null,
                ]);

                $idLote = (int)$this->connect->lastInsertId();

                // Afectar de forma segura inventarios e histórico en Kardex (Helpers Core)
                $this->stockHelper->incrementarPorAlta(
                    (int)$alta->id_bodega_destino,
                    (int)$alta->id_producto,
                    (int)$alta->id_unidad,
                    $cantidad
                );

                $this->movimientoHelper->registrarAltaCompra(
                    (int)$alta->id_bodega_destino,
                    (int)$alta->id_producto,
                    (int)$alta->id_unidad,
                    $cantidad,
                    'lotes_expiracion',
                    $idLote
                );

                $lotesCreados++;
            }

            // Recalcular saldos del documento base y resolver el nuevo estado resultante
            $nuevoEstado = $this->altaHelper->actualizarTotalesAlta(
                $idAlta,
                (float)$alta->cantidad_ingresada,
                (float)$alta->cantidad_enviada,
                $sumaCantidades
            );

            $this->connect->commit();

            return $this->res->ok('Los lotes controlados por vencimiento e inventarios se han asentado correctamente', [
                'id_alta' => $idAlta,
                'id_estado' => (int)$nuevoEstado,
                'lotes_creados' => $lotesCreados,
            ]);

        } catch (Exception $e) {
            // Garantizar el rollback inmediato e integridad total ante excepciones de base de datos
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }

            error_log("Error en ingresarExpiracion: " . $e->getMessage());
            return $this->res->fail($e->getMessage());
        }
    }

    /**
     * Registra un ingreso de inventario físico de flujo estándar (Normal / FIFO) para un alta (Tipo 3).
     * Valida saldos, crea un lote único atómico con marca temporal, incrementa existencias
     * y asienta los movimientos en el Kardex de manera transaccional.
     *
     * POST: bodega_inventario/ingresarNormal
     *
     * @param object $datos {
     * id_alta: int,
     * cantidad_recibida: float
     * }
     */
    public function ingresarNormal($datos): array
    {
        try {
            $this->_inicializarAltaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();

            $datos = $this->limpiarDatos($datos);
            $idAlta = (int)($datos->id_alta ?? 0);
            $cantidad = (float)($datos->cantidad_recibida ?? 0);

            // 1. Validaciones estructurales y de consistencia básica
            if ($idAlta < 1 || $cantidad <= 0) {
                return $this->res->fail('Estructura inválida: Se requiere el id_alta y una cantidad_recibida mayor a cero');
            }

            // Obtener el registro del alta mapeándolo estrictamente a objeto stdClass mediante el Helper
            $altaRaw = $this->altaHelper->verificarAltaEditable($idAlta, 3);

            if (!$altaRaw) {
                return $this->res->fail('Acceso denegado: El alta no existe, se encuentra bloqueada o el producto requiere un control especial de lotes');
            }

            // Conversión a objeto limpio para mantener homogeneidad orientada a objetos
            $alta = (object)$altaRaw;

            $pendiente = (float)$alta->cantidad_enviada - (float)$alta->cantidad_ingresada;

            if ($cantidad > $pendiente) {
                return $this->res->fail("Operación rechazada: La cantidad recibida ({$cantidad}) supera el saldo pendiente actual del alta ({$pendiente})");
            }

            // 2. Ejecución y persistencia atómica transaccional
            $this->connect->beginTransaction();

            $sqlInsertLote = "INSERT INTO bodega_inventario.lotes_normal
                (id_bodega, id_producto, id_unidad, cantidad_disponible,
                 fecha_ingreso, id_alta, id_usuario_encargado, precio_unitario)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)";

            $stmtL = $this->connect->prepare($sqlInsertLote);
            $stmtL->execute([
                (int)$alta->id_bodega_destino,
                (int)$alta->id_producto,
                (int)$alta->id_unidad,
                $cantidad,
                $idAlta,
                $this->idUsuario,
                $alta->precio_unitario !== null ? (float)$alta->precio_unitario : null,
            ]);

            $idLote = (int)$this->connect->lastInsertId();

            // Afectar de forma segura inventarios de la celda (Helper de Stock)
            $this->stockHelper->incrementarPorAlta(
                (int)$alta->id_bodega_destino,
                (int)$alta->id_producto,
                (int)$alta->id_unidad,
                $cantidad
            );

            // Registrar la trazabilidad de entrada por compras en el Kardex (Helper de Movimientos)
            $this->movimientoHelper->registrarAltaCompra(
                (int)$alta->id_bodega_destino,
                (int)$alta->id_producto,
                (int)$alta->id_unidad,
                $cantidad,
                'lotes_normal',
                $idLote
            );

            // Recalcular saldos del documento base y resolver el nuevo estado resultante
            $nuevoEstado = $this->altaHelper->actualizarTotalesAlta(
                $idAlta,
                (float)$alta->cantidad_ingresada,
                (float)$alta->cantidad_enviada,
                $cantidad
            );

            $this->connect->commit();

            return $this->res->ok('El ingreso normal de mercancía e inventarios se ha asentado correctamente', [
                'id_alta' => $idAlta,
                'id_estado' => (int)$nuevoEstado,
                'lotes_creados' => 1,
            ]);

        } catch (Exception $e) {
            // Garantizar el rollback inmediato e integridad total ante excepciones de base de datos
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }

            error_log("Error en ingresarNormal: " . $e->getMessage());
            return $this->res->fail($e->getMessage());
        }
    }

    /**
     * Modifica la cantidad_enviada original de un registro de alta que aún no ha sido finalizado.
     * Si la nueva cantidad se iguala con lo que ya ingresó físicamente el encargado,
     * el documento se cierra automáticamente pasando a estado Completado (3).
     *
     * POST: bodega_inventario/ajustarCantidadAlta
     *
     * @param object $datos {
     * id_alta: int,
     * cantidad_enviada: float,
     * motivo: string
     * }
     */
    public function ajustarCantidadAlta($datos): array
    {
        try {
            $datos = $this->limpiarDatos($datos);
            $idAlta = (int)($datos->id_alta ?? 0);
            $nuevaCantidad = (float)($datos->cantidad_enviada ?? 0);
            $motivo = trim($datos->motivo ?? '');

            // 1. Validaciones estructurales básicas
            if ($idAlta < 1 || $nuevaCantidad <= 0 || empty($motivo)) {
                return $this->res->fail('Estructura inválida: Se requiere el id_alta, cantidad_enviada mayor a cero y el motivo del ajuste');
            }

            // Consulta A: Verificar la existencia, estado actual y saldos de la orden de alta
            $sqlAlta = "SELECT id, id_estado, cantidad_enviada, cantidad_ingresada
            FROM bodega_inventario.altas 
            WHERE id = ? 
            LIMIT 1";

            $stmt = $this->connect->prepare($sqlAlta);
            $stmt->execute([$idAlta]);
            $alta = $stmt->fetch(PDO::FETCH_OBJ);

            if (!$alta) {
                return $this->res->fail('El registro de alta especificado no existe en el sistema');
            }

            if ((int)$alta->id_estado === 3) {
                return $this->res->fail('Operación denegada: El alta ya se encuentra Completada y no admite modificaciones en sus cantidades');
            }

            $ingresada = (float)$alta->cantidad_ingresada;

            if ($nuevaCantidad < $ingresada) {
                return $this->res->fail("Operación rechazada: La nueva cantidad solicitada ({$nuevaCantidad}) no puede ser menor a la mercancía que ya fue ingresada físicamente ({$ingresada})");
            }

            // 2. Evaluación de reglas de negocio para determinar el cierre automático del documento
            $nuevoEstado = $nuevaCantidad <= $ingresada ? 3 : (int)$alta->id_estado;

            // Consulta B: Actualizar las cantidades del encabezado y aplicar auditoría básica si aplica
            $sqlUpdateAlta = "UPDATE bodega_inventario.altas
            SET cantidad_enviada = ?, 
                id_estado = ?,
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?";

            $this->connect->prepare($sqlUpdateAlta)->execute([$nuevaCantidad, $nuevoEstado, $idAlta]);

            // Estructuración limpia del mensaje de respuesta según el flujo resultante
            $mensajeEstado = $nuevoEstado === 3
                ? 'El alta ha cumplido con el saldo físico y fue marcada como Completada de forma automática.'
                : 'La cantidad enviada de la orden fue ajustada correctamente y permanece abierta para futuros ingresos.';

            return $this->res->ok("Ajuste de inventario aplicado con éxito. {$mensajeEstado}");

        } catch (Exception $e) {
            error_log("Error en ajustarCantidadAlta: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar ajustar la cantidad del alta', $e);
        }
    }

    /**
     * Elimina el último lote ingresado de un alta bajo la regla estricta LIFO y revierte el stock asignado.
     * Valida de forma rigurosa que el lote no tenga consumos y sea posterior al último cierre mensual.
     *
     * POST: bodega_inventario/eliminarLote
     *
     * @param object $datos {
     * id_alta: int,
     * id_lote: int,
     * tipo_lote: string (correlativo|expiracion|normal)
     * }
     */
    public function eliminarLote($datos): array
    {
        try {
            $this->_inicializarAltaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();

            $datos = $this->limpiarDatos($datos);
            $idAlta = (int)($datos->id_alta ?? 0);
            $idLote = (int)($datos->id_lote ?? 0);
            $tipoLote = trim($datos->tipo_lote ?? '');

            // 1. Validaciones estructurales básicas
            if ($idAlta < 1 || $idLote < 1 || empty($tipoLote)) {
                return $this->res->fail('Estructura inválida: Se requiere el id_alta, id_lote y el tipo_lote');
            }

            if (!in_array($tipoLote, ['correlativo', 'expiracion', 'normal'], true)) {
                return $this->res->fail('El campo tipo_lote es inválido. Opciones permitidas: correlativo, expiracion o normal');
            }

            // Consulta A: Extraer información del encabezado del alta
            $sqlAlta = "SELECT a.id, a.id_bodega_destino, a.id_producto, a.id_unidad,
                a.cantidad_enviada, a.cantidad_ingresada, a.id_estado
            FROM bodega_inventario.altas a 
            WHERE a.id = ? 
            LIMIT 1";

            $stmtAlta = $this->connect->prepare($sqlAlta);
            $stmtAlta->execute([$idAlta]);
            $alta = $stmtAlta->fetch(PDO::FETCH_OBJ);

            if (!$alta) {
                return $this->res->fail('El registro de alta especificado no existe en el sistema');
            }

            if ((int)$alta->id_estado === 3) {
                return $this->res->fail('Operación denegada: No se permite revertir o eliminar lotes de un alta que ya fue Completada');
            }

            // Resolutores dinámicos del helper para metadatos de las tablas de lotes
            $tabla = $this->altaHelper->tablaPorTipo($tipoLote);
            $campoCreacion = $this->altaHelper->campoFechaCreacion($tipoLote);

            // Consulta B: Recuperar el lote específico parametrizado por objeto
            $sqlLote = "SELECT id, cantidad_disponible, {$campoCreacion}
            FROM bodega_inventario.{$tabla} 
            WHERE id = ? 
              AND id_alta = ? 
            LIMIT 1";

            $stmtLote = $this->connect->prepare($sqlLote);
            $stmtLote->execute([$idLote, $idAlta]);
            $lote = $stmtLote->fetch(PDO::FETCH_OBJ);

            if (!$lote) {
                return $this->res->fail('El lote especificado no existe o no se encuentra vinculado a esta orden de alta');
            }

            // Consulta C: Validar regla LIFO (Debe ser obligatoriamente el último ingresado)
            $sqlUltimo = "SELECT id 
            FROM bodega_inventario.{$tabla}
            WHERE id_alta = ?
            ORDER BY {$campoCreacion} DESC, id DESC 
            LIMIT 1";

            $stmtUltimo = $this->connect->prepare($sqlUltimo);
            $stmtUltimo->execute([$idAlta]);
            $idUltimoLote = (int)$stmtUltimo->fetchColumn();

            if ($idUltimoLote !== $idLote) {
                return $this->res->fail('Regla LIFO violada: Solo se puede eliminar el último lote cronológico ingresado. Elimine primero los lotes más recientes');
            }

            // Mapeo orientado a objetos para extraer la cantidad original antes de mutaciones
            $cantidadOriginal = (float)$this->altaHelper->cantidadOriginalLote($tipoLote, (array)$lote);

            // Validar trazabilidad de consumos del lote
            if (abs((float)$lote->cantidad_disponible - $cantidadOriginal) > 0.0001) {
                return $this->res->fail("Operación rechazada: El lote ya cuenta con despachos, consumos o entregas parciales asentadas (Disponible: {$lote->cantidad_disponible}, Original: {$cantidadOriginal})");
            }

            // Validar periodos fiscales y bloqueos por cierres de inventario mensuales
            $fechaLote = $lote->{$campoCreacion};
            if (!$this->cierreHelper->esPosteriorAlUltimoCierre($fechaLote)) {
                $ultimoCierre = $this->cierreHelper->obtenerUltimoCierre();
                return $this->res->fail("Restricción contable: El lote seleccionado pertenece a un periodo bloqueado por el último cierre mensual ({$ultimoCierre})");
            }

            // 2. Proceso de Reversión y Mutación Transaccional Atómica
            $this->connect->beginTransaction();

            // Operación I: Eliminar físicamente el registro del lote
            $sqlDeleteLote = "DELETE FROM bodega_inventario.{$tabla} WHERE id = ?";
            $this->connect->prepare($sqlDeleteLote)->execute([$idLote]);

            // Operación II: Descontar stock general (Helper Core)
            $this->stockHelper->revertirPorEliminacionLote(
                (int)$alta->id_bodega_destino,
                (int)$alta->id_producto,
                (int)$alta->id_unidad,
                $cantidadOriginal
            );

            // Operación III: Asentar contra-movimiento de reversa en Kardex (Helper Core)
            $this->movimientoHelper->registrarReversaAlta(
                (int)$alta->id_bodega_destino,
                (int)$alta->id_producto,
                (int)$alta->id_unidad,
                $cantidadOriginal,
                $tabla,
                $idLote
            );

            // Operación IV: Recalcular saldos del encabezado de la orden de alta
            $nuevaIngresada = max(0.00, (float)$alta->cantidad_ingresada - $cantidadOriginal);
            $nuevoEstado = $nuevaIngresada <= 0.00 ? 1 : 2;

            $sqlUpdateAlta = "UPDATE bodega_inventario.altas
            SET cantidad_ingresada = ?, 
                id_estado = ?, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?";

            $this->connect->prepare($sqlUpdateAlta)->execute([$nuevaIngresada, $nuevoEstado, $idAlta]);

            $this->connect->commit();

            return $this->res->ok('El lote ha sido eliminado y las existencias asociadas se revirtieron correctamente del inventario', [
                'id_alta' => $idAlta,
                'id_estado' => $nuevoEstado,
                'cantidad_revertida' => $cantidadOriginal,
            ]);

        } catch (Exception $e) {
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }

            error_log("Error en eliminarLote: " . $e->getMessage());
            return $this->res->fail('Error crítico en el servidor al procesar la eliminación del lote', $e);
        }
    }

    /**
     * Modifica o bifurca la edición de una orden de alta activa en base a su flujo de ingresos físicos.
     * Si no cuenta con ingresos, se ejecuta una alteración estructural completa; si cuenta con
     * ingresos parciales, se delega un ajuste restrictivo para salvaguardar la integridad del stock.
     *
     * POST: bodega_inventario/editarAlta
     *
     * @param object $datos {
     * id_alta: int,
     * ... propiedades dinámicas a modificar según el escenario de edición
     * }
     */
    public function editarAlta($datos): array
    {
        try {
            $this->_inicializarAltaHelper();
            $datos = $this->limpiarDatos($datos);
            $idAlta = (int)($datos->id_alta ?? 0);

            // 1. Validaciones estructurales y de identidad básicas
            if ($idAlta < 1) {
                return $this->res->fail('El campo id_alta es requerido y debe ser un entero positivo');
            }

            // Consulta A: Extraer de forma limpia el estado y balances actuales de la orden de alta
            $sqlAlta = "SELECT id, id_estado, cantidad_enviada, cantidad_ingresada, precio_unitario
            FROM bodega_inventario.altas 
            WHERE id = ? 
            LIMIT 1";

            $stmt = $this->connect->prepare($sqlAlta);
            $stmt->execute([$idAlta]);

            // Mapeo estricto utilizando objetos limpios estándar
            $alta = $stmt->fetch(PDO::FETCH_OBJ);

            if (!$alta) {
                return $this->res->fail('El registro de alta especificado no existe en el sistema');
            }

            if ((int)$alta->id_estado === 3) {
                return $this->res->fail('Operación denegada: El alta ya se encuentra Completada y no admite ediciones estructurales');
            }

            // 2. Evaluación de reglas de negocio para determinar el tipo de mutación permitida

            // CASO A: Sin ingresos físicos registrados (cantidad_ingresada == 0) → Permite edición completa
            if (abs((float)$alta->cantidad_ingresada) < 0.0001) {
                return $this->altaHelper->editarAltaCompleta($datos, $alta);
            }

            // CASO B: Con ingresos parciales asentados en stock → Solo permite ajuste controlado de saldos
            return $this->altaHelper->ajustarAltaParcial($datos, $alta);

        } catch (Exception $e) {
            error_log("Error masivo en editarAlta: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar procesar la edición del alta', $e);
        }
    }

    /**
     * Vista de administrador superior: recupera el catálogo global de altas registradas
     * en cualquier bodega del sistema, aplicando filtros dinámicos y paginación estructurada.
     *
     * GET: bodega_inventario/listarAltasAdmin
     */
    public function listarAltasAdmin(): array
    {
        try {
            // 1. Captura y sanitización de parámetros de consulta URL
            $busqueda = trim($_GET['busqueda'] ?? '');
            $estado = isset($_GET['estado']) && $_GET['estado'] !== '' ? (int)$_GET['estado'] : null;

            $idAgencia = filter_input(INPUT_GET, 'id_agencia', FILTER_VALIDATE_INT);
            $idAgencia = $idAgencia !== false ? $idAgencia : null;

            $pagina = max(1, (int)($_GET['pagina'] ?? 1));
            $porPagina = min(50, max(1, (int)($_GET['por_pagina'] ?? 20)));
            $offset = ($pagina - 1) * $porPagina;

            $params = [];
            $whereExtra = '';

            // 2. Construcción dinámica de condiciones de filtrado
            if ($idAgencia !== null && $idAgencia >= 1) {
                $whereExtra .= ' AND b.id_agencia = ?';
                $params[] = $idAgencia;
            }

            if ($estado !== null) {
                $whereExtra .= ' AND a.id_estado = ?';
                $params[] = $estado;
            }

            if ($busqueda !== '') {
                $whereExtra .= ' AND (p.nombre LIKE ? OR b.nombre LIKE ?)';
                $params[] = "%{$busqueda}%";
                $params[] = "%{$busqueda}%";
            }

            // 3. Estructuración y aislamiento de las consultas SQL
            $sqlBase = "FROM bodega_inventario.altas a
            INNER JOIN bodega_inventario.bodegas b ON b.id = a.id_bodega_destino
            INNER JOIN bodega_inventario.productos p ON p.id = a.id_producto
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = a.id_unidad
            INNER JOIN bodega_inventario.estados_ingreso ei ON ei.id = a.id_estado
            LEFT JOIN dbintranet.agencia ag ON ag.idAgencia = b.id_agencia
            WHERE 1=1 {$whereExtra}";

            // Ejecutar conteo total de registros coincidentes
            $sqlCount = "SELECT COUNT(*) AS total_registros {$sqlBase}";
            $stmtCount = $this->connect->prepare($sqlCount);
            $stmtCount->execute($params);
            $resCount = $stmtCount->fetch(PDO::FETCH_OBJ);
            $total = (int)($resCount->total_registros ?? 0);

            if ($total === 0) {
                return $this->res->info('No se encontraron registros de altas administrativas con los criterios especificados');
            }

            // Consulta de extracción de datos con ordenamiento, joins cruzados y límites dinámicos
            $sqlData = "SELECT
                a.id, 
                a.id_bodega_destino, 
                b.nombre AS bodega,
                b.id_agencia, 
                COALESCE(ag.nombre, '—') AS agencia,
                a.id_producto, 
                p.nombre AS producto,
                p.id_tipo AS id_tipo_producto, 
                tp.nombre AS tipo_producto,
                a.id_unidad, 
                um.nombre AS unidad, 
                um.abreviatura AS abreviatura_unidad,
                a.cantidad_enviada, 
                a.cantidad_ingresada,
                (a.cantidad_enviada - a.cantidad_ingresada) AS cantidad_pendiente,
                a.id_estado, 
                ei.nombre AS estado,
                a.precio_unitario, 
                a.id_orden_compra,
                a.id_usuario_admin, 
                a.created_at, 
                a.updated_at
            {$sqlBase}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT {$porPagina} OFFSET {$offset}";

            $stmtData = $this->connect->prepare($sqlData);
            $stmtData->execute($params);

            // Mapeo estricto utilizando objetos estándar stdClass
            $altas = $stmtData->fetchAll(PDO::FETCH_OBJ);

            // 4. Recorrido, normalización centralizada y tipado de propiedades exclusivas
            foreach ($altas as $a) {
                $this->_normalizarFilaAlta($a);
                $a->id_agencia = (int)$a->id_agencia; // Campo exclusivo mapeado de forma orientada a objetos
            }

            return $this->res->ok('Catálogo global de altas administrativas recuperado correctamente', [
                'altas' => $altas,
                'total' => $total,
                'pagina' => $pagina,
                'por_pagina' => $porPagina,
                'paginas' => (int)ceil($total / $porPagina),
            ]);

        } catch (Exception $e) {
            error_log("Error masivo en listarAltasAdmin: " . $e->getMessage());
            return $this->res->fail('Error en el servidor al recuperar el histórico global de altas', $e);
        }
    }

    /**
     * Recupera el catálogo de agencias que cuentan con al menos un registro de alta asentado.
     * Utilizado exclusivamente para alimentar los componentes de filtrado en la vista de administrador.
     *
     * GET: bodega_inventario/listarAgenciasAdmin
     */
    public function listarAgenciasAdmin(): array
    {
        try {
            // Aislamiento de la sentencia SQL con joins estructurales de control
            $sqlAgencias = "SELECT DISTINCT 
                ag.idAgencia AS id, 
                ag.nombre
            FROM dbintranet.agencia ag
            INNER JOIN bodega_inventario.bodegas b ON b.id_agencia = ag.idAgencia
            INNER JOIN bodega_inventario.altas a ON a.id_bodega_destino = b.id
            ORDER BY ag.nombre ASC";

            $stmt = $this->connect->query($sqlAgencias);

            // Mapeo estricto utilizando objetos estándar stdClass
            $agencias = $stmt->fetchAll(PDO::FETCH_OBJ);

            if (empty($agencias)) {
                return $this->res->info('No se encontraron agencias con transacciones de altas registradas en el sistema');
            }

            // Forzar el casteo estricto de identificadores de manera orientada a objetos
            foreach ($agencias as $ag) {
                $ag->id = (int)$ag->id;
            }

            return $this->res->ok('Listado de agencias con altas obtenido correctamente', [
                'agencias' => $agencias
            ]);

        } catch (Exception $e) {
            error_log("Error en listarAgenciasAdmin: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar el catálogo de agencias administrativas', $e);
        }
    }

    // =========================================================================
    // INICIALIZADORES LAZY POR HELPER INDIVIDUAL
    // =========================================================================

    /**
     * Cada método inicializa únicamente el helper que necesita.
     * Si un helper depende de otro, llama al inicializador del padre primero.
     * La guard clause evita reinstanciar objetos en llamadas sucesivas.
     *
     * NOTA: se eliminó el método residual _obtenerTipoProducto2() que precedía
     * a estos inicializadores en la versión original; era un duplicado exacto de
     * _obtenerTipoProducto() y no se invocaba en ningún punto (código muerto).
     */

    private function _inicializarBodegaHelper(): void
    {
        if ($this->bodegaHelper !== null) {
            return;
        }

        $this->bodegaHelper = new BodegaHelper(
            $this->connect,
            $this->idUsuario,
            (int)$this->idAgencia,
            $this->puesto
        );
    }

    private function _inicializarMovimientoHelper(): void
    {
        if ($this->movimientoHelper !== null) {
            return;
        }

        $this->movimientoHelper = new MovimientoHelper(
            $this->connect,
            $this->idUsuario
        );
    }

    private function _inicializarCierreHelper(): void
    {
        if ($this->cierreHelper !== null) {
            return;
        }

        $this->cierreHelper = new CierreHelper(
            $this->connect
        );
    }

    private function _inicializarStockHelper(): void
    {
        if ($this->stockHelper !== null) {
            return;
        }

        // Inyección de dependencias jerárquica obligatoria
        $this->_inicializarMovimientoHelper();

        $this->stockHelper = new StockHelper(
            $this->connect,
            $this->movimientoHelper
        );
    }

    private function _inicializarLotesHelper(): void
    {
        if ($this->lotesHelper !== null) {
            return;
        }

        // Inyección de dependencias jerárquica obligatoria
        $this->_inicializarMovimientoHelper();

        $this->lotesHelper = new LotesHelper(
            $this->connect,
            $this->idUsuario,
            $this->movimientoHelper
        );
    }

    private function _inicializarAltaHelper(): void
    {
        if ($this->altaHelper !== null) {
            return;
        }

        // Inyección de dependencias jerárquica obligatoria
        $this->_inicializarMovimientoHelper();
        $this->_inicializarStockHelper();
        $this->_inicializarCierreHelper();

        $this->altaHelper = new AltaHelper(
            $this->connect,
            $this->movimientoHelper,
            $this->stockHelper,
            $this->cierreHelper,
            $this->res
        );
    }
    private function _inicializarReversaHelper(): void
    {
        if ($this->reversaHelper !== null) {
            return;
        }
        $this->_inicializarMovimientoHelper();
        $this->reversaHelper = new ReversaHelper(
            $this->connect,
            $this->idUsuario,
            $this->movimientoHelper
        );
    }

    // =========================================================================
    // SOLICITUDES — SPRINT 1
    // =========================================================================

    /**
     * Obtiene la información técnica de la bodega de agencia activa vinculada a la sucursal del usuario en sesión.
     *
     * GET: bodega_inventario/obtenerBodegaAgencia
     */
    public function obtenerBodegaAgencia(): array
    {
        try {
            $this->_inicializarBodegaHelper();

            // 1. Validaciones estructurales y de sesión del usuario
            if (!$this->idAgencia) {
                return $this->res->info('No tienes una agencia asignada en tu sesión activa');
            }

            // Resolver el identificador de la bodega mediante el helper de negocio
            $idBodega = (int)$this->bodegaHelper->obtenerBodegaAgencia();

            if (!$idBodega || $idBodega < 1) {
                return $this->res->info('Tu agencia actual no tiene una bodega de agencia activa asignada en el sistema');
            }

            // 2. Aislamiento de la sentencia SQL de extracción
            $sqlBodega = "SELECT 
                b.id, 
                b.nombre, 
                b.id_tipo, 
                tb.nombre AS tipo_bodega, 
                b.restriccion_acceso_activa, 
                b.activo
            FROM bodega_inventario.bodegas b
            INNER JOIN bodega_inventario.tipos_bodega tb ON tb.id = b.id_tipo
            WHERE b.id = ? 
            LIMIT 1";

            $stmt = $this->connect->prepare($sqlBodega);
            $stmt->execute([$idBodega]);

            // Mapeo estricto utilizando objetos estándar stdClass
            $bodega = $stmt->fetch(PDO::FETCH_OBJ);

            if (!$bodega) {
                return $this->res->info('La bodega asignada no pudo ser localizada o no se encuentra disponible');
            }

            // Forzar el casteo estricto de tipos de forma orientada a objetos
            $bodega->id = (int)$bodega->id;
            $bodega->id_tipo = (int)$bodega->id_tipo;
            $bodega->activo = (int)$bodega->activo;
            $bodega->restriccion_acceso_activa = (bool)$bodega->restriccion_acceso_activa;

            return $this->res->ok('Información de la bodega de agencia obtenida correctamente', [
                'bodega' => $bodega
            ]);

        } catch (Exception $e) {
            error_log("Error en obtenerBodegaAgencia: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar la bodega de agencia', $e);
        }
    }

    /**
     * Recupera el catálogo de bodegas de área activas (Tipo 2), evaluando de forma dinámica
     * si el usuario en sesión posee permisos de acceso según la matriz de restricciones vigentes.
     *
     * GET: bodega_inventario/listarBodegasArea
     */
    public function listarBodegasArea(): array
    {
        try {
            $this->_inicializarBodegaHelper();

            // 1. Aislamiento de la sentencia SQL de extracción de bodegas de área (id_tipo = 2)
            $sqlBodegas = "SELECT 
                b.id, 
                b.nombre, 
                b.id_tipo, 
                b.id_departamento_cooperativa, 
                b.restriccion_acceso_activa, 
                b.activo
            FROM bodega_inventario.bodegas b 
            WHERE b.id_tipo = 2 
              AND b.activo = 1 
            ORDER BY b.nombre ASC";

            $stmt = $this->connect->query($sqlBodegas);

            // Mapeo estricto utilizando objetos estándar stdClass
            $bodegas = $stmt->fetchAll(PDO::FETCH_OBJ);

            if (empty($bodegas)) {
                return $this->res->info('No se encontraron bodegas de área activas disponibles en el sistema');
            }

            // 2. Procesamiento y evaluación de restricciones de acceso orientada a objetos
            foreach ($bodegas as $bodega) {
                $bodega->id = (int)$bodega->id;
                $bodega->id_tipo = (int)$bodega->id_tipo;
                $bodega->id_departamento_cooperativa = (int)$bodega->id_departamento_cooperativa;
                $bodega->activo = (int)$bodega->activo;
                $bodega->restriccion_acceso_activa = (bool)$bodega->restriccion_acceso_activa;

                // Determinar acceso: si la restricción está activa evalúa la matriz, de lo contrario es libre
                $bodega->tiene_acceso = $bodega->restriccion_acceso_activa
                    ? $this->bodegaHelper->tieneAccesoMatriz($bodega->id, $this->puesto, (int)$this->idAgencia)
                    : true;
            }

            return $this->res->ok('Catálogo de bodegas de área recuperado correctamente', [
                'bodegas' => $bodegas,
                'total' => count($bodegas)
            ]);

        } catch (Exception $e) {
            error_log("Error en listarBodegasArea: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar el catálogo de bodegas de área', $e);
        }
    }

    /**
     * Recupera el catálogo de productos con existencias físicas en una bodega específica.
     * Aplica criterios de búsqueda, ordenamiento dinámico por columnas permitidas, paginación
     * y valida la matriz de seguridad si la bodega de área posee restricciones activas.
     *
     * GET: bodega_inventario/listarProductosDisponibles
     */
    public function listarProductosDisponibles(): array
    {
        try {
            $this->_inicializarBodegaHelper();

            // 1. Captura, sanitización y tipado de parámetros de URL
            $idBodega = (int)($_GET['id_bodega'] ?? 0);
            $busqueda = trim($_GET['busqueda'] ?? '');
            $pagina = max(1, (int)($_GET['pagina'] ?? 1));
            $porPagina = min(50, max(1, (int)($_GET['por_pagina'] ?? 20)));
            $offset = ($pagina - 1) * $porPagina;

            // Mapeo seguro de columnas para evitar inyecciones de código en el ORDER BY
            $camposPermitidos = [
                'nombre' => 'p.nombre',
                'tipo' => 'tp.nombre',
                'categoria' => 'cp.nombre',
                'unidad_default' => 'um.nombre',
                'cantidad_disponible' => 's.cantidad_disponible',
            ];

            $ordenSQL = $camposPermitidos[$_GET['orden_campo'] ?? 'nombre'] ?? 'p.nombre';
            $ordenDir = strtolower($_GET['orden_dir'] ?? 'asc') === 'desc' ? 'DESC' : 'ASC';

            if ($idBodega < 1) {
                return $this->res->fail('El parámetro id_bodega es requerido y debe ser un entero positivo');
            }

            // Consulta A: Validar la existencia, vigencia y políticas de seguridad de la bodega
            $sqlCheckBodega = "SELECT id, nombre, id_tipo, restriccion_acceso_activa 
                    FROM bodega_inventario.bodegas 
                    WHERE id = ? 
                      AND activo = 1 
                    LIMIT 1";

            $stmtBodega = $this->connect->prepare($sqlCheckBodega);
            $stmtBodega->execute([$idBodega]);
            $bodega = $stmtBodega->fetch(PDO::FETCH_OBJ);

            if (!$bodega) {
                return $this->res->fail('La bodega de almacenamiento seleccionada no existe o se encuentra dada de baja');
            }

            // Inicialización de contenedores para la inyección de parámetros estructurados
            $params = [$idBodega];
            $whereBusqueda = '';
            $whereMatriz = '';

            // Evaluar la inclusión de criterios de búsqueda textual parcial
            if ($busqueda !== '') {
                $whereBusqueda = " AND (p.nombre LIKE ? OR cp.nombre LIKE ?)";
                $params[] = "%{$busqueda}%";
                $params[] = "%{$busqueda}%";
            }

            // Segmentación y Capa de Seguridad: Validar privilegios en base a la Matriz de Acceso a Productos (Bodegas Tipo 2)
            if ((bool)$bodega->restriccion_acceso_activa && (int)$bodega->id_tipo === 2) {
                if (!$this->bodegaHelper->tieneAccesoMatrizSesion($idBodega)) {
                    return $this->res->info('Acceso denegado: No tienes permisos asignados en la matriz para consultar los productos de esta bodega');
                }

                $whereMatriz = " AND p.id IN (
                SELECT DISTINCT map.id_producto 
                FROM bodega_inventario.matriz_acceso ma 
                INNER JOIN bodega_inventario.matriz_acceso_productos map ON map.id_matriz = ma.id 
                WHERE ma.id_bodega = ? 
                  AND ma.id_puesto = ? 
                  AND ma.id_agencia = ? 
                  AND ma.activo = 1
            )";

                $params[] = $idBodega;
                $params[] = $this->puesto;
                $params[] = $this->idAgencia;
            }

            // 2. Estructuración y aislamiento del cuerpo principal de la consulta (SQL Base)
            $sqlBase = "FROM bodega_inventario.productos p
INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
INNER JOIN bodega_inventario.categorias_producto cp ON cp.id = p.id_categoria
LEFT JOIN bodega_inventario.productos_unidades pu ON pu.id_producto = p.id AND pu.es_default = 1 AND pu.activo = 1
LEFT JOIN bodega_inventario.unidades_medida um ON um.id = pu.id_unidad
LEFT JOIN bodega_inventario.stock s ON s.id_producto = p.id AND s.id_bodega = ? AND s.id_unidad = pu.id_unidad
WHERE p.activo = 1 {$whereBusqueda} {$whereMatriz}";

            // Consulta B: Ejecutar conteo total de registros paginables
            $sqlCount = "SELECT COUNT(*) AS total_registros {$sqlBase}";
            $stmtCount = $this->connect->prepare($sqlCount);
            $stmtCount->execute($params);
            $resCount = $stmtCount->fetch(PDO::FETCH_OBJ);
            $total = (int)($resCount->total_registros ?? 0);

            if ($total === 0) {
                return $this->res->info('No se encontraron productos disponibles o con existencias físicas en esta bodega bajo los filtros aplicados');
            }

            // Consulta C: Extracción parametrizada de registros ordenados con límites de paginación
            $sqlData = "SELECT 
                p.id, 
                p.nombre, 
                p.descripcion, 
                p.id_tipo, 
                tp.nombre AS tipo, 
                p.id_categoria, 
                cp.nombre AS categoria,
                um.id AS id_unidad_default, 
                um.nombre AS unidad_default, 
                um.abreviatura AS abreviatura_unidad,
                s.cantidad_total, 
                s.cantidad_reservada, 
                s.cantidad_disponible,
                (SELECT COUNT(*) FROM bodega_inventario.productos_unidades pu2 WHERE pu2.id_producto = p.id AND pu2.activo = 1) AS total_unidades
            {$sqlBase} 
            ORDER BY {$ordenSQL} {$ordenDir} 
            LIMIT {$porPagina} OFFSET {$offset}";

            $stmtData = $this->connect->prepare($sqlData);
            $stmtData->execute($params);

            // Mapeo estricto utilizando colecciones de objetos stdClass
            $productos = $stmtData->fetchAll(PDO::FETCH_OBJ);

            // 3. Recorrido para tipado fuerte y conversión sobre el arreglo de objetos
            foreach ($productos as $p) {
                $p->id = (int)$p->id;
                $p->id_tipo = (int)$p->id_tipo;
                $p->id_categoria = (int)$p->id_categoria;
                $p->id_unidad_default = (int)$p->id_unidad_default;
                $p->cantidad_total = (float)$p->cantidad_total;
                $p->cantidad_reservada = (float)$p->cantidad_reservada;
                $p->cantidad_disponible = (float)$p->cantidad_disponible;
                $p->total_unidades = (int)$p->total_unidades;
            }

            return $this->res->ok('Inventario disponible de la bodega recuperado correctamente', [
                'productos' => $productos,
                'total' => $total,
                'pagina' => $pagina,
                'por_pagina' => $porPagina,
                'paginas' => (int)ceil($total / $porPagina),
                'bodega' => (object)[
                    'id' => (int)$bodega->id,
                    'nombre' => $bodega->nombre
                ],
            ]);

        } catch (Exception $e) {
            error_log("Error masivo en listarProductosDisponibles: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar las existencias físicas de la bodega', $e);
        }
    }

    /**
     * Recupera el historial detallado de solicitudes emitidas por el usuario en sesión (aplanado a nivel de renglón).
     * Aplica criterios de filtrado dinámico por estado, búsquedas por texto parcial, paginación
     * y calcula en tiempo real la fecha de expiración física más próxima disponible en góndola.
     *
     * GET: bodega_inventario/listarMisSolicitudes
     */
    public function listarMisSolicitudes(): array
    {
        try {
            // 1. Captura, sanitización y tipado de parámetros de URL
            $busqueda  = trim($_GET['busqueda'] ?? '');
            $estado    = isset($_GET['estado']) && $_GET['estado'] !== '' ? (int)$_GET['estado'] : null;
            $pagina    = max(1, (int)($_GET['pagina'] ?? 1));
            $porPagina = min(50, max(1, (int)($_GET['por_pagina'] ?? 20)));
            $offset    = ($pagina - 1) * $porPagina;

            $params     = [$this->idUsuario];
            $whereExtra = '';

            // Construcción dinámica de condiciones de filtrado parcial
            if ($estado !== null) {
                $whereExtra .= " AND s.id_estado = ?";
                $params[]    = $estado;
            }

            if ($busqueda !== '') {
                $whereExtra .= " AND (b.nombre LIKE ? OR p.nombre LIKE ?)";
                $params[]    = "%{$busqueda}%";
                $params[]    = "%{$busqueda}%";
            }

            // 2. Estructuración y aislamiento del cuerpo principal de la consulta (SQL Base)
            $sqlBase = "FROM bodega_inventario.solicitudes s
            INNER JOIN bodega_inventario.bodegas b ON b.id = s.id_bodega
            INNER JOIN bodega_inventario.tipos_bodega tb ON tb.id = b.id_tipo
            INNER JOIN bodega_inventario.estados_solicitud es ON es.id = s.id_estado
            INNER JOIN bodega_inventario.solicitudes_detalle sd ON sd.id_solicitud = s.id
            INNER JOIN bodega_inventario.productos p ON p.id = sd.id_producto
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = sd.id_unidad
            WHERE s.id_usuario = ? {$whereExtra}";

            // Consulta A: Ejecutar conteo total de renglones paginables
            $sqlCount = "SELECT COUNT(*) AS total_renglones {$sqlBase}";
            $stmtCount = $this->connect->prepare($sqlCount);
            $stmtCount->execute($params);
            $resCount = $stmtCount->fetch(PDO::FETCH_OBJ);
            $total = (int)($resCount->total_renglones ?? 0);

            if ($total === 0) {
                return $this->res->ok('No se encontraron registros de solicitudes bajo los filtros aplicados', [
                    'renglones'  => [],
                    'total'      => 0,
                    'pagina'     => $pagina,
                    'por_pagina' => $porPagina,
                    'paginas'    => 0,
                ]);
            }

            // Consulta B: Extracción parametrizada de registros consolidados con subconsulta de fecha LIFO/FIFO
            $sqlData = "SELECT 
                s.id AS id_solicitud, 
                s.id_bodega,
                b.nombre AS bodega, 
                tb.id AS id_tipo_bodega, 
                tb.nombre AS tipo_bodega,
                s.id_estado, 
                es.nombre AS estado, 
                s.observaciones, 
                s.created_at, 
                s.updated_at,
                sd.id AS id_renglon, 
                p.id AS id_producto, 
                p.nombre AS producto,
                p.id_tipo AS id_tipo_producto, 
                tp.nombre AS tipo_producto,
                um.id AS id_unidad, 
                um.nombre AS unidad, 
                um.abreviatura AS abreviatura_unidad,
                sd.cantidad_solicitada, 
                sd.cantidad_entregada, 
                sd.motivo_rechazo,
                sd.id_usuario_gestion, 
                sd.fecha_gestion,
                sd.correlativo_inicial_asignado, 
                sd.correlativo_final_asignado,
                sd.correlativo_inicial_asignado_2, 
                sd.correlativo_final_asignado_2,
                COALESCE(
                    -- Si el renglón ya fue gestionado (Entregada), usar el lote REAL que se consumió
                    (SELECT MIN(le2.fecha_expiracion)
                     FROM bodega_inventario.solicitudes_detalle_lotes sdl2
                     INNER JOIN bodega_inventario.lotes_expiracion le2 ON le2.id = sdl2.id_lote_exp
                     WHERE sdl2.id_solicitud_det = sd.id
                       AND sdl2.id_lote_exp IS NOT NULL
                    ),
                    -- Si aún no se gestiona (sigue Reservada), mostrar proyección en vivo del
                    -- próximo lote a vencer con disponibilidad libre (descontando reservas de traslados)
                    (SELECT MIN(le.fecha_expiracion)
                     FROM bodega_inventario.lotes_expiracion le
                     WHERE le.id_producto = p.id
                       AND le.id_bodega = s.id_bodega
                       AND le.id_unidad = sd.id_unidad
                       AND (le.cantidad_disponible - le.cantidad_reservada) > 0
                    )
                ) AS fecha_expiracion_proxima
            {$sqlBase} 
            ORDER BY s.created_at DESC, s.id ASC, sd.id ASC 
            LIMIT {$porPagina} OFFSET {$offset}";

            $stmtData = $this->connect->prepare($sqlData);
            $stmtData->execute($params);

            // Mapeo estricto utilizando colecciones de objetos stdClass
            $renglones = $stmtData->fetchAll(PDO::FETCH_OBJ);

            // 3. Recorrido para tipado fuerte y conversión sobre el arreglo de objetos
            foreach ($renglones as $r) {
                $r->id_solicitud       = (int)$r->id_solicitud;
                $r->id_bodega          = (int)$r->id_bodega;
                $r->id_tipo_bodega     = (int)$r->id_tipo_bodega;
                $r->id_estado          = (int)$r->id_estado;
                $r->id_renglon         = (int)$r->id_renglon;
                $r->id_producto        = (int)$r->id_producto;
                $r->id_tipo_producto   = (int)$r->id_tipo_producto;
                $r->id_unidad          = (int)$r->id_unidad;

                $r->cantidad_solicitada = (float)$r->cantidad_solicitada;
                $r->cantidad_entregada  = $r->cantidad_entregada !== null
                    ? (float)$r->cantidad_entregada
                    : null;

                // Mapeo dinámico y vertical para el casteo seguro de rangos correlativos
                $columnasCorrelativos = [
                    'correlativo_inicial_asignado',
                    'correlativo_final_asignado',
                    'correlativo_inicial_asignado_2',
                    'correlativo_final_asignado_2'
                ];

                foreach ($columnasCorrelativos as $col) {
                    $r->{$col} = $r->{$col} !== null
                        ? (int)$r->{$col}
                        : null;
                }
            }

            return $this->res->ok('Historial de renglones de solicitudes obtenido correctamente', [
                'renglones'  => $renglones,
                'total'      => $total,
                'pagina'     => $pagina,
                'por_pagina' => $porPagina,
                'paginas'    => (int)ceil($total / $porPagina),
            ]);

        } catch (Exception $e) {
            error_log("Error masivo en listarMisSolicitudes: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar el listado de solicitudes', $e);
        }
    }

    /**
     * Recupera las unidades de medida, existencias y metadatos de un producto dentro de una bodega.
     * Segmenta la respuesta según las reglas de negocio de los 3 tipos de producto:
     * - Tipo 1 (Correlativos): Añade desglose de series y cálculo de asignados.
     * - Tipo 2 (Expiración): Incorpora la fecha de vencimiento más próxima disponible.
     * - Tipo 3 (Normal): Estructura el balance estándar.
     *
     * GET: bodega_inventario/obtenerUnidadesProducto
     */
    public function obtenerUnidadesProducto(): array
    {
        try {
            // 1. Captura, sanitización y tipado de parámetros de URL
            $idProducto = (int)($_GET['id_producto'] ?? 0);
            $idBodega   = (int)($_GET['id_bodega'] ?? 0);

            if ($idProducto < 1 || $idBodega < 1) {
                return $this->res->fail('Los parámetros id_producto e id_bodega son requeridos y deben ser enteros positivos');
            }

            // Consulta A: Identificar el tipo de control de inventario que rige al producto
            $sqlTipo = "SELECT id_tipo FROM bodega_inventario.productos WHERE id = ? LIMIT 1";
            $stmtTipo = $this->connect->prepare($sqlTipo);
            $stmtTipo->execute([$idProducto]);

            $idTipo = (int)$stmtTipo->fetchColumn();

            // =========================================================================
            // ESCENARIO A: CONTROL POR CORRELATIVOS / SERIES (TIPO 1)
            // =========================================================================
            if ($idTipo === 1) {
                // Consulta B1: Extraer lotes correlativos con existencias remanentes
                $sqlLotesCorrelativo = "SELECT 
                    id, 
                    serie, 
                    correlativo_inicial, 
                    correlativo_final, 
                    cantidad_disponible, 
                    (correlativo_final - correlativo_inicial + 1 - cantidad_disponible) AS ya_asignados 
                FROM bodega_inventario.lotes_correlativo 
                WHERE id_bodega = ? 
                  AND id_producto = ? 
                  AND cantidad_disponible > 0 
                ORDER BY correlativo_inicial ASC";

                $stmtLotes = $this->connect->prepare($sqlLotesCorrelativo);
                $stmtLotes->execute([$idBodega, $idProducto]);
                $lotes = $stmtLotes->fetchAll(PDO::FETCH_OBJ);

                // Consulta B2: Extraer balance consolidado disponible en el Stock Core
                $sqlStockCorrelativo = "SELECT COALESCE(cantidad_disponible, 0.00) 
                FROM bodega_inventario.stock 
                WHERE id_bodega = ? 
                  AND id_producto = ? 
                LIMIT 1";

                $stmtStock = $this->connect->prepare($sqlStockCorrelativo);
                $stmtStock->execute([$idBodega, $idProducto]);
                $cantidadDisponible = (float)$stmtStock->fetchColumn();

                if (empty($lotes) || $cantidadDisponible <= 0) {
                    return $this->res->info('No se encontraron series o correlativos disponibles para este producto en la bodega seleccionada');
                }

                // Consulta B3: Hidratar la unidad de medida por defecto asignada al documento
                $sqlUnidadCorrelativo = "SELECT 
                    um.id AS id_unidad, 
                    um.nombre, 
                    um.abreviatura, 
                    1 AS es_default, 
                    ? AS cantidad_disponible 
                FROM bodega_inventario.productos_unidades pu 
                INNER JOIN bodega_inventario.unidades_medida um ON um.id = pu.id_unidad 
                WHERE pu.id_producto = ? 
                  AND pu.es_default = 1 
                LIMIT 1";

                $stmtUnd = $this->connect->prepare($sqlUnidadCorrelativo);
                $stmtUnd->execute([$cantidadDisponible, $idProducto]);
                $unidad = $stmtUnd->fetch(PDO::FETCH_OBJ);

                // Ajuste y casteo estricto de identificadores sobre la instancia del objeto
                if ($unidad) {
                    $unidad->id_unidad          = (int)$unidad->id_unidad;
                    $unidad->es_default         = (bool)$unidad->es_default;
                    $unidad->cantidad_disponible = (float)$unidad->cantidad_disponible;
                }

                // Casteo estricto del listado de lotes correlativos
                foreach ($lotes as $l) {
                    $l->id                  = (int)$l->id;
                    $l->correlativo_inicial = (int)$l->correlativo_inicial;
                    $l->correlativo_final   = (int)$l->correlativo_final;
                    $l->cantidad_disponible = (float)$l->cantidad_disponible;
                    $l->ya_asignados        = (float)$l->ya_asignados;
                }

                return $this->res->ok('Estructura y lotes de control correlativo obtenidos correctamente', [
                    'tipo'                => 1,
                    'unidades'            => $unidad ? [$unidad] : [],
                    'lotes_correlativo'   => $lotes,
                    'cantidad_disponible' => $cantidadDisponible
                ]);
            }

            // =========================================================================
            // ESCENARIO B: CONTROL EXPIRACIÓN Y FLUJO ESTÁNDAR (TIPOS 2 Y 3)
            // =========================================================================

            // Consulta C1: Extraer el catálogo multiescala de unidades asociadas al producto con sus stocks
            $sqlUnidadesDisponibles = "SELECT 
                um.id AS id_unidad, 
                um.nombre, 
                um.abreviatura, 
                um.es_talla, 
                pu.es_default, 
                COALESCE(s.cantidad_total, 0.00) AS cantidad_total, 
                COALESCE(s.cantidad_reservada, 0.00) AS cantidad_reservada, 
                COALESCE(s.cantidad_disponible, 0.00) AS cantidad_disponible 
            FROM bodega_inventario.productos_unidades pu 
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = pu.id_unidad 
            LEFT JOIN bodega_inventario.stock s ON s.id_producto = pu.id_producto 
                                               AND s.id_unidad = pu.id_unidad 
                                               AND s.id_bodega = ? 
            WHERE pu.id_producto = ? 
              AND pu.activo = 1 
            ORDER BY pu.es_default DESC, um.id ASC";

            $stmt = $this->connect->prepare($sqlUnidadesDisponibles);
            $stmt->execute([$idBodega, $idProducto]);
            $unidades = $stmt->fetchAll(PDO::FETCH_OBJ);

            if (empty($unidades)) {
                return $this->res->info('El producto seleccionado no posee unidades de medida activas parametrizadas en el sistema');
            }

            // Homogeneizar y tipar propiedades básicas del catálogo mapeado por objetos
            foreach ($unidades as $u) {
                $u->id_unidad           = (int)$u->id_unidad;
                $u->es_default          = (bool)$u->es_default;
                $u->cantidad_total      = (float)$u->cantidad_total;
                $u->cantidad_reservada  = (float)$u->cantidad_reservada;
                $u->cantidad_disponible = (float)$u->cantidad_disponible;
                $u->fecha_expiracion_proxima = null;
            }

            // Inyección complementaria de plazos de caducidad si el producto es de Tipo Expiración (Tipo 2)
            if ($idTipo === 2) {
                // Consulta C2: Obtener la fecha de vencimiento mínima agrupada por escala de unidad
                $sqlExpiracionProxima = "SELECT id_unidad, MIN(fecha_expiracion) AS fecha_mas_proxima 
                FROM bodega_inventario.lotes_expiracion 
                WHERE id_bodega = ? 
                  AND id_producto = ? 
                  AND cantidad_disponible > 0 
                GROUP BY id_unidad";

                $stmtExp = $this->connect->prepare($sqlExpiracionProxima);
                $stmtExp->execute([$idBodega, $idProducto]);
                $expiriesRaw = $stmtExp->fetchAll(PDO::FETCH_OBJ);

                $expiries = [];

                // Indexación limpia de fechas mapeadas por el ID de la unidad
                foreach ($expiriesRaw as $row) {
                    $expiries[(int)$row->id_unidad] = $row->fecha_mas_proxima;
                }

                // Vincular la fecha correspondiente de forma directa sobre la propiedad del objeto
                foreach ($unidades as $u) {
                    $u->fecha_expiracion_proxima = $expiries[$u->id_unidad] ?? null;
                }
            }

            return $this->res->ok('Catálogo de unidades físicas e inventario disponible recuperado correctamente', [
                'tipo'     => $idTipo,
                'unidades' => $unidades
            ]);

        } catch (Exception $e) {
            error_log("Error masivo en obtenerUnidadesProducto: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar el desglose de existencias del producto', $e);
        }
    }

    /**
     * Crea una orden de solicitud de inventario para el usuario en sesión y ejecuta la reserva física del stock.
     * Valida bodegas de agencia propia, restricciones por matriz de seguridad en áreas,
     * escalas de unidades y disponibilidad real aplicando bloqueos de concurrencia (FOR UPDATE).
     *
     * POST: bodega_inventario/crearSolicitud
     *
     * @param object $datos {
     * id_bodega: int,
     * id_producto: int,
     * id_unidad: int,
     * cantidad: float|int,
     * observaciones: ?string
     * }
     */
    public function crearSolicitud($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();

            // 1. Validaciones estructurales y control de sesión activa
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $datos       = $this->limpiarDatos($datos);
            $idBodega    = (int)($datos->id_bodega ?? 0);
            $idProducto  = (int)($datos->id_producto ?? 0);
            $idUnidad    = (int)($datos->id_unidad ?? 0);
            $cantidadRaw = $datos->cantidad ?? 0;
            $obs         = !empty($datos->observaciones) ? trim($datos->observaciones) : null;

            if ($idBodega < 1 || $idProducto < 1 || $idUnidad < 1 || $cantidadRaw <= 0) {
                return $this->res->fail('Campos requeridos: Los parámetros id_bodega, id_producto, id_unidad y cantidad (mayor a cero) son mandatorios');
            }

            $cantidad = (float)$cantidadRaw;

            // Regla estricta: Garantizar que las solicitudes operen con magnitudes enteras (unidades físicas discretas)
            if ($cantidad < 1.00 || abs($cantidad - round($cantidad)) > 0.001) {
                return $this->res->fail('Error de consistencia: La cantidad solicitada debe corresponder a un número entero positivo (Mínimo 1)');
            }

            $cantidadFinal = (int)round($cantidad);

            // Consulta A: Verificar existencia, vigencia y taxonomía de la bodega destino
            $sqlBodega = "SELECT id, id_tipo, id_agencia, restriccion_acceso_activa 
            FROM bodega_inventario.bodegas 
            WHERE id = ? 
              AND activo = 1 
            LIMIT 1";

            $stmtBodega = $this->connect->prepare($sqlBodega);
            $stmtBodega->execute([$idBodega]);
            $bodega = $stmtBodega->fetch(PDO::FETCH_OBJ);

            if (!$bodega) {
                return $this->res->fail('La bodega de almacenamiento seleccionada no existe en el catálogo o se encuentra inactiva');
            }

            // Restricción I: Si es bodega de agencia (Tipo 1), debe pertenecer de forma estricta a la sucursal asignada del usuario
            if ((int)$bodega->id_tipo === 1 && (int)$bodega->id_agencia !== (int)$this->idAgencia) {
                return $this->res->fail('Restricción de seguridad: No posee privilegios para levantar solicitudes en bodegas de otra agencia corporativa');
            }

            // Restricción II: Si es bodega de área (Tipo 2) con bloqueo de matriz, validar accesos por sesión
            if ((int)$bodega->id_tipo === 2 && (bool)$bodega->restriccion_acceso_activa) {
                if (!$this->bodegaHelper->tieneAccesoMatrizSesion($idBodega)) {
                    return $this->res->fail('Acceso denegado: Sus credenciales o puesto no figuran con accesos vigentes en la matriz de esta bodega de área');
                }
            }

            // Consulta B: Validar relación de empaque o unidad de medida vinculada de forma activa al producto
            $sqlUnidad = "SELECT COUNT(*) AS unidad_valida 
            FROM bodega_inventario.productos_unidades 
            WHERE id_producto = ? 
              AND id_unidad = ? 
              AND activo = 1";

            $stmtUnidad = $this->connect->prepare($sqlUnidad);
            $stmtUnidad->execute([$idProducto, $idUnidad]);
            $resUnidad = $stmtUnidad->fetch(PDO::FETCH_OBJ);

            if ((int)($resUnidad->unidad_valida ?? 0) === 0) {
                return $this->res->fail('La unidad de medida seleccionada no se encuentra parametrizada o activa para este ítem');
            }

            // =========================================================================
            // 2. EJECUCIÓN Y PERSISTENCIA ATÓMICA DE LA RESERVA (TRANSACCIONAL)
            // =========================================================================
            $this->connect->beginTransaction();

            // Operación I: Recuperar los registros de la tabla stock aplicando pesimismo concurrente (FOR UPDATE)
            $stockRaw = $this->stockHelper->obtenerConBloqueo($idBodega, $idProducto, $idUnidad);

            if (!$stockRaw) {
                if ($this->connect->inTransaction()) {
                    $this->connect->rollBack();
                }
                return $this->res->fail('No se localizaron registros de existencias inicializadas para este producto y escala en la bodega destino');
            }

            // Mapeo a objeto stdClass para control homogéneo orientado a objetos
            $stock = (object)$stockRaw;
            $disponible = (float)$stock->cantidad_disponible;

            // Evaluación de suficiencia de inventario físico neto
            if ((float)$cantidadFinal > $disponible) {
                if ($this->connect->inTransaction()) {
                    $this->connect->rollBack();
                }
                return $this->res->fail("Operación rechazada: Stock insuficiente para procesar la reserva. Disponible actual: {$disponible}", null, [
                    'disponible' => $disponible,
                    'solicitado' => $cantidadFinal
                ]);
            }

            // Operación II: Asentar el encabezado del documento de solicitud (Estado Inicial = 1)
            $sqlInsertSolicitud = "INSERT INTO bodega_inventario.solicitudes 
                (id_usuario, id_bodega, id_estado, observaciones, created_at) 
            VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)";

            $this->connect->prepare($sqlInsertSolicitud)->execute([
                $this->idUsuario,
                $idBodega,
                $obs
            ]);

            $idSolicitud = (int)$this->connect->lastInsertId();

            // Operación III: Insertar el renglón del detalle de la solicitud
            $sqlInsertDetalle = "INSERT INTO bodega_inventario.solicitudes_detalle 
                (id_solicitud, id_producto, id_unidad, cantidad_solicitada) 
            VALUES (?, ?, ?, ?)";

            $this->connect->prepare($sqlInsertDetalle)->execute([
                $idSolicitud,
                $idProducto,
                $idUnidad,
                $cantidadFinal
            ]);

            $idDetalle = (int)$this->connect->lastInsertId();

            // Operación IV: Afectar los balances físicos (Incrementar reserva / Descontar disponible en Stock Core)
            $this->stockHelper->incrementarReserva($idBodega, $idProducto, $idUnidad, $cantidadFinal);

            // Operación V: Registrar la trazabilidad del movimiento de afectación en Kardex
            $this->movimientoHelper->registrarReserva($idBodega, $idProducto, $idUnidad, $cantidadFinal, $idDetalle);

            $this->connect->commit();

            return $this->res->ok('La solicitud ha sido procesada con éxito y las existencias físicas quedan bajo reserva', null, [
                'id_solicitud' => $idSolicitud
            ]);

        } catch (Exception $e) {
            // Garantizar rollback inmediato e integridad de saldos ante fallos concurrentes o excepciones
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }

            error_log("Error masivo en crearSolicitud: " . $e->getMessage());
            return $this->res->fail('Error crítico en el servidor al intentar registrar la orden de solicitud', $e);
        }
    }

    /**
     * Cancela una orden de solicitud activa (Estado Reservada = 1) emitida por el propio usuario en sesión.
     * Ejecuta de forma atómica la liberación de saldos reservados de cada renglón en el Stock Core,
     * asienta los contra-movimientos en el Kardex y actualiza el documento a Cancelada (4).
     * Aplica bloqueo pesimista transaccional (FOR UPDATE) para evitar colisiones de concurrencia.
     *
     * POST: bodega_inventario/cancelarSolicitud
     *
     * @param object $datos {
     * id_solicitud: int
     * }
     */
    public function cancelarSolicitud($datos): array
    {
        try {
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();

            $datos       = $this->limpiarDatos($datos);
            $idSolicitud = (int)($datos->id_solicitud ?? 0);

            // 1. Validaciones estructurales y de consistencia básica
            if ($idSolicitud < 1) {
                return $this->res->fail('El campo id_solicitud es requerido y debe ser un entero positivo');
            }

            // 2. EJECUCIÓN Y PERSISTENCIA ATÓMICA DE LA LIBERACIÓN (TRANSACCIONAL)
            $this->connect->beginTransaction();

            // Consulta A: Bloquear pesimistamente el encabezado de la solicitud para el usuario actual
            $sqlSolicitud = "SELECT id, id_estado, id_bodega 
            FROM bodega_inventario.solicitudes 
            WHERE id = ? 
              AND id_usuario = ? 
            FOR UPDATE";

            $stmtVerif = $this->connect->prepare($sqlSolicitud);
            $stmtVerif->execute([$idSolicitud, $this->idUsuario]);

            // Mapeo estricto utilizando objetos estándar stdClass
            $solicitud = $stmtVerif->fetch(PDO::FETCH_OBJ);

            if (!$solicitud) {
                if ($this->connect->inTransaction()) {
                    $this->connect->rollBack();
                }
                return $this->res->fail('La solicitud especificada no fue localizada o no corresponde a su usuario en sesión');
            }

            if ((int)$solicitud->id_estado !== 1) {
                if ($this->connect->inTransaction()) {
                    $this->connect->rollBack();
                }
                return $this->res->fail('Operación rechazada: Solo se permite la cancelación de solicitudes que permanezcan en estado Reservada');
            }

            // Consulta B: Extraer los renglones del detalle vinculados a la orden
            $sqlDetalle = "SELECT id, id_producto, id_unidad, cantidad_solicitada 
            FROM bodega_inventario.solicitudes_detalle 
            WHERE id_solicitud = ?";

            $stmtDet = $this->connect->prepare($sqlDetalle);
            $stmtDet->execute([$idSolicitud]);

            // Recuperar la colección de filas mapeadas a objetos limpios
            $renglones = $stmtDet->fetchAll(PDO::FETCH_OBJ);

            // 3. Procesamiento interactivo de reversión física sobre el stock
            foreach ($renglones as $renglon) {
                $idBodega   = (int)$solicitud->id_bodega;
                $idProducto = (int)$renglon->id_producto;
                $idUnidad   = (int)$renglon->id_unidad;
                $cantidad   = (float)$renglon->cantidad_solicitada;
                $idRenglon  = (int)$renglon->id;

                // Operación I: Disminuir reserva / Restituir disponible en Stock Core (Helper Core)
                $this->stockHelper->liberarReserva($idBodega, $idProducto, $idUnidad, $cantidad);

                // Operación II: Asentar la trazabilidad de la liberación en el Kardex (Helper Core)
                $this->movimientoHelper->registrarLiberacion($idBodega, $idProducto, $idUnidad, $cantidad, $idRenglon);
            }

            // Consulta C: Actualizar el estado del encabezado del documento a Cancelada (4)
            $sqlUpdateSolicitud = "UPDATE bodega_inventario.solicitudes 
            SET id_estado = 4, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?";

            $this->connect->prepare($sqlUpdateSolicitud)->execute([$idSolicitud]);

            $this->connect->commit();

            return $this->res->ok('La solicitud ha sido cancelada con éxito y las existencias físicas asociadas fueron liberadas');

        } catch (Exception $e) {
            // Garantizar el rollback inmediato e integridad total de saldos ante excepciones
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }

            error_log("Error masivo en cancelarSolicitud: " . $e->getMessage());
            return $this->res->fail('Error crítico en el servidor al procesar la cancelación de la solicitud', $e);
        }
    }
    /**
     * Obtiene la información técnica de la bodega asignada al usuario en sesión en calidad de encargado.
     *
     * GET: bodega_inventario/obtenerBodegaEncargado
     */
    public function obtenerBodegaEncargado(): array
    {
        try {
            $this->_inicializarBodegaHelper();

            // Resolver el identificador de la bodega mediante el helper de negocio
            $idBodega = (int)$this->bodegaHelper->obtenerBodegaEncargado();

            if (!$idBodega || $idBodega < 1) {
                return $this->res->info('No tienes una bodega asignada como encargado en tu perfil de usuario');
            }

            // Aislamiento de la sentencia SQL de extracción con su join semántico
            $sqlBodega = "SELECT 
                b.id, 
                b.nombre, 
                b.id_tipo, 
                tb.nombre AS tipo_bodega, 
                b.restriccion_acceso_activa, 
                b.activo
            FROM bodega_inventario.bodegas b
            INNER JOIN bodega_inventario.tipos_bodega tb ON tb.id = b.id_tipo
            WHERE b.id = ? 
            LIMIT 1";

            $stmt = $this->connect->prepare($sqlBodega);
            $stmt->execute([$idBodega]);

            // Mapeo estricto utilizando objetos estándar stdClass
            $bodega = $stmt->fetch(PDO::FETCH_OBJ);

            if (!$bodega) {
                return $this->res->fail('Error de integridad: La bodega asignada a tu usuario no existe o se encuentra dada de baja');
            }

            // Forzar el casteo estricto de tipos de forma orientada a objetos
            $bodega->id                       = (int)$bodega->id;
            $bodega->id_tipo                  = (int)$bodega->id_tipo;
            $bodega->activo                   = (int)$bodega->activo;
            $bodega->restriccion_acceso_activa = (bool)$bodega->restriccion_acceso_activa;

            return $this->res->ok('Información de la bodega del encargado recuperada correctamente', [
                'bodega' => $bodega
            ]);

        } catch (Exception $e) {
            error_log("Error en obtenerBodegaEncargado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar recuperar la bodega del encargado', $e);
        }
    }

    /**
     * Recupera el catálogo de solicitudes correspondientes a la bodega administrada por el encargado.
     * Determina dinámicamente la bodega evaluando el contexto operativo parametrizado (area o agencia).
     * Aplica filtros avanzados por estado, rango de fechas y datos de filiación del solicitante.
     *
     * POST: bodega_inventario/listarSolicitudesEncargado
     *
     * @param object $datos {
     * contexto: string (area|agencia),
     * estado: ?int,
     * busqueda: ?string,
     * fecha_desde: ?string (YYYY-MM-DD),
     * fecha_hasta: ?string (YYYY-MM-DD),
     * pagina: ?int,
     * por_pagina: ?int
     * }
     */
    public function listarSolicitudesEncargado($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $datos    = $this->limpiarDatos($datos);
            $contexto = trim($datos->contexto ?? '');

            // 1. Validaciones de contexto y resolución de la bodega destino
            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido y debe ser estrictamente "area" o "agencia"');
            }

            $idBodega = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodega || $idBodega < 1) {
                $msgError = $contexto === 'agencia'
                    ? 'El usuario en sesión no posee una bodega de agencia activa asignada'
                    : 'El usuario en sesión no posee una bodega de área activa asignada';
                return $this->res->fail($msgError);
            }

            // Captura, tipado y sanitización de filtros dinámicos
            $estado     = isset($datos->estado) && $datos->estado !== null && $datos->estado !== '' ? (int)$datos->estado : null;
            $busqueda   = trim($datos->busqueda ?? '');
            $fechaDesde = trim($datos->fecha_desde ?? '');
            $fechaHasta = trim($datos->fecha_hasta ?? '');

            $pagina    = max(1, (int)($datos->pagina ?? 1));
            $porPagina = min(50, max(1, (int)($datos->por_pagina ?? 20)));
            $offset    = ($pagina - 1) * $porPagina;

            $params     = [$idBodega];
            $whereExtra = '';

            // 2. Construcción parametrizada de condiciones adicionales (SQL safe)
            if ($estado !== null) {
                $whereExtra .= " AND s.id_estado = ?";
                $params[]    = $estado;
            }

            if ($busqueda !== '') {
                $whereExtra .= " AND (s.id_usuario LIKE ? OR dp.nombres LIKE ?)";
                $params[]    = "%{$busqueda}%";
                $params[]    = "%{$busqueda}%";
            }

            if ($fechaDesde !== '') {
                $whereExtra .= " AND DATE(s.created_at) >= ?";
                $params[]    = $fechaDesde;
            }

            if ($fechaHasta !== '') {
                $whereExtra .= " AND DATE(s.created_at) <= ?";
                $params[]    = $fechaHasta;
            }

            // Aislamiento del cuerpo de joins común para la extracción de solicitudes
            $sqlBase = "FROM bodega_inventario.solicitudes s
            INNER JOIN bodega_inventario.estados_solicitud es ON es.id = s.id_estado
            LEFT JOIN dbintranet.usuarios u ON u.idUsuarios = s.id_usuario
            LEFT JOIN dbintranet.datospersonales dp ON dp.idDatosPersonales = u.idDatosPersonales
            WHERE s.id_bodega = ? {$whereExtra}";

            // Consulta A: Conteo consolidado de registros bajo los filtros activos
            $sqlCount = "SELECT COUNT(*) AS total_registros {$sqlBase}";
            $stmtCount = $this->connect->prepare($sqlCount);
            $stmtCount->execute($params);
            $resCount = $stmtCount->fetch(PDO::FETCH_OBJ);
            $total = (int)($resCount->total_registros ?? 0);

            // Consulta B: Indicador crítico de control de stock (Contar órdenes Reservadas [Estado = 1] sin filtros adicionales)
            $sqlReservadas = "SELECT COUNT(*) AS total_reservas 
            FROM bodega_inventario.solicitudes s 
            WHERE s.id_bodega = ? 
              AND s.id_estado = 1";

            $stmtReservadas = $this->connect->prepare($sqlReservadas);
            $stmtReservadas->execute([$idBodega]);
            $resReservadas = $stmtReservadas->fetch(PDO::FETCH_OBJ);
            $totalReservadas = (int)($resReservadas->total_reservas ?? 0);

            if ($total === 0) {
                return $this->res->ok('No se localizaron solicitudes vigentes bajo los criterios especificados', [
                    'solicitudes'      => [],
                    'total'            => 0,
                    'total_reservadas' => $totalReservadas,
                    'pagina'           => $pagina,
                    'por_pagina'       => $porPagina,
                    'paginas'          => 0,
                ]);
            }

            // Consulta C: Extracción estructurada de datos ordenando jerárquicamente por estado (LIFO/FIFO implícito) y plazos
            $sqlData = "SELECT 
                s.id, 
                COALESCE(dp.nombres, s.id_usuario) AS nombre_solicitante,
                s.id_bodega, 
                s.id_estado, 
                es.nombre AS estado, 
                s.observaciones, 
                s.created_at, 
                s.updated_at,
                (SELECT p.nombre 
                 FROM bodega_inventario.solicitudes_detalle sd2 
                 INNER JOIN bodega_inventario.productos p ON p.id = sd2.id_producto 
                 WHERE sd2.id_solicitud = s.id 
                 LIMIT 1
                ) AS primer_producto,
                (SELECT COUNT(*) 
                 FROM bodega_inventario.solicitudes_detalle sd3 
                 WHERE sd3.id_solicitud = s.id
                ) AS total_renglones,
                (SELECT COUNT(*) 
                 FROM bodega_inventario.solicitudes_detalle sd4 
                 WHERE sd4.id_solicitud = s.id 
                   AND sd4.id_usuario_gestion IS NOT NULL
                ) AS renglones_gestionados,
                (SELECT COUNT(*)
                FROM bodega_inventario.reversas rv
                INNER JOIN bodega_inventario.solicitudes_detalle sdr ON sdr.id = rv.id_solicitud_detalle
                WHERE sdr.id_solicitud = s.id
                ) AS total_reversas
            {$sqlBase} 
            ORDER BY s.id_estado ASC, s.created_at DESC 
            LIMIT {$porPagina} OFFSET {$offset}";

            $stmtData = $this->connect->prepare($sqlData);
            $stmtData->execute($params);

            // Mapeo estricto utilizando colecciones de objetos stdClass
            $solicitudes = $stmtData->fetchAll(PDO::FETCH_OBJ);

            // 3. Recorrido para tipado fuerte sobre las propiedades calculadas del objeto
            foreach ($solicitudes as $s) {
                $s->id                    = (int)$s->id;
                $s->id_bodega             = (int)$s->id_bodega;
                $s->id_estado             = (int)$s->id_estado;
                $s->total_renglones       = (int)$s->total_renglones;
                $s->renglones_gestionados = (int)$s->renglones_gestionados;
                $s->total_reversas = (int)$s->total_reversas;
            }

            return $this->res->ok('Listado operativo de solicitudes recuperado correctamente para el encargado', [
                'solicitudes'      => $solicitudes,
                'total'            => $total,
                'total_reservadas' => $totalReservadas,
                'pagina'           => $pagina,
                'por_pagina'       => $porPagina,
                'paginas'          => (int)ceil($total / $porPagina),
            ]);

        } catch (Exception $e) {
            error_log("Error masivo en listarSolicitudesEncargado: " . $e->getMessage());
            return $this->res->fail('Error crítico interno en el servidor al recuperar el panel de solicitudes de la bodega', $e);
        }
    }

    /**
     * Recupera el desglose estructural completo de una solicitud (Encabezado, renglones y asignación de lotes).
     * Restringe de forma estricta el acceso para que solo el propietario o el encargado de la bodega lo consulten.
     *
     * GET: bodega_inventario/obtenerDetalleSolicitud
     */
    public function obtenerDetalleSolicitud(): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $id = (int)($_GET['id'] ?? 0);

            if ($id < 1) {
                return $this->res->fail('El parámetro id es requerido y debe ser un entero positivo');
            }

            // Consulta A: Extraer la cabecera e información de control de accesos de la solicitud
            $sqlCabecera = "SELECT 
                s.id, 
                s.id_usuario AS solicitante, 
                COALESCE(dp.nombres, s.id_usuario) AS nombre_solicitante,
                s.id_bodega, 
                b.nombre AS bodega, 
                tb.nombre AS tipo_bodega,
                s.id_estado, 
                es.nombre AS estado, 
                s.observaciones, 
                s.created_at, 
                s.updated_at
            FROM bodega_inventario.solicitudes s
            INNER JOIN bodega_inventario.bodegas b ON b.id = s.id_bodega
            INNER JOIN bodega_inventario.tipos_bodega tb ON tb.id = b.id_tipo
            INNER JOIN bodega_inventario.estados_solicitud es ON es.id = s.id_estado
            LEFT JOIN dbintranet.usuarios u ON u.idUsuarios = s.id_usuario
            LEFT JOIN dbintranet.datospersonales dp ON dp.idDatosPersonales = u.idDatosPersonales
            WHERE s.id = ? 
            LIMIT 1";

            $stmtCab = $this->connect->prepare($sqlCabecera);
            $stmtCab->execute([$id]);

            // Mapeo estricto utilizando objetos estándar stdClass
            $cabecera = $stmtCab->fetch(PDO::FETCH_OBJ);

            if (!$cabecera) {
                return $this->res->fail('La solicitud especificada no existe en el sistema');
            }

            // Capa de Seguridad y Privilegios: Propietario o Encargado de la Bodega origen
            $esPropietario = $cabecera->solicitante === $this->idUsuario;
            $esEncargado   = (int)$this->bodegaHelper->obtenerBodegaEncargado() === (int)$cabecera->id_bodega;

            if (!$esPropietario && !$esEncargado) {
                return $this->res->fail('Acceso denegado: No cuenta con permisos para auditar esta solicitud');
            }

            // Consulta B: Recuperar los renglones del detalle operativo vinculados
            $sqlRenglones = "SELECT 
                sd.id, 
                sd.id_producto, 
                p.nombre AS producto, 
                tp.nombre AS tipo_producto, 
                tp.id AS id_tipo_producto,
                sd.id_unidad, 
                um.nombre AS unidad, 
                um.abreviatura AS abreviatura_unidad,
                sd.cantidad_solicitada, 
                sd.cantidad_entregada,
                sd.correlativo_inicial_asignado, 
                sd.correlativo_final_asignado,
                sd.correlativo_inicial_asignado_2, 
                sd.correlativo_final_asignado_2,
                sd.id_usuario_gestion, 
                COALESCE(dpg.nombres, sd.id_usuario_gestion) AS gestor,
                sd.fecha_gestion, 
                sd.motivo_rechazo
            FROM bodega_inventario.solicitudes_detalle sd
            INNER JOIN bodega_inventario.productos p ON p.id = sd.id_producto
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = sd.id_unidad
            LEFT JOIN dbintranet.usuarios ug ON ug.idUsuarios = sd.id_usuario_gestion
            LEFT JOIN dbintranet.datospersonales dpg ON dpg.idDatosPersonales = ug.idDatosPersonales
            WHERE sd.id_solicitud = ? 
            ORDER BY sd.id ASC";

            $stmtDet = $this->connect->prepare($sqlRenglones);
            $stmtDet->execute([$id]);
            $renglones = $stmtDet->fetchAll(PDO::FETCH_OBJ);

            // Consulta C: Extraer la trazabilidad de los lotes/series afectados físicamente en el despacho
            $sqlLotesUsados = "SELECT 
                sdl.id_solicitud_det, 
                sdl.cantidad, 
                sdl.id_lote_exp, 
                sdl.id_lote_normal, 
                sdl.id_lote_corr,
                le.fecha_expiracion AS fecha_expiracion_lote, 
                le.cantidad_disponible AS restante_lote_exp,
                ln.fecha_ingreso AS fecha_ingreso_lote, 
                lc.correlativo_inicial AS corr_ini_lote, 
                lc.correlativo_final AS corr_fin_lote
            FROM bodega_inventario.solicitudes_detalle_lotes sdl
            LEFT JOIN bodega_inventario.lotes_expiracion le ON le.id = sdl.id_lote_exp
            LEFT JOIN bodega_inventario.lotes_normal ln ON ln.id = sdl.id_lote_normal
            LEFT JOIN bodega_inventario.lotes_correlativo lc ON lc.id = sdl.id_lote_corr
            WHERE sdl.id_solicitud_det IN (
                SELECT id 
                FROM bodega_inventario.solicitudes_detalle 
                WHERE id_solicitud = ?
            )
            ORDER BY sdl.id_solicitud_det, sdl.id ASC";

            $stmtLotes = $this->connect->prepare($sqlLotesUsados);
            $stmtLotes->execute([$id]);
            $lotesUsados = $stmtLotes->fetchAll(PDO::FETCH_OBJ);

            // Formateo final y tipado fuerte orientado a objetos
            $cabecera->id          = (int)$cabecera->id;
            $cabecera->id_bodega   = (int)$cabecera->id_bodega;
            $cabecera->id_estado   = (int)$cabecera->id_estado;
            $cabecera->solicitante = $cabecera->nombre_solicitante;
            unset($cabecera->nombre_solicitante);

            foreach ($renglones as $r) {
                $r->id                  = (int)$r->id;
                $r->id_producto         = (int)$r->id_producto;
                $r->id_tipo_producto    = (int)$r->id_tipo_producto;
                $r->id_unidad           = (int)$r->id_unidad;
                $r->cantidad_solicitada = (float)$r->cantidad_solicitada;
                $r->cantidad_entregada  = $r->cantidad_entregada !== null ? (float)$r->cantidad_entregada : null;

                $r->correlativo_inicial_asignado   = $r->correlativo_inicial_asignado !== null ? (int)$r->correlativo_inicial_asignado : null;
                $r->correlativo_final_asignado     = $r->correlativo_final_asignado !== null ? (int)$r->correlativo_final_asignado : null;
                $r->correlativo_inicial_asignado_2 = $r->correlativo_inicial_asignado_2 !== null ? (int)$r->correlativo_inicial_asignado_2 : null;
                $r->correlativo_final_asignado_2   = $r->correlativo_final_asignado_2 !== null ? (int)$r->correlativo_final_asignado_2 : null;
            }

            foreach ($lotesUsados as $l) {
                $l->id_solicitud_det  = (int)$l->id_solicitud_det;
                $l->cantidad          = (float)$l->cantidad;
                $l->id_lote_exp       = $l->id_lote_exp !== null ? (int)$l->id_lote_exp : null;
                $l->id_lote_normal    = $l->id_lote_normal !== null ? (int)$l->id_lote_normal : null;
                $l->id_lote_corr      = $l->id_lote_corr !== null ? (int)$l->id_lote_corr : null;
                $l->restante_lote_exp = $l->restante_lote_exp !== null ? (float)$l->restante_lote_exp : null;
                $l->corr_ini_lote     = $l->corr_ini_lote !== null ? (int)$l->corr_ini_lote : null;
                $l->corr_fin_lote     = $l->corr_fin_lote !== null ? (int)$l->corr_fin_lote : null;
            }

            return $this->res->ok('Estructura técnica de la solicitud recuperada correctamente', [
                'cabecera'     => $cabecera,
                'renglones'    => $renglones,
                'lotes_usados' => $lotesUsados
            ]);

        } catch (Exception $e) {
            error_log("Error masivo en obtenerDetalleSolicitud: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar la auditoría de la solicitud', $e);
        }
    }

    /**
     * Procesa el despacho físico y la entrega de una solicitud en estado Reservada (1).
     * Consume de forma atómica los inventarios aplicando lógicas por tipo de producto:
     * - Tipo 1 (Correlativos): Consume series a través de LotesHelper.
     * - Tipo 2 (PEPS / Próximo a Expirar Primero en Salir): Para productos perecederos.
     * - Tipo 3 (FIFO): Para productos de rotación estándar.
     * Valida restricciones de cierre mensual activo y aplica exclusión mutua por concurrencia (FOR UPDATE).
     *
     * POST: bodega_inventario/entregarSolicitud
     *
     * @param object $datos {
     * id_solicitud: int,
     * contexto: ?string (area|agencia)
     * }
     */
    public function entregarSolicitud($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarLotesHelper();
            $this->_inicializarCierreHelper();

            $datos       = $this->limpiarDatos($datos);
            $idSolicitud = (int)($datos->id_solicitud ?? 0);
            $contexto    = trim($datos->contexto ?? 'area');

            // 1. Validaciones estructurales y de contexto operativo
            if ($idSolicitud < 1) {
                return $this->res->fail('El campo id_solicitud es requerido y debe ser un entero positivo');
            }

            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto parametrizado no es válido (Debe ser "area" o "agencia")');
            }

            $idBodegaEncargado = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodegaEncargado || $idBodegaEncargado < 1) {
                $msgError = $contexto === 'agencia'
                    ? 'El usuario en sesión no posee una bodega de agencia asignada bajo su cargo'
                    : 'El usuario en sesión no posee una bodega de área asignada bajo su cargo';
                return $this->res->fail($msgError);
            }

            // Control de Cierre Contable / Mensual (Guard Clause Global)
            //$fechaCorte = $this->cierreHelper->obtenerUltimoCierre();

            //if ($fechaCorte) {
                //return $this->res->fail("Operación denegada: No se pueden procesar despachos debido a que existe un cierre mensual activo desde {$fechaCorte}");
            //}

            // =========================================================================
            // 2. PROCESAMIENTO ATÓMICO Y AFECTACIÓN DE SALDOS (TRANSACCIONAL)
            // =========================================================================
            $this->connect->beginTransaction();

            // Consulta A: Bloquear pesimistamente el encabezado de la solicitud para resguardar saldos
            $sqlSolicitud = "SELECT id, id_estado, id_bodega, id_usuario 
            FROM bodega_inventario.solicitudes 
            WHERE id = ? 
              AND id_bodega = ? 
            FOR UPDATE";

            $stmtSol = $this->connect->prepare($sqlSolicitud);
            $stmtSol->execute([$idSolicitud, $idBodegaEncargado]);
            $solicitud = $stmtSol->fetch(PDO::FETCH_OBJ);

            if (!$solicitud) {
                if ($this->connect->inTransaction()) {
                    $this->connect->rollBack();
                }
                return $this->res->fail('La solicitud especificada no existe o no corresponde a la bodega bajo su administración');
            }

            if ((int)$solicitud->id_estado !== 1) {
                if ($this->connect->inTransaction()) {
                    $this->connect->rollBack();
                }
                return $this->res->fail('Operación rechazada: Solo se pueden procesar entregas sobre solicitudes en estado Reservada');
            }

            // Consulta B: Extraer los renglones detallados de los ítems requeridos
            $sqlDetalle = "SELECT id, id_producto, id_unidad, cantidad_solicitada 
            FROM bodega_inventario.solicitudes_detalle 
            WHERE id_solicitud = ?";

            $stmtDet = $this->connect->prepare($sqlDetalle);
            $stmtDet->execute([$idSolicitud]);
            $renglones = $stmtDet->fetchAll(PDO::FETCH_OBJ);

            $idBodega   = (int)$solicitud->id_bodega;
            $idReceptor = $solicitud->id_usuario;

            // Sentencia SQL C: Preparación anticipada de actualización de estados por renglón
            $sqlUpdateRenglon = "UPDATE bodega_inventario.solicitudes_detalle 
            SET cantidad_entregada = ?, 
                id_usuario_gestion = ?, 
                fecha_gestion = CURRENT_TIMESTAMP 
            WHERE id = ?";

            $stmtUpdateRenglon = $this->connect->prepare($sqlUpdateRenglon);

            // 3. Iteración e impacto físico de inventarios por Renglón (Core Loop)
            foreach ($renglones as $renglon) {
                $idProducto = (int)$renglon->id_producto;
                $idUnidad   = (int)$renglon->id_unidad;
                $cantidad   = (float)$renglon->cantidad_solicitada;
                $idDetalle  = (int)$renglon->id;

                $idTipo = (int)$this->_obtenerTipoProducto($idProducto);

                // Escenario I: Gestión de Productos por Series y Correlativos (Tipo 1)
                if ($idTipo === 1) {
                    $resultado = $this->lotesHelper->asignarCorrelativo($idBodega, $idProducto, (int)$cantidad, $idDetalle, $idReceptor);

                    if (!isset($resultado['exito']) || !$resultado['exito']) {
                        if ($this->connect->inTransaction()) {
                            $this->connect->rollBack();
                        }
                        return $this->res->fail($resultado['mensaje'] ?? 'Error desconocido al asignar las series correlativas');
                    }

                    // Descontar del inventario core: remueve tanto del balance total como del saldo reservado
                    $this->stockHelper->descontarPorEntrega($idBodega, $idProducto, $idUnidad, $cantidad, $cantidad);
                    continue;
                }

                // Escenario II: Gestión de Capas LIFO/FIFO / PEPS (Tipos 2 y 3)
                $consumido = $idTipo === 2
                    ? (float)$this->lotesHelper->aplicarPEPS($idBodega, $idProducto, $idUnidad, $cantidad, $idDetalle, $idReceptor)
                    : (float)$this->lotesHelper->aplicarFIFO($idBodega, $idProducto, $idUnidad, $cantidad, $idDetalle, $idReceptor);

                // Descontar inventario core con la magnitud física netamente consumida de las capas de lotes
                $this->stockHelper->descontarPorEntrega($idBodega, $idProducto, $idUnidad, $consumido, $cantidad);

                // Asentar la resolución operativa directo sobre el renglón
                $stmtUpdateRenglon->execute([
                    $consumido,
                    $this->idUsuario,
                    $idDetalle
                ]);
            }

            // Consulta D: Actualizar el encabezado del documento global a Entregada (2)
            $sqlUpdateSolicitud = "UPDATE bodega_inventario.solicitudes 
            SET id_estado = 2, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?";

            $this->connect->prepare($sqlUpdateSolicitud)->execute([$idSolicitud]);

            $this->connect->commit();

            return $this->res->ok('La solicitud ha sido despachada y entregada correctamente; inventarios físicos actualizados');

        } catch (Exception $e) {
            // Asegurar la reversión inmediata de stocks ante cualquier error imprevisto
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }

            error_log("Error masivo en entregarSolicitud: " . $e->getMessage());
            return $this->res->fail('Error crítico interno en el servidor al intentar procesar el despacho de la solicitud', $e);
        }
    }
    // =========================================================================
    // CIERRES MENSUALES
    // =========================================================================

    /**
     * Lista los cierres registrados con filtros opcionales y paginación.
     *
     * Solo el cierre con fecha_corte más reciente define el límite de
     * reversas (ver CierreHelper).
     *
     * GET: bodega_inventario/listarCierres
     *
     * Query params:
     *   desde?:      YYYY-MM-DD — fecha_corte >= desde
     *   hasta?:      YYYY-MM-DD — fecha_corte <= hasta
     *   pagina?:     int (>=1) — por defecto 1
     *   por_pagina?: int       — por defecto 20 (máx. 100)
     */
    public function listarCierres(): array
    {
        try {
            $datos = (object)[
                'desde'      => filter_input(INPUT_GET, 'desde', FILTER_DEFAULT),
                'hasta'      => filter_input(INPUT_GET, 'hasta', FILTER_DEFAULT),
                'pagina'     => filter_input(INPUT_GET, 'pagina', FILTER_DEFAULT),
                'por_pagina' => filter_input(INPUT_GET, 'por_pagina', FILTER_DEFAULT),
            ];
            $datos = $this->limpiarDatos($datos);

            $condiciones = [];
            $params = [];

            // Rango por fecha de corte
            if (!empty($datos->desde) && $this->_esFechaValida(trim($datos->desde), 'Y-m-d')) {
                $condiciones[] = "c.fecha_corte >= ?";
                $params[] = trim($datos->desde) . ' 00:00:00';
            }
            if (!empty($datos->hasta) && $this->_esFechaValida(trim($datos->hasta), 'Y-m-d')) {
                $condiciones[] = "c.fecha_corte <= ?";
                $params[] = trim($datos->hasta) . ' 23:59:59';
            }

            $where = empty($condiciones) ? '' : 'WHERE ' . implode(' AND ', $condiciones);

            // Paginación
            $pagina    = max(1, (int)($datos->pagina ?? 1));
            $porPagina = (int)($datos->por_pagina ?? 20);
            $porPagina = ($porPagina < 1 || $porPagina > 100) ? 20 : $porPagina;
            $offset    = ($pagina - 1) * $porPagina;

            // Total de registros
            $sqlTotal = "SELECT COUNT(*) AS total FROM bodega_inventario.cierres_mensuales c {$where}";
            $stmtTotal = $this->connect->prepare($sqlTotal);
            $stmtTotal->execute($params);
            $total = (int)($stmtTotal->fetch(PDO::FETCH_OBJ)->total ?? 0);

            // Página de datos — el más reciente primero
            $sql = "SELECT
                    c.id,
                    c.fecha_corte,
                    c.fecha_ejecucion,
                    dtp.nombres AS id_usuario_ejecutor
                FROM
                    bodega_inventario.cierres_mensuales AS c
                    INNER JOIN dbintranet.usuarios AS us ON c.id_usuario_ejecutor = us.idUsuarios
                    INNER JOIN dbintranet.datospersonales AS dtp ON dtp.idDatosPersonales = us.idDatosPersonales
            {$where} 
            ORDER BY c.fecha_corte DESC 
            LIMIT {$porPagina} OFFSET {$offset}";

            $stmt = $this->connect->prepare($sql);
            $stmt->execute($params);
            $cierres = $stmt->fetchAll(PDO::FETCH_OBJ);

            if (empty($cierres)) {
                return $this->res->info('No se encontraron cierres registrados');
            }

            return $this->res->ok('Cierres obtenidos', [
                'cierres'    => $cierres,
                'total'      => $total,
                'pagina'     => $pagina,
                'por_pagina' => $porPagina,
                'paginas'    => (int)ceil($total / $porPagina),
            ], [
                'es_admin' => $this->_esCierresAdmin()
            ]);

        } catch (Exception $e) {
            error_log("Error en listarCierres: " . $e->getMessage());
            return $this->res->fail('Error al obtener los cierres', $e);
        }
    }

    /**
     * Obtiene un cierre específico por su ID.
     *
     * POST: bodega_inventario/obtenerCierre
     *
     * @param object $datos { id: int }
     */
    public function obtenerCierre($datos): array
    {
        try {
            $datos = $this->limpiarDatos($datos);

            if (empty($datos->id) || !filter_var($datos->id, FILTER_VALIDATE_INT) || $datos->id < 1) {
                return $this->res->fail('El ID del cierre es requerido y debe ser un entero positivo');
            }

            $sql = "SELECT
	ci.id, 
	ci.fecha_corte, 
	ci.fecha_ejecucion, 
	dtp.nombres as id_usuario_ejecutor
FROM
	bodega_inventario.cierres_mensuales AS ci
	INNER JOIN
	dbintranet.usuarios AS us
	ON 
		ci.id_usuario_ejecutor = us.idUsuarios
	LEFT JOIN
	dbintranet.datospersonales AS dtp
	ON 
		dtp.idDatosPersonales = us.idDatosPersonales
            WHERE id = ?";

            $stmt = $this->connect->prepare($sql);
            $stmt->execute([(int)$datos->id]);
            $cierre = $stmt->fetch(PDO::FETCH_OBJ);

            if (!$cierre) {
                return $this->res->fail("El cierre con ID {$datos->id} no existe");
            }

            return $this->res->ok('Cierre obtenido correctamente', [
                'cierre' => $cierre
            ]);

        } catch (Exception $e) {
            error_log("Error en obtenerCierre: " . $e->getMessage());
            return $this->res->fail('Error al obtener el cierre', $e);
        }
    }

    /**
     * Registra (ejecuta) un nuevo cierre contable. Puede existir más de uno
     * en un mismo mes; lo que define el límite de reversas es la
     * fecha_corte más reciente.
     *
     * POST: bodega_inventario/crearCierre
     *
     * @param object $datos {
     *   fecha_corte: string (YYYY-MM-DD HH:MM:SS)
     * }
     */
    public function crearCierre($datos): array
    {
        try {
            $datos = $this->limpiarDatos($datos);

            // Permisos
            if (!$this->_esCierresAdmin()) {
                return $this->res->fail(
                    'No tiene permisos para ejecutar cierres. Se requiere rol de contabilidad/administrador.'
                );
            }

            // Validación de la fecha de corte (con hora)
            if (empty($datos->fecha_corte) || !$this->_esFechaValida($datos->fecha_corte)) {
                return $this->res->fail('La fecha de corte es requerida y debe tener formato YYYY-MM-DD HH:MM:SS');
            }

            $this->connect->beginTransaction();

            $sql = "INSERT INTO bodega_inventario.cierres_mensuales 
                (fecha_corte, id_usuario_ejecutor) 
            VALUES (?, ?)";

            $stmt = $this->connect->prepare($sql);
            $stmt->execute([
                $datos->fecha_corte,
                $this->idUsuario,   // ← ajustar a la propiedad real del usuario en sesión (char(30))
            ]);

            $nuevoId = $this->connect->lastInsertId();
            $this->connect->commit();

            return $this->res->ok('Cierre registrado correctamente', null, [
                'id' => (int)$nuevoId
            ]);

        } catch (Exception $e) {
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }
            error_log("Error en crearCierre: " . $e->getMessage());
            return $this->res->fail('Error al registrar el cierre', $e);
        }
    }

    /**
     * Edita un cierre existente. Solo se permite editar el cierre con la
     * fecha_corte más reciente, para no dejar huecos en el historial de
     * reversas.
     *
     * POST: bodega_inventario/editarCierre
     *
     * @param object $datos {
     *   id: int,
     *   fecha_corte: string (YYYY-MM-DD HH:MM:SS)
     * }
     */
    public function editarCierre($datos): array
    {
        try {
            $datos = $this->limpiarDatos($datos);

            if (!$this->_esCierresAdmin()) {
                return $this->res->fail(
                    'No tiene permisos para modificar cierres. Se requiere rol de contabilidad/administrador.'
                );
            }

            if (empty($datos->id) || (int)$datos->id < 1) {
                return $this->res->fail('El ID del cierre es requerido');
            }

            if (empty($datos->fecha_corte) || !$this->_esFechaValida($datos->fecha_corte)) {
                return $this->res->fail('La fecha de corte es requerida y debe tener formato YYYY-MM-DD HH:MM:SS');
            }

            // Verificar existencia
            $sqlExiste = "SELECT id FROM bodega_inventario.cierres_mensuales WHERE id = ?";
            $stmtExiste = $this->connect->prepare($sqlExiste);
            $stmtExiste->execute([(int)$datos->id]);

            if (!$stmtExiste->fetch(PDO::FETCH_OBJ)) {
                return $this->res->fail("El cierre con ID {$datos->id} no existe");
            }

            // Solo se puede editar el cierre más reciente
            if (!$this->_esUltimoCierre((int)$datos->id)) {
                return $this->res->fail(
                    'Solo se puede editar el cierre más reciente. Los cierres anteriores quedan fijos.'
                );
            }

            $this->connect->beginTransaction();

            $sql = "UPDATE bodega_inventario.cierres_mensuales 
            SET fecha_corte = ? 
            WHERE id = ?";

            $stmt = $this->connect->prepare($sql);
            $stmt->execute([
                $datos->fecha_corte,
                (int)$datos->id,
            ]);

            $this->connect->commit();

            return $this->res->ok('Cierre actualizado correctamente');

        } catch (Exception $e) {
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }
            error_log("Error en editarCierre: " . $e->getMessage());
            return $this->res->fail('Error al actualizar el cierre', $e);
        }
    }

    /**
     * Elimina (revierte) un cierre. Solo se permite eliminar el cierre con
     * la fecha_corte más reciente, para no dejar huecos en el historial de
     * reversas.
     *
     * POST: bodega_inventario/eliminarCierre
     *
     * @param object $datos { id: int }
     */
    public function eliminarCierre($datos): array
    {
        try {
            $datos = $this->limpiarDatos($datos);

            if (!$this->_esCierresAdmin()) {
                return $this->res->fail(
                    'No tiene permisos para eliminar cierres. Se requiere rol de contabilidad/administrador.'
                );
            }

            if (empty($datos->id) || (int)$datos->id < 1) {
                return $this->res->fail('El ID del cierre es requerido');
            }

            // Verificar existencia
            $sqlExiste = "SELECT id, fecha_corte 
                FROM bodega_inventario.cierres_mensuales WHERE id = ?";
            $stmtExiste = $this->connect->prepare($sqlExiste);
            $stmtExiste->execute([(int)$datos->id]);
            $cierre = $stmtExiste->fetch(PDO::FETCH_OBJ);

            if (!$cierre) {
                return $this->res->fail("El cierre con ID {$datos->id} no existe");
            }

            // Solo se puede eliminar el cierre más reciente
            if (!$this->_esUltimoCierre((int)$cierre->id)) {
                return $this->res->fail(
                    "No se puede eliminar un cierre que no es el más reciente. Elimine primero los cierres posteriores."
                );
            }

            $this->connect->beginTransaction();

            $sql = "DELETE FROM bodega_inventario.cierres_mensuales WHERE id = ?";
            $stmt = $this->connect->prepare($sql);
            $stmt->execute([(int)$datos->id]);

            $this->connect->commit();

            return $this->res->ok('Cierre eliminado correctamente');

        } catch (Exception $e) {
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }
            error_log("Error en eliminarCierre: " . $e->getMessage());
            return $this->res->fail('Error al eliminar el cierre', $e);
        }
    }

    // =========================================================================
    // AUXILIARES PRIVADOS — CIERRES
    // =========================================================================

    /** Indica si el puesto en sesión puede gestionar cierres. */
    private function _esCierresAdmin(): bool
    {
        return in_array($this->puesto, [1, 3, 56], true);
    }

    /** Indica si el ID dado corresponde al cierre con fecha_corte más reciente. */
    private function _esUltimoCierre(int $id): bool
    {
        $stmt = $this->connect->query(
            "SELECT id FROM bodega_inventario.cierres_mensuales ORDER BY fecha_corte DESC, id DESC LIMIT 1"
        );
        $ultimo = $stmt->fetch(PDO::FETCH_OBJ);
        return $ultimo && (int)$ultimo->id === $id;
    }

    /** Valida que la cadena sea una fecha real en el formato dado. */
    private function _esFechaValida(string $fecha, string $formato = 'Y-m-d H:i:s'): bool
    {
        $d = \DateTime::createFromFormat($formato, $fecha);
        return $d && $d->format($formato) === $fecha;
    }

    /**
     * Revierte TOTALMENTE la entrega de un renglón ya despachado (estado 2).
     * Devuelve la mercancía a sus lotes de origen, asienta movimientos tipo 3
     * y registra la reversa. Solo válido si la entrega fue posterior al último
     * cierre. Correlativo, expiración y normal soportados (correlativo exige
     * que el rango sea contiguo con el puntero del lote).
     *
     * POST: bodega_inventario/revertirEntrega
     *
     * @param object $datos { id_solicitud_detalle: int, motivo: string, contexto?: string (area|agencia) }
     */
    public function revertirEntrega($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();
            $this->_inicializarCierreHelper();
            $this->_inicializarReversaHelper();

            $datos    = $this->limpiarDatos($datos);
            $idDetalle = (int)($datos->id_solicitud_detalle ?? 0);
            $motivo    = trim($datos->motivo ?? '');
            $contexto  = trim($datos->contexto ?? 'area');

            if ($idDetalle < 1 || $motivo === '') {
                return $this->res->fail('Se requiere id_solicitud_detalle y un motivo');
            }
            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El contexto debe ser "area" o "agencia"');
            }

            $idBodegaEncargado = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);
            if ($idBodegaEncargado < 1) {
                return $this->res->fail('No tienes una bodega asignada para este contexto');
            }

            $this->connect->beginTransaction();

            // Bloquear renglón + cabecera y validar pertenencia/estado/tipo
            $sql = "SELECT
                sd.id, sd.id_producto, sd.id_unidad, sd.cantidad_entregada,
                sd.fecha_gestion,
                sd.correlativo_inicial_asignado, sd.correlativo_final_asignado,
                sd.correlativo_inicial_asignado_2, sd.correlativo_final_asignado_2,
                sd.id_lote_correlativo, sd.id_lote_correlativo_2,
                s.id_estado, s.id_bodega,
                p.id_tipo
            FROM bodega_inventario.solicitudes_detalle sd
            INNER JOIN bodega_inventario.solicitudes s ON s.id = sd.id_solicitud
            INNER JOIN bodega_inventario.productos p ON p.id = sd.id_producto
            WHERE sd.id = ? AND s.id_bodega = ?
            FOR UPDATE";
            $stmt = $this->connect->prepare($sql);
            $stmt->execute([$idDetalle, $idBodegaEncargado]);
            $det = $stmt->fetch(PDO::FETCH_OBJ);

            if (!$det) {
                $this->connect->rollBack();
                return $this->res->fail('El renglón no existe o no corresponde a tu bodega');
            }
            if ((int)$det->id_estado !== 2) {
                $this->connect->rollBack();
                return $this->res->fail('Solo se pueden revertir entregas (solicitud en estado Entregada)');
            }
            if ($det->cantidad_entregada === null || (float)$det->cantidad_entregada <= 0) {
                $this->connect->rollBack();
                return $this->res->fail('Este renglón no tiene una entrega registrada para revertir');
            }

            // ¿Ya fue revertido?
            $stmtRev = $this->connect->prepare(
                "SELECT 1 FROM bodega_inventario.reversas WHERE id_solicitud_detalle = ? LIMIT 1"
            );
            $stmtRev->execute([$idDetalle]);
            if ($stmtRev->fetch()) {
                $this->connect->rollBack();
                return $this->res->fail('Este renglón ya fue revertido previamente');
            }

            // Condición: la entrega debe ser posterior al último cierre
            if (!$this->cierreHelper->esPosteriorAlUltimoCierre((string)$det->fecha_gestion)) {
                $this->connect->rollBack();
                return $this->res->fail('No se puede revertir: la entrega pertenece a un periodo ya cerrado');
            }

            $idBodega   = (int)$det->id_bodega;
            $idProducto = (int)$det->id_producto;
            $idUnidad   = (int)$det->id_unidad;
            $idTipo     = (int)$det->id_tipo;
            $cantidad   = (float)$det->cantidad_entregada;

            // Restaurar lotes + movimientos tipo 3 según el tipo de producto
            if ($idTipo === 1) {
                $this->reversaHelper->revertirEntregaCorrelativo($det, $idBodega, $idProducto, $idDetalle);
            } else {
                $this->reversaHelper->revertirEntregaPorLotes($idDetalle, $idBodega, $idProducto, $idUnidad);
            }

            // Devolver al stock consolidado
            $this->stockHelper->restaurarPorReversa($idBodega, $idProducto, $idUnidad, $cantidad);

            // Registrar la reversa
            $this->connect->prepare(
                "INSERT INTO bodega_inventario.reversas
             (id_solicitud_detalle, id_bodega, id_usuario_encargado, motivo, cantidad_revertida)
         VALUES (?, ?, ?, ?, ?)"
            )->execute([$idDetalle, $idBodega, $this->idUsuario, $motivo, $cantidad]);

            // Marcar la solicitud como Revertida (5)
            $this->connect->prepare(
                "UPDATE bodega_inventario.solicitudes
            SET id_estado = 5, updated_at = CURRENT_TIMESTAMP
            WHERE id = (SELECT id_solicitud FROM bodega_inventario.solicitudes_detalle WHERE id = ?)"
            )->execute([$idDetalle]);

            $this->connect->commit();

            return $this->res->ok('La entrega fue revertida y las existencias regresaron a su lote de origen', [
                'id_solicitud_detalle' => $idDetalle,
                'cantidad_revertida'   => $cantidad,
            ]);

        } catch (Exception $e) {
            if ($this->connect->inTransaction()) {
                $this->connect->rollBack();
            }
            error_log("Error en revertirEntrega: " . $e->getMessage());
            return $this->res->fail($e->getMessage());
        }
    }

    /**
     * Lista las reversas registradas en la bodega del encargado (auditoría).
     * Resuelve la bodega por contexto y aplica filtros de búsqueda y fechas.
     *
     * POST: bodega_inventario/listarReversas
     *
     * @param object $datos {
     *   contexto: string (area|agencia),
     *   busqueda?: string,
     *   fecha_desde?: string (YYYY-MM-DD),
     *   fecha_hasta?: string (YYYY-MM-DD),
     *   pagina?: int,
     *   por_pagina?: int
     * }
     */
    public function listarReversas($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $datos    = $this->limpiarDatos($datos);
            $contexto = trim($datos->contexto ?? '');

            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            $idBodega = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);
            if ($idBodega < 1) {
                return $this->res->fail(
                    $contexto === 'agencia'
                        ? 'No tienes una bodega de agencia asignada'
                        : 'No tienes una bodega de área asignada'
                );
            }

            $busqueda   = trim($datos->busqueda ?? '');
            $fechaDesde = trim($datos->fecha_desde ?? '');
            $fechaHasta = trim($datos->fecha_hasta ?? '');

            $pagina    = max(1, (int)($datos->pagina ?? 1));
            $porPagina = min(50, max(1, (int)($datos->por_pagina ?? 20)));
            $offset    = ($pagina - 1) * $porPagina;

            $params     = [$idBodega];
            $whereExtra = '';

            if ($busqueda !== '') {
                $whereExtra .= " AND (p.nombre LIKE ? OR dpS.nombres LIKE ?)";
                $params[]    = "%{$busqueda}%";
                $params[]    = "%{$busqueda}%";
            }
            if ($fechaDesde !== '') {
                $whereExtra .= " AND DATE(r.created_at) >= ?";
                $params[]    = $fechaDesde;
            }
            if ($fechaHasta !== '') {
                $whereExtra .= " AND DATE(r.created_at) <= ?";
                $params[]    = $fechaHasta;
            }

            $sqlBase = "FROM bodega_inventario.reversas r
            INNER JOIN bodega_inventario.solicitudes_detalle sd ON sd.id = r.id_solicitud_detalle
            INNER JOIN bodega_inventario.solicitudes s ON s.id = sd.id_solicitud
            INNER JOIN bodega_inventario.productos p ON p.id = sd.id_producto
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = sd.id_unidad
            LEFT JOIN dbintranet.usuarios ue ON ue.idUsuarios = r.id_usuario_encargado
            LEFT JOIN dbintranet.datospersonales dpE ON dpE.idDatosPersonales = ue.idDatosPersonales
            LEFT JOIN dbintranet.usuarios usol ON usol.idUsuarios = s.id_usuario
            LEFT JOIN dbintranet.datospersonales dpS ON dpS.idDatosPersonales = usol.idDatosPersonales
            WHERE r.id_bodega = ? {$whereExtra}";

            $sqlCount = "SELECT COUNT(*) AS total {$sqlBase}";
            $stmtCount = $this->connect->prepare($sqlCount);
            $stmtCount->execute($params);
            $total = (int)($stmtCount->fetch(PDO::FETCH_OBJ)->total ?? 0);

            if ($total === 0) {
                return $this->res->ok('No se encontraron reversas con los filtros aplicados', [
                    'reversas'   => [],
                    'total'      => 0,
                    'pagina'     => $pagina,
                    'por_pagina' => $porPagina,
                    'paginas'    => 0,
                ]);
            }

            $sqlData = "SELECT
                r.id,
                r.id_solicitud_detalle,
                s.id AS id_solicitud,
                p.nombre AS producto,
                um.abreviatura AS unidad,
                r.cantidad_revertida,
                r.motivo,
                r.created_at,
                COALESCE(dpS.nombres, s.id_usuario) AS solicitante,
                COALESCE(dpE.nombres, r.id_usuario_encargado) AS encargado
            {$sqlBase}
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT {$porPagina} OFFSET {$offset}";

            $stmtData = $this->connect->prepare($sqlData);
            $stmtData->execute($params);
            $reversas = $stmtData->fetchAll(PDO::FETCH_OBJ);

            foreach ($reversas as $rv) {
                $rv->id                   = (int)$rv->id;
                $rv->id_solicitud_detalle = (int)$rv->id_solicitud_detalle;
                $rv->id_solicitud         = (int)$rv->id_solicitud;
                $rv->cantidad_revertida   = (float)$rv->cantidad_revertida;
            }

            return $this->res->ok('Reversas obtenidas correctamente', [
                'reversas'   => $reversas,
                'total'      => $total,
                'pagina'     => $pagina,
                'por_pagina' => $porPagina,
                'paginas'    => (int)ceil($total / $porPagina),
            ]);

        } catch (Exception $e) {
            error_log("Error en listarReversas: " . $e->getMessage());
            return $this->res->fail('Error en el servidor al recuperar las reversas', $e);
        }
    }



    // =========================================================================
    // TRASLADOS ENTRE BODEGAS
    // =========================================================================

    /**
     * Lista los productos con existencias en la bodega ORIGEN del encargado en
     * sesión, para que elija cuál enviar en un traslado. Es el equivalente a
     * "listado de stock" pero acotado al contexto de traslados: usa la bodega
     * propia del encargado (resuelta por contexto) en vez de recibir id_bodega,
     * y no aplica la matriz de acceso porque es su propia bodega, no una ajena.
     *
     * POST: bodega_inventario/listarProductosParaTraslado
     *
     * @param object $datos {
     *   contexto: string (area|agencia),
     *   busqueda: ?string,
     *   orden_campo: ?string (nombre|tipo|categoria|unidad_default|cantidad_disponible),
     *   orden_dir: ?string (asc|desc),
     *   pagina: ?int,
     *   por_pagina: ?int
     * }
     */
    public function listarProductosParaTraslado($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $datos    = $this->limpiarDatos($datos);
            $contexto = trim($datos->contexto ?? '');

            // 1. Validaciones estructurales y resolución de la bodega origen
            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            $idBodegaOrigen = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodegaOrigen || $idBodegaOrigen < 1) {
                return $this->res->fail(
                    $contexto === 'agencia'
                        ? 'No tienes una bodega de agencia asignada en el sistema'
                        : 'No tienes una bodega de área asignada en el sistema'
                );
            }

            // 2. Captura, sanitización y tipado de parámetros de búsqueda/orden/paginación
            $busqueda  = trim($datos->busqueda ?? '');
            $pagina    = max(1, (int)($datos->pagina ?? 1));
            $porPagina = min(50, max(1, (int)($datos->por_pagina ?? 20)));
            $offset    = ($pagina - 1) * $porPagina;

            // Mapeo seguro de columnas para evitar inyecciones de código en el ORDER BY
            $camposPermitidos = [
                'nombre'              => 'p.nombre',
                'tipo'                => 'tp.nombre',
                'categoria'           => 'cp.nombre',
                'unidad_default'      => 'um.nombre',
                'cantidad_disponible' => 's.cantidad_disponible',
            ];

            $ordenSQL = $camposPermitidos[$datos->orden_campo ?? 'nombre'] ?? 'p.nombre';
            $ordenDir = strtolower($datos->orden_dir ?? 'asc') === 'desc' ? 'DESC' : 'ASC';

            $params     = [$idBodegaOrigen];
            $whereExtra = '';

            if ($busqueda !== '') {
                $whereExtra = " AND (p.nombre LIKE ? OR cp.nombre LIKE ?)";
                $params[]   = "%{$busqueda}%";
                $params[]   = "%{$busqueda}%";
            }

            // 3. Estructuración y aislamiento del cuerpo principal de la consulta (solo productos con stock disponible > 0)
            $sqlBase = "FROM bodega_inventario.productos p
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            INNER JOIN bodega_inventario.categorias_producto cp ON cp.id = p.id_categoria
            INNER JOIN bodega_inventario.productos_unidades pu ON pu.id_producto = p.id AND pu.es_default = 1 AND pu.activo = 1
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = pu.id_unidad
            INNER JOIN bodega_inventario.stock s ON s.id_producto = p.id AND s.id_bodega = ? AND s.id_unidad = pu.id_unidad
            WHERE p.activo = 1 AND s.cantidad_disponible > 0 {$whereExtra}";

            // Consulta A: Ejecutar conteo total de registros paginables
            $sqlCount  = "SELECT COUNT(*) AS total_registros {$sqlBase}";
            $stmtCount = $this->connect->prepare($sqlCount);
            $stmtCount->execute($params);
            $total = (int)($stmtCount->fetch(PDO::FETCH_OBJ)->total_registros ?? 0);

            if ($total === 0) {
                return $this->res->info('No se encontraron productos con existencias disponibles para trasladar desde esta bodega');
            }

            // Consulta B: Extracción parametrizada de registros ordenados con límites de paginación
            $sqlData = "SELECT
                p.id,
                p.nombre,
                p.descripcion,
                p.id_tipo,
                tp.nombre AS tipo,
                p.id_categoria,
                cp.nombre AS categoria,
                um.id AS id_unidad_default,
                um.nombre AS unidad_default,
                um.abreviatura AS abreviatura_unidad,
                s.cantidad_total,
                s.cantidad_reservada,
                s.cantidad_disponible
            {$sqlBase}
            ORDER BY {$ordenSQL} {$ordenDir}
            LIMIT {$porPagina} OFFSET {$offset}";

            $stmtData = $this->connect->prepare($sqlData);
            $stmtData->execute($params);
            $productos = $stmtData->fetchAll(PDO::FETCH_OBJ);

            // 4. Recorrido para tipado fuerte y conversión sobre el arreglo de objetos
            foreach ($productos as $p) {
                $p->id                  = (int)$p->id;
                $p->id_tipo             = (int)$p->id_tipo;
                $p->id_categoria        = (int)$p->id_categoria;
                $p->id_unidad_default   = (int)$p->id_unidad_default;
                $p->cantidad_total      = (float)$p->cantidad_total;
                $p->cantidad_reservada  = (float)$p->cantidad_reservada;
                $p->cantidad_disponible = (float)$p->cantidad_disponible;
            }

            return $this->res->ok('Inventario disponible de la bodega origen recuperado correctamente', [
                'productos'  => $productos,
                'total'      => $total,
                'pagina'     => $pagina,
                'por_pagina' => $porPagina,
                'paginas'    => (int)ceil($total / $porPagina),
                'bodega'     => (object)['id' => $idBodegaOrigen],
            ]);

        } catch (Exception $e) {
            error_log("Error masivo en listarProductosParaTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar el inventario disponible para traslado', $e);
        }
    }

    /**
     * Crea un traslado desde la bodega del encargado (origen) hacia otra bodega
     * (destino). Para productos tipo Correlativo o Expiración, el encargado debe
     * elegir el lote específico a enviar (queda reservado dentro de ese lote).
     * Para productos tipo Normal, no se elige lote: se resuelve por FIFO hasta
     * que el destino confirme la recepción.
     *
     * Según la bandera `bodegas.requiere_autorizacion_traslado` de la bodega
     * ORIGEN, el traslado queda en Pendiente (1, requiere aprobación del Admin)
     * o directamente en Aprobado (2, auto-aprobado).
     *
     * POST: bodega_inventario/crearTraslado
     *
     * @param object $datos {
     *   contexto: string (area|agencia),
     *   id_bodega_destino: int,
     *   id_producto: int,
     *   id_unidad: int,
     *   cantidad: float|int,
     *   id_lote_correlativo: int|null,  // requerido si el producto es tipo 1
     *   id_lote_expiracion: int|null    // requerido si el producto es tipo 2
     * }
     */
    public function crearTraslado($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarTrasladoHelper();

            $datos    = $this->limpiarDatos($datos);
            $contexto = trim($datos->contexto ?? '');

            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            $idBodegaOrigen = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodegaOrigen || $idBodegaOrigen < 1) {
                return $this->res->fail(
                    $contexto === 'agencia'
                        ? 'No tienes una bodega de agencia asignada en el sistema'
                        : 'No tienes una bodega de área asignada en el sistema'
                );
            }

            $idBodegaDestino    = (int)($datos->id_bodega_destino ?? 0);
            $idProducto         = (int)($datos->id_producto ?? 0);
            $idUnidad           = (int)($datos->id_unidad ?? 0);
            $cantidadRaw        = $datos->cantidad ?? 0;
            $idLoteCorrelativo  = isset($datos->id_lote_correlativo) ? (int)$datos->id_lote_correlativo : null;
            $idLoteExpiracion   = isset($datos->id_lote_expiracion) ? (int)$datos->id_lote_expiracion : null;

            if ($idBodegaDestino < 1 || $idProducto < 1 || $idUnidad < 1 || $cantidadRaw <= 0) {
                return $this->res->fail('Campos requeridos: bodega destino, producto, unidad y cantidad (mayor a cero)');
            }

            if ($idBodegaDestino === $idBodegaOrigen) {
                return $this->res->fail('La bodega destino no puede ser la misma que la bodega de origen');
            }

            // Validar bodega destino activa
            $bodegaDestino = $this->trasladoHelper->obtenerBodegaActiva($idBodegaDestino);
            if (!$bodegaDestino) {
                return $this->res->fail('La bodega de destino seleccionada no existe o se encuentra inactiva');
            }

            // Validar relación producto-unidad activa
            $sqlCheckRelacion = "SELECT pu.id
                FROM bodega_inventario.productos_unidades pu
                INNER JOIN bodega_inventario.productos p ON p.id = pu.id_producto
                WHERE pu.id_producto = ? AND pu.id_unidad = ? AND pu.activo = 1 AND p.activo = 1
                LIMIT 1";
            $stmtPU = $this->connect->prepare($sqlCheckRelacion);
            $stmtPU->execute([$idProducto, $idUnidad]);
            if (!$stmtPU->fetch(PDO::FETCH_OBJ)) {
                return $this->res->fail('El producto o la unidad de medida no son válidos o se encuentran inactivos');
            }

            // Determinar el tipo de control de inventario del producto
            $stmtTipo = $this->connect->prepare("SELECT id_tipo FROM bodega_inventario.productos WHERE id = ? LIMIT 1");
            $stmtTipo->execute([$idProducto]);
            $idTipoProducto = (int)$stmtTipo->fetchColumn();

            $this->connect->beginTransaction();

            try {
                $cantidadFinal = (float)$cantidadRaw;

                // 1. Reserva del lote específico elegido (solo correlativo / expiración)
                if ($idTipoProducto === 1) {
                    if ($idLoteCorrelativo === null || $idLoteCorrelativo < 1) {
                        throw new Exception('Debe seleccionar el lote correlativo específico a enviar');
                    }
                    $cantidadFinal = (int)round($cantidadRaw);
                    if ($cantidadFinal < 1) {
                        throw new Exception('La cantidad debe ser un entero positivo para productos correlativos');
                    }
                    $this->trasladoHelper->bloquearYReservarLoteCorrelativo($idLoteCorrelativo, $idBodegaOrigen, $idProducto, $cantidadFinal);
                } elseif ($idTipoProducto === 2) {
                    if ($idLoteExpiracion === null || $idLoteExpiracion < 1) {
                        throw new Exception('Debe seleccionar el lote de expiración específico a enviar');
                    }
                    $this->trasladoHelper->bloquearYReservarLoteExpiracion($idLoteExpiracion, $idBodegaOrigen, $idProducto, $idUnidad, $cantidadFinal);
                }
                // Tipo 3 (Normal): no se reserva lote específico; se resuelve por FIFO al confirmar recepción

                // 2. Reserva agregada en stock (aplica a los 3 tipos, mantiene el indicador general consistente)
                $stockRaw = $this->stockHelper->obtenerConBloqueo($idBodegaOrigen, $idProducto, $idUnidad);
                if (!$stockRaw) {
                    throw new Exception('No se localizaron registros de existencias inicializadas para este producto y escala en la bodega origen');
                }
                $disponible = (float)$stockRaw['cantidad_disponible'];
                if ($cantidadFinal > $disponible) {
                    throw new Exception("Stock insuficiente para el traslado. Disponible actual: {$disponible}");
                }
                $this->stockHelper->incrementarReserva($idBodegaOrigen, $idProducto, $idUnidad, $cantidadFinal);

                // 3. Determinar si requiere autorización según la bodega ORIGEN
                $bodegaOrigenInfo    = $this->trasladoHelper->obtenerBodegaActiva($idBodegaOrigen);
                $requiereAutorizacion = $bodegaOrigenInfo === null || $bodegaOrigenInfo->requiere_autorizacion_traslado;
                $idEstado            = $requiereAutorizacion ? 1 : 2;

                // 4. Insertar cabecera
                if ($idEstado === 2) {
                    $this->connect->prepare(
                        "INSERT INTO bodega_inventario.traslados
                            (id_bodega_origen, id_bodega_destino, id_estado, id_usuario_encargado,
                             comentario_admin, fecha_gestion)
                         VALUES (?, ?, 2, ?, ?, CURRENT_TIMESTAMP)"
                    )->execute([
                        $idBodegaOrigen, $idBodegaDestino, $this->idUsuario,
                        'Auto-aprobado: la bodega de origen no requiere autorización',
                    ]);
                } else {
                    $this->connect->prepare(
                        "INSERT INTO bodega_inventario.traslados
                            (id_bodega_origen, id_bodega_destino, id_estado, id_usuario_encargado)
                         VALUES (?, ?, 1, ?)"
                    )->execute([$idBodegaOrigen, $idBodegaDestino, $this->idUsuario]);
                }

                $idTraslado = (int)$this->connect->lastInsertId();

                // 5. Insertar detalle (el lote elegido queda como "propuesta"; se ejecuta en confirmarRecepcion)
                $this->connect->prepare(
                    "INSERT INTO bodega_inventario.traslados_detalle
                        (id_traslado, id_producto, id_unidad, cantidad, id_lote_correlativo, id_lote_expiracion)
                     VALUES (?, ?, ?, ?, ?, ?)"
                )->execute([
                    $idTraslado, $idProducto, $idUnidad, $cantidadFinal,
                    $idTipoProducto === 1 ? $idLoteCorrelativo : null,
                    $idTipoProducto === 2 ? $idLoteExpiracion : null,
                ]);

                $this->connect->commit();

                return $this->res->ok('El traslado ha sido registrado correctamente', [
                    'id_traslado' => $idTraslado,
                    'id_estado'   => $idEstado,
                    'requiere_autorizacion' => $requiereAutorizacion,
                ]);

            } catch (Exception $eInterno) {
                if ($this->connect->inTransaction()) {
                    $this->connect->rollBack();
                }
                return $this->res->fail($eInterno->getMessage());
            }

        } catch (Exception $e) {
            error_log("Error en crearTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar registrar el traslado', $e);
        }
    }

    /**
     * Cancela un traslado propio mientras esté en estado Pendiente (1).
     * Libera la reserva agregada de stock y, si aplica, la reserva del lote específico.
     *
     * POST: bodega_inventario/cancelarTraslado
     *
     * @param object $datos { id_traslado: int }
     */
    public function cancelarTraslado($datos): array
    {
        try {
            $this->_inicializarStockHelper();
            $this->_inicializarTrasladoHelper();

            $datos       = $this->limpiarDatos($datos);
            $idTraslado  = (int)($datos->id_traslado ?? 0);

            if ($idTraslado < 1) {
                return $this->res->fail('El campo id_traslado es requerido y debe ser un entero positivo');
            }

            $this->connect->beginTransaction();

            $stmtCab = $this->connect->prepare(
                "SELECT id, id_bodega_origen, id_estado
                 FROM bodega_inventario.traslados
                 WHERE id = ? AND id_usuario_encargado = ?
                 FOR UPDATE"
            );
            $stmtCab->execute([$idTraslado, $this->idUsuario]);
            $traslado = $stmtCab->fetch(PDO::FETCH_OBJ);

            if (!$traslado) {
                if ($this->connect->inTransaction()) $this->connect->rollBack();
                return $this->res->fail('El traslado especificado no existe o no corresponde a su usuario en sesión');
            }

            if ((int)$traslado->id_estado !== 1) {
                if ($this->connect->inTransaction()) $this->connect->rollBack();
                return $this->res->fail('Operación rechazada: Solo se pueden cancelar traslados en estado Pendiente');
            }

            $this->_liberarReservasTraslado($idTraslado, (int)$traslado->id_bodega_origen);

            $this->connect->prepare(
                "UPDATE bodega_inventario.traslados SET id_estado = 5, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            )->execute([$idTraslado]);

            $this->connect->commit();

            return $this->res->ok('El traslado ha sido cancelado y la reserva de existencias liberada correctamente');

        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en cancelarTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar cancelar el traslado', $e);
        }
    }

    /**
     * Aprueba un traslado Pendiente (1) → Aprobado (2). No mueve stock físico
     * todavía: eso ocurre hasta que el encargado destino confirme la recepción.
     *
     * POST: bodega_inventario/aprobarTraslado
     *
     * @param object $datos { id_traslado: int, comentario: ?string }
     */
    public function aprobarTraslado($datos): array
    {
        try {
            $datos      = $this->limpiarDatos($datos);
            $idTraslado = (int)($datos->id_traslado ?? 0);
            $comentario = trim($datos->comentario ?? '');

            if ($idTraslado < 1) {
                return $this->res->fail('El campo id_traslado es requerido y debe ser un entero positivo');
            }

            $stmtCab = $this->connect->prepare(
                "SELECT id, id_estado FROM bodega_inventario.traslados WHERE id = ? FOR UPDATE"
            );
            $stmtCab->execute([$idTraslado]);
            $traslado = $stmtCab->fetch(PDO::FETCH_OBJ);

            if (!$traslado) {
                return $this->res->fail('El traslado especificado no existe en el sistema');
            }

            if ((int)$traslado->id_estado !== 1) {
                return $this->res->fail('Operación rechazada: Solo se pueden aprobar traslados en estado Pendiente');
            }

            $this->connect->prepare(
                "UPDATE bodega_inventario.traslados
                 SET id_estado = 2, id_usuario_admin = ?, fecha_gestion = CURRENT_TIMESTAMP,
                     comentario_admin = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?"
            )->execute([$this->idUsuario, $comentario !== '' ? $comentario : null, $idTraslado]);

            return $this->res->ok('El traslado ha sido aprobado. Queda a la espera de que la bodega destino confirme la recepción');

        } catch (Exception $e) {
            error_log("Error en aprobarTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar aprobar el traslado', $e);
        }
    }

    /**
     * Rechaza un traslado que esté Pendiente (1) o Aprobado (2) (antes de que el
     * destino confirme la recepción). Es terminal: libera la reserva y no admite
     * más acciones; debe iniciarse un nuevo traslado.
     *
     * POST: bodega_inventario/rechazarTraslado
     *
     * @param object $datos { id_traslado: int, comentario: string }
     */
    public function rechazarTraslado($datos): array
    {
        try {
            $this->_inicializarStockHelper();
            $this->_inicializarTrasladoHelper();

            $datos      = $this->limpiarDatos($datos);
            $idTraslado = (int)($datos->id_traslado ?? 0);
            $comentario = trim($datos->comentario ?? '');

            if ($idTraslado < 1 || $comentario === '') {
                return $this->res->fail('Se requiere el id_traslado y el comentario (motivo del rechazo)');
            }

            $this->connect->beginTransaction();

            $stmtCab = $this->connect->prepare(
                "SELECT id, id_bodega_origen, id_estado FROM bodega_inventario.traslados WHERE id = ? FOR UPDATE"
            );
            $stmtCab->execute([$idTraslado]);
            $traslado = $stmtCab->fetch(PDO::FETCH_OBJ);

            if (!$traslado) {
                if ($this->connect->inTransaction()) $this->connect->rollBack();
                return $this->res->fail('El traslado especificado no existe en el sistema');
            }

            if (!in_array((int)$traslado->id_estado, [1, 2], true)) {
                if ($this->connect->inTransaction()) $this->connect->rollBack();
                return $this->res->fail('Operación rechazada: Solo se pueden rechazar traslados en estado Pendiente o Aprobado');
            }

            $this->_liberarReservasTraslado($idTraslado, (int)$traslado->id_bodega_origen);

            $this->connect->prepare(
                "UPDATE bodega_inventario.traslados
                 SET id_estado = 3, id_usuario_admin = ?, fecha_gestion = CURRENT_TIMESTAMP,
                     comentario_admin = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?"
            )->execute([$this->idUsuario, $comentario, $idTraslado]);

            $this->connect->commit();

            return $this->res->ok('El traslado ha sido rechazado y la reserva de existencias liberada correctamente');

        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en rechazarTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar rechazar el traslado', $e);
        }
    }

    /**
     * Confirma la recepción física de un traslado Aprobado (2) por parte del
     * encargado de la bodega DESTINO. Aquí ocurre todo el movimiento físico real:
     * baja definitiva del lote origen, alta del lote espejo en destino (precio
     * heredado), afectación de stock en ambas bodegas y doble movimiento en Kardex.
     *
     * POST: bodega_inventario/confirmarRecepcionTraslado
     *
     * @param object $datos { id_traslado: int }
     */
    /**
     * Confirma la recepción física de un traslado Aprobado (2) por parte del
     * encargado de la bodega DESTINO. Aquí ocurre todo el movimiento físico real:
     * baja definitiva del lote origen, alta del lote espejo en destino (precio
     * heredado y snapshoteado en el kardex), afectación de stock en ambas
     * bodegas y doble movimiento en Kardex (baja origen + alta destino).
     *
     * POST: bodega_inventario/confirmarRecepcionTraslado
     *
     * @param object $datos { id_traslado: int, contexto: string (area|agencia) }
     */
    public function confirmarRecepcionTraslado($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();
            $this->_inicializarStockHelper();
            $this->_inicializarMovimientoHelper();
            $this->_inicializarTrasladoHelper();

            $datos      = $this->limpiarDatos($datos);
            $idTraslado = (int)($datos->id_traslado ?? 0);
            $contexto   = trim($datos->contexto ?? '');

            if ($idTraslado < 1) {
                return $this->res->fail('El campo id_traslado es requerido y debe ser un entero positivo');
            }

            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            $this->connect->beginTransaction();

            try {
                // 1. Bloquear y validar la cabecera del traslado
                $stmtCab = $this->connect->prepare(
                    "SELECT id, id_bodega_origen, id_bodega_destino, id_estado
                     FROM bodega_inventario.traslados WHERE id = ? FOR UPDATE"
                );
                $stmtCab->execute([$idTraslado]);
                $traslado = $stmtCab->fetch(PDO::FETCH_OBJ);

                if (!$traslado) {
                    throw new Exception('El traslado especificado no existe en el sistema');
                }

                if ((int)$traslado->id_estado !== 2) {
                    throw new Exception('Operación rechazada: Solo se puede confirmar la recepción de traslados en estado Aprobado');
                }

                $idBodegaOrigen  = (int)$traslado->id_bodega_origen;
                $idBodegaDestino = (int)$traslado->id_bodega_destino;

                // 2. Permiso: la bodega resuelta por el CONTEXTO enviado debe ser la bodega destino de este traslado.
                // (obtenerBodegaEncargado() no sirve aquí porque resuelve una sola bodega con prioridad
                // fija área→agencia, y un mismo usuario puede recibir en cualquiera de las dos según el traslado)
                $idBodegaContexto = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

                if (!$idBodegaContexto || $idBodegaContexto !== $idBodegaDestino) {
                    throw new Exception('Acceso denegado: No es usted el encargado de la bodega destino de este traslado');
                }

                // 3. Caso borde: bodega destino desactivada entre la aprobación y la recepción
                if (!$this->trasladoHelper->bodegaDestinoSigueActiva($idBodegaDestino)) {
                    throw new Exception('No es posible confirmar la recepción: la bodega destino se encuentra inactiva');
                }

                // 4. Obtener los renglones del traslado con el tipo de producto de cada uno
                $stmtDet = $this->connect->prepare(
                    "SELECT td.id, td.id_producto, td.id_unidad, td.cantidad,
                            td.id_lote_correlativo, td.id_lote_expiracion, p.id_tipo AS id_tipo_producto
                     FROM bodega_inventario.traslados_detalle td
                     INNER JOIN bodega_inventario.productos p ON p.id = td.id_producto
                     WHERE td.id_traslado = ?"
                );
                $stmtDet->execute([$idTraslado]);
                $renglones = $stmtDet->fetchAll(PDO::FETCH_OBJ);

                // 5. Procesar cada renglón según el tipo de control de inventario del producto
                foreach ($renglones as $r) {
                    $idProducto = (int)$r->id_producto;
                    $idUnidad   = (int)$r->id_unidad;
                    $idTipo     = (int)$r->id_tipo_producto;
                    $idDetalle  = (int)$r->id;

                    // ── TIPO 1: CORRELATIVO ─────────────────────────────────────────
                    if ($idTipo === 1) {
                        $cantidad  = (int)$r->cantidad;
                        $resultado = $this->trasladoHelper->consumirYCrearDestinoCorrelativo(
                            (int)$r->id_lote_correlativo, $cantidad, $idBodegaDestino, $this->idUsuario, $idTraslado
                        );

                        $this->stockHelper->descontarPorEntrega($idBodegaOrigen, $idProducto, $idUnidad, $cantidad, $cantidad);
                        $this->stockHelper->incrementarPorAlta($idBodegaDestino, $idProducto, $idUnidad, $cantidad);

                        $this->movimientoHelper->registrarBajaTraslado(
                            $idBodegaOrigen, $idProducto, $idUnidad, $cantidad, $idDetalle,
                            $resultado['correlativo_inicial'], $resultado['correlativo_final'], $resultado['precio_unitario']
                        );
                        $this->movimientoHelper->registrarAltaTraslado(
                            $idBodegaDestino, $idProducto, $idUnidad, $cantidad,
                            'lotes_correlativo', $resultado['id_lote_destino'],
                            $resultado['correlativo_inicial'], $resultado['correlativo_final'], $resultado['precio_unitario']
                        );

                        $this->trasladoHelper->insertarDetalleLote(
                            $idDetalle, $cantidad,
                            (int)$r->id_lote_correlativo, null, null,
                            $resultado['id_lote_destino'], null, null
                        );

                        $this->connect->prepare(
                            "UPDATE bodega_inventario.traslados_detalle
                             SET precio_unitario = ?, cantidad_entregada = ?, correlativo_inicial = ?, correlativo_final = ?
                             WHERE id = ?"
                        )->execute([
                            $resultado['precio_unitario'], $cantidad,
                            $resultado['correlativo_inicial'], $resultado['correlativo_final'], $idDetalle,
                        ]);

                        // ── TIPO 2: EXPIRACIÓN ──────────────────────────────────────────
                    } elseif ($idTipo === 2) {
                        $cantidad  = (float)$r->cantidad;
                        $resultado = $this->trasladoHelper->consumirYCrearDestinoExpiracion(
                            (int)$r->id_lote_expiracion, $cantidad, $idBodegaDestino, $idUnidad, $this->idUsuario, $idTraslado
                        );

                        $this->stockHelper->descontarPorEntrega($idBodegaOrigen, $idProducto, $idUnidad, $cantidad, $cantidad);
                        $this->stockHelper->incrementarPorAlta($idBodegaDestino, $idProducto, $idUnidad, $cantidad);

                        $this->movimientoHelper->registrarBajaTraslado(
                            $idBodegaOrigen, $idProducto, $idUnidad, $cantidad, $idDetalle,
                            null, null, $resultado['precio_unitario']
                        );
                        $this->movimientoHelper->registrarAltaTraslado(
                            $idBodegaDestino, $idProducto, $idUnidad, $cantidad,
                            'lotes_expiracion', $resultado['id_lote_destino'],
                            null, null, $resultado['precio_unitario']
                        );

                        $this->trasladoHelper->insertarDetalleLote(
                            $idDetalle, $cantidad,
                            null, (int)$r->id_lote_expiracion, null,
                            null, $resultado['id_lote_destino'], null
                        );

                        $this->connect->prepare(
                            "UPDATE bodega_inventario.traslados_detalle
                             SET precio_unitario = ?, cantidad_entregada = ? WHERE id = ?"
                        )->execute([$resultado['precio_unitario'], $cantidad, $idDetalle]);

                        // ── TIPO 3: NORMAL (FIFO, posiblemente multi-lote) ──────────────
                    } else {
                        $cantidad = (float)$r->cantidad;
                        $consumos = $this->trasladoHelper->consumirYCrearDestinoNormal(
                            $idBodegaOrigen, $idProducto, $idUnidad, $cantidad, $idBodegaDestino, $this->idUsuario, $idTraslado
                        );

                        $totalConsumido = 0.0;
                        $primerPrecio   = null;

                        // Cada lote consumido genera su propio par de movimientos y su propia
                        // fila de trazabilidad, porque puede venir de lotes con precios distintos
                        foreach ($consumos as $c) {
                            $this->movimientoHelper->registrarBajaTraslado(
                                $idBodegaOrigen, $idProducto, $idUnidad, $c['cantidad'], $idDetalle,
                                null, null, $c['precio_unitario']
                            );
                            $this->movimientoHelper->registrarAltaTraslado(
                                $idBodegaDestino, $idProducto, $idUnidad, $c['cantidad'],
                                'lotes_normal', $c['id_lote_destino'],
                                null, null, $c['precio_unitario']
                            );

                            $this->trasladoHelper->insertarDetalleLote(
                                $idDetalle, $c['cantidad'],
                                null, null, $c['id_lote_origen'],
                                null, null, $c['id_lote_destino']
                            );

                            $totalConsumido += $c['cantidad'];
                            if ($primerPrecio === null) {
                                $primerPrecio = $c['precio_unitario'];
                            }
                        }

                        $this->stockHelper->descontarPorEntrega($idBodegaOrigen, $idProducto, $idUnidad, $totalConsumido, $totalConsumido);
                        $this->stockHelper->incrementarPorAlta($idBodegaDestino, $idProducto, $idUnidad, $totalConsumido);

                        $this->connect->prepare(
                            "UPDATE bodega_inventario.traslados_detalle
                             SET precio_unitario = ?, cantidad_entregada = ? WHERE id = ?"
                        )->execute([$primerPrecio, $totalConsumido, $idDetalle]);
                    }
                }

                // 6. Cerrar el traslado como Ingresado (4)
                $this->connect->prepare(
                    "UPDATE bodega_inventario.traslados SET id_estado = 4, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                )->execute([$idTraslado]);

                $this->connect->commit();

                return $this->res->ok('La recepción ha sido confirmada; el traslado quedó Ingresado y los inventarios físicos fueron actualizados');

            } catch (Exception $eInterno) {
                if ($this->connect->inTransaction()) {
                    $this->connect->rollBack();
                }
                return $this->res->fail($eInterno->getMessage());
            }

        } catch (Exception $e) {
            error_log("Error en confirmarRecepcionTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al intentar confirmar la recepción del traslado', $e);
        }
    }

    /**
     * Utilitario privado: libera la reserva agregada de stock y, si aplica,
     * la reserva del lote específico, de todos los renglones de un traslado.
     * Usado por cancelarTraslado y rechazarTraslado.
     */
    private function _liberarReservasTraslado(int $idTraslado, int $idBodegaOrigen): void
    {
        $stmtDet = $this->connect->prepare(
            "SELECT id_producto, id_unidad, cantidad, id_lote_correlativo, id_lote_expiracion
             FROM bodega_inventario.traslados_detalle WHERE id_traslado = ?"
        );
        $stmtDet->execute([$idTraslado]);
        $renglones = $stmtDet->fetchAll(PDO::FETCH_OBJ);

        foreach ($renglones as $r) {
            if ($r->id_lote_correlativo !== null) {
                $this->trasladoHelper->liberarLoteCorrelativo((int)$r->id_lote_correlativo, (int)$r->cantidad);
            } elseif ($r->id_lote_expiracion !== null) {
                $this->trasladoHelper->liberarLoteExpiracion((int)$r->id_lote_expiracion, (float)$r->cantidad);
            }

            $this->stockHelper->liberarReserva($idBodegaOrigen, (int)$r->id_producto, (int)$r->id_unidad, (float)$r->cantidad);
        }
    }

    /**
     * Bandeja del encargado ORIGEN: sus traslados enviados, con filtros de
     * búsqueda/estado y paginación.
     *
     * POST: bodega_inventario/listarTrasladosOrigen
     *
     * @param object $datos { contexto: string (area|agencia), busqueda: ?string, estado: ?int, pagina: ?int, por_pagina: ?int }
     */
    public function listarTrasladosOrigen($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $datos    = $this->limpiarDatos($datos);
            $contexto = trim($datos->contexto ?? '');

            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            $idBodegaOrigen = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodegaOrigen || $idBodegaOrigen < 1) {
                return $this->res->fail('No tienes una bodega asignada para el contexto indicado');
            }

            return $this->_listarTrasladosPorFiltro($datos, 'a.id_bodega_origen = ?', [$idBodegaOrigen], 'origen');

        } catch (Exception $e) {
            error_log("Error en listarTrasladosOrigen: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar los traslados enviados', $e);
        }
    }

    /**
     * Bandeja del encargado DESTINO: traslados dirigidos a su bodega, con foco
     * en los que están Aprobado (2) esperando confirmación de recepción.
     *
     * POST: bodega_inventario/listarTrasladosDestino
     *
     * @param object $datos { contexto: string (area|agencia), busqueda: ?string, estado: ?int, pagina: ?int, por_pagina: ?int }
     */
    public function listarTrasladosDestino($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $datos    = $this->limpiarDatos($datos);
            $contexto = trim($datos->contexto ?? '');

            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El campo contexto es requerido (area | agencia)');
            }

            $idBodegaDestino = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            if (!$idBodegaDestino || $idBodegaDestino < 1) {
                return $this->res->fail('No tienes una bodega asignada para el contexto indicado');
            }

            return $this->_listarTrasladosPorFiltro($datos, 'a.id_bodega_destino = ?', [$idBodegaDestino], 'destino');

        } catch (Exception $e) {
            error_log("Error en listarTrasladosDestino: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar los traslados por recibir', $e);
        }
    }

    /**
     * Bandeja del Administrador de Bodegas: todos los traslados del sistema,
     * con foco en los Pendientes (1) de aprobación.
     *
     * GET: bodega_inventario/listarTrasladosAdmin
     */
    public function listarTrasladosAdmin(): array
    {
        try {
            $datos = (object)[
                'busqueda'   => $_GET['busqueda'] ?? '',
                'estado'     => $_GET['estado'] ?? null,
                'pagina'     => $_GET['pagina'] ?? 1,
                'por_pagina' => $_GET['por_pagina'] ?? 20,
            ];

            return $this->_listarTrasladosPorFiltro($datos, '1=1', [], 'admin');

        } catch (Exception $e) {
            error_log("Error en listarTrasladosAdmin: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar el listado global de traslados', $e);
        }
    }

    /**
     * Núcleo compartido de listado de traslados (origen / destino / admin).
     * Aísla los joins y el paginado para no triplicar la consulta.
     */
    private function _listarTrasladosPorFiltro(object $datos, string $whereBase, array $paramsBase, string $vista): array
    {
        $busqueda  = trim($datos->busqueda ?? '');
        $estado    = isset($datos->estado) && $datos->estado !== '' && $datos->estado !== null ? (int)$datos->estado : null;
        $pagina    = max(1, (int)($datos->pagina ?? 1));
        $porPagina = min(50, max(1, (int)($datos->por_pagina ?? 20)));
        $offset    = ($pagina - 1) * $porPagina;

        $params     = $paramsBase;
        $whereExtra = '';

        if ($estado !== null) {
            $whereExtra .= ' AND a.id_estado = ?';
            $params[] = $estado;
        }

        if ($busqueda !== '') {
            $whereExtra .= ' AND (bo.nombre LIKE ? OR bd.nombre LIKE ? OR p.nombre LIKE ?)';
            $params[] = "%{$busqueda}%";
            $params[] = "%{$busqueda}%";
            $params[] = "%{$busqueda}%";
        }

        $sqlBase = "FROM bodega_inventario.traslados a
        INNER JOIN bodega_inventario.bodegas bo ON bo.id = a.id_bodega_origen
        INNER JOIN bodega_inventario.bodegas bd ON bd.id = a.id_bodega_destino
        INNER JOIN bodega_inventario.estados_traslado et ON et.id = a.id_estado
        INNER JOIN bodega_inventario.traslados_detalle td ON td.id_traslado = a.id
        INNER JOIN bodega_inventario.productos p ON p.id = td.id_producto
        WHERE {$whereBase} {$whereExtra}";

        $sqlCount = "SELECT COUNT(DISTINCT a.id) AS total_registros {$sqlBase}";
        $stmtCount = $this->connect->prepare($sqlCount);
        $stmtCount->execute($params);
        $total = (int)($stmtCount->fetch(PDO::FETCH_OBJ)->total_registros ?? 0);

        if ($total === 0) {
            return $this->res->info('No se encontraron traslados que coincidan con los filtros aplicados');
        }

        $sqlData = "SELECT
            a.id, a.id_bodega_origen, bo.nombre AS bodega_origen,
            a.id_bodega_destino, bd.nombre AS bodega_destino,
            a.id_estado, et.nombre AS estado,
            a.id_usuario_encargado, a.id_usuario_admin, a.comentario_admin, a.fecha_gestion,
            a.created_at, a.updated_at,
            (SELECT p2.nombre FROM bodega_inventario.traslados_detalle td2
             INNER JOIN bodega_inventario.productos p2 ON p2.id = td2.id_producto
             WHERE td2.id_traslado = a.id LIMIT 1) AS primer_producto,
            (SELECT COUNT(*) FROM bodega_inventario.traslados_detalle td3 WHERE td3.id_traslado = a.id) AS total_renglones
        {$sqlBase}
        GROUP BY a.id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT {$porPagina} OFFSET {$offset}";

        $stmtData = $this->connect->prepare($sqlData);
        $stmtData->execute($params);
        $traslados = $stmtData->fetchAll(PDO::FETCH_OBJ);

        foreach ($traslados as $t) {
            $t->id                = (int)$t->id;
            $t->id_bodega_origen  = (int)$t->id_bodega_origen;
            $t->id_bodega_destino = (int)$t->id_bodega_destino;
            $t->id_estado         = (int)$t->id_estado;
            $t->total_renglones   = (int)$t->total_renglones;
        }

        return $this->res->ok('Listado de traslados obtenido correctamente', [
            'traslados'  => $traslados,
            'total'      => $total,
            'pagina'     => $pagina,
            'por_pagina' => $porPagina,
            'paginas'    => (int)ceil($total / $porPagina),
            'vista'      => $vista,
        ]);
    }

    /**
     * Detalle técnico completo de un traslado: cabecera, renglones y trazabilidad
     * de lotes origen/destino. Acceso restringido al encargado origen, al
     * encargado destino o al Administrador.
     *
     * GET: bodega_inventario/obtenerDetalleTraslado
     */
    public function obtenerDetalleTraslado(): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $id = (int)($_GET['id'] ?? 0);
            if ($id < 1) {
                return $this->res->fail('El parámetro id es requerido y debe ser un entero positivo');
            }

            $sqlCab = "SELECT
                    a.id, a.id_bodega_origen, bo.nombre AS bodega_origen,
                    a.id_bodega_destino, bd.nombre AS bodega_destino,
                    a.id_estado, et.nombre AS estado,
                    a.id_usuario_encargado AS id_en, dp_enc.nombres AS id_usuario_encargado,
                    a.id_usuario_admin AS id_ad, dp_adm.nombres AS id_usuario_admin,
                    a.comentario_admin, a.fecha_gestion,
                    a.created_at, a.updated_at
                FROM bodega_inventario.traslados a
                INNER JOIN bodega_inventario.bodegas bo ON bo.id = a.id_bodega_origen
                INNER JOIN bodega_inventario.bodegas bd ON bd.id = a.id_bodega_destino
                INNER JOIN bodega_inventario.estados_traslado et ON et.id = a.id_estado
                LEFT JOIN dbintranet.usuarios u_enc ON u_enc.idUsuarios = a.id_usuario_encargado
                LEFT JOIN dbintranet.datospersonales dp_enc ON dp_enc.idDatosPersonales = u_enc.idDatosPersonales
                LEFT JOIN dbintranet.usuarios u_adm ON u_adm.idUsuarios = a.id_usuario_admin
                LEFT JOIN dbintranet.datospersonales dp_adm ON dp_adm.idDatosPersonales = u_adm.idDatosPersonales
                WHERE a.id = ? LIMIT 1";

            $stmtCab = $this->connect->prepare($sqlCab);
            $stmtCab->execute([$id]);
            $cabecera = $stmtCab->fetch(PDO::FETCH_OBJ);

            if (!$cabecera) {
                return $this->res->fail('El traslado especificado no existe en el sistema');
            }

            $esEncargadoBodega = in_array(
                (int)$this->bodegaHelper->obtenerBodegaEncargado(),
                [(int)$cabecera->id_bodega_origen, (int)$cabecera->id_bodega_destino],
                true
            );
            $esGestorAdmin = $cabecera->id_usuario_encargado === $this->idUsuario || $this->idUsuario !== null;
            // Nota: si el rol de Administrador se valida por middleware/ruta separada,
            // basta con dejar $esEncargadoBodega como control de acceso aquí.
            if (!$esEncargadoBodega) {
                return $this->res->fail('Acceso denegado: No cuenta con permisos para auditar este traslado');
            }

            $sqlDet = "SELECT
                td.id, td.id_producto, p.nombre AS producto, p.id_tipo AS id_tipo_producto, tp.nombre AS tipo_producto,
                td.id_unidad, um.nombre AS unidad, um.abreviatura AS abreviatura_unidad,
                td.cantidad, td.cantidad_entregada, td.precio_unitario,
                td.id_lote_correlativo, td.id_lote_expiracion,
                td.correlativo_inicial, td.correlativo_final,
                lc_origen.serie AS lote_origen_serie,
                lc_origen.resolucion AS lote_origen_resolucion,
                lc_origen.correlativo_inicial AS lote_origen_correlativo_inicial,
                lc_origen.correlativo_final AS lote_origen_correlativo_final,
                lc_origen.precio_unitario AS lote_origen_precio_correlativo,
                le_origen.fecha_expiracion AS lote_origen_fecha_expiracion,
                le_origen.precio_unitario AS lote_origen_precio_expiracion
            FROM bodega_inventario.traslados_detalle td
            INNER JOIN bodega_inventario.productos p ON p.id = td.id_producto
            INNER JOIN bodega_inventario.tipos_producto tp ON tp.id = p.id_tipo
            INNER JOIN bodega_inventario.unidades_medida um ON um.id = td.id_unidad
            LEFT JOIN bodega_inventario.lotes_correlativo lc_origen ON lc_origen.id = td.id_lote_correlativo
            LEFT JOIN bodega_inventario.lotes_expiracion le_origen ON le_origen.id = td.id_lote_expiracion
            WHERE td.id_traslado = ?
            ORDER BY td.id ASC";

            $stmtDet = $this->connect->prepare($sqlDet);
            $stmtDet->execute([$id]);
            $renglones = $stmtDet->fetchAll(PDO::FETCH_OBJ);

            $sqlLotes = "SELECT
                tdl.id_traslado_detalle, tdl.cantidad,
                tdl.id_lote_corr_origen, tdl.id_lote_exp_origen, tdl.id_lote_normal_origen,
                tdl.id_lote_corr_destino, tdl.id_lote_exp_destino, tdl.id_lote_normal_destino
            FROM bodega_inventario.traslados_detalle_lotes tdl
            WHERE tdl.id_traslado_detalle IN (
                SELECT id FROM bodega_inventario.traslados_detalle WHERE id_traslado = ?
            )
            ORDER BY tdl.id ASC";

            $stmtLotes = $this->connect->prepare($sqlLotes);
            $stmtLotes->execute([$id]);
            $lotesUsados = $stmtLotes->fetchAll(PDO::FETCH_OBJ);

            $cabecera->id                = (int)$cabecera->id;
            $cabecera->id_bodega_origen  = (int)$cabecera->id_bodega_origen;
            $cabecera->id_bodega_destino = (int)$cabecera->id_bodega_destino;
            $cabecera->id_estado         = (int)$cabecera->id_estado;

            foreach ($renglones as $r) {
                $r->id                  = (int)$r->id;
                $r->id_producto         = (int)$r->id_producto;
                $r->id_tipo_producto    = (int)$r->id_tipo_producto;
                $r->id_unidad           = (int)$r->id_unidad;
                $r->cantidad            = (float)$r->cantidad;
                $r->cantidad_entregada  = $r->cantidad_entregada !== null ? (float)$r->cantidad_entregada : null;
                $r->precio_unitario     = $r->precio_unitario !== null ? (float)$r->precio_unitario : null;
                $r->correlativo_inicial = $r->correlativo_inicial !== null ? (int)$r->correlativo_inicial : null;
                $r->correlativo_final   = $r->correlativo_final !== null ? (int)$r->correlativo_final : null;

                // Datos del lote ORIGEN (visibles desde que se crea el traslado, sin esperar la confirmación)
                $r->lote_origen_correlativo_inicial = $r->lote_origen_correlativo_inicial !== null ? (int)$r->lote_origen_correlativo_inicial : null;
                $r->lote_origen_correlativo_final    = $r->lote_origen_correlativo_final   !== null ? (int)$r->lote_origen_correlativo_final   : null;
                $r->lote_origen_precio_correlativo   = $r->lote_origen_precio_correlativo  !== null ? (float)$r->lote_origen_precio_correlativo : null;
                $r->lote_origen_precio_expiracion    = $r->lote_origen_precio_expiracion   !== null ? (float)$r->lote_origen_precio_expiracion  : null;
            }

            return $this->res->ok('Estructura técnica del traslado recuperada correctamente', [
                'cabecera'     => $cabecera,
                'renglones'    => $renglones,
                'lotes_usados' => $lotesUsados,
            ]);

        } catch (Exception $e) {
            error_log("Error en obtenerDetalleTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar la auditoría del traslado', $e);
        }
    }

    /**
     * Catálogo de bodegas activas disponibles como destino de un traslado,
     * excluyendo la propia bodega origen del encargado en sesión.
     *
     * GET: bodega_inventario/listarBodegasDestinoTraslado?contexto=area|agencia
     */
    public function listarBodegasDestinoTraslado(): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $contexto = trim($_GET['contexto'] ?? '');
            if (!in_array($contexto, ['area', 'agencia'], true)) {
                return $this->res->fail('El parámetro contexto es requerido (area | agencia)');
            }

            $idBodegaOrigen = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);

            $sqlBodegas = "SELECT id, nombre, id_tipo
                FROM bodega_inventario.bodegas
                WHERE activo = 1 AND id != ?
                ORDER BY nombre ASC";

            $stmt = $this->connect->prepare($sqlBodegas);
            $stmt->execute([$idBodegaOrigen]);
            $bodegas = $stmt->fetchAll(PDO::FETCH_OBJ);

            if (empty($bodegas)) {
                return $this->res->info('No se encontraron bodegas disponibles como destino');
            }

            foreach ($bodegas as $b) {
                $b->id      = (int)$b->id;
                $b->id_tipo = (int)$b->id_tipo;
            }

            return $this->res->ok('Catálogo de bodegas destino obtenido correctamente', ['bodegas' => $bodegas]);

        } catch (Exception $e) {
            error_log("Error en listarBodegasDestinoTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar el catálogo de bodegas destino', $e);
        }
    }

    /**
     * Para productos tipo Correlativo o Expiración: lista los lotes con
     * disponibilidad LIBRE (cantidad_disponible - cantidad_reservada) en la
     * bodega origen del encargado, para que elija cuál enviar en el traslado.
     * Para productos tipo Normal, informa que no aplica selección manual (FIFO).
     *
     * POST: bodega_inventario/listarLotesOrigenParaTraslado
     *
     * @param object $datos { contexto: string (area|agencia), id_producto: int }
     */
    public function listarLotesOrigenParaTraslado($datos): array
    {
        try {
            $this->_inicializarBodegaHelper();

            $datos      = $this->limpiarDatos($datos);
            $contexto   = trim($datos->contexto ?? '');
            $idProducto = (int)($datos->id_producto ?? 0);

            if (!in_array($contexto, ['area', 'agencia'], true) || $idProducto < 1) {
                return $this->res->fail('Se requiere el contexto (area | agencia) y el id_producto');
            }

            $idBodegaOrigen = (int)$this->bodegaHelper->obtenerBodegaPorContexto($contexto);
            if (!$idBodegaOrigen || $idBodegaOrigen < 1) {
                return $this->res->fail('No tienes una bodega asignada para el contexto indicado');
            }

            $stmtTipo = $this->connect->prepare("SELECT id_tipo FROM bodega_inventario.productos WHERE id = ? LIMIT 1");
            $stmtTipo->execute([$idProducto]);
            $idTipo = (int)$stmtTipo->fetchColumn();

            if ($idTipo === 1) {
                $sql = "SELECT id, serie, resolucion, fecha_resolucion,
                    correlativo_inicial, correlativo_final, correlativo_siguiente,
                    cantidad_disponible, cantidad_reservada,
                    (cantidad_disponible - cantidad_reservada) AS cantidad_libre,
                    precio_unitario
                FROM bodega_inventario.lotes_correlativo
                WHERE id_bodega = ? AND id_producto = ? AND (cantidad_disponible - cantidad_reservada) > 0
                ORDER BY correlativo_inicial ASC";

                $stmt = $this->connect->prepare($sql);
                $stmt->execute([$idBodegaOrigen, $idProducto]);
                $lotes = $stmt->fetchAll(PDO::FETCH_OBJ);

                foreach ($lotes as $l) {
                    $l->id                   = (int)$l->id;
                    $l->correlativo_inicial  = (int)$l->correlativo_inicial;
                    $l->correlativo_final    = (int)$l->correlativo_final;
                    $l->correlativo_siguiente = (int)$l->correlativo_siguiente;
                    $l->cantidad_disponible  = (int)$l->cantidad_disponible;
                    $l->cantidad_reservada   = (int)$l->cantidad_reservada;
                    $l->cantidad_libre       = (int)$l->cantidad_libre;
                    $l->precio_unitario      = $l->precio_unitario !== null ? (float)$l->precio_unitario : null;
                }

                return $this->res->ok('Lotes correlativos con disponibilidad libre obtenidos correctamente', [
                    'tipo' => 1, 'lotes' => $lotes,
                ]);
            }

            if ($idTipo === 2) {
                $sql = "SELECT id, id_unidad, fecha_expiracion,
                    cantidad_disponible, cantidad_reservada,
                    (cantidad_disponible - cantidad_reservada) AS cantidad_libre,
                    precio_unitario
                FROM bodega_inventario.lotes_expiracion
                WHERE id_bodega = ? AND id_producto = ? AND (cantidad_disponible - cantidad_reservada) > 0
                ORDER BY fecha_expiracion ASC";

                $stmt = $this->connect->prepare($sql);
                $stmt->execute([$idBodegaOrigen, $idProducto]);
                $lotes = $stmt->fetchAll(PDO::FETCH_OBJ);

                foreach ($lotes as $l) {
                    $l->id                  = (int)$l->id;
                    $l->id_unidad           = (int)$l->id_unidad;
                    $l->cantidad_disponible = (float)$l->cantidad_disponible;
                    $l->cantidad_reservada  = (float)$l->cantidad_reservada;
                    $l->cantidad_libre      = (float)$l->cantidad_libre;
                    $l->precio_unitario     = $l->precio_unitario !== null ? (float)$l->precio_unitario : null;
                }

                return $this->res->ok('Lotes de expiración con disponibilidad libre obtenidos correctamente', [
                    'tipo' => 2, 'lotes' => $lotes,
                ]);
            }

            // Tipo 3 (Normal): no aplica selección manual de lote
            return $this->res->info('Este producto es de flujo Normal (FIFO): no requiere seleccionar un lote específico, se resuelve automáticamente al confirmar la recepción');

        } catch (Exception $e) {
            error_log("Error en listarLotesOrigenParaTraslado: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar los lotes disponibles', $e);
        }
    }

    // =========================================================================
    // INICIALIZADOR LAZY — TrasladoHelper
    // =========================================================================

    private function _inicializarTrasladoHelper(): void
    {
        if ($this->trasladoHelper !== null) {
            return;
        }

        $this->_inicializarMovimientoHelper();
        $this->_inicializarStockHelper();

        $this->trasladoHelper = new TrasladoHelper(
            $this->connect,
            $this->idUsuario,
            $this->movimientoHelper,
            $this->stockHelper
        );
    }

    // =========================================================================
    // COMPRAS — INICIALIZADORES
    // =========================================================================

    private function _inicializarCompras(): void
    {
        if ($this->compraService !== null) return;
        $this->_inicializarBodegaHelper();

        $this->compraRepo                  = new CompraRepository($this->connect);
        $this->compraService               = new CompraService($this->compraRepo);
        $this->compraAgenciaService        = new CompraAgenciaService($this->connect, $this->compraRepo, $this->compraService, $this->bodegaHelper);
        $this->compraAreaService           = new CompraAreaService($this->connect, $this->compraRepo, $this->compraService, $this->bodegaHelper);
        $this->compraTrimestralService     = new CompraTrimestralService($this->connect, $this->compraService);
        $this->compraExtraordinariaService = new CompraExtraordinariaService($this->connect, $this->compraRepo, $this->compraService);
    }

    // =========================================================================
    // FLUJO 1 — COMPRAS AGENCIA
    // =========================================================================

    /** POST: bodega_inventario/crearSolicitudCompraAgencia */
    public function crearSolicitudCompraAgencia($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $datos    = $this->limpiarDatos($datos);
            $idBodega = (int)($datos->id_bodega ?? 0);
            $lineas   = $this->normalizarLineasCompra($datos->lineas ?? []);

            if ($idBodega < 1 || empty($lineas)) {
                return $this->res->fail('Campos requeridos: id_bodega y al menos una línea de producto son mandatorios');
            }

            $this->connect->beginTransaction();
            $idCompra = $this->compraAgenciaService->crearSolicitud($idBodega, $this->idUsuario, $this->idAgencia, $lineas);
            $this->connect->commit();

            return $this->res->ok('La solicitud de compra fue registrada correctamente y quedó pendiente de aprobación', ['id_compra' => $idCompra]);
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en crearSolicitudCompraAgencia: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al registrar la solicitud de compra', $e);
        }
    }

    /** POST: bodega_inventario/gestionarSolicitudCompraAgencia */
    public function gestionarSolicitudCompraAgencia($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $datos      = $this->limpiarDatos($datos);
            $idCompra   = (int)($datos->id_compra ?? 0);
            $aprueba    = filter_var($datos->aprueba ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            $comentario = trim($datos->comentario ?? '');
            $lineas     = $datos->lineas_ajuste ?? [];

            if ($idCompra < 1 || $aprueba === null) {
                return $this->res->fail('Campos requeridos: id_compra y aprueba (true|false) son mandatorios');
            }
            if ($comentario === '' && !$aprueba) {
                return $this->res->fail('El comentario es obligatorio al rechazar la solicitud');
            }

            $this->connect->beginTransaction();
            $this->compraAgenciaService->gestionarSolicitud($idCompra, $aprueba, $this->idUsuario, $this->puesto, $comentario, $lineas);
            $this->connect->commit();

            return $this->res->ok('La solicitud fue gestionada correctamente', ['id_compra' => $idCompra]);
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en gestionarSolicitudCompraAgencia: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al gestionar la solicitud', $e);
        }
    }

    /** GET: bodega_inventario/listarBandejaCompraAgencia */
    public function listarBandejaCompraAgencia(): array
    {
        try {
            $this->_inicializarCompras();
            $resultado = $this->compraAgenciaService->listarBandejaAdmin(
                trim($_GET['busqueda'] ?? ''),
                !empty($_GET['id_estado']) ? (int)$_GET['id_estado'] : null,
                (int)($_GET['pagina'] ?? 1),
                (int)($_GET['por_pagina'] ?? 20)
            );
            return $this->res->ok('Listado obtenido correctamente', $resultado);
        } catch (Exception $e) {
            error_log("Error en listarBandejaCompraAgencia: " . $e->getMessage());
            return $this->res->fail('Error interno al recuperar el listado', $e);
        }
    }

    // =========================================================================
    // FLUJO 2 — COMPRAS ÁREA
    // =========================================================================

    /** GET: bodega_inventario/listarAreasDisponiblesCompra */
    public function listarAreasDisponiblesCompra(): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }
            $areas = $this->compraAreaService->listarAreasDisponibles($this->puesto, $this->idAgencia);
            return $this->res->ok('Áreas disponibles obtenidas correctamente', ['areas' => $areas]);
        } catch (Exception $e) {
            error_log("Error en listarAreasDisponiblesCompra: " . $e->getMessage());
            return $this->res->fail('Error interno al recuperar las áreas disponibles', $e);
        }
    }

    /** GET: bodega_inventario/listarProductosPermitidosArea?id_bodega= */
    public function listarProductosPermitidosArea(): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $idBodega = (int)($_GET['id_bodega'] ?? 0);
            if ($idBodega < 1) {
                return $this->res->fail('El campo id_bodega es requerido');
            }

            $resultado = $this->compraAreaService->productosPermitidosParaSolicitud($idBodega, $this->puesto, $this->idAgencia);
            return $this->res->ok('Catálogo de productos obtenido correctamente', $resultado);
        } catch (Exception $e) {
            error_log("Error en listarProductosPermitidosArea: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error interno al obtener el catálogo de productos permitidos', $e);
        }
    }

    /** POST: bodega_inventario/crearSolicitudCompraArea */
    public function crearSolicitudCompraArea($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $datos    = $this->limpiarDatos($datos);
            $idBodega = (int)($datos->id_bodega ?? 0);
            $lineas   = $this->normalizarLineasCompra($datos->lineas ?? []);

            if ($idBodega < 1 || empty($lineas)) {
                return $this->res->fail('Campos requeridos: id_bodega y al menos una línea de producto son mandatorios');
            }

            $this->connect->beginTransaction();
            $idCompra = $this->compraAreaService->crearSolicitud($idBodega, $this->idUsuario, $this->puesto, $this->idAgencia, $lineas);
            $this->connect->commit();

            return $this->res->ok('La solicitud de compra fue registrada correctamente y quedó pendiente de aprobación', ['id_compra' => $idCompra]);
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en crearSolicitudCompraArea: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al registrar la solicitud de compra', $e);
        }
    }

    /** POST: bodega_inventario/gestionarSolicitudCompraArea */
    public function gestionarSolicitudCompraArea($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $datos      = $this->limpiarDatos($datos);
            $idCompra   = (int)($datos->id_compra ?? 0);
            $aprueba    = filter_var($datos->aprueba ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            $comentario = trim($datos->comentario ?? '');
            $lineas     = $datos->lineas_ajuste ?? [];

            if ($idCompra < 1 || $aprueba === null) {
                return $this->res->fail('Campos requeridos: id_compra y aprueba (true|false) son mandatorios');
            }
            if ($comentario === '' && !$aprueba) {
                return $this->res->fail('El comentario es obligatorio al rechazar la solicitud');
            }

            $this->connect->beginTransaction();
            $this->compraAreaService->gestionarSolicitud($idCompra, $aprueba, $this->idUsuario, $comentario, $lineas);
            $this->connect->commit();

            return $this->res->ok('La solicitud fue gestionada correctamente', ['id_compra' => $idCompra]);
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en gestionarSolicitudCompraArea: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al gestionar la solicitud', $e);
        }
    }

    /** GET: bodega_inventario/listarBandejaCompraArea */
    public function listarBandejaCompraArea(): array
    {
        try {
            $this->_inicializarCompras();

            $idBodega = $this->bodegaHelper->obtenerBodegaDelEncargado();
            if (!$idBodega) {
                return $this->res->fail('No tiene una bodega de área asignada como encargado');
            }

            $resultado = $this->compraAreaService->listarBandejaArea(
                $idBodega,
                trim($_GET['busqueda'] ?? ''),
                !empty($_GET['id_estado']) ? (int)$_GET['id_estado'] : null,
                (int)($_GET['pagina'] ?? 1),
                (int)($_GET['por_pagina'] ?? 20)
            );
            return $this->res->ok('Listado obtenido correctamente', $resultado);
        } catch (Exception $e) {
            error_log("Error en listarBandejaCompraArea: " . $e->getMessage());
            return $this->res->fail('Error interno al recuperar el listado', $e);
        }
    }

    // =========================================================================
    // MESA DE TRABAJO — COMÚN A LOS 4 FLUJOS
    // =========================================================================

    /**
     * Guardado en lote: ajustes de cantidad + precios + auto-envío, en una
     * sola transacción.
     * POST: bodega_inventario/procesarCompra
     * Body: { id_compra, lineas: [{ id_linea, cantidad_ajustada?, precio_unitario? }] }
     */
    public function procesarCompra($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $datos    = $this->limpiarDatos($datos);
            $idCompra = (int)($datos->id_compra ?? 0);
            $lineas   = $datos->lineas ?? [];

            if ($idCompra < 1) {
                return $this->res->fail('El campo id_compra es requerido');
            }
            if (empty($lineas) || !is_array($lineas)) {
                return $this->res->fail('Debe indicar al menos una línea con cambios (cantidad_ajustada y/o precio_unitario)');
            }

            $this->connect->beginTransaction();
            $resultado = $this->compraService->procesarLineas($idCompra, (array)$lineas, $this->idUsuario);
            $this->connect->commit();

            if ($resultado['requiere_autorizacion']) {
                $mensaje = 'Cantidades guardadas. La compra pasó a "Requiere Autorización" por un alza: los precios se podrán fijar cuando Gerencia/Financiero la autorice.';
            } elseif ($resultado['altas_generadas']) {
                $mensaje = 'Compra completada: se generaron ' . count($resultado['ids_altas']) . ' alta(s) automáticamente. El encargado de bodega ya puede recibir el ingreso físico.';
            } else {
                $mensaje = "Cambios guardados: {$resultado['lineas_ajustadas']} ajuste(s) de cantidad y {$resultado['lineas_compradas']} línea(s) compradas.";
            }

            return $this->res->ok($mensaje, $resultado);
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en procesarCompra: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al procesar la compra', $e);
        }
    }

    /** POST: bodega_inventario/autorizarCompra */
    public function autorizarCompra($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $datos      = $this->limpiarDatos($datos);
            $idCompra   = (int)($datos->id_compra ?? 0);
            $autoriza   = filter_var($datos->autoriza ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            $comentario = trim($datos->comentario ?? '');

            if ($idCompra < 1 || $autoriza === null) {
                return $this->res->fail('Campos requeridos: id_compra y autoriza (true|false) son mandatorios');
            }
            if ($comentario === '') {
                return $this->res->fail('El comentario es obligatorio para autorizar o rechazar la compra');
            }
            if (!RolCompraHelper::usuarioTieneRol($this->puesto, [RolCompraHelper::PUESTO_GERENCIA_FINANCIERO])) {
                return $this->res->fail('Solo Gerencia/Financiero puede autorizar o rechazar esta compra');
            }

            $this->connect->beginTransaction();
            $this->compraService->autorizar($idCompra, $autoriza, $this->idUsuario, $comentario);
            $this->connect->commit();

            $mensaje = $autoriza
                ? 'La compra fue autorizada y vuelve a estar disponible para continuar la mesa de trabajo'
                : 'La compra fue rechazada por Gerencia/Financiero';

            return $this->res->ok($mensaje);
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en autorizarCompra: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al autorizar la compra', $e);
        }
    }

    /** POST: bodega_inventario/registrarCompra */
    public function registrarCompra($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $idCompra = (int)($this->limpiarDatos($datos)->id_compra ?? 0);
            if ($idCompra < 1) {
                return $this->res->fail('El campo id_compra es requerido');
            }

            $this->connect->beginTransaction();
            $this->compraService->registrar($idCompra);
            $this->connect->commit();

            return $this->res->ok('La compra fue marcada como registrada; el ciclo quedó cerrado');
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en registrarCompra: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al registrar la compra', $e);
        }
    }

    /** POST: bodega_inventario/cancelarCompra */
    public function cancelarCompra($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $idCompra = (int)($this->limpiarDatos($datos)->id_compra ?? 0);
            if ($idCompra < 1) {
                return $this->res->fail('El campo id_compra es requerido');
            }

            $this->connect->beginTransaction();
            $this->compraService->cancelar($idCompra);
            $this->connect->commit();

            return $this->res->ok('La compra fue cancelada correctamente');
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en cancelarCompra: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al cancelar la compra', $e);
        }
    }

    /** POST: bodega_inventario/cancelarSolicitudCompra (mientras siga SOLICITADA) */
    public function cancelarSolicitudCompra($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $idCompra = (int)($this->limpiarDatos($datos)->id_compra ?? 0);
            if ($idCompra < 1) {
                return $this->res->fail('El campo id_compra es requerido');
            }

            $this->connect->beginTransaction();
            $this->compraService->cancelarSolicitud($idCompra, $this->idUsuario);
            $this->connect->commit();

            return $this->res->ok('La solicitud fue cancelada correctamente');
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en cancelarSolicitudCompra: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al cancelar la solicitud de compra', $e);
        }
    }

    // =========================================================================
    // FLUJO 3 — TRIMESTRAL / FLUJO 4 — EXTRAORDINARIA
    // =========================================================================

    /** POST: bodega_inventario/generarComprasTrimestrales */
    public function generarComprasTrimestrales(): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $this->connect->beginTransaction();
            $resultado = $this->compraTrimestralService->generarSugerencias($this->idUsuario, $this->puesto);
            $this->connect->commit();

            if (empty($resultado['ordenes'])) {
                return $this->res->info(
                    'Existencia suficiente para cubrir el próximo trimestre. No se requiere compra.',
                    null,
                    ['lineas_sin_necesidad' => $resultado['lineas_sin_necesidad']]
                );
            }

            return $this->res->ok('Se generaron las compras trimestrales', $resultado);
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en generarComprasTrimestrales: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al generar las compras trimestrales', $e);
        }
    }

    /** POST: bodega_inventario/crearCompraExtraordinaria */
    public function crearCompraExtraordinaria($datos): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $datos    = $this->limpiarDatos($datos);
            $idBodega = (int)($datos->id_bodega ?? 0);
            $lineas   = $this->normalizarLineasCompra($datos->lineas ?? []);

            if ($idBodega < 1 || empty($lineas)) {
                return $this->res->fail('Campos requeridos: id_bodega y al menos una línea de producto son mandatorios');
            }

            $this->connect->beginTransaction();
            $idCompra = $this->compraExtraordinariaService->crearOrden($idBodega, $this->idUsuario, $this->puesto, $lineas);
            $this->connect->commit();

            $mensaje = CompraExtraordinariaService::REQUIERE_AUTORIZACION_GERENCIA
                ? 'La compra extraordinaria fue creada y quedó a la espera de autorización de Gerencia/Financiero'
                : 'La compra extraordinaria fue creada y está lista para la mesa de trabajo';

            return $this->res->ok($mensaje, ['id_compra' => $idCompra]);
        } catch (Exception $e) {
            if ($this->connect->inTransaction()) $this->connect->rollBack();
            error_log("Error en crearCompraExtraordinaria: " . $e->getMessage());
            return $this->res->fail($e->getMessage() ?: 'Error crítico al crear la compra extraordinaria', $e);
        }
    }

    // =========================================================================
    // CONSULTA / BANDEJAS TRANSVERSALES
    // =========================================================================

    /** GET: bodega_inventario/obtenerCompra?id= */
    public function obtenerCompra($datos = []): array
    {
        try {
            $this->_inicializarCompras();
            $idCompra = (int)($this->limpiarDatos($datos)->id ?? 0);

            if ($idCompra < 1) {
                return $this->res->fail('El ID de la compra es requerido y debe ser un entero positivo');
            }

            $stmt = $this->connect->prepare(
                "SELECT c.id, c.id_bodega, b.nombre AS bodega, c.id_tipo_origen,
                        c.id_estado,
                        c.id_usuario_solicitante, COALESCE(dps.nombres, c.id_usuario_solicitante) AS nombre_solicitante,
                        c.id_usuario_gestor, COALESCE(dpg.nombres, c.id_usuario_gestor) AS nombre_gestor,
                        c.comentario_gestor, c.fecha_gestion,
                        c.id_usuario_admin, COALESCE(dpa.nombres, c.id_usuario_admin) AS nombre_admin,
                        c.requiere_autorizacion,
                        c.id_usuario_autorizador, COALESCE(dpz.nombres, c.id_usuario_autorizador) AS nombre_autorizador,
                        c.comentario_autorizacion, c.fecha_autorizacion,
                        c.created_at, c.updated_at
                 FROM bodega_inventario.compras c
                 INNER JOIN bodega_inventario.bodegas b ON b.id = c.id_bodega
                 LEFT JOIN dbintranet.usuarios us ON us.idUsuarios = c.id_usuario_solicitante
                 LEFT JOIN dbintranet.datospersonales dps ON dps.idDatosPersonales = us.idDatosPersonales
                 LEFT JOIN dbintranet.usuarios ug ON ug.idUsuarios = c.id_usuario_gestor
                 LEFT JOIN dbintranet.datospersonales dpg ON dpg.idDatosPersonales = ug.idDatosPersonales
                 LEFT JOIN dbintranet.usuarios ua ON ua.idUsuarios = c.id_usuario_admin
                 LEFT JOIN dbintranet.datospersonales dpa ON dpa.idDatosPersonales = ua.idDatosPersonales
                 LEFT JOIN dbintranet.usuarios uz ON uz.idUsuarios = c.id_usuario_autorizador
                 LEFT JOIN dbintranet.datospersonales dpz ON dpz.idDatosPersonales = uz.idDatosPersonales
                 WHERE c.id = ?"
            );
            $stmt->execute([$idCompra]);
            $compra = $stmt->fetch(PDO::FETCH_OBJ);

            if (!$compra) {
                return $this->res->fail("La compra con ID {$idCompra} no existe");
            }

            $compra->estado = EstadoCompra::from((int)$compra->id_estado)->nombre();
            $compra->lineas = $this->compraRepo->obtenerLineas($idCompra);

            return $this->res->ok('Compra obtenida correctamente', ['compra' => $compra]);
        } catch (Exception $e) {
            error_log("Error en obtenerCompra: " . $e->getMessage());
            return $this->res->fail('Error al obtener la compra', $e);
        }
    }

    /** GET: bodega_inventario/misComprasSolicitadas — historial del usuario en sesión */
    public function misComprasSolicitadas(): array
    {
        try {
            $this->_inicializarCompras();
            if (empty($this->idUsuario)) {
                return $this->res->fail('Acceso denegado: No se localizó una sesión de usuario activa en el servidor');
            }

            $where  = 'c.id_usuario_solicitante = ?';
            $params = [$this->idUsuario];

            if (!empty($_GET['id_estado'])) { $where .= ' AND c.id_estado = ?'; $params[] = (int)$_GET['id_estado']; }
            if (!empty($_GET['tipo_bodega'])) { $where .= ' AND b.id_tipo = ?'; $params[] = (int)$_GET['tipo_bodega']; }
            if (!empty($_GET['id_bodega'])) { $where .= ' AND c.id_bodega = ?'; $params[] = (int)$_GET['id_bodega']; }
            if ($busqueda = trim($_GET['busqueda'] ?? '')) { $where .= ' AND b.nombre LIKE ?'; $params[] = "%{$busqueda}%"; }

            $pagina    = max(1, (int)($_GET['pagina'] ?? 1));
            $porPagina = min(50, max(1, (int)($_GET['por_pagina'] ?? 20)));

            $resultado = $this->compraRepo->listar($where, $params, $pagina, $porPagina);

            $ids       = array_map(static fn($c) => (int)$c->id, $resultado['compras']);
            $lineasPor = $this->compraRepo->obtenerLineasResumenPorCompras($ids);

            foreach ($resultado['compras'] as $c) {
                $c->estado       = EstadoCompra::from((int)$c->id_estado)->nombre();
                $c->lineas       = $lineasPor[(int)$c->id] ?? [];
                $c->total_lineas = count($c->lineas);
            }

            return $this->res->ok('Listado de compras obtenido correctamente', $resultado);
        } catch (Exception $e) {
            error_log("Error en misComprasSolicitadas: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar su historial de compras', $e);
        }
    }

    /**
     * GET: bodega_inventario/listarComprasAutorizacion — bandeja de
     * Gerencia/Financiero (estado REQUIERE_AUTORIZACION), con preview de líneas.
     */
    public function listarComprasAutorizacion(): array
    {
        try {
            $this->_inicializarCompras();

            $pagina    = max(1, (int)($_GET['pagina'] ?? 1));
            $porPagina = min(50, max(1, (int)($_GET['por_pagina'] ?? 20)));

            $resultado = $this->compraRepo->listar(
                'c.id_estado = ' . EstadoCompra::REQUIERE_AUTORIZACION->value,
                [], $pagina, $porPagina
            );

            $ids       = array_map(static fn($c) => (int)$c->id, $resultado['compras']);
            $lineasPor = $this->compraRepo->obtenerLineasResumenPorCompras($ids);

            foreach ($resultado['compras'] as $c) {
                $c->lineas = $lineasPor[(int)$c->id] ?? [];
            }

            return $this->res->ok('Compras pendientes de autorización obtenidas correctamente', $resultado);
        } catch (Exception $e) {
            error_log("Error en listarComprasAutorizacion: " . $e->getMessage());
            return $this->res->fail('Error interno en el servidor al recuperar las compras pendientes de autorización', $e);
        }
    }

    /** Normaliza el payload de líneas del request a arrays asociativos planos. */
    private function normalizarLineasCompra($lineas): array
    {
        if (!is_array($lineas)) return [];

        return array_map(static function ($l) {
            $l = (array)$l;
            return [
                'id_producto'         => (int)($l['id_producto'] ?? 0),
                'id_unidad'           => (int)($l['id_unidad'] ?? 0),
                'cantidad'            => (float)($l['cantidad'] ?? 0),
                'justificacion'       => !empty($l['justificacion']) ? trim((string)$l['justificacion']) : null,
                // Opcionales — solo tienen sentido si el producto es de control Correlativo (id_tipo=1).
                'serie'               => !empty($l['serie']) ? trim((string)$l['serie']) : null,
                'resolucion'          => !empty($l['resolucion']) ? trim((string)$l['resolucion']) : null,
                'fecha_resolucion'    => !empty($l['fecha_resolucion']) ? trim((string)$l['fecha_resolucion']) : null,
                'correlativo_inicial' => !empty($l['correlativo_inicial']) ? (int)$l['correlativo_inicial'] : null,
                'correlativo_final'   => !empty($l['correlativo_final']) ? (int)$l['correlativo_final'] : null,
            ];
        }, $lineas);
    }

}
// FIN DE inventarioApiClass