import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

load_dotenv(ENV_FILE)


def get_openai_key() -> str:
    return os.getenv("OPENAI_API_KEY", "")


def get_google_key() -> str:
    return os.getenv("GOOGLE_API_KEY", "")


def get_anthropic_key() -> str:
    return os.getenv("ANTHROPIC_API_KEY", "")


def get_target_website() -> str:
    return os.getenv("TARGET_WEBSITE", "https://careyaya.org")


def get_default_model() -> str:
    return os.getenv("DEFAULT_MODEL", "gemini-2.5-flash-lite")


def get_default_rule_set() -> str:
    return os.getenv("DEFAULT_RULE_SET", "")


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

    os.environ[key] = value
