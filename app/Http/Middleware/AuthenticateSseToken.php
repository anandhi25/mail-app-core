<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Allow SSE routes to authenticate via a `?token=` query parameter.
 *
 * EventSource does not support custom headers, so the Sanctum bearer token
 * is forwarded as a query string and injected into the Authorization header
 * before the normal auth:sanctum middleware processes the request.
 */
class AuthenticateSseToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->query('token');

        if ($token && ! $request->bearerToken()) {
            $request->headers->set('Authorization', "Bearer {$token}");
        }

        return $next($request);
    }
}
