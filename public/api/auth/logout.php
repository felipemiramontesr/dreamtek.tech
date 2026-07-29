<?php
/**
 * User Logout Endpoint (PHP PDO API)
 * FC: protocols/fc/001b_FC_Auth_Engine_and_RBAC.md (EN_FIRME)
 * Deletes server-side session from MariaDB and invalidates HTTP-Only Cookie.
 * Idempotent: Returns 200 OK even if cookie is missing/invalid.
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

$rawToken = $_COOKIE['dreamtek_session'] ?? '';

if (!empty($rawToken)) {
    $tokenHash = hash('sha256', $rawToken);
    try {
        executeQuery("DELETE FROM sessions WHERE token_hash = :hash", [':hash' => $tokenHash]);
    } catch (Throwable $e) {
        // Silently swallow errors to guarantee idempotency
    }
}

// Expire client-side cookie
$isHttps = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
$cookieHeader = sprintf(
    "Set-Cookie: dreamtek_session=; Path=/api/; Max-Age=0; HttpOnly; SameSite=Strict%s",
    $isHttps ? '; Secure' : ''
);
header($cookieHeader, false);

http_response_code(200);
echo json_encode(['message' => 'Sesion cerrada exitosamente']);
