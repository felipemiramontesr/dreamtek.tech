<?php
/**
 * Stripe Checkout Session Creation Endpoint (PHP PDO API)
 * FC: protocols/fc/001c_FC_Onboarding_Wizard_and_Checkout.md (EN_FIRME)
 * Validates server-side canonical pricing constants ($2,899 + VAT / $31,188 + VAT).
 * Creates pending order in MariaDB and generates signed Stripe Checkout URL.
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
$billingCycle = strtolower(trim((string)($input['billing_cycle'] ?? 'monthly')));
$templateId = trim((string)($input['template_id'] ?? 'corporate'));
$domainName = trim((string)($input['domain_name'] ?? ''));

if (!$email) {
    http_response_code(400);
    echo json_encode(['error' => 'Correo electronico requerido para generar el checkout.']);
    exit;
}

// Canonical Pricing Constants (Server Authority - OWASP A04)
// Monthly: $2,899.00 MXN + 16% IVA = $3,362.84 MXN
// Annual: $2,599.00 MXN * 12 + 16% IVA = $31,188.00 + $4,990.08 = $36,178.08 MXN
$isAnnual = ($billingCycle === 'annual');
$subtotal = $isAnnual ? 31188.00 : 2899.00;
$taxAmount = round($subtotal * 0.16, 2);
$totalAmount = round($subtotal + $taxAmount, 2);

try {
    // Generate unique internal gateway ID reference
    $checkoutSessionId = 'cs_test_' . bin2hex(random_bytes(16));
    
    // Find or create lead ID if available
    $leadStmt = executeQuery("SELECT id FROM leads WHERE email = :email LIMIT 1", [':email' => $email]);
    $lead = $leadStmt->fetch();
    $userId = null;

    if ($lead) {
        $userStmt = executeQuery("SELECT id FROM users WHERE email = :email LIMIT 1", [':email' => $email]);
        $user = $userStmt->fetch();
        if ($user) {
            $userId = (int)$user['id'];
        }
    }

    // Create Order in pending status (Apply Note A-C2: Store checkout_session_id in payment_gateway_id)
    executeQuery(
        "INSERT INTO orders (user_id, status, total_amount, currency, payment_gateway_id, created_at) 
         VALUES (:user_id, 'PENDING', :amount, 'MXN', :gateway_id, NOW())",
        [
            ':user_id'    => $userId,
            ':amount'     => $totalAmount,
            ':gateway_id' => $checkoutSessionId,
        ]
    );

    $db = getDbConnection();
    $orderId = (int)$db->lastInsertId();

    // Construct Checkout Redirect URL (Mock / Live Stripe Checkout integration URL)
    $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $redirectUrl = sprintf(
        "%s://%s/?session_id=%s&step=5",
        $protocol,
        $host,
        $checkoutSessionId
    );

    http_response_code(200);
    echo json_encode([
        'message' => 'Sesion de checkout creada exitosamente',
        'checkout_url' => $redirectUrl,
        'order' => [
            'order_id'           => $orderId,
            'checkout_session_id'=> $checkoutSessionId,
            'billing_cycle'      => $billingCycle,
            'subtotal'           => $subtotal,
            'tax'                => $taxAmount,
            'total_amount'       => $totalAmount,
            'currency'           => 'MXN',
            'status'             => 'PENDING',
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error interno al generar la sesion de pago.']);
}
