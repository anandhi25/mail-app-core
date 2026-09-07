<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class MailUser extends Authenticatable
{
    use HasFactory, HasApiTokens;

    protected $fillable = [
        'domain_id',
        'email',
        'password',
        'quota_bytes',
        'active',
    ];

    protected $casts = [
        'active' => 'boolean',
    ];

    protected $hidden = [
        'password',
    ];

    public function domain(): BelongsTo
    {
        return $this->belongsTo(Domain::class);
    }

    /**
     * Mutator to automatically hash the password using SHA512-CRYPT for Dovecot compatibility.
     */
    protected function password(): Attribute
    {
        return Attribute::make(
            set: function ($value) {
                // If it's already a crypted string (starts with $6$), don't double-hash
                if (str_starts_with($value, '$6$')) {
                    return $value;
                }

                // Generate SHA512-CRYPT hash
                // Format: $6$rounds=5000$salt$hash (rounds is optional in some implementations, standard salt is 16 chars)
                $salt = Str::random(16);
                return crypt($value, '$6$' . $salt . '$');
            }
        );
    }
}
