<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MailSyncJob extends Model
{
    protected $fillable = [
        'mail_user_id',
        'source_host',
        'source_port',
        'source_encryption',
        'source_username',
        'source_password',
        'status',
        'total_messages',
        'synced_messages',
        'error_log',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(MailUser::class, 'mail_user_id');
    }
}
