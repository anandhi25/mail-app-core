<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class WebmailAuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        // Autentikasi dengan guard 'mail_user' yang telah dibuat di auth.php
        if (Auth::guard('mail_user')->attempt($request->only('email', 'password'))) {
            $user = Auth::guard('mail_user')->user();

            // Generate token untuk API access menggunakan Sanctum
            $token = $user->createToken('webmail-token')->plainTextToken;

            // Simpan password user ke cache sementara untuk koneksi IMAP/SMTP nantinya.
            // PERINGATAN: Di lingkungan nyata, menyimpan password plaintext seperti ini rentan.
            // Namun, IMAP client butuh kredensial asli untuk connect.
            // Alternatif lebih aman: enkripsi menggunakan APP_KEY Laravel di DB atau Cache
            cache()->put("imap_pwd_{$user->id}", encrypt($request->password), now()->addDays(7));

            return response()->json([
                'message' => 'Login successful',
                'token' => $token,
                'user' => [
                    'id' => $user->id,
                    'email' => $user->email,
                    'domain_id' => $user->domain_id,
                ],
            ]);
        }

        return response()->json([
            'message' => 'Invalid email or password',
        ], 401);
    }

    public function logout(Request $request)
    {
        $user = $request->user();

        // Hapus password dari cache
        if ($user) {
            cache()->forget("imap_pwd_{$user->id}");
            $user->currentAccessToken()->delete();
        }

        return response()->json(['message' => 'Logged out successfully']);
    }
}
