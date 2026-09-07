<?php

namespace App\Http\Middleware;

use App\Models\MailUser;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticate webmail requests using a Sanctum token issued to a MailUser.
 *
 * We cannot use auth:sanctum directly because that guard only resolves
 * tokenable models registered in its guard list (defaulting to the web guard /
 * App\Models\User). This middleware resolves the token manually and binds the
 * authenticated MailUser onto the request so that $request->user() works in
 * downstream controllers.
 */
class AuthenticateMailUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (! $token) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        [$id, $plainText] = array_pad(explode('|', $token, 2), 2, null);

        $accessToken = PersonalAccessToken::where('tokenable_type', MailUser::class)
            ->find($id);

        if (! $accessToken || ! hash_equals($accessToken->token, hash('sha256', $plainText))) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Bind the authenticated MailUser onto the request guard
        $request->setUserResolver(fn () => $accessToken->tokenable);

        return $next($request);
    }
}
