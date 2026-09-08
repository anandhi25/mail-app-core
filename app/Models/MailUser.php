<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class MailUser extends Authenticatable
{
    use HasApiTokens, HasFactory;

    protected $fillable = [
        'domain_id',
        'email',
        'name',
        'password',
        'quota_bytes',
        'active',
        'dropbox_credentials',
        'google_drive_credentials',
    ];

    protected $casts = [
        'active' => 'boolean',
        'dropbox_credentials' => 'array',
        'google_drive_credentials' => 'array',
    ];

    protected $hidden = [
        'password',
    ];

    public function domain(): BelongsTo
    {
        return $this->belongsTo(Domain::class);
    }

    public function syncJobs(): HasMany
    {
        return $this->hasMany(MailSyncJob::class, 'mail_user_id');
    }

    public function latestSyncJob(): HasOne
    {
        return $this->hasOne(MailSyncJob::class, 'mail_user_id')->latestOfMany();
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

                return crypt($value, '$6$'.$salt.'$');
            }
        );
    }
}
