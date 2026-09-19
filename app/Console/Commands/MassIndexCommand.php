<?php

namespace App\Console\Commands;

use App\Models\MailUser;
use App\Services\MaildirScannerService;
use Illuminate\Console\Command;

class MassIndexCommand extends Command
{
    protected $signature = 'mail:mass-index {email?} {--folder=*} {--force}';
    protected $description = 'Mass index emails directly from disk (Maildir)';

    public function handle(MaildirScannerService $scanner)
    {
        $email = $this->argument('email');
        $folder = $this->option('folder');
        $force = $this->option('force');

        if ($email) {
            $users = MailUser::where('email', $email)->get();
        } else {
            $users = MailUser::all();
            if (!$this->confirm("Anda akan meng-index {$users->count()} user. Lanjutkan?")) {
                return;
            }
        }

        foreach ($users as $user) {
            $this->info("Memproses user: {$user->email} | Folder: {$folder}");

            // Format path: /var/mail/vhosts/domain.com/username
            $parts = explode('@', $user->email);
            if (count($parts) !== 2) {
                $this->error("Email tidak valid: {$user->email}");
                continue;
            }

            $domain = $parts[1];
            $username = $parts[0];
            $path = "/var/mail/vhosts/{$domain}/{$username}";

            $this->line("Path: {$path}");

            try {
                $count = $scanner->scanFolder($user, $path, $folder, $force);
                $this->info("Berhasil meng-index {$count} email baru!");
            } catch (\Throwable $e) {
                $this->error("Gagal: " . $e->getMessage());
            }
        }
    }
}
