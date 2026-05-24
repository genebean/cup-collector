{ pkgs }:
pkgs.writeScriptBin "cc-docs-serve" ''
  #!${pkgs.python3}/bin/python3
  import http.server, os, subprocess, sys

  proj_root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
  os.chdir(os.path.join(proj_root, "docs"))

  class QuietHTTPServer(http.server.ThreadingHTTPServer):
      def handle_error(self, request, client_address):
          # BrokenPipeError / ConnectionResetError happen when a browser closes a
          # keepalive connection while the server is still writing the response body.
          # This is normal browser behaviour — suppress the traceback.
          if sys.exc_info()[0] in (BrokenPipeError, ConnectionResetError):
              return
          super().handle_error(request, client_address)

  print("Docs available at http://localhost:4000")
  with QuietHTTPServer(("0.0.0.0", 4000), http.server.SimpleHTTPRequestHandler) as httpd:
      httpd.serve_forever()
''
