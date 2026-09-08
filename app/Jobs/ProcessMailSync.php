<?php

namespace App\Jobs;

use App\Models\MailSyncJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Webklex\IMAP\Facades\Client;

class ProcessMailSync implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 3600; // Allow 1 hour max execution (syncing can be very slow)

    public function __construct(public int $syncJobId) {}

    public function handle(): void
    {
        $syncJob = MailSyncJob::with('user')->find($this->syncJobId);
        if (! $syncJob || $syncJob->status !== 'pending') {
            return;
        }

        $syncJob->update(['status' => 'processing']);

        try {
            // 1. Connect to Source (e.g. Old Zimbra)
            $sourceClient = Client::make([
                'host' => $syncJob->source_host,
                'port' => $syncJob->source_port,
                'encryption' => $syncJob->source_encryption === 'false' ? false : $syncJob->source_encryption,
                'validate_cert' => false,
                'username' => $syncJob->source_username,
                'password' => decrypt($syncJob->source_password),
                'protocol' => 'imap',
            ]);
            $sourceClient->connect();

            // 2. Connect to Destination (Local Dovecot)
            $destClient = Client::make([
                'host' => config('imap.accounts.default.host'),
                'port' => config('imap.accounts.default.port'),
                'encryption' => config('imap.accounts.default.encryption'),
                'validate_cert' => false,
                'username' => explode('@', $syncJob->user->email)[0],
                'password' => decrypt($syncJob->local_password), // Raw password from admin form
                'protocol' => 'imap',
            ]);
            $destClient->connect();

            // 3. Count total messages across primary folders
            $foldersToSync = ['INBOX', 'Sent', 'Drafts', 'Junk', 'Spam', 'Trash', 'Archive'];
            $sourceFolders = $sourceClient->getFolders(false);

            $totalMessages = 0;
            $foldersMap = []; // source_folder_name => dest_folder_name

            foreach ($sourceFolders as $folder) {
                // Determine mapped folder name. E.g. 'Junk' on Zimbra -> 'Spam' on Dovecot
                $destName = $folder->name;
                if (strtolower($destName) === 'junk') {
                    $destName = 'Spam';
                }

                if (in_array($folder->name, $foldersToSync) || in_array($destName, $foldersToSync)) {
                    $count = $folder->messages()->count();
                    $totalMessages += $count;
                    $foldersMap[$folder->name] = $destName;
                }
            }

            $syncJob->update(['total_messages' => $totalMessages, 'synced_messages' => 0]);

            $syncedCount = 0;

            // 4. Migrate messages
            foreach ($foldersMap as $sourceName => $destName) {
                $srcFolder = $sourceClient->getFolder($sourceName);

                // Ensure dest folder exists
                try {
                    $destClient->createFolder($destName);
                } catch (\Exception) {
                    // Ignore if already exists
                }

                $destFolder = $destClient->getFolder($destName);

                // Fetch ALL messages from source without body stream just to get IDs quickly
                $messages = $srcFolder->query()->setFetchBody(true)->setFetchAttachment(true)->get();

                foreach ($messages as $message) {
                    // Extract Raw RFC822 string (contains everything: headers, body, attachments)
                    $rawEmail = $message->getRawBody();

                    // Re-construct flags
                    $flags = [];
                    if ($message->hasFlag('seen')) {
                        $flags[] = '\\Seen';
                    }
                    if ($message->hasFlag('flagged')) {
                        $flags[] = '\\Flagged';
                    }
                    if ($message->hasFlag('answered')) {
                        $flags[] = '\\Answered';
                    }
                    if ($message->hasFlag('draft')) {
                        $flags[] = '\\Draft';
                    }

                    // Append directly to destination
                    $destFolder->appendMessage($rawEmail, $flags, $message->getDate()[0]->format('d-M-Y H:i:s O'));

                    $syncedCount++;

                    // Update DB every 10 messages to prevent too many DB writes
                    if ($syncedCount % 10 === 0) {
                        $syncJob->update(['synced_messages' => $syncedCount]);
                    }
                }
            }

            // Cleanup & Mark Done
            $syncJob->update([
                'status' => 'completed',
                'synced_messages' => $syncedCount,
                'local_password' => null, // Security: remove plaintext password
            ]);

            $sourceClient->disconnect();
            $destClient->disconnect();

        } catch (\Exception $e) {
            $syncJob->update([
                'status' => 'failed',
                'error_log' => $e->getMessage()."\n".$e->getTraceAsString(),
                'local_password' => null,
            ]);
        }
    }
}
