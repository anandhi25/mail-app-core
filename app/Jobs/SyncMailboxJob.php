<?php

namespace App\Jobs;

use App\Models\MailUser;
use App\Services\MailIndexService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Webklex\IMAP\Facades\Client;

class SyncMailboxJob implements ShouldQueue
{
    use InteractsWithQueue, Queueable;

    public int $tries = 2;

    public int $timeout = 300;

    public function __construct(
        public readonly int $mailUserId,
        public readonly string $folderName = 'INBOX',
        public readonly int $limit = 200,
    ) {}

    public function handle(MailIndexService $service): void
    {
        $user = MailUser::find($this->mailUserId);
        if (! $user) {
            return;
        }

        $encryptedPassword = cache()->get("imap_pwd_{$user->id}");
        if (! $encryptedPassword) {
            return; // User not logged in; skip silently
        }

        $password = decrypt($encryptedPassword);

        $client = Client::make([
            'host' => config('imap.accounts.default.host'),
            'port' => config('imap.accounts.default.port'),
            'encryption' => config('imap.accounts.default.encryption'),
            'validate_cert' => config('imap.accounts.default.validate_cert'),
            'username' => $user->email,
            'password' => $password,
            'protocol' => 'imap',
        ]);
        $client->connect();

        $service->syncFolder($user, $client, $this->folderName, $this->limit);
    }
}
