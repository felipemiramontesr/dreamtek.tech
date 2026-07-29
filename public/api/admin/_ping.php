<?php
/**
 * Admin Ping Test Endpoint (PHP PDO API Stub)
 * FC: protocols/fc/001b_FC_Auth_Engine_and_RBAC.md (EN_FIRME)
 * Verifies RBAC protection (HTTP 403 Forbidden for CLIENTs, HTTP 200 for ADMINs).
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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once dirname(__DIR__) . '/middleware/auth.php';

$adminUser = require_role('ADMIN');

http_response_code(200);
echo json_encode([
    'status' => 'ok',
    'message' => 'Acceso administrativo verificado.',
    'admin' => [
        'id'        => $adminUser['id'],
        'email'     => $adminUser['email'],
        'full_name' => $adminUser['full_name'],
        'role'      => $adminUser['role'],
    ]
]);
