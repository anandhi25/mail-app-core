<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use App\Jobs\SendWebmailJob;
use App\Models\Draft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SmtpController extends Controller
{
    /**
     * Save a draft email.
     */
    public function saveDraft(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'subject' => 'nullable|string',
            'to' => 'nullable|array',
            'to.*' => 'email',
            'cc' => 'nullable|array',
            'cc.*' => 'email',
            'bcc' => 'nullable|array',
            'bcc.*' => 'email',
            'body' => 'nullable|string',
            'is_html' => 'boolean',
        ]);

        // Mocking user email, should come from Auth
        $validated['user_email'] = $request->user()->email;
        $validated['is_html'] = $request->input('is_html', true);

        // Update existing draft if ID provided, else create new
        if ($request->has('draft_id')) {
            $draft = Draft::where('user_email', $validated['user_email'])
                          ->findOrFail($request->draft_id);
            $draft->update($validated);
        } else {
            $draft = Draft::create($validated);
        }

        return response()->json(['message' => 'Draft saved successfully', 'draft' => $draft]);
    }

    /**
     * Send an email (Async via Redis Queue).
     */
    public function sendEmail(Request $request): JsonResponse
    {
        // First save as draft
        $draftResponse = $this->saveDraft($request);
        $draft = $draftResponse->getData()->draft;

        // Ensure "to" is provided before sending
        if (empty($draft->to)) {
            return response()->json(['error' => 'Recipient (to) is required to send email.'], 400);
        }

        // Dispatch the job to the Redis queue
        $user = $request->user();
        $password = cache()->get("imap_pwd_{$user->id}");
        if ($password) {
            $password = decrypt($password);
        }

        // Dispatch the job to the Redis queue
        SendWebmailJob::dispatch($draft->id, $draft->user_email, $password);

        return response()->json([
            'message' => 'Email queued for sending successfully',
            'draft_id' => $draft->id
        ]);
    }

    /**
     * Get all drafts for the authenticated user.
     */
    public function getDrafts(Request $request): JsonResponse
    {
        // Mocking user email, should come from Auth
        $userEmail = $request->user()->email;

        $drafts = Draft::where('user_email', $userEmail)->latest()->get();

        return response()->json(['drafts' => $drafts]);
    }

    /**
     * Delete a draft.
     */
    public function deleteDraft(Request $request, $id): JsonResponse
    {
        // Mocking user email, should come from Auth
        $userEmail = $request->user()->email;

        $draft = Draft::where('user_email', $userEmail)->findOrFail($id);
        $draft->delete();

        return response()->json(['message' => 'Draft deleted successfully']);
    }
}
