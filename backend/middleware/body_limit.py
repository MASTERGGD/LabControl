"""Reject oversized bodies before form parsing; buffer on bounded temporary disk."""
import tempfile
from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] not in {'POST', 'PUT', 'PATCH'}:
            return await self.app(scope, receive, send)
        path = scope.get('path', '')
        limit = 64 * 1024 if path.startswith('/auth/') else 25 * 1024 * 1024
        headers = dict(scope.get('headers', []))
        try:
            length = int(headers.get(b'content-length', b'0'))
        except ValueError:
            length = -1
        if length < 0 or length > limit:
            return await JSONResponse({'detail': 'Tamaño de solicitud no permitido'}, status_code=413)(scope, receive, send)
        with tempfile.SpooledTemporaryFile(max_size=1024 * 1024) as body:
            total = 0
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                chunk = message.get('body', b'')
                total += len(chunk)
                if total > limit:
                    return await JSONResponse({'detail': 'Solicitud demasiado grande'}, status_code=413)(scope, receive, send)
                body.write(chunk)
                if not message.get('more_body', False):
                    break
            body.seek(0)
            finished = False
            async def replay():
                nonlocal finished
                if finished:
                    return await receive()
                chunk = body.read(64 * 1024)
                more = body.tell() < total
                finished = not more
                return {'type': 'http.request', 'body': chunk, 'more_body': more}
            await self.app(scope, replay, send)
