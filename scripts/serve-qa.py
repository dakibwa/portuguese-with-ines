"""Serve the built site to local browser journeys."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys


class ExportServer(ThreadingHTTPServer):
    # A cold Next page can open more connections than Python's small default
    # queue. Dropped script requests left the test browser showing an empty shell.
    request_queue_size = 256


if __name__ == "__main__":
    directory = Path(__file__).resolve().parent.parent / "out"
    if not (directory / "index.html").is_file():
        sys.exit("Build the site with npm run build before serving it.")
    handler = partial(SimpleHTTPRequestHandler, directory=directory)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    with ExportServer(("127.0.0.1", port), handler) as server:
        print(f"http://localhost:{server.server_port}", flush=True)
        server.serve_forever()
