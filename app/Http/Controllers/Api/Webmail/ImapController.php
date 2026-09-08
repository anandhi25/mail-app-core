<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Webklex\IMAP\Facades\Client;

class ImapController extends Controller
{
    /**
     * Get IMAP Client.
     * In a real webmail app, you'd dynamically pass the user's email/password
     * instead of relying on the default .env account.
     */
    private function getClient(Request $request)
    {
        $user = $request->user();
        $password = cache()->get("imap_pwd_{$user->id}");
        if (! $password) {
            throw new \Exception('IMAP password not found in session.');
        }
        $password = decrypt($password);

        $client = Client::make([
            'host' => config('imap.accounts.default.host'),
            'port' => config('imap.accounts.default.port'),
            'encryption' => config('imap.accounts.default.encryption'),
            'validate_cert' => config('imap.accounts.default.validate_cert'),
            'username' => explode('@', $user->email)[0],
            'password' => $password,
            'protocol' => 'imap',
        ]);
        $client->connect();
        $this->ensureStandardFolders($client);

        return $client;
    }

    private function ensureStandardFolders(\Webklex\PHPIMAP\Client $client): void
    {
        $existing = $client->getFolders(false)->map(fn ($f) => $f->full_name)->toArray();
        $required = array_values(config('imap.options.common_folders', []));

        foreach ($required as $folder) {
            if ($folder !== 'INBOX' && ! in_array($folder, $existing, true)) {
                $client->createFolder($folder);
            }
        }
    }

    /**
     * List all folders (mailboxes).
     */
    public function getFolders(Request $request): JsonResponse
    {
        try {
            $client = $this->getClient($request);
            $folders = $client->getFolders();

            $result = [];
            foreach ($folders as $folder) {
                $result[] = [
                    'name' => $folder->name,
                    'full_name' => $folder->full_name,
                    'messages_count' => $folder->messages()->count(),
                    'unread_count' => $folder->messages()->unseen()->count(),
                ];
            }

            return response()->json(['folders' => $result]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * List emails in a specific folder.
     */
    public function getMessages(Request $request): JsonResponse
    {
        $request->validate([
            'folder' => 'required|string',
            'page' => 'integer|min:1',
            'per_page' => 'integer|min:1|max:50',
        ]);

        $folderName = $request->input('folder', 'INBOX');
        $page = $request->input('page', 1);
        $perPage = $request->input('per_page', 15);

        try {
            $client = $this->getClient($request);
            $folder = $client->getFolder($folderName);

            // Paginate messages (latest first)
            // SET fetch_body false to drastically speed up inbox listing!
            $messages = $folder->query()
                ->setFetchBody(false)
                ->limit($perPage, $page)
                ->get();

            $result = [];
            foreach ($messages as $message) {
                $result[] = [
                    'uid' => $message->getUid(),
                    'subject' => $message->getSubject()[0] ?? '(No Subject)',
                    'from' => $message->getFrom()[0]->mail ?? '',
                    'date' => $message->getDate()[0]->format('Y-m-d H:i:s'),
                    'is_seen' => $message->hasFlag('seen'),
                    'has_attachments' => $message->hasAttachments(),
                ];
            }

            return response()->json([
                'folder' => $folderName,
                'page' => $page,
                'messages' => $result,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Read a single email detail.
     */
    public function getMessageDetail(Request $request, $uid): JsonResponse
    {
        $request->validate(['folder' => 'required|string']);
        $folderName = $request->input('folder');

        try {
            $client = $this->getClient($request);
            $folder = $client->getFolder($folderName);

            // Set options properly to parse body completely but efficiently
            $message = $folder->query()
                ->setFetchBody(true)
                ->setFetchAttachment(true)
                ->getMessageByUid($uid);

            if (! $message) {
                return response()->json(['error' => 'Message not found'], 404);
            }

            // Mark as read
            $message->setFlag('seen');

            $attachments = [];
            foreach ($message->getAttachments() as $attachment) {
                // Ignore small inline structural attachments if needed, but here we take all
                $attachments[] = [
                    'name' => $attachment->getName(),
                    'mime' => $attachment->getMimeType(),
                    'content' => base64_encode($attachment->getContent()),
                ];
            }

            return response()->json([
                'uid' => $message->getUid(),
                'subject' => $message->getSubject()[0] ?? '',
                'from' => $message->getFrom()[0]->mail ?? '',
                'to' => array_map(fn ($t) => $t->mail, $message->getTo()->toArray()),
                'date' => $message->getDate()[0]->format('Y-m-d H:i:s'),
                'body_html' => $message->getHTMLBody(),
                'body_text' => $message->getTextBody(),
                'attachments' => $attachments,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Delete an email (Move to Trash).
     */
    public function deleteMessage(Request $request, $uid): JsonResponse
    {
        $request->validate(['folder' => 'required|string']);
        $folderName = $request->input('folder');

        try {
            $client = $this->getClient($request);
            $folder = $client->getFolder($folderName);
            $message = $folder->query()->getMessageByUid($uid);

            if (! $message) {
                return response()->json(['error' => 'Message not found'], 404);
            }

            // If already in Trash, delete permanently; otherwise move to Trash
            if (strtolower($folderName) === 'trash') {
                $message->delete(true);
            } else {
                $message->move('Trash');
            }

            return response()->json(['message' => 'Message deleted successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Delete multiple messages by UID in bulk.
     */
    public function bulkDelete(Request $request): JsonResponse
    {
        $request->validate([
            'folder' => 'required|string',
            'uids' => 'required|array|min:1',
            'uids.*' => 'required|integer',
        ]);

        $folderName = $request->input('folder');
        $uids = $request->input('uids');

        try {
            $client = $this->getClient($request);
            $folder = $client->getFolder($folderName);

            $deleted = 0;
            $isPermanent = strtolower($folderName) === 'trash';
            foreach ($uids as $uid) {
                $message = $folder->query()->getMessageByUid($uid);
                if ($message) {
                    if ($isPermanent) {
                        $message->delete(true);
                    } else {
                        $message->move('Trash');
                    }
                    $deleted++;
                }
            }

            return response()->json(['message' => "{$deleted} message(s) deleted successfully.", 'deleted' => $deleted]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Move an email to another folder.
     */
    public function moveMessage(Request $request, $uid): JsonResponse
    {
        $request->validate([
            'folder' => 'required|string',
            'destination_folder' => 'required|string',
        ]);

        $folderName = $request->input('folder');
        $destinationFolder = $request->input('destination_folder');

        try {
            $client = $this->getClient($request);
            $folder = $client->getFolder($folderName);
            $message = $folder->query()->getMessageByUid($uid);

            if (! $message) {
                return response()->json(['error' => 'Message not found'], 404);
            }

            $message->move($destinationFolder);

            return response()->json(['message' => 'Message moved successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
