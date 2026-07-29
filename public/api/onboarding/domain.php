<?php
/**
 * Domain Soft-Check Endpoint (PHP PDO API)
 * FC: protocols/fc/001c_FC_Onboarding_Wizard_and_Checkout.md (EN_FIRME)
 * Soft-check availability for .com / .mx domains without reservation/charging.
 * SSRF Protection (OWASP A10): Strictly validates domain regex & blocks private IP ranges.
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

if ($_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$rawDomain = $_GET['domain'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $rawDomain = $input['domain'] ?? $rawDomain;
}

$domain = strtolower(trim((string)$rawDomain));

// Strict Regex Validation: Only allow standard domain names ending in .com, .mx, or .com.mx
if (!preg_match('/^[a-zA-Z0-9-]{2,63}\.(com|mx|com\.mx)$/', $domain)) {
    http_response_code(400);
    echo json_encode(['error' => 'Formato de dominio invalido. Solo se admiten dominios .com, .mx o .com.mx.']);
    exit;
}

// SSRF Protection: Prevent internal IP resolutions or metadata endpoints
$resolvedIp = gethostbyname($domain);
if ($resolvedIp !== $domain && filter_var($resolvedIp, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
    http_response_code(400);
    echo json_encode(['error' => 'Dominio invalido o no permitido.']);
    exit;
}

try {
    // DNS Soft-check (A / AAAA / MX records)
    $isTaken = checkdnsrr($domain, 'A') || checkdnsrr($domain, 'AAAA') || checkdnsrr($domain, 'MX');

    http_response_code(200);
    echo json_encode([
        'domain'     => $domain,
        'available'  => !$isTaken,
        'message'    => !$isTaken ? 'Dominio disponible para registro' : 'Dominio no disponible (ya registrado)',
        'type'       => 'soft_check_only',
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno al consultar la disponibilidad del dominio.']);
}
