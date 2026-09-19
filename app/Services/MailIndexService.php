<?php

namespace App\Services;

use App\Models\MailIndex;
use App\Models\MailUser;
use Illuminate\Support\Collection;
use Webklex\PHPIMAP\Client;
use Webklex\PHPIMAP\Folder;

class MailIndexService
{
    /**
     * Sync a folder's messages into mail_index for the given user.
     * Only indexes messages not already present; skips body re-fetch for
     * already-indexed UIDs unless $force is true.
     *
     * @param  int  $limit  Max messages to sync per call (newest first).
     */
    public function syncFolder(MailUser $user, Client $client, string $folderName, int $limit = 100, bool $force = false): int
    {
        $folder = $this->resolveFolder($client, $folderName);
        if (! $folder) {
            return 0;
        }

        $messages = $folder->query()->all()->limit($limit)->leaveUnread()->get();
        $synced = 0;

        foreach ($messages as $message) {
            try {
                $uid = (string) $message->getUid();

                if (! $force && MailIndex::where('mail_user_id', $user->id)
                    ->where('folder', $folderName)
                    ->where('uid', $uid)
                    ->exists()) {
                    // Update seen flag only (cheap)
                    MailIndex::where('mail_user_id', $user->id)
                        ->where('folder', $folderName)
                        ->where('uid', $uid)
                        ->update(['is_seen' => $message->hasFlag('Seen')]);

                    continue;
                }

                $bodyText = $this->extractBodyText($message);

                $record = MailIndex::updateOrCreate(
                    [
                        'mail_user_id' => $user->id,
                        'folder' => $folderName,
                        'uid' => $uid,
                    ],
                    [
                        'message_id' => (string) ($message->getMessageId() ?? ''),
                        'subject' => (string) ($message->getSubject() ?? '(no subject)'),
                        'from_address' => $message->getFrom()->first()?->mail ?? '',
                        'from_name' => $message->getFrom()->first()?->personal ?? '',
                        'to_addresses' => $message->getTo() ? array_map(fn ($a) => $a->mail, $message->getTo()->toArray()) : [],
                        'body_text' => $bodyText,
                        'is_seen' => $message->hasFlag('Seen'),
                        'has_attachment' => $message->hasAttachments(),
                        'sent_at' => $message->getDate()->first()?->toDateTimeString(),
                    ]
                );

                $record->searchable(); // push to Meilisearch
                $synced++;
            } catch (\Throwable $e) {
                // Log problematic messages instead of hiding them
                \Illuminate\Support\Facades\Log::error("Failed to index message UID {$message->getUid()}: " . $e->getMessage());
                continue;
            }
        }

        return $synced;
    }

    /**
     * Index a single message by UID (called after receiving a new-mail notification).
     */
    public function indexMessage(MailUser $user, Client $client, string $folderName, string $uid): void
    {
        $folder = $this->resolveFolder($client, $folderName);
        if (! $folder) {
            return;
        }

        try {
            $message = $folder->query()->getMessageByUid($uid);
            if (! $message) {
                return;
            }

            $record = MailIndex::updateOrCreate(
                [
                    'mail_user_id' => $user->id,
                    'folder' => $folderName,
                    'uid' => $uid,
                ],
                [
                    'message_id' => (string) ($message->getMessageId() ?? ''),
                    'subject' => (string) ($message->getSubject() ?? '(no subject)'),
                    'from_address' => $message->getFrom()->first()?->mail ?? '',
                    'from_name' => $message->getFrom()->first()?->personal ?? '',
                    'to_addresses' => $message->getTo() ? array_map(fn ($a) => $a->mail, $message->getTo()->toArray()) : [],
                    'body_text' => $this->extractBodyText($message),
                    'is_seen' => $message->hasFlag('Seen'),
                    'has_attachment' => $message->hasAttachments(),
                    'sent_at' => $message->getDate()->first()?->toDateTimeString(),
                ]
            );

            $record->searchable();
        } catch (\Throwable) {
            // Ignore
        }
    }

    /**
     * Remove a message from the local index and Meilisearch.
     */
    public function removeMessage(MailUser $user, string $folderName, string $uid): void
    {
        $record = MailIndex::where('mail_user_id', $user->id)
            ->where('folder', $folderName)
            ->where('uid', $uid)
            ->first();

        if ($record) {
            $record->unsearchable();
            $record->delete();
        }
    }

    /**
     * Update the is_seen flag in both DB and Meilisearch.
     */
    public function updateSeenFlag(MailUser $user, string $folderName, string $uid, bool $isSeen): void
    {
        $record = MailIndex::where('mail_user_id', $user->id)
            ->where('folder', $folderName)
            ->where('uid', $uid)
            ->first();

        if ($record) {
            $record->update(['is_seen' => $isSeen]);
            $record->searchable(); // re-push updated document
        }
    }

    /**
     * Search messages for a user with optional filters.
     *
     * @param  array{folder?: string, is_seen?: bool, has_attachment?: bool}  $filters
     */
    public function search(MailUser $user, string $query, array $filters = [], int $limit = 20): Collection
    {
        $search = MailIndex::search($query, function (mixed $engine, mixed $q, array $options) use ($user, $filters, $limit) {
            // Check if engine is Meilisearch Engine
            if (class_basename(get_class($engine)) === 'MeilisearchEngine' && is_string($q)) {
                $options['filter'] = ["mail_user_id = {$user->id}"];

                if (isset($filters['folder'])) {
                    $options['filter'][] = "folder = \"{$filters['folder']}\"";
                }
                if (isset($filters['is_seen'])) {
                    $options['filter'][] = 'is_seen = '.($filters['is_seen'] ? 'true' : 'false');
                }
                if (isset($filters['has_attachment'])) {
                    $options['filter'][] = 'has_attachment = '.($filters['has_attachment'] ? 'true' : 'false');
                }

                $options['filter'] = implode(' AND ', $options['filter']);
                $options['limit'] = $limit;
                $options['attributesToHighlight'] = ['subject', 'from_name', 'from_address', 'body_text'];
                $options['highlightPreTag'] = '<mark>';
                $options['highlightPostTag'] = '</mark>';
                $options['attributesToCrop'] = ['body_text'];
                $options['cropLength'] = 40;

                return $engine->search($q, $options);
            }

            // Fallback for other engines (like database/collection)
            return $engine->search($q, $options);
        });

        // Add typical eloquent wheres for non-meilisearch fallback
        $search->where('mail_user_id', $user->id);
        if (isset($filters['folder'])) {
            $search->where('folder', $filters['folder']);
        }
        if (isset($filters['is_seen'])) {
            $search->where('is_seen', $filters['is_seen'] ? 1 : 0);
        }
        if (isset($filters['has_attachment'])) {
            $search->where('has_attachment', $filters['has_attachment'] ? 1 : 0);
        }

        return $search->take($limit)->get();
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private function resolveFolder(Client $client, string $folderName): ?Folder
    {
        try {
            $folders = $client->getFolders(false);

            return $folders->first(fn (Folder $f) => $f->full_name === $folderName)
                ?? $folders->first(fn (Folder $f) => strtolower($f->full_name) === strtolower($folderName));
        } catch (\Throwable) {
            return null;
        }
    }

    private function extractBodyText(mixed $message): string
    {
        try {
            $plain = $message->getTextBody();
            if ($plain && strlen(trim($plain)) > 10) {
                return mb_substr(trim($plain), 0, 50000);
            }

            // Fallback: strip HTML
            $html = $message->getHTMLBody();
            if ($html) {
                return mb_substr(trim(strip_tags($html)), 0, 50000);
            }
        } catch (\Throwable) {
            // Ignore parse errors
        }

        return '';
    }
}
