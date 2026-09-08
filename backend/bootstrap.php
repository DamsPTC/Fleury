<?php
declare(strict_types=1);
// All credentials, sessions and downloaded files live OUTSIDE the public document root.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
umask(0077);
class FleuryError extends RuntimeException {
    public int $status;
    public float $retryAfter;
    public function __construct(int $status, string $message, float $retryAfter = 0) {
        parent::__construct($message); $this->status = $status; $this->retryAfter = $retryAfter;
    }
}
function private_dir(): string {
    static $dir = null;
    if ($dir !== null) return $dir;
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__)) ?: dirname(__DIR__);
    $candidate = getenv('FLEURY_DATA_DIR') ?: dirname($root) . '/fleury-private';
    if (!is_dir($candidate) && !@mkdir($candidate, 0700, true)) throw new FleuryError(503, 'Crée le dossier fleury-private à côté de public_html dans Hostinger, puis recharge la page.');
    $resolved = realpath($candidate);
    if (!$resolved || $resolved === $root || str_starts_with($resolved . '/', rtrim($root, '/') . '/')) throw new FleuryError(503, 'Le dossier privé doit être placé hors de public_html.');
    if (!is_writable($resolved)) throw new FleuryError(503, 'Le dossier fleury-private doit être accessible en écriture par PHP.');
    $dir = $resolved;
    foreach (['sessions', 'media', 'limits'] as $sub) {
        if (!is_dir("$dir/$sub") && !@mkdir("$dir/$sub", 0700)) throw new FleuryError(503, 'Impossible de préparer le stockage privé.');
    }
    return $dir;
}
function atomic_write(string $path, string $data): void {
    $tmp = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    if (@file_put_contents($tmp, $data, LOCK_EX) !== strlen($data) || !@rename($tmp, $path)) {
        @unlink($tmp); throw new FleuryError(507, 'Écriture impossible. Vérifie l’espace disponible sur Hostinger.');
    }
}
function auth_config(): ?array {
    $path = private_dir() . '/auth.json';
    if (!is_file($path)) return null;
    $data = json_decode((string)file_get_contents($path), true);
    if (!is_array($data) || empty($data['password_hash'])) throw new FleuryError(503, 'La configuration privée est illisible. Restaure auth.json depuis ta sauvegarde Hostinger.');
    return $data;
}
function setup_key(): void {
    $dir = private_dir();
    $lock = fopen($dir . '/auth.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new FleuryError(503, 'Configuration temporairement indisponible.');
    try {
        if (!auth_config() && !is_file($dir . '/setup-code.txt')) atomic_write($dir . '/setup-code.txt', bin2hex(random_bytes(24)) . "\n");
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function security_headers(): void {
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
}
function start_session(): void {
    security_headers();
    // Fail closed if HTTPS is absent; the browser must never send the Discord token over HTTP.
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['SERVER_PORT'] ?? '') == 443;
    $local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true) && in_array(parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST), ['localhost','127.0.0.1','[::1]'], true);
    if (!$https && !$local) throw new FleuryError(400, 'Ouvre le site avec https:// et active le certificat SSL dans Hostinger.');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_save_path(private_dir() . '/sessions');
    session_name('fleury_site');
    session_set_cookie_params(['lifetime'=>0, 'path'=>'/', 'secure'=>$https, 'httponly'=>true, 'samesite'=>'Strict']);
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    if (!empty($_SESSION['auth_until']) && $_SESSION['auth_until'] < time()) unset($_SESSION['auth_until']);
}
function authenticated(): bool { return !empty($_SESSION['auth_until']) && $_SESSION['auth_until'] >= time() && auth_config() !== null; }
function csrf_check(bool $privateDownload = false): void {
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? '');
    if (!is_string($provided) || !hash_equals($_SESSION['csrf'] ?? '', $provided)) throw new FleuryError(403, 'La session de la page a expiré. Recharge la page.');
    // A private download still requires the authenticated session and its CSRF secret.
    // Safari download navigations can supply an opaque Origin / cross-site fetch hint.
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['SERVER_PORT'] ?? '') == 443;
    $expectedOrigin = ($https ? 'https://' : 'http://') . strtolower($_SERVER['HTTP_HOST'] ?? '');
    if ($origin !== '' && $origin !== 'null' && strtolower($origin) !== $expectedOrigin) throw new FleuryError(403, 'Requête externe refusée.');
    if (!$privateDownload && ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new FleuryError(403, 'Requête externe refusée.');
}
function login_attempt(): void {
    $ip = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $p = private_dir() . '/limits/' . $ip . '.json';
    $f = fopen($p, 'c+');
    if (!$f || !flock($f, LOCK_EX)) throw new FleuryError(503, 'Connexion momentanément indisponible.');
    try {
        $r = json_decode(stream_get_contents($f), true) ?: ['until'=>time()+900,'count'=>0];
        if (($r['until'] ?? 0) < time()) $r=['until'=>time()+900,'count'=>0];
        if ($r['count'] >= 20) throw new FleuryError(429, 'Trop de tentatives. Réessaie dans quinze minutes.');
        $r['count']++; rewind($f); ftruncate($f,0); fwrite($f,json_encode($r));
    } finally {flock($f, LOCK_UN);fclose($f);}
}
function site_login(string $password, string $code = ''): void {
    csrf_check(); login_attempt();
    $dir = private_dir(); $lock = fopen($dir . '/auth.lock','c');
    if (!$lock || !flock($lock,LOCK_EX)) throw new FleuryError(503,'Configuration indisponible.');
    try {
        $config=auth_config();
        if ($config === null) {
            $expected = is_file($dir . '/setup-code.txt') ? trim((string)file_get_contents($dir . '/setup-code.txt')) : '';
            if ($expected === '' || !hash_equals($expected, trim($code))) throw new FleuryError(403, 'Code d’installation incorrect. Copie celui du fichier privé Hostinger.');
            if (strlen($password)<12 || strlen($password)>72) throw new FleuryError(400,'Choisis un mot de passe de 12 à 72 caractères.');
            atomic_write($dir . '/auth.json', json_encode(['password_hash'=>password_hash($password, PASSWORD_DEFAULT)], JSON_THROW_ON_ERROR));
            @unlink($dir . '/setup-code.txt');
        } elseif (strlen($password)>72 || !password_verify($password,$config['password_hash'])) {
            throw new FleuryError(401,'Mot de passe incorrect.');
        }
        session_regenerate_id(true); $_SESSION['auth_until']=time()+43200; $_SESSION['csrf']=bin2hex(random_bytes(32));
    } finally {flock($lock,LOCK_UN);fclose($lock);}
}
function respond(array $body, int $status=200): never {
    http_response_code($status);header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);exit;
}
function html(string $s): string { return htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
