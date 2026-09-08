<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class WebmailProfileController extends Controller
{
    /**
     * Get the current authenticated user's profile.
     */
    public function show(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }

    /**
     * Update the current authenticated user's profile.
     */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'nullable|string|max:255',
            'current_password' => 'nullable|string|required_with:password',
            'password' => ['nullable', 'string', 'confirmed', Password::min(8)],
        ]);

        $user->name = $validated['name'] ?? $user->name;

        // If a new password is provided, we check the current password.
        // Remember: the current password hash in DB is SHA512-CRYPT, so standard Hash::check will not work natively if it's Dovecot crypt.
        // We can manually verify the crypt if a password is provided.
        if (! empty($validated['password'])) {
            $providedCurrent = $validated['current_password'];
            $storedHash = $user->getAuthPassword();

            // Verify crypt
            if (crypt($providedCurrent, $storedHash) !== $storedHash) {
                return response()->json([
                    'message' => 'The provided current password does not match our records.',
                ], 422);
            }

            // Assigning password will trigger the SHA512-CRYPT mutator on MailUser
            $user->password = $validated['password'];

            // Note: Since this changes their local password, they might need to re-login if IMAP auth fails in background,
            // but for frontend JWT, they stay logged in.
        }

        $user->save();

        return response()->json([
            'message' => 'Profile updated successfully.',
            'user' => $user,
        ]);
    }
}
