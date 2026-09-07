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
     * Polls IMAP every 30 seconds and pushes unread counts per folder.
     * The client reconnects automatically if the connection drops.
     */
    public function __invoke(Request $request): StreamedResponse
    {
        return response()->stream(function () use ($request) {
            $this->configureStream();

            $user = $request->user();
            $lastUnreadCounts = [];
            $pollIntervalSeconds = 30;

            // Send initial connection confirmation
            $this->sendEvent('connected', ['message' => 'SSE connected', 'user' => $user->email]);

            while (true) {
                if (connection_aborted()) {
                    break;
                }

                try {
                    $unreadCounts = $this->fetchUnreadCounts($request);

                    // Only push event if counts have changed (avoid noise)
                    if ($unreadCounts !== $lastUnreadCounts) {
                        $this->sendEvent('mail.unread', $unreadCounts);
                        $lastUnreadCounts = $unreadCounts;
                    }
                } catch (\Exception $e) {
                    $this->sendEvent('error', ['message' => 'Failed to fetch mail data']);
                }

                // Send a heartbeat comment to keep the connection alive
                $this->sendHeartbeat();

                sleep($pollIntervalSeconds);
            }
        }, 200, $this->streamHeaders());
    }

    /**
     * Fetch unread message counts from IMAP for key folders.
     *
     * @return array<string, int>
     */
    private function fetchUnreadCounts(Request $request): array
    {
        $user = $request->user();
        $password = cache()->get("imap_pwd_{$user->id}");

        if (! $password) {
            throw new \Exception('IMAP password not cached.');
        }

        $password = decrypt($password);

        $client = Client::make([
            'host' => config('imap.default.IMAP_HOST', '127.0.0.1'),
            'port' => config('imap.default.IMAP_PORT', 993),
            'encryption' => config('imap.default.IMAP_ENCRYPTION', 'ssl'),
            'validate_cert' => config('imap.default.IMAP_VALIDATE_CERT', false),
            'username' => $user->email,
            'password' => $password,
            'protocol' => 'imap',
        ]);
        $client->connect();

        $counts = [];
        $foldersToWatch = ['INBOX', 'Junk', 'Drafts'];

        foreach ($foldersToWatch as $folderName) {
            try {
                $folder = $client->getFolder($folderName);
                $counts[$folderName] = $folder->messages()->unseen()->count();
            } catch (\Exception) {
                $counts[$folderName] = 0;
            }
        }

        $client->disconnect();

        return $counts;
    }

    /**
     * Write a named SSE event with JSON payload to the output buffer.
     *
     * @param  array<string, mixed>  $data
     */
    private function sendEvent(string $eventName, array $data): void
    {
        echo "event: {$eventName}\n";
        echo 'data: '.json_encode($data)."\n\n";

        ob_flush();
        flush();
    }

    /**
     * Send an SSE comment as a keep-alive heartbeat.
     */
    private function sendHeartbeat(): void
    {
        echo ': heartbeat '.time()."\n\n";

        ob_flush();
        flush();
    }

    /**
     * Disable output buffering so data reaches the client immediately.
     */
    private function configureStream(): void
    {
        if (ob_get_level()) {
            ob_end_clean();
        }

        set_time_limit(0);
        ini_set('output_buffering', 'off');
        ini_set('zlib.output_compression', false);
    }

    /**
     * Required HTTP headers for SSE.
     *
     * @return array<string, string>
     */
    private function streamHeaders(): array
    {
        return [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-store',
            'X-Accel-Buffering' => 'no',   // Disable nginx buffering
            'Connection' => 'keep-alive',
        ];
    }
}
