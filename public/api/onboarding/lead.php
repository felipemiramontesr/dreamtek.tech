<?php
/**
 * Lead Capture Endpoint (PHP PDO API)
 * FC: protocols/fc/001c_FC_Onboarding_Wizard_and_Checkout.md (EN_FIRME)
 * Performs PDO upsert on UNIQUE email in leads table.
 * Applies rate-limiting (max 10 submissions per 15 min per IP).
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
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

$email = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
$fullName = trim($input['full_name'] ?? '');
$phone = trim((string)($input['phone'] ?? ''));
$company = isset($input['company']) ? trim((string)$input['company']) : null;
$stepReached = isset($input['step_reached']) ? (int)$input['step_reached'] : 1;
$ipAddress = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

if (!$email || empty($fullName) || empty($phone)) {
    http_response_code(400);
    echo json_encode(['error' => 'Nombre, correo electronico valido y telefono son requeridos.']);
    exit;
}

try {
    // Rate Limiting Check (Max 10 submissions per 15 minutes)
    $attemptsStmt = executeQuery(
        "SELECT COUNT(*) AS lead_count FROM login_attempts WHERE ip_address = :ip AND email = 'lead_submit' AND attempted_at > NOW() - INTERVAL 15 MINUTE",
        [':ip' => $ipAddress]
    );
    $leadCount = (int)($attemptsStmt->fetch()['lead_count'] ?? 0);

    if ($leadCount >= 10) {
        http_response_code(429);
        echo json_encode(['error' => 'Demasiadas solicitudes. Intente de nuevo en 15 minutos.']);
        exit;
    }

    // Record rate limit hit
    executeQuery(
        "INSERT INTO login_attempts (ip_address, email, attempted_at) VALUES (:ip, 'lead_submit', NOW())",
        [':ip' => $ipAddress]
    );

    // Upsert Lead record in MariaDB
    executeQuery(
        "INSERT INTO leads (email, full_name, phone, company, step_reached, created_at, updated_at) 
         VALUES (:email, :full_name, :phone, :company, :step, NOW(), NOW()) 
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone), company = VALUES(company), step_reached = GREATEST(step_reached, VALUES(step_reached)), updated_at = NOW()",
        [
            ':email'     => $email,
            ':full_name' => $fullName,
            ':phone'     => $phone,
            ':company'   => $company,
            ':step'      => $stepReached,
        ]
    );

    http_response_code(200);
    echo json_encode([
        'message' => 'Lead guardado exitosamente',
        'lead' => [
            'email'        => $email,
            'full_name'    => $fullName,
            'phone'        => $phone,
            'company'      => $company,
            'step_reached' => $stepReached,
        ]
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno al guardar los datos del prospecto.']);
}
