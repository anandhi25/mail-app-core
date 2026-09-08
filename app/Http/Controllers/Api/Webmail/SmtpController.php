<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use App\Jobs\SendWebmailJob;
use App\Services\DraftService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Webklex\IMAP\Facades\Client;

class SmtpController extends Controller
{
    private function makeDraftService(Request $request): DraftService
    {
        $user = $request->user();
        $password = cache()->get("imap_pwd_{$user->id}");

        if (! $password) {
            throw new \Exception('IMAP password not found in session.');
        }

        $client = Client::make([
            'host' => config('imap.accounts.default.host'),
            'port' => config('imap.accounts.default.port'),
            'encryption' => config('imap.accounts.default.encryption'),
            'validate_cert' => config('imap.accounts.default.validate_cert'),
            'username' => explode('@', $user->email)[0],
            'password' => decrypt($password),
            'protocol' => 'imap',
        ]);
        $client->connect();

        return new DraftService($client);
    }

    /**
     * Save or update a draft in the IMAP Drafts folder.
     */
    public function saveDraft(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'uid' => 'nullable|integer',
            'subject' => 'nullable|string',
            'to' => 'nullable|array',
            'to.*' => 'email',
            'cc' => 'nullable|array',
            'cc.*' => 'email',
            'bcc' => 'nullable|array',
            'bcc.*' => 'email',
            'body' => 'nullable|string',
            'is_html' => 'boolean',
            'attachments' => 'nullable|array',
            'attachments.*.filename' => 'required_with:attachments|string',
            'attachments.*.content' => 'required_with:attachments|string', // Base64 data URI
            'attachments.*.mime_type' => 'nullable|string',
        ]);

        try {
            $service = $this->makeDraftService($request);
            $fromEmail = $request->user()->email;
            $isHtml = $validated['is_html'] ?? true;

            if (! empty($validated['uid'])) {
                $uid = $service->updateDraft(
                    uid: (int) $validated['uid'],
                    fromEmail: $fromEmail,
                    to: $validated['to'] ?? [],
                    cc: $validated['cc'] ?? [],
                    bcc: $validated['bcc'] ?? [],
                    subject: $validated['subject'] ?? null,
                    body: $validated['body'] ?? null,
                    isHtml: $isHtml,
                    attachments: $validated['attachments'] ?? [],
                );
            } else {
                $uid = $service->saveDraft(
                    fromEmail: $fromEmail,
                    to: $validated['to'] ?? [],
                    cc: $validated['cc'] ?? [],
                    bcc: $validated['bcc'] ?? [],
                    subject: $validated['subject'] ?? null,
                    body: $validated['body'] ?? null,
                    isHtml: $isHtml,
                    attachments: $validated['attachments'] ?? [],
                );
            }

            return response()->json(['message' => 'Draft saved successfully', 'uid' => $uid]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Send an email via SMTP, then remove from Drafts and copy to Sent via IMAP.
     */
    public function sendEmail(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'uid' => 'nullable|integer',
            'subject' => 'nullable|string',
            'to' => 'required|array|min:1',
            'to.*' => 'email',
            'cc' => 'nullable|array',
            'cc.*' => 'email',
            'bcc' => 'nullable|array',
            'bcc.*' => 'email',
            'body' => 'nullable|string',
            'is_html' => 'boolean',
            'attachments' => 'nullable|array',
            'attachments.*.filename' => 'required_with:attachments|string',
            'attachments.*.content' => 'required_with:attachments|string', // Base64 data URI
            'attachments.*.mime_type' => 'nullable|string',
        ]);

        $user = $request->user();
        $password = cache()->get("imap_pwd_{$user->id}");

        if (! $password) {
            return response()->json(['error' => 'IMAP password not found in session.'], 401);
        }

        SendWebmailJob::dispatch(
            senderEmail: $user->email,
            senderPassword: decrypt($password),
            to: $validated['to'],
            cc: $validated['cc'] ?? [],
            bcc: $validated['bcc'] ?? [],
            subject: $validated['subject'] ?? null,
            body: $validated['body'] ?? null,
            isHtml: $validated['is_html'] ?? true,
            draftUid: $validated['uid'] ?? null,
            attachments: $validated['attachments'] ?? [],
            senderName: $user->name,
        );

        return response()->json(['message' => 'Email queued for sending successfully']);
    }

    /**
     * List all drafts from the IMAP Drafts folder.
     */
    public function getDrafts(Request $request): JsonResponse
    {
        try {
            $service = $this->makeDraftService($request);

            return response()->json(['drafts' => $service->listDrafts()]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Delete a draft by IMAP UID.
     */
    public function deleteDraft(Request $request, int $uid): JsonResponse
    {
        try {
            $service = $this->makeDraftService($request);
            $service->deleteDraft($uid);

            return response()->json(['message' => 'Draft deleted successfully']);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
