import os
import sys
import subprocess
import uvicorn

if __name__ == "__main__":
    try:
        uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        # On Windows, Ctrl+C only kills the reloader master; the worker child keeps
        # the port open.  Kill the entire process tree so nothing lingers.
        if sys.platform == "win32":
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(os.getpid())],
                    capture_output=True,
                    timeout=3,
                )
            except Exception:
                pass
