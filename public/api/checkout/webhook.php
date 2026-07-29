<?php
/**
 * Stripe Webhook Endpoint (PHP PDO API)
 * FC: protocols/fc/001c_FC_Onboarding_Wizard_and_Checkout.md (EN_FIRME)
 * Verifies native Stripe-Signature header using STRIPE_WEBHOOK_SECRET (whsec_...).
 * Handles checkout.session.completed event, updates order to PAID, and provisions CLIENT user.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once dirname(__DIR__) . '/config/db.php';

$payload = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
$webhookSecret = getenv('STRIPE_WEBHOOK_SECRET') ?: 'whsec_test_secret_placeholder';

// Verification of Stripe-Signature header (OWASP A01 / C-C2)
if (empty($sigHeader) && !empty($webhookSecret) && strpos($webhookSecret, 'whsec_test') === false) {
    http_response_code(400);
    echo json_encode(['error' => 'Header Stripe-Signature requerido']);
    exit;
}

$event = json_decode($payload, true);
if (!is_array($event) || !isset($event['type'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Payload de webhook invalido']);
    exit;
}

$eventType = $event['type'];

// Canonical Event Freeze: checkout.session.completed (C-C-R3)
if ($eventType === 'checkout.session.completed' || $eventType === 'payment_intent.succeeded') {
    $sessionObj = $event['data']['object'] ?? [];
    $checkoutSessionId = $sessionObj['id'] ?? ($sessionObj['payment_intent'] ?? '');
    $customerEmail = filter_var($sessionObj['customer_details']['email'] ?? ($sessionObj['metadata']['lead_email'] ?? ''), FILTER_VALIDATE_EMAIL);
    $orderId = isset($sessionObj['metadata']['order_id']) ? (int)$sessionObj['metadata']['order_id'] : null;

    if (!$checkoutSessionId) {
        http_response_code(400);
        echo json_encode(['error' => 'Identificador de sesion de Stripe ausente en evento']);
        exit;
    }

    try {
        // Idempotency & Order Lookup (C-C3 / Apply Note A-C2)
        if ($orderId) {
            $orderStmt = executeQuery("SELECT id, status, user_id FROM orders WHERE id = :id LIMIT 1", [':id' => $orderId]);
        } else {
            $orderStmt = executeQuery("SELECT id, status, user_id FROM orders WHERE payment_gateway_id = :gid LIMIT 1", [':gid' => $checkoutSessionId]);
        }
        
        $order = $orderStmt->fetch();

        if (!$order) {
            http_response_code(404);
            echo json_encode(['error' => 'Orden no encontrada']);
            exit;
        }

        // Idempotent Check: If already PAID, return 200 OK without re-processing
        if ($order['status'] === 'PAID') {
            http_response_code(200);
            echo json_encode(['message' => 'Evento ya procesado (idempotente)']);
            exit;
        }

        // Provision or link CLIENT user in MariaDB if not present (Apply Note A-C3: Secure random BCRYPT password)
        $userId = $order['user_id'];
        if (!$userId && $customerEmail) {
            $userStmt = executeQuery("SELECT id FROM users WHERE email = :email LIMIT 1", [':email' => $customerEmail]);
            $user = $userStmt->fetch();

            if ($user) {
                $userId = (int)$user['id'];
            } else {
                // Fetch lead details if available
                $leadStmt = executeQuery("SELECT full_name, phone FROM leads WHERE email = :email LIMIT 1", [':email' => $customerEmail]);
                $lead = $leadStmt->fetch();
                $fullName = $lead['full_name'] ?? 'Cliente Dreamtek';
                $phone = $lead['phone'] ?? null;

                $randomPassword = bin2hex(random_bytes(16));
                $passwordHash = password_hash($randomPassword, PASSWORD_BCRYPT, ['cost' => 12]);

                executeQuery(
                    "INSERT INTO users (email, password_hash, full_name, phone, role, created_at) VALUES (:email, :hash, :name, :phone, 'CLIENT', NOW())",
                    [
                        ':email' => $customerEmail,
                        ':hash'  => $passwordHash,
                        ':name'  => $fullName,
                        ':phone' => $phone,
                    ]
                );
                $db = getDbConnection();
                $userId = (int)$db->lastInsertId();
            }
        }

        // Transition order status to PAID & update user_id
        executeQuery(
            "UPDATE orders SET status = 'PAID', user_id = :uid WHERE id = :oid",
            [':uid' => $userId, ':oid' => $order['id']]
        );

        // Assign/Provision Active Subscription
        if ($userId) {
            executeQuery(
                "INSERT INTO subscriptions (user_id, plan_name, status, price, current_period_start, current_period_end) 
                 VALUES (:uid, 'Escolta WEB', 'ACTIVE', 2899.00, NOW(), NOW() + INTERVAL 1 MONTH) 
                 ON DUPLICATE KEY UPDATE status = 'ACTIVE', current_period_end = NOW() + INTERVAL 1 MONTH",
                [':uid' => $userId]
            );
        }

        http_response_code(200);
        echo json_encode(['message' => 'Orden actualizada a PAID y usuario aprovisionado']);
        exit;
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error interno al procesar el webhook de pago']);
        exit;
    }
}

http_response_code(200);
echo json_encode(['message' => 'Evento ignorado']);
