<?php
/**
 * Dreamtek.tech - Contact Form Mailer (SMTP Secret Configured)
 * Handles form submissions and sends notifications using PHP.
 */

// Set headers for JSON response
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

// Load PHPMailer classes
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\SMTP;

require __DIR__ . '/PHPMailer/Exception.php';
require __DIR__ . '/PHPMailer/PHPMailer.php';
require __DIR__ . '/PHPMailer/SMTP.php';

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Ensure it's a POST request
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        "success" => false,
        "message" => "Método no permitido. Solo se aceptan solicitudes POST."
    ]);
    exit();
}

// Get raw POST body
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

// Extract and sanitize input fields
$name = isset($input['name']) ? strip_tags(trim($input['name'])) : '';
$email = isset($input['email']) ? filter_var(trim($input['email']), FILTER_SANITIZE_EMAIL) : '';
$service = isset($input['service']) ? strip_tags(trim($input['service'])) : 'web-starter';
$message = isset($input['message']) ? htmlspecialchars(trim($input['message'])) : '';
$code = isset($input['code']) ? trim($input['code']) : '';

// Validation
if (empty($name) || empty($email) || empty($message) || empty($code)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Por favor, completa todos los campos requeridos, incluyendo el código de verificación."
    ]);
    exit();
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Dirección de correo electrónico inválida."
    ]);
    exit();
}

// Validate 2FA code against SQLite database
try {
    $dbPath = __DIR__ . '/verify.db';
    if (!file_exists($dbPath)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "No se encontró ningún código de verificación activo para este correo."
        ]);
        exit();
    }

    $db = new PDO("sqlite:$dbPath");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Fetch active verification code
    $stmt = $db->prepare("SELECT code, expires_at FROM verifications WHERE email = :email");
    $stmt->execute([':email' => $email]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "No se encontró ningún código de verificación activo para este correo."
        ]);
        exit();
    }

    // Check code and expiration
    if ($record['code'] !== $code) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "El código de verificación ingresado es incorrecto."
        ]);
        exit();
    }

    if ($record['expires_at'] < time()) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "message" => "El código de verificación ha expirado. Por favor, solicita uno nuevo."
        ]);
        exit();
    }

    // Delete verified code to prevent replay/reuse attacks
    $stmtDelete = $db->prepare("DELETE FROM verifications WHERE email = :email");
    $stmtDelete->execute([':email' => $email]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Error de validación en la base de datos: " . $e->getMessage()
    ]);
    exit();
}

// Recipient email (Change to your Hostinger business email)
$to = "contacto@dreamtek.tech"; 
$subject = "Nueva Solicitud de Proyecto - Dreamtek.tech";

// Map service ID to readable text
$servicesMap = [
    'web-starter' => 'Web Starter — $1,200 USD',
    'custom-app' => 'Custom App — $3,500 USD',
    'cyber-audit' => 'Cyber Audit — $1,800 USD',
    'cybersecurity' => 'Ciberseguridad Consultoría',
    'other' => 'Otro Requerimiento'
];
$serviceName = isset($servicesMap[$service]) ? $servicesMap[$service] : $service;

// Build Email Content (HTML)
$emailContent = "
<html>
<head>
  <title>Nueva Solicitud de Contacto</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .header { background-color: #00213D; color: #ffffff; padding: 20px; text-align: center; border-radius: 6px 6px 0 0; }
    .header h2 { margin: 0; font-size: 24px; font-weight: bold; }
    .header span { color: #FF2D00; }
    .content { padding: 20px; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #4a5568; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .value { font-size: 16px; margin-top: 5px; color: #1a202c; }
    .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #a0aec0; border-top: 1px solid #e2e8f0; padding-top: 15px; }
  </style>
</head>
<body>
  <div class='container'>
    <div class='header'>
      <h2>Dreamtek<span>.</span></h2>
    </div>
    <div class='content'>
      <div class='field'>
        <div class='label'>Nombre Cliente</div>
        <div class='value'>{$name}</div>
      </div>
      <div class='field'>
        <div class='label'>Correo Electrónico</div>
        <div class='value'><a href='mailto:{$email}'>{$email}</a></div>
      </div>
      <div class='field'>
        <div class='label'>Servicio / Plan Solicitado</div>
        <div class='value' style='color: #FF2D00; font-weight: bold;'>{$serviceName}</div>
      </div>
      <div class='field' style='margin-top: 20px;'>
        <div class='label'>Detalles del Mensaje</div>
        <div class='value' style='white-space: pre-wrap; background-color: #f7fafc; padding: 15px; border-radius: 4px; border-left: 3px solid #00213D;'>{$message}</div>
      </div>
    </div>
    <div class='footer'>
      Este correo fue enviado automáticamente desde el formulario de contacto oficial de Dreamtek.tech.
    </div>
  </div>
</body>
</html>
";

// Load SMTP configuration
$smtp_host = 'smtp.hostinger.com';
$smtp_user = 'contacto@dreamtek.tech';
$smtp_pass = ''; // Leave blank or define here if not using smtp_config.php
$smtp_port = 465;

if (file_exists(__DIR__ . '/smtp_config.php')) {
    include __DIR__ . '/smtp_config.php';
}

$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->isSMTP();
    $mail->Host       = $smtp_host;
    $mail->SMTPAuth   = !empty($smtp_pass); // authenticate only if password is set
    $mail->Username   = $smtp_user;
    $mail->Password   = $smtp_pass;
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS; // SSL/TLS
    $mail->Port       = $smtp_port;
    $mail->CharSet    = 'UTF-8';

    // Recipients
    $mail->setFrom($smtp_user, 'Dreamtek Contacto');
    $mail->addAddress($to);
    $mail->addReplyTo($email, $name);

    // Content
    $mail->isHTML(true);
    $mail->Subject = $subject;
    $mail->Body    = $emailContent;

    $mail->send();

    http_response_code(200);
    echo json_encode([
        "success" => true,
        "message" => "Mensaje enviado con éxito."
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Error al enviar el correo: " . $mail->ErrorInfo
    ]);
}
?>
