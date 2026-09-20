<?php

namespace App\Http\Controllers\Api\Webmail;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class AiAssistantController extends Controller
{
    public function generate(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string',
            'action' => 'required|in:reply,professional,friendly,shorter,longer,grammar',
            'context' => 'nullable|string' // Original email thread if action is 'reply'
        ]);

        $baseUrl = config('services.openai.base_url', env('OPENAI_API_BASE', 'https://api.openai.com/v1'));
        $apiKey = config('services.openai.key', env('OPENAI_API_KEY'));
        $model = config('services.openai.model', env('OPENAI_MODEL', 'gpt-3.5-turbo'));

        if (!$apiKey) {
            return response()->json(['error' => 'AI is not configured. Missing API Key.'], 500);
        }

        $systemPrompt = $this->getSystemPrompt($request->input('action'));
        $userPrompt = $this->getUserPrompt($request->input('action'), $request->input('text'), $request->input('context'));

        try {
            $response = Http::withToken($apiKey)
                ->timeout(60)
                ->post(rtrim($baseUrl, '/') . '/chat/completions', [
                    'model' => $model,
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => $userPrompt]
                    ],
                    'temperature' => 0.7,
                    'stream' => false,
                ]);

            if ($response->successful()) {
                $content = $response->json('choices.0.message.content');
                return response()->json(['result' => trim($content)]);
            }

            return response()->json([
                'error' => 'AI Provider Error',
                'details' => $response->json()
            ], $response->status());

        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    private function getSystemPrompt(string $action): string
    {
        $base = "You are a highly capable and professional email writing assistant. Your job is to process the user's draft based on their request. Return ONLY the final email content, without any introductory or concluding remarks like 'Here is your email:' or 'Hope this helps'. Do not include Subject lines unless explicitly asked. Use proper HTML formatting (like <p>, <br>) if the input uses them, otherwise use plain text.";

        return match ($action) {
            'professional' => $base . " Tone rule: Make the email sound highly professional, polite, and corporate.",
            'friendly' => $base . " Tone rule: Make the email sound warm, friendly, and approachable while maintaining respect.",
            'shorter' => $base . " Constraint: Make the email significantly more concise and straight to the point without losing key information.",
            'longer' => $base . " Constraint: Expand on the email, adding polite filler, context, and making it more detailed.",
            'grammar' => $base . " Constraint: Fix all spelling and grammar mistakes. Do not change the tone or structure significantly.",
            'reply' => $base . " Context rule: You will be given an original email and the user's rough draft/notes for a reply. Write a complete, polished reply email based on the user's notes.",
            default => $base,
        };
    }

    private function getUserPrompt(string $action, string $text, ?string $context): string
    {
        if ($action === 'reply') {
            return "Original Email to reply to:\n---\n{$context}\n---\n\nMy rough notes/draft for the reply:\n{$text}\n\nPlease write the full reply email.";
        }

        return "Please rewrite the following email text:\n\n{$text}";
    }
}
