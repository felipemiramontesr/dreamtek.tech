<?php
/**
 * Dreamtek.tech - 2FA Code Generator & Sender
 * Generates a 6-digit verification code, stores it in SQLite, and sends it to the user.
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

// Extract and sanitize email and name
$email = isset($input['email']) ? filter_var(trim($input['email']), FILTER_SANITIZE_EMAIL) : '';
$name = isset($input['name']) ? strip_tags(trim($input['name'])) : 'Cliente';

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Dirección de correo electrónico inválida."
    ]);
    exit();
}

// Database Connection (SQLite)
try {
    $dbPath = __DIR__ . '/verify.db';
    $db = new PDO("sqlite:$dbPath");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Create table if not exists
    $db->exec("CREATE TABLE IF NOT EXISTS verifications (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    )");

    // Clean up expired verification codes
    $stmtClean = $db->prepare("DELETE FROM verifications WHERE expires_at < :now");
    $stmtClean->execute([':now' => time()]);

    // Generate 6-digit random code
    $code = str_pad(rand(100000, 999999), 6, '0', STR_PAD_LEFT);
    $expires_at = time() + 600; // valid for 10 minutes

    // Store in DB
    $stmtInsert = $db->prepare("INSERT OR REPLACE INTO verifications (email, code, expires_at) VALUES (:email, :code, :expires_at)");
    $stmtInsert->execute([
        ':email' => $email,
        ':code' => $code,
        ':expires_at' => $expires_at
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Error de base de datos local: " . $e->getMessage()
    ]);
    exit();
}

// Load SMTP credentials
$smtp_host = 'smtp.hostinger.com';
$smtp_user = 'contacto@dreamtek.tech';
$smtp_pass = '';
$smtp_port = 465;

if (file_exists(__DIR__ . '/smtp_config.php')) {
    include __DIR__ . '/smtp_config.php';
}

// Build 2FA Verification Email Content (HTML)
$emailContent = "
<html>
<head>
  <title>Código de Verificación - Dreamtek</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; line-height: 1.6; background-color: #f7fafc; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
    .header { text-align: center; margin-bottom: 25px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; }
    .header h2 { margin: 0; font-size: 24px; font-weight: bold; color: #00213D; }
    .header span { color: #FF2D00; }
    .content { text-align: center; }
    .greeting { font-size: 16px; font-weight: bold; color: #1a202c; text-align: left; }
    .instruction { font-size: 14px; color: #4a5568; margin-top: 15px; margin-bottom: 25px; text-align: left; }
    .code-box { font-size: 32px; font-weight: bold; letter-spacing: 0.15em; color: #FF2D00; background-color: #00172B; padding: 20px; border-radius: 8px; display: inline-block; min-width: 200px; margin-bottom: 20px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3); text-align: center; }
    .warning { font-size: 12px; color: #a0aec0; margin-top: 20px; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #a0aec0; border-top: 1px solid #e2e8f0; padding-top: 15px; }
  </style>
</head>
<body>
  <div class='container'>
    <div class='header'>
      <h2>Dreamtek<span>.</span></h2>
    </div>
    <div class='content'>
      <div class='greeting'>Hola, {$name}.</div>
      <div class='instruction'>
        Para completar el envío de tu solicitud en Dreamtek, por favor ingresa el siguiente código de verificación de un solo uso en el formulario:
      </div>
      <div class='code-box'>{$code}</div>
      <div class='warning'>Este código es confidencial y expirará en 10 minutos. Si no solicitaste este código, puedes ignorar este correo de forma segura.</div>
    </div>
    <div class='footer'>
      Este es un correo automático del sistema de verificación de Dreamtek.tech. Por favor, no respondas directamente.
    </div>
  </div>
</body>
</html>
";

$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->isSMTP();
    $mail->Host       = $smtp_host;
    $mail->SMTPAuth   = !empty($smtp_pass);
    $mail->Username   = $smtp_user;
    $mail->Password   = $smtp_pass;
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    $mail->Port       = $smtp_port;
    $mail->CharSet    = 'UTF-8';

    // Recipients
    $mail->setFrom($smtp_user, 'Dreamtek Verificación');
    $mail->addAddress($email, $name);

    // Content
    $mail->isHTML(true);
    $mail->Subject = "Código de Verificación Dreamtek: " . $code;
    $mail->Body    = $emailContent;

    $mail->send();

    http_response_code(200);
    echo json_encode([
        "success" => true,
        "message" => "Código de verificación enviado con éxito."
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Error al enviar el código de verificación: " . $mail->ErrorInfo
    ]);
}
?>
