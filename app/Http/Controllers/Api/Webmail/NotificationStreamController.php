<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Webklex\IMAP\Facades\Client;

class NotificationStreamController extends Controller
{
    /**
     * Stream realtime mail notifications via Server-Sent Events.
     *
     * Opens one persistent IMAP connection per user session, polls every 30 s,
     * and pushes unread counts only when they change — just like Zimbra/Roundcube.
     */
    public function __invoke(Request $request): StreamedResponse
    {
        return response()->stream(function () use ($request) {
            $this->configureStream();

            $user = $request->user();
            $password = cache()->get("imap_pwd_{$user->id}");

            if (! $password) {
                $this->sendEvent('error', ['message' => 'IMAP session expired. Please log in again.']);

                return;
            }

            $password = decrypt($password);

            // Open one persistent IMAP connection for the lifetime of this SSE stream
            $client = Client::make([
                'host' => config('imap.accounts.default.host'),
                'port' => config('imap.accounts.default.port'),
                'encryption' => config('imap.accounts.default.encryption'),
                'validate_cert' => config('imap.accounts.default.validate_cert'),
                'username' => explode('@', $user->email)[0],
                'password' => $password,
                'protocol' => 'imap',
            ]);

            try {
                $client->connect();
            } catch (\Exception $e) {
                $this->sendEvent('error', ['message' => 'IMAP connection failed.']);

                return;
            }

            // Confirm connection to the frontend
            $this->sendEvent('connected', ['user' => $user->email]);

            $lastCounts = [];
            $foldersToWatch = ['INBOX', 'Drafts', 'Sent', 'Spam', 'Trash'];
            $pollIntervalSeconds = 30;

            while (true) {
                if (connection_aborted()) {
                    break;
                }

                try {
                    // Re-use existing connection; reconnect if dropped
                    if (! $client->isConnected()) {
                        $client->connect();
                    }

                    $counts = [];
                    foreach ($foldersToWatch as $folderName) {
                        try {
                            $folder = $client->getFolder($folderName);
                            $counts[$folderName] = $folder->messages()->unseen()->count();
                        } catch (\Exception) {
                            $counts[$folderName] = 0;
                        }
                    }

                    // Push event only when counts change (no noise)
                    if ($counts !== $lastCounts) {
                        $this->sendEvent('mail.unread', $counts);
                        $lastCounts = $counts;
                    }
                } catch (\Exception) {
                    // Transient IMAP error — skip this cycle, try next
                }

                $this->sendHeartbeat();

                sleep($pollIntervalSeconds);
            }

            $client->disconnect();
        }, 200, $this->streamHeaders());
    }

    /**
     * Write a named SSE event with JSON payload.
     *
     * @param  array<string, mixed>  $data
     */
    private function sendEvent(string $eventName, array $data): void
    {
        echo "event: {$eventName}\n";
        echo 'data: '.json_encode($data)."\n\n";

        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
    }

    /**
     * SSE comment heartbeat — keeps proxies and load balancers from closing the connection.
     */
    private function sendHeartbeat(): void
    {
        echo ': heartbeat '.time()."\n\n";

        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
    }

    /**
     * Disable output buffering so events reach the client immediately.
     */
    private function configureStream(): void
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        set_time_limit(0);
        ini_set('output_buffering', 'off');
        ini_set('zlib.output_compression', false);
    }

    /**
     * @return array<string, string>
     */
    private function streamHeaders(): array
    {
        return [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-store',
            'X-Accel-Buffering' => 'no',
            'Connection' => 'keep-alive',
        ];
    }
}
