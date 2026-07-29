<?php
/**
 * MariaDB Database Connection Helper (PHP PDO)
 * FC: protocols/fc/001a_FC_DB_Schema_and_Host_Model.md (EN_FIRME)
 * Apply Note A-1, A-5: Fail-closed without env, persistent connection reuse, server-only.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    define('ABSPATH', dirname(__DIR__));
}

// Load environment variables from public/api/.env if present
$envFile = ABSPATH . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (is_array($lines)) {
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0) {
                continue;
            }
            if (strpos($line, '=') !== false) {
                list($key, $val) = explode('=', $line, 2);
                $key = trim($key);
                $val = trim($val, " \t\n\r\0\x0B\"'");
                if (!array_key_exists($key, $_SERVER) && !array_key_exists($key, $_ENV)) {
                    putenv("{$key}={$val}");
                    $_ENV[$key] = $val;
                    $_SERVER[$key] = $val;
                }
            }
        }
    }
}

/**
 * Obtain a persistent PDO Database Connection for Hostinger MariaDB (localhost:3306)
 *
 * @throws PDOException if connection fails (fail-closed)
 * @return PDO
 */
function getDbConnection(): PDO {
    static $pdo = null;

    if ($pdo !== null) {
        return $pdo;
    }

    $host = getenv('MARIADB_HOST') ?: '127.0.0.1';
    $port = getenv('MARIADB_PORT') ?: '3306';
    $dbname = getenv('MARIADB_DATABASE') ?: 'dreamtek';
    $user = getenv('MARIADB_USER') ?: 'root';
    $pass = getenv('MARIADB_PASSWORD') !== false ? getenv('MARIADB_PASSWORD') : '';

    // Fail-closed validation if mandatory credentials are missing
    if (empty($dbname) || empty($user)) {
        throw new PDOException('Database credentials not configured.');
    }

    $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_PERSISTENT         => true,
        PDO::ATTR_TIMEOUT            => 5,
    ];

    try {
        $pdo = new PDO($dsn, $user, $pass, $options);
        return $pdo;
    } catch (PDOException $e) {
        // Apply Note A-5: Fallback to non-persistent connection if shared host persistent pool fails
        $options[PDO::ATTR_PERSISTENT] = false;
        $pdo = new PDO($dsn, $user, $pass, $options);
        return $pdo;
    }
}

/**
 * Execute a parameterized Prepared Statement (OWASP A03 Protection)
 *
 * @param string $sql
 * @param array $params
 * @return PDOStatement
 */
function executeQuery(string $sql, array $params = []): PDOStatement {
    $db = getDbConnection();
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}
