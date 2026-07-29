<?php
/**
 * Authentication & RBAC Middleware Helper (PHP PDO API)
 * FC: protocols/fc/001b_FC_Auth_Engine_and_RBAC.md (EN_FIRME)
 * Verifies session token from HTTP-Only cookie against MariaDB sessions table.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/db.php';

/**
 * Authenticate current request via dreamtek_session cookie
 *
 * @return array Authenticated User Data
 */
function require_auth(): array {
    $rawToken = $_COOKIE['dreamtek_session'] ?? '';

    if (empty($rawToken)) {
        http_response_code(401);
        echo json_encode(['error' => 'No autenticado. Sesion requerida.']);
        exit;
    }

    $tokenHash = hash('sha256', $rawToken);

    try {
        $stmt = executeQuery(
            "SELECT u.id, u.email, u.full_name, u.phone, u.role, s.expires_at 
             FROM sessions s 
             JOIN users u ON s.user_id = u.id 
             WHERE s.token_hash = :hash AND s.expires_at > NOW() 
             LIMIT 1",
            [':hash' => $tokenHash]
        );
        $user = $stmt->fetch();

        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Sesion invalida o expirada.']);
            exit;
        }

        return [
            'id'        => (int)$user['id'],
            'email'     => $user['email'],
            'full_name' => $user['full_name'],
            'phone'     => $user['phone'],
            'role'      => $user['role'],
        ];
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error interno al verificar la sesion.']);
        exit;
    }
}

/**
 * Require specific RBAC Role (e.g. 'ADMIN')
 *
 * @param string $requiredRole
 * @return array Authenticated User Data
 */
function require_role(string $requiredRole): array {
    $user = require_auth();

    if (($user['role'] ?? '') !== $requiredRole) {
        http_response_code(403);
        echo json_encode(['error' => 'Acceso denegado. Permisos insuficientes.']);
        exit;
    }

    return $user;
}
