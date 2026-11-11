#!/usr/bin/env python3
"""Accept a Mobbin session through a local macOS password dialog."""
import getpass
import os
import shutil
from pathlib import Path
import subprocess
import sys

repository = Path(__file__).resolve().parents[1]
node = shutil.which("node")
if not node or not (repository / "dist/services/auth.js").exists():
    sys.exit("Install Node.js and run npm ci in the repository before authenticating.")

print("Moppin MCP — local authentication")
print("Sign into https://mobbin.com in your browser, then open Developer Tools > Console.")
print("Run this command to copy only the Mobbin session cookies:")
print(r'''copy(document.cookie.split('; ').filter(c => /^sb-[a-z0-9]+-auth-token(?:\.\d+)?=/i.test(c)).join('; '))''')
print("A local Moppin login dialog will open. Copy the session in Chrome, then paste into that dialog.", flush=True)
print("The dialog masks the session. It will not be printed or saved in shell history.", flush=True)
try:
    if '--terminal' in sys.argv:
        session = getpass.getpass("Mobbin session: ").strip()
    elif '--chunks' in sys.argv:
        first = getpass.getpass("Mobbin cookie part 0: ").strip()
        second = getpass.getpass("Mobbin cookie part 1: ").strip()
        session = first + second
    else:
        dialog = subprocess.run(
            ['/usr/bin/osascript', '-e', '''
set reply to display dialog "Copy your Mobbin session in Chrome, then paste it here with Command-V. The pasted value is hidden." default answer "" with hidden answer with title "Moppin MCP — local login" buttons {"Cancel", "Save session"} default button "Save session" cancel button "Cancel"
return text returned of reply
'''],
            capture_output=True, text=True, check=False,
        )
        if dialog.returncode:
            sys.exit("Login dialog cancelled or unavailable. No session was saved.")
        session = dialog.stdout.strip()
except (EOFError, KeyboardInterrupt):
    sys.exit("\nAuthentication cancelled.")
if not session:
    sys.exit("No session provided.")
if session == 'undefined':
    sys.exit("The word 'undefined' is not your session. Run the browser copy command again and paste directly into the dialog.")
data_dir = Path(os.environ.get("MOBBIN_DATA_DIR", str(Path.home() / ".moppin-mcp")))
data_dir.mkdir(mode=0o700, exist_ok=True)
os.chmod(data_dir, 0o700)
env = dict(os.environ, MOBBIN_DATA_DIR=str(data_dir))
program = '''
import { MobbinAuth } from './dist/services/auth.js';
import { writeStoredSession } from './dist/utils/auth-store.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const auth = MobbinAuth.fromCookie(input.trim());
  writeStoredSession(auth.getSession());
  console.log('Session saved privately. Return to Codex so the live search can be verified.');
} catch {
  console.error('Could not parse the session. Check that you copied the complete Mobbin session cookie.');
  process.exitCode = 1;
}
'''
result = subprocess.run(
    [node, '--input-type=module', '-e', program],
    cwd=repository, input=session, text=True, env=env, check=False,
)
sys.exit(result.returncode)
