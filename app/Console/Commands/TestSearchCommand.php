<?php

namespace App\Console\Commands;

use App\Models\MailUser;
use App\Services\MailIndexService;
use Illuminate\Console\Command;

class TestSearchCommand extends Command
{
    protected $signature = 'mail:search-test {email?}';
    protected $description = 'Test Meilisearch query directly';

    public function handle(MailIndexService $service)
    {
        $email = $this->argument('email');
        $user = $email ? MailUser::where('email', $email)->first() : MailUser::first();

        if (!$user) {
            $this->error("User tidak ditemukan.");
            return;
        }

        $this->info("Mengetes Search Meilisearch untuk User: {$user->email}");

        try {
            // Kita search string kosong agar memunculkan semuanya
            $results = $service->search($user, "", [], 10);

            $this->info("Berhasil! Ketemu " . $results->count() . " hasil.");
            foreach ($results as $m) {
                $this->line("- [UID: {$m->uid}] {$m->subject}");
            }
        } catch (\Throwable $e) {
            $this->error("ERROR SAAT SEARCH:");
            $this->error($e->getMessage());
            $this->error($e->getTraceAsString());
        }
    }
}
