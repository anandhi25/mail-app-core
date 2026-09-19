<?php

namespace App\Jobs;

use App\Models\MailUser;
use App\Services\MaildirScannerService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

class MaildirIndexJob implements ShouldQueue
{
    use InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 3600; // 1 hour — mailboxes can be large

    public function __construct(
        public readonly int $mailUserId,
        public readonly string $folderName = '*',
        public readonly bool $force = false,
    ) {}

    public function handle(MaildirScannerService $scanner): void
    {
        $user = MailUser::find($this->mailUserId);
        if (! $user) {
            return;
        }

        $parts = explode('@', $user->email);
        if (count($parts) !== 2) {
            Log::error("MaildirIndexJob: invalid email {$user->email}");

            return;
        }

        [$username, $domain] = $parts;
        $path = "/var/mail/vhosts/{$domain}/{$username}";

        if (! is_dir($path)) {
            Log::warning("MaildirIndexJob: maildir not found at {$path}");

            return;
        }

        $count = $scanner->scanFolder($user, $path, $this->folderName, $this->force);

        Log::info("MaildirIndexJob: indexed {$count} messages for {$user->email} in {$this->folderName}");
    }
}
