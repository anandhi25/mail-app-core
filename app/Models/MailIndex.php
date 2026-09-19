<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Laravel\Scout\Searchable;

class MailIndex extends Model
{
    use Searchable;

    protected $table = 'mail_index';

    protected $fillable = [
        'mail_user_id',
        'uid',
        'folder',
        'message_id',
        'subject',
        'from_address',
        'from_name',
        'to_addresses',
        'body_text',
        'is_seen',
        'has_attachment',
        'sent_at',
    ];

    protected $casts = [
        'is_seen' => 'boolean',
        'has_attachment' => 'boolean',
        'to_addresses' => 'array',
        'sent_at' => 'datetime',
    ];

    public function mailUser(): BelongsTo
    {
        return $this->belongsTo(MailUser::class);
    }

    // ── Scout ──────────────────────────────────────────────────────────────

    /** Name of the Meilisearch index. */
    public function searchableAs(): string
    {
        return 'mail_messages';
    }

    /** Fields pushed to Meilisearch. */
    public function toSearchableArray(): array
    {
        return [
            'id' => $this->id,
            'mail_user_id' => $this->mail_user_id,
            'uid' => $this->uid,
            'folder' => $this->folder,
            'subject' => $this->subject ?? '',
            'from_address' => $this->from_address ?? '',
            'from_name' => $this->from_name ?? '',
            'to_addresses' => implode(', ', $this->to_addresses ?? []),
            'body_text' => mb_substr($this->body_text ?? '', 0, 8000), // cap at 8 KB
            'is_seen' => $this->is_seen,
            'has_attachment' => $this->has_attachment,
            'sent_at' => $this->sent_at?->timestamp,
        ];
    }

    /** Only index messages belonging to the authenticated user. */
    public function shouldBeSearchable(): bool
    {
        return $this->mail_user_id !== null;
    }
}
