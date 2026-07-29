<?php
/**
 * User Registration Endpoint (PHP PDO API)
 * FC: protocols/fc/001b_FC_Auth_Engine_and_RBAC.md (EN_FIRME)
 * Role: CLIENT strictly. Password minimum 8 characters with BCRYPT cost 12.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// Strict Same-Origin Policy (No CORS *)
if (isset($_SERVER['HTTP_ORIGIN'])) {
    $origin = $_SERVER['HTTP_ORIGIN'];
    $allowedHost = $_SERVER['HTTP_HOST'] ?? '';
    if (strpos($origin, $allowedHost) !== false) {
        header("Access-Control-Allow-Origin: {$origin}");
        header('Access-Control-Allow-Credentials: true');
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once dirname(__DIR__) . '/config/db.php';

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

$email = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
$password = (string)($input['password'] ?? '');
$fullName = trim($input['full_name'] ?? '');
$phone = isset($input['phone']) ? trim((string)$input['phone']) : null;

if (!$email || strlen($password) < 8 || empty($fullName)) {
    http_response_code(400);
    echo json_encode(['error' => 'Email invalido, nombre completo y contrasena de al menos 8 caracteres requeridos.']);
    exit;
}

try {
    // Check if email already exists
    $existing = executeQuery("SELECT id FROM users WHERE email = :email LIMIT 1", [':email' => $email])->fetch();
    if ($existing) {
        http_response_code(409);
        echo json_encode(['error' => 'El correo electronico ya se encuentra registrado.']);
        exit;
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

    executeQuery(
        "INSERT INTO users (email, password_hash, full_name, phone, role, created_at) VALUES (:email, :hash, :name, :phone, 'CLIENT', NOW())",
        [
            ':email' => $email,
            ':hash'  => $passwordHash,
            ':name'  => $fullName,
            ':phone' => $phone,
        ]
    );

    $db = getDbConnection();
    $userId = (int)$db->lastInsertId();

    http_response_code(201);
    echo json_encode([
        'message' => 'Usuario registrado exitosamente',
        'user' => [
            'id'        => $userId,
            'email'     => $email,
            'full_name' => $fullName,
            'role'      => 'CLIENT',
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno al registrar el usuario.']);
}
