<?php

namespace App\Auth;

use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Custom user provider untuk MailUser yang passwordnya disimpan dalam format
 * SHA512-CRYPT ($6$...) agar kompatibel dengan Dovecot — bukan Bcrypt.
 */
class DovecotUserProvider extends EloquentUserProvider
{
    /**
     * Verifikasi password menggunakan crypt() dengan hash yang tersimpan sebagai salt.
     * Format SHA512-CRYPT: $6$<salt>$<hash>
     */
    public function validateCredentials(Authenticatable $user, array $credentials): bool
    {
        $plain = $credentials['password'];
        $hashed = $user->getAuthPassword();

        return hash_equals($hashed, crypt($plain, $hashed));
    }

    /**
     * Jangan pernah rehash — password SHA512-CRYPT dikelola oleh Dovecot,
     * bukan Laravel hasher. Jika di-rehash, Bcrypt akan menimpa format $6$.
     */
    public function rehashPasswordIfRequired(Authenticatable $user, array $credentials, bool $force = false): void
    {
        // No-op: SHA512-CRYPT tidak kompatibel dengan Laravel hasher.
    }
}
