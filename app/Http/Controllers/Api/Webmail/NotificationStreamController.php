<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use App\Models\MailIndex;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class NotificationStreamController extends Controller
{
    /**
     * Stream realtime mail notifications via Server-Sent Events.
     *
     * Polls the local MailIndex database every 30s and pushes unread counts
     * only when they change — lightweight, no IMAP connection required.
     */
    public function __invoke(Request $request): StreamedResponse
    {
        return response()->stream(function () use ($request) {
            $this->configureStream();

            $user = $request->user();

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
                    // Query unread counts directly from our indexed database — no IMAP needed
                    $counts = [];
                    foreach ($foldersToWatch as $folderName) {
                        $counts[$folderName] = MailIndex::where('mail_user_id', $user->id)
                            ->where('folder', $folderName)
                            ->where('is_seen', false)
                            ->count();
                    }

                    // Push event only when counts change (no noise)
                    if ($counts !== $lastCounts) {
                        $this->sendEvent('mail.unread', $counts);
                        $lastCounts = $counts;
                    }
                } catch (\Exception) {
                    // Transient DB error — skip this cycle, try next
                }

                $this->sendHeartbeat();

                sleep($pollIntervalSeconds);
            }
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
