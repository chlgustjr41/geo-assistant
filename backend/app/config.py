import os
import stat
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

load_dotenv(ENV_FILE, override=True)


def reload_env() -> None:
    """Re-read .env from disk into os.environ. Call this before checking key status."""
    load_dotenv(ENV_FILE, override=True)


# Known placeholder values that should be treated as "not configured"
_PLACEHOLDERS = {"", "sk-...", "AI...", "sk-ant-..."}


def _key_is_configured(value: str) -> bool:
    """Return True only when a real key value has been set."""
    return bool(value) and value not in _PLACEHOLDERS and len(value) >= 20


def _set_env_file_permissions() -> None:
    """Restrict .env to owner-only read/write (600). No-op on Windows."""
    try:
        ENV_FILE.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except (OSError, NotImplementedError):
        pass


def get_openai_key() -> str:
    return os.getenv("OPENAI_API_KEY", "")


def get_google_key() -> str:
    return os.getenv("GOOGLE_API_KEY", "")


def get_anthropic_key() -> str:
    return os.getenv("ANTHROPIC_API_KEY", "")


def get_default_model() -> str:
    return os.getenv("DEFAULT_MODEL", "gemini-2.5-flash-lite")


def get_default_rule_set() -> str:
    return os.getenv("DEFAULT_RULE_SET", "")


def get_firebase_service_account_path() -> str:
    return os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")


def get_allowed_emails() -> list[str]:
    raw = os.getenv("ALLOWED_EMAILS", "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def get_max_corpus_urls() -> int:
    """Maximum URLs per bulk corpus import batch."""
    return int(os.getenv("MAX_CORPUS_URLS", "50"))


def get_max_queries_per_set() -> int:
    """Maximum queries allowed in a single query set."""
    return int(os.getenv("MAX_QUERIES_PER_SET", "50"))


def update_env(key: str, value: str) -> None:
    """Update or insert a key in the .env file."""
    lines: list[str] = []
    if ENV_FILE.exists():
        with open(ENV_FILE) as f:
            lines = f.readlines()

    found = False
    new_lines = []
    for line in lines:
        if line.startswith(f"{key}="):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)

    if not found:
        new_lines.append(f"{key}={value}\n")

    with open(ENV_FILE, "w") as f:
        f.writelines(new_lines)

    _set_env_file_permissions()
    os.environ[key] = value
