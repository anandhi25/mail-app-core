<?php

namespace App\Jobs;

use App\Models\MailSyncJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Log;

class ProcessMailSync implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 3600 * 24; // Allow 24 hours max execution for large mailboxes

    public function __construct(public int $syncJobId) {}

    public function handle(): void
    {
        $syncJob = MailSyncJob::with('user')->find($this->syncJobId);
        if (! $syncJob || $syncJob->status !== 'pending') {
            return;
        }

        $syncJob->update(['status' => 'processing']);

        try {
            $sourcePassword = decrypt($syncJob->source_password);
            $localPassword = decrypt($syncJob->local_password);

            // Format host parameters for imapsync
            $host1Args = [
                '--host1', $syncJob->source_host,
                '--user1', $syncJob->source_username,
                '--port1', (string) $syncJob->source_port,
            ];

            // Add SSL arg based on settings
            if ($syncJob->source_encryption === 'ssl' || $syncJob->source_encryption === 'tls') {
                $host1Args[] = '--ssl1';
            } else {
                $host1Args[] = '--nossl1';
            }

            // Host 2 (Local Dovecot)
            $host2Args = [
                '--host2', '127.0.0.1', // Assuming local Dovecot
                '--user2', $syncJob->user->email,
                '--port2', '143', // Local port, adjust if your internal dovecot is on 993
                '--nossl2', // Safe inside localhost
                '--automap',
                '--skipcrossduplicates'
            ];

            // Build full command array
            $command = array_merge(
                ['imapsync'],
                $host1Args,
                $host2Args
            );

            // Output log file path
            $logPath = storage_path("logs/imapsync-{$syncJob->id}-" . time() . ".log");

            // We must pass passwords via env variables instead of arguments for security
            // but for simplicity of CLI tool, we can use the --passfile or environment approach.
            // imapsync supports --passfile1 and --passfile2.
            $passfile1 = storage_path("app/private/sync_{$syncJob->id}_pass1.txt");
            $passfile2 = storage_path("app/private/sync_{$syncJob->id}_pass2.txt");

            file_put_contents($passfile1, $sourcePassword);
            file_put_contents($passfile2, $localPassword);

            // Add passfiles to command
            $command[] = '--passfile1';
            $command[] = escapeshellarg($passfile1);
            $command[] = '--passfile2';
            $command[] = escapeshellarg($passfile2);

            // Execute the process (imapsync)
            $processResult = Process::timeout($this->timeout)->run(implode(' ', $command));

            // Remove temporary password files
            @unlink($passfile1);
            @unlink($passfile2);

            if ($processResult->successful()) {
                // Determine synced messages count from the log output if possible
                // (Optional: parsing output to find "Copied X messages")
                $output = $processResult->output();

                // Write output to log for debugging
                file_put_contents($logPath, $output);

                $syncJob->update([
                    'status' => 'completed',
                    'local_password' => null, // Security: remove plaintext password
                    'error_log' => "Sync log saved to: {$logPath}",
                ]);
            } else {
                // Imapsync failed
                $errorOutput = $processResult->errorOutput() ?: $processResult->output();
                file_put_contents($logPath, $errorOutput);

                $syncJob->update([
                    'status' => 'failed',
                    'error_log' => "imapsync error. Log: {$logPath}\n" . substr($errorOutput, 0, 1000),
                    'local_password' => null,
                ]);
            }
        } catch (\Exception $e) {
            $syncJob->update([
                'status' => 'failed',
                'error_log' => $e->getMessage()."\n".$e->getTraceAsString(),
                'local_password' => null,
            ]);
        }
    }
}
