<?php
/**
 * User Login Endpoint (PHP PDO API)
 * FC: protocols/fc/001b_FC_Auth_Engine_and_RBAC.md (EN_FIRME)
 * Verifies credentials, regenerates session, records in sessions table, issues HTTP-Only Cookie.
 * Apply Note A-B2, A-B5: Rate limiting 5/15m, Secure flag in prod, generic 401.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

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
$email = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
$password = (string)($input['password'] ?? '');
$ipAddress = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

if (!$email || empty($password)) {
    http_response_code(400);
    echo json_encode(['error' => 'Credenciales invalidas']);
    exit;
}

try {
    // Rate Limiting Check (Max 5 attempts in 15 minutes)
    $attemptsStmt = executeQuery(
        "SELECT COUNT(*) AS failed_count FROM login_attempts WHERE (ip_address = :ip OR email = :email) AND attempted_at > NOW() - INTERVAL 15 MINUTE",
        [':ip' => $ipAddress, ':email' => $email]
    );
    $failedAttempts = (int)($attemptsStmt->fetch()['failed_count'] ?? 0);

    if ($failedAttempts >= 5) {
        http_response_code(429);
        echo json_encode(['error' => 'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.']);
        exit;
    }

    // Verify User
    $userStmt = executeQuery(
        "SELECT id, email, password_hash, full_name, role FROM users WHERE email = :email LIMIT 1",
        [':email' => $email]
    );
    $user = $userStmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        // Record failed attempt
        executeQuery(
            "INSERT INTO login_attempts (ip_address, email, attempted_at) VALUES (:ip, :email, NOW())",
            [':ip' => $ipAddress, ':email' => $email]
        );
        http_response_code(401);
        echo json_encode(['error' => 'Credenciales invalidas']);
        exit;
    }

    // Opaque Session Token Generation (256-bit entropy = 64 hex characters)
    $rawToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $rawToken);
    $expiresAt = date('Y-m-d H:i:s', time() + 86400);
    $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

    // Save session in MariaDB
    executeQuery(
        "INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (:user_id, :token_hash, :expires_at, :ip, :ua)",
        [
            ':user_id'    => $user['id'],
            ':token_hash' => $tokenHash,
            ':expires_at' => $expiresAt,
            ':ip'         => $ipAddress,
            ':ua'         => $userAgent,
        ]
    );

    // Set-Cookie header parameters (Apply Note A-B2: Secure in HTTPS prod)
    $isHttps = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    $cookieHeader = sprintf(
        "Set-Cookie: dreamtek_session=%s; Path=/api/; Max-Age=86400; HttpOnly; SameSite=Strict%s",
        $rawToken,
        $isHttps ? '; Secure' : ''
    );
    header($cookieHeader, false);

    http_response_code(200);
    echo json_encode([
        'message' => 'Inicio de sesion exitoso',
        'user' => [
            'id'        => (int)$user['id'],
            'email'     => $user['email'],
            'full_name' => $user['full_name'],
            'role'      => $user['role'],
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno de autenticacion']);
}
